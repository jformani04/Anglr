# Known Limitations

## Data / Sync

### Offline deletes are not queued
**Severity:** Medium

`batchDeleteCatchLogs` and `deleteCatchLog` remove records from AsyncStorage (for pending catches) and fire a Supabase DELETE for synced catches. If the user is offline, the Supabase DELETE is silently skipped — the catch remains in the database.

When the user comes back online, the catch reappears from the server on the next fetch. The user must delete it again while online.

**Workaround:** None — the user will see the catch reappear.

**Fix:** Add a "delete queue" to AsyncStorage (similar to the pending create queue).

---

### AsyncStorage queue corruption loses pending catches
**Severity:** Low (rare)

If `AsyncStorage.getItem` returns malformed JSON (e.g., due to a write interrupted by an app crash), the try/catch in `getPendingCatchRecords` returns `[]` and all pending catches are silently discarded.

**Fix:** Add a backup key or migrate to SQLite for the queue.

---

### No conflict resolution for concurrent edits
**Severity:** Low

If a user edits a catch on two devices while both are offline, the last-sync-wins. There is no merge strategy or conflict detection.

---

### Sync loop stops on network error
**Severity:** Low

If a transient network error occurs mid-sync, `syncPendingCatchLogs` stops processing the remaining queue items for that cycle. They will be retried in 30 seconds.

---

## Race Conditions

### Map `fitToCoordinates` timing
The `updateMapViewport` function is debounced with `setTimeout(0)` and gated on `isMapReady && isMapLaidOut`. On very slow devices, the layout event may fire after data loads, causing the viewport to never auto-fit.

**Symptom:** Map loads with pins but stays at the default Ohio view.

**Mitigation:** The user can manually zoom/pan. The "Try Again" button reloads and re-triggers the fit.

---

### `FriendsProvider` loads on every re-render of `user` reference
```typescript
useEffect(() => {
  if (user) refreshFriends();
  else { setFriends([]); setPendingRequests([]); }
}, [user]);
```

The `user` object from Supabase is recreated on token refresh events (`TOKEN_REFRESHED`). If `user` reference changes on each refresh, `refreshFriends()` fires unnecessarily on every 1-hour token refresh cycle.

**Mitigation:** Frequency is low enough not to be user-visible. Fix: depend on `user?.id` instead of `user`.

---

## Security

### `lookup_auth_providers` rate limiter is in-memory per isolate
The rate limit state lives in a JavaScript `Map` inside the Deno function. Across multiple function instances (Supabase may run multiple), the effective rate per IP is higher than 10/minute.

**Risk:** Low — at current scale, a determined attacker could enumerate ~50-100 emails/minute. Not a critical risk for this app type.

---

### `RECORD_AUDIO` permission in manifest
This permission is declared because `expo-camera` includes it when `recordAudioAndroid: true` is set. If the app does not actually record audio/video, this is an unnecessary permission that may trigger Play Store policy review.

---

## UI / UX

### Debug log statements in production code
`queryRowsWithCoordinateFallback` contains:
```typescript
console.log("RUNNING QUERY WITH:", "select(*) + normalize coordinates");
console.log("catch_logs row keys:", Object.keys(rawRows[0]));
```

And `updateMapViewport` contains:
```typescript
console.log("MAP DEBUG", { ... });
```

And map marker rendering:
```typescript
console.log("MARKER:", pin.latitude, pin.longitude);
```

These are `console.log` statements that are always active regardless of `EXPO_PUBLIC_DEBUG`. They will appear in production logs and slightly impact performance on low-end devices.

**Fix:** Wrap in the `dlog` / `debugLog` guards or remove.

---

### Pin group field has no UI
`pin_group` exists in the schema and all queries but has no UI. The `react-native-map-clustering` library is installed but not integrated. This is documented but unfinished.

---

### No pagination for catch list
All catches for a user are fetched in a single query:
```typescript
supabase.from("catch_logs").select("*").eq("user_id", userId)
```

For users with hundreds of catches, this will become slow. No pagination, infinite scroll, or cursor-based loading exists.

---

### Species scan is keyword-based, not AI
The "scan" feature on `imageReview.tsx` uses a local freshwater species list (`lib/freshwaterSpecies.ts`). It is a static list matching, not ML-based image recognition. The scan may rarely correctly identify species from the image alone.

---

## Infrastructure

### No crash reporting
There is no Sentry, Bugsnag, or EAS Insights integration. Crashes in production will go undetected unless the user reports them.

### No CI/CD pipeline
There is no automated test suite or CI configuration. EAS Build is used for manual builds.

### Schema is managed in Supabase dashboard
The base schema (profiles, catch_logs) has no checked-in migration files. Only the friendships migration exists. A schema reset would require manual recreation.
