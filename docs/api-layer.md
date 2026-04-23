# API Layer

All data access is through the Supabase JS client. There is no custom REST server — the `lib/` folder serves as the API layer. Every exported function is documented here.

---

## `lib/catches.ts`

### `createCatchLog(input: CatchLogInsertInput): Promise<CreateCatchLogResult>`

Creates a new catch. Always assigns a client-generated UUID so the catch ID is known immediately regardless of sync status.

**Flow:**
1. Gets authenticated user.
2. Generates UUID for the catch.
3. Checks network status via `refreshNetworkStatus()`.
4. **Online:** Uploads photo if local URI, then inserts row into `catch_logs`.
5. **Offline:** Queues catch in AsyncStorage pending queue.
6. Returns `{ catchId, syncStatus: "pending" | "synced" }`.

**Side effects:** AsyncStorage write (if offline), Supabase Storage upload (if photo + online), Supabase DB insert (if online).

---

### `getUserCatchLogs(userId: string): Promise<CatchLog[]>`

Fetches all catches for a user, merging remote and pending.

**Flow:**
1. Fires remote query and `getPendingCatchRecords()` in parallel.
2. On success: merges remote rows with pending records (pending wins on ID collision), sorts by date DESC.
3. On network error: if there are pending records, returns them sorted (offline-only view).
4. Throws on other errors.

---

### `getCatchLogById(catchId: string, userId: string): Promise<CatchLog | null>`

Gets a single catch. Checks the pending queue first, then remote.

Returns `null` if the catch does not exist (handles `PGRST116`).

---

### `updateCatchLog(catchLog: CatchLog): Promise<void>`

Updates an existing catch.

If the catch is in the pending queue, updates it in AsyncStorage. Otherwise, sends an UPDATE to Supabase with coordinate fallback logic.

---

### `deleteCatchLog(catchId: string): Promise<void>`

Deletes a catch.

If pending, removes from AsyncStorage. Otherwise, sends DELETE to Supabase (scoped to `user_id = auth.uid()`).

---

### `getUserFavoriteCatchLogs(userId: string): Promise<CatchLog[]>`

Returns `getUserCatchLogs()` filtered to `isFavorite = true`.

---

### `getCatchStats(catches: CatchLog[]): { totalCatches: number; speciesCount: number }`

Pure function. Deduplicates species by lowercased name.

---

### `getMapCatchPins(userId: string): Promise<MapCatchPin[]>`

Fetches own catches with coordinates for map display. Applies `queryRowsWithCoordinateFallback` for schema flexibility, then filters rows with valid coordinates.

---

### `uploadCatchPhoto(fileUri: string): Promise<string>`

Uploads a catch photo to the `catch_photos` Supabase Storage bucket.

**Path:** `{user_id}/{Date.now()}.jpg`

Returns the public URL.

**Timeout:** 12 seconds.

---

### `batchUpdateCatchLogs(catchIds, update): Promise<void>`

Bulk update for `isFavorite`, `isPublic`, `isFriendsOnly`, `pinGroup`.

1. Updates matching pending records in AsyncStorage.
2. Sends `UPDATE ... WHERE id IN (catchIds)` to Supabase.
3. Silently skips the server update if offline (pending records already updated).

---

### `batchDeleteCatchLogs(catchIds): Promise<void>`

Bulk delete.

1. Removes matching pending records from AsyncStorage.
2. Sends `DELETE ... WHERE id IN (catchIds)` to Supabase.
3. Silently skips if offline.

---

### `syncPendingCatchLogs(): Promise<number>`

Processes the offline queue. Called by `CatchSyncBootstrap` on connectivity and every 30 seconds.

**Flow:**
1. Bails if no session or offline.
2. For each pending record:
   - If image is a local URI, uploads it first.
   - Inserts the catch row.
   - On duplicate PK error (already synced): removes from queue, continues.
   - On network error: marks with last error, stops processing (retry next cycle).
   - On permanent error: marks `syncStatus: "failed"`, keeps in queue for user visibility.
3. Returns count of successfully synced records.

---

## `lib/friends.ts`

### `sendFriendRequest(receiverId: string): Promise<void>`
Inserts a `friendships` row with `status = "pending"`.

### `acceptFriendRequest(requestId: string): Promise<void>`
Updates the row to `status = "accepted"`.

### `declineFriendRequest(requestId: string): Promise<void>`
Deletes the row (pending → gone; allows re-request).

### `cancelFriendRequest(requestId: string): Promise<void>`
Deletes the row (requester cancels their own pending request).

### `removeFriend(requestId: string): Promise<void>`
Deletes an accepted friendship row.

### `getFriends(userId: string): Promise<FriendProfile[]>`
Returns all accepted friends with profile data. Handles bidirectional lookup (requester OR receiver).

### `getPendingRequests(userId: string): Promise<FriendRequest[]>`
Returns incoming pending requests with requester profile data.

### `getSentRequests(userId: string): Promise<FriendRequest[]>`
Returns outgoing pending requests with receiver profile data.

### `getFriendshipStatus(otherUserId: string): Promise<FriendshipStatusResult>`
Checks the friendship status between the current user and another user. Makes two separate queries (as requester, then as receiver) for reliable PostgREST results.

Returns: `{ status, requestId, iAmRequester }`.

### `searchUsers(query: string): Promise<FriendProfile[]>`
Case-insensitive username search using `.ilike("username", "%query%")`. Excludes the current user. Limit 20.

### `getFriendMapPins(friendIds: string[]): Promise<MapCatchPin[]>`
Returns map pins for friends' public + friends-only catches, excluding hidden locations.

### `getFriendMapPins` (rich version) → `getFriendMapPins(friendIds): Promise<FriendMapPin[]>`
Returns `FriendMapPin` with username and avatarUrl for callout cards. Makes two queries: catch_logs (filtered) + profiles (batch lookup by unique user IDs).

### `getGlobalMapPins(limit = 250): Promise<FriendMapPin[]>`
Returns the most recent N public catches across all users with valid coordinates. Same structure as the friends version for consistent rendering.

### `getFriendFeed(friendIds: string[]): Promise<FeedItem[]>`
Returns the most recent public/friends-only catch per friend (deduped by `user_id`). Used in the home screen feed.

### `getFriendPublicCatches(friendId: string): Promise<[...]>`
Returns up to 30 recent public/friends-only catches for a specific friend. Used on the friend profile screen.

### `getPublicCatchById(catchId: string): Promise<PublicCatchDetail | null>`
Gets full details for a single public catch. Returns `null` if not found or not public.

---

## `lib/profile.ts`

### `getProfile(): Promise<Profile>`
Fetches the current user's full profile. Auto-creates the profile row if it doesn't exist (`ensureProfileRow`).

### `upsertProfile(updates: ProfileUpdates): Promise<void>`
Updates username, bio, avatar URL, and/or unit preferences.

### `uploadAvatar(fileUri: string): Promise<string>`
Uploads an avatar to the `avatars` bucket (upsert mode). Returns public URL.

### `linkGoogleIdentity(): Promise<void>`
Opens a browser session to link a Google identity to the current account.

### `enableEmailLogin(email: string): Promise<void>`
Sends a password reset email that can be used to establish email login for a Google-only account.

### `requestDeleteAccount(): Promise<{ partial: boolean; message?: string }>`
Invokes `delete_account` Edge Function. Falls back to partial deletion if Edge Function is unavailable.

---

## `lib/network.ts`

### `refreshNetworkStatus(timeoutMs = 5000): Promise<boolean>`
Probes Supabase's `/rest/v1/` endpoint with a HEAD request. Returns `true` if status < 500.

### `subscribeToNetworkStatus(listener: (isOnline: boolean) => void): () => void`
Registers a listener that fires whenever network status changes. Returns an unsubscribe function.

### `startNetworkMonitor(pollIntervalMs = 15000): () => void`
Starts polling every 15 seconds and re-probes on AppState `"active"` events. Reference-counted — safe to call multiple times.

### `getLastKnownNetworkStatus(): boolean | null`
Returns the last known status without probing.

### `isLikelyNetworkError(error: unknown): boolean`
Heuristic check based on error message strings: "network request failed", "failed to fetch", "timed out", "aborterror".

---

## `lib/upload.ts`

### `isLocalFileUri(uri: string): boolean`
Returns `true` for `file://`, `content://`, `asset://`, `ph://` URIs (device-local files).

### `fileUriToUploadBody(fileUri: string): Promise<ArrayBuffer>`
Converts any URI to an ArrayBuffer for Supabase Storage upload.
- Local: `FileSystem.readAsStringAsync` (Base64) → `decode()`
- Remote: `fetch(uri)` → `.arrayBuffer()`

---

## `lib/errorHandling.ts`

### `withTimeout<T>(task, timeoutMs, message): Promise<T>`
Races a promise against a timeout. Throws `RequestTimeoutError` if the timeout fires first.

### `getUserFacingErrorMessage(error, fallback): string`
Returns a human-readable message:
- `RequestTimeoutError` → "The request took too long."
- Network error → "We couldn't reach the server. If you're offline, your catch can still be saved locally."
- Otherwise → `error.message` or the fallback.

---

## `lib/mapCoordinates.ts`

### `normalizeCoordinateRow(row): row & { latitude, longitude }`
Tries multiple field name conventions to extract coordinates. Falls back to heuristic detection (any key containing "lat" / "lng" / "lon").

### `hasResolvedCoordinates(row): boolean`
Returns `true` if the row has valid finite latitude and longitude after normalization.

### `queryRowsWithCoordinateFallback(runQuery): Promise<NormalizedRow[]>`
Runs a query and normalizes coordinate fields on all returned rows.

**Why this exists:** The coordinate column names were changed at some point during development. Older DB rows or schema cache mismatches may use `lat/lng` instead of `latitude/longitude`. This normalizer handles all known variants transparently.

---

## `lib/authProviders.ts`

### `getUserProviders(user: User): string[]`
Reads `user.identities` (and falls back to `user.app_metadata.provider`) to return provider names like `["email"]`, `["google"]`, or `["email", "google"]`.

### `getPrimaryProvider(user: User): string`
Returns the first provider or `"unknown"`.
