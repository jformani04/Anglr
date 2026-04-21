import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { FriendsProvider } from "@/auth/FriendsProvider";
import { startNetworkMonitor, subscribeToNetworkStatus } from "@/lib/network";
import { syncPendingCatchLogs } from "@/lib/catches";
import { supabase } from "@/lib/supabase";
import { router, Stack, useSegments } from "expo-router";
import { useEffect, useRef } from "react";

export default function RootLayout() {
  const segments = useSegments();

  // Refs so the one-time auth listener can read current state without being
  // recreated on every navigation.
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  // Tracks whether a session is active.  null = unknown (first render only).
  // Updated by the one-time onAuthStateChange listener so the segments effect
  // never needs to call getSession() again after cold start.
  const hasSessionRef = useRef<boolean | null>(null);

  // Route guard: re-runs on every navigation. On cold start it calls
  // getSession() once; on all subsequent navigations it reads the cached ref.
  useEffect(() => {
    const inTabsGroup = segments[0] === "(tabs)";
    const inLogRoute = segments[0] === "log";
    const inCallbackRoute = segments[0] === "auth" && segments[1] === "callback";
    const inResetPasswordRoute = segments[0] === "auth" && segments[1] === "reset-password";
    const inProtectedSignedInRoute = inTabsGroup || inLogRoute;

    const applyGuard = (hasSession: boolean) => {
      if (inCallbackRoute || inResetPasswordRoute) return;
      if (hasSession) {
        if (!inProtectedSignedInRoute) router.replace("/home");
      } else if (inProtectedSignedInRoute) {
        router.replace("/");
      }
    };

    if (hasSessionRef.current !== null) {
      // Session state is already known — skip the lock acquisition entirely.
      applyGuard(hasSessionRef.current);
      return;
    }

    // First render (cold start): fetch session once and cache the result.
    supabase.auth.getSession().then(({ data }) => {
      hasSessionRef.current = !!data.session;
      applyGuard(!!data.session);
    });
  }, [segments]);

  // One-time auth state listener for the lifetime of the app.  Keeps
  // hasSessionRef current so the segments effect never calls getSession() again.
  useEffect(() => {
    const listener = supabase.auth.onAuthStateChange((event, session) => {
      hasSessionRef.current = !!session;

      const segs = segmentsRef.current;
      const inTabsGroup = segs[0] === "(tabs)";
      const inLogRoute = segs[0] === "log";
      const inProtectedSignedInRoute = inTabsGroup || inLogRoute;

      if (event === "SIGNED_IN" && session) {
        if (!inProtectedSignedInRoute) {
          router.replace("/home");
        }
      }

      if (event === "SIGNED_OUT" && inProtectedSignedInRoute) {
        router.replace("/");
      }
    });

    return () => listener.data.subscription.unsubscribe();
  }, []);

  return (
    <AuthProvider>
      <FriendsProvider>
        <CatchSyncBootstrap />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="auth/callback" />
          <Stack.Screen name="auth/reset-password" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="log" />
        </Stack>
      </FriendsProvider>
    </AuthProvider>
  );
}

function CatchSyncBootstrap() {
  const { user } = useAuth();

  useEffect(() => {
    const stopMonitor = startNetworkMonitor();
    return stopMonitor;
  }, []);

  useEffect(() => {
    if (!user) return;

    void syncPendingCatchLogs();

    const unsubscribe = subscribeToNetworkStatus((isOnline) => {
      if (isOnline) {
        void syncPendingCatchLogs();
      }
    });

    const interval = setInterval(() => {
      void syncPendingCatchLogs();
    }, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [user]);

  return null;
}
