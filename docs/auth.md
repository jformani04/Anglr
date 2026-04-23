# Authentication

## Overview

Auth is handled by Supabase Auth (GoTrue). The app supports two providers:

1. **Email + password** — with optional email verification and username-based login
2. **Google OAuth** — via `expo-auth-session` + Expo Router deep link callback

Both providers can coexist on one account (identity linking).

---

## Supabase Client Auth Config

`lib/supabase.ts`

```typescript
auth: {
  storage: AsyncStorage,      // Session JWT is > 2KB, exceeds SecureStore limit
  autoRefreshToken: true,     // Silently refresh before expiry
  persistSession: true,       // Survive app restarts
  detectSessionInUrl: false,  // OAuth URLs handled by dedicated callback route
}
```

---

## AuthProvider (`auth/AuthProvider.tsx`)

Wraps the entire app. Provides:

| Value | Type | Description |
|-------|------|-------------|
| `session` | `Session \| null` | Full Supabase session (includes access + refresh token) |
| `user` | `User \| null` | Supabase Auth user object |
| `profile` | `UserProfile \| null` | Row from `profiles` table |
| `loading` | `boolean` | True until the first `getSession()` resolves |

**On mount:**
1. Calls `supabase.auth.getSession()` to restore persisted session.
2. If the user exists but has an unverified email address (email provider only, no `email_confirmed_at`), signs them out immediately.
3. Fetches profile from `profiles` table.
4. Subscribes to `onAuthStateChange`.

**On `SIGNED_IN`:**
- Runs the unverified-email guard again (defense-in-depth for Google auto-link edge cases).
- Fetches profile if it was a `SIGNED_IN` or `USER_UPDATED` event (skips token refresh to avoid redundant fetches).

**`isEmailUnverified(user)` logic:**
- Returns `true` only when the user has exactly one identity of type `"email"` AND `email_confirmed_at` is null.
- Google accounts always have `email_confirmed_at` set by the OAuth provider.
- Linked accounts (both email + google) are excluded.

---

## Email / Password Registration

`app/(auth)/register.tsx`

1. Form collects: **username**, **email**, **password**, **confirm password**.
2. Client-side validation via `lib/validation/authValidation.ts`.
3. `supabase.auth.signUp({ email, password, options: { data: { username } } })`
4. If email confirmation is **enabled** in Supabase dashboard: Show "check email" screen with resend option.
5. If email confirmation is **disabled**: Supabase immediately issues a session. `onAuthStateChange` fires `SIGNED_IN`, which loads the profile. If no profile row exists, `getProfile()` creates one with `ensureProfileRow()`.

---

## Email / Password Login

`app/(auth)/login.tsx`

1. User enters **email or username**.
2. If input does not contain `@`, the app calls the `lookup_email_by_username` Edge Function to resolve the email. Returns `null` for unknown usernames.
3. `supabase.auth.signInWithPassword({ email, password })`
4. On success: `onAuthStateChange` fires `SIGNED_IN`, router redirects to `/home`.
5. On failure: Display Supabase error message.

**Account enumeration risk:** `lookup_email_by_username` returns `{ email: null }` for unknown usernames — it does not distinguish "user not found" from "wrong password". However, the Edge Function itself does reveal whether a username exists (it returns an email address if the username is found). This is acceptable for a social app where usernames are public, but worth noting. See [security.md](security.md).

---

## Google OAuth

`auth/google.ts`, `app/auth/callback.tsx`

1. `AuthSession.makeRedirectUri({ scheme: "anglr", path: "auth/callback" })` → `anglr://auth/callback`
2. `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, skipBrowserRedirect: true } })`
3. `WebBrowser.openAuthSessionAsync(url, redirectUri)` opens the system browser.
4. User consents → browser redirects to `anglr://auth/callback` with tokens in URL fragment or query params.
5. `app/auth/callback.tsx` extracts `access_token` + `refresh_token` (or `code`).
6. Calls `setSession()` or `exchangeCodeForSession()`.
7. Profile is auto-created on first login via `ensureProfileRow()` in `getProfile()`.

---

## Password Reset

`app/(auth)/forgot_password.tsx`, `app/auth/reset-password.tsx`

1. User enters email on `forgot_password.tsx`.
2. `supabase.auth.resetPasswordForEmail(email, { redirectTo: "anglr://auth/reset-password" })`
3. Supabase sends an email with a link that contains a token.
4. User taps the link → browser opens → redirects to `anglr://auth/reset-password` with the token.
5. `reset-password.tsx` calls `supabase.auth.updateUser({ password: newPassword })`.

**Current limitation:** Supabase email comes from `@mail.supabase.co` or the project's default domain. Without a custom SMTP configuration, these emails land in spam and the reset link goes to a `.vercel.app` or `supabase.co` URL. See [launch-checklist.md](launch-checklist.md).

---

## Identity Linking (Google → Email account)

`lib/profile.ts` → `linkGoogleIdentity()`

Allows a user who registered with email to add Google as an additional sign-in method.

1. `supabase.auth.linkIdentity({ provider: "google", options: { redirectTo, skipBrowserRedirect: true } })`
2. Same browser flow as regular Google OAuth.
3. On return: sets session from access/refresh tokens or exchanges a code.
4. `getUserProviders(user)` reads `user.identities` to detect both providers.

---

## Provider Detection

`lib/authProviders.ts`

```typescript
getUserProviders(user)   // ["email"] | ["google"] | ["email", "google"]
getPrimaryProvider(user) // "email" | "google" | "unknown"
```

Used in the profile screen to conditionally show "Link Google account" or "Set password" options and to prevent confusing error messages.

---

## Session Persistence

Sessions are stored in AsyncStorage under Supabase's internal key. On app restart:
- `getSession()` reads the persisted token.
- If valid and not expired, the user is signed in silently.
- If expired, `autoRefreshToken: true` attempts a silent refresh using the refresh token.

---

## Route Guard

`app/_layout.tsx`

- Reads session state via a `hasSessionRef` (populated once on cold start, then maintained by `onAuthStateChange`).
- If session present and not on a protected route → redirect to `/home`.
- If no session and on a protected route → redirect to `/` (landing).
- OAuth callback and reset-password routes are excluded from the guard to prevent redirect loops.
