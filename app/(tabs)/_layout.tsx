import { Stack } from "expo-router";
import { useEffect } from "react";
import { router } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";

export default function TabsLayout() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/");
    }
  }, [loading, user]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
      }}
      initialRouteName="home"
    >
      <Stack.Screen name="home" />
      <Stack.Screen name="catches/index" />
      <Stack.Screen name="catches/[catchId]" />
      <Stack.Screen name="favorites/index" />
      <Stack.Screen name="profile/index" />
    </Stack>
  );
}
