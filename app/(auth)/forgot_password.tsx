import { COLORS } from "@/lib/colors";
import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ForgotPassword() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase();

    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed);

      if (resetError) throw resetError;

      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? "Unable to send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>
          Enter your email and we&apos;ll send you a link to reset your password.
        </Text>

        {sent ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>
              Check your inbox — a reset link has been sent to {email.trim().toLowerCase()}.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.input, error ? styles.inputError : null]}
                placeholder="Email address"
                placeholderTextColor={COLORS.textSecondary}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (error) setError(null);
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? "Sending..." : "Send Reset Link"}
              </Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 32,
    lineHeight: 20,
  },
  inputWrapper: {
    marginBottom: 12,
  },
  input: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    color: COLORS.text,
  },
  inputError: {
    borderColor: "#FF6B6B",
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 13,
    marginBottom: 12,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 30,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600",
  },
  successBox: {
    backgroundColor: "rgba(100,200,120,0.12)",
    borderWidth: 1,
    borderColor: "rgba(100,200,120,0.35)",
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  successText: {
    color: "#7EE8A2",
    fontSize: 14,
    lineHeight: 20,
  },
  backLink: {
    marginTop: 24,
    alignItems: "center",
  },
  backLinkText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "600",
  },
});
