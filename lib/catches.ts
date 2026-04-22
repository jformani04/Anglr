import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { getUserFacingErrorMessage, withTimeout } from "@/lib/errorHandling";
import {
  hasResolvedCoordinates,
  normalizeCoordinateRow,
  queryRowsWithCoordinateFallback,
} from "@/lib/mapCoordinates";
import { isLikelyNetworkError, refreshNetworkStatus } from "@/lib/network";
import { fileUriToUploadBody, isLocalFileUri } from "@/lib/upload";

const DEBUG = process.env.EXPO_PUBLIC_DEBUG === "1";

export interface CatchLog {
  id: string;
  imageUrl: string;
  species: string;
  length: string;
  weight: string;
  location: string;
  temperature: string;
  weather: string;
  lure: string;
  method: string;
  notes: string;
  isPublic: boolean;
  isFriendsOnly: boolean;
  isFavorite: boolean;
  hideLocation: boolean;
  date: string;
  latitude?: number | null;
  longitude?: number | null;
  syncStatus?: "pending" | "synced" | "failed";
}

export type MapCatchPin = {
  id: string;
  species: string;
  latitude: number;
  longitude: number;
  imageUrl: string;
  date: string;
};

type CatchLogRow = {
  id: string;
  user_id: string;
  image_url: string | null;
  species: string | null;
  length: string | null;
  weight: string | null;
  location: string | null;
  temperature: string | null;
  weather: string | null;
  lure: string | null;
  method: string | null;
  notes: string | null;
  is_public: boolean | null;
  is_friends_only: boolean | null;
  is_favorite: boolean | null;
  hide_location: boolean | null;
  date: string | null;
  created_at: string;
  latitude?: number | null;
  longitude?: number | null;
};

type CatchLogUpdateRow = {
  image_url: string;
  species: string;
  length: string;
  weight: string;
  location: string;
  temperature: string;
  weather: string;
  lure: string;
  method: string;
  notes: string;
  is_public: boolean;
  is_friends_only: boolean;
  is_favorite: boolean;
  hide_location: boolean;
  date: string;
  latitude?: number | null;
  longitude?: number | null;
};

type CatchLogInsertInput = Omit<CatchLog, "id">;

type PendingCatchRecord = {
  queuedAt: string;
  lastError: string | null;
  userId: string;
  catchLog: CatchLog;
};

type CreateCatchLogResult = {
  catchId: string;
  syncStatus: "pending" | "synced";
};

const PENDING_CATCHES_STORAGE_KEY = "anglr.pending-catches.v1";
const REQUEST_TIMEOUT_MS = 12000;

function debugLog(message: string, payload?: unknown) {
  if (!DEBUG) return;
  if (payload === undefined) {
    console.log(`[catches] ${message}`);
    return;
  }
  console.log(`[catches] ${message}`, payload);
}

function isMissingColumnError(error: any, column: string): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes(column) && message.includes("schema cache");
}

function stripOptionalColumns<T extends Record<string, any>>(payload: T, columns: string[]) {
  const cloned = { ...payload };
  for (const key of columns) {
    delete cloned[key];
  }
  return cloned;
}

export function mapCatchLogRowToCatchLog(row: CatchLogRow): CatchLog {
  const normalizedRow = normalizeCoordinateRow(row as unknown as Record<string, unknown>);
  return {
    id: row.id,
    imageUrl: row.image_url ?? "",
    species: row.species ?? "",
    length: row.length ?? "",
    weight: row.weight ?? "",
    location: row.location ?? "",
    temperature: row.temperature ?? "",
    weather: row.weather ?? "",
    lure: row.lure ?? "",
    method: row.method ?? "",
    notes: row.notes ?? "",
    isPublic: row.is_public ?? false,
    isFriendsOnly: row.is_friends_only ?? false,
    isFavorite: row.is_favorite ?? false,
    hideLocation: row.hide_location ?? false,
    date: row.date ?? "",
    latitude: normalizedRow.latitude,
    longitude: normalizedRow.longitude,
    syncStatus: "synced",
  };
}

export function mapCatchLogToUpdateRow(catchLog: CatchLog): CatchLogUpdateRow {
  return {
    image_url: catchLog.imageUrl,
    species: catchLog.species,
    length: catchLog.length,
    weight: catchLog.weight,
    location: catchLog.location,
    temperature: catchLog.temperature,
    weather: catchLog.weather,
    lure: catchLog.lure,
    method: catchLog.method,
    notes: catchLog.notes,
    is_public: catchLog.isPublic,
    is_friends_only: catchLog.isFriendsOnly,
    is_favorite: catchLog.isFavorite,
    hide_location: catchLog.hideLocation,
    date: catchLog.date,
    latitude: catchLog.latitude ?? null,
    longitude: catchLog.longitude ?? null,
  };
}

export async function getUserCatchLogs(userId: string): Promise<CatchLog[]> {
  debugLog("fetch user catches user_id", userId);

  const remotePromise = withTimeout<any>(
    supabase.from("catch_logs").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    REQUEST_TIMEOUT_MS,
    "Loading your catches took too long."
  );

  try {
    const [{ data, error }, pending] = await Promise.all([
      remotePromise,
      getPendingCatchRecords(userId),
    ]);

    if (error) {
      debugLog("fetch failed", error);
      throw error;
    }

    const remoteRows = ((data ?? []) as CatchLogRow[]).map(mapCatchLogRowToCatchLog);
    const merged = mergeCatchLists(remoteRows, pending.map((record) => record.catchLog));
    debugLog("fetch count", merged.length);
    return merged;
  } catch (error) {
    const pending = await getPendingCatchRecords(userId);
    if (pending.length > 0 && isLikelyNetworkError(error)) {
      return pending
        .map((record) => record.catchLog)
        .sort((a, b) => getCatchSortTime(b) - getCatchSortTime(a));
    }

    throw wrapCatchError(error, "Failed to load catches.");
  }
}

export async function getUserFavoriteCatchLogs(userId: string): Promise<CatchLog[]> {
  const all = await getUserCatchLogs(userId);
  return all.filter((row) => row.isFavorite);
}

export function getCatchStats(catches: CatchLog[]) {
  const speciesSet = new Set(
    catches
      .map((item) => item.species.trim().toLowerCase())
      .filter((item) => item.length > 0)
  );

  return {
    totalCatches: catches.length,
    speciesCount: speciesSet.size,
  };
}

export async function getCatchLogById(
  catchId: string,
  userId: string
): Promise<CatchLog | null> {
  const pending = await getPendingCatchById(userId, catchId);
  if (pending) return pending.catchLog;

  const { data, error } = await withTimeout<any>(
    supabase
      .from("catch_logs")
      .select("*")
      .eq("id", catchId)
      .eq("user_id", userId)
      .single(),
    REQUEST_TIMEOUT_MS,
    "Loading this catch took too long."
  );

  if (error) {
    if ((error as any).code === "PGRST116") return null;
    throw wrapCatchError(error, "Unable to load catch.");
  }

  return mapCatchLogRowToCatchLog(data as CatchLogRow);
}

export async function updateCatchLog(catchLog: CatchLog): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("No authenticated user");

  debugLog("update catch user_id", user.id);

  const pending = await getPendingCatchById(user.id, catchLog.id);
  if (pending) {
    await upsertPendingCatchRecord(user.id, {
      queuedAt: pending.queuedAt,
      lastError: pending.lastError,
      catchLog: {
        ...catchLog,
        imageUrl: catchLog.imageUrl || pending.catchLog.imageUrl,
        syncStatus: "pending",
      },
    });
    return;
  }

  const payload = mapCatchLogToUpdateRow(catchLog);

  let error = await runCatchMutationWithCoordinateFallback(
    (variant) =>
      withTimeout<any>(
        supabase
          .from("catch_logs")
          .update(variant)
          .eq("id", catchLog.id)
          .eq("user_id", user.id),
        REQUEST_TIMEOUT_MS,
        "Saving your changes took too long."
      ),
    payload
  );

  if (error) {
    debugLog("update failed", error);
    throw wrapCatchError(error, "Unable to update catch.");
  }

  debugLog("update success catch_id", catchLog.id);
}

export async function createCatchLog(input: CatchLogInsertInput): Promise<CreateCatchLogResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("No authenticated user");

  debugLog("create catch user_id", user.id);

  const catchId = crypto.randomUUID();
  const catchLog: CatchLog = {
    ...input,
    id: catchId,
    syncStatus: "pending",
  };

  const isOnline = await refreshNetworkStatus();
  if (!isOnline) {
    await queuePendingCatch(user.id, catchLog);
    return { catchId, syncStatus: "pending" };
  }

  const payload = {
    id: catchId,
    user_id: user.id,
    // Never store a local file:// URI in the DB — background upload handles it
    image_url: isLocalFileUri(catchLog.imageUrl) ? "" : catchLog.imageUrl,
    species: catchLog.species,
    length: catchLog.length,
    weight: catchLog.weight,
    location: catchLog.location,
    temperature: catchLog.temperature,
    weather: catchLog.weather,
    lure: catchLog.lure,
    method: catchLog.method,
    notes: catchLog.notes,
    is_public: catchLog.isPublic,
    is_friends_only: catchLog.isFriendsOnly,
    is_favorite: catchLog.isFavorite,
    hide_location: catchLog.hideLocation,
    date: catchLog.date,
    latitude: catchLog.latitude ?? null,
    longitude: catchLog.longitude ?? null,
  };

  try {
    await insertCatchRow(payload);
    debugLog("create success");
    return { catchId, syncStatus: "synced" };
  } catch (error) {
    if (isLikelyNetworkError(error)) {
      await queuePendingCatch(user.id, catchLog);
      return { catchId, syncStatus: "pending" };
    }

    debugLog("create failed", error);
    throw wrapCatchError(error, "Unable to save catch.");
  }
}

export async function getMapCatchPins(userId: string): Promise<MapCatchPin[]> {
  debugLog("fetch map pins user_id", userId);

  try {
    const rows = await queryRowsWithCoordinateFallback(() =>
      withTimeout<any>(
        supabase
          .from("catch_logs")
          .select("*")
          .eq("user_id", userId),
        REQUEST_TIMEOUT_MS,
        "Loading the map took too long."
      )
    );

    return rows
      .filter(hasResolvedCoordinates)
      .map((row) => ({
        id: row.id as string,
        species: (row.species as string | null) ?? "Unknown",
        latitude: row.latitude,
        longitude: row.longitude,
        imageUrl: (row.image_url as string | null) ?? "",
        date: (row.date as string | null) ?? "",
      }));
  } catch (error) {
    debugLog("fetch map pins failed", error);
    throw wrapCatchError(error, "Unable to load map pins.");
  }
}

export async function uploadCatchPhoto(fileUri: string): Promise<string> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("No authenticated user");

  const filePath = `${user.id}/${Date.now()}.jpg`;
  const uploadBody = await fileUriToUploadBody(fileUri);

  const { error: uploadError } = await withTimeout(
    supabase.storage.from("catch_photos").upload(filePath, uploadBody, {
      contentType: "image/jpeg",
      upsert: false,
    }),
    REQUEST_TIMEOUT_MS,
    "Uploading your catch photo took too long."
  );

  if (uploadError) {
    debugLog("catch photo upload failed", uploadError);
    throw wrapCatchError(uploadError, "Unable to upload your catch photo.");
  }

  const { data } = supabase.storage.from("catch_photos").getPublicUrl(filePath);
  debugLog("catch photo upload success", data.publicUrl);
  return data.publicUrl;
}

export async function deleteCatchLog(catchId: string): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("No authenticated user");

  debugLog("delete catch user_id", user.id);

  const pending = await getPendingCatchById(user.id, catchId);
  if (pending) {
    await removePendingCatchRecord(user.id, catchId);
    return;
  }

  const { error } = await withTimeout<any>(
    supabase
      .from("catch_logs")
      .delete()
      .eq("id", catchId)
      .eq("user_id", user.id),
    REQUEST_TIMEOUT_MS,
    "Deleting this catch took too long."
  );

  if (error) {
    debugLog("delete failed", error);
    throw wrapCatchError(error, "Unable to delete catch.");
  }

  debugLog("delete success catch_id", catchId);
}

export async function seedDevCatchLog(userId: string): Promise<void> {
  const payload = {
    user_id: userId,
    image_url: "",
    species: "Largemouth Bass",
    length: "45 cm",
    weight: "2.3 kg",
    location: "Lake Okeechobee",
    temperature: "22C",
    weather: "Sunny",
    lure: "Plastic worm",
    method: "Spin",
    notes: "Dev seeded catch for testing.",
    is_public: true,
    is_favorite: false,
    hide_location: false,
    date: new Date().toISOString(),
  };

  let { error } = await supabase.from("catch_logs").insert(payload);
  if (
    error &&
    (isMissingColumnError(error, "hide_location") ||
      isMissingColumnError(error, "is_favorite"))
  ) {
    const legacyPayload = stripOptionalColumns(payload, ["hide_location", "is_favorite"]);
    const retry = await supabase.from("catch_logs").insert(legacyPayload);
    error = retry.error;
  }
  if (error) throw error;
}

export async function syncPendingCatchLogs(): Promise<number> {
  // getSession is cached and never throws — use it to bail out fast when signed out
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 0;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) return 0;
  if (!user) return 0;

  const isOnline = await refreshNetworkStatus();
  if (!isOnline) return 0;

  const pending = await getPendingCatchRecords(user.id);
  if (pending.length === 0) return 0;

  let syncedCount = 0;

  for (const record of pending) {
    try {
      const catchLog = await preparePendingCatchForSync(record.catchLog);
      await insertCatchRow({
        id: catchLog.id,
        user_id: user.id,
        image_url: catchLog.imageUrl,
        species: catchLog.species,
        length: catchLog.length,
        weight: catchLog.weight,
        location: catchLog.location,
        temperature: catchLog.temperature,
        weather: catchLog.weather,
        lure: catchLog.lure,
        method: catchLog.method,
        notes: catchLog.notes,
        is_public: catchLog.isPublic,
        is_friends_only: catchLog.isFriendsOnly,
        is_favorite: catchLog.isFavorite,
        hide_location: catchLog.hideLocation,
        date: catchLog.date,
        latitude: catchLog.latitude ?? null,
        longitude: catchLog.longitude ?? null,
      });

      await removePendingCatchRecord(user.id, record.catchLog.id);
      syncedCount += 1;
    } catch (error) {
      if (isDuplicatePrimaryKeyError(error)) {
        await removePendingCatchRecord(user.id, record.catchLog.id);
        syncedCount += 1;
        continue;
      }

      if (isLikelyNetworkError(error)) {
        // Transient — preserve current status, retry on next connection
        await upsertPendingCatchRecord(user.id, {
          ...record,
          lastError: getUserFacingErrorMessage(error, "Network issue while syncing."),
        });
        break;
      }

      // Permanent error — mark failed so the user can see it; still retried on next sync
      await upsertPendingCatchRecord(user.id, {
        ...record,
        catchLog: { ...record.catchLog, syncStatus: "failed" },
        lastError: getUserFacingErrorMessage(error, "Unable to sync this catch."),
      });
    }
  }

  return syncedCount;
}

async function preparePendingCatchForSync(catchLog: CatchLog): Promise<CatchLog> {
  if (!isLocalFileUri(catchLog.imageUrl)) {
    return {
      ...catchLog,
      syncStatus: "synced",
    };
  }

  const imageUrl = await uploadCatchPhoto(catchLog.imageUrl);
  return {
    ...catchLog,
    imageUrl,
    syncStatus: "synced",
  };
}

async function insertCatchRow(payload: Record<string, unknown>) {
  const error = await runCatchMutationWithCoordinateFallback(
    (variant) =>
      withTimeout<any>(
        supabase.from("catch_logs").insert(variant),
        REQUEST_TIMEOUT_MS,
        "Saving your catch took too long."
      ),
    payload
  );

  if (error) throw error;
}

async function runCatchMutationWithCoordinateFallback(
  execute: (payload: Record<string, unknown>) => Promise<{ error: any }>,
  payload: Record<string, unknown>
) {
  // Try full payload first (expected case: schema has all columns)
  const attempt = await execute(payload);
  if (!attempt.error) return null;

  const err = attempt.error;

  // Coordinate columns are optional — retry without them if the schema doesn't
  // have them yet. Strip only coordinates here; is_favorite and hide_location
  // are separate concerns and must not be lost in this fallback.
  if (isMissingColumnError(err, "latitude") || isMissingColumnError(err, "longitude")) {
    const withoutCoords = stripOptionalColumns(payload, ["latitude", "longitude"]);
    const retry = await execute(withoutCoords);
    if (!retry.error) return null;

    // If still failing (e.g. other legacy columns also missing), drop them too.
    if (
      isMissingColumnError(retry.error, "hide_location") ||
      isMissingColumnError(retry.error, "is_favorite")
    ) {
      const legacy = stripOptionalColumns(withoutCoords, ["hide_location", "is_favorite"]);
      return (await execute(legacy)).error;
    }

    return retry.error;
  }

  // Handle case where only the boolean flags are missing (no coordinate issue).
  if (
    isMissingColumnError(err, "hide_location") ||
    isMissingColumnError(err, "is_favorite") ||
    isMissingColumnError(err, "is_friends_only")
  ) {
    const legacy = stripOptionalColumns(payload, ["hide_location", "is_favorite", "is_friends_only"]);
    return (await execute(legacy)).error;
  }

  return err;
}

function isDuplicatePrimaryKeyError(error: unknown) {
  const code = String((error as { code?: string } | null | undefined)?.code ?? "");
  const message = String(
    (error as { message?: string } | null | undefined)?.message ?? ""
  ).toLowerCase();

  return code === "23505" || message.includes("duplicate key");
}

function wrapCatchError(error: unknown, fallback: string) {
  const message = getUserFacingErrorMessage(error, fallback);
  return new Error(message);
}

function getCatchSortTime(catchLog: CatchLog) {
  const timestamp = Date.parse(catchLog.date);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function mergeCatchLists(remote: CatchLog[], pending: CatchLog[]) {
  const merged = new Map<string, CatchLog>();

  remote.forEach((catchLog) => merged.set(catchLog.id, { ...catchLog, syncStatus: "synced" }));
  pending.forEach((catchLog) => merged.set(catchLog.id, catchLog));

  return [...merged.values()].sort((a, b) => getCatchSortTime(b) - getCatchSortTime(a));
}

async function getPendingCatchRecords(userId: string): Promise<PendingCatchRecord[]> {
  const raw = await AsyncStorage.getItem(PENDING_CATCHES_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as PendingCatchRecord[];
    return parsed.filter((record) => record.userId === userId);
  } catch {
    return [];
  }
}

async function getAllPendingCatchRecords(): Promise<PendingCatchRecord[]> {
  const raw = await AsyncStorage.getItem(PENDING_CATCHES_STORAGE_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as PendingCatchRecord[];
  } catch {
    return [];
  }
}

async function getPendingCatchById(userId: string, catchId: string) {
  const pending = await getPendingCatchRecords(userId);
  return pending.find((record) => record.catchLog.id === catchId) ?? null;
}

async function queuePendingCatch(userId: string, catchLog: CatchLog) {
  await upsertPendingCatchRecord(userId, {
    userId,
    queuedAt: new Date().toISOString(),
    lastError: null,
    catchLog: {
      ...catchLog,
      syncStatus: "pending",
    },
  });
}

async function upsertPendingCatchRecord(
  userId: string,
  nextRecord: Omit<PendingCatchRecord, "userId"> & { userId?: string }
) {
  const allRecords = await getAllPendingCatchRecords();
  const normalizedRecord: PendingCatchRecord = {
    userId,
    queuedAt: nextRecord.queuedAt,
    lastError: nextRecord.lastError ?? null,
    catchLog: {
      ...nextRecord.catchLog,
      syncStatus: nextRecord.catchLog.syncStatus === "failed" ? "failed" : "pending",
    },
  };

  const remaining = allRecords.filter(
    (record) =>
      !(record.userId === userId && record.catchLog.id === normalizedRecord.catchLog.id)
  );

  remaining.push(normalizedRecord);
  await AsyncStorage.setItem(PENDING_CATCHES_STORAGE_KEY, JSON.stringify(remaining));
}

async function removePendingCatchRecord(userId: string, catchId: string) {
  const allRecords = await getAllPendingCatchRecords();
  const remaining = allRecords.filter(
    (record) => !(record.userId === userId && record.catchLog.id === catchId)
  );

  await AsyncStorage.setItem(PENDING_CATCHES_STORAGE_KEY, JSON.stringify(remaining));
}
