import { COLORS } from "@/lib/colors";
import SpeciesGuideLink from "@/components/SpeciesGuideLink";
import {
  CatchLog,
  createCatchLog,
  deleteCatchLog,
  getCatchLogById,
  updateCatchLog,
  uploadCatchPhoto,
} from "@/lib/catches";
import * as Location from "expo-location";
import { supabase } from "@/lib/supabase";
import { getProfile, LengthUnit, TempUnit, WeightUnit } from "@/lib/profile";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ArrowLeft, Camera, ChevronDown, Globe, Lock, Users } from "lucide-react-native";
import LocationPickerModal, { LocationResult } from "@/components/LocationPickerModal";
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
const CAMERA_ICON = require("@/assets/images/camera.png");
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
  isFriendsOnly: false,
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

  // Handle ISO 8601 dates stored in the database
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return {
        datePart: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        timePart: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toUpperCase(),
      };
    }
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

function toIsoDate(displayDate: string): string {
  const d = new Date(displayDate);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
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
  const { catchId, imageUri: initialImageUri } = useLocalSearchParams<{ catchId: string; imageUri?: string }>();
  const isNew = catchId === "new";
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
  const [showPicker, setShowPicker] = useState(false);
  const [pickerCoords, setPickerCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const hasLoadedInitialData = useRef(false);
  const lastSavedSnapshot = useRef<string>("");
  // Local file URI waiting to be uploaded when saving a new catch
  const [pendingLocalUri, setPendingLocalUri] = useState<string | null>(null);

  // GPS prefill runs after the form is visible (non-blocking)
  useEffect(() => {
    if (!isNew) return;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setPickerCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        const geo = await Location.reverseGeocodeAsync(loc.coords);
        if (geo.length) {
          const city = geo[0].city || geo[0].subregion || geo[0].region || "";
          const area = geo[0].region || geo[0].country || "";
          const label = [city, area].filter(Boolean).join(", ");
          if (label) setForm((prev) => (prev.location ? prev : { ...prev, location: label }));
        }
      } catch {
        // non-critical
      }
    })();
  }, [isNew]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        if (isNew) {
          // ── Create mode: no DB load, init from prefs + optional imageUri ──
          try {
            const profile = await getProfile();
            setLengthUnit(profile.unitsLength);
            setWeightUnit(profile.unitsWeight);
            setTemperatureUnit(toTemperatureUnit(profile.unitsTemp));
          } catch {
            // use defaults
          }
          const now = new Date();
          setForm((prev) => ({
            ...prev,
            imageUrl: initialImageUri ?? "",
            date: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          }));
          setTimeValue(now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
          if (initialImageUri) setPendingLocalUri(initialImageUri);

          hasLoadedInitialData.current = true;
          return;
        }

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

        const initPickerCoords =
          typeof catchLog.latitude === "number" &&
          typeof catchLog.longitude === "number"
            ? { latitude: catchLog.latitude, longitude: catchLog.longitude }
            : null;
        setPickerCoords(initPickerCoords);

        lastSavedSnapshot.current = JSON.stringify({
          ...hydratedForm,
          lengthUnit: parsedLength.unit,
          weightUnit: parsedWeight.unit,
          temperatureUnit: parsedTemperature.unit,
          _pickerLat: initPickerCoords?.latitude ?? null,
          _pickerLng: initPickerCoords?.longitude ?? null,
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
      const isoDate = toIsoDate(joinDateTime(payload.date, timeValue));
      await updateCatchLog({
        id: catchId,
        ...payload,
        date: isoDate,
        latitude: pickerCoords?.latitude ?? null,
        longitude: pickerCoords?.longitude ?? null,
      });

      lastSavedSnapshot.current = JSON.stringify({
        ...payload,
        date: isoDate,
        lengthUnit,
        weightUnit,
        temperatureUnit,
        timeValue,
        _pickerLat: pickerCoords?.latitude ?? null,
        _pickerLng: pickerCoords?.longitude ?? null,
      });
      setSaveStatus("saved");
    } catch (err: any) {
      setSaveStatus("error");
      setError(err?.message ?? "Unable to update catch.");
    } finally {
      setSaving(false);
    }
  }, [catchId, form, lengthUnit, weightUnit, temperatureUnit, timeValue, pickerCoords]);

  const handleCreate = useCallback(async () => {
    try {
      setSaving(true);
      setSaveStatus("saving");
      setError(null);

      // Pass local URI so the pending queue can upload it on sync.
      // createCatchLog strips local URIs from the live DB insert.
      const payload = buildSavePayload(
        { ...form, imageUrl: pendingLocalUri ?? "" },
        lengthUnit,
        weightUnit,
        temperatureUnit
      );
      const isoDate = toIsoDate(joinDateTime(payload.date, timeValue));

      const result = await createCatchLog({
        ...payload,
        date: isoDate,
        latitude: pickerCoords?.latitude ?? null,
        longitude: pickerCoords?.longitude ?? null,
      });

      if (result.syncStatus === "pending") {
        Alert.alert(
          "Saved Offline",
          "Your catch was saved on this device and will upload automatically when you're back online.",
          [{ text: "View Catches", onPress: () => router.replace("/catches") }]
        );
      } else {
        router.replace("/catches");
      }

      // Upload image in the background and patch the catch record once done
      if (pendingLocalUri && result.syncStatus === "synced") {
        uploadCatchPhoto(pendingLocalUri)
          .then((imageUrl) =>
            updateCatchLog({
              id: result.catchId,
              ...buildSavePayload({ ...form, imageUrl }, lengthUnit, weightUnit, temperatureUnit),
              date: isoDate,
              latitude: pickerCoords?.latitude ?? null,
              longitude: pickerCoords?.longitude ?? null,
            })
          )
          .catch(() => {});
      }
    } catch (err: any) {
      setSaveStatus("error");
      setError(err?.message ?? "Unable to save catch.");
      Alert.alert("Save Failed", err?.message ?? "Unable to save catch.");
    } finally {
      setSaving(false);
    }
  }, [form, lengthUnit, weightUnit, temperatureUnit, timeValue, pickerCoords, pendingLocalUri]);

  useEffect(() => {
    if (isNew) return;
    if (!catchId || loading || !hasLoadedInitialData.current) return;
    if (deleting) return;

    const payload = buildSavePayload(form, lengthUnit, weightUnit, temperatureUnit);
    const snapshot = JSON.stringify({
      ...payload,
      date: toIsoDate(joinDateTime(payload.date, timeValue)),
      lengthUnit,
      weightUnit,
      temperatureUnit,
      timeValue,
      _pickerLat: pickerCoords?.latitude ?? null,
      _pickerLng: pickerCoords?.longitude ?? null,
    });
    if (snapshot === lastSavedSnapshot.current) return;

    const timer = setTimeout(() => {
      handleSave();
    }, 700);

    return () => clearTimeout(timer);
  }, [form, lengthUnit, weightUnit, temperatureUnit, timeValue, pickerCoords, catchId, loading, deleting, handleSave]);

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
      const publicUrl = await uploadCatchPhoto(result.assets[0].uri);
      setField("imageUrl", publicUrl);
      setPendingLocalUri(null);
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
    <>
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
            <Text style={styles.title}>{isNew ? "New Catch" : "Edit Catch"}</Text>
            <Text style={styles.subtitle}>{isNew ? "Log your catch details" : "Update your log entry"}</Text>
          </View>
        </View>

        {form.imageUrl ? (
          <Image source={{ uri: form.imageUrl }} style={styles.heroImage} />
        ) : (
          <View style={[styles.heroImage, styles.heroPlaceholder]}>
            <Image source={CAMERA_ICON} style={styles.heroPlaceholderIcon} />
            <Text style={styles.heroPlaceholderText}>No image</Text>
          </View>
        )}

        <SpeciesGuideLink speciesName={form.species} />

        <View style={styles.card}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle}>Catch Details</Text>
            {!isNew && (
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>
                  {deleting
                    ? "Deleting..."
                    : form.syncStatus === "pending"
                      ? "Pending Sync"
                    : saveStatus === "saving"
                      ? "Saving..."
                      : saveStatus === "saved"
                        ? "Saved"
                        : saveStatus === "error"
                          ? "Save Error"
                          : "Auto Save"}
                </Text>
              </View>
            )}
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
            placeholder="e.g. Largemouth Bass"
            placeholderTextColor={COLORS.textSecondary}
            value={speciesQuery}
            onChangeText={(v) => {
              setSpeciesQuery(v);
              setField("species", v.trim());
              setShowSpeciesMatches(v.trim().length > 0);
            }}
            onFocus={() => {
              if (speciesQuery.trim().length > 0) setShowSpeciesMatches(true);
            }}
            onBlur={() => {
              setTimeout(() => setShowSpeciesMatches(false), 120);
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
                  No matches — your entry will be saved as typed.
                </Text>
              )}
            </View>
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

          {/* Location picker */}
          <Text style={styles.sectionLabel}>Location</Text>
          <Pressable
            style={styles.locationPickerButton}
            onPress={() => setShowPicker(true)}
          >
            {pickerCoords ? (
              <View style={{ flex: 1 }}>
                <Text style={styles.locationPickerName} numberOfLines={1}>
                  {form.location || "Location selected"}
                </Text>
                <Text style={styles.locationPickerCoords}>
                  {pickerCoords.latitude.toFixed(5)}, {pickerCoords.longitude.toFixed(5)}
                </Text>
              </View>
            ) : (
              <Text style={styles.locationPickerPlaceholder}>
                {form.location || "Tap to pick on map…"}
              </Text>
            )}
            <Text style={styles.locationPickerAction}>
              {pickerCoords ? "Change" : "Pick on Map"}
            </Text>
          </Pressable>

          {/* Date + Time row */}
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.sectionLabel}>Date</Text>
              <TextInput
                style={styles.input}
                placeholder="Mar 1, 2026"
                placeholderTextColor={COLORS.textSecondary}
                value={form.date}
                onChangeText={(v) => setField("date", v)}
              />
            </View>
            <View style={[styles.rowItem, styles.timeItem]}>
              <Text style={styles.sectionLabel}>Time</Text>
              <TextInput
                style={styles.input}
                placeholder="8:30 PM"
                placeholderTextColor={COLORS.textSecondary}
                value={timeValue}
                onChangeText={setTimeValue}
              />
            </View>
          </View>

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

          {/* 3-way visibility selector */}
          <View style={styles.visibilityRow}>
            {(
              [
                { key: "private",  label: "Private", Icon: Lock,  desc: "Only you" },
                { key: "friends",  label: "Friends", Icon: Users, desc: "Accepted friends" },
                { key: "public",   label: "Public",  Icon: Globe, desc: "Everyone" },
              ] as const
            ).map(({ key, label, Icon, desc }) => {
              const active =
                key === "public"  ? form.isPublic :
                key === "friends" ? (!form.isPublic && form.isFriendsOnly) :
                                    (!form.isPublic && !form.isFriendsOnly);
              return (
                <Pressable
                  key={key}
                  style={[styles.visibilityOption, active && styles.visibilityOptionActive]}
                  onPress={() => {
                    if (key === "public")  { setField("isPublic", true);  setField("isFriendsOnly", false); }
                    if (key === "friends") { setField("isPublic", false); setField("isFriendsOnly", true);  }
                    if (key === "private") { setField("isPublic", false); setField("isFriendsOnly", false); }
                  }}
                >
                  <Icon
                    size={16}
                    strokeWidth={2.2}
                    color={active ? COLORS.text : COLORS.textSecondary}
                  />
                  <Text style={[styles.visibilityLabel, active && styles.visibilityLabelActive]}>
                    {label}
                  </Text>
                  <Text style={styles.visibilityDesc}>{desc}</Text>
                </Pressable>
              );
            })}
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

          {isNew ? (
            <Pressable
              style={[styles.logCatchButton, saving && styles.logCatchButtonDisabled]}
              onPress={handleCreate}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.text} size="small" />
              ) : (
                <Text style={styles.logCatchButtonText}>Log Catch</Text>
              )}
            </Pressable>
          ) : (
            <>
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
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    <LocationPickerModal
      visible={showPicker}
      initialCoords={pickerCoords}
      onConfirm={(result: LocationResult) => {
        setPickerCoords({ latitude: result.latitude, longitude: result.longitude });
        setField("location", result.locationName);
        setShowPicker(false);
      }}
      onClose={() => setShowPicker(false)}
    />
    </>
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
  heroPlaceholderIcon: {
    width: 24,
    height: 24,
    resizeMode: "contain",
    marginBottom: 8,
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
  locationPickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(253,123,65,0.08)",
    borderWidth: 1,
    borderColor: "rgba(253,123,65,0.3)",
    marginBottom: 8,
    gap: 8,
  },
  locationPickerName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  locationPickerCoords: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  locationPickerPlaceholder: {
    color: COLORS.textSecondary,
    fontSize: 14,
    flex: 1,
  },
  locationPickerAction: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 0,
  },
  visibilityRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  visibilityOption: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  visibilityOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: "rgba(253,123,65,0.15)",
  },
  visibilityLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  visibilityLabelActive: {
    color: COLORS.text,
  },
  visibilityDesc: {
    color: COLORS.textSecondary,
    fontSize: 10,
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
  logCatchButton: {
    marginTop: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    minHeight: 52,
  },
  logCatchButtonDisabled: {
    opacity: 0.65,
  },
  logCatchButtonText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.5,
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
