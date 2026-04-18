import { useAuth } from "@/auth/AuthProvider";
import { useFriends } from "@/auth/FriendsProvider";
import { COLORS } from "@/lib/colors";
import MapZoomControls from "@/components/MapZoomControls";
import { CatchLog, getUserCatchLogs } from "@/lib/catches";
import { getUserFacingErrorMessage, withTimeout } from "@/lib/errorHandling";
import {
  FriendMapPin,
  FriendProfile,
  getFriendMapPins,
  getGlobalMapPins,
} from "@/lib/friends";
import { isLikelyNetworkError, refreshNetworkStatus } from "@/lib/network";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { ArrowLeft, MapPin, RefreshCcw, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type FilterMode = "mine" | "friends" | "global";

type RichPin = {
  id: string;
  species: string;
  latitude: number;
  longitude: number;
  imageUrl: string;
  date: string;
  weight: string;
  length: string;
  userId: string | null;
  username: string;
  avatarUrl: string | null;
  markerColor: string;
  source: FilterMode;
  syncStatus?: CatchLog["syncStatus"];
};

type PinState = {
  pins: RichPin[];
  loading: boolean;
  error: string | null;
};

const DEFAULT_REGION = {
  latitude: 41.238,
  longitude: -81.841,
  latitudeDelta: 0.3,
  longitudeDelta: 0.3,
};

const MAP_LOAD_TIMEOUT_MS = 12000;
const EMPTY_STATE: PinState = { pins: [], loading: false, error: null };
const DEBUG = process.env.EXPO_PUBLIC_DEBUG === "1";

function hasValidCoords(catchLog: CatchLog) {
  return (
    Number.isFinite(Number(catchLog.latitude)) &&
    Number.isFinite(Number(catchLog.longitude))
  );
}

function dlog(message: string, payload?: unknown) {
  if (!DEBUG) return;
  if (payload === undefined) {
    console.log(`[map] ${message}`);
    return;
  }
  console.log(`[map] ${message}`, payload);
}

function mapMinePin(
  catchLog: CatchLog,
  username: string,
  avatarUrl: string | null
): RichPin {
  return {
    id: catchLog.id,
    species: catchLog.species,
    latitude: Number(catchLog.latitude),
    longitude: Number(catchLog.longitude),
    imageUrl: catchLog.imageUrl,
    date: catchLog.date,
    weight: catchLog.weight,
    length: catchLog.length,
    userId: null,
    username,
    avatarUrl,
    markerColor: catchLog.syncStatus === "pending" ? "#FDBA74" : "#FD7B41",
    source: "mine",
    syncStatus: catchLog.syncStatus,
  };
}

function mapRemotePin(pin: FriendMapPin, source: "friends" | "global"): RichPin {
  return {
    id: pin.id,
    species: pin.species,
    latitude: pin.latitude,
    longitude: pin.longitude,
    imageUrl: pin.imageUrl,
    date: pin.date,
    weight: pin.weight,
    length: pin.length,
    userId: pin.userId,
    username: pin.username,
    avatarUrl: pin.avatarUrl,
    markerColor: source === "friends" ? "#4F8CFF" : "#22C55E",
    source,
    syncStatus: "synced",
  };
}

function getActiveState(
  mode: FilterMode,
  mineState: PinState,
  friendsState: PinState,
  globalState: PinState
) {
  if (mode === "mine") return mineState;
  if (mode === "friends") return friendsState;
  return globalState;
}

export default function CatchMapScreen() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const mapRef = useRef<MapView>(null);
  const { profile, user } = useAuth();
  const { friends } = useFriends();

  const [filterMode, setFilterMode] = useState<FilterMode>("mine");
  const [selectedFriendId, setSelectedFriendId] = useState<string>("all");
  const [selectedPin, setSelectedPin] = useState<RichPin | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [currentRegion, setCurrentRegion] = useState<Region>(DEFAULT_REGION);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isMapLaidOut, setIsMapLaidOut] = useState(false);
  const [mineState, setMineState] = useState<PinState>({
    pins: [],
    loading: true,
    error: null,
  });
  const [friendsState, setFriendsState] = useState<PinState>({
    pins: [],
    loading: true,
    error: null,
  });
  const [globalState, setGlobalState] = useState<PinState>(EMPTY_STATE);

  const filteredFriendPins = useMemo(() => {
    if (selectedFriendId === "all") return friendsState.pins;
    return friendsState.pins.filter((pin) => pin.userId === selectedFriendId);
  }, [friendsState.pins, selectedFriendId]);

  const activeState = getActiveState(filterMode, mineState, friendsState, globalState);
  const activePins = filterMode === "friends" ? filteredFriendPins : activeState.pins;
  const renderablePins = useMemo(
    () =>
      activePins.filter(
        (pin) =>
          Number.isFinite(pin.latitude) &&
          Number.isFinite(pin.longitude)
      ),
    [activePins]
  );
  const hasActiveError = !!activeState.error && activePins.length === 0;
  const isActiveLoading = activeState.loading;
  const mapKey = `${filterMode}:${selectedFriendId}:${reloadToken}`;
  const activeCoordinates = useMemo(
    () =>
      renderablePins.map((pin) => ({
          latitude: pin.latitude,
          longitude: pin.longitude,
        })),
    [renderablePins]
  );

  const viewportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;

    const loadMineAndFriends = async () => {
      setSelectedPin(null);
      setMineState((prev) => ({ ...prev, loading: true, error: null }));
      setFriendsState((prev) => ({ ...prev, loading: true, error: null }));

      const online = await refreshNetworkStatus().catch(() => false);
      if (cancelled) return;
      setIsOnline(online);

      if (!user) {
        if (!cancelled) {
          setMineState(EMPTY_STATE);
          setFriendsState(EMPTY_STATE);
        }
        return;
      }

      const [mineResult, friendsResult] = await Promise.allSettled([
        withTimeout(
          getUserCatchLogs(user.id),
          MAP_LOAD_TIMEOUT_MS,
          "Loading your catch pins took too long."
        ),
        online
          ? withTimeout(
              getFriendMapPins(friends.map((friend) => friend.id)),
              MAP_LOAD_TIMEOUT_MS,
              "Loading your friends' pins took too long."
            )
          : Promise.resolve([] as FriendMapPin[]),
      ]);

      if (cancelled) return;

      if (mineResult.status === "fulfilled") {
        dlog("mine rows loaded", mineResult.value.length);
        setMineState({
          pins: mineResult.value
            .filter(hasValidCoords)
            .map((catchLog) =>
              mapMinePin(
                catchLog,
                profile?.username ?? "Me",
                profile?.avatar_url ?? null
              )
            ),
          loading: false,
          error: null,
        });
      } else {
        const shouldSuppressError =
          !online && isLikelyNetworkError(mineResult.reason);

        setMineState({
          pins: [],
          loading: false,
          error: shouldSuppressError
            ? null
            : getUserFacingErrorMessage(
                mineResult.reason,
                "Unable to load your catches on the map."
              ),
        });
      }

      if (friendsResult.status === "fulfilled") {
        dlog("friend rows loaded", friendsResult.value.length);
        setFriendsState({
          pins: friendsResult.value.map((pin) => mapRemotePin(pin, "friends")),
          loading: false,
          error: null,
        });
      } else {
        const shouldSuppressError =
          !online && isLikelyNetworkError(friendsResult.reason);

        setFriendsState({
          pins: [],
          loading: false,
          error: shouldSuppressError
            ? null
            : getUserFacingErrorMessage(
                friendsResult.reason,
                "Unable to load your friends' catches."
              ),
        });
      }
    };

    void loadMineAndFriends();

    return () => {
      cancelled = true;
    };
  }, [
    friends,
    isFocused,
    profile?.avatar_url,
    profile?.username,
    reloadToken,
    user,
  ]);

  useEffect(() => {
    if (filterMode !== "global" || !isFocused) return;
    let cancelled = false;

    const loadGlobal = async () => {
      setGlobalState((prev) => ({ ...prev, loading: true, error: null }));
      const online = await refreshNetworkStatus().catch(() => false);
      if (cancelled) return;
      setIsOnline(online);

      if (!online) {
        setGlobalState({
          pins: [],
          loading: false,
          error: null,
        });
        return;
      }

      try {
        const rows = await withTimeout(
          getGlobalMapPins(),
          MAP_LOAD_TIMEOUT_MS,
          "Loading global pins took too long."
        );

        if (cancelled) return;
        dlog("global rows loaded", rows.length);

        setGlobalState({
          pins: rows.map((pin) => mapRemotePin(pin, "global")),
          loading: false,
          error: null,
        });
      } catch (error) {
        if (!cancelled) {
          setGlobalState({
            pins: [],
            loading: false,
            error: getUserFacingErrorMessage(
              error,
              "Unable to load global catches."
            ),
          });
        }
      }
    };

    void loadGlobal();

    return () => {
      cancelled = true;
    };
  }, [filterMode, isFocused, reloadToken]);

  useEffect(() => {
    setSelectedPin(null);
  }, [filterMode, selectedFriendId]);

  const updateMapViewport = useCallback(() => {
    console.log("MAP DEBUG", {
      isMapReady,
      isMapLaidOut,
      activePins: activePins.length,
      renderablePins: renderablePins.length,
      activeCoordinates,
      filterMode,
      mapKey,
    });

    if (!mapRef.current || !isMapReady || !isMapLaidOut || activeCoordinates.length === 0) {
      return;
    }

    if (viewportTimeoutRef.current) {
      clearTimeout(viewportTimeoutRef.current);
    }

    viewportTimeoutRef.current = setTimeout(() => {
      if (!mapRef.current) return;

      if (activeCoordinates.length === 1) {
        const [coordinate] = activeCoordinates;
        mapRef.current.animateToRegion(
          {
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          },
          220
        );
        return;
      }

      mapRef.current.fitToCoordinates(activeCoordinates, {
        edgePadding: { top: 180, right: 48, bottom: 180, left: 48 },
        animated: true,
      });
    }, 0);
  }, [
    activeCoordinates,
    activePins.length,
    filterMode,
    isMapLaidOut,
    isMapReady,
    mapKey,
    renderablePins.length,
  ]);

  useEffect(() => {
    dlog("active pins render", {
      filterMode,
      selectedFriendId,
      count: renderablePins.length,
      coordinates: activeCoordinates,
    });
    updateMapViewport();

    return () => {
      if (viewportTimeoutRef.current) {
        clearTimeout(viewportTimeoutRef.current);
        viewportTimeoutRef.current = null;
      }
    };
  }, [
    activeCoordinates,
    activePins,
    filterMode,
    isMapReady,
    renderablePins,
    selectedFriendId,
    updateMapViewport,
  ]);

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
    <View
      style={styles.container}
      onLayout={() => setIsMapLaidOut(true)}
    >
      <MapView
        key={mapKey}
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={DEFAULT_REGION}
        onMapReady={() => setIsMapReady(true)}
        onRegionChangeComplete={(region) => setCurrentRegion(region)}
        onPress={() => setSelectedPin(null)}
      >
        {renderablePins.map((pin) => {
          console.log("MARKER:", pin.latitude, pin.longitude);
          return (
            <Marker
              key={pin.id}
              coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
              pinColor={pin.markerColor}
              onPress={() => setSelectedPin(pin)}
            />
          );
        })}
      </MapView>

      <MapZoomControls
        onZoomIn={() => handleZoom("in")}
        onZoomOut={() => handleZoom("out")}
        style={{ top: insets.top + (Platform.OS === "android" ? 132 : 128) }}
      />

      <View
        style={[
          styles.header,
          { paddingTop: insets.top + (Platform.OS === "android" ? 8 : 4) },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => router.replace("/(tabs)/home")}
          style={styles.backButton}
        >
          <ArrowLeft color={COLORS.text} size={20} strokeWidth={2.4} />
        </Pressable>

        <View style={styles.headerCenter}>
          <FilterToggle
            mode={filterMode}
            onChange={(mode) => {
              setFilterMode(mode);
              if (mode !== "friends") {
                setSelectedFriendId("all");
              }
            }}
          />

          {filterMode === "friends" && (
            <FriendSelector
              friends={friends}
              selectedFriendId={selectedFriendId}
              onSelect={setSelectedFriendId}
            />
          )}
        </View>

        <View style={styles.countBadge}>
          {isActiveLoading ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <MapPin color={COLORS.primary} size={14} strokeWidth={2.2} />
          )}
          <Text style={styles.countText}>{renderablePins.length}</Text>
        </View>
      </View>

      {isActiveLoading && (
        <View style={[styles.overlayCard, { top: insets.top + 78 }]}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.overlayTitle}>Loading map data...</Text>
        </View>
      )}

      {!isActiveLoading && hasActiveError && (
        <View style={[styles.overlayCard, { top: insets.top + 78 }]}>
          <Text style={styles.overlayTitle}>Map data couldn&apos;t load</Text>
          <Text style={styles.overlayText}>{activeState.error}</Text>
          <Pressable
            style={styles.overlayButton}
            onPress={() => setReloadToken((value) => value + 1)}
          >
            <RefreshCcw color="#000" size={14} strokeWidth={2.2} />
            <Text style={styles.overlayButtonText}>Try Again</Text>
          </Pressable>
        </View>
      )}

      {!isActiveLoading && !hasActiveError && renderablePins.length === 0 && (
        <View style={[styles.overlayCard, { top: insets.top + 78 }]}>
          <Text style={styles.overlayTitle}>
            {getEmptyTitle(filterMode, selectedFriendId)}
          </Text>
          <Text style={styles.overlayText}>
            {getEmptyMessage(filterMode, selectedFriendId, isOnline)}
          </Text>
        </View>
      )}

      {selectedPin && (
        <View style={[styles.calloutCard, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.calloutRow}>
            {selectedPin.imageUrl ? (
              <Image source={{ uri: selectedPin.imageUrl }} style={styles.calloutImage} />
            ) : (
              <View style={[styles.calloutImage, styles.calloutImageFallback]}>
                <MapPin color={COLORS.textSecondary} size={20} strokeWidth={1.5} />
              </View>
            )}

            <View style={styles.calloutDetails}>
              <Text style={styles.calloutSpecies} numberOfLines={1}>
                {selectedPin.species || "Unknown Species"}
              </Text>
              {(!!selectedPin.length || !!selectedPin.weight) && (
                <Text style={styles.calloutMeasure}>
                  {[selectedPin.length, selectedPin.weight]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              )}
              {!!selectedPin.date && (
                <Text style={styles.calloutDate}>{selectedPin.date}</Text>
              )}
              {selectedPin.syncStatus === "pending" && (
                <Text style={styles.pendingSyncText}>
                  Saved offline. Syncing when you&apos;re back online.
                </Text>
              )}
            </View>

            <Pressable style={styles.calloutClose} onPress={() => setSelectedPin(null)}>
              <X color={COLORS.textSecondary} size={18} strokeWidth={2} />
            </Pressable>
          </View>

          {selectedPin.userId !== null && (
            <Pressable
              style={styles.calloutAnglerRow}
              onPress={() => {
                setSelectedPin(null);
                router.push(`/user/${selectedPin.userId}`);
              }}
            >
              {selectedPin.avatarUrl ? (
                <Image source={{ uri: selectedPin.avatarUrl }} style={styles.calloutAvatar} />
              ) : (
                <View style={[styles.calloutAvatar, styles.calloutAvatarFallback]}>
                  <Text style={styles.calloutAvatarInitial}>
                    {selectedPin.username.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.calloutProfileCopy}>
                <Text style={styles.calloutAnglerName}>{selectedPin.username}</Text>
                <Text style={styles.calloutAnglerSub}>Tap to view profile</Text>
              </View>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function getEmptyTitle(filterMode: FilterMode, selectedFriendId: string) {
  if (filterMode === "mine") return "No catches to display";
  if (filterMode === "global") return "No global catches to display";
  if (selectedFriendId !== "all") return "No public catches for this friend";
  return "No friend catches to display";
}

function getEmptyMessage(
  filterMode: FilterMode,
  selectedFriendId: string,
  isOnline: boolean | null
) {
  if (isOnline === false) {
    if (filterMode === "mine") {
      return "You're offline. Catches saved on this device will appear here when available.";
    }
    return "You're offline. Friends and global catches will load again when the connection returns.";
  }

  if (filterMode === "mine") {
    return "Log a catch with a location and it will appear here.";
  }
  if (filterMode === "global") {
    return "Public catches from across the app will appear here.";
  }
  if (selectedFriendId !== "all") {
    return "Try another friend or switch back to All Friends.";
  }
  return "Friends' public catches will appear here.";
}

function FilterToggle({
  mode,
  onChange,
}: {
  mode: FilterMode;
  onChange: (mode: FilterMode) => void;
}) {
  return (
    <View style={toggleStyles.wrap}>
      {(["mine", "friends", "global"] as FilterMode[]).map((option) => (
        <Pressable
          key={option}
          style={[toggleStyles.btn, mode === option && toggleStyles.active]}
          onPress={() => onChange(option)}
        >
          <Text
            style={[toggleStyles.label, mode === option && toggleStyles.labelActive]}
          >
            {option === "mine" ? "Mine" : option === "friends" ? "Friends" : "Global"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function FriendSelector({
  friends,
  selectedFriendId,
  onSelect,
}: {
  friends: FriendProfile[];
  selectedFriendId: string;
  onSelect: (friendId: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.friendSelectorContent}
      style={styles.friendSelector}
    >
      <Pressable
        style={[
          styles.friendChip,
          selectedFriendId === "all" && styles.friendChipActive,
        ]}
        onPress={() => onSelect("all")}
      >
        <Text
          style={[
            styles.friendChipText,
            selectedFriendId === "all" && styles.friendChipTextActive,
          ]}
        >
          All Friends
        </Text>
      </Pressable>

      {friends.map((friend) => (
        <Pressable
          key={friend.id}
          style={[
            styles.friendChip,
            selectedFriendId === friend.id && styles.friendChipActive,
          ]}
          onPress={() => onSelect(friend.id)}
        >
          <Text
            style={[
              styles.friendChipText,
              selectedFriendId === friend.id && styles.friendChipTextActive,
            ]}
            numberOfLines={1}
          >
            {friend.username}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const toggleStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: "rgba(17,19,21,0.90)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    padding: 3,
  },
  btn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  active: {
    backgroundColor: COLORS.primary,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  labelActive: {
    color: "#000",
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  map: {
    flex: 1,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,19,21,0.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  headerCenter: {
    flex: 1,
    gap: 8,
  },
  countBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(60,64,68,0.88)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    minWidth: 54,
    justifyContent: "center",
  },
  countText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  overlayCard: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "rgba(17,19,21,0.94)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 16,
    gap: 8,
    alignItems: "center",
  },
  overlayTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  overlayText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  overlayButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  overlayButtonText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 13,
  },
  friendSelector: {
    maxHeight: 38,
  },
  friendSelectorContent: {
    gap: 8,
    paddingRight: 12,
  },
  friendChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(17,19,21,0.90)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  friendChipActive: {
    backgroundColor: "rgba(79,140,255,0.22)",
    borderColor: "rgba(79,140,255,0.55)",
  },
  friendChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  friendChipTextActive: {
    color: COLORS.text,
  },
  calloutCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 12,
  },
  calloutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  calloutImage: {
    width: 68,
    height: 68,
    borderRadius: 12,
    resizeMode: "cover",
  },
  calloutImageFallback: {
    backgroundColor: "rgba(221,220,219,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  calloutDetails: {
    flex: 1,
    gap: 3,
  },
  calloutSpecies: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
  },
  calloutMeasure: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  calloutDate: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  pendingSyncText: {
    color: "#FDBA74",
    fontSize: 12,
    fontWeight: "600",
  },
  calloutClose: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(221,220,219,0.1)",
  },
  calloutAnglerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(221,220,219,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 10,
  },
  calloutAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: COLORS.primary,
    resizeMode: "cover",
  },
  calloutAvatarFallback: {
    backgroundColor: "rgba(253,123,65,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  calloutAvatarInitial: {
    color: COLORS.primary,
    fontWeight: "700",
    fontSize: 14,
  },
  calloutProfileCopy: {
    flex: 1,
  },
  calloutAnglerName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  calloutAnglerSub: {
    color: COLORS.primary,
    fontSize: 11,
    marginTop: 1,
  },
});
