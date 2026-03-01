import { COLORS } from "@/lib/colors";
import {
  CatchLog,
  deleteCatchLog,
  getCatchLogById,
  updateCatchLog,
} from "@/lib/catches";
import { supabase } from "@/lib/supabase";
import { getProfile, LengthUnit, TempUnit, WeightUnit } from "@/lib/profile";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ArrowLeft, Camera, ChevronDown } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
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
const LENGTH_UNITS: LengthUnit[] = ["cm", "in"];
const WEIGHT_UNITS: WeightUnit[] = ["kg", "lbs"];
const TEMPERATURE_UNITS = ["c", "f"] as const;
type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];
const TEMPERATURE_UNIT_LABELS: Record<TemperatureUnit, string> = {
  c: "Celsius",
  f: "Fahrenheit",
};

const WEATHER_OPTIONS = [
  "Sunny",
  "Partly Cloudy",
  "Cloudy",
  "Overcast",
  "Rain",
  "Light Rain",
  "Heavy Rain",
  "Thunderstorms",
  "Fog",
  "Windy",
  "Snow",
  "Hail",
];

const LURE_OPTIONS = [
  "Plastic Worm",
  "Crankbait",
  "Jerkbait",
  "Spinnerbait",
  "Swimbait",
  "Topwater Frog",
  "Buzzbait",
  "Jig",
  "Spoon",
  "Live Minnow",
  "Live Worm",
  "Fly",
];

const METHOD_OPTIONS = ["Fly", "Spin", "Jig", "Troll", "Bait", "Bottom"];

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

function parseMeasurement<T extends string>(
  rawValue: string,
  validUnits: readonly T[],
  fallbackUnit: T
): { value: string; unit: T } {
  const trimmed = rawValue.trim();
  if (!trimmed) return { value: "", unit: fallbackUnit };

  const match = trimmed.match(/^(.*?)\s*([a-zA-Z]+)$/);
  if (!match) return { value: trimmed, unit: fallbackUnit };

  const unitCandidate = match[2].toLowerCase() as T;
  if (!validUnits.includes(unitCandidate)) {
    return { value: trimmed, unit: fallbackUnit };
  }

  return {
    value: match[1].trim(),
    unit: unitCandidate,
  };
}

function formatMeasurement(value: string, unit: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `${trimmed} ${unit}`;
}

function toTemperatureUnit(tempUnit: TempUnit): TemperatureUnit {
  return tempUnit === "fahrenheit" ? "f" : "c";
}

function parseTemperature(rawValue: string, fallbackUnit: TemperatureUnit) {
  const trimmed = rawValue.trim();
  if (!trimmed) return { value: "", unit: fallbackUnit };

  const match = trimmed.match(/^(.*?)\s*(°?\s*[cCfF]|celsius|fahrenheit)$/i);
  if (!match) return { value: trimmed, unit: fallbackUnit };

  const unitToken = match[2].toLowerCase().replace(/\s|°/g, "");
  const unit: TemperatureUnit =
    unitToken === "f" || unitToken === "fahrenheit" ? "f" : "c";

  return {
    value: match[1].trim(),
    unit,
  };
}

function getMatches(query: string, options: string[]) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options.slice(0, 8);
  return options
    .filter((option) => option.toLowerCase().includes(normalized))
    .slice(0, 8);
}

function formatCurrentDate() {
  return new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrentTime() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function splitDateTime(raw: string): { datePart: string; timePart: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { datePart: formatCurrentDate(), timePart: formatCurrentTime() };
  }

  const match = trimmed.match(/^(.*?)(?:\s+at\s+|\s+)(\d{1,2}:\d{2}\s?(?:AM|PM))$/i);
  if (!match) {
    return { datePart: trimmed, timePart: formatCurrentTime() };
  }

  return {
    datePart: match[1].trim() || formatCurrentDate(),
    timePart: match[2].trim().toUpperCase(),
  };
}

function joinDateTime(datePart: string, timePart: string) {
  const dateValue = datePart.trim();
  const timeValue = timePart.trim().toUpperCase();
  if (!dateValue) return "";
  if (!timeValue) return dateValue;
  return `${dateValue} ${timeValue}`;
}

function buildSavePayload(
  baseForm: CatchLogForm,
  lengthUnit: LengthUnit,
  weightUnit: WeightUnit,
  temperatureUnit: TemperatureUnit
): CatchLogForm {
  return {
    ...baseForm,
    length: formatMeasurement(baseForm.length, lengthUnit),
    weight: formatMeasurement(baseForm.weight, weightUnit),
    temperature: formatMeasurement(baseForm.temperature, temperatureUnit.toUpperCase()),
  };
}

export default function EditCatchScreen() {
  const { catchId } = useLocalSearchParams<{ catchId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [form, setForm] = useState<CatchLogForm>(EMPTY_FORM);
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>("cm");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg");
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>("c");
  const [openUnitMenu, setOpenUnitMenu] = useState<
    "length" | "weight" | "temperature" | null
  >(null);
  const [speciesQuery, setSpeciesQuery] = useState("");
  const [showSpeciesMatches, setShowSpeciesMatches] = useState(false);
  const [weatherQuery, setWeatherQuery] = useState("");
  const [showWeatherMatches, setShowWeatherMatches] = useState(false);
  const [lureQuery, setLureQuery] = useState("");
  const [showLureMatches, setShowLureMatches] = useState(false);
  const [methodQuery, setMethodQuery] = useState("");
  const [showMethodMatches, setShowMethodMatches] = useState(false);
  const [timeValue, setTimeValue] = useState(formatCurrentTime());
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

        const [catchLog, profile] = await Promise.all([
          getCatchLogById(catchId, user.id),
          getProfile(),
        ]);
        if (!catchLog) {
          throw new Error("Catch not found.");
        }

        const parsedLength = parseMeasurement(
          catchLog.length,
          LENGTH_UNITS,
          profile.unitsLength
        );
        const parsedWeight = parseMeasurement(
          catchLog.weight,
          WEIGHT_UNITS,
          profile.unitsWeight
        );

        setLengthUnit(parsedLength.unit);
        setWeightUnit(parsedWeight.unit);

        const parsedTemperature = parseTemperature(
          catchLog.temperature,
          toTemperatureUnit(profile.unitsTemp)
        );
        setTemperatureUnit(parsedTemperature.unit);

        const { id, ...rest } = catchLog;
        const parsedDateTime = splitDateTime(rest.date);
        const hydratedForm = {
          ...rest,
          length: parsedLength.value,
          weight: parsedWeight.value,
          temperature: parsedTemperature.value,
          date: parsedDateTime.datePart,
        };

        setForm(hydratedForm);
        setTimeValue(parsedDateTime.timePart);
        setSpeciesQuery(rest.species);
        setWeatherQuery(hydratedForm.weather);
        setLureQuery(hydratedForm.lure);
        setMethodQuery(hydratedForm.method);
        lastSavedSnapshot.current = JSON.stringify({
          ...hydratedForm,
          lengthUnit: parsedLength.unit,
          weightUnit: parsedWeight.unit,
          temperatureUnit: parsedTemperature.unit,
        });
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

  const handleSave = useCallback(async () => {
    if (!catchId) return;

    try {
      setSaving(true);
      setSaveStatus("saving");
      setError(null);

      const payload = buildSavePayload(form, lengthUnit, weightUnit, temperatureUnit);
      await updateCatchLog({
        id: catchId,
        ...payload,
        date: joinDateTime(payload.date, timeValue),
      });

      lastSavedSnapshot.current = JSON.stringify({
        ...payload,
        date: joinDateTime(payload.date, timeValue),
        lengthUnit,
        weightUnit,
        temperatureUnit,
        timeValue,
      });
      setSaveStatus("saved");
    } catch (err: any) {
      setSaveStatus("error");
      setError(err?.message ?? "Unable to update catch.");
    } finally {
      setSaving(false);
    }
  }, [catchId, form, lengthUnit, weightUnit, temperatureUnit, timeValue]);

  useEffect(() => {
    if (!catchId || loading || !hasLoadedInitialData.current) return;
    if (deleting) return;

    const payload = buildSavePayload(form, lengthUnit, weightUnit, temperatureUnit);
    const snapshot = JSON.stringify({
      ...payload,
      date: joinDateTime(payload.date, timeValue),
      lengthUnit,
      weightUnit,
      temperatureUnit,
      timeValue,
    });
    if (snapshot === lastSavedSnapshot.current) return;

    const timer = setTimeout(() => {
      handleSave();
    }, 700);

    return () => clearTimeout(timer);
  }, [form, lengthUnit, weightUnit, temperatureUnit, timeValue, catchId, loading, deleting, handleSave]);

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

  const handleChooseFromCameraRoll = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permission Required", "Photo library access is required.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setUploadingImage(true);
      setField("imageUrl", result.assets[0].uri);
    } catch (err: any) {
      Alert.alert("Image Error", err?.message ?? "Unable to select image.");
    } finally {
      setUploadingImage(false);
    }
  };

  const speciesMatches = getSpeciesMatches(speciesQuery);
  const weatherMatches = getMatches(weatherQuery, WEATHER_OPTIONS);
  const lureMatches = getMatches(lureQuery, LURE_OPTIONS);
  const methodMatches = getMatches(methodQuery, METHOD_OPTIONS);
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
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle}>Catch Details</Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>
                {deleting
                  ? "Deleting..."
                  : saveStatus === "saving"
                    ? "Saving..."
                    : saveStatus === "saved"
                      ? "Saved"
                      : saveStatus === "error"
                        ? "Save Error"
                        : "Auto Save"}
              </Text>
            </View>
          </View>

          <View style={styles.sectionBubble}>
          <Text style={styles.photoSubtitle}>Change Photo</Text>
          <Pressable
            style={[styles.pickImageButton, uploadingImage && { opacity: 0.7 }]}
            onPress={handleChooseFromCameraRoll}
            disabled={uploadingImage}
          >
            <Camera color="#ff8a3d" size={22} strokeWidth={2.4} />
          </Pressable>

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
          </View>

          <View style={styles.sectionBubble}>
          <Text style={styles.groupTitle}>Measurements</Text>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.sectionLabel}>Length</Text>
              <View style={styles.inputWithUnitContainer}>
                <TextInput
                  style={[styles.input, styles.inputWithUnitField]}
                  placeholder="45"
                  placeholderTextColor={COLORS.textSecondary}
                  value={form.length}
                  onChangeText={(v) => setField("length", v)}
                  keyboardType="decimal-pad"
                />
                <Pressable
                  style={styles.unitInlineButton}
                  onPress={() =>
                    setOpenUnitMenu((prev) => (prev === "length" ? null : "length"))
                  }
                >
                  <Text style={styles.unitDropdownText}>{lengthUnit}</Text>
                  <ChevronDown color={COLORS.textSecondary} size={14} strokeWidth={2} />
                </Pressable>
              </View>
              {openUnitMenu === "length" && (
                <View style={styles.unitDropdownMenu}>
                  {LENGTH_UNITS.map((unit) => (
                    <Pressable
                      key={unit}
                      style={[styles.unitDropdownOption, lengthUnit === unit && styles.unitDropdownOptionActive]}
                      onPress={() => {
                        setLengthUnit(unit);
                        setOpenUnitMenu(null);
                      }}
                    >
                      <Text style={styles.unitDropdownOptionText}>{unit}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.sectionLabel}>Weight</Text>
              <View style={styles.inputWithUnitContainer}>
                <TextInput
                  style={[styles.input, styles.inputWithUnitField]}
                  placeholder="2.3"
                  placeholderTextColor={COLORS.textSecondary}
                  value={form.weight}
                  onChangeText={(v) => setField("weight", v)}
                  keyboardType="decimal-pad"
                />
                <Pressable
                  style={styles.unitInlineButton}
                  onPress={() =>
                    setOpenUnitMenu((prev) => (prev === "weight" ? null : "weight"))
                  }
                >
                  <Text style={styles.unitDropdownText}>{weightUnit}</Text>
                  <ChevronDown color={COLORS.textSecondary} size={14} strokeWidth={2} />
                </Pressable>
              </View>
              {openUnitMenu === "weight" && (
                <View style={styles.unitDropdownMenu}>
                  {WEIGHT_UNITS.map((unit) => (
                    <Pressable
                      key={unit}
                      style={[styles.unitDropdownOption, weightUnit === unit && styles.unitDropdownOptionActive]}
                      onPress={() => {
                        setWeightUnit(unit);
                        setOpenUnitMenu(null);
                      }}
                    >
                      <Text style={styles.unitDropdownOptionText}>{unit}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>
          </View>

          <View style={styles.sectionBubble}>
          <Text style={styles.groupTitle}>Location & Date</Text>
          <View style={[styles.row, styles.locationTimeRow]}>
            <View style={styles.locationTimeItem}>
              <Text style={[styles.sectionLabel, styles.centeredFieldLabel]}>Location</Text>
              <TextInput
                style={[styles.input, styles.centeredFieldInput]}
                placeholder="Fishing spot"
                placeholderTextColor={COLORS.textSecondary}
                value={form.location}
                onChangeText={(v) => setField("location", v)}
              />
            </View>
            <View style={styles.locationTimeItem}>
              <Text style={[styles.sectionLabel, styles.centeredFieldLabel]}>Time</Text>
              <TextInput
                style={[styles.input, styles.centeredFieldInput]}
                placeholder="8:30 PM"
                placeholderTextColor={COLORS.textSecondary}
                value={timeValue}
                onChangeText={setTimeValue}
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Date</Text>
          <TextInput
            style={styles.input}
            placeholder="Mar 1, 2026"
            placeholderTextColor={COLORS.textSecondary}
            value={form.date}
            onChangeText={(v) => setField("date", v)}
          />

          </View>

          <View style={styles.sectionBubble}>
          <Text style={styles.groupTitle}>Conditions</Text>
          <View style={[styles.row, styles.stackRow]}>
            <View style={styles.rowItem}>
              <Text style={styles.sectionLabel}>Temperature</Text>
              <View style={styles.inputWithUnitContainer}>
                <TextInput
                  style={[styles.input, styles.inputWithUnitField]}
                  placeholder="22"
                  placeholderTextColor={COLORS.textSecondary}
                  value={form.temperature}
                  onChangeText={(v) => setField("temperature", v)}
                  keyboardType="decimal-pad"
                />
                <Pressable
                  style={styles.unitInlineButton}
                  onPress={() =>
                    setOpenUnitMenu((prev) =>
                      prev === "temperature" ? null : "temperature"
                    )
                  }
                >
                  <Text style={styles.unitDropdownText}>
                    {TEMPERATURE_UNIT_LABELS[temperatureUnit]}
                  </Text>
                  <ChevronDown color={COLORS.textSecondary} size={14} strokeWidth={2} />
                </Pressable>
              </View>
              {openUnitMenu === "temperature" && (
                <View style={styles.unitDropdownMenu}>
                  {TEMPERATURE_UNITS.map((unit) => (
                    <Pressable
                      key={unit}
                      style={[
                        styles.unitDropdownOption,
                        temperatureUnit === unit && styles.unitDropdownOptionActive,
                      ]}
                      onPress={() => {
                        setTemperatureUnit(unit);
                        setOpenUnitMenu(null);
                      }}
                    >
                      <Text style={styles.unitDropdownOptionText}>
                        {TEMPERATURE_UNIT_LABELS[unit]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.sectionLabel}>Weather</Text>
              <TextInput
                style={styles.input}
                placeholder="Sunny"
                placeholderTextColor={COLORS.textSecondary}
                value={weatherQuery}
                onChangeText={(v) => {
                  setWeatherQuery(v);
                  setField("weather", v);
                  setShowWeatherMatches(true);
                }}
                onFocus={() => setShowWeatherMatches(true)}
                onBlur={() => {
                  setTimeout(() => setShowWeatherMatches(false), 120);
                }}
              />
              {showWeatherMatches && (
                <View style={styles.speciesOptions}>
                  {weatherMatches.map((weather) => (
                    <Pressable
                      key={weather}
                      style={styles.speciesOption}
                      onPress={() => {
                        setField("weather", weather);
                        setWeatherQuery(weather);
                        setShowWeatherMatches(false);
                      }}
                    >
                      <Text style={styles.speciesOptionText}>{weather}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>

          </View>

          <View style={styles.sectionBubble}>
          <Text style={styles.groupTitle}>Tackle</Text>
          <Text style={styles.sectionLabel}>Lure</Text>
          <TextInput
            style={styles.input}
            placeholder="Lure / bait"
            placeholderTextColor={COLORS.textSecondary}
            value={lureQuery}
            onChangeText={(v) => {
              setLureQuery(v);
              setField("lure", v);
              setShowLureMatches(true);
            }}
            onFocus={() => setShowLureMatches(true)}
            onBlur={() => {
              setTimeout(() => setShowLureMatches(false), 120);
            }}
          />
          {showLureMatches && (
            <View style={styles.speciesOptions}>
              {lureMatches.map((lure) => (
                <Pressable
                  key={lure}
                  style={styles.speciesOption}
                  onPress={() => {
                    setField("lure", lure);
                    setLureQuery(lure);
                    setShowLureMatches(false);
                  }}
                >
                  <Text style={styles.speciesOptionText}>{lure}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.sectionLabel}>Method</Text>
          <TextInput
            style={styles.input}
            placeholder="Spin, Fly, Troll..."
            placeholderTextColor={COLORS.textSecondary}
            value={methodQuery}
            onChangeText={(v) => {
              setMethodQuery(v);
              setField("method", v);
              setShowMethodMatches(true);
            }}
            onFocus={() => setShowMethodMatches(true)}
            onBlur={() => {
              setTimeout(() => setShowMethodMatches(false), 120);
            }}
          />
          {showMethodMatches && (
            <View style={styles.speciesOptions}>
              {methodMatches.map((method) => (
                <Pressable
                  key={method}
                  style={styles.speciesOption}
                  onPress={() => {
                    setField("method", method);
                    setMethodQuery(method);
                    setShowMethodMatches(false);
                  }}
                >
                  <Text style={styles.speciesOptionText}>{method}</Text>
                </Pressable>
              ))}
            </View>
          )}

          </View>

          <View style={styles.sectionBubble}>
          <Text style={styles.groupTitle}>Log Notes</Text>
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

          </View>

          <View style={styles.sectionBubble}>
          <Text style={styles.groupTitle}>Privacy & Visibility</Text>
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
    paddingBottom: 40,
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
    padding: 0,
  },
  sectionBubble: {
    backgroundColor: "rgba(0,0,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },
  statusPill: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(0,0,0,0.18)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  groupTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 14,
    marginBottom: 6,
    textAlign: "center",
  },
  sectionLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 6,
    marginTop: 8,
  },
  photoSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  input: {
    color: COLORS.text,
    backgroundColor: "rgba(0,0,0,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
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
    marginBottom: 4,
  },
  stackRow: {
    flexDirection: "column",
    gap: 10,
  },
  rowItem: {
    flex: 1,
  },
  locationTimeRow: {
    alignItems: "flex-end",
  },
  locationTimeItem: {
    flex: 1,
  },
  timeItem: {
    width: 128,
  },
  measurementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  measurementInput: {
    flex: 1,
  },
  inputWithUnitContainer: {
    position: "relative",
    justifyContent: "center",
  },
  inputWithUnitField: {
    paddingRight: 92,
  },
  unitInlineButton: {
    position: "absolute",
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  unitDropdownButton: {
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  unitDropdownText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  unitDropdownMenu: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  unitDropdownOption: {
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  unitDropdownOptionActive: {
    backgroundColor: "rgba(253,123,65,0.2)",
  },
  unitDropdownOptionText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
  centeredFieldLabel: {
    textAlign: "center",
  },
  centeredFieldInput: {
    textAlign: "center",
  },
  toggleRow: {
    marginTop: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 10,
    backgroundColor: "rgba(0,0,0,0.12)",
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
    marginBottom: 10,
    marginTop: 4,
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
  pickImageButton: {
    width: 48,
    height: 48,
    alignSelf: "center",
    borderRadius: 999,
    backgroundColor: "rgba(255,138,61,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,138,61,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  pickImageButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
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
