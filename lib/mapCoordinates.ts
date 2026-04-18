type CoordinateRecord = Record<string, unknown>;

export type CoordinateFieldPair = {
  latitude: string;
  longitude: string;
};

const COORDINATE_FIELD_PAIRS: CoordinateFieldPair[] = [
  { latitude: "latitude", longitude: "longitude" },
  { latitude: "lat", longitude: "lng" },
  { latitude: "lat", longitude: "longitude" },
  { latitude: "latitude", longitude: "lng" },
  { latitude: "lat", longitude: "long" },
  { latitude: "latitude", longitude: "long" },
  { latitude: "location_lat", longitude: "location_lng" },
  { latitude: "location_latitude", longitude: "location_longitude" },
  { latitude: "coord_lat", longitude: "coord_lng" },
];

export function logCoordinatePair(message: string, pair: CoordinateFieldPair) {
  console.log(message, pair);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function messageMentionsPair(message: string, pair: CoordinateFieldPair) {
  return (
    message.includes(pair.latitude.toLowerCase()) ||
    message.includes(pair.longitude.toLowerCase())
  );
}

export function normalizeCoordinateRow<T extends CoordinateRecord>(
  row: T
): T & { latitude: number | null; longitude: number | null } {
  for (const pair of COORDINATE_FIELD_PAIRS) {
    const latitude = toFiniteNumber(row[pair.latitude]);
    const longitude = toFiniteNumber(row[pair.longitude]);

    if (latitude !== null && longitude !== null) {
      return {
        ...row,
        latitude,
        longitude,
      };
    }
  }

  const heuristicPair = detectCoordinateFieldPairFromRow(row);
  if (heuristicPair) {
    logCoordinatePair("QUERY USING PAIR:", heuristicPair);
    return {
      ...row,
      latitude: toFiniteNumber(row[heuristicPair.latitude]),
      longitude: toFiniteNumber(row[heuristicPair.longitude]),
    };
  }

  return {
    ...row,
    latitude: toFiniteNumber(row.latitude),
    longitude: toFiniteNumber(row.longitude),
  };
}

function detectCoordinateFieldPairFromRow(row: CoordinateRecord): CoordinateFieldPair | null {
  const keys = Object.keys(row);
  const latitudeKey = keys.find((key) => {
    const lowered = key.toLowerCase();
    return lowered.includes("lat") && !lowered.includes("delta");
  });
  const longitudeKey = keys.find((key) => {
    const lowered = key.toLowerCase();
    return (
      (lowered.includes("lng") ||
        lowered.includes("lon") ||
        lowered.includes("long")) &&
      !lowered.includes("delta")
    );
  });

  if (!latitudeKey || !longitudeKey) {
    return null;
  }

  const latitude = toFiniteNumber(row[latitudeKey]);
  const longitude = toFiniteNumber(row[longitudeKey]);
  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    latitude: latitudeKey,
    longitude: longitudeKey,
  };
}

export function hasResolvedCoordinates(
  row: CoordinateRecord | { latitude: number | null; longitude: number | null }
): row is CoordinateRecord & { latitude: number; longitude: number } {
  const normalized = normalizeCoordinateRow(row as CoordinateRecord);
  return normalized.latitude !== null && normalized.longitude !== null;
}

export function isMissingCoordinateColumnError(
  error: unknown,
  pair?: CoordinateFieldPair
) {
  const message = String(
    (error as { message?: string } | null | undefined)?.message ?? ""
  ).toLowerCase();

  if (!message) return false;

  const looksLikeMissingColumn =
    message.includes("does not exist") || message.includes("schema cache");

  if (!looksLikeMissingColumn) return false;

  if (!pair) {
    return COORDINATE_FIELD_PAIRS.some((candidate) =>
      messageMentionsPair(message, candidate)
    );
  }

  return messageMentionsPair(message, pair);
}

export function getCoordinatePayloadVariants(payload: Record<string, unknown>) {
  const variants: Record<string, unknown>[] = [{ ...payload }];
  const { latitude, longitude, ...rest } = payload;

  if (latitude === undefined && longitude === undefined) {
    return variants;
  }

  for (const pair of COORDINATE_FIELD_PAIRS.slice(1)) {
    variants.push({
      ...rest,
      [pair.latitude]: latitude ?? null,
      [pair.longitude]: longitude ?? null,
    });
  }

  return variants;
}

export async function queryRowsWithCoordinateFallback(
  runQuery: () => PromiseLike<{ data: unknown[] | null; error: unknown }>
) {
  console.log("RUNNING QUERY WITH:", "select(*) + normalize coordinates");
  const result = await runQuery();

  if (result.error) {
    throw result.error;
  }

  const rawRows = (result.data ?? []) as CoordinateRecord[];
  if (rawRows.length > 0) {
    console.log("catch_logs row keys:", Object.keys(rawRows[0]));
  }

  return rawRows.map(normalizeCoordinateRow);
}
