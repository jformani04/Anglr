# Image Upload

## Storage Layout

| Bucket | Path pattern | Access |
|--------|-------------|--------|
| `catch_photos` | `{user_id}/{Date.now()}.jpg` | Public read, auth required for write |
| `avatars` | `{user_id}/{Date.now()}.jpg` | Public read, auth required for write |

All images are publicly readable by URL — required so friends and global map viewers can see catch photos.

---

## Catch Photo Upload Flow

### Online path
```
User selects photo in photoSelect.tsx
  → Local URI: file://, content://, asset://, or ph://
  → imageReview.tsx displays preview
  → User saves catch
  → createCatchLog() detects online + local URI
  → uploadCatchPhoto(fileUri)
    → fileUriToUploadBody(fileUri) converts to ArrayBuffer
    → supabase.storage.from("catch_photos").upload(path, arrayBuffer)
    → getPublicUrl(path) returns permanent URL
  → catch_logs row stored with image_url = public URL
```

### Offline path
```
User selects photo → imageReview.tsx
  → User saves catch
  → createCatchLog() detects offline
  → queuePendingCatch() stores CatchLog with imageUrl = "file://..."
  → On next sync: preparePendingCatchForSync()
    → isLocalFileUri("file://...") → true
    → uploadCatchPhoto("file://...") → public URL
    → catch inserted with image_url = public URL
```

A `file://` URI is **never** written to the Supabase database. The upload always happens before the DB insert.

---

## `fileUriToUploadBody` (`lib/upload.ts`)

Handles two cases:

**Local file:**
```typescript
const base64 = await FileSystem.readAsStringAsync(fileUri, {
  encoding: FileSystem.EncodingType.Base64,
});
return decode(base64); // base64-arraybuffer → ArrayBuffer
```

**Remote URL (http/https):**
```typescript
const response = await withTimeout(fetch(fileUri), 10000, "...");
return await response.arrayBuffer();
```

**Local file URI patterns recognized:**
```
file://     — standard iOS/Android local file
content://  — Android content provider URI
asset://    — Expo asset URI
ph://       — iOS photo library URI
```

---

## Avatar Upload Flow

`lib/profile.ts` → `uploadAvatar(fileUri)`

```typescript
const fileBlob = await (await fetch(fileUri)).blob();
supabase.storage.from("avatars").upload(filePath, fileBlob, {
  contentType: "image/jpeg",
  upsert: true,    // overwrite existing avatar
});
```

Uses `upsert: true` — uploading a new avatar overwrites the previous file at the same path without a 409 conflict error.

Note: Avatar upload uses `fetch(fileUri).blob()` instead of `FileSystem.readAsStringAsync`. Both work; catch photos use FileSystem for consistency with the offline sync path.

---

## Timeout

All uploads use a 12-second timeout via `withTimeout()`. On timeout, a `RequestTimeoutError` is thrown, which surfaces as "The request took too long." in the UI.

---

## Error Handling

| Error | User message |
|-------|-------------|
| Network failure | "We couldn't reach the server." |
| Upload timeout | "Uploading your catch photo took too long." |
| Storage error | "Unable to upload your catch photo." |

---

## Edge Cases

### File deleted from device before sync
If a user takes a photo offline, the app stores the `file://` URI. If the user later deletes the photo from their camera roll before syncing, `FileSystem.readAsStringAsync` will throw an error. The pending catch will be marked `syncStatus: "failed"` with an appropriate error message.

### Large files
No file size limit is enforced client-side. Supabase Storage has a default 50 MB limit per file (configurable). High-resolution photos from modern phones may approach this limit.

### JPEG conversion
The app always uploads as `image/jpeg`. expo-image-picker and expo-camera both output JPEG by default. PNG or HEIC files from some sources may not be converted — this is a potential edge case on iOS where HEIC is the camera default.

### Concurrent uploads
Each catch creation triggers at most one upload. Batch operations do not upload images. The sync loop processes pending catches sequentially, so images are uploaded one at a time.
