# Offline Sync

## Design Philosophy

Anglr is offline-first for catch creation. A user can log catches without internet and they will sync automatically when connectivity returns. The implementation uses AsyncStorage as a local queue — no SQLite, no complex sync framework.

---

## Queue Storage

**Key:** `anglr.pending-catches.v1`

**Format:** JSON array of `PendingCatchRecord` objects stored in AsyncStorage.

```typescript
type PendingCatchRecord = {
  userId: string;         // Scopes the record to a specific user
  queuedAt: string;       // ISO timestamp of when it was queued
  lastError: string | null; // Last sync error message (shown to user)
  catchLog: CatchLog;     // Full catch data including local image URI
};
```

All users' pending records share the same AsyncStorage key. The `userId` field scopes them — `getPendingCatchRecords(userId)` filters to only the current user's records.

---

## Sync Bootstrap (`app/_layout.tsx` → `CatchSyncBootstrap`)

`CatchSyncBootstrap` is a render-less component mounted inside `AuthProvider`. It:

1. Starts the network monitor on mount (`startNetworkMonitor()`).
2. Calls `syncPendingCatchLogs()` immediately when a user becomes authenticated.
3. Subscribes to network status changes — triggers sync whenever `isOnline` becomes `true`.
4. Sets up a 30-second interval to retry sync.
5. Tears everything down on logout or unmount.

```typescript
useEffect(() => {
  if (!user) return;

  void syncPendingCatchLogs();

  const unsubscribe = subscribeToNetworkStatus((isOnline) => {
    if (isOnline) void syncPendingCatchLogs();
  });

  const interval = setInterval(() => void syncPendingCatchLogs(), 30000);

  return () => { unsubscribe(); clearInterval(interval); };
}, [user]);
```

---

## Network Monitor (`lib/network.ts`)

The network monitor does not use React Native's `NetInfo` (which is unreliable on some Android versions). Instead it **probes the Supabase backend directly**:

```
HEAD https://{project}.supabase.co/rest/v1/
  Response status < 500 → online
  Request fails or timeout (5s) → offline
```

**Polling:** Every 15 seconds.

**App foreground:** Re-probes when `AppState` changes to `"active"` (user returns to app).

**Reference-counted:** `startNetworkMonitor()` is safe to call multiple times. `stopNetworkMonitor()` only actually stops when the count reaches zero.

---

## Sync Process (`syncPendingCatchLogs`)

```
1. Check session (getSession — cached, fast)
2. Check network (probeBackend)
3. Load pending records for current user
4. For each pending record (in order):
   a. preparePendingCatchForSync():
      - If imageUrl is a local file:// URI → uploadCatchPhoto() → get public URL
      - If already a remote URL → no-op
   b. insertCatchRow() with full payload
   c. Success → removePendingCatchRecord()
   d. Duplicate PK error (23505) → already synced → remove, continue
   e. Network error → mark lastError, STOP (transient, retry next cycle)
   f. Other error → mark syncStatus: "failed", mark lastError, CONTINUE to next record
5. Return count of synced records
```

### Error categories

| Error | Action | Status |
|-------|--------|--------|
| Duplicate PK (23505) | Remove from queue | Treated as success |
| Network / timeout | Preserve as "pending", stop loop | "pending" |
| Any other | Preserve as "failed", continue loop | "failed" |

A "failed" record is retried on the next sync cycle. There is no max retry limit.

---

## Merge Strategy

`getUserCatchLogs()` merges remote rows and pending records:

```typescript
function mergeCatchLists(remote: CatchLog[], pending: CatchLog[]) {
  const merged = new Map<string, CatchLog>();
  remote.forEach((c) => merged.set(c.id, { ...c, syncStatus: "synced" }));
  pending.forEach((c) => merged.set(c.id, c)); // pending wins on collision
  return [...merged.values()].sort((a, b) => getCatchSortTime(b) - getCatchSortTime(a));
}
```

**Pending wins on ID collision.** This handles a race condition where a catch was synced but the local queue hasn't been cleared yet — the pending version is shown until the next successful sync removes it.

---

## Batch Operations with Pending Catches

`batchUpdateCatchLogs` and `batchDeleteCatchLogs` both handle the mixed case:

1. Read all pending records from AsyncStorage.
2. Apply the operation to matching pending records in-memory.
3. Write the updated array back to AsyncStorage.
4. Then apply the same operation to Supabase (for synced records).
5. If offline, skip the Supabase step (network errors silently ignored).

This ensures pending catches are included in batch favorites, publish, and delete operations without requiring a network connection.

---

## Edge Cases

### App closes during sync
- The sync loop iterates sequentially. If the app closes mid-loop, the already-synced records have been removed from the queue. Remaining records are retried on next launch.
- No partial writes to the DB — each `insertCatchRow` is atomic.

### Image upload fails, DB insert doesn't run
- If `uploadCatchPhoto` fails, the `PendingCatchRecord` is updated with `lastError` and the record stays in the queue. The local image URI is preserved for the next retry.

### Catch edited offline while pending
- `updateCatchLog` detects the pending record via `getPendingCatchById`.
- Updates the pending record in-place in AsyncStorage (preserving the original `queuedAt`).
- The updated data is what gets synced.

### Multiple users on same device
- The `userId` field on every `PendingCatchRecord` scopes all reads to the current user.
- Switching users does not expose another user's pending catches.

### AsyncStorage corruption
- `getPendingCatchRecords` wraps the JSON.parse in a try/catch and returns `[]` on failure.
- Corrupt data is silently dropped (catches lost). This is a known acceptable risk for a queue that is normally empty.
