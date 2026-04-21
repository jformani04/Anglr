import { COLORS } from "@/lib/colors";
import { supabase } from "@/lib/supabase";
import { validateRegisterPassword } from "@/lib/validation/authValidation";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ScreenState = "loading" | "form" | "success" | "error";

function parseResetUrl(url: string) {
  // Implicit flow: tokens in hash fragment (#access_token=...&type=recovery)
  const hash = url.split("#")[1] ?? "";
  const hashParams = new URLSearchParams(hash);
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token") ?? "";
  if (accessToken && hashParams.get("type") === "recovery") {
    return { accessToken, refreshToken };
  }

  // PKCE flow: code in query string (?code=...)
  const query = url.split("?")[1]?.split("#")[0] ?? "";
  const code = new URLSearchParams(query).get("code");
  if (code) return { code };

  return null;
}

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let handled = false;

    async function processUrl(url: string | null) {
      if (handled || !url) return;

      const parsed = parseResetUrl(url);
      if (!parsed) return;

      handled = true;
      try {
        if ("code" in parsed) {
          const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
          if (error) throw error;
        } else {
          const { error } = await supabase.auth.setSession({
            access_token: parsed.accessToken,
            refresh_token: parsed.refreshToken,
          });
          if (error) throw error;
        }
        setScreenState("form");
      } catch {
        setTokenError("This link is invalid or has expired. Please request a new one.");
        setScreenState("error");
      }
    }

    // Cold start: app opened directly from the reset link
    Linking.getInitialURL().then(processUrl);

    // Warm start: app was backgrounded when the link was tapped
    const sub = Linking.addEventListener("url", ({ url }) => processUrl(url));

    // If no valid URL arrives within 4 seconds the user navigated here manually
    const fallback = setTimeout(() => {
      if (!handled) {
        setTokenError("No reset link detected. Please tap the link in your email.");
        setScreenState("error");
      }
    }, 4000);

    return () => {
      sub.remove();
      clearTimeout(fallback);
    };
  }, []);

  const handleSubmit = async () => {
    const trimmedPassword = password.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedPassword) {
      setFormError("Please enter a new password.");
      return;
    }

    const validation = validateRegisterPassword(trimmedPassword);
    if (!validation.valid) {
      setFormError(validation.message ?? "Password is too weak.");
      return;
    }

    if (trimmedPassword !== trimmedConfirm) {
      setFormError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: trimmedPassword });
      if (error) throw error;
      setScreenState("success");
    } catch (err: any) {
      setFormError(err?.message ?? "Unable to update password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        {screenState === "loading" && (
          <View style={styles.centeredContent}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            <Text style={styles.loadingText}>Verifying reset link...</Text>
          </View>
        )}

        {screenState === "error" && (
          <>
            <Text style={styles.title}>Link Expired</Text>
            <Text style={styles.subtitle}>{tokenError}</Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => router.replace("/forgot_password")}
            >
              <Text style={styles.buttonText}>Request New Link</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.replace("/")} style={styles.backLink}>
              <Text style={styles.backLinkText}>Back to Sign In</Text>
            </TouchableOpacity>
          </>
        )}

        {screenState === "form" && (
          <>
            <Text style={styles.title}>New Password</Text>
            <Text style={styles.subtitle}>
              Choose a strong password for your account.
            </Text>

            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.input, formError ? styles.inputError : null]}
                placeholder="New password"
                placeholderTextColor={COLORS.textSecondary}
                secureTextEntry
                value={password}
                onChangeText={(v) => { setPassword(v); setFormError(null); }}
              />
            </View>

            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.input, formError ? styles.inputError : null]}
                placeholder="Confirm new password"
                placeholderTextColor={COLORS.textSecondary}
                secureTextEntry
                value={confirmPassword}
                onChangeText={(v) => { setConfirmPassword(v); setFormError(null); }}
              />
            </View>

            {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

            <TouchableOpacity
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Text style={styles.buttonText}>
                {submitting ? "Updating..." : "Update Password"}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {screenState === "success" && (
          <View style={styles.successBox}>
            <Text style={styles.successTitle}>Password updated</Text>
            <Text style={styles.successText}>
              Your password has been changed. You can now use it to sign in.
            </Text>
            <TouchableOpacity
              style={[styles.button, styles.successButton]}
              onPress={() => router.replace("/home")}
            >
              <Text style={styles.buttonText}>Go to App</Text>
            </TouchableOpacity>
          </View>
        )}
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
  centeredContent: {
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 15,
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
  backLink: {
    marginTop: 24,
    alignItems: "center",
  },
  backLinkText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  successBox: {
    backgroundColor: "rgba(100,200,120,0.12)",
    borderWidth: 1,
    borderColor: "rgba(100,200,120,0.35)",
    borderRadius: 14,
    padding: 20,
    gap: 10,
  },
  successTitle: {
    color: "#7EE8A2",
    fontSize: 16,
    fontWeight: "700",
  },
  successText: {
    color: "#7EE8A2",
    fontSize: 14,
    lineHeight: 21,
  },
  successButton: {
    marginTop: 6,
  },
});
