// Avatar helpers: generated (zero-dep, always available) + real photo upload
// (expo-image-picker → Supabase Storage). The picker is lazy-required so the
// app never crashes if the module isn't installed yet — the UI falls back to
// generated avatars and tells the user how to enable uploads.
import { Platform } from "react-native";

const IS_SUPABASE = process.env.EXPO_PUBLIC_DATA_SOURCE === "supabase";

/** Deterministic, key-less avatar from a seed (DiceBear). Used as the default
 *  and as the "Shuffle" option so identity customization always works. */
export function generatedAvatar(seed: string): string {
  return `https://api.dicebear.com/7.x/avataaars/png?radius=50&seed=${encodeURIComponent(seed)}`;
}

/** A fresh random generated avatar (for the Shuffle button). */
export function randomAvatar(seed: string): string {
  return generatedAvatar(`${seed}-${Math.random().toString(36).slice(2)}`);
}

function pickerModule(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-image-picker");
  } catch {
    return null;
  }
}

export function isPhotoUploadAvailable(): boolean {
  return pickerModule() != null;
}

/** Signals the picker package isn't installed — caller shows an install hint. */
export const PICKER_UNAVAILABLE = "PICKER_UNAVAILABLE";

/**
 * Pick a square photo and return a URL to store as the avatar.
 *   • mock mode → the local file uri (previews fine for the session).
 *   • supabase  → uploads to the public `avatars` bucket, returns the public URL.
 * Returns null if the user cancels. Throws PICKER_UNAVAILABLE if the module
 * isn't installed, or a readable error otherwise.
 */
export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  const ImagePicker = pickerModule();
  if (!ImagePicker) throw new Error(PICKER_UNAVAILABLE);

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== "granted") {
    throw new Error(
      Platform.OS === "web"
        ? "Allow photo access in your browser to upload."
        : "Enable photo access for Hereby in Settings to upload.",
    );
  }

  // Support both the new (array) and legacy (enum) mediaTypes APIs.
  const mediaTypes = ImagePicker.MediaTypeOptions
    ? ImagePicker.MediaTypeOptions.Images
    : ["images"];
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.6,
  });
  if (res.canceled || !res.assets?.[0]?.uri) return null;
  const uri: string = res.assets[0].uri;

  if (!IS_SUPABASE) return uri;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { supabase } = require("./supabase/client");
  const resp = await fetch(uri);
  const bytes = await resp.arrayBuffer();
  const path = `${userId}/${Date.now()}.jpg`;
  const up = await supabase.storage
    .from("avatars")
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw up.error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl as string;
}
