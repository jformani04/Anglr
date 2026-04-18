import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

function cleanEnv(value: string | undefined) {
  if (!value) return "";
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export const supabaseUrl = cleanEnv(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = cleanEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
  );
}

if (!/^https?:\/\//i.test(supabaseUrl)) {
  throw new Error(
    "Invalid EXPO_PUBLIC_SUPABASE_URL. Use your full Supabase project URL, e.g. https://<project-ref>.supabase.co"
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      // Supabase auth payloads can exceed SecureStore's ~2KB practical limit.
      // AsyncStorage is the recommended storage backend for session persistence.
      storage: AsyncStorage as any,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
