import { COLORS } from "@/lib/colors";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Camera, Check } from "lucide-react-native";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ImageReviewScreen() {
  const { imageUri } = useLocalSearchParams<{ imageUri: string }>();
  const insets = useSafeAreaInsets();

  const handleDone = () => {
    router.replace({
      pathname: "/catches/[catchId]",
      params: { catchId: "new", imageUri },
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <ArrowLeft color={COLORS.text} size={20} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.title}>Review Photo</Text>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Camera color={COLORS.textSecondary} size={18} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Image */}
      <View style={styles.imageWrapper}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.placeholderText}>No image</Text>
          </View>
        )}
      </View>

      {/* Done button */}
      <View style={styles.footer}>
        <Pressable style={styles.doneButton} onPress={handleDone}>
          <Check color="#fff" size={20} strokeWidth={2.6} />
          <Text style={styles.doneText}>Use This Photo</Text>
        </Pressable>
        <Pressable style={styles.retakeButton} onPress={() => router.back()}>
          <Text style={styles.retakeText}>Retake</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1C1E",
    paddingHorizontal: 20,
  },

  /* ── Top bar ─────────────────────────────────── */
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  /* ── Image ───────────────────────────────────── */
  imageWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
  },
  image: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 24,
    backgroundColor: "rgba(221,220,219,0.08)",
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 14,
    // Orange accent border
    borderWidth: 2,
    borderColor: "rgba(253,123,65,0.35)",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },

  /* ── Footer ──────────────────────────────────── */
  footer: {
    gap: 12,
    paddingBottom: 8,
  },
  doneButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  doneText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  retakeButton: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  retakeText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
});
