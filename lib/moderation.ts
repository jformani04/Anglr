// Content moderation utilities.
// All checks run client-side for instant feedback before any network call.
// To add server-side (API-based) moderation, replace the stub at the bottom
// and await it inside validateImageAsset / checkText as needed.

export type ModerationResult =
  | { ok: true }
  | { ok: false; reason: string };

// ── Image validation ──────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

// Validates an expo-image-picker asset before it is uploaded.
// Checks file size and MIME type — fast, offline, zero-cost.
export function validateImageAsset(asset: {
  fileSize?: number | null;
  mimeType?: string | null;
}): ModerationResult {
  if (asset.fileSize != null && asset.fileSize > MAX_IMAGE_BYTES) {
    const mb = (asset.fileSize / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      reason: `Photo is too large (${mb} MB). Please choose one under 10 MB.`,
    };
  }

  if (asset.mimeType && !ALLOWED_MIME_TYPES.has(asset.mimeType.toLowerCase())) {
    return {
      ok: false,
      reason: "Only JPEG, PNG, WebP, and HEIC photos are supported.",
    };
  }

  return { ok: true };
}

// ── Text validation ───────────────────────────────────────────────────────────

const MAX_TEXT_LENGTH = 2000;

// Validates free-form user text before it is persisted.
// Returns ok: false with a user-friendly reason if the text is rejected.
export function checkText(text: string): ModerationResult {
  const t = text.trim();
  if (!t) return { ok: true };

  if (t.length > MAX_TEXT_LENGTH) {
    return {
      ok: false,
      reason: `Text is too long (${t.length} characters). Please keep it under ${MAX_TEXT_LENGTH}.`,
    };
  }

  // Block external links — UGC fields are not a place for URLs
  if (/https?:\/\//i.test(t) || /\bwww\./i.test(t)) {
    return { ok: false, reason: "Links are not allowed in this field." };
  }

  // Detect character-spam (10+ identical characters in a row)
  if (/(.)\1{9,}/.test(t)) {
    return { ok: false, reason: "Please enter a meaningful value." };
  }

  return { ok: true };
}

// ── Username validation ───────────────────────────────────────────────────────

const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 30;
const VALID_USERNAME_RE = /^[a-zA-Z0-9_.-]+$/;

// Validates a username for format and length before it is saved.
export function checkUsername(username: string): ModerationResult {
  const u = username.trim();

  if (u.length < MIN_USERNAME_LENGTH) {
    return {
      ok: false,
      reason: `Username must be at least ${MIN_USERNAME_LENGTH} characters.`,
    };
  }

  if (u.length > MAX_USERNAME_LENGTH) {
    return {
      ok: false,
      reason: `Username must be ${MAX_USERNAME_LENGTH} characters or fewer.`,
    };
  }

  if (!VALID_USERNAME_RE.test(u)) {
    return {
      ok: false,
      reason: "Username can only contain letters, numbers, underscores, dashes, and dots.",
    };
  }

  return { ok: true };
}

// ── Extension point ───────────────────────────────────────────────────────────
// To add API-based moderation (e.g. Google Vision Safe Search, AWS Rekognition,
// or Perspective API for text), call your Supabase Edge Function here and map
// its response to ModerationResult.  The callers above already await the result,
// so adding an async API call only requires changing these stubs — no changes
// needed in the UI files.
//
// Example:
//
//   export async function moderateImageViaApi(uri: string): Promise<ModerationResult> {
//     const { data, error } = await supabase.functions.invoke("moderate-image", {
//       body: { uri },
//     });
//     if (error || data?.flagged) return { ok: false, reason: "Image was flagged for review." };
//     return { ok: true };
//   }
