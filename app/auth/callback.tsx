import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useEffect } from "react";
import { router } from "expo-router";
import { COLORS } from "@/lib/colors";

export default function AuthCallbackScreen() {
  useEffect(() => {
    // Auth state listener in app/_layout will usually redirect to home.
    // This fallback prevents users from getting stuck on the callback route.
    const timer = setTimeout(() => {
      router.replace("/home");
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={COLORS.primary} size="large" />
      <Text style={styles.text}>Finishing sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: COLORS.background,
  },
  text: {
    color: COLORS.text,
    fontSize: 16,
  },
});
