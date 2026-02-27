import { COLORS } from "@/lib/colors";
import { createCatchLog } from "@/lib/catches";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Check,
  Cloud,
  Droplets,
  Fish as FishIcon,
  MapPin,
} from "lucide-react-native";
import { useState } from "react";
import { useEffect } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const METHODS = [
  { label: "Fly Fishing", value: "Fly" },
  { label: "Spin Fishing", value: "Spin" },
  { label: "Jigging", value: "Jig" },
  { label: "Trolling", value: "Troll" },
  { label: "Bait Fishing", value: "Bait" },
];

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80";

export default function LogEntry() {
  const { imageUri, draftId } = useLocalSearchParams<{ imageUri?: string; draftId?: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isCompact = width < 400;

  const [selectedSpecies, setSelectedSpecies] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [hideLocation, setHideLocation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    species: "",
    length: "",
    weight: "",
    location: "",
    temperature: "",
    weather: "",
    lure: "",
    method: "Fly",
    notes: "",
  });

  useEffect(() => {
    // Always start a fresh log when a new scan/photo opens this route.
    setSelectedSpecies("");
    setIsPublic(true);
    setHideLocation(false);
    setFormData({
      species: "",
      length: "",
      weight: "",
      location: "",
      temperature: "",
      weather: "",
      lure: "",
      method: "Fly",
      notes: "",
    });
  }, [imageUri, draftId]);

  const speciesPredictions = [
    { name: "Largemouth Bass", confidence: 92 },
    { name: "Smallmouth Bass", confidence: 78 },
    { name: "Spotted Bass", confidence: 64 },
  ];

  const handleSpeciesSelect = (speciesName: string) => {
    setSelectedSpecies(speciesName);
    setFormData((prev) => ({ ...prev, species: speciesName }));
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === "species") {
      setSelectedSpecies(value);
    }
  };

  const handleSubmit = async () => {
    try {
      setSaving(true);

      const date = new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      await createCatchLog({
        imageUrl: imageUri ?? "",
        species: formData.species,
        length: formData.length,
        weight: formData.weight,
        location: formData.location,
        temperature: formData.temperature,
        weather: formData.weather,
        lure: formData.lure,
        method: formData.method,
        notes: formData.notes,
        isPublic,
        isFavorite: false,
        hideLocation,
        date,
      });

      Alert.alert("Catch Logged", "Your catch was saved.", [
        { text: "View Catches", onPress: () => router.replace("/catches") },
      ]);
    } catch (err: any) {
      Alert.alert("Save Failed", err?.message ?? "Unable to save catch.");
    } finally {
      setSaving(false);
    }
  };

  const headerSource = imageUri
    ? { uri: imageUri }
    : { uri: PLACEHOLDER_IMAGE };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header Image */}
        <View style={styles.headerContainer}>
          <Image source={headerSource} style={styles.headerImage} />
          <View style={styles.gradientOverlay} />

          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.overlayButton, styles.backButton, { top: insets.top + 12 }]}
          >
            <ArrowLeft color={COLORS.text} strokeWidth={2.5} size={20} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={saving}
            style={[
              styles.doneButton,
              { top: insets.top + 12 },
              saving && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.doneButtonText}>{saving ? "Saving..." : "Done"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {/* Species Prediction */}
          <View style={styles.bubble}>
            <Text style={styles.sectionHeader}>Species Guess</Text>

            {speciesPredictions.map((prediction) => (
              <TouchableOpacity
                key={prediction.name}
                onPress={() => handleSpeciesSelect(prediction.name)}
                style={[
                  styles.predictionButton,
                  selectedSpecies === prediction.name &&
                    styles.predictionSelected,
                ]}
              >
                <View style={styles.predictionLeft}>
                  <View style={styles.predictionIcon}>
                    <FishIcon
                      color={COLORS.primary}
                      strokeWidth={2}
                      size={20}
                    />
                  </View>
                  <Text style={styles.predictionText}>{prediction.name}</Text>
                </View>
                <View style={styles.predictionRight}>
                  <Text style={styles.predictionConfidence}>
                    {prediction.confidence}%
                  </Text>
                  {selectedSpecies === prediction.name && (
                    <Check color={COLORS.primary} strokeWidth={2} size={20} />
                  )}
                </View>
              </TouchableOpacity>
            ))}

            <TextInput
              placeholder="Or enter species manually..."
              placeholderTextColor={COLORS.textSecondary}
              value={formData.species}
              onChangeText={(text) => handleInputChange("species", text)}
              style={styles.textInput}
            />
          </View>

          {/* Catch Details */}
          <Text style={styles.sectionLabel}>Catch Details</Text>

          {/* Length & Weight */}
          <View style={[styles.row, isCompact && styles.rowStacked]}>
            <View
              style={[styles.bubbleHalf, isCompact && styles.bubbleFullWidth]}
            >
              <Text style={styles.label}>Length</Text>
              <TextInput
                placeholder="cm / in"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="numeric"
                value={formData.length}
                onChangeText={(text) => handleInputChange("length", text)}
                style={styles.textInputInline}
              />
            </View>
            <View
              style={[styles.bubbleHalf, isCompact && styles.bubbleFullWidth]}
            >
              <Text style={styles.label}>Weight</Text>
              <TextInput
                placeholder="kg / lbs"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="numeric"
                value={formData.weight}
                onChangeText={(text) => handleInputChange("weight", text)}
                style={styles.textInputInline}
              />
            </View>
          </View>

          {/* Location */}
          <View style={styles.bubble}>
            <View style={styles.rowInline}>
              <MapPin color={COLORS.primary} strokeWidth={2} size={18} />
              <Text style={styles.label}>Location</Text>
            </View>
            <TextInput
              placeholder="Enter fishing spot..."
              placeholderTextColor={COLORS.textSecondary}
              value={formData.location}
              onChangeText={(text) => handleInputChange("location", text)}
              style={styles.textInput}
            />
          </View>

          {/* Temperature & Weather */}
          <View style={[styles.row, isCompact && styles.rowStacked]}>
            <View
              style={[styles.bubbleHalf, isCompact && styles.bubbleFullWidth]}
            >
              <View style={styles.rowInline}>
                <Droplets color={COLORS.primary} strokeWidth={2} size={16} />
                <Text style={styles.label}>Temp</Text>
              </View>
              <TextInput
                placeholder="°C / °F"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="numeric"
                value={formData.temperature}
                onChangeText={(text) =>
                  handleInputChange("temperature", text)
                }
                style={styles.textInputInline}
              />
            </View>
            <View
              style={[styles.bubbleHalf, isCompact && styles.bubbleFullWidth]}
            >
              <View style={styles.rowInline}>
                <Cloud color={COLORS.primary} strokeWidth={2} size={16} />
                <Text style={styles.label}>Weather</Text>
              </View>
              <TextInput
                placeholder="Sunny..."
                placeholderTextColor={COLORS.textSecondary}
                value={formData.weather}
                onChangeText={(text) => handleInputChange("weather", text)}
                style={styles.textInputInline}
              />
            </View>
          </View>

          {/* Lure / Bait */}
          <View style={styles.bubble}>
            <Text style={styles.label}>Lure / Bait</Text>
            <TextInput
              placeholder="What did you use?"
              placeholderTextColor={COLORS.textSecondary}
              value={formData.lure}
              onChangeText={(text) => handleInputChange("lure", text)}
              style={styles.textInput}
            />
          </View>

          {/* Method — pill selector */}
          <View style={styles.bubble}>
            <Text style={styles.label}>Method</Text>
            <View style={styles.methodRow}>
              {METHODS.map((m) => (
                <TouchableOpacity
                  key={m.value}
                  onPress={() => handleInputChange("method", m.value)}
                  style={[
                    styles.methodPill,
                    formData.method === m.value && styles.methodPillSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.methodPillText,
                      formData.method === m.value &&
                        styles.methodPillTextSelected,
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Notes */}
          <View style={styles.bubble}>
            <Text style={styles.label}>Notes / Observations</Text>
            <TextInput
              placeholder="Record your experience..."
              placeholderTextColor={COLORS.textSecondary}
              value={formData.notes}
              onChangeText={(text) => handleInputChange("notes", text)}
              multiline
              style={[styles.textInput, styles.notesInput]}
            />
          </View>

          {/* Privacy Toggle */}
          <View style={styles.bubble}>
            <View style={styles.rowInlineSpace}>
              <View style={styles.privacyText}>
                <Text style={styles.privacyLabel}>
                  {isPublic ? "Public" : "Private"}
                </Text>
                <Text style={styles.smallText}>
                  Private catches are hidden to protect your spots
                </Text>
              </View>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                trackColor={{
                  false: "rgba(221,220,219,0.2)",
                  true: COLORS.primary,
                }}
                thumbColor={COLORS.text}
              />
            </View>
          </View>

          <View style={styles.bubble}>
            <View style={styles.rowInlineSpace}>
              <View style={styles.privacyText}>
                <Text style={styles.privacyLabel}>
                  {hideLocation ? "Hide Location" : "Show Location"}
                </Text>
                <Text style={styles.smallText}>
                  Hide this catch location from other users when shared
                </Text>
              </View>
              <Switch
                value={hideLocation}
                onValueChange={setHideLocation}
                trackColor={{
                  false: "rgba(221,220,219,0.2)",
                  true: COLORS.primary,
                }}
                thumbColor={COLORS.text}
              />
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitButton, saving && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={saving}
          >
            <Text style={styles.submitText}>{saving ? "Saving..." : "Log Catch"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  /* ── Header ────────────────────────────────────── */
  headerContainer: {
    height: 260,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: "hidden",
    marginBottom: 16,
  },
  headerImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  overlayButton: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 10,
    borderRadius: 999,
  },
  backButton: {
    left: 16,
  },
  editButton: {
    right: 16,
  },
  doneButton: {
    position: "absolute",
    right: 16,
    backgroundColor: "rgba(253,123,65,0.95)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  doneButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },

  /* ── Content ───────────────────────────────────── */
  content: {
    paddingHorizontal: 16,
  },

  /* ── Bubbles ───────────────────────────────────── */
  bubble: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  bubbleHalf: {
    flex: 1,
    backgroundColor: "rgba(221,220,219,0.08)",
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  bubbleFullWidth: {
    flex: undefined,
    width: "100%",
  },

  /* ── Typography ────────────────────────────────── */
  sectionHeader: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  smallText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  /* ── Inputs ────────────────────────────────────── */
  textInput: {
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: "transparent",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  textInputInline: {
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: "transparent",
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  notesInput: {
    height: 100,
    textAlignVertical: "top",
  },

  /* ── Layout helpers ────────────────────────────── */
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  rowStacked: {
    flexDirection: "column",
  },
  rowInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  rowInlineSpace: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  /* ── Species predictions ───────────────────────── */
  predictionButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 20,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  predictionSelected: {
    backgroundColor: "rgba(253,123,65,0.2)",
    borderColor: COLORS.primary,
  },
  predictionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  predictionIcon: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: "rgba(253,123,65,0.2)",
  },
  predictionText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "500",
  },
  predictionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  predictionConfidence: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "600",
  },

  /* ── Method pills ──────────────────────────────── */
  methodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  methodPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(221,220,219,0.08)",
  },
  methodPillSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  methodPillText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  methodPillTextSelected: {
    color: COLORS.text,
  },

  /* ── Privacy ───────────────────────────────────── */
  privacyText: {
    flex: 1,
    marginRight: 12,
  },
  privacyLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 2,
  },

  /* ── Submit ────────────────────────────────────── */
  submitButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 30,
    marginTop: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "white",
  },
  submitText: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 16,
    letterSpacing: 0.5,
  },
});
