# Overview

## What Anglr Is

Anglr is a mobile app (Android-first, iOS-compatible) for recreational anglers to log fishing catches, track personal stats, share catches with friends, and explore catches on a map. It began as a single-user catch tracker and was extended into a social platform in April 2026.

## Core Features

### Catch Logging
- Log a catch with photo, species, length, weight, location, temperature, weather, lure, method, and notes.
- Species identification scan on the image review screen using a built-in freshwater species list.
- GPS coordinates captured for map pin placement.
- Privacy controls: private (default), friends-only, or public.
- Works offline — catches queue locally and sync when connectivity returns.

### Map
- Interactive Google Maps view of catch locations.
- Three filter modes: your own catches (orange), friends' catches (blue), global public catches (green).
- Offline catches shown as yellow pins with an "offline" indicator.
- Tap any pin to see species, size, date, and angler info.

### Social / Friends
- Send and accept friend requests by searching usernames.
- Friends feed on the home screen shows each friend's most recent public catch.
- Friends' public and friends-only catches appear on the map.

### Profile
- Username, avatar, bio.
- Measurement unit preferences (cm/in, kg/lbs, celsius/fahrenheit).
- Account deletion (full GDPR-style erasure via Edge Function).

### Authentication
- Email + password with email verification.
- Google OAuth (sign-in and identity linking).
- Username-based login (resolves to email server-side).
- Password reset via email link to a web-based reset screen.

### Catch Management
- Edit, delete, favorite, batch-update and batch-delete.
- Favorites tab for quick access to starred catches.
- Pin groups field for potential future clustering.

### Content
- Species guide with educational articles on freshwater fish.

## Target Platform

- **Primary:** Android (Play Store submission pending)
- **Secondary:** iOS (same codebase)
- **App ID:** `com.anglr`
- **Expo Slug:** `anglr`
- **EAS Project ID:** `37fc6544-015c-4196-b898-520e2971335e`
- **Deep link scheme:** `anglr://`

## Current Version

`1.0.0` — pre-launch, not yet submitted to any store.
