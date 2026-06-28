// Supabase client singleton. Reads public env vars (safe to ship — the anon
// key is RLS-gated). Set these in `.env` (see .env.example) or your EAS
// secrets. AsyncStorage persists the session across launches.
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!url || !anonKey) {
  // Don't throw at import time — the app defaults to the mock data source, so
  // a missing config should only matter once someone flips
  // EXPO_PUBLIC_DATA_SOURCE=supabase.
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY not set — supabase data source will fail until configured.",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
