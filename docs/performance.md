# Performance

## Memoization Strategy

### Map Screen (`app/(tabs)/map.tsx`)

The map screen is the most performance-sensitive screen. Three `useMemo` calls prevent expensive re-computation:

```typescript
// Filter friend pins by selected friend ID
const filteredFriendPins = useMemo(
  () => selectedFriendId === "all"
    ? friendsState.pins
    : friendsState.pins.filter((pin) => pin.userId === selectedFriendId),
  [friendsState.pins, selectedFriendId]
);

// Filter out pins with invalid coordinates (prevents MapView crash)
const renderablePins = useMemo(
  () => activePins.filter(
    (pin) => Number.isFinite(pin.latitude) && Number.isFinite(pin.longitude)
  ),
  [activePins]
);

// Extract coordinate objects for fitToCoordinates
const activeCoordinates = useMemo(
  () => renderablePins.map((pin) => ({ latitude: pin.latitude, longitude: pin.longitude })),
  [renderablePins]
);
```

Without these, every state update (e.g., user selects a pin → `selectedPin` changes) would recompute all pin arrays.

### `useCallback` in Home Screen

```typescript
const loadStats = useCallback(async () => { ... }, [user]);
const loadFeed  = useCallback(async () => { ... }, [user, friends]);
const handleRefresh = useCallback(async () => { ... }, [loadStats, loadFeed]);
```

Prevents function recreation on every render. Particularly important for `handleRefresh`, which is passed to `RefreshControl`.

---

## React Compiler

The app has `"reactCompiler": true` in `app.json` experiments. The React Compiler (formerly React Forget) automatically memoizes components and values when it detects stable patterns. This means explicit `useMemo`/`useCallback` may become redundant over time, but they are currently left in place as explicit documentation of intent.

---

## Session Caching

The root layout avoids repeated `getSession()` calls via `hasSessionRef`:

```typescript
const hasSessionRef = useRef<boolean | null>(null);

// On cold start: call getSession() once, populate the ref
// On every subsequent navigation: read the ref directly
```

`getSession()` reads from AsyncStorage (a disk read on first call, fast). Still, skipping it on every navigation is a meaningful optimization on low-end Android devices.

---

## List Rendering

### Catch list (`app/(tabs)/catches/index.tsx`)
Renders a scrollable list of all user catches. No virtualization library beyond React Native's built-in `FlatList`. With hundreds of catches this may become slow — no explicit limit is applied to the query.

### Friends feed (home screen)
Capped at `friendIds.length * 10` rows, then deduped to one per friend. At 50 friends, this is ~500 rows fetched. Acceptable at current scale.

### Global map pins
Hard-capped at 250 (`getGlobalMapPins(250)`). Beyond this, the MapView renders 250 Marker components which can degrade performance on older Android devices.

---

## Network Request Efficiency

| Pattern | Implementation |
|---------|---------------|
| Parallel mine + friends map loads | `Promise.allSettled` |
| Friends + pending requests load | `Promise.all` in FriendsProvider |
| Profile lookup batch (map callouts) | Single `SELECT ... WHERE id IN (...)` after collecting unique user IDs |
| Lazy global pins | Only loaded when user selects Global filter |

---

## Potential Bottlenecks

| Area | Concern | Threshold |
|------|---------|-----------|
| Catch list | No pagination; all catches fetched per user | > 500 catches per user |
| Global map pins | 250 Markers rendered simultaneously | Lower-end Android devices |
| `queryRowsWithCoordinateFallback` | Logs to console on every map query | Development only; harmless in production |
| Friends feed | Fetches up to `friendIds.length * 10` catch rows | > 100 friends |
| Avatar upload | Uses `fetch().blob()` — keeps entire file in memory | > 10 MB images |

---

## Image Loading

Profile avatars and catch thumbnails are loaded via React Native's `Image` component or `expo-image`. No explicit caching strategy is applied beyond the OS-level URL cache. `expo-image` (used in some screens) has built-in disk caching.

---

## New Architecture

`"newArchEnabled": true` in `app.json`. The app is using React Native's New Architecture (Fabric + JSI), which provides faster bridge-less rendering. This is the right default for new apps but may surface compatibility issues with older native modules.
