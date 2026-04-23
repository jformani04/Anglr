# Friends System

## Overview

The friends system was added in April 2026. It enables users to connect, see each other's catches in a feed, and view friends' catch locations on the map.

**Prerequisites:** The `supabase/migrations/20260416_friendships.sql` migration must be applied in the Supabase SQL Editor before any friends functionality works.

---

## Data Model

See [database.md](database.md) for the full `friendships` table schema.

Key points:
- Relationships are **directional** (`requester_id`, `receiver_id`).
- Querying "my friends" requires checking both directions: rows where I am `requester_id` OR `receiver_id` with `status = "accepted"`.
- Decline and cancel both use DELETE — no rejected/blocked terminal state in current implementation.

---

## State Management (`auth/FriendsProvider.tsx`)

`FriendsProvider` wraps the entire app inside `AuthProvider`. It provides:

| Value | Type | Description |
|-------|------|-------------|
| `friends` | `FriendProfile[]` | All accepted friends |
| `pendingRequests` | `FriendRequest[]` | Incoming pending requests |
| `friendsLoading` | `boolean` | Loading state |
| `refreshFriends()` | `() => Promise<void>` | Re-fetches friends and pending requests |

Both `getFriends` and `getPendingRequests` are called in parallel on load and on `refreshFriends()`.

The `friends` array is passed directly to `map.tsx` for the friend pin queries and friend chip selector.

---

## Friend Request Flow

```
User A searches for User B by username
  → searchUsers("bass") returns matching profiles
  → User A taps "Add Friend"
  → sendFriendRequest(userB.id)
  → INSERT friendships (requester_id=A, receiver_id=B, status="pending")

User B opens Friends screen
  → getPendingRequests(B.id) shows User A in "Requests" section
  → User B taps "Accept"
  → acceptFriendRequest(requestId) → UPDATE status="accepted"

Both users now see each other in getFriends()
```

**Decline flow:**
```
User B taps "Decline"
  → declineFriendRequest(requestId) → DELETE row
```

**Cancel flow (requester):**
```
User A taps "Cancel Request" on User B's profile
  → cancelFriendRequest(requestId) → DELETE row
```

**Remove flow:**
```
User A or B taps "Remove Friend"
  → removeFriend(requestId) → DELETE row (regardless of who was requester)
```

---

## Friends Screen (`app/(tabs)/friends/index.tsx`)

Sections:
1. **Search** — text input → `searchUsers(query)` → show results with friend action buttons
2. **Pending requests** — from `pendingRequests` state — accept / decline
3. **Sent requests** — from `getSentRequests()` — cancel
4. **Friends list** — from `friends` state — tap to view profile

---

## Friend Profile Screen (`app/(tabs)/user/[userId].tsx`)

Shows:
- Avatar, username, bio
- Friend action button (add / pending / accept / friends / remove — based on `getFriendshipStatus()`)
- Public and friends-only catches via `getFriendPublicCatches(userId)`

---

## Friends in the Home Feed

`home.tsx` calls `getFriendFeed(friendIds)`:
- Returns one entry per friend (the most recent public/friends-only catch).
- Sorted newest first.
- Displays as a horizontal scrollable card list.

If the user has no friends, a "No friends yet" empty state is shown with a link to the Friends screen.

---

## Friends on the Map

When Friends filter mode is active:
- `getFriendMapPins(friendIds)` fetches all friends' public + friends-only catches with valid coordinates and `hide_location = false`.
- Returns `FriendMapPin` (includes username, avatarUrl for callout).
- A friend chip selector above the map allows filtering to a single friend.

---

## Privacy Enforcement

The friends layer respects catch privacy settings:

| Catch visibility | Appears in friend feed? | Appears on friend map? |
|-----------------|------------------------|------------------------|
| `is_public = false, is_friends_only = false` | No | No |
| `is_friends_only = true` | Yes (if friends) | Yes (if friends, has coords, no hide_location) |
| `is_public = true` | Yes | Yes (if has coords, no hide_location) |

The queries use `.or("is_public.eq.true,is_friends_only.eq.true")` — the RLS policies on the DB must also enforce that only accepted friends can access `is_friends_only` catches. Verify this in the Supabase RLS configuration.

---

## Bidirectional Query Challenge

When getting friends, PostgREST requires separate conditions for each direction. The query uses:
```
.or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
```
And then at the application level:
```typescript
const profileRow = row.requester_id === userId ? row.receiver : row.requester;
```

For `getFriendshipStatus`, two separate queries are used (as requester, then as receiver) because a compound OR with join aliases is unreliable in some PostgREST versions.
