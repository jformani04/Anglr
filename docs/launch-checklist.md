# Launch Checklist

Status key: ✅ Ready | ⚠️ Needs attention | ❌ Blocker

---

## Security

| # | Item | Status | Action |
|---|------|--------|--------|
| S1 | Google Maps API key restricted to `com.anglr` package + Maps SDK for Android | ❌ | Go to Google Cloud Console → Credentials → restrict the key |
| S2 | Service role key never exposed in client bundle | ✅ | Verified — only in `.env` and Edge Functions |
| S3 | RLS enabled on `profiles`, `catch_logs`, `friendships` tables | ⚠️ | Verify in Supabase Dashboard → Table Editor → RLS |
| S4 | `RECORD_AUDIO` permission justified or removed | ⚠️ | If no video recording: set `recordAudioAndroid: false` in `app.json` |
| S5 | Debug `console.log` statements removed from production paths | ⚠️ | Remove logs in `mapCoordinates.ts` and `map.tsx` (not gated by DEBUG flag) |

---

## Email & Domain

| # | Item | Status | Action |
|---|------|--------|--------|
| E1 | Custom domain registered (e.g. `anglrapp.com`) | ❌ | Register domain; point to Vercel or hosting provider |
| E2 | Custom SMTP configured in Supabase | ❌ | Auth → SMTP Settings → configure Resend/Postmark |
| E3 | Password reset email delivered to inbox (not spam) | ❌ | Blocked by E2; test after SMTP is configured |
| E4 | Password reset redirect URL on own domain | ❌ | Update `resetPasswordForEmail` redirect to `https://anglrapp.com/auth/reset-password` |
| E5 | Email templates customized with brand | ⚠️ | Templates exist in `email-templates/` but must be pasted into Supabase dashboard |

---

## Legal & Privacy

| # | Item | Status | Action |
|---|------|--------|--------|
| L1 | Privacy policy page live at a public URL | ❌ | Write and host a privacy policy; include: data collected, purpose, deletion rights |
| L2 | Play Store Data Safety form completed | ❌ | Required before any Play Store submission; declare email, location, photos |
| L3 | Account deletion available in-app | ✅ | Present in profile settings |
| L4 | GDPR right-to-erasure satisfied by `delete_account` | ✅ | Deletes all data + auth user |

---

## Core Features

| # | Item | Status | Action |
|---|------|--------|--------|
| F1 | Catch logging (online) | ✅ | |
| F2 | Catch logging (offline queue + sync) | ✅ | |
| F3 | Photo upload | ✅ | |
| F4 | Map — mine/friends/global | ✅ | |
| F5 | Friends system | ✅ | Requires SQL migration applied |
| F6 | Friends SQL migration applied in production DB | ⚠️ | Verify `friendships` table exists in Supabase |
| F7 | Password reset end-to-end | ❌ | Blocked by E2/E4 |
| F8 | Google OAuth | ✅ | Test on physical Android device |
| F9 | Account deletion | ✅ | Test the full flow |

---

## Android / Play Store

| # | Item | Status | Action |
|---|------|--------|--------|
| A1 | Production EAS build succeeds | ⚠️ | Run `eas build --profile production --platform android` |
| A2 | Android target SDK ≥ 34 | ⚠️ | Verify in EAS build output (required since Aug 2024) |
| A3 | App tested on physical Android device | ⚠️ | Test all flows on a real device before submission |
| A4 | Play Console app created with `com.anglr` | ⚠️ | Create in Google Play Console |
| A5 | Internal testing track tested | ⚠️ | Upload AAB to internal testing, test with ≥ 2 real devices |
| A6 | App icon and screenshots prepared | ⚠️ | Play Store requires at least 2 phone screenshots |
| A7 | Short and full description written | ⚠️ | Required for Play Store listing |

---

## Quality & Monitoring

| # | Item | Status | Action |
|---|------|--------|--------|
| Q1 | Crash reporting configured | ⚠️ | Add EAS Insights or Sentry |
| Q2 | Offline delete limitation accepted or fixed | ⚠️ | Document for users or add delete queue |
| Q3 | Catch list performs well with 100+ catches | ⚠️ | Test with a seeded account; add pagination if slow |
| Q4 | Debug logs removed from `mapCoordinates.ts` and `map.tsx` | ⚠️ | Low risk but unprofessional in production |

---

## Summary

| Category | ✅ Ready | ⚠️ Needs Attention | ❌ Blockers |
|----------|---------|-------------------|------------|
| Security | 2 | 3 | 1 |
| Email & Domain | 0 | 1 | 4 |
| Legal & Privacy | 2 | 0 | 2 |
| Core Features | 6 | 1 | 1 |
| Android / Play Store | 0 | 7 | 0 |
| Quality & Monitoring | 0 | 4 | 0 |
| **Total** | **10** | **16** | **8** |

### Critical path to launch

1. ❌ **S1** — Restrict Google Maps API key (30 minutes)
2. ❌ **E1–E4** — Set up custom domain + custom SMTP (1–2 days)
3. ❌ **L1** — Write and host a privacy policy (2–4 hours)
4. ❌ **L2** — Complete Play Store Data Safety form (1 hour)
5. ❌ **F7** — Verify password reset works after E2/E4 (1 hour testing)
6. ⚠️ **F6** — Confirm friendships migration is applied in production DB (10 minutes)
7. ⚠️ **A1–A7** — Build + test + create Play Store listing (1–2 days)

**Estimated time to launch-ready: 3–5 days of focused work.**
