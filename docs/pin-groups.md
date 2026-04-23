# Pin Groups

## Current State

`pin_group` is a `text | null` column on `catch_logs`. It exists in the schema and is passed through all CRUD operations, but there is **no UI to set or display pin groups**.

---

## What It Is

A pin group is a free-text label that can be assigned to one or more catches. The intent is to group related catches for display clustering or organizational purposes (e.g., "Lake Erie Trip 2026", "Morning Session").

---

## How It's Wired Today

### Create
```typescript
// In createCatchLog payload:
pin_group: catchLog.pinGroup ?? null
```

### Update
```typescript
// In updateCatchLog / batchUpdateCatchLogs:
if (update.pinGroup !== undefined) dbUpdate.pin_group = update.pinGroup;
```

### Batch assign
```typescript
batchUpdateCatchLogs(catchIds, { pinGroup: "Lake Erie Trip" })
```

This is fully functional at the data layer — you can assign a group via batch action code. There is no UI for it yet.

### CatchLog interface
```typescript
pinGroup?: string | null;
```

### Schema fallback
The `runCatchMutationWithCoordinateFallback` function strips `pin_group` if the schema cache reports it as missing (backward-compatible with older schema versions).

---

## `react-native-map-clustering`

The package `react-native-map-clustering` is listed in `package.json` (`^4.0.0`) and is installed but **not used** in the current map implementation. The map uses the standard `react-native-maps` `Marker` components directly.

Pin groups were likely planned as a way to cluster map pins by trip or session. The clustering library is pre-installed and ready to integrate.

---

## How to Extend

To expose pin groups in the UI:

1. Add a "Group" field to the catch edit screen (`app/(tabs)/catches/[catchId].tsx`).
2. Add a batch action option in the catch list to assign a group to selected catches.
3. On the map, add a "Groups" filter mode or use `react-native-map-clustering`'s `ClusterMarker` to visually group nearby pins that share a `pin_group`.
4. The DB column and all query functions already support it — no migration needed.
