# Maps

## Overview

The map screen displays catch locations as colored pins on a Google Maps view. It has three filter modes and handles offline states gracefully.

---

## Filter Modes

| Mode | Pin Color | Data Source | Online Required |
|------|-----------|-------------|-----------------|
| Mine | Orange `#FD7B41` | `getUserCatchLogs(userId)` — includes pending | No (pending from AsyncStorage) |
| Mine (pending) | Yellow `#FDBA74` | Same call, filtered by `syncStatus === "pending"` | No |
| Friends | Blue `#4F8CFF` | `getFriendMapPins(friendIds)` | Yes |
| Global | Green `#22C55E` | `getGlobalMapPins(250)` | Yes |

---

## Data Loading

### Mine + Friends (loaded together on screen focus)
```typescript
const [mineResult, friendsResult] = await Promise.allSettled([
  getUserCatchLogs(user.id),                   // always attempts
  online ? getFriendMapPins(friendIds) : []     // skips if offline
]);
```

Both are loaded simultaneously. `Promise.allSettled` ensures one failure doesn't block the other.

**Network error suppression:** If offline and the mine load fails with a network error, the error is suppressed (pending catches still appear). If friends fail due to network offline, silently return empty state.

### Global (lazy — only loads when user switches to Global mode)
```typescript
useEffect(() => {
  if (filterMode !== "global" || !isFocused) return;
  // load global pins
}, [filterMode, isFocused, reloadToken]);
```

Global pins are never loaded preemptively to avoid unnecessary data usage.

---

## Pin Rendering

Only pins with finite, non-null coordinates are rendered:

```typescript
const renderablePins = useMemo(
  () => activePins.filter(
    (pin) => Number.isFinite(pin.latitude) && Number.isFinite(pin.longitude)
  ),
  [activePins]
);
```

Each `Marker` uses `pinColor` (a hex string) to distinguish modes and sync status.

```typescript
// Mine pins
markerColor: catchLog.syncStatus === "pending" ? "#FDBA74" : "#FD7B41"

// Friends pins
markerColor: "#4F8CFF"

// Global pins
markerColor: "#22C55E"
```

---

## Friend Filter

When in Friends mode, a horizontal scrollable chip list shows "All Friends" + each friend's username.

```typescript
const filteredFriendPins = useMemo(() => {
  if (selectedFriendId === "all") return friendsState.pins;
  return friendsState.pins.filter((pin) => pin.userId === selectedFriendId);
}, [friendsState.pins, selectedFriendId]);
```

Selecting a specific friend filters the displayed pins without reloading data.

---

## Viewport Fitting

After pins load, `fitToCoordinates` or `animateToRegion` is called to center the map:

```typescript
const activeCoordinates = useMemo(
  () => renderablePins.map((pin) => ({ latitude: pin.latitude, longitude: pin.longitude })),
  [renderablePins]
);
```

- **1 pin:** `animateToRegion` with `latitudeDelta: 0.05, longitudeDelta: 0.05` (zoom close).
- **Multiple pins:** `fitToCoordinates` with edge padding `{ top: 180, right: 48, bottom: 180, left: 48 }`.

The viewport update is debounced with `setTimeout(0)` to run after the map layout settles. Two booleans gate it: `isMapReady` (fires after `onMapReady`) and `isMapLaidOut` (fires after `onLayout`). Both must be true before fitting.

**Caveat:** When `reloadToken` changes (the "Try Again" button increments it), `isMapReady` is manually reset to `false` to force a re-fit after the new MapView instance mounts.

---

## Pin Callout Card

Tapping a pin opens a bottom sheet card with:
- Thumbnail image (or placeholder icon)
- Species name
- Length · Weight
- Date
- "Saved offline. Syncing when you're back online." (if `syncStatus === "pending"`)

For friends/global pins, a second row shows:
- Friend's avatar and username
- "Tap to view profile" → navigates to `/user/{userId}`

Tapping anywhere on the map (not a pin) closes the card.

---

## Reload / Error State

If a data load fails:
- An overlay card shows the error message and a "Try Again" button.
- Tapping "Try Again" increments `reloadToken`, which remounts the MapView and re-triggers all load effects.

The overlay is only shown if there are zero pins to display (error + empty). If cached/pending pins exist, the map renders them and the error is suppressed.

---

## Zoom Controls

Custom `MapZoomControls` component (`components/MapZoomControls.tsx`):
- `+` halves the delta (zooms in).
- `−` doubles the delta (zooms out).
- Clamped: `0.0025 ≤ delta ≤ 90`.
- Calls `mapRef.current.animateToRegion()` with the new delta.

The native MapView zoom gesture is also available and tracked via `onRegionChangeComplete` to keep `currentRegion` in sync.

---

## Default Region

```typescript
const DEFAULT_REGION = {
  latitude: 41.238,
  longitude: -81.841,
  latitudeDelta: 0.3,
  longitudeDelta: 0.3,
};
```

Centered on northeastern Ohio (developer's region). This is the view shown before any pins load.

---

## Google Maps API Key

The Google Maps API key is embedded in `app.json` under `android.config.googleMaps.apiKey`. This key must have the **Maps SDK for Android** enabled and should be restricted by package name (`com.anglr`) in the Google Cloud Console before Play Store submission.

---

## Performance Notes

- `useMemo` on `filteredFriendPins`, `renderablePins`, and `activeCoordinates` prevents re-renders on unrelated state changes.
- Mine and friends loads are parallel (`Promise.allSettled`), not sequential.
- Global pins load lazily on demand.
- The map does not re-render pins on every navigation — it only reloads when the screen is focused (`useIsFocused`).
