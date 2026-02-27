import { useState } from "react";
import { View, Text, TextInput, Pressable, Image, StyleSheet } from "react-native";
import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import { signInWithGoogle } from "@/auth/google";
import { COLORS } from "@/lib/colors";
import {
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

  const clearErrors = () => {
    setFormError(null);
    setOauthHint(null);
  };

  const validateBeforeSubmit = () => {
    const normalizedEmail = sanitizeInput(email);
    const normalizedPassword = sanitizeInput(password);
    const normalizedConfirm = sanitizeInput(confirmPassword);
    const normalizedUsername = sanitizeInput(username);

    const emailValidation = validateEmail(normalizedEmail);
    if (!emailValidation.valid) {
      return { valid: false, error: emailValidation.message };
    }

    if (isLogin) {
      const pwValidation = validateLoginPassword(normalizedPassword);
      if (!pwValidation.valid) {
        return { valid: false, error: pwValidation.message };
      }

      return {
        valid: true,
        payload: {
          email: normalizedEmail,
          password: normalizedPassword,
          username: "",
        },
      };
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
        email: normalizedEmail,
        password: normalizedPassword,
        username: normalizedUsername,
      },
    };
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

      if (data.session) {
        router.replace("/home");
        return { success: true, session: data.session };
      }

      if (data.user) {
        return {
          success: true,
          message: "Account created. Please check your email to confirm your account.",
        };
      }

      return { success: false, error: "Unknown registration error" };
    } catch (err) {
      if (DEBUG) console.log("Unexpected registration error", err);
      return { success: false, error: "Network error. Please try again." };
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
    let result: AuthResult;

    if (isLogin) {
      result = await loginWithEmail(validation.payload!.email, validation.payload!.password);
    } else {
      result = await registerWithEmail(
        validation.payload!.username,
        validation.payload!.email,
        validation.payload!.password
      );
    }

    setLoading(false);

    if (!result.success) {
      if (result.error === GOOGLE_ONLY_LOGIN_MESSAGE) {
        setFormError(null);
        return;
      }
      setFormError(result.error);
      return;
    }

    if (result.message) {
      setFormError(result.message);
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
        placeholder="hello@company.com"
        placeholderTextColor={COLORS.textSecondary}
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
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

      {isLogin && oauthHint && (
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
});
