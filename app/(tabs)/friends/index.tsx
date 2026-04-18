import { COLORS } from "@/lib/colors";
import Avatar from "@/components/Avatar";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  FriendProfile,
  FriendRequest,
  getSentRequests,
  searchUsers,
} from "@/lib/friends";
import { supabase } from "@/lib/supabase";
import { useFriends } from "@/auth/FriendsProvider";
import { router } from "expo-router";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Search,
  X,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";


export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const { friends, pendingRequests, friendsLoading, refreshFriends } =
    useFriends();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchUsers(searchQuery);
        setSearchResults(results);
      } catch (err: any) {
        console.log("[friends] search error", err);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    const loadSent = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const sent = await getSentRequests(user.id);
        setSentRequests(sent);
      } catch (err) {
        console.log("[friends] sent requests error", err);
      }
    };
    loadSent();
  }, [friends, pendingRequests]);

  const handleAccept = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      await acceptFriendRequest(requestId);
      await refreshFriends();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Unable to accept request.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      await declineFriendRequest(requestId);
      await refreshFriends();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Unable to decline request.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      await cancelFriendRequest(requestId);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const sent = await getSentRequests(user.id);
        setSentRequests(sent);
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Unable to cancel request.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await Promise.all([
        refreshFriends(),
        user ? getSentRequests(user.id).then(setSentRequests) : Promise.resolve(),
      ]);
    } catch (err) {
      console.log("[friends] refresh error", err);
    } finally {
      setRefreshing(false);
    }
  };

  const isSearchMode = searchQuery.trim().length > 0;

  const friendIdSet = new Set(friends.map((f) => f.id));
  const pendingIdSet = new Set(pendingRequests.map((r) => r.requesterId));
  const sentIdSet = new Set(sentRequests.map((r) => r.receiverId));
  const totalConnections = friends.length + pendingRequests.length + sentRequests.length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16 },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace("/(tabs)/home")}
          style={styles.backButton}
        >
          <ArrowLeft color={COLORS.text} size={20} strokeWidth={2.5} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Friends</Text>
          <Text style={styles.subtitle}>
            {friends.length} {friends.length === 1 ? "friend" : "friends"}
          </Text>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryStat}>
          <Text style={styles.summaryValue}>{friends.length}</Text>
          <Text style={styles.summaryLabel}>Friends</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryStat}>
          <Text style={styles.summaryValue}>{pendingRequests.length}</Text>
          <Text style={styles.summaryLabel}>Requests</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryStat}>
          <Text style={styles.summaryValue}>{totalConnections}</Text>
          <Text style={styles.summaryLabel}>Total Activity</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Search
          color={COLORS.textSecondary}
          size={16}
          strokeWidth={2.2}
          style={styles.searchIcon}
        />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by username…"
          placeholderTextColor={COLORS.textSecondary}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
            <X color={COLORS.textSecondary} size={16} strokeWidth={2} />
          </Pressable>
        )}
      </View>

      {/* Search Results */}
      {isSearchMode && (
        <View style={styles.section}>
          <SectionHeader
            title="Search Results"
            subtitle="Tap a profile to view or send a friend request."
          />
          {searching ? (
            <View style={styles.centerCard}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          ) : searchResults.length === 0 ? (
            <EmptyState
              title="No users found"
              text="Try a different username or check the spelling."
            />
          ) : (
            <View style={styles.list}>
              {searchResults.map((user) => {
                const isFriend = friendIdSet.has(user.id);
                const isPending = pendingIdSet.has(user.id);
                const isSent = sentIdSet.has(user.id);

                return (
                  <Pressable
                    key={user.id}
                    style={styles.card}
                    onPress={() => router.push(`/user/${user.id}`)}
                  >
                    <Avatar uri={user.avatarUrl} username={user.username} size={44} />
                    <View style={styles.cardContent}>
                      <Text style={styles.username}>{user.username}</Text>
                      <Text style={styles.metaText}>Tap to view profile</Text>
                      {!!user.bio && (
                        <Text style={styles.bio} numberOfLines={1}>
                          {user.bio}
                        </Text>
                      )}
                    </View>
                    <View style={styles.cardBadge}>
                      {isFriend && (
                        <View style={styles.friendBadge}>
                          <Text style={styles.friendBadgeText}>Friends</Text>
                        </View>
                      )}
                      {isSent && !isFriend && (
                        <View style={styles.sentBadge}>
                          <Text style={styles.sentBadgeText}>Requested</Text>
                        </View>
                      )}
                      {isPending && !isFriend && (
                        <View style={styles.pendingBadge}>
                          <Text style={styles.pendingBadgeText}>Incoming</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* Pending Requests */}
      {!isSearchMode && pendingRequests.length > 0 && (
        <View style={styles.section}>
          <SectionHeader
            title={`Friend Requests (${pendingRequests.length})`}
            subtitle="Accept or decline incoming requests."
          />
          <View style={styles.list}>
            {pendingRequests.map((req) => (
              <View key={req.id} style={styles.card}>
                <Pressable
                  style={styles.cardPressable}
                  onPress={() => router.push(`/user/${req.profile.id}`)}
                >
                  <Avatar uri={req.profile.avatarUrl} username={req.profile.username} size={44} />
                  <View style={styles.cardContent}>
                    <Text style={styles.username}>{req.profile.username}</Text>
                    <Text style={styles.metaText}>Wants to connect</Text>
                    {!!req.profile.bio && (
                      <Text style={styles.bio} numberOfLines={1}>
                        {req.profile.bio}
                      </Text>
                    )}
                  </View>
                </Pressable>
                <View style={styles.requestActions}>
                  <Pressable
                    style={[
                      styles.actionBtn,
                      styles.acceptBtn,
                      actionLoading === req.id && styles.actionBtnDisabled,
                    ]}
                    onPress={() => handleAccept(req.id)}
                    disabled={actionLoading === req.id}
                  >
                    {actionLoading === req.id ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <Check color="#000" size={16} strokeWidth={2.5} />
                    )}
                  </Pressable>
                  <Pressable
                    style={[
                      styles.actionBtn,
                      styles.declineBtn,
                      actionLoading === req.id && styles.actionBtnDisabled,
                    ]}
                    onPress={() => handleDecline(req.id)}
                    disabled={actionLoading === req.id}
                  >
                    <X color={COLORS.text} size={16} strokeWidth={2.5} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Sent Requests */}
      {!isSearchMode && sentRequests.length > 0 && (
        <View style={styles.section}>
          <SectionHeader
            title={`Sent (${sentRequests.length})`}
            subtitle="Pending requests you can still cancel."
          />
          <View style={styles.list}>
            {sentRequests.map((req) => (
              <Pressable
                key={req.id}
                style={styles.card}
                onPress={() => router.push(`/user/${req.profile.id}`)}
              >
                <Avatar uri={req.profile.avatarUrl} username={req.profile.username} size={44} />
                <View style={styles.cardContent}>
                  <Text style={styles.username}>{req.profile.username}</Text>
                  <Text style={styles.metaText}>Request sent</Text>
                  {!!req.profile.bio && (
                    <Text style={styles.bio} numberOfLines={1}>
                      {req.profile.bio}
                    </Text>
                  )}
                </View>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => handleCancelRequest(req.id)}
                  disabled={actionLoading === req.id}
                >
                  {actionLoading === req.id ? (
                    <ActivityIndicator size="small" color={COLORS.textSecondary} />
                  ) : (
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  )}
                </Pressable>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Friends List */}
      {!isSearchMode && (
        <View style={styles.section}>
          <SectionHeader
            title={`Friends (${friends.length})`}
            subtitle="Your accepted fishing buddies."
          />
          {friendsLoading ? (
            <View style={styles.centerCard}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.emptyText}>Loading...</Text>
            </View>
          ) : friends.length === 0 ? (
            <EmptyState
              title="No friends yet"
              text="Search for anglers above to add your first friend."
            />
          ) : (
            <View style={styles.list}>
              {friends.map((friend) => (
                <Pressable
                  key={friend.id}
                  style={styles.card}
                  onPress={() => router.push(`/user/${friend.id}`)}
                >
                  <Avatar uri={friend.avatarUrl} username={friend.username} size={44} />
                  <View style={styles.cardContent}>
                    <Text style={styles.username}>{friend.username}</Text>
                    <Text style={styles.metaText}>View profile and public catches</Text>
                    {!!friend.bio && (
                      <Text style={styles.bio} numberOfLines={1}>
                        {friend.bio}
                      </Text>
                    )}
                  </View>
                  <View style={styles.friendChevron}>
                    <ChevronRight
                      color={COLORS.textSecondary}
                      size={16}
                      strokeWidth={2}
                    />
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <Text style={styles.sectionSubtext}>{subtitle}</Text>
    </View>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.centerCard}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 48,
    gap: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.12)",
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  summaryStat: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  summaryValue: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "700",
  },
  summaryLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  summaryDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(221,220,219,0.1)",
    borderWidth: 1,
    borderColor: "rgba(221,220,219,0.2)",
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(221,220,219,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    padding: 0,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  sectionSubtext: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: "rgba(17,19,21,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  cardPressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  avatarFallback: {
    backgroundColor: "rgba(253,123,65,0.15)",
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },
  metaText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  bio: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  cardBadge: {
    flexShrink: 0,
  },
  friendBadge: {
    backgroundColor: "rgba(34,197,94,0.18)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.35)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  friendBadgeText: {
    color: "#4ade80",
    fontSize: 11,
    fontWeight: "700",
  },
  sentBadge: {
    backgroundColor: "rgba(253,123,65,0.15)",
    borderWidth: 1,
    borderColor: "rgba(253,123,65,0.35)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sentBadgeText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "700",
  },
  pendingBadge: {
    backgroundColor: "rgba(99,102,241,0.18)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.35)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pendingBadgeText: {
    color: "#818cf8",
    fontSize: 11,
    fontWeight: "700",
  },
  requestActions: {
    flexDirection: "row",
    gap: 8,
    flexShrink: 0,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  acceptBtn: {
    backgroundColor: COLORS.primary,
  },
  declineBtn: {
    backgroundColor: "rgba(221,220,219,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  cancelBtn: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexShrink: 0,
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  friendChevron: {
    flexShrink: 0,
    padding: 4,
  },
  centerCard: {
    backgroundColor: "rgba(17,19,21,0.92)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 22,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
});
