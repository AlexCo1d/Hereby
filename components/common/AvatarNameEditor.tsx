// Reusable identity editor: a tappable avatar (Upload photo / Shuffle) + a
// display-name field. Shared by onboarding and the profile screen so identity
// setup looks and behaves the same. Controlled — parent owns the values and
// decides when to persist.
import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "./Avatar";
import { colors } from "../../constants/theme";
import { pickAndUploadAvatar, randomAvatar, PICKER_UNAVAILABLE } from "../../services/avatar";

type Props = {
  name: string;
  avatarUrl: string;
  /** Seed for the Shuffle button (email or user id). */
  seed: string;
  /** User id — needed for the Storage upload path. */
  userId: string;
  onChangeName: (name: string) => void;
  onChangeAvatar: (url: string) => void;
  /** Optional: label above the name field. */
  nameLabel?: string;
};

export function AvatarNameEditor({
  name,
  avatarUrl,
  seed,
  userId,
  onChangeName,
  onChangeAvatar,
  nameLabel = "Display name",
}: Props) {
  const [busy, setBusy] = useState(false);

  const onUpload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const url = await pickAndUploadAvatar(userId);
      if (url) onChangeAvatar(url);
    } catch (e: any) {
      if (e?.message === PICKER_UNAVAILABLE) {
        Alert.alert(
          "Photo upload not enabled yet",
          "Run `npx expo install expo-image-picker` and reload to upload photos. Meanwhile, tap Shuffle for a fresh avatar.",
        );
      } else {
        Alert.alert("Couldn't add photo", e?.message ?? "Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="items-center">
      {/* Avatar with a camera badge */}
      <Pressable onPress={onUpload} disabled={busy}>
        <View>
          <Avatar uri={avatarUrl} size={96} ring />
          <View
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: colors.brand,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              borderColor: colors.surface,
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="camera" size={15} color="white" />
            )}
          </View>
        </View>
      </Pressable>

      {/* Actions */}
      <View className="flex-row mt-3" style={{ gap: 8 }}>
        <Pressable
          onPress={onUpload}
          disabled={busy}
          className="flex-row items-center rounded-full px-3 py-1.5"
          style={{ backgroundColor: colors.surfaceSoft }}
        >
          <Ionicons name="cloud-upload-outline" size={14} color={colors.ink} />
          <Text className="text-xs font-semibold text-ink ml-1.5">Upload photo</Text>
        </Pressable>
        <Pressable
          onPress={() => onChangeAvatar(randomAvatar(seed))}
          disabled={busy}
          className="flex-row items-center rounded-full px-3 py-1.5"
          style={{ backgroundColor: colors.surfaceSoft }}
        >
          <Ionicons name="shuffle" size={14} color={colors.ink} />
          <Text className="text-xs font-semibold text-ink ml-1.5">Shuffle</Text>
        </Pressable>
      </View>

      {/* Name */}
      <View className="w-full mt-5">
        <Text className="text-sm font-semibold text-ink mb-2">{nameLabel}</Text>
        <View
          className="flex-row items-center bg-surface-soft rounded-2xl px-4 border border-ink-line"
          style={{ height: 52 }}
        >
          <Ionicons name="person-outline" size={18} color={colors.inkMuted} />
          <TextInput
            value={name}
            onChangeText={onChangeName}
            placeholder="What should people call you?"
            placeholderTextColor={colors.inkMuted}
            maxLength={30}
            style={{ flex: 1, marginLeft: 10, height: 52, paddingVertical: 0, color: colors.ink, fontSize: 16 }}
          />
        </View>
      </View>
    </View>
  );
}
