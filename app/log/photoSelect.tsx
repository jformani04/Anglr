import { COLORS } from "@/lib/colors";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { ArrowLeft, Camera, Image as ImageIcon } from "lucide-react-native";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

async function requestPermissions(needCamera: boolean) {
  if (needCamera) {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.status !== "granted") {
      Alert.alert("Permission Required", "Camera access is required to take a photo.");
      return false;
    }
  }
  const media = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (media.status !== "granted") {
    Alert.alert("Permission Required", "Photo library access is required.");
    return false;
  }
  return true;
}

function navigateToReview(uri: string) {
  router.push({ pathname: "/log/imageReview", params: { imageUri: uri } });
}

async function handleTakePhoto() {
  if (!(await requestPermissions(true))) return;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.9,
  });
  if (!result.canceled) navigateToReview(result.assets[0].uri);
}

async function handleChooseFromLibrary() {
  if (!(await requestPermissions(false))) return;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.9,
  });
  if (!result.canceled) navigateToReview(result.assets[0].uri);
}

export default function PhotoSelectScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      {/* Back button */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.backButton, { top: insets.top + 8 }]}
      >
        <ArrowLeft color={COLORS.text} size={20} strokeWidth={2.4} />
      </Pressable>

      {/* Title block */}
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Add a Catch</Text>
        <Text style={styles.subtitle}>
          Take a photo or choose from your library
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.buttonStack}>
        <Pressable style={styles.actionButton} onPress={handleTakePhoto}>
          <View style={styles.iconWrap}>
            <Camera color={COLORS.text} size={28} strokeWidth={2} />
          </View>
          <View style={styles.buttonText}>
            <Text style={styles.buttonLabel}>Take Photo</Text>
            <Text style={styles.buttonSub}>Open your camera</Text>
          </View>
        </Pressable>

        <Pressable style={styles.actionButton} onPress={handleChooseFromLibrary}>
          <View style={styles.iconWrap}>
            <ImageIcon color={COLORS.text} size={28} strokeWidth={2} />
          </View>
          <View style={styles.buttonText}>
            <Text style={styles.buttonLabel}>Choose from Library</Text>
            <Text style={styles.buttonSub}>Pick an existing photo</Text>
          </View>
        </Pressable>
      </View>

      {/* Skip — log without photo */}
      <Pressable
        style={styles.skipButton}
        onPress={() =>
          router.push({ pathname: "/catches/[catchId]", params: { catchId: "new" } })
        }
      >
        <Text style={styles.skipText}>Log without a photo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    justifyContent: "center",
    gap: 32,
  },

  /* ── Title ───────────────────────────────────── */
  titleBlock: {
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },

  /* ── Buttons ─────────────────────────────────── */
  buttonStack: {
    gap: 14,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    backgroundColor: COLORS.primary,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    // shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    flex: 1,
    gap: 3,
  },
  buttonLabel: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
  },
  buttonSub: {
    color: "rgba(221,220,219,0.75)",
    fontSize: 13,
  },

  /* ── Back button ─────────────────────────────── */
  backButton: {
    position: "absolute",
    left: 16,
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    zIndex: 10,
  },

  /* ── Skip ────────────────────────────────────── */
  skipButton: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: "rgba(221,220,219,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  skipText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
});
