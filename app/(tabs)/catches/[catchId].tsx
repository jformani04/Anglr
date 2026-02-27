import { COLORS } from "@/lib/colors";
import {
  CatchLog,
  deleteCatchLog,
  getCatchLogById,
  updateCatchLog,
} from "@/lib/catches";
import { supabase } from "@/lib/supabase";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { FRESHWATER_SPECIES, getSpeciesMatches } from "@/lib/freshwaterSpecies";

const DEBUG = process.env.EXPO_PUBLIC_DEBUG === "1";

type CatchLogForm = Omit<CatchLog, "id">;

const EMPTY_FORM: CatchLogForm = {
  imageUrl: "",
  species: "",
  length: "",
  weight: "",
  location: "",
  temperature: "",
  weather: "",
  lure: "",
  method: "",
  notes: "",
  isPublic: false,
  isFavorite: false,
  hideLocation: false,
  date: "",
};

export default function EditCatchScreen() {
  const { catchId } = useLocalSearchParams<{ catchId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [form, setForm] = useState<CatchLogForm>(EMPTY_FORM);
  const [speciesQuery, setSpeciesQuery] = useState("");
  const [showSpeciesMatches, setShowSpeciesMatches] = useState(false);
  const hasLoadedInitialData = useRef(false);
  const lastSavedSnapshot = useRef<string>("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) throw new Error("You must be signed in.");
        if (!catchId) throw new Error("Missing catch id.");

        if (DEBUG) console.log("[catches] current user id", user.id);

        const catchLog = await getCatchLogById(catchId, user.id);
        if (!catchLog) {
          throw new Error("Catch not found.");
        }

        const { id, ...rest } = catchLog;
        setForm(rest);
        setSpeciesQuery(rest.species);
        lastSavedSnapshot.current = JSON.stringify(rest);
        hasLoadedInitialData.current = true;
      } catch (err: any) {
        setError(err?.message ?? "Failed to load catch.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [catchId]);

  const setField = (field: keyof CatchLogForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value } as CatchLogForm));
  };

  const handleSave = async () => {
    if (!catchId) return;

    try {
      setSaving(true);
      setSaveStatus("saving");
      setError(null);

      await updateCatchLog({
        id: catchId,
        ...form,
      });

      lastSavedSnapshot.current = JSON.stringify(form);
      setSaveStatus("saved");
    } catch (err: any) {
      setSaveStatus("error");
      setError(err?.message ?? "Unable to update catch.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!catchId || loading || !hasLoadedInitialData.current) return;
    if (deleting) return;

    const snapshot = JSON.stringify(form);
    if (snapshot === lastSavedSnapshot.current) return;

    const timer = setTimeout(() => {
      handleSave();
    }, 700);

    return () => clearTimeout(timer);
  }, [form, catchId, loading, deleting]);

  const confirmDelete = () => {
    Alert.alert("Delete Catch", "This will permanently delete this catch log.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!catchId) return;
          try {
            setDeleting(true);
            await deleteCatchLog(catchId);
            Alert.alert("Deleted", "Catch log deleted.");
            router.replace("/catches");
          } catch (err: any) {
            Alert.alert("Delete Failed", err?.message ?? "Unable to delete catch.");
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const speciesMatches = getSpeciesMatches(speciesQuery);
  const hasExactSpeciesSelection = FRESHWATER_SPECIES.some(
    (species) => species.toLowerCase() === speciesQuery.trim().toLowerCase()
  );

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.centerText}>Loading catch...</Text>
      </View>
    );
  }

  if (error && !form.species && !form.location && !form.date) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.errorTitle}>Could not open catch</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconButton}>
            <ArrowLeft color={COLORS.text} size={20} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>Edit Catch</Text>
            <Text style={styles.subtitle}>Update your log entry</Text>
          </View>
        </View>

        {form.imageUrl ? (
          <Image source={{ uri: form.imageUrl }} style={styles.heroImage} />
        ) : (
          <View style={[styles.heroImage, styles.heroPlaceholder]}>
            <Text style={styles.heroPlaceholderText}>No image</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Image URL</Text>
          <TextInput
            style={styles.input}
            placeholder="https://..."
            placeholderTextColor={COLORS.textSecondary}
            value={form.imageUrl}
            onChangeText={(v) => setField("imageUrl", v)}
            autoCapitalize="none"
          />

          <Text style={styles.sectionLabel}>Species</Text>
          <TextInput
            style={styles.input}
            placeholder="Search species"
            placeholderTextColor={COLORS.textSecondary}
            value={speciesQuery}
            onChangeText={(v) => {
              setSpeciesQuery(v);
              setShowSpeciesMatches(true);

              const exactMatch = FRESHWATER_SPECIES.find(
                (species) => species.toLowerCase() === v.trim().toLowerCase()
              );
              if (exactMatch) {
                setField("species", exactMatch);
              }
            }}
            onFocus={() => setShowSpeciesMatches(true)}
            onBlur={() => {
              setTimeout(() => {
                setShowSpeciesMatches(false);
                if (!hasExactSpeciesSelection) {
                  setSpeciesQuery(form.species);
                }
              }, 120);
            }}
          />
          {showSpeciesMatches && (
            <View style={styles.speciesOptions}>
              {speciesMatches.map((species) => (
                <Pressable
                  key={species}
                  onPress={() => {
                    setField("species", species);
                    setSpeciesQuery(species);
                    setShowSpeciesMatches(false);
                  }}
                  style={styles.speciesOption}
                >
                  <Text style={styles.speciesOptionText}>{species}</Text>
                </Pressable>
              ))}
              {speciesMatches.length === 0 && (
                <Text style={styles.speciesHint}>
                  No matches. Keep typing to find a valid species.
                </Text>
              )}
            </View>
          )}
          {!hasExactSpeciesSelection && speciesQuery.trim().length > 0 && (
            <Text style={styles.inlineError}>
              Please select a species from the dropdown options.
            </Text>
          )}

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.sectionLabel}>Length</Text>
              <TextInput
                style={styles.input}
                placeholder="45 cm"
                placeholderTextColor={COLORS.textSecondary}
                value={form.length}
                onChangeText={(v) => setField("length", v)}
              />
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.sectionLabel}>Weight</Text>
              <TextInput
                style={styles.input}
                placeholder="2.3 kg"
                placeholderTextColor={COLORS.textSecondary}
                value={form.weight}
                onChangeText={(v) => setField("weight", v)}
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Location</Text>
          <TextInput
            style={styles.input}
            placeholder="Fishing spot"
            placeholderTextColor={COLORS.textSecondary}
            value={form.location}
            onChangeText={(v) => setField("location", v)}
          />

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.sectionLabel}>Temperature</Text>
              <TextInput
                style={styles.input}
                placeholder="22C"
                placeholderTextColor={COLORS.textSecondary}
                value={form.temperature}
                onChangeText={(v) => setField("temperature", v)}
              />
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.sectionLabel}>Weather</Text>
              <TextInput
                style={styles.input}
                placeholder="Sunny"
                placeholderTextColor={COLORS.textSecondary}
                value={form.weather}
                onChangeText={(v) => setField("weather", v)}
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Lure</Text>
          <TextInput
            style={styles.input}
            placeholder="Lure / bait"
            placeholderTextColor={COLORS.textSecondary}
            value={form.lure}
            onChangeText={(v) => setField("lure", v)}
          />

          <Text style={styles.sectionLabel}>Method</Text>
          <TextInput
            style={styles.input}
            placeholder="Spin, Fly, Troll..."
            placeholderTextColor={COLORS.textSecondary}
            value={form.method}
            onChangeText={(v) => setField("method", v)}
          />

          <Text style={styles.sectionLabel}>Date</Text>
          <TextInput
            style={styles.input}
            placeholder="Feb 24, 2026"
            placeholderTextColor={COLORS.textSecondary}
            value={form.date}
            onChangeText={(v) => setField("date", v)}
          />

          <Text style={styles.sectionLabel}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="Observations..."
            placeholderTextColor={COLORS.textSecondary}
            value={form.notes}
            onChangeText={(v) => setField("notes", v)}
            multiline
            textAlignVertical="top"
          />

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleTitle}>
                {form.isPublic ? "Public" : "Private"}
              </Text>
              <Text style={styles.toggleSubtitle}>
                Private catches are only visible to you
              </Text>
            </View>
            <Switch
              value={form.isPublic}
              onValueChange={(v) => setField("isPublic", v)}
              trackColor={{
                false: "rgba(221,220,219,0.2)",
                true: COLORS.primary,
              }}
              thumbColor={COLORS.text}
            />
          </View>

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleTitle}>
                {form.hideLocation ? "Hide Location" : "Show Location"}
              </Text>
              <Text style={styles.toggleSubtitle}>
                Hide this catch location from other users when shared
              </Text>
            </View>
            <Switch
              value={form.hideLocation}
              onValueChange={(v) => setField("hideLocation", v)}
              trackColor={{
                false: "rgba(221,220,219,0.2)",
                true: COLORS.primary,
              }}
              thumbColor={COLORS.text}
            />
          </View>

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleTitle}>
                {form.isFavorite ? "Favorited" : "Add to Favorites"}
              </Text>
              <Text style={styles.toggleSubtitle}>
                Favorited catches appear on the Favorites page
              </Text>
            </View>
            <Switch
              value={form.isFavorite}
              onValueChange={(v) => setField("isFavorite", v)}
              trackColor={{
                false: "rgba(221,220,219,0.2)",
                true: COLORS.primary,
              }}
              thumbColor={COLORS.text}
            />
          </View>

          {!!error && <Text style={styles.inlineError}>{error}</Text>}

          <Text style={styles.saveStatusText}>
            {deleting
              ? "Deleting..."
              : saveStatus === "saving"
                ? "Saving changes..."
                : saveStatus === "saved"
                  ? "All changes saved"
                  : saveStatus === "error"
                    ? "Autosave failed"
                    : "Changes save automatically"}
          </Text>

          <Pressable
            style={[styles.deleteButton, deleting && { opacity: 0.7 }]}
            onPress={confirmDelete}
            disabled={deleting || saving}
          >
            <Text style={styles.deleteButtonText}>
              {deleting ? "Deleting..." : "Delete Catch"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(221,220,219,0.1)",
    borderWidth: 1,
    borderColor: "rgba(221,220,219,0.2)",
  },
  headerTextWrap: { flex: 1 },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  heroImage: {
    width: "100%",
    height: 220,
    borderRadius: 24,
    marginBottom: 14,
    backgroundColor: "rgba(221,220,219,0.08)",
  },
  heroPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  heroPlaceholderText: {
    color: COLORS.textSecondary,
  },
  card: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  sectionLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    color: COLORS.text,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  speciesOptions: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.2)",
    overflow: "hidden",
  },
  speciesOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  speciesOptionText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "500",
  },
  speciesHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  notesInput: {
    minHeight: 100,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  rowItem: {
    flex: 1,
  },
  toggleRow: {
    marginTop: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  toggleSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 3,
    maxWidth: 220,
  },
  inlineError: {
    color: "#ffb4b4",
    fontSize: 12,
    marginBottom: 8,
  },
  saveStatusText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginBottom: 8,
  },
  primaryButton: {
    marginTop: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
  },
  deleteButton: {
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,120,120,0.35)",
  },
  deleteButtonText: {
    color: "#ffb4b4",
    fontSize: 14,
    fontWeight: "700",
  },
  centerScreen: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  centerText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
  },
  errorTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },
  errorText: {
    color: COLORS.textSecondary,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
  },
});
