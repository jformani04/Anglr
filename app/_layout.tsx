import { AuthProvider } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { router, Stack, useSegments } from "expo-router";
import { useEffect } from "react";

export default function RootLayout() {
  const segments = useSegments();

  useEffect(() => {
    const inTabsGroup = segments[0] === "(tabs)";
    const inLogRoute = segments[0] === "log";
    const inCallbackRoute = segments[0] === "auth" && segments[1] === "callback";
    const inProtectedSignedInRoute = inTabsGroup || inLogRoute;

    supabase.auth.getSession().then(({ data }) => {
      if (inCallbackRoute) return;

      if (data.session) {
        if (!inProtectedSignedInRoute) {
          router.replace("/home");
        }
      } else if (inProtectedSignedInRoute) {
        router.replace("/");
      }
    });

    const listener = supabase.auth.onAuthStateChange((event, session) => {
      // Ignore token refresh/update events to avoid replace loops.
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
  }, [segments]);

  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="log" />
      </Stack>
    </AuthProvider>
  );
}
