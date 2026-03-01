import { COLORS } from "@/lib/colors";
import { CatchLog, getUserCatchLogs, seedDevCatchLog } from "@/lib/catches";
import { supabase } from "@/lib/supabase";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import {
  ArrowLeft,
  Calendar,
  Fish as FishIcon,
  MapPin,
  RefreshCcw,
  Ruler,
  Weight,
} from "lucide-react-native";
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

const DEBUG = process.env.EXPO_PUBLIC_DEBUG === "1";

export default function CatchesScreen() {
  const isFocused = useIsFocused();
  const [catches, setCatches] = useState<CatchLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCatches = async (showRefreshing = false) => {
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
        setError("You must be signed in to view catches.");
        return;
      }

      if (DEBUG) console.log("[catches] current user id", user.id);

      const rows = await getUserCatchLogs(user.id);
      setCatches(rows);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load catches.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isFocused) return;
    fetchCatches();
  }, [isFocused]);

  const handleEditCatch = (catchLog: CatchLog) => {
    router.push({
      pathname: "/catches/[catchId]",
      params: { catchId: catchLog.id },
    });
  };

  const handleSeedDevCatch = async () => {
    try {
      setRefreshing(true);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("No authenticated user");
      await seedDevCatchLog(user.id);
      await fetchCatches(true);
    } catch (err: any) {
      Alert.alert("Seed Error", err?.message ?? "Unable to add test catch");
      setRefreshing(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color={COLORS.text} size={20} strokeWidth={2.5} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Your Catches</Text>
          <Text style={styles.subtitle}>
            {catches.length} {catches.length === 1 ? "catch" : "catches"} logged
          </Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable style={styles.secondaryAction} onPress={() => fetchCatches(true)}>
          <RefreshCcw color={COLORS.primary} size={16} strokeWidth={2.2} />
          <Text style={styles.secondaryActionText}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </Text>
        </Pressable>
        {__DEV__ && (
          <Pressable style={styles.devAction} onPress={handleSeedDevCatch}>
            <Text style={styles.devActionText}>+ Add Test Catch</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.centerCard}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.centerText}>Loading catches...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerCard}>
          <Text style={styles.errorTitle}>Could not load catches</Text>
          <Text style={styles.centerSubtext}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => fetchCatches()}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      ) : catches.length === 0 ? (
        <View style={styles.centerCard}>
          <View style={styles.emptyIconWrap}>
            <FishIcon color={COLORS.primary} size={34} strokeWidth={2} />
          </View>
          <Text style={styles.emptyTitle}>No catches yet</Text>
          <Text style={styles.centerSubtext}>
            Start logging your catches to see them here.
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
              <View style={styles.cardRow}>
                <View style={styles.thumbWrap}>
                  {catchLog.imageUrl ? (
                    <Image source={{ uri: catchLog.imageUrl }} style={styles.thumbImage} />
                  ) : (
                    <View style={[styles.thumbImage, styles.imageFallback]}>
                      <FishIcon color={COLORS.primary} size={24} strokeWidth={2} />
                    </View>
                  )}
                </View>

                <View style={styles.cardContent}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.speciesTitle} numberOfLines={1}>
                      {catchLog.species || "Unknown Species"}
                    </Text>
                    <View
                      style={[
                        styles.visibilityPill,
                        catchLog.isPublic
                          ? styles.visibilityPillPublic
                          : styles.visibilityPillPrivate,
                      ]}
                    >
                      <Text
                        style={[
                          styles.visibilityPillText,
                          catchLog.isPublic
                            ? styles.visibilityPillTextPublic
                            : styles.visibilityPillTextPrivate,
                        ]}
                      >
                        {catchLog.isPublic ? "Public" : "Private"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.lengthWeightRow}>
                    <View style={styles.inlineRow}>
                      <Ruler color={COLORS.primary} size={12} strokeWidth={2} />
                      <Text style={styles.metaText}>{catchLog.length || "-"}</Text>
                    </View>
                    <Text style={styles.dot}>•</Text>
                    <View style={styles.inlineRow}>
                      <Weight color={COLORS.primary} size={12} strokeWidth={2} />
                      <Text style={styles.metaText}>{catchLog.weight || "-"}</Text>
                    </View>
                  </View>

                  <View style={styles.locationDateRow}>
                    <MapPin color={COLORS.primary} size={12} strokeWidth={2} />
                    <Text style={styles.locationText} numberOfLines={1}>
                      {catchLog.location || "Unknown location"}
                    </Text>
                    <Text style={styles.dot}>•</Text>
                    <Calendar color={COLORS.primary} size={12} strokeWidth={2} />
                    <Text style={styles.dateText} numberOfLines={1}>
                      {catchLog.date || "No date"}
                    </Text>
                  </View>

                  {!!catchLog.notes && (
                    <Text style={styles.notesPreview} numberOfLines={1}>
                      {catchLog.notes}
                    </Text>
                  )}
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
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    paddingHorizontal: 16,
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
  devAction: {
    backgroundColor: "rgba(253,123,65,0.18)",
    borderWidth: 1,
    borderColor: "rgba(253,123,65,0.35)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  devActionText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "700",
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
    width: 68,
    height: 68,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(253,123,65,0.15)",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 18,
    overflow: "hidden",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
  },
  thumbWrap: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  imageFallback: {
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  speciesTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  visibilityPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  visibilityPillPublic: {
    backgroundColor: "rgba(34,197,94,0.2)",
    borderColor: "rgba(74,222,128,0.35)",
  },
  visibilityPillPrivate: {
    backgroundColor: "rgba(253,123,65,0.2)",
    borderColor: "rgba(253,123,65,0.35)",
  },
  visibilityPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  visibilityPillTextPublic: {
    color: "#4ade80",
  },
  visibilityPillTextPrivate: {
    color: COLORS.primary,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  lengthWeightRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  locationDateRow: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
  notesPreview: {
    marginTop: 5,
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 14,
  },
});
