# Catch Logging

## What It Does

Catch logging is the core user action in Anglr. A user photographs a fish, optionally scans for species ID, fills in details (size, location, weather, method), and saves the record. The record is immediately visible in the catches list and on the map if coordinates were captured.

---

## Logging Flow

### Screen 1: Photo Select (`app/log/photoSelect.tsx`)

The user picks the source:
- **Camera** — opens `expo-camera` for a live shot.
- **Photo library** — opens `expo-image-picker` with gallery access.

On selection, the app navigates to `imageReview.tsx` with the local file URI.

### Screen 2: Image Review (`app/log/imageReview.tsx`)

1. Displays the selected photo.
2. Runs a species scan against `lib/freshwaterSpecies.ts` (client-side heuristic, not AI).
3. Pre-fills the species field if a match is found.
4. User fills in: species, length, weight, location, temperature, weather, lure, method, notes.
5. User sets privacy: private (default), friends-only, or public.
6. User optionally enables `hideLocation` to suppress the GPS pin even when public.
7. User taps "Save catch."
8. Calls `createCatchLog(input)`.

### After Save

- If `syncStatus === "synced"`: Navigate to catch detail screen.
- If `syncStatus === "pending"`: Navigate to catch detail screen with an "offline" badge.

---

## `CatchLog` Interface

```typescript
interface CatchLog {
  id: string;               // UUID generated client-side
  imageUrl: string;         // Public Supabase Storage URL (or "" if no photo)
  species: string;
  length: string;           // e.g. "18 in" — includes unit suffix
  weight: string;           // e.g. "4.2 lbs"
  location: string;         // Human-readable location name
  temperature: string;      // e.g. "68F"
  weather: string;
  lure: string;
  method: string;
  notes: string;
  isPublic: boolean;
  isFriendsOnly: boolean;
  isFavorite: boolean;
  hideLocation: boolean;
  date: string;             // ISO string of when the catch occurred
  latitude?: number | null;
  longitude?: number | null;
  syncStatus?: "pending" | "synced" | "failed";
  pinGroup?: string | null;
}
```

---

## Database Row (`CatchLogRow`)

The DB stores snake_case equivalents. The mapping is handled by `mapCatchLogRowToCatchLog()` and `mapCatchLogToUpdateRow()`.

Notable differences from the interface:
- `image_url` is `null | ""` in the DB for no-photo catches (stored as empty string by convention).
- `date` is stored as a text column (ISO string), not a timestamp. This avoids timezone normalization issues.
- `created_at` is a `timestamptz` added automatically by Supabase; not exposed in the app-level `CatchLog` type.

---

## UUID Generation

Client-side UUID v4 generation in `catches.ts`:

```typescript
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
```

This means the catch ID is known before the row is inserted. This is critical for offline support — the same ID is used in both AsyncStorage (pending) and the database (synced), enabling deduplication on sync.

---

## Image Handling on Create

```
Image is local file (file://, content://, asset://, ph://)
  ↓
Online?
  YES → uploadCatchPhoto(fileUri) → Supabase Storage → public URL stored in image_url
  NO  → Store local file:// URI in pending queue (NEVER stored in DB)
        When synced: preparePendingCatchForSync() uploads first, then inserts with public URL
```

The `isLocalFileUri()` check in `createCatchLog` ensures a local `file://` path is never written to the database row.

---

## Privacy Controls

| Setting | Who can see |
|---------|------------|
| `isPublic = false, isFriendsOnly = false` | Owner only |
| `isFriendsOnly = true` | Owner + accepted friends |
| `isPublic = true` | Everyone (including global map) |
| `hideLocation = true` | Suppresses GPS pin even when public; details still visible |

These settings can be changed after creation via the edit screen or batch actions.

---

## Edit Flow

`app/(tabs)/catches/[catchId].tsx`

1. Loads catch via `getCatchLogById(catchId, userId)`.
2. User edits fields.
3. Calls `updateCatchLog(updatedCatch)`.
4. If the catch is pending (in AsyncStorage), the pending record is updated in place.
5. If synced, sends UPDATE to Supabase with coordinate fallback logic.

---

## Schema Evolution Safety

The insert path uses `runCatchMutationWithCoordinateFallback()`, which handles cases where the live schema may be missing newer columns:

```
Try full payload
  → Error mentions "latitude" / "longitude" schema cache?
    → Retry without coordinates
    → Error still mentions other optional columns?
      → Strip hide_location, is_favorite, pin_group and retry
  → Error mentions only the boolean flags?
    → Strip legacy flags and retry
```

This ensures the app does not crash when deployed against an older schema version.

---

## Catch List Display

`app/(tabs)/catches/index.tsx`

- Calls `getUserCatchLogs(userId)`.
- Displays remote + pending catches merged and sorted by date DESC.
- Pending catches show an "offline" or "failed" indicator.
- Supports pull-to-refresh.
- Supports batch selection (select multiple → favorite/unfavorite, publish/unpublish, delete).
