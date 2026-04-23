# Batch Actions

## What They Are

Batch actions allow users to select multiple catches and apply an operation to all of them at once. Currently supported:

- **Batch favorite / unfavorite** — toggle `isFavorite` on multiple catches
- **Batch publish / unpublish** — toggle `isPublic` on multiple catches
- **Batch friends-only toggle** — toggle `isFriendsOnly`
- **Batch assign pin group** — set `pinGroup` on multiple catches (data layer only, no UI)
- **Batch delete** — remove multiple catches permanently

---

## Implementation

### `batchUpdateCatchLogs(catchIds, update)`

```typescript
update: {
  isFavorite?: boolean;
  isPublic?: boolean;
  isFriendsOnly?: boolean;
  pinGroup?: string | null;
}
```

**Step 1 — AsyncStorage (offline-safe):**
```typescript
const allRecords = await getAllPendingCatchRecords();
// Apply update fields to matching records
await AsyncStorage.setItem(PENDING_CATCHES_STORAGE_KEY, JSON.stringify(updated));
```

**Step 2 — Supabase:**
```typescript
supabase
  .from("catch_logs")
  .update(dbUpdate)
  .in("id", catchIds)
  .eq("user_id", user.id)
```

If Step 2 fails due to a network error, it is silently ignored — the pending records were already updated in Step 1.

---

### `batchDeleteCatchLogs(catchIds)`

**Step 1 — AsyncStorage:**
```typescript
const remaining = allRecords.filter(
  (r) => !(r.userId === user.id && catchIds.includes(r.catchLog.id))
);
await AsyncStorage.setItem(PENDING_CATCHES_STORAGE_KEY, JSON.stringify(remaining));
```

**Step 2 — Supabase:**
```typescript
supabase
  .from("catch_logs")
  .delete()
  .in("id", catchIds)
  .eq("user_id", user.id)
```

Same offline-silent pattern.

---

## Mixed Pending + Synced Batches

A batch may contain both pending (AsyncStorage only) and synced (DB) catches. The implementation handles this by:
1. Always processing AsyncStorage first (no network required).
2. The Supabase UPDATE/DELETE uses `.in("id", catchIds)` — if some IDs don't exist in the DB (because they're pending), the query simply has no effect for those IDs. No error is thrown.

This means a batch operation will always succeed for pending catches (stored locally) and may silently skip synced catches if offline.

---

## Security

Both batch operations include `.eq("user_id", user.id)` — the server will not modify catches belonging to other users even if arbitrary IDs are passed.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty `catchIds` array | Early return, no operation |
| IDs that don't exist in DB | Silently skipped by Supabase |
| Mix of pending + synced catches | Both handled; AsyncStorage first |
| Offline during batch update | AsyncStorage updated; Supabase skipped |
| Offline during batch delete | Pending records removed; Supabase delete skipped (records still in DB until next online session) |

**Known limitation:** If the user deletes synced catches while offline, those catches will not be deleted from the DB until the app is online and the user performs the delete again (or they remain in the DB indefinitely). The delete is not queued for later retry — unlike catch creation, there is no delete queue. See [known-limitations.md](known-limitations.md).
