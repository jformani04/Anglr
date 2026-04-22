// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowIp } from "../_shared/rateLimit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
    const username = String(body?.username ?? "").trim();

    if (!username || username.length < 3) {
      return Response.json({ email: null });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find user_id by username — match against the pre-lowercased column
    // so lookup is always case-insensitive regardless of stored casing.
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("username_lower", username.toLowerCase())
      .single();

    if (!profile?.id) {
      return Response.json({ email: null });
    }

    // Retrieve email from auth.users via admin API
    const { data: userData } = await admin.auth.admin.getUserById(profile.id);
    const email = userData?.user?.email ?? null;

    return Response.json({ email });
  } catch {
    return Response.json({ email: null });
  }
});
