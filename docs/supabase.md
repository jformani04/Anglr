# Supabase

## Project Details

| Property | Value |
|----------|-------|
| Project URL | `https://dezgvmtpbaijwqnruevt.supabase.co` |
| Region | US East (inferred from project ref) |
| Auth provider | GoTrue (Supabase's fork) |
| Database | PostgreSQL 15 |

---

## Client Initialization

`lib/supabase.ts`

```typescript
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: AsyncStorage,       // Avoids SecureStore 2KB limit
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,   // Handled by app/auth/callback.tsx
    },
  }
);
```

**Startup validation:**
- Throws at module load time if either env var is missing or if the URL doesn't start with `http`.
- Strips leading/trailing quotes from env values (guards against shell quoting artifacts).

---

## Auth Flow (Supabase side)

### Token lifecycle
1. User signs in → Supabase issues a short-lived JWT (access token) + a long-lived refresh token.
2. Both are stored in AsyncStorage by the Supabase client.
3. `autoRefreshToken: true` silently refreshes before the JWT expires.
4. On app restart, `getSession()` restores the session from AsyncStorage.

### Email verification
- Controlled by the Supabase Auth dashboard setting "Confirm email."
- When enabled, `signUp()` does not return a session until the user clicks the verification link.
- The app checks `email_confirmed_at` via `isEmailUnverified()` as a defense-in-depth guard.

### JWT claims
Standard Supabase JWT. RLS policies use `auth.uid()` to extract the user ID from the token. The anon key is included in every request; RLS filters what each user can access.

---

## Row Level Security (RLS)

RLS is the primary data isolation mechanism. The service role key bypasses RLS; the anon key (used by the client) is always subject to it.

### profiles
```sql
-- Anyone can read
CREATE POLICY "public read profiles"
  ON profiles FOR SELECT USING (true);

-- Only owner can write
CREATE POLICY "owner write profile"
  ON profiles FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "owner update profile"
  ON profiles FOR UPDATE USING (id = auth.uid());
```

### catch_logs
```sql
-- Owner sees all their catches
CREATE POLICY "owner select catches"
  ON catch_logs FOR SELECT
  USING (user_id = auth.uid());

-- Or: public catch
CREATE POLICY "public catch visible"
  ON catch_logs FOR SELECT
  USING (is_public = true);

-- Insert: must be own catch
CREATE POLICY "owner insert catch"
  ON catch_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Update/delete: owner only
CREATE POLICY "owner update catch"
  ON catch_logs FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "owner delete catch"
  ON catch_logs FOR DELETE
  USING (user_id = auth.uid());
```

Note: The `is_friends_only` visibility for friends is enforced in the application query layer (`getFriendCatchPins` uses `.or("is_public.eq.true,is_friends_only.eq.true")`). Whether a separate RLS policy also enforces this depends on the live project configuration.

### friendships
```sql
-- Can see requests where you are either party
CREATE POLICY "parties see friendship"
  ON friendships FOR SELECT
  USING (requester_id = auth.uid() OR receiver_id = auth.uid());

-- Only requester can insert
CREATE POLICY "requester insert"
  ON friendships FOR INSERT
  WITH CHECK (requester_id = auth.uid());

-- Either party can delete
CREATE POLICY "parties delete friendship"
  ON friendships FOR DELETE
  USING (requester_id = auth.uid() OR receiver_id = auth.uid());

-- Only receiver can accept
CREATE POLICY "receiver update friendship"
  ON friendships FOR UPDATE
  USING (receiver_id = auth.uid());
```

---

## Storage

### Buckets

| Bucket | Public | RLS |
|--------|--------|-----|
| `catch_photos` | Yes | Write requires auth; path scoped to `{user_id}/` |
| `avatars` | Yes | Write requires auth; path scoped to `{user_id}/` |

### Upload path pattern
```
catch_photos/{user_id}/{Date.now()}.jpg
avatars/{user_id}/{Date.now()}.jpg
```

The `user_id` prefix in the storage path acts as a natural ACL — users cannot read each other's paths through storage policies, though all objects in these buckets are publicly readable by URL (required for displaying images to other users in the friends feed and global map).

### Avatar upload (`lib/profile.ts`)
- Uses `upsert: true` — re-uploading overwrites without a 409 conflict error.
- Reads file as Blob via `fetch(fileUri).blob()`.

### Catch photo upload (`lib/catches.ts`)
- Uses `upsert: false` — path is timestamped so collisions are practically impossible.
- Reads file via `FileSystem.readAsStringAsync` (Base64) → `decode()` → ArrayBuffer.

---

## Edge Functions

All Edge Functions are Deno-based, deployed to Supabase's edge runtime.

### `delete_account`

**Purpose:** Fully delete a user — their data, storage, and auth record.

**Requires auth:** Yes (`Authorization` header with user's access token)

**Flow:**
1. Verifies the user via anon client (validates token).
2. Uses admin client (service role) to delete:
   - All rows in `catch_logs` where `user_id = user.id`
   - The row in `profiles` where `id = user.id`
   - All files in `avatars/{user.id}/`
   - The auth user via `admin.deleteUser(user.id)`

**Client fallback** (`lib/profile.ts` → `requestDeleteAccount()`):
If the Edge Function is unavailable, the app falls back to deleting app data (catch_logs, profile, avatars) but cannot delete the auth user. Returns `{ partial: true }` to surface a warning.

---

### `lookup_email_by_username`

**Purpose:** Resolve a username to an email address for the "login with username" feature.

**Requires auth:** No (public, but rate-limited)

**Rate limit:** 10 requests per IP per 60 seconds

**Flow:**
1. Validates input (username ≥ 3 chars).
2. Queries `profiles` by `username_lower = username.toLowerCase()` using admin client.
3. If found, calls `admin.getUserById(profile.id)` to get the email.
4. Returns `{ email: string | null }`.

**Security note:** The function reveals whether a username is registered (by returning an email). This is acceptable for a social app where usernames are publicly searchable.

---

### `lookup_auth_providers`

**Purpose:** Determine which auth providers are registered for an email address, before the user attempts to log in.

**Requires auth:** No (public, but rate-limited)

**Rate limit:** 10 requests per IP per 60 seconds

**Flow:**
1. Validates email format.
2. Tries `admin.getUserByEmail(email)` first.
3. Falls back to paginating `admin.listUsers()` (up to 1000 users, 10 pages × 100) if the direct lookup is unavailable in the SDK version.
4. Returns `{ exists: boolean, providers: string[] }`.

**Use case:** Shown on the login screen when a user enters an email — if they only have Google, the app can prompt Google sign-in instead of showing a confusing "invalid password" error.

---

### `_shared/rateLimit.ts`

In-memory sliding window rate limiter. Shared by `lookup_email_by_username` and `lookup_auth_providers`.

```
Window: 60 seconds
Limit: 10 requests per IP
```

**Limitation:** The state is in-memory per Deno isolate. Under high concurrency or across multiple Edge Function instances, the effective limit may be higher than 10. Not a concern at current scale.

---

## Email Templates

Custom email templates are stored in `supabase/email-templates/`. These override Supabase's default email design. The templates must be manually pasted into the Supabase dashboard (Auth → Email Templates) — there is no CLI sync for email templates.

---

## Querying Patterns

### Select with relationship (PostgREST syntax)
```typescript
supabase
  .from("friendships")
  .select(`
    id, requester_id, receiver_id, status, created_at,
    requester:profiles!requester_id(id, username, avatar_url, bio),
    receiver:profiles!receiver_id(id, username, avatar_url, bio)
  `)
  .eq("status", "accepted")
  .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
```

The `!foreign_key` syntax hints which FK to use when a table has multiple FK relationships to the same target table.

### Upsert with conflict resolution
```typescript
supabase
  .from("profiles")
  .upsert(payload, { onConflict: "id" })
```

### Error handling pattern
```typescript
const { data, error } = await supabase.from("table").select("*");
if (error) {
  if ((error as any).code === "PGRST116") return null; // Row not found
  throw wrapCatchError(error, "Friendly fallback message");
}
```

`PGRST116` is PostgREST's "row not found" code returned when using `.single()` on a query that returns zero rows.
