# Play Store Readiness

## Summary

Anglr is close to a functional Play Store submission but has several blockers that must be addressed before launch. The most critical are the email deliverability issue and the Google Maps API key restriction.

---

## Authentication

| Item | Status | Notes |
|------|--------|-------|
| Email registration | ✅ | Works with or without email confirmation |
| Google OAuth | ✅ | Tested via expo-auth-session |
| Username login | ✅ | Resolves via Edge Function |
| Password reset | ⚠️ | Functional but emails go to spam; reset page on `.supabase.co` domain |
| Email verification flow | ✅ | Guards in AuthProvider prevent unverified access |
| Account deletion | ✅ | Full erasure via `delete_account` Edge Function |
| Session persistence | ✅ | Survives app restarts via AsyncStorage |

---

## Core Features

| Item | Status | Notes |
|------|--------|-------|
| Catch logging | ✅ | Photo, species, all metadata fields |
| Offline catch logging | ✅ | Queue + background sync |
| Catch list, edit, delete | ✅ | Including batch operations |
| Favorites | ✅ | Filter tab works |
| Map (mine) | ✅ | Pins, callout, pending indicator |
| Map (friends) | ✅ | Blue pins with friend selector |
| Map (global) | ✅ | Green pins, lazy loaded |
| Friends requests | ✅ | Send, accept, decline, cancel, remove |
| Friends feed | ✅ | One card per friend on home screen |
| Species guide | ✅ | Articles screen |
| Profile settings | ✅ | Username, bio, avatar, units |
| Image upload | ✅ | Catch photos and avatars |

---

## Privacy & Legal

| Item | Status | Notes |
|------|--------|-------|
| Privacy policy | ❌ | **Blocker** — Google Play requires a privacy policy URL |
| Terms of service | ⚠️ | Recommended but not strictly required |
| Account deletion in-app | ✅ | Present in profile settings |
| Data access disclosure | ❌ | **Blocker** — Play Store Data Safety form must be completed |
| RECORD_AUDIO permission justification | ⚠️ | Included in manifest; may trigger review if not used |

---

## Email & Domain

| Item | Status | Notes |
|------|--------|-------|
| Custom email domain | ❌ | **Blocker** — Emails from Supabase default domain go to spam |
| Custom SMTP | ❌ | Not configured |
| Password reset email deliverability | ❌ | Reset links land in spam; users cannot reset passwords reliably |
| Reset page domain | ⚠️ | Points to `.supabase.co` or `.vercel.app` — confusing/untrustworthy |

**Recommendation:** Configure a custom domain (e.g. `anglrapp.com`) and set up Supabase's custom SMTP with a transactional email provider (Resend, Postmark, SendGrid). The password reset redirect URL should go to a page on your own domain.

---

## API Keys & Secrets

| Item | Status | Notes |
|------|--------|-------|
| Service role key exposure | ✅ | Correctly server-only |
| Anon key exposure | ✅ | Expected, safe |
| Google Maps API key restriction | ❌ | **Blocker** — Key is unrestricted; anyone can use it |
| Supabase URL in bundle | ✅ | Expected, not a secret |

---

## Android-Specific

| Item | Status | Notes |
|------|--------|-------|
| Package name | ✅ | `com.anglr` |
| Adaptive icon | ✅ | Configured in app.json |
| Edge-to-edge | ✅ | `edgeToEdgeEnabled: true` |
| Predictive back gesture | ✅ | Disabled (`predictiveBackGestureEnabled: false`) |
| Target SDK | ⚠️ | Verify EAS build targets Android 34 (required by Play Store since Aug 2024) |
| 64-bit support | ✅ | Expo React Native provides 64-bit arm64 by default |
| New Architecture | ✅ | `newArchEnabled: true` |

---

## Crash Risk Assessment

| Risk | Likelihood | Impact |
|------|-----------|--------|
| AsyncStorage corruption (offline queue) | Low | Medium — pending catches lost |
| Google Maps API quota exceeded | Medium if key is unrestricted | High — map screen unusable |
| `supabase.auth.getUser()` returning error mid-session | Low | Low — handled with early returns |
| `fitToCoordinates` called before map is ready | Mitigated | Low — gated by `isMapReady && isMapLaidOut` |
| HEIC image upload failure (iOS) | Low on Android | Medium on iOS |
| Large photo file exceeding Supabase 50 MB limit | Low | Medium — upload fails, catch saved without photo |

---

## Missing Features for Production

1. **Privacy policy page** — Required by Play Store. Must be a live URL.
2. **Data safety disclosure** — Required form in Play Console listing data collected (email, location, photos).
3. **Custom SMTP** — Required for reliable password reset emails.
4. **Google Maps API key restriction** — Must be restricted before launch to prevent abuse.
5. **Pagination for catch list** — Not a launch blocker but needed for users with many catches.

---

## Optional Improvements Before Launch

- Onboarding / tutorial for first-time users
- Push notifications for friend requests
- App rating prompt after several catches logged
- Crash reporting (Sentry, Bugsnag, or EAS Insights)
- Analytics (opt-in)
