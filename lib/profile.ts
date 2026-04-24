import { supabase } from "@/lib/supabase";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { getPrimaryProvider, getUserProviders } from "@/lib/authProviders";

const DEBUG = process.env.EXPO_PUBLIC_DEBUG === "1";

export type LengthUnit = "cm" | "in";
export type WeightUnit = "kg" | "lbs";
export type TempUnit = "celsius" | "fahrenheit";

export type Profile = {
  id: string;
  email: string;
  username: string;
  bio: string;
  avatarUrl: string | null;
  createdAt: string | null;
  unitsLength: LengthUnit;
  unitsWeight: WeightUnit;
  unitsTemp: TempUnit;
  authProvider: string;
  authProviders: string[];
};

type ProfileRow = {
  id: string;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string | null;
  units_length?: LengthUnit | null;
  units_weight?: WeightUnit | null;
  units_temp?: TempUnit | null;
};

type ProfileUpdates = Partial<{
  username: string;
  bio: string;
  unitsLength: LengthUnit;
  unitsWeight: WeightUnit;
  unitsTemp: TempUnit;
  avatarUrl: string | null;
}>;

function dlog(message: string, payload?: unknown) {
  if (!DEBUG) return;
  if (payload === undefined) {
    console.log(`[profile] ${message}`);
    return;
  }
  console.log(`[profile] ${message}`, payload);
}

function normalizeUnitLength(value: unknown): LengthUnit {
  return value === "in" ? "in" : "cm";
}

function normalizeUnitWeight(value: unknown): WeightUnit {
  return value === "lbs" ? "lbs" : "kg";
}

function normalizeUnitTemp(value: unknown): TempUnit {
  return value === "fahrenheit" ? "fahrenheit" : "celsius";
}

function sanitizeUsernameCandidate(raw: string): string {
  // Strip characters that don't match [a-zA-Z0-9_.-], collapse to max 30 chars
  const cleaned = raw.replace(/[^a-zA-Z0-9_.\-]/g, "").slice(0, 30);
  return cleaned.length >= 3 ? cleaned : `angler${cleaned}`.slice(0, 30);
}

async function ensureProfileRow(userId: string, email: string | undefined, username?: string) {
  const base = username || sanitizeUsernameCandidate(email?.split("@")[0] ?? "");

  // Try the desired username; if it collides (unique violation = 23505), append
  // a short numeric suffix and retry up to 5 times.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base.slice(0, 27)}${attempt}`;
    const { error } = await supabase.from("profiles").upsert(
      {
        id: userId,
        username: candidate,
        bio: "",
        avatar_url: null,
        units_length: "cm" as LengthUnit,
        units_weight: "kg" as WeightUnit,
        units_temp: "celsius" as TempUnit,
      },
      { onConflict: "id" }
    );
    if (!error) return;
    // 23505 = unique_violation — username taken, try next suffix
    if ((error as any).code !== "23505") throw error;
  }

  throw new Error("Could not create profile: username is unavailable. Please choose another.");
}

export async function getProfile(): Promise<Profile> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("No authenticated user");

  dlog("user id", user.id);

  let { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error && (error as any).code === "PGRST116") {
    const metaUsername = user.user_metadata?.username as string | undefined;
    await ensureProfileRow(user.id, user.email, metaUsername);
    const retry = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  const row = data as ProfileRow;

  const profile: Profile = {
    id: user.id,
    email: user.email ?? "",
    username: row.username ?? user.email?.split("@")[0] ?? "Angler",
    bio: row.bio ?? "",
    avatarUrl: row.avatar_url ?? null,
    createdAt: row.created_at ?? null,
    unitsLength: normalizeUnitLength((row as any).units_length),
    unitsWeight: normalizeUnitWeight((row as any).units_weight),
    unitsTemp: normalizeUnitTemp((row as any).units_temp),
    authProvider: getPrimaryProvider(user),
    authProviders: getUserProviders(user),
  };

  dlog("fetched profile", profile);
  return profile;
}

WebBrowser.maybeCompleteAuthSession();

export async function linkGoogleIdentity(): Promise<void> {
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "anglr",
    path: "auth/callback",
  });

  const authClient: any = supabase.auth as any;
  if (typeof authClient.linkIdentity !== "function") {
    throw new Error("Identity linking is not supported by the current auth client.");
  }

  const { data, error } = await authClient.linkIdentity({
    provider: "google",
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data?.url) return;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
  if (result.type !== "success") {
    throw new Error("Google linking canceled");
  }

  const { params: queryParams } = QueryParams.getQueryParams(result.url);
  const hash = result.url.split("#")[1] ?? "";
  const hashParams = new URLSearchParams(hash);
  const accessToken =
    (queryParams.access_token as string | undefined) ??
    hashParams.get("access_token") ??
    undefined;
  const refreshToken =
    (queryParams.refresh_token as string | undefined) ??
    hashParams.get("refresh_token") ??
    undefined;
  const code =
    (queryParams.code as string | undefined) ?? hashParams.get("code") ?? undefined;

  if (accessToken && refreshToken) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) throw sessionError;
    return;
  }

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return;
  }
}

export async function enableEmailLogin(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: "https://anglrapp.com/reset-password",
  });
  if (error) throw error;
}

export async function upsertProfile(updates: ProfileUpdates): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("No authenticated user");

  const payload = {
    id: user.id,
    username: updates.username,
    bio: updates.bio,
    avatar_url: updates.avatarUrl,
    units_length: updates.unitsLength,
    units_weight: updates.unitsWeight,
    units_temp: updates.unitsTemp,
  };

  const { error } = await supabase.from("profiles").upsert(payload, {
    onConflict: "id",
  });

  if (error) {
    dlog("update failed", error);
    if ((error as any).code === "23505") {
      throw new Error("That username is already taken. Please choose another.");
    }
    throw error;
  }

  dlog("update success");
}

export async function uploadAvatar(fileUri: string): Promise<string> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("No authenticated user");

  const filePath = `${user.id}/${Date.now()}.jpg`;
  const fileBlob = await (await fetch(fileUri)).blob();

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(filePath, fileBlob, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    dlog("upload failed", uploadError);
    throw uploadError;
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
  dlog("upload success", data.publicUrl);
  return data.publicUrl;
}

export async function requestDeleteAccount(): Promise<{ partial: boolean; message?: string }> {
  const invoke = await supabase.functions.invoke("delete_account");
  if (!invoke.error) return { partial: false };

  // Fallback when Edge Functions are unavailable:
  // deletes app-owned data and signs out, but cannot remove auth user itself.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw invoke.error;

  await supabase.from("catch_logs").delete().eq("user_id", user.id);
  await supabase.from("profiles").delete().eq("id", user.id);

  const list = await supabase.storage.from("avatars").list(user.id);
  if (!list.error && list.data.length) {
    const paths = list.data.map((f) => `${user.id}/${f.name}`);
    await supabase.storage.from("avatars").remove(paths);
  }

  return {
    partial: true,
    message:
      "Account data deleted, but auth user deletion requires the delete_account Edge Function.",
  };
}
