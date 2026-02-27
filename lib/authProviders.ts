import type { User } from "@supabase/supabase-js";

export type AuthProvider = "google" | "email" | string;

export function getUserProviders(user: User | null | undefined): AuthProvider[] {
  if (!user) return [];

  const fromIdentities =
    user.identities
      ?.map((identity: any) => String(identity?.provider ?? "").toLowerCase())
      .filter(Boolean) ?? [];

  if (fromIdentities.length) {
    return Array.from(new Set(fromIdentities));
  }

  const appProvider = String(user.app_metadata?.provider ?? "").toLowerCase();
  if (appProvider) return [appProvider];
  return [];
}

export function getPrimaryProvider(user: User | null | undefined): AuthProvider {
  const providers = getUserProviders(user);
  if (providers.includes("google")) return "google";
  if (providers.includes("email")) return "email";
  return providers[0] ?? "email";
}

export function hasProvider(
  user: User | null | undefined,
  provider: AuthProvider
): boolean {
  return getUserProviders(user).includes(provider);
}
