import { COLORS } from "@/lib/colors";
import SpeciesGuideLink from "@/components/SpeciesGuideLink";
import { getPublicCatchById, PublicCatchDetail } from "@/lib/friends";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Calendar, MapPin, Ruler, Thermometer, Weight } from "lucide-react-native";
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

const VIEW_CATCHES_ICON = require("@/assets/images/viewCatches.png");

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value?.trim()) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBubble}>{children}</View>
    </View>
  );
}

export default function FriendCatchDetailScreen() {
  const insets = useSafeAreaInsets();
  const { catchId } = useLocalSearchParams<{ catchId: string }>();
  const [catchLog, setCatchLog] = useState<PublicCatchDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!catchId) return;
    const load = async () => {
      try {
        const data = await getPublicCatchById(catchId);
        if (!data) {
          Alert.alert("Not Found", "This catch is no longer available.");
          router.back();
          return;
        }
        setCatchLog(data);
      } catch (err: any) {
        Alert.alert("Error", err?.message ?? "Unable to load catch.");
        router.back();
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [catchId]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!catchLog) return null;

  const hasConditions = !!(catchLog.temperature?.trim() || catchLog.weather?.trim());
  const hasTackle = !!(catchLog.lure?.trim() || catchLog.method?.trim());
  const hasNotes = !!catchLog.notes?.trim();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color={COLORS.text} size={20} strokeWidth={2.5} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {catchLog.species || "Unknown Species"}
        </Text>
      </View>

      {/* Photo */}
      <View style={styles.imageWrapper}>
        {catchLog.imageUrl ? (
          <Image
            source={{ uri: catchLog.imageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.image, styles.imageFallback]}>
            <Image source={VIEW_CATCHES_ICON} style={styles.fallbackIcon} />
            <Text style={styles.fallbackText}>No photo</Text>
          </View>
        )}
      </View>

      <SpeciesGuideLink speciesName={catchLog.species} />

      {/* Measurements */}
      <Section title="Measurements">
        <View style={styles.measureRow}>
          <View style={styles.measureItem}>
            <Ruler color={COLORS.primary} size={18} strokeWidth={2} />
            <Text style={styles.measureLabel}>Length</Text>
            <Text style={styles.measureValue}>{catchLog.length || "—"}</Text>
          </View>
          <View style={styles.measureDivider} />
          <View style={styles.measureItem}>
            <Weight color={COLORS.primary} size={18} strokeWidth={2} />
            <Text style={styles.measureLabel}>Weight</Text>
            <Text style={styles.measureValue}>{catchLog.weight || "—"}</Text>
          </View>
        </View>
      </Section>

      {/* Location & Date */}
      <Section title="Location & Date">
        <View style={styles.iconRow}>
          <MapPin color={COLORS.primary} size={16} strokeWidth={2} />
          <Text style={styles.iconRowText}>{catchLog.location || "Unknown location"}</Text>
        </View>
        {!!catchLog.date && (
          <View style={[styles.iconRow, { marginTop: 10 }]}>
            <Calendar color={COLORS.primary} size={16} strokeWidth={2} />
            <Text style={styles.iconRowText}>{catchLog.date}</Text>
          </View>
        )}
      </Section>

      {/* Conditions */}
      {hasConditions && (
        <Section title="Conditions">
          <DetailRow label="Temperature" value={catchLog.temperature} />
          <DetailRow label="Weather" value={catchLog.weather} />
        </Section>
      )}

      {/* Tackle */}
      {hasTackle && (
        <Section title="Tackle">
          <DetailRow label="Lure" value={catchLog.lure} />
          <DetailRow label="Method" value={catchLog.method} />
        </Section>
      )}

      {/* Notes */}
      {hasNotes && (
        <Section title="Notes">
          <Text style={styles.notesText}>{catchLog.notes}</Text>
        </Section>
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
    marginBottom: 4,
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
    flex: 1,
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "700",
  },
  imageWrapper: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(253,123,65,0.25)",
  },
  image: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  imageFallback: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  fallbackIcon: {
    width: 48,
    height: 48,
    resizeMode: "contain",
    opacity: 0.5,
  },
  fallbackText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  sectionBubble: {
    backgroundColor: "rgba(0,0,0,0.12)",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  measureRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  measureItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  measureDivider: {
    width: 1,
    height: 44,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  measureLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  measureValue: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconRowText: {
    color: COLORS.text,
    fontSize: 14,
    flex: 1,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  detailLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  detailValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  notesText: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
  },
});
