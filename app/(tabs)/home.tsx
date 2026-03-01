import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { COLORS } from "@/lib/colors";
import { CatchLog, getCatchStats, getUserCatchLogs } from "@/lib/catches";
import { router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useEffect, useState } from "react";
import {
  Clock,
  Calendar,
  Eye,
  Fish,
  Heart,
  Library,
  LogOut,
  MapPin,
  Ruler,
  TrendingUp,
  User,
  Weight,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import ScanButton from "../../components/ScanButton";

export default function Home() {
  const { width } = useWindowDimensions();
  const { profile, loading } = useAuth();
  const isFocused = useIsFocused();
  const [stats, setStats] = useState({ totalCatches: 0, speciesCount: 0 });
  const [recentCatch, setRecentCatch] = useState<CatchLog | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Two-column card width calculation
  const H_PADDING = 48;
  const GAP = 16;
  const cardWidth = (width - H_PADDING - GAP) / 2;

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      router.replace("/");
    }
  };

  useEffect(() => {
    if (!isFocused) return;

    const loadStats = async () => {
      setStatsLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setStats({ totalCatches: 0, speciesCount: 0 });
        setStatsLoading(false);
        return;
      }

      const catches = await getUserCatchLogs(user.id);
      setStats(getCatchStats(catches));
      setRecentCatch(catches[0] ?? null);
      setStatsLoading(false);
    };

    loadStats().catch(() => {
      setStats({ totalCatches: 0, speciesCount: 0 });
      setRecentCatch(null);
      setStatsLoading(false);
    });
  }, [isFocused]);

  if (loading || statsLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header with avatar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.push("/profile")}>
            {profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <User size={28} color={COLORS.primary} />
              </View>
            )}
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>Anglr</Text>
            <Text style={styles.subtitle}>
              Welcome back
              {profile?.username ? `, ${profile.username}` : ""}!
            </Text>
          </View>
        </View>

        <Pressable style={styles.signOutButton} onPress={handleSignOut}>
          <LogOut size={20} color={COLORS.textSecondary} />
        </Pressable>
      </View>

      <ScanButton />

      <Text style={styles.sectionLabel}>Quick Actions</Text>
      <View style={styles.rowGrid}>
        <Pressable
          style={[styles.actionBubble, { width: cardWidth }]}
          onPress={() => router.push("/catches")}
        >
          <View style={styles.actionIcon}>
            <Eye size={20} color={COLORS.primary} />
          </View>
          <Text style={styles.actionText}>View Catches</Text>
        </Pressable>

        <Pressable
          style={[styles.actionBubble, { width: cardWidth }]}
          onPress={() => router.push("/favorites")}
        >
          <View style={styles.actionIcon}>
            <Heart size={20} color={COLORS.primary} />
          </View>
          <Text style={styles.actionText}>Favorites</Text>
        </Pressable>
      </View>

      <Pressable style={styles.fullBubble}>
        <View style={styles.row}>
          <View style={styles.actionIcon}>
            <Library size={20} color={COLORS.primary} />
          </View>
          <View style={styles.fullBubbleContent}>
            <Text style={styles.actionText}>Species Guide</Text>
            <Text style={styles.actionSubtext}>Browse and learn</Text>
          </View>
        </View>
      </Pressable>

      <Text style={styles.sectionLabel}>Your Stats</Text>
      <View style={styles.rowGrid}>
        <View style={[styles.statBubble, { width: cardWidth }]}>
          <View style={styles.row}>
            <View style={styles.statIcon}>
              <TrendingUp size={14} color={COLORS.primary} />
            </View>
            <Text style={styles.statLabel}>Total Catches</Text>
          </View>
          <Text style={styles.statValue}>{stats.totalCatches}</Text>
        </View>

        <View style={[styles.statBubble, { width: cardWidth }]}>
          <View style={styles.row}>
            <View style={styles.statIcon}>
              <Fish size={14} color={COLORS.primary} />
            </View>
            <Text style={styles.statLabel}>Species</Text>
          </View>
          <Text style={styles.statValue}>{stats.speciesCount}</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Recent Activity</Text>
      <View style={styles.activityBubble}>
        <View style={styles.row}>
          <View style={styles.actionIcon}>
            <Clock size={18} color={COLORS.primary} />
          </View>
          <View style={styles.activityContent}>
            {recentCatch ? (
              <>
                <Text style={styles.activityTitle}>
                  Last catch: {recentCatch.species || "Unknown Species"}
                </Text>
                <View style={styles.activityMetaRow}>
                  <Ruler size={12} color={COLORS.primary} />
                  <Text style={styles.activityMetaText}>
                    {recentCatch.length || "-"}
                  </Text>
                  <Text style={styles.activityMetaDot}>•</Text>
                  <Weight size={12} color={COLORS.primary} />
                  <Text style={styles.activityMetaText}>
                    {recentCatch.weight || "-"}
                  </Text>
                </View>
                <View style={styles.activityMetaRow}>
                  <MapPin size={12} color={COLORS.primary} />
                  <Text style={styles.activityMetaText} numberOfLines={1}>
                    {recentCatch.location || "Unknown location"}
                  </Text>
                  <Text style={styles.activityMetaDot}>•</Text>
                  <Calendar size={12} color={COLORS.primary} />
                  <Text style={styles.activityMetaText} numberOfLines={1}>
                    {recentCatch.date || "No date"}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.activityTitle}>No recent activity</Text>
                <Text style={styles.activitySub}>
                  Start by scanning your first catch
                </Text>
              </>
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },

  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },

  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
  },

  header: {
    paddingTop: 48,
    paddingBottom: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },

  avatar: {
    width: 52,
    height: 52,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },

  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: "rgba(253,123,65,0.2)",
    borderWidth: 2,
    borderColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },

  headerText: {
    flex: 1,
  },

  title: {
    fontSize: 32,
    color: COLORS.text,
    fontWeight: "700",
    letterSpacing: -1,
  },

  subtitle: {
    color: COLORS.primary,
    fontSize: 14,
    marginTop: 4,
  },

  signOutButton: {
    padding: 12,
    borderRadius: 999,
    backgroundColor: "rgba(221,220,219,0.1)",
    borderWidth: 1,
    borderColor: "rgba(221,220,219,0.2)",
  },

  bioBubble: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  bioText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontStyle: "italic",
    lineHeight: 20,
  },

  sectionLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 12,
  },

  rowGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },

  actionBubble: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderWidth: 1,
    borderColor: "white",
    borderRadius: 24,
    padding: 20,
  },

  fullBubble: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderWidth: 1,
    borderColor: "white",
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
  },

  actionIcon: {
    padding: 10,
    borderRadius: 999,
    backgroundColor: "rgba(253,123,65,0.2)",
    marginBottom: 8,
    alignSelf: "flex-start",
  },

  actionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },

  actionSubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  statBubble: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "white",
  },

  statIcon: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: "rgba(253,123,65,0.2)",
    marginRight: 8,
  },

  statLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },

  statValue: {
    fontSize: 28,
    color: COLORS.text,
    fontWeight: "700",
    marginTop: 8,
  },

  activityBubble: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "white",
  },

  activityTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "500",
  },

  activitySub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  activityMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 5,
  },
  activityMetaText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    flexShrink: 1,
  },
  activityMetaDot: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  fullBubbleContent: {
    flex: 1,
  },

  activityContent: {
    flex: 1,
  },
});
