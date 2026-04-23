# Architecture

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 54 / React Native 0.81 |
| Language | TypeScript 5.9 |
| Navigation | Expo Router 6 (file-based, Expo Router v3+ API) |
| Backend | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Offline storage | AsyncStorage (`@react-native-async-storage/async-storage`) |
| Maps | react-native-maps with Google Maps provider |
| State | React Context (AuthProvider, FriendsProvider) |
| Build & distribution | EAS (Expo Application Services) |

## Project Structure

```
fish-app/
├── app/                    # Expo Router file-based routes
│   ├── _layout.tsx         # Root layout — AuthProvider, FriendsProvider, route guard
│   ├── index.tsx           # Landing/splash screen
│   ├── (auth)/             # Unauthenticated routes (login, register, forgot_password)
│   ├── (tabs)/             # Authenticated tab routes
│   │   ├── home.tsx        # Dashboard
│   │   ├── map.tsx         # Map screen
│   │   ├── catches/        # Catch list + detail/edit
│   │   ├── favorites/      # Filtered favorites
│   │   ├── articles/       # Species guide
│   │   ├── profile/        # User settings
│   │   ├── friends/        # Friends list and requests
│   │   └── user/           # Other user profiles and their public catches
│   ├── log/                # Catch logging flow (photoSelect → imageReview)
│   └── auth/               # OAuth callbacks (callback.tsx, reset-password.tsx)
├── auth/                   # React Context providers
│   ├── AuthProvider.tsx    # Session, user, profile state
│   └── FriendsProvider.tsx # Friends list and pending requests state
├── lib/                    # Business logic and Supabase queries
│   ├── supabase.ts         # Supabase client initialization
│   ├── catches.ts          # Catch CRUD, offline queue, sync, map pins
│   ├── friends.ts          # Friends queries, feed, map pins
│   ├── profile.ts          # Profile CRUD, avatar upload, account deletion
│   ├── upload.ts           # File URI → ArrayBuffer conversion
│   ├── network.ts          # Network probe and listener
│   ├── mapCoordinates.ts   # Flexible coordinate field resolution
│   ├── errorHandling.ts    # Timeout wrapper, user-facing error messages
│   ├── authProviders.ts    # Auth provider detection from user identities
│   ├── colors.ts           # Design tokens
│   ├── freshwaterSpecies.ts# Species data for scan feature
│   ├── speciesArticles.ts  # Educational content
│   └── validation/
│       └── authValidation.ts # Email, password, username validation
├── components/             # Reusable UI components
├── hooks/                  # Custom React hooks
├── assets/                 # Images, icons, splash screen
└── supabase/
    ├── functions/          # Deno Edge Functions
    │   ├── delete_account/
    │   ├── lookup_email_by_username/
    │   ├── lookup_auth_providers/
    │   └── _shared/rateLimit.ts
    └── email-templates/    # Custom Supabase email templates
```

## Data Flow Overview

### Authentication flow
```
User submits credentials
  → lib/supabase.ts (client)
  → Supabase Auth (JWT issued)
  → AuthProvider subscribes to onAuthStateChange
  → Profile fetched from profiles table
  → Session stored in AsyncStorage
```

### Catch creation (online)
```
User completes imageReview form
  → createCatchLog(input) in lib/catches.ts
  → refreshNetworkStatus() confirms online
  → If image is local file: uploadCatchPhoto() → Supabase Storage
  → INSERT into catch_logs (Supabase PostgREST)
  → Returns { catchId, syncStatus: "synced" }
```

### Catch creation (offline)
```
User completes imageReview form
  → createCatchLog(input) in lib/catches.ts
  → refreshNetworkStatus() returns false
  → queuePendingCatch() stores record in AsyncStorage under "anglr.pending-catches.v1"
  → Returns { catchId, syncStatus: "pending" }
  → CatchSyncBootstrap polls every 30s and listens for connectivity
  → When online: syncPendingCatchLogs() uploads image + inserts row
```

### Map rendering
```
map.tsx mounts / screen focused
  → getUserCatchLogs() + getFriendMapPins() in parallel
  → useMemo filters to pins with valid coordinates
  → useMemo extracts coordinate array for fitToCoordinates()
  → MapView renders Markers color-coded by source + syncStatus
```

## Context Tree

```
RootLayout
  └── AuthProvider          (session, user, profile)
      └── FriendsProvider   (friends[], pendingRequests[])
          └── CatchSyncBootstrap (starts network monitor, triggers sync)
              └── Stack (Expo Router screens)
```

## Environment Variables

| Variable | Exposure | Purpose |
|----------|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Client (EXPO_PUBLIC_) | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Client (EXPO_PUBLIC_) | Anon key — safe for client, enforced by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only (.env, not EXPO_PUBLIC_) | Used only in Edge Functions via Deno.env |
| `EXPO_PUBLIC_DEBUG` | Client | Set to `"1"` to enable verbose console logging |

The `EXPO_PUBLIC_` prefix is an Expo convention that embeds the value into the JavaScript bundle at build time. Never prefix the service role key with `EXPO_PUBLIC_`.
