import { COLORS } from "@/lib/colors";
import { CatchLog, getUserFavoriteCatchLogs } from "@/lib/catches";
import { supabase } from "@/lib/supabase";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  RefreshCcw,
  Ruler,
  Star,
  Weight,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";


export default function FavoritesScreen() {
  const isFocused = useIsFocused();
  const [catches, setCatches] = useState<CatchLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFavorites = async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) {
        setCatches([]);
        setError("You must be signed in to view favorites.");
        return;
      }

      const rows = await getUserFavoriteCatchLogs(user.id);
      setCatches(rows);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load favorites.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isFocused) return;
    fetchFavorites();
  }, [isFocused]);

  const handleEditCatch = (catchLog: CatchLog) => {
    router.push({
      pathname: "/catches/[catchId]",
      params: { catchId: catchLog.id },
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/(tabs)/home")} style={styles.backButton}>
          <ArrowLeft color={COLORS.text} size={20} strokeWidth={2.5} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Favorites</Text>
          <Text style={styles.subtitle}>
            {catches.length} {catches.length === 1 ? "favorite" : "favorites"}
          </Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable style={styles.secondaryAction} onPress={() => fetchFavorites(true)}>
          <RefreshCcw color={COLORS.primary} size={16} strokeWidth={2.2} />
          <Text style={styles.secondaryActionText}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerCard}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.centerText}>Loading favorites...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerCard}>
          <Text style={styles.errorTitle}>Could not load favorites</Text>
          <Text style={styles.centerSubtext}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => fetchFavorites()}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      ) : catches.length === 0 ? (
        <View style={styles.centerCard}>
          <View style={styles.emptyIconWrap}>
            <Star color={COLORS.textSecondary} size={48} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>No favorites yet</Text>
          <Text style={styles.centerSubtext}>
            Favorite a catch in the edit screen to see it here.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {catches.map((catchLog) => (
            <Pressable
              key={catchLog.id}
              onPress={() => handleEditCatch(catchLog)}
              style={styles.card}
            >
              <View style={styles.imageWrap}>
                {catchLog.imageUrl ? (
                  <Image source={{ uri: catchLog.imageUrl }} style={styles.image} />
                ) : (
                  <View style={[styles.image, styles.imageFallback]}>
                    <Star color={COLORS.textSecondary} size={28} strokeWidth={1.5} />
                  </View>
                )}
                <View style={styles.imageOverlay} />
                <View style={styles.speciesBadge}>
                  <Text style={styles.speciesBadgeText}>
                    {catchLog.species || "Unknown Species"}
                  </Text>
                </View>
                <View style={styles.privacyBadge}>
                  <Text style={styles.privacyBadgeText}>
                    {catchLog.isPublic ? "Public" : "Private"}
                  </Text>
                </View>
              </View>

              <View style={styles.cardBody}>
                <View style={styles.inlineRow}>
                  <Calendar color={COLORS.primary} size={15} strokeWidth={2} />
                  <Text style={styles.metaText}>{catchLog.date || "No date"}</Text>
                </View>

                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <View style={styles.statIconWrap}>
                      <Ruler color={COLORS.primary} size={14} strokeWidth={2} />
                    </View>
                    <View>
                      <Text style={styles.statLabel}>Length</Text>
                      <Text style={styles.statValue}>{catchLog.length || "-"}</Text>
                    </View>
                  </View>
                  <View style={styles.statItem}>
                    <View style={styles.statIconWrap}>
                      <Weight color={COLORS.primary} size={14} strokeWidth={2} />
                    </View>
                    <View>
                      <Text style={styles.statLabel}>Weight</Text>
                      <Text style={styles.statValue}>{catchLog.weight || "-"}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.inlineRow}>
                  <MapPin color={COLORS.primary} size={15} strokeWidth={2} />
                  <Text style={styles.locationText}>
                    {catchLog.location || "Unknown location"}
                  </Text>
                </View>

                {!!catchLog.notes && (
                  <Text style={styles.notesPreview} numberOfLines={2}>
                    {catchLog.notes}
                  </Text>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
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
  headerTextWrap: {
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
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  secondaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(221,220,219,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryActionText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
  centerCard: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    padding: 22,
    alignItems: "center",
    gap: 10,
  },
  centerText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
  },
  centerSubtext: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  errorTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  retryButton: {
    marginTop: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 13,
  },
  emptyIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  emptyIconImage: {
    width: 84,
    height: 84,
    resizeMode: "contain",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },
  list: {
    gap: 14,
  },
  card: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 24,
    overflow: "hidden",
  },
  imageWrap: {
    height: 190,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  imageFallback: {
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackImageIcon: {
    width: 36,
    height: 36,
    resizeMode: "contain",
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  speciesBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(253,123,65,0.95)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    maxWidth: "70%",
  },
  speciesBadgeText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  privacyBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  privacyBadgeText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "600",
  },
  cardBody: {
    padding: 16,
    gap: 10,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: "500",
  },
  statsGrid: {
    flexDirection: "row",
    gap: 14,
  },
  statItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(253,123,65,0.15)",
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  statValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  locationText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  notesPreview: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
});
