import { COLORS } from "@/lib/colors";
import {
  getProfile,
  LengthUnit,
  linkGoogleIdentity,
  requestDeleteAccount,
  TempUnit,
  upsertProfile,
  uploadAvatar,
  WeightUnit,
} from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import {
  ArrowLeft,
  Camera,
  Lock,
  LogOut,
  Mail,
  Trash2,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type ModalType = "none" | "email" | "password";

function formatMemberSince(createdAt: string | null) {
  if (!createdAt) return "Member since -";
  const date = new Date(createdAt);
  return `Member since ${date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  })}`;
}

export default function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>("cm");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg");
  const [temperatureUnit, setTemperatureUnit] = useState<TempUnit>("celsius");
  const [memberSince, setMemberSince] = useState("Member since -");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<string>("email");
  const [authProviders, setAuthProviders] = useState<string[]>([]);

  const [modalType, setModalType] = useState<ModalType>("none");
  const [emailDraft, setEmailDraft] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef("");
  const isGoogleSignedIn = authProvider === "google";

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const profile = await getProfile();
        setUsername(profile.username);
        setBio(profile.bio);
        setLengthUnit(profile.unitsLength);
        setWeightUnit(profile.unitsWeight);
        setTemperatureUnit(profile.unitsTemp);
        setMemberSince(formatMemberSince(profile.createdAt));
        setEmail(profile.email);
        setEmailDraft(profile.email);
        setAvatarUrl(profile.avatarUrl);
        setAuthProvider(profile.authProvider);
        setAuthProviders(profile.authProviders);
        lastSavedRef.current = JSON.stringify({
          username: profile.username,
          bio: profile.bio,
          unitsLength: profile.unitsLength,
          unitsWeight: profile.unitsWeight,
          unitsTemp: profile.unitsTemp,
          avatarUrl: profile.avatarUrl,
        });
        hydratedRef.current = true;
      } catch (err: any) {
        Alert.alert("Profile Error", err?.message ?? "Unable to load profile.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const payload = {
      username,
      bio,
      unitsLength: lengthUnit,
      unitsWeight: weightUnit,
      unitsTemp: temperatureUnit,
      avatarUrl,
    };
    const nextSerialized = JSON.stringify(payload);
    if (nextSerialized === lastSavedRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        setSaving(true);
        await upsertProfile(payload);
        lastSavedRef.current = nextSerialized;
      } catch (err: any) {
        Alert.alert("Save Failed", err?.message ?? "Unable to save profile.");
      } finally {
        setSaving(false);
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [username, bio, lengthUnit, weightUnit, temperatureUnit, avatarUrl]);

  const changeAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permission Required", "Photo library access is required.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });
      if (result.canceled) return;

      setUploadingAvatar(true);
      const nextUrl = await uploadAvatar(result.assets[0].uri);
      setAvatarUrl(nextUrl);
    } catch (err: any) {
      Alert.alert("Upload Failed", err?.message ?? "Unable to upload avatar.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!authProviders.includes("email")) {
      Alert.alert(
        "Google Account",
        "You're signed in with Google. Your email is managed through your Google account."
      );
      setModalType("none");
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ email: emailDraft.trim() });
      if (error) throw error;
      Alert.alert(
        "Check your email",
        "We sent a confirmation link to your new email address."
      );
      setEmail(emailDraft.trim());
      setModalType("none");
    } catch (err: any) {
      Alert.alert("Email Update Failed", err?.message ?? "Unable to change email.");
    }
  };

  const handleChangePasswordPress = () => {
    setModalType("password");
  };

  const handleChangeEmailPress = () => {
    setModalType("email");
  };

  const handleLinkGoogle = async () => {
    try {
      await linkGoogleIdentity();
      const refreshed = await getProfile();
      setAuthProvider(refreshed.authProvider);
      setAuthProviders(refreshed.authProviders);
      Alert.alert("Linked", "Google account linked successfully.");
    } catch (err: any) {
      Alert.alert("Link Failed", err?.message ?? "Unable to link Google account.");
    }
  };

  const handleChangePassword = async () => {
    try {
      const value = passwordDraft.trim();
      if (value.length < 8) {
        Alert.alert("Invalid Password", "Use at least 8 characters.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: value });
      if (error) throw error;
      Alert.alert("Password Updated", "Your password has been changed.");
      setPasswordDraft("");
      setModalType("none");
    } catch (err: any) {
      Alert.alert("Password Update Failed", err?.message ?? "Unable to change password.");
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert("Sign Out Failed", error.message);
      return;
    }
    router.replace("/");
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const result = await requestDeleteAccount();
              if (result.partial) {
                Alert.alert("Delete Account", result.message ?? "Partial delete completed.");
              }
              await supabase.auth.signOut();
              router.replace("/");
            } catch (err: any) {
              Alert.alert(
                "Delete Account",
                err?.message ??
                  "Delete completed partially. Please set up delete_account Edge Function for full auth deletion."
              );
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft color={COLORS.text} size={20} strokeWidth={2.5} />
          </Pressable>
          <View>
            <Text style={styles.title}>Profile</Text>
            <Text style={styles.subtitle}>Manage your account settings</Text>
          </View>
        </View>

        <View>
          <Text style={styles.sectionLabel}>Profile</Text>
          <View style={styles.card}>
            <View style={styles.profileRow}>
              <View style={styles.avatarWrap}>
                <Image
                  source={{
                    uri:
                      avatarUrl ??
                      "https://images.unsplash.com/photo-1771006841888-3bd2975bca6e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
                  }}
                  style={styles.avatar}
                />
                <Pressable
                  onPress={changeAvatar}
                  style={[styles.cameraButton, uploadingAvatar && { opacity: 0.7 }]}
                  disabled={uploadingAvatar}
                >
                  <Camera color={COLORS.text} size={14} strokeWidth={2} />
                </Pressable>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.usernameTitle}>{username || "Angler"}</Text>
                <Text style={styles.memberText}>{memberSince}</Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Username</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              style={styles.input}
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              style={[styles.input, styles.textArea]}
              multiline
              placeholderTextColor={COLORS.textSecondary}
            />

            {saving ? <Text style={styles.autoSaveText}>Saving changes...</Text> : null}
          </View>
        </View>

        <View>
          <Text style={styles.sectionLabel}>Preferences</Text>

          <View style={styles.prefCard}>
            <View>
              <Text style={styles.prefTitle}>Length Units</Text>
              <Text style={styles.prefSub}>Display measurements in</Text>
            </View>
            <View style={styles.segment}>
              <Pressable
                onPress={() => setLengthUnit("cm")}
                style={[styles.segmentBtn, lengthUnit === "cm" && styles.segmentBtnActive]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    lengthUnit === "cm" && styles.segmentTextActive,
                  ]}
                >
                  cm
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setLengthUnit("in")}
                style={[styles.segmentBtn, lengthUnit === "in" && styles.segmentBtnActive]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    lengthUnit === "in" && styles.segmentTextActive,
                  ]}
                >
                  in
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.prefCard}>
            <View>
              <Text style={styles.prefTitle}>Weight Units</Text>
              <Text style={styles.prefSub}>Display weights in</Text>
            </View>
            <View style={styles.segment}>
              <Pressable
                onPress={() => setWeightUnit("kg")}
                style={[styles.segmentBtn, weightUnit === "kg" && styles.segmentBtnActive]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    weightUnit === "kg" && styles.segmentTextActive,
                  ]}
                >
                  kg
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setWeightUnit("lbs")}
                style={[styles.segmentBtn, weightUnit === "lbs" && styles.segmentBtnActive]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    weightUnit === "lbs" && styles.segmentTextActive,
                  ]}
                >
                  lbs
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.prefCard}>
            <View>
              <Text style={styles.prefTitle}>Temperature Units</Text>
              <Text style={styles.prefSub}>Display temperature in</Text>
            </View>
            <View style={styles.segment}>
              <Pressable
                onPress={() => setTemperatureUnit("celsius")}
                style={[
                  styles.segmentBtn,
                  temperatureUnit === "celsius" && styles.segmentBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    temperatureUnit === "celsius" && styles.segmentTextActive,
                  ]}
                >
                  °C
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setTemperatureUnit("fahrenheit")}
                style={[
                  styles.segmentBtn,
                  temperatureUnit === "fahrenheit" && styles.segmentBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    temperatureUnit === "fahrenheit" && styles.segmentTextActive,
                  ]}
                >
                  °F
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View>
          <Text style={styles.sectionLabel}>Security</Text>
          <Pressable
            style={[styles.actionCard, isGoogleSignedIn && styles.actionCardDisabled]}
            onPress={isGoogleSignedIn ? undefined : handleChangeEmailPress}
            disabled={isGoogleSignedIn}
          >
            <View style={[styles.actionIcon, isGoogleSignedIn && styles.actionIconDisabled]}>
              <Mail
                color={isGoogleSignedIn ? COLORS.textSecondary : COLORS.primary}
                size={20}
                strokeWidth={2}
              />
            </View>
            <View>
              <Text style={[styles.actionTitle, isGoogleSignedIn && styles.actionTextDisabled]}>
                Change Email
              </Text>
              <Text style={[styles.actionSub, isGoogleSignedIn && styles.actionTextDisabled]}>
                {email || "-"}
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={[styles.actionCard, isGoogleSignedIn && styles.actionCardDisabled]}
            onPress={isGoogleSignedIn ? undefined : handleChangePasswordPress}
            disabled={isGoogleSignedIn}
          >
            <View style={[styles.actionIcon, isGoogleSignedIn && styles.actionIconDisabled]}>
              <Lock
                color={isGoogleSignedIn ? COLORS.textSecondary : COLORS.primary}
                size={20}
                strokeWidth={2}
              />
            </View>
            <View>
              <Text style={[styles.actionTitle, isGoogleSignedIn && styles.actionTextDisabled]}>
                Change Password
              </Text>
              <Text style={[styles.actionSub, isGoogleSignedIn && styles.actionTextDisabled]}>
                Update your password
              </Text>
            </View>
          </Pressable>

          {isGoogleSignedIn ? (
            <Text style={styles.securityNotice}>
              You are signed in with Google, so email and password changes are managed by your
              Google account.
            </Text>
          ) : null}

          {authProviders.includes("email") && !authProviders.includes("google") && (
            <Pressable style={styles.actionCard} onPress={handleLinkGoogle}>
              <View style={styles.actionIcon}>
                <Mail color={COLORS.primary} size={20} strokeWidth={2} />
              </View>
              <View>
                <Text style={styles.actionTitle}>Link Google Account</Text>
                <Text style={styles.actionSub}>Use Google and password on one account</Text>
              </View>
            </Pressable>
          )}

        </View>

        <View>
          <Text style={styles.sectionLabel}>Account</Text>
          <Pressable style={styles.actionCard} onPress={handleSignOut}>
            <View style={styles.actionIcon}>
              <LogOut color={COLORS.primary} size={20} strokeWidth={2} />
            </View>
            <View>
              <Text style={styles.actionTitle}>Sign Out</Text>
            </View>
          </Pressable>

          <Pressable style={styles.deleteCard} onPress={handleDeleteAccount}>
            <View style={styles.deleteIcon}>
              <Trash2 color="#ef4444" size={20} strokeWidth={2} />
            </View>
            <View>
              <Text style={styles.deleteTitle}>Delete Account</Text>
              <Text style={styles.deleteSub}>
                Permanently delete your account and data
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <Modal transparent visible={modalType !== "none"} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {modalType === "email" ? "Change Email" : "Change Password"}
            </Text>
            <TextInput
              value={modalType === "email" ? emailDraft : passwordDraft}
              onChangeText={modalType === "email" ? setEmailDraft : setPasswordDraft}
              autoCapitalize="none"
              secureTextEntry={modalType === "password"}
              keyboardType={modalType === "email" ? "email-address" : "default"}
              placeholder={modalType === "email" ? "new@email.com" : "New password"}
              placeholderTextColor={COLORS.textSecondary}
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalSecondary} onPress={() => setModalType("none")}>
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalPrimary}
                onPress={modalType === "email" ? handleChangeEmail : handleChangePassword}
              >
                <Text style={styles.modalPrimaryText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 32,
    gap: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(221,220,219,0.1)",
    borderWidth: 1,
    borderColor: "rgba(221,220,219,0.2)",
  },
  title: {
    color: COLORS.text,
    fontSize: 32,
    fontWeight: "700",
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  sectionLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 8,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 24,
    padding: 16,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  cameraButton: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  usernameTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },
  memberText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  fieldLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(221,220,219,0.1)",
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  autoSaveText: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  prefCard: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 24,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  prefTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  prefSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  segment: {
    flexDirection: "row",
    borderRadius: 999,
    backgroundColor: "rgba(221,220,219,0.1)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 2,
  },
  segmentBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  segmentBtnActive: {
    backgroundColor: COLORS.primary,
  },
  segmentText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: COLORS.text,
  },
  actionCard: {
    backgroundColor: "rgba(221,220,219,0.08)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 24,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  actionCardDisabled: {
    opacity: 0.5,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: "rgba(253,123,65,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconDisabled: {
    backgroundColor: "rgba(221,220,219,0.12)",
  },
  actionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  actionSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  actionTextDisabled: {
    color: COLORS.textSecondary,
  },
  securityNotice: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: -2,
    marginBottom: 10,
  },
  deleteCard: {
    backgroundColor: "rgba(220,38,38,0.1)",
    borderWidth: 2,
    borderColor: "rgba(220,38,38,0.3)",
    borderRadius: 24,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deleteIcon: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: "rgba(220,38,38,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteTitle: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "700",
  },
  deleteSub: {
    color: "#fca5a5",
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    borderRadius: 24,
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
    padding: 16,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  modalInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },
  modalSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  modalSecondaryText: {
    color: COLORS.text,
    fontWeight: "600",
  },
  modalPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  modalPrimaryText: {
    color: "#000",
    fontWeight: "700",
  },
});
