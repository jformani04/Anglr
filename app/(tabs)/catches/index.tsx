import { COLORS } from "@/lib/colors";
import {
  batchDeleteCatchLogs,
  batchUpdateCatchLogs,
  CatchLog,
  getUserCatchLogs,
  seedDevCatchLog,
} from "@/lib/catches";
import { supabase } from "@/lib/supabase";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { applySortToCatches, SORT_DEFINITIONS, SortConfig } from "@/lib/catchSort";
import {
  ArrowLeft,
  ArrowUpDown,
  Calendar,
  Check,
  CheckSquare,
  Fish,
  Globe,
  Lock,
  MapPin,
  RefreshCcw,
  Ruler,
  Square,
  Star,
  Tag,
  Trash2,
  Weight,
  X,
} from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// ── Memoized card component ────────────────────────────────────────────────
// Defined outside CatchesScreen so its identity is stable across parent renders.
// Only re-renders when its own props change — critical for selection performance.

type CatchCardProps = {
  catchLog: CatchLog;
  isSelected: boolean;
  selectionMode: boolean;
  onPress: (id: string) => void;
  onLongPress: (id: string) => void;
};

const CatchCard = memo(function CatchCard({
  catchLog,
  isSelected,
  selectionMode,
  onPress,
  onLongPress,
}: CatchCardProps) {
  return (
    <Pressable
      onPress={() => onPress(catchLog.id)}
      onLongPress={() => onLongPress(catchLog.id)}
      delayLongPress={300}
      style={[styles.card, isSelected && styles.cardSelected]}
    >
      <View style={styles.cardRow}>
        {/* Thumbnail */}
        <View style={styles.thumbWrap}>
          {catchLog.imageUrl ? (
            <Image source={{ uri: catchLog.imageUrl }} style={styles.thumbImage} />
          ) : (
            <View style={[styles.thumbImage, styles.imageFallback]}>
              <Fish color={COLORS.textSecondary} size={26} strokeWidth={1.5} />
            </View>
          )}
          {selectionMode && (
            <View
              style={[
                styles.selectionOverlay,
                isSelected && styles.selectionOverlayActive,
              ]}
            >
              {isSelected && <Check color="#fff" size={18} strokeWidth={3} />}
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.cardContent}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.speciesTitle} numberOfLines={1}>
              {catchLog.species || "Unknown Species"}
            </Text>
            <View
              style={[
                styles.visibilityPill,
                catchLog.syncStatus === "failed"
                  ? styles.visibilityPillFailed
                  : catchLog.syncStatus === "pending"
                  ? styles.visibilityPillPending
                  : catchLog.isPublic
                  ? styles.visibilityPillPublic
                  : styles.visibilityPillPrivate,
              ]}
            >
              <Text
                style={[
                  styles.visibilityPillText,
                  catchLog.syncStatus === "failed"
                    ? styles.visibilityPillTextFailed
                    : catchLog.syncStatus === "pending"
                    ? styles.visibilityPillTextPending
                    : catchLog.isPublic
                    ? styles.visibilityPillTextPublic
                    : styles.visibilityPillTextPrivate,
                ]}
              >
                {catchLog.syncStatus === "failed"
                  ? "Failed"
                  : catchLog.syncStatus === "pending"
                  ? "Pending"
                  : catchLog.isPublic
                  ? "Public"
                  : "Private"}
              </Text>
            </View>
          </View>

          <View style={styles.lengthWeightRow}>
            <View style={styles.inlineRow}>
              <Ruler color={COLORS.textSecondary} size={12} strokeWidth={2} />
              <Text style={styles.metaText}>{catchLog.length || "-"}</Text>
            </View>
            <Text style={styles.dot}>•</Text>
            <View style={styles.inlineRow}>
              <Weight color={COLORS.textSecondary} size={12} strokeWidth={2} />
              <Text style={styles.metaText}>{catchLog.weight || "-"}</Text>
            </View>
          </View>

          <View style={styles.locationDateRow}>
            <MapPin color={COLORS.textSecondary} size={12} strokeWidth={2} />
            <Text style={styles.locationText} numberOfLines={1}>
              {catchLog.location || "Unknown location"}
            </Text>
            <Text style={styles.dot}>•</Text>
            <Calendar color={COLORS.textSecondary} size={12} strokeWidth={2} />
            <Text style={styles.dateText} numberOfLines={1}>
              {catchLog.date || "No date"}
            </Text>
          </View>

          {!!catchLog.notes && (
            <Text style={styles.notesPreview} numberOfLines={1}>
              {catchLog.notes}
            </Text>
          )}

          {!!catchLog.pinGroup && (
            <View style={styles.groupTag}>
              <Tag size={9} color={COLORS.primary} strokeWidth={2} />
              <Text style={styles.groupTagText}>{catchLog.pinGroup}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});

// ── Screen ─────────────────────────────────────────────────────────────────

export default function CatchesScreen() {
  const isFocused = useIsFocused();
  const [catches, setCatches] = useState<CatchLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Group filter
  const [activeGroupFilter, setActiveGroupFilter] = useState<string | null>(null);

  // Sort
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [showSortPanel, setShowSortPanel] = useState(false);

  // Ref so card-level callbacks can read current selectionMode without being recreated
  const selectionModeRef = useRef(selectionMode);
  selectionModeRef.current = selectionMode;

  // ── Derived state ──────────────────────────────────────────────────────────

  // Deduplicate groups case-insensitively, keeping original casing of first occurrence
  const groups = useMemo(() => {
    const seen = new Map<string, string>();
    catches.forEach((c) => {
      if (c.pinGroup) {
        const key = c.pinGroup.toLowerCase();
        if (!seen.has(key)) seen.set(key, c.pinGroup);
      }
    });
    return [...seen.values()].sort();
  }, [catches]);

  const filteredCatches = useMemo(
    () =>
      activeGroupFilter
        ? catches.filter(
            (c) => c.pinGroup?.toLowerCase() === activeGroupFilter.toLowerCase()
          )
        : catches,
    [catches, activeGroupFilter]
  );

  // Sorted view of filteredCatches — only used for the rendered card list.
  // All selection/batch logic continues to operate on filteredCatches directly.
  const displayCatches = useMemo(
    () => applySortToCatches(filteredCatches, sortConfig),
    [filteredCatches, sortConfig]
  );

  const selectedCatches = useMemo(
    () => filteredCatches.filter((c) => selectedIds.has(c.id)),
    [filteredCatches, selectedIds]
  );

  const allFavorited =
    selectedCatches.length > 0 && selectedCatches.every((c) => c.isFavorite);
  const allPublic =
    selectedCatches.length > 0 && selectedCatches.every((c) => c.isPublic);
  const allSelected =
    filteredCatches.length > 0 && selectedIds.size === filteredCatches.length;

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchCatches = useCallback(async (showRefreshing = false) => {
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
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    fetchCatches();
  }, [isFocused, fetchCatches]);

  // Reset selection state whenever the screen loses focus
  useEffect(() => {
    if (!isFocused) {
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  }, [isFocused]);

  // ── Stable selection callbacks (used by CatchCard) ─────────────────────────

  const enterSelectionMode = useCallback((firstId?: string) => {
    setSelectionMode(true);
    setSelectedIds(firstId ? new Set([firstId]) : new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Stable card press handlers — selectionModeRef avoids stale closures
  const handleCardPress = useCallback(
    (id: string) => {
      if (selectionModeRef.current) {
        toggleSelection(id);
      } else {
        router.push({ pathname: "/catches/[catchId]", params: { catchId: id } });
      }
    },
    [toggleSelection]
  );

  const handleCardLongPress = useCallback(
    (id: string) => {
      if (!selectionModeRef.current) enterSelectionMode(id);
    },
    [enterSelectionMode]
  );

  // ── Select all ─────────────────────────────────────────────────────────────

  const handleSelectAll = useCallback(() => {
    setSelectedIds(
      allSelected ? new Set() : new Set(filteredCatches.map((c) => c.id))
    );
  }, [allSelected, filteredCatches]);

  // ── Batch actions with optimistic UI updates ───────────────────────────────

  const handleBatchFavorite = useCallback(async () => {
    const ids = new Set(selectedIds);
    const newFav = !allFavorited;

    // Optimistic: update local state and exit selection mode immediately
    setCatches((prev) =>
      prev.map((c) => (ids.has(c.id) ? { ...c, isFavorite: newFav } : c))
    );
    exitSelectionMode();

    try {
      await batchUpdateCatchLogs([...ids], { isFavorite: newFav });
    } catch (err: any) {
      void fetchCatches(); // restore on failure
      Alert.alert("Error", err?.message ?? "Failed to update catches.");
    }
  }, [selectedIds, allFavorited, exitSelectionMode, fetchCatches]);

  const handleBatchPrivacy = useCallback(async () => {
    const ids = new Set(selectedIds);
    // Make all public if none are public; otherwise make all private
    const newPublic = !allPublic;

    // Optimistic update
    setCatches((prev) =>
      prev.map((c) =>
        ids.has(c.id) ? { ...c, isPublic: newPublic, isFriendsOnly: false } : c
      )
    );
    exitSelectionMode();

    try {
      await batchUpdateCatchLogs([...ids], {
        isPublic: newPublic,
        isFriendsOnly: false,
      });
    } catch (err: any) {
      void fetchCatches();
      Alert.alert("Error", err?.message ?? "Failed to update catches.");
    }
  }, [selectedIds, allPublic, exitSelectionMode, fetchCatches]);

  const handleBatchDelete = useCallback(() => {
    const ids = new Set(selectedIds);
    const count = ids.size;
    if (count === 0) return;

    Alert.alert(
      "Delete Catches",
      `Permanently delete ${count} catch${count === 1 ? "" : "es"}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            // Optimistic: remove from UI and exit selection mode immediately
            setCatches((prev) => prev.filter((c) => !ids.has(c.id)));
            exitSelectionMode();

            // Background network delete — restore on failure
            batchDeleteCatchLogs([...ids]).catch((err: any) => {
              void fetchCatches();
              Alert.alert(
                "Delete Failed",
                err?.message ?? "Unable to delete catches. Your list has been restored."
              );
            });
          },
        },
      ]
    );
  }, [selectedIds, exitSelectionMode, fetchCatches]);

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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.screenWrap}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.contentContainer,
          selectionMode && styles.contentContainerWithBar,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.replace("/(tabs)/home")}
            style={styles.backButton}
          >
            <ArrowLeft color={COLORS.text} size={20} strokeWidth={2.5} />
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>Your Catches</Text>
            <Text style={styles.subtitle}>
              {catches.length} {catches.length === 1 ? "catch" : "catches"} logged
            </Text>
          </View>
        </View>

        {/* Actions row */}
        <View style={styles.actionsRow}>
          <Pressable style={styles.secondaryAction} onPress={() => fetchCatches(true)}>
            <RefreshCcw color={COLORS.primary} size={16} strokeWidth={2.2} />
            <Text style={styles.secondaryActionText}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.secondaryAction,
              selectionMode && styles.secondaryActionActive,
            ]}
            onPress={() =>
              selectionMode ? exitSelectionMode() : enterSelectionMode()
            }
          >
            {selectionMode ? (
              <X color={COLORS.primary} size={16} strokeWidth={2.5} />
            ) : (
              <CheckSquare color={COLORS.textSecondary} size={16} strokeWidth={2.2} />
            )}
            <Text
              style={[
                styles.secondaryActionText,
                selectionMode && styles.secondaryActionActiveText,
              ]}
            >
              {selectionMode ? "Cancel" : "Select"}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.secondaryAction,
              (sortConfig || showSortPanel) && styles.secondaryActionActive,
            ]}
            onPress={() => setShowSortPanel((v) => !v)}
          >
            <ArrowUpDown
              color={sortConfig || showSortPanel ? COLORS.primary : COLORS.textSecondary}
              size={16}
              strokeWidth={2.2}
            />
            <Text
              style={[
                styles.secondaryActionText,
                (sortConfig || showSortPanel) && styles.secondaryActionActiveText,
              ]}
            >
              {sortConfig
                ? `${SORT_DEFINITIONS.find((d) => d.field === sortConfig.field)?.label} ${sortConfig.direction === "asc" ? "↑" : "↓"}`
                : "Sort"}
            </Text>
          </Pressable>

          {__DEV__ && (
            <Pressable style={styles.devAction} onPress={handleSeedDevCatch}>
              <Text style={styles.devActionText}>+ Add Test Catch</Text>
            </Pressable>
          )}
        </View>

        {/* Sort panel */}
        {showSortPanel && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sortPanelContent}
            style={styles.sortPanel}
          >
            {SORT_DEFINITIONS.map((def) => {
              const isActive = sortConfig?.field === def.field;
              return (
                <Pressable
                  key={def.field}
                  style={[styles.sortPill, isActive && styles.sortPillActive]}
                  onPress={() => {
                    if (isActive) {
                      setSortConfig((prev) =>
                        prev
                          ? { ...prev, direction: prev.direction === "asc" ? "desc" : "asc" }
                          : null
                      );
                    } else {
                      setSortConfig({ field: def.field, direction: def.defaultDirection });
                      setShowSortPanel(false);
                    }
                  }}
                >
                  <Text style={[styles.sortPillText, isActive && styles.sortPillTextActive]}>
                    {def.label}
                    {isActive ? (sortConfig!.direction === "asc" ? " ↑" : " ↓") : ""}
                  </Text>
                </Pressable>
              );
            })}
            {sortConfig && (
              <Pressable
                style={styles.sortClear}
                onPress={() => {
                  setSortConfig(null);
                  setShowSortPanel(false);
                }}
              >
                <X color={COLORS.textSecondary} size={14} strokeWidth={2.5} />
              </Pressable>
            )}
          </ScrollView>
        )}

        {/* Group filter pills */}
        {groups.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.groupFilterRow}
            style={styles.groupFilterScroll}
          >
            <Pressable
              style={[
                styles.groupPill,
                !activeGroupFilter && styles.groupPillActive,
              ]}
              onPress={() => setActiveGroupFilter(null)}
            >
              <Text
                style={[
                  styles.groupPillText,
                  !activeGroupFilter && styles.groupPillTextActive,
                ]}
              >
                All
              </Text>
            </Pressable>
            {groups.map((group) => (
              <Pressable
                key={group}
                style={[
                  styles.groupPill,
                  activeGroupFilter?.toLowerCase() === group.toLowerCase() &&
                    styles.groupPillActive,
                ]}
                onPress={() =>
                  setActiveGroupFilter((prev) =>
                    prev?.toLowerCase() === group.toLowerCase() ? null : group
                  )
                }
              >
                <Tag
                  size={10}
                  strokeWidth={2}
                  color={
                    activeGroupFilter?.toLowerCase() === group.toLowerCase()
                      ? COLORS.primary
                      : COLORS.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.groupPillText,
                    activeGroupFilter?.toLowerCase() === group.toLowerCase() &&
                      styles.groupPillTextActive,
                  ]}
                >
                  {group}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Active filter banner */}
        {!!activeGroupFilter && (
          <Pressable
            style={styles.filterActiveBanner}
            onPress={() => setActiveGroupFilter(null)}
          >
            <Tag size={11} color={COLORS.primary} strokeWidth={2} />
            <Text style={styles.filterActiveBannerText}>
              Filtered:{" "}
              <Text style={styles.filterActiveGroupName}>{activeGroupFilter}</Text>
            </Text>
            <X size={12} color={COLORS.primary} strokeWidth={2.5} />
          </Pressable>
        )}

        {/* Selection controls */}
        {selectionMode && !loading && filteredCatches.length > 0 && (
          <View style={styles.selectionControlsRow}>
            <Pressable onPress={handleSelectAll} style={styles.selectAllButton}>
              {allSelected ? (
                <Check color={COLORS.primary} size={14} strokeWidth={2.5} />
              ) : (
                <Square color={COLORS.textSecondary} size={14} strokeWidth={2} />
              )}
              <Text style={styles.selectAllText}>
                {allSelected ? "Deselect All" : "Select All"}
              </Text>
            </Pressable>
            <Text style={styles.selectionCountText}>
              {selectedIds.size} of {filteredCatches.length} selected
            </Text>
          </View>
        )}

        {/* Main content */}
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
        ) : filteredCatches.length === 0 ? (
          <View style={styles.centerCard}>
            <View style={styles.emptyIconWrap}>
              <Fish color={COLORS.textSecondary} size={48} strokeWidth={1.5} />
            </View>
            <Text style={styles.emptyTitle}>
              {activeGroupFilter
                ? `No catches in "${activeGroupFilter}"`
                : "No catches yet"}
            </Text>
            <Text style={styles.centerSubtext}>
              {activeGroupFilter
                ? "Try a different group or tap the banner above to clear the filter."
                : "Start logging your catches to see them here."}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {displayCatches.map((catchLog) => (
              <CatchCard
                key={catchLog.id}
                catchLog={catchLog}
                isSelected={selectedIds.has(catchLog.id)}
                selectionMode={selectionMode}
                onPress={handleCardPress}
                onLongPress={handleCardLongPress}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom selection action bar */}
      {selectionMode && (
        <View style={styles.selectionBar}>
          <View style={styles.selectionBarLeft}>
            <Text style={styles.selectionBarCount}>
              {selectedIds.size} selected
            </Text>
          </View>

          <View style={styles.selectionBarActions}>
            <Pressable
              style={[
                styles.barAction,
                selectedIds.size === 0 && styles.barActionDisabled,
              ]}
              onPress={handleBatchFavorite}
              disabled={selectedIds.size === 0}
            >
              <Star
                color={allFavorited ? "#fbbf24" : COLORS.textSecondary}
                size={18}
                strokeWidth={2}
                fill={allFavorited ? "#fbbf24" : "transparent"}
              />
              <Text style={styles.barActionText}>
                {allFavorited ? "Unfave" : "Favorite"}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.barAction,
                selectedIds.size === 0 && styles.barActionDisabled,
              ]}
              onPress={handleBatchPrivacy}
              disabled={selectedIds.size === 0}
            >
              {allPublic ? (
                <Lock color={COLORS.textSecondary} size={18} strokeWidth={2} />
              ) : (
                <Globe color={COLORS.textSecondary} size={18} strokeWidth={2} />
              )}
              <Text style={styles.barActionText}>
                {allPublic ? "Make Private" : "Make Public"}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.barAction,
                styles.barActionDanger,
                selectedIds.size === 0 && styles.barActionDisabled,
              ]}
              onPress={handleBatchDelete}
              disabled={selectedIds.size === 0}
            >
              <Trash2 color="#f87171" size={18} strokeWidth={2} />
              <Text style={[styles.barActionText, styles.barActionTextDanger]}>
                Delete
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 32,
  },
  contentContainerWithBar: {
    paddingBottom: 104,
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
    marginBottom: 12,
    flexWrap: "wrap",
  },
  secondaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryActionActive: {
    borderColor: "rgba(253,123,65,0.4)",
    backgroundColor: "rgba(253,123,65,0.1)",
  },
  secondaryActionText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
  secondaryActionActiveText: {
    color: COLORS.primary,
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
  // Sort panel
  sortPanel: {
    marginBottom: 10,
  },
  sortPanelContent: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8,
  },
  sortPill: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  sortPillActive: {
    backgroundColor: "rgba(253,123,65,0.14)",
    borderColor: "rgba(253,123,65,0.4)",
  },
  sortPillText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  sortPillTextActive: {
    color: COLORS.primary,
  },
  sortClear: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    alignSelf: "center",
  },
  // Group filter
  groupFilterScroll: {
    marginBottom: 8,
  },
  groupFilterRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8,
  },
  groupPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  groupPillActive: {
    backgroundColor: "rgba(253,123,65,0.14)",
    borderColor: "rgba(253,123,65,0.4)",
  },
  groupPillText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  groupPillTextActive: {
    color: COLORS.primary,
  },
  // Active filter banner
  filterActiveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(253,123,65,0.08)",
    borderWidth: 1,
    borderColor: "rgba(253,123,65,0.22)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 10,
  },
  filterActiveBannerText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  filterActiveGroupName: {
    color: COLORS.text,
    fontWeight: "700",
  },
  // Selection controls row
  selectionControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  selectAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  selectAllText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  selectionCountText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  // Cards
  centerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 28,
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
    width: 84,
    height: 84,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  emptyIconImage: {
    width: 84,
    height: 84,
    resizeMode: "contain",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 18,
    overflow: "hidden",
  },
  cardSelected: {
    borderColor: "rgba(253,123,65,0.5)",
    backgroundColor: "rgba(253,123,65,0.06)",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  thumbWrap: {
    width: 72,
    height: 72,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
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
  fallbackThumbIcon: {
    width: 34,
    height: 34,
    resizeMode: "contain",
  },
  selectionOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectionOverlayActive: {
    backgroundColor: "rgba(253,123,65,0.4)",
    borderColor: COLORS.primary,
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
  visibilityPillPending: {
    backgroundColor: "rgba(251,191,36,0.18)",
    borderColor: "rgba(251,191,36,0.35)",
  },
  visibilityPillFailed: {
    backgroundColor: "rgba(239,68,68,0.18)",
    borderColor: "rgba(239,68,68,0.35)",
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
  visibilityPillTextPending: {
    color: "#fbbf24",
  },
  visibilityPillTextFailed: {
    color: "#f87171",
  },
  visibilityPillTextPrivate: {
    color: COLORS.primary,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaIcon: {
    width: 22,
    height: 22,
    resizeMode: "contain",
  },
  metaIconLarge: {
    width: 26,
    height: 26,
    resizeMode: "contain",
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
  groupTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 5,
    backgroundColor: "rgba(253,123,65,0.12)",
    borderWidth: 1,
    borderColor: "rgba(253,123,65,0.25)",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  groupTagText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "600",
  },
  // Selection bar (fixed at bottom)
  selectionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  selectionBarLeft: {
    minWidth: 68,
  },
  selectionBarCount: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  selectionBarActions: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  barAction: {
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.04)",
    minWidth: 64,
  },
  barActionDanger: {
    borderColor: "rgba(248,113,113,0.25)",
    backgroundColor: "rgba(248,113,113,0.06)",
  },
  barActionDisabled: {
    opacity: 0.3,
  },
  barActionText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  barActionTextDanger: {
    color: "#f87171",
  },
});
