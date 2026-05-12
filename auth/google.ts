import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { supabase } from "@/lib/supabase";

const DEBUG = process.env.EXPO_PUBLIC_DEBUG === "1";

WebBrowser.maybeCompleteAuthSession();
let googleSignInInFlight = false;

export async function signInWithGoogle() {
  if (googleSignInInFlight) {
    if (DEBUG) console.log("[google] sign-in already in progress");
    return;
  }

  googleSignInInFlight = true;

  try {
    // Redirect back into the app on a real route so Expo Router does not show "not found".
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: "anglr",
      path: "auth/callback",
    });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUri,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;
    if (!data?.url) throw new Error("No OAuth URL returned");

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

    // User deliberately closed the browser — not an error, exit silently.
    if (result.type === "cancel" || result.type === "dismiss") {
      return;
    }

    if (result.type !== "success") {
      throw new Error("Sign-in failed. Please try again.");
    }

    // Some providers return tokens in the query string, others in the URL fragment.
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

    let authenticatedUserId: string | null = null;
    let authenticatedUser:
      | {
          id: string;
          email?: string | null;
          user_metadata?: Record<string, any>;
        }
      | null = null;

    if (accessToken && refreshToken) {
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) throw sessionError;
      authenticatedUser = (sessionData.session?.user as any) ?? null;
    } else if (code) {
      const { data: exchangeData, error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
      authenticatedUser = (exchangeData.user as any) ?? (exchangeData.session?.user as any) ?? null;
    } else {
      throw new Error("Missing OAuth tokens/code from Google login callback");
    }

    if (!authenticatedUser) {
      // Fallback: auth state listener may already have persisted the session.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      authenticatedUser = (session?.user as any) ?? null;
    }

    if (!authenticatedUser) {
      throw new Error("No user returned after login");
    }

    authenticatedUserId = authenticatedUser.id;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authenticatedUserId)
      .single();

    if (profileError && profileError.code !== "PGRST116") {
      throw profileError;
    }

    if (!profile) {
      const { error: insertError } = await supabase.from("profiles").insert({
        id: authenticatedUserId,
        username:
          (authenticatedUser.user_metadata?.full_name as string | undefined) ||
          authenticatedUser.email?.split("@")[0] ||
          "",
        avatar_url: (authenticatedUser.user_metadata?.avatar_url as string | null) || null,
        bio: null,
      });

      if (insertError) {
        if (insertError.code === "42501") {
          throw new Error(
            'Supabase blocked profile creation (RLS policy). Add an INSERT policy on "profiles" allowing auth.uid() = id.'
          );
        }
        throw new Error(insertError.message);
      }
    }

    if (DEBUG) console.log("[google] sign-in successful");
  } catch (err: any) {
    console.error("[google] sign-in error:", err.message);
    throw err;
  } finally {
    googleSignInInFlight = false;
  }
}
