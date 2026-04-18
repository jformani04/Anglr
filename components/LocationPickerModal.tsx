import * as Location from "expo-location";
import { COLORS } from "@/lib/colors";
import MapZoomControls from "@/components/MapZoomControls";
import { Crosshair, Navigation, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface LocationResult {
  latitude: number;
  longitude: number;
  locationName: string;
}

interface Props {
  visible: boolean;
  initialCoords?: { latitude: number; longitude: number } | null;
  onConfirm: (result: LocationResult) => void;
  onClose: () => void;
}

const DEFAULT_REGION: Region = {
  latitude: 39.5,
  longitude: -98.35,
  latitudeDelta: 30,
  longitudeDelta: 30,
};

async function getLocationName(
  coords: { latitude: number; longitude: number }
): Promise<string> {
  try {
    const results = await Location.reverseGeocodeAsync(coords);
    if (!results.length) return "";
    const r = results[0];
    const locality = r.city || r.subregion || r.region || "";
    const area = r.region || r.country || "";
    return [locality, area].filter(Boolean).join(", ");
  } catch {
    return "";
  }
}

export default function LocationPickerModal({
  visible,
  initialCoords,
  onConfirm,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [center, setCenter] = useState<{ latitude: number; longitude: number }>(
    initialCoords ?? { latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude }
  );
  const [currentRegion, setCurrentRegion] = useState<Region>(
    initialCoords
      ? { ...initialCoords, latitudeDelta: 0.08, longitudeDelta: 0.08 }
      : DEFAULT_REGION
  );
  const [geocoding, setGeocoding] = useState(false);

  // Center map on open
  useEffect(() => {
    if (!visible) return;
    const init = initialCoords ?? null;
    const coords = init ?? { latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude };
    setCenter(coords);
    setCurrentRegion(
      init
        ? { ...init, latitudeDelta: 0.08, longitudeDelta: 0.08 }
        : DEFAULT_REGION
    );
    setTimeout(() => {
      mapRef.current?.animateToRegion(
        init
          ? { ...init, latitudeDelta: 0.08, longitudeDelta: 0.08 }
          : DEFAULT_REGION,
        350
      );
    }, 300);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUseCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      setCenter(coords);
      mapRef.current?.animateToRegion(
        { ...coords, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        500
      );
    } catch {
      // location not available — silently ignore
    }
  };

  const handleConfirm = async () => {
    setGeocoding(true);
    const name = await getLocationName(center);
    setGeocoding(false);
    onConfirm({
      latitude: center.latitude,
      longitude: center.longitude,
      locationName: name,
    });
  };

  const handleZoom = (direction: "in" | "out") => {
    const factor = direction === "in" ? 0.5 : 2;
    const nextRegion = {
      ...currentRegion,
      latitudeDelta: Math.min(Math.max(currentRegion.latitudeDelta * factor, 0.0025), 90),
      longitudeDelta: Math.min(Math.max(currentRegion.longitudeDelta * factor, 0.0025), 90),
    };
    setCurrentRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 220);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={DEFAULT_REGION}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
          onRegionChangeComplete={(region) => {
            setCenter({ latitude: region.latitude, longitude: region.longitude });
            setCurrentRegion(region);
          }}
        />

        {/* Fixed crosshair at map center */}
        <View style={styles.crosshair} pointerEvents="none">
          <Crosshair color={COLORS.primary} size={40} strokeWidth={1.5} />
        </View>

        {/* Floating header */}
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + (Platform.OS === "android" ? 8 : 4) },
          ]}
          pointerEvents="box-none"
        >
          <Pressable onPress={onClose} style={styles.iconButton}>
            <X color={COLORS.text} size={20} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Pick Location</Text>
          </View>
          <Pressable
            onPress={handleUseCurrentLocation}
            style={styles.iconButton}
          >
            <Navigation color={COLORS.primary} size={18} strokeWidth={2.4} />
          </Pressable>
        </View>

        {/* Hint chip */}
        <View
          style={[
            styles.hintChip,
            { top: insets.top + (Platform.OS === "android" ? 72 : 68) },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.hintText}>Pan the map to position the crosshair</Text>
        </View>

        <MapZoomControls
          onZoomIn={() => handleZoom("in")}
          onZoomOut={() => handleZoom("out")}
          style={{ top: insets.top + (Platform.OS === "android" ? 132 : 128) }}
        />

        {/* Bottom confirmation card */}
        <View
          style={[
            styles.bottomCard,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
        >
          <View style={styles.coordsRow}>
            <Text style={styles.coordsText}>
              {center.latitude.toFixed(5)}, {center.longitude.toFixed(5)}
            </Text>
          </View>
          <Pressable
            style={[styles.confirmButton, geocoding && { opacity: 0.7 }]}
            onPress={handleConfirm}
            disabled={geocoding}
          >
            {geocoding ? (
              <ActivityIndicator color={COLORS.text} size="small" />
            ) : (
              <Text style={styles.confirmText}>Confirm Location</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },

  /* ── Crosshair ────────────────────────────────── */
  crosshair: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -20,
    marginLeft: -20,
  },

  /* ── Floating header ──────────────────────────── */
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(60,64,68,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  titleWrap: {
    flex: 1,
    backgroundColor: "rgba(60,64,68,0.88)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
  },
  title: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  /* ── Hint chip ────────────────────────────────── */
  hintChip: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(60,64,68,0.88)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  hintText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },

  /* ── Bottom card ──────────────────────────────── */
  bottomCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(48,52,56,0.97)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  coordsRow: {
    alignItems: "center",
  },
  coordsText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },
  confirmButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  confirmText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.3,
  },
});
