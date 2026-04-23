# Database Schema

The Anglr backend uses a single Supabase (PostgreSQL) project. The schema is managed directly in the Supabase dashboard — there are no checked-in migration files for the base schema (only the friendships migration at `supabase/migrations/20260416_friendships.sql`).

---

## Table: `profiles`

Stores public user metadata. One row per auth user. Created automatically on first login.

### Schema

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `uuid` | NO | — | FK → `auth.users.id`, PK |
| `username` | `text` | YES | — | Displayed name; must be unique (enforced via `username_lower`) |
| `username_lower` | `text` | YES | — | Lowercase version of username; indexed for case-insensitive lookup |
| `bio` | `text` | YES | `''` | User bio, can be empty |
| `avatar_url` | `text` | YES | `null` | Public URL in the `avatars` storage bucket |
| `created_at` | `timestamptz` | NO | `now()` | Row creation timestamp |
| `units_length` | `text` | YES | `'cm'` | `'cm'` or `'in'` |
| `units_weight` | `text` | YES | `'kg'` | `'kg'` or `'lbs'` |
| `units_temp` | `text` | YES | `'celsius'` | `'celsius'` or `'fahrenheit'` |

### Indexes
- PK on `id`
- Unique index on `username_lower` (used by `lookup_email_by_username` Edge Function)

### Relationships
- `id` → `auth.users.id` (cascade delete expected but not enforced at schema level; handled by the `delete_account` Edge Function)

### Example row
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "username": "TroutHunter99",
  "username_lower": "trouthunter99",
  "bio": "Fly fishing the Midwest since 2010.",
  "avatar_url": "https://dezgvmtpbaijwqnruevt.supabase.co/storage/v1/object/public/avatars/a1b2c3.../1714000000000.jpg",
  "created_at": "2026-04-01T12:00:00Z",
  "units_length": "in",
  "units_weight": "lbs",
  "units_temp": "fahrenheit"
}
```

### RLS Policies (expected)
- `SELECT`: Anyone can read profiles (enables user search and friend profile views)
- `INSERT`: Only if `id = auth.uid()`
- `UPDATE`: Only if `id = auth.uid()`
- `DELETE`: Blocked (deletion handled by `delete_account` Edge Function using service role)

---

## Table: `catch_logs`

Core data table. Stores every catch logged by every user.

### Schema

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `uuid` | NO | — | PK; generated client-side (UUID v4) |
| `user_id` | `uuid` | NO | — | FK → `profiles.id` |
| `image_url` | `text` | YES | `''` | Public URL in `catch_photos` bucket; empty string if no photo |
| `species` | `text` | YES | `''` | Fish species name (free text) |
| `length` | `text` | YES | `''` | Length with unit suffix, e.g. `"45 cm"` or `"18 in"` |
| `weight` | `text` | YES | `''` | Weight with unit suffix, e.g. `"2.3 kg"` or `"5 lbs"` |
| `location` | `text` | YES | `''` | Human-readable location name |
| `temperature` | `text` | YES | `''` | Water/air temp, e.g. `"22C"` |
| `weather` | `text` | YES | `''` | Weather conditions, free text |
| `lure` | `text` | YES | `''` | Lure/bait used |
| `method` | `text` | YES | `''` | Fishing method, e.g. `"Spin"`, `"Fly"` |
| `notes` | `text` | YES | `''` | Open notes |
| `is_public` | `boolean` | YES | `false` | Visible to all users in global map and searches |
| `is_friends_only` | `boolean` | YES | `false` | Visible to accepted friends only |
| `is_favorite` | `boolean` | YES | `false` | Starred by the owner |
| `hide_location` | `boolean` | YES | `false` | Suppress GPS pin even when public |
| `date` | `text` | YES | `''` | When the catch occurred (ISO string or display string) |
| `created_at` | `timestamptz` | NO | `now()` | Row creation time; used for ordering |
| `latitude` | `numeric` | YES | `null` | GPS latitude |
| `longitude` | `numeric` | YES | `null` | GPS longitude |
| `pin_group` | `text` | YES | `null` | Grouping label for map clustering (not yet UI-exposed) |

### Indexes
- PK on `id`
- Index on `user_id` (for per-user queries)
- Index on `created_at DESC` (for ordering)

### Constraints
- No unique constraint on `id` beyond PK — client-generated UUIDs are assumed collision-free
- No FK constraint enforced at DB level for `user_id` → `profiles.id` in legacy schema; enforced by RLS

### Privacy logic
A catch is visible to another user when:
- `is_public = true` (everyone) AND `hide_location = false` (for map pins)
- `is_friends_only = true` AND the viewer has an `accepted` friendship with the owner

### Example row
```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "image_url": "https://dezgvmtpbaijwqnruevt.supabase.co/storage/v1/object/public/catch_photos/a1b2.../1714000000000.jpg",
  "species": "Largemouth Bass",
  "length": "18 in",
  "weight": "4.2 lbs",
  "location": "Lake Erie, Ohio",
  "temperature": "68F",
  "weather": "Partly cloudy",
  "lure": "Ned rig",
  "method": "Spin",
  "notes": "Hit right at dawn near the weed edge.",
  "is_public": true,
  "is_friends_only": false,
  "is_favorite": true,
  "hide_location": false,
  "date": "2026-04-20T06:30:00Z",
  "created_at": "2026-04-20T06:35:12Z",
  "latitude": 41.75,
  "longitude": -80.55,
  "pin_group": null
}
```

### RLS Policies (expected)
- `SELECT`: Own rows always; others' rows only when `is_public = true` OR (`is_friends_only = true` AND friendship exists)
- `INSERT`: Only if `user_id = auth.uid()`
- `UPDATE`: Only if `user_id = auth.uid()`
- `DELETE`: Only if `user_id = auth.uid()`

---

## Table: `friendships`

Tracks directional friend relationships. Created by the `20260416_friendships.sql` migration.

### Schema

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `requester_id` | `uuid` | NO | — | FK → `profiles.id`; the user who sent the request |
| `receiver_id` | `uuid` | NO | — | FK → `profiles.id`; the user who received the request |
| `status` | `text` | NO | `'pending'` | `'pending'` \| `'accepted'` \| `'blocked'` |
| `created_at` | `timestamptz` | NO | `now()` | When the request was sent |

### Indexes
- PK on `id`
- Index on `(requester_id, receiver_id)` (for bidirectional lookups)
- Index on `receiver_id` (for incoming requests)

### Constraints
- Unique constraint on `(requester_id, receiver_id)` to prevent duplicate requests
- CHECK constraint: `requester_id <> receiver_id` (cannot friend yourself)

### Status lifecycle
```
(nothing) → pending → accepted
                    ↘ [deleted] (decline or cancel)
accepted → [deleted] (remove friend)
```

Decline, cancel, and remove all use `DELETE` (no "rejected" terminal state). This allows the same pair to re-request in the future.

### Example rows
```json
[
  {
    "id": "11111111-0000-0000-0000-000000000001",
    "requester_id": "a1b2c3d4-...",
    "receiver_id": "b2c3d4e5-...",
    "status": "pending",
    "created_at": "2026-04-15T10:00:00Z"
  },
  {
    "id": "11111111-0000-0000-0000-000000000002",
    "requester_id": "a1b2c3d4-...",
    "receiver_id": "c3d4e5f6-...",
    "status": "accepted",
    "created_at": "2026-04-10T08:30:00Z"
  }
]
```

### RLS Policies (expected)
- `SELECT`: Visible to both requester and receiver
- `INSERT`: Only if `requester_id = auth.uid()`
- `UPDATE`: Only if `receiver_id = auth.uid()` (only receiver can accept)
- `DELETE`: Either party may delete (cancel, decline, or remove)

---

## Supabase Auth Tables (managed by GoTrue)

These are in the `auth` schema, not directly accessible via the PostgREST client.

### `auth.users` (relevant columns)
| Column | Notes |
|--------|-------|
| `id` | UUID; FK target for `profiles.id` and `catch_logs.user_id` |
| `email` | Primary email address |
| `email_confirmed_at` | NULL until email is verified |
| `identities` | JSON array of linked auth providers |
| `user_metadata` | JSON; contains `username` set during registration |
| `instance_id` | Must be `00000000-0000-0000-0000-000000000000` for GoTrue to find the user |

When seeding users directly via SQL (not GoTrue API), all token columns must be set to `''` (empty string), not NULL. See `memory/project_supabase_seed.md` for the full list.

---

## Storage Buckets

| Bucket | Access | Path pattern | Notes |
|--------|--------|-------------|-------|
| `catch_photos` | Public | `{user_id}/{timestamp}.jpg` | Catch images; public read, write requires auth |
| `avatars` | Public | `{user_id}/{timestamp}.jpg` | Profile avatars; `upsert: true` so re-uploads overwrite |

Both buckets use the public URL pattern:
```
https://{project-ref}.supabase.co/storage/v1/object/public/{bucket}/{path}
```
