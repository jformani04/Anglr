import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, Image, StyleSheet } from "react-native";
import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import { signInWithGoogle } from "@/auth/google";
import { isLikelyNetworkError } from "@/lib/network";
import { COLORS } from "@/lib/colors";
import {
  EMAIL_REGEX,
  mapAuthErrorMessage,
  sanitizeInput,
  validateConfirmPassword,
  validateEmail,
  validateLoginPassword,
  validateRegisterPassword,
  validateUsername,
} from "@/lib/validation/authValidation";

const google_icon = require("@/assets/images/google_icon.png");
const DEBUG = process.env.EXPO_PUBLIC_DEBUG === "1";
const GOOGLE_ONLY_LOGIN_MESSAGE =
  "This email is registered with Google. Please sign in with Google.";

type AuthMode = "login" | "register";

type AuthFormProps = {
  mode: AuthMode;
};

type AuthResult =
  | { success: true; session?: any; message?: string }
  | { success: false; error: string };

export default function AuthForm({ mode }: AuthFormProps) {
  const isLogin = mode === "login";
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthHint, setOauthHint] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Tick the resend cooldown down by one second until it reaches zero.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const clearErrors = () => {
    setFormError(null);
    setOauthHint(null);
    setSuccessMessage(null);
  };

  const validateBeforeSubmit = () => {
    const normalizedIdentifier = sanitizeInput(email);
    const normalizedPassword = sanitizeInput(password);
    const normalizedConfirm = sanitizeInput(confirmPassword);
    const normalizedUsername = sanitizeInput(username);

    if (isLogin) {
      // Accept an email address or a username (min 3 chars, no @ required)
      const isEmailFormat = EMAIL_REGEX.test(normalizedIdentifier);
      if (isEmailFormat) {
        const emailValidation = validateEmail(normalizedIdentifier);
        if (!emailValidation.valid) {
          return { valid: false, error: emailValidation.message };
        }
      } else {
        const usernameValidation = validateUsername(normalizedIdentifier);
        if (!usernameValidation.valid) {
          return { valid: false, error: "Enter a valid email or a username (at least 3 characters)." };
        }
      }

      const pwValidation = validateLoginPassword(normalizedPassword);
      if (!pwValidation.valid) {
        return { valid: false, error: pwValidation.message };
      }

      return {
        valid: true,
        payload: {
          email: normalizedIdentifier,
          password: normalizedPassword,
          username: "",
        },
      };
    }

    const emailValidation = validateEmail(normalizedIdentifier);
    if (!emailValidation.valid) {
      return { valid: false, error: emailValidation.message };
    }

    const usernameValidation = validateUsername(normalizedUsername);
    if (!usernameValidation.valid) {
      return { valid: false, error: usernameValidation.message };
    }

    const registerPwValidation = validateRegisterPassword(normalizedPassword);
    if (!registerPwValidation.valid) {
      return { valid: false, error: registerPwValidation.message };
    }

    const confirmValidation = validateConfirmPassword(normalizedPassword, normalizedConfirm);
    if (!confirmValidation.valid) {
      return { valid: false, error: confirmValidation.message };
    }

    return {
      valid: true,
      payload: {
        email: normalizedIdentifier,
        password: normalizedPassword,
        username: normalizedUsername,
      },
    };
  };

  const resolveLoginEmail = async (
    identifier: string
  ): Promise<string | { networkError: true } | null> => {
    if (EMAIL_REGEX.test(identifier)) return identifier;

    try {
      const lookup = await supabase.functions.invoke("lookup_email_by_username", {
        body: { username: identifier },
      });
      const email = lookup.data?.email as string | null | undefined;
      return email ?? null;
    } catch (err) {
      if (isLikelyNetworkError(err)) return { networkError: true };
      return null;
    }
  };

  const loginWithEmail = async (
    emailValue: string,
    passwordValue: string
  ): Promise<AuthResult> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailValue,
        password: passwordValue,
      });

      if (error) {
        const friendly = mapAuthErrorMessage(error.message);
        if (error.message.toLowerCase().includes("invalid login credentials")) {
          try {
            const lookup = await supabase.functions.invoke("lookup_auth_providers", {
              body: { email: emailValue },
            });

            const providers = (lookup.data?.providers as string[] | undefined) ?? [];
            if (DEBUG) {
              console.log("[auth] provider lookup", {
                email: emailValue,
                exists: lookup.data?.exists,
                providers,
              });
            }

            if (providers.includes("google") && !providers.includes("email")) {
              setOauthHint(GOOGLE_ONLY_LOGIN_MESSAGE);
              return { success: false, error: GOOGLE_ONLY_LOGIN_MESSAGE };
            }
          } catch (lookupErr) {
            if (DEBUG) console.log("[auth] lookup_auth_providers failed", lookupErr);
          }
        }

        return { success: false, error: friendly };
      }

      if (data.session) {
        router.replace("/home");
        return { success: true, session: data.session };
      }

      return { success: false, error: "Unknown login error" };
    } catch (err) {
      if (DEBUG) console.log("Unexpected login error", err);
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const registerWithEmail = async (
    usernameValue: string,
    emailValue: string,
    passwordValue: string
  ): Promise<AuthResult> => {
    try {
      // Pre-check: detect Google-only accounts before attempting signUp so the
      // user gets a clear hint instead of Supabase's silent fake-success response.
      try {
        const lookup = await supabase.functions.invoke("lookup_auth_providers", {
          body: { email: emailValue },
        });
        const providers = (lookup.data?.providers as string[] | undefined) ?? [];
        if (providers.includes("google") && !providers.includes("email")) {
          setOauthHint(GOOGLE_ONLY_LOGIN_MESSAGE);
          return { success: false, error: GOOGLE_ONLY_LOGIN_MESSAGE };
        }
      } catch {
        // Non-fatal: proceed with signUp if the edge function is unavailable.
      }

      const { data, error } = await supabase.auth.signUp({
        email: emailValue,
        password: passwordValue,
        options: {
          data: { username: usernameValue },
        },
      });

      if (error) {
        return { success: false, error: mapAuthErrorMessage(error.message) };
      }

      // Supabase returns an empty identities array as a "fake success" when email
      // confirmation is enabled and the email is already registered. No real
      // account is created and no email is sent in this case.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        return {
          success: false,
          error: "An account with this email already exists. Try signing in or use Forgot Password.",
        };
      }

      if (data.session && data.user) {
        // Email confirmation is disabled: create the profile row immediately
        // with the username the user actually chose.
        await supabase.from("profiles").upsert(
          {
            id: data.user.id,
            username: usernameValue,
            bio: "",
            avatar_url: null,
            units_length: "cm",
            units_weight: "kg",
            units_temp: "celsius",
          },
          { onConflict: "id" }
        );
        router.replace("/home");
        return { success: true, session: data.session };
      }

      if (data.user) {
        // Email confirmation is enabled: the user must verify before logging in.
        // Profile will be created on first login via ensureProfileRow, which now
        // reads username from user_metadata set above.
        setPendingVerificationEmail(emailValue);
        return {
          success: true,
          message: "Account created! Check your email to verify your account before signing in.",
        };
      }

      return { success: false, error: "Unknown registration error" };
    } catch (err) {
      if (DEBUG) console.log("Unexpected registration error", err);
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const handleResendVerification = async () => {
    if (!pendingVerificationEmail || resendCooldown > 0) return;
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: pendingVerificationEmail,
      });
      if (error) throw error;
      setResendCooldown(60);
      setSuccessMessage("Verification email sent! Check your inbox.");
    } catch (err: any) {
      setFormError(err?.message ?? "Failed to resend. Please try again.");
      setSuccessMessage(null);
    }
  };

  const handleSubmit = async () => {
    if (loading) return;

    clearErrors();
    const validation = validateBeforeSubmit();
    if (!validation.valid) {
      setFormError(validation.error ?? "Please check your input.");
      return;
    }

    setLoading(true);
    try {
      let result: AuthResult;

      if (isLogin) {
        const identifier = validation.payload!.email;
        const resolved = await resolveLoginEmail(identifier);
        if (resolved === null) {
          setFormError("No account found with that username.");
          return;
        }
        if (typeof resolved !== "string") {
          setFormError("Network error. Please try again.");
          return;
        }
        result = await loginWithEmail(resolved, validation.payload!.password);
      } else {
        result = await registerWithEmail(
          validation.payload!.username,
          validation.payload!.email,
          validation.payload!.password
        );
      }

      if (!result.success) {
        if (result.error === GOOGLE_ONLY_LOGIN_MESSAGE) {
          setFormError(null);
          return;
        }
        setFormError(result.error);
        return;
      }

      if (result.message) {
        setSuccessMessage(result.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (loading) return;
    clearErrors();
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setFormError(err?.message ?? "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      {!isLogin && (
        <TextInput
          placeholder="Username"
          placeholderTextColor={COLORS.textSecondary}
          style={styles.input}
          autoCapitalize="none"
          value={username}
          onChangeText={(value) => {
            setUsername(value);
            clearErrors();
          }}
        />
      )}

      <TextInput
        placeholder={isLogin ? "Email or Username" : "hello@company.com"}
        placeholderTextColor={COLORS.textSecondary}
        style={styles.input}
        autoCapitalize="none"
        keyboardType={isLogin ? "default" : "email-address"}
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          clearErrors();
        }}
      />

      <TextInput
        placeholder="Your Password"
        placeholderTextColor={COLORS.textSecondary}
        secureTextEntry
        style={styles.input}
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          clearErrors();
        }}
      />

      {!isLogin && (
        <TextInput
          placeholder="Confirm Password"
          placeholderTextColor={COLORS.textSecondary}
          secureTextEntry
          style={styles.input}
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            clearErrors();
          }}
        />
      )}

      {formError && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{formError}</Text>
        </View>
      )}

      {successMessage && (
        <View style={styles.successCard}>
          <Text style={styles.successText}>{successMessage}</Text>
          {pendingVerificationEmail && (
            resendCooldown > 0 ? (
              <Text style={styles.resendCooldown}>
                Resend available in {resendCooldown}s
              </Text>
            ) : (
              <Text onPress={handleResendVerification} style={styles.resendLink}>
                Resend verification email
              </Text>
            )
          )}
        </View>
      )}

      {isLogin && (
        <Text onPress={() => router.push("/forgot_password")} style={styles.forgotPassword}>
          Forgot Password?
        </Text>
      )}

      <Pressable
        style={[styles.button, loading && { opacity: 0.7 }]}
        disabled={loading}
        onPress={handleSubmit}
      >
        <Text style={styles.buttonText}>
          {loading ? "LOADING..." : isLogin ? "LOGIN" : "REGISTER"}
        </Text>
      </Pressable>

      {oauthHint && (
        <View style={styles.oauthHintCard}>
          <Text style={styles.oauthHintText}>{oauthHint}</Text>
        </View>
      )}

      <View style={styles.orContainer}>
        <View style={styles.line} />
        <Text style={styles.orText}>OR</Text>
        <View style={styles.line} />
      </View>

      <Pressable
        style={[styles.googleButton, loading && { opacity: 0.7 }]}
        onPress={handleGoogleSignIn}
        disabled={loading}
      >
        <Image source={google_icon} style={styles.googleIcon} />
        <Text style={styles.googleText}>
          {isLogin ? "Sign in with Google" : "Sign up with Google"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    padding: 20,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    color: COLORS.text,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 20,
    fontSize: 16,
  },
  errorCard: {
    marginTop: -6,
    marginBottom: 10,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "rgba(239,68,68,0.15)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
  },
  errorText: {
    color: "#fecaca",
    fontSize: 12,
    lineHeight: 18,
  },
  forgotPassword: {
    color: COLORS.text,
    marginBottom: 12,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
  },
  oauthHintCard: {
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "rgba(253,123,65,0.12)",
    borderWidth: 1,
    borderColor: "rgba(253,123,65,0.45)",
  },
  oauthHintText: {
    color: COLORS.text,
    fontSize: 13,
  },
  orContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  orText: {
    marginHorizontal: 12,
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 1,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 10,
    backgroundColor: "#000",
  },
  googleIcon: {
    width: 20,
    height: 20,
    marginRight: 12,
  },
  googleText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  successCard: {
    marginTop: -6,
    marginBottom: 10,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.4)",
  },
  successText: {
    color: "#bbf7d0",
    fontSize: 12,
    lineHeight: 18,
  },
  resendLink: {
    color: "#4ade80",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
    textDecorationLine: "underline",
  },
  resendCooldown: {
    color: "#6ee7b7",
    fontSize: 12,
    marginTop: 6,
    opacity: 0.7,
  },
});
