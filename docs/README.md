# Anglr — Developer Documentation

Anglr is a social fishing catch-tracking app built with Expo (React Native) and Supabase. This documentation covers every system in the app at a level sufficient to onboard a new developer, perform maintenance, and evaluate launch readiness.

---

## Navigation

| File | What it covers |
|------|---------------|
| [overview.md](overview.md) | What the app is, who it's for, high-level feature list |
| [architecture.md](architecture.md) | Tech stack, project structure, data flow overview |
| [auth.md](auth.md) | Email/password, Google OAuth, password reset, provider linking |
| [database.md](database.md) | Full schema for every table with columns, types, constraints, example rows |
| [supabase.md](supabase.md) | Client setup, RLS policies, storage buckets, Edge Functions |
| [api-layer.md](api-layer.md) | Every exported function in `lib/` — inputs, outputs, side effects |
| [catch-logging.md](catch-logging.md) | How catches are created, validated, stored, and displayed |
| [offline-sync.md](offline-sync.md) | The offline queue, network monitor, sync bootstrap, conflict handling |
| [maps.md](maps.md) | Map screen internals — pin colors, filter modes, viewport logic |
| [friends.md](friends.md) | Friend requests, acceptance flow, feed, map integration |
| [pin-groups.md](pin-groups.md) | `pin_group` field — current state and how to extend it |
| [batch-actions.md](batch-actions.md) | Bulk favorite, publish, and delete across synced + pending catches |
| [image-upload.md](image-upload.md) | Photo selection, upload path, offline deferral, storage layout |
| [performance.md](performance.md) | Memoization strategy, list rendering, bottleneck inventory |
| [security.md](security.md) | Key exposure audit, RLS, input validation, account enumeration risks |
| [playstore-readiness.md](playstore-readiness.md) | Feature-by-feature Play Store readiness audit |
| [known-limitations.md](known-limitations.md) | Documented bugs, race conditions, and design debt |
| [deployment.md](deployment.md) | EAS build, Supabase Edge Functions, environment setup |
| [launch-checklist.md](launch-checklist.md) | Actionable ✅ / ⚠️ / ❌ checklist for going live |

---

## Quick-start for new developers

1. Copy `.env.example` to `.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
2. Run `npx expo start` to start the dev server.
3. The friends system requires the SQL migration at `supabase/migrations/20260416_friendships.sql` — apply it in the Supabase SQL Editor before using that feature.
4. Read [architecture.md](architecture.md) for a mental model of how data flows end-to-end.
5. Read [database.md](database.md) to understand the schema before writing queries.

---

## Key decisions at a glance

| Decision | Reason |
|----------|--------|
| AsyncStorage for auth sessions | Supabase JWT payloads exceed SecureStore's ~2 KB practical limit |
| `withTimeout` on every network call | Prevents UI hangs on slow/broken connections |
| Pending catches in AsyncStorage | Offline-first without SQLite complexity |
| Service role key only in Edge Functions | Never exposed to the client; enforces RLS on all client paths |
| Username login resolved via Edge Function | Supabase Auth requires email; resolving via admin API keeps client-side logic clean |
