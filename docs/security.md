# Security

## Key Exposure Audit

### Anon Key (`EXPO_PUBLIC_SUPABASE_ANON_KEY`)

**Status: Safe to expose.**

The anon key is embedded in the JavaScript bundle. This is expected and by design — it identifies the Supabase project but does not grant any privileges beyond what RLS allows for an unauthenticated request. Supabase's security model relies on RLS policies, not key secrecy.

Anyone with the anon key can:
- Attempt authentication (sign up, sign in) — rate limited by Supabase
- Read public data (public catches, profiles) — governed by RLS
- Nothing else — all writes are blocked for anonymous users by RLS

### Service Role Key (`SUPABASE_SERVICE_ROLE_KEY`)

**Status: Secure. Never exposed to client.**

The service role key is only present in the server-side `.env` file and read via `Deno.env.get()` in Edge Functions. It is not prefixed with `EXPO_PUBLIC_` and is not included in the app bundle.

Verify before shipping: `grep -r "service_role" fish-app/app fish-app/lib fish-app/auth` should return zero results.

### Google Maps API Key

**Status: Action required before Play Store submission.**

The Google Maps API key is embedded in the Android build via `app.json` and will be extractable from the APK by anyone. An unrestricted key can be abused to incur billing charges on your Google Cloud account.

**Required restrictions — Google Cloud Console → APIs & Services → Credentials:**

1. **API restrictions** — limit to the following APIs only:
   - Maps SDK for Android
   - (iOS key, if separate) Maps SDK for iOS

2. **Application restrictions (Android key)**:
   - Select "Android apps"
   - Add an entry: package name `com.anglr` + the SHA-1 of your release signing certificate
   - To get the release SHA-1: `keytool -list -v -keystore <your-release.jks> -alias <key-alias>`
   - Or from EAS: `eas credentials` → select Android → view the keystore fingerprint

3. **iOS** (if/when an iOS Maps key is needed):
   - Create a separate key restricted to "iOS apps"
   - Add bundle ID `com.anglr`
   - Store it in `app.json` under `expo.ios.config.googleMapsApiKey`

**Do not commit a separate iOS key or any key with billing scope until restrictions are in place.**

Until restrictions are applied, monitor usage at console.cloud.google.com/google/maps-apis/metrics and set a billing alert.

---

## Authentication Security

### Email Verification

When enabled (recommended for production), unverified accounts cannot access the app. The `isEmailUnverified()` check in `AuthProvider` provides a defense-in-depth layer that signs out any stale unverified sessions.

### Password Reset

The reset link goes to the app's deep link scheme (`anglr://auth/reset-password`). The token is valid only once. No re-use is possible because Supabase marks the token as consumed after `updateUser()` is called.

**Current gap:** The reset email is sent from Supabase's default mail domain. Without custom SMTP, these emails often land in spam. See [launch-checklist.md](launch-checklist.md).

### Session Storage

Sessions are stored in AsyncStorage (plain text, not encrypted). This is acceptable for Supabase JWTs — they are short-lived (typically 1 hour) and can be revoked server-side. SecureStore would be more secure but has a 2 KB size limit that Supabase JWT payloads exceed.

If you need encrypted session storage, the options are:
1. Wrap AsyncStorage with `react-native-encrypted-storage`
2. Store only the refresh token in SecureStore and re-exchange on app start

---

## Row Level Security

RLS is the primary data isolation layer. All client queries use the anon key and are subject to RLS policies.

**Critical policies to verify in the Supabase dashboard:**

1. `catch_logs` — users cannot read other users' private catches
2. `catch_logs` — users cannot modify catches they don't own
3. `profiles` — public read, self-only write
4. `friendships` — only parties to a friendship can see/modify it

If RLS is accidentally disabled on any table, all user data becomes accessible to anyone with the anon key.

---

## Input Validation

### Client-side (`lib/validation/authValidation.ts`)
- Email format validation
- Password minimum length / complexity
- Username length and character restrictions

### Server-side
- Supabase Auth validates email format on signup
- PostgREST enforces column types (e.g., boolean fields cannot be set to arbitrary strings)
- No explicit server-side validation of free-text fields (species, notes, location) — these are stored as-is

**Gap:** There is no server-side constraint on text field lengths. A user could insert very long strings. The impact is low (storage waste) but worth adding CHECK constraints if the app scales.

---

## Account Enumeration Risks

### Via `lookup_email_by_username`
The Edge Function returns `{ email: "user@example.com" }` for a known username. This reveals:
- Whether a username is registered
- The email address associated with it

This is intentional — the app uses it to enable username login. For a social app where usernames are publicly searchable, this is acceptable. However, it does allow enumeration of registered emails via username.

### Via `lookup_auth_providers`
The function returns `{ exists: true, providers: ["email"] }` for registered emails. This reveals whether an email address is registered in the app.

This is used to improve UX (direct users to the right sign-in method). The rate limiter (10 requests/IP/minute) mitigates bulk enumeration.

### Via Supabase Auth `signUp`
Supabase's default behavior returns an error if an email is already registered (with email confirmation disabled) or silently re-sends the confirmation email (with confirmation enabled). Neither exposes the registration status clearly, but determined attackers can distinguish the two responses.

---

## Privacy Controls

Users can:
- Keep catches private (default)
- Share with friends only
- Share publicly
- Hide location from public catches (`hideLocation` flag)

The `delete_account` Edge Function provides full erasure:
- catch_logs deleted
- profile deleted
- storage files deleted
- auth user deleted

This satisfies basic GDPR/right-to-erasure requirements.

---

## Permissions

Android permissions declared in `app.json`:
```json
"permissions": [
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO"
]
```

**`RECORD_AUDIO`** is included because `expo-camera` requests it by default when `recordAudioAndroid: true` is set. If the app does not record video with audio, consider setting `recordAudioAndroid: false` to remove this permission. It may trigger scrutiny during Play Store review if the app's use of audio is not clear.

Location permission reason string:
```
"Allow Anglr to use your location to prefill catch location."
```

Camera permission reason string:
```
"Allow Anglr to access your camera"
```

These strings appear in the Android permission prompt. They are accurate and specific.
