import { COLORS } from "@/lib/colors";
import Avatar from "@/components/Avatar";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  FriendshipStatusResult,
  getFriendPublicCatches,
  getFriendshipStatus,
  removeFriend,
  sendFriendRequest,
} from "@/lib/friends";
import { supabase } from "@/lib/supabase";
import { useFriends } from "@/auth/FriendsProvider";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Calendar, Fish, MapPin, Ruler, UserCheck, UserMinus, UserPlus, Weight } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type OtherProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string | null;
};

type PublicCatch = {
  id: string;
  imageUrl: string;
  species: string;
  length: string;
  weight: string;
  location: string;
  date: string;
};


function parseMeasurement(val: string): number {
  const m = val.match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

function buildStats(catches: PublicCatch[]) {
  if (catches.length === 0) return { total: 0, biggestFish: "-" };

  const byWeight = catches.reduce((best, c) =>
    parseMeasurement(c.weight) > parseMeasurement(best.weight) ? c : best
  );
  const byLength = catches.reduce((best, c) =>
    parseMeasurement(c.length) > parseMeasurement(best.length) ? c : best
  );

  let biggestFish = "-";
  if (byWeight.weight.trim()) {
    biggestFish = `${byWeight.species || "Unknown"} (${byWeight.weight})`;
  } else if (byLength.length.trim()) {
    biggestFish = `${byLength.species || "Unknown"} (${byLength.length})`;
  }

  return { total: catches.length, biggestFish };
}

function formatMemberSince(createdAt: string | null) {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  return `Member since ${date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  })}`;
}

export default function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { refreshFriends } = useFriends();

  const [profile, setProfile] = useState<OtherProfile | null>(null);
  const [catches, setCatches] = useState<PublicCatch[]>([]);
  const [friendStatus, setFriendStatus] = useState<FriendshipStatusResult>({
    status: null,
    requestId: null,
    iAmRequester: false,
  });
  const [userStats, setUserStats] = useState<{ total: number; biggestFish: string }>({ total: 0, biggestFish: "-" });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [profileRes, statusRes, catchesRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, username, avatar_url, bio, created_at")
            .eq("id", userId)
            .single(),
          getFriendshipStatus(userId),
          getFriendPublicCatches(userId),
        ]);

        if (profileRes.data) {
          const row = profileRes.data as any;
          setProfile({
            id: row.id,
            username: row.username ?? "Angler",
            avatarUrl: row.avatar_url ?? null,
            bio: row.bio ?? null,
            createdAt: row.created_at ?? null,
          });
        }

        setFriendStatus(statusRes);
        setCatches(catchesRes);
        setUserStats(buildStats(catchesRes));
      } catch (err: any) {
        Alert.alert("Error", err?.message ?? "Unable to load profile.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const refreshStatus = async () => {
    if (!userId) return;
    const status = await getFriendshipStatus(userId);
    setFriendStatus(status);
    await refreshFriends();
  };

  const handleAddFriend = async () => {
    if (!userId) return;
    setActionLoading(true);
    try {
      await sendFriendRequest(userId);
      await refreshStatus();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Unable to send friend request.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!friendStatus.requestId) return;
    setActionLoading(true);
    try {
      await acceptFriendRequest(friendStatus.requestId);
      await refreshStatus();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Unable to accept request.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!friendStatus.requestId) return;
    setActionLoading(true);
    try {
      await declineFriendRequest(friendStatus.requestId);
      await refreshStatus();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Unable to decline request.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!friendStatus.requestId) return;
    setActionLoading(true);
    try {
      await cancelFriendRequest(friendStatus.requestId);
      await refreshStatus();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Unable to cancel request.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveFriend = () => {
    Alert.alert(
      "Remove Friend",
      `Remove ${profile?.username ?? "this user"} from your friends?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            if (!friendStatus.requestId) return;
            setActionLoading(true);
            try {
              await removeFriend(friendStatus.requestId);
              await refreshStatus();
            } catch (err: any) {
              Alert.alert("Error", err?.message ?? "Unable to remove friend.");
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>User not found.</Text>
        <Pressable style={styles.backPressable} onPress={() => router.back()}>
          <Text style={styles.backPressableText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const { status, iAmRequester } = friendStatus;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color={COLORS.text} size={20} strokeWidth={2.5} />
        </Pressable>
        <Text style={styles.headerTitle}>Angler Profile</Text>
      </View>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.profileRow}>
          <Avatar uri={profile.avatarUrl} username={profile.username} size={72} />
          <View style={{ flex: 1 }}>
            <Text style={styles.username}>{profile.username}</Text>
            {!!profile.createdAt && (
              <Text style={styles.memberSince}>
                {formatMemberSince(profile.createdAt)}
              </Text>
            )}
          </View>
        </View>

        {!!profile.bio && (
          <Text style={styles.bio}>{profile.bio}</Text>
        )}

        {/* Friend Action */}
        <View style={styles.friendActions}>
          {status === null && (
            <Pressable
              style={[styles.addFriendBtn, actionLoading && styles.btnDisabled]}
              onPress={handleAddFriend}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <UserPlus color="#000" size={16} strokeWidth={2.5} />
                  <Text style={styles.addFriendBtnText}>Add Friend</Text>
                </>
              )}
            </Pressable>
          )}

          {status === "pending" && iAmRequester && (
            <Pressable
              style={[styles.requestedBtn, actionLoading && styles.btnDisabled]}
              onPress={handleCancelRequest}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color={COLORS.textSecondary} />
              ) : (
                <Text style={styles.requestedBtnText}>Requested — Cancel</Text>
              )}
            </Pressable>
          )}

          {status === "pending" && !iAmRequester && (
            <View style={styles.incomingActions}>
              <Text style={styles.incomingLabel}>Wants to be your friend</Text>
              <View style={styles.incomingBtns}>
                <Pressable
                  style={[
                    styles.acceptBtn,
                    actionLoading && styles.btnDisabled,
                  ]}
                  onPress={handleAccept}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  )}
                </Pressable>
                <Pressable
                  style={[
                    styles.declineBtn,
                    actionLoading && styles.btnDisabled,
                  ]}
                  onPress={handleDecline}
                  disabled={actionLoading}
                >
                  <Text style={styles.declineBtnText}>Decline</Text>
                </Pressable>
              </View>
            </View>
          )}

          {status === "accepted" && (
            <Pressable
              style={[styles.friendsBtn, actionLoading && styles.btnDisabled]}
              onPress={handleRemoveFriend}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color={COLORS.text} />
              ) : (
                <>
                  <UserCheck color={COLORS.text} size={16} strokeWidth={2.5} />
                  <Text style={styles.friendsBtnText}>Friends</Text>
                  <UserMinus
                    color={COLORS.textSecondary}
                    size={14}
                    strokeWidth={2}
                  />
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{userStats.total}</Text>
          <Text style={styles.statLabel}>Catches</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={[styles.statItem, { flex: 2 }]}>
          <Text style={styles.statValue} numberOfLines={1}>{userStats.biggestFish}</Text>
          <Text style={styles.statLabel}>Biggest Fish</Text>
        </View>
      </View>

      {/* Public Catches */}
      <Text style={styles.sectionLabel}>
        Public Catches ({catches.length})
      </Text>

      {catches.length === 0 ? (
        <View style={styles.centerCard}>
          <Text style={styles.emptyText}>No public catches yet</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {catches.map((catchLog) => (
            <Pressable
              key={catchLog.id}
              style={styles.catchCard}
              onPress={() => router.push(`/user/catch/${catchLog.id}`)}
            >
              <View style={styles.catchRow}>
                <View style={styles.thumbWrap}>
                  {catchLog.imageUrl ? (
                    <Image
                      source={{ uri: catchLog.imageUrl }}
                      style={styles.thumbImage}
                    />
                  ) : (
                    <View style={[styles.thumbImage, styles.thumbFallback]}>
                      <Fish color={COLORS.textSecondary} size={26} strokeWidth={1.5} />
                    </View>
                  )}
                </View>

                <View style={styles.catchContent}>
                  <Text style={styles.catchSpecies} numberOfLines={1}>
                    {catchLog.species || "Unknown Species"}
                  </Text>

                  <View style={styles.catchMetaRow}>
                    <Ruler color={COLORS.textSecondary} size={12} strokeWidth={2} />
                    <Text style={styles.metaText}>{catchLog.length || "-"}</Text>
                    <Text style={styles.dot}>•</Text>
                    <Weight color={COLORS.textSecondary} size={12} strokeWidth={2} />
                    <Text style={styles.metaText}>{catchLog.weight || "-"}</Text>
                  </View>

                  <View style={styles.catchMetaRow}>
                    <MapPin color={COLORS.textSecondary} size={12} strokeWidth={2} />
                    <Text style={styles.locationText} numberOfLines={1}>
                      {catchLog.location || "Unknown location"}
                    </Text>
                    <Text style={styles.dot}>•</Text>
                    <Calendar color={COLORS.textSecondary} size={12} strokeWidth={2} />
                    <Text style={styles.dateText} numberOfLines={1}>
                      {catchLog.date || ""}
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: 15,
  },
  backPressable: {
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backPressableText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 14,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 48,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
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
  headerTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "700",
  },
  profileCard: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 24,
    padding: 16,
    gap: 12,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: "rgba(253,123,65,0.15)",
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: COLORS.primary,
    fontSize: 28,
    fontWeight: "700",
  },
  username: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "700",
  },
  memberSince: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  bio: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  friendActions: {
    marginTop: 4,
  },
  addFriendBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 8,
  },
  addFriendBtnText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 15,
  },
  requestedBtn: {
    backgroundColor: "rgba(221,220,219,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  requestedBtnText: {
    color: COLORS.textSecondary,
    fontWeight: "600",
    fontSize: 14,
  },
  incomingActions: {
    gap: 8,
  },
  incomingLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },
  incomingBtns: {
    flexDirection: "row",
    gap: 8,
  },
  acceptBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  acceptBtnText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 14,
  },
  declineBtn: {
    flex: 1,
    backgroundColor: "rgba(221,220,219,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  declineBtnText: {
    color: COLORS.textSecondary,
    fontWeight: "600",
    fontSize: 14,
  },
  friendsBtn: {
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.35)",
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 8,
  },
  friendsBtnText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  sectionLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  list: {
    gap: 8,
  },
  catchCard: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 18,
    overflow: "hidden",
  },
  catchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  thumbWrap: {
    width: 68,
    height: 68,
    borderRadius: 12,
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  thumbFallback: {
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackIcon: {
    width: 34,
    height: 34,
    resizeMode: "contain",
  },
  catchContent: {
    flex: 1,
    minWidth: 0,
  },
  catchSpecies: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  catchMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  metaIcon: {
    width: 22,
    height: 22,
    resizeMode: "contain",
  },
  metaIconLg: {
    width: 26,
    height: 26,
    resizeMode: "contain",
  },
  metaText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "500",
  },
  dot: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  locationText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    flexShrink: 1,
  },
  dateText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    flexShrink: 1,
  },
  centerCard: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    padding: 20,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  statsCard: {
    flexDirection: "row",
    backgroundColor: "rgba(221,220,219,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: "500",
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginHorizontal: 4,
  },
});
