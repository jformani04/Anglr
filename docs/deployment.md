# Deployment

## EAS (Expo Application Services)

The app uses EAS for builds and distribution.

**Project:** `37fc6544-015c-4196-b898-520e2971335e`  
**Owner:** `jformani`  
**EAS config:** `fish-app/eas.json`

### Build Commands

```bash
# Development build (for Expo Go replacement)
eas build --profile development --platform android

# Preview build (APK for internal testing)
eas build --profile preview --platform android

# Production build (AAB for Play Store)
eas build --profile production --platform android
```

### Environment Variables in EAS

Secrets must be set in EAS, not checked into `.env`:
```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://..."
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..."
```

The `SUPABASE_SERVICE_ROLE_KEY` is only used in Supabase Edge Functions — it is never needed in the EAS build.

---

## Supabase Edge Functions

Edge Functions are deployed via the Supabase CLI.

### Prerequisites
```bash
npm install -g supabase
supabase login
supabase link --project-ref dezgvmtpbaijwqnruevt
```

### Deploy commands
```bash
# Deploy delete_account (requires JWT verification)
supabase functions deploy delete_account --no-verify-jwt=false

# Deploy lookup functions (no JWT required — public endpoints with rate limiting)
supabase functions deploy lookup_email_by_username
supabase functions deploy lookup_auth_providers
```

### Edge Function Secrets
Set via Supabase CLI or dashboard:
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

These are available as `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` inside functions.

---

## Database Migrations

### Friendships migration
```bash
# Apply in Supabase SQL Editor or via CLI:
supabase db push
# Or paste contents of:
supabase/migrations/20260416_friendships.sql
```

### Base schema
The `profiles` and `catch_logs` tables were created directly in the Supabase dashboard. There are no migration files for the base schema. If you need to recreate the database from scratch:

1. Create the tables manually in the Supabase SQL editor (use [database.md](database.md) as the reference).
2. Enable RLS on each table.
3. Apply the RLS policies documented in [supabase.md](supabase.md).
4. Apply the friendships migration.
5. Create the storage buckets (`catch_photos`, `avatars`) with public access.

---

## Play Store Submission Checklist

Before submitting to Google Play:

1. Run a production EAS build: `eas build --profile production --platform android`
2. Download the `.aab` file from the EAS dashboard.
3. In Google Play Console:
   - Create a new app with package name `com.anglr`
   - Complete the **Data Safety** form (declares: email address, location, photos/videos, user IDs)
   - Upload a **Privacy Policy URL** (must be live)
   - Upload the `.aab` to internal testing first
   - Promote to production after testing

---

## Custom Domain Setup (Required Before Launch)

1. Register a domain (e.g., `anglrapp.com`).
2. In Supabase Auth settings: set **Site URL** to `https://anglrapp.com`.
3. Add `anglr://` to **Redirect URLs** (for deep links).
4. Configure custom SMTP in Supabase (Auth → SMTP Settings):
   - Use Resend, Postmark, or SendGrid
   - Set the "From" address to `noreply@anglrapp.com`
5. Update the password reset redirect to `https://anglrapp.com/auth/reset-password` (a web page that handles the token and deep-links back to the app).

---

## Android Configuration

`app.json` relevant settings:
```json
{
  "android": {
    "package": "com.anglr",
    "edgeToEdgeEnabled": true,
    "predictiveBackGestureEnabled": false,
    "config": {
      "googleMaps": {
        "apiKey": "AIzaSy..."  // Must be restricted before launch
      }
    },
    "permissions": [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "CAMERA",
      "RECORD_AUDIO"
    ]
  }
}
```

---

## Monitoring

No production monitoring is currently configured. Recommended additions:

- **EAS Insights** — crash reporting built into Expo
- **Supabase Dashboard** — monitors DB query performance, auth events, storage usage
- **Sentry** — for detailed error tracking with stack traces
