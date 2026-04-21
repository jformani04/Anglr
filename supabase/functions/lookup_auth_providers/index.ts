// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowIp } from "../_shared/rateLimit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function normalizeProviders(user: any): string[] {
  const providers =
    user?.identities
      ?.map((i: any) => String(i?.provider ?? "").toLowerCase())
      .filter(Boolean) ?? [];
  if (!providers.length) {
    const appProvider = String(user?.app_metadata?.provider ?? "").toLowerCase();
    if (appProvider) providers.push(appProvider);
  }
  return Array.from(new Set(providers));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (!allowIp(ip)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const email = String(body?.email ?? "")
      .trim()
      .toLowerCase();

    if (!email || !email.includes("@")) {
      return Response.json({ exists: false, providers: [] });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let user: any | null = null;

    // Prefer direct lookup when available in the runtime SDK.
    if (typeof admin.auth.admin.getUserByEmail === "function") {
      const response = await admin.auth.admin.getUserByEmail(email);
      if (!response.error) {
        user = response.data?.user ?? null;
      }
    }

    // Fallback: page through users and find matching email.
    if (!user) {
      let page = 1;
      while (page <= 10 && !user) {
        const response = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (response.error) break;
        const found = response.data?.users?.find(
          (candidate: any) => String(candidate?.email ?? "").toLowerCase() === email
        );
        if (found) {
          user = found;
          break;
        }
        if (!response.data?.users?.length) break;
        page += 1;
      }
    }

    if (!user) {
      return Response.json({ exists: false, providers: [] });
    }

    return Response.json({
      exists: true,
      providers: normalizeProviders(user),
    });
  } catch {
    return Response.json({ exists: false, providers: [] }, { status: 200 });
  }
});
