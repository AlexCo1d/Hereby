// Unified interest + custom-tag manager. Used by BOTH onboarding and the
// profile screen so tag management looks and behaves consistently.
//
// Two layouts:
//   • full (onboarding)  — browsable category grid to discover interests, plus
//     a custom-tag input. Good for first-time setup.
//   • compact (profile)  — shows only what's SELECTED (removable chips) plus a
//     single autocomplete input that (a) recommends matching preset interests
//     as you type and (b) lets you add anything not preset as a custom tag.
//     "recommend + customize" in one box — no giant grid to wade through.
//
// Controlled component: the parent owns the selected interest ids and the
// custom-tag list (persisted to the auth store → users row in supabase mode).
// Interest ids + custom tags are the primary signal for match scoring
// (spec 0.8), so add/remove must round-trip reliably.
import { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { INTERESTS } from "../../services/mock/data";
import type { InterestCategory } from "../../services/types";
import { colors } from "../../constants/theme";

const CATEGORY_ORDER: InterestCategory[] = [
  "Sports",
  "Skills & Hobby Sharing",
  "Language Exchange",
  "Academic & Career",
];

const MAX_CUSTOM_TAGS = 12;
const MAX_TAG_LEN = 24;
const MAX_SUGGESTIONS = 6;

type Props = {
  selectedInterestIds: string[];
  onToggleInterest: (id: string) => void;
  customTags: string[];
  onAddCustomTag: (label: string) => void;
  onRemoveCustomTag: (label: string) => void;
  /** compact = profile layout (selected-only + autocomplete). */
  compact?: boolean;
};

// chip used for both removable selections and add targets
function Chip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <View
      className="flex-row items-center rounded-full pl-3 pr-1 py-1"
      style={{ backgroundColor: colors.brand }}
    >
      <Text className="text-white text-sm font-medium">{label}</Text>
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        style={{
          width: 22,
          height: 22,
          marginLeft: 4,
          borderRadius: 11,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.25)",
        }}
      >
        <Ionicons name="close" size={14} color="white" />
      </Pressable>
    </View>
  );
}

export function InterestPicker({
  selectedInterestIds,
  onToggleInterest,
  customTags,
  onAddCustomTag,
  onRemoveCustomTag,
  compact,
}: Props) {
  const [draft, setDraft] = useState("");
  const selected = useMemo(() => new Set(selectedInterestIds), [selectedInterestIds]);
  const labelById = useMemo(
    () => Object.fromEntries(INTERESTS.map((t) => [t.id, t.label] as const)),
    [],
  );

  const grouped = useMemo(() => {
    const m: Record<InterestCategory, typeof INTERESTS> = {
      Sports: [],
      "Skills & Hobby Sharing": [],
      "Language Exchange": [],
      "Academic & Career": [],
    };
    for (const t of INTERESTS) m[t.category].push(t);
    return m;
  }, []);

  const addCustom = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    if (clean.length > MAX_TAG_LEN) {
      Alert.alert("Tag too long", `Keep tags under ${MAX_TAG_LEN} characters.`);
      return;
    }
    // If it matches a preset interest by label, select that instead of making
    // a duplicate free-text tag — keeps the matching signal clean.
    const preset = INTERESTS.find((t) => t.label.toLowerCase() === clean.toLowerCase());
    if (preset) {
      if (!selected.has(preset.id)) onToggleInterest(preset.id);
      setDraft("");
      return;
    }
    if (customTags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setDraft("");
      return; // silent dedupe
    }
    if (customTags.length >= MAX_CUSTOM_TAGS) {
      Alert.alert("That's plenty", `You can add up to ${MAX_CUSTOM_TAGS} custom tags.`);
      return;
    }
    onAddCustomTag(clean);
    setDraft("");
  };

  // Preset interests matching the current draft that aren't already selected.
  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return [];
    return INTERESTS.filter(
      (t) => !selected.has(t.id) && t.label.toLowerCase().includes(q),
    ).slice(0, MAX_SUGGESTIONS);
  }, [draft, selected]);

  const draftClean = draft.trim();
  const exactPreset = INTERESTS.some(
    (t) => t.label.toLowerCase() === draftClean.toLowerCase(),
  );
  const alreadyCustom = customTags.some(
    (t) => t.toLowerCase() === draftClean.toLowerCase(),
  );
  const showAddCustom = draftClean.length > 0 && !exactPreset && !alreadyCustom;

  // The autocomplete input + dropdown, shared by both layouts.
  const autocomplete = (
    <View>
      <View
        className="flex-row items-center bg-surface-soft rounded-full pl-4 pr-1"
        style={{ height: 44 }}
      >
        <Ionicons name="search" size={16} color={colors.inkMuted} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add an interest or tag — type to search"
          placeholderTextColor={colors.inkMuted}
          onSubmitEditing={() => addCustom(draft)}
          returnKeyType="done"
          autoCapitalize="none"
          maxLength={MAX_TAG_LEN}
          style={{ flex: 1, height: 44, marginLeft: 8, paddingVertical: 0, color: colors.ink, fontSize: 14 }}
        />
        <Pressable
          onPress={() => addCustom(draft)}
          className="rounded-full bg-brand items-center justify-center"
          style={{ width: 36, height: 36 }}
        >
          <Ionicons name="add" size={20} color="white" />
        </Pressable>
      </View>

      {/* Inline suggestion list — recommends presets, offers custom add. */}
      {draftClean.length > 0 ? (
        <View
          className="mt-2 rounded-2xl overflow-hidden border"
          style={{ borderColor: colors.line, backgroundColor: colors.surface }}
        >
          {suggestions.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => {
                onToggleInterest(t.id);
                setDraft("");
              }}
              className="flex-row items-center px-4 py-2.5 border-b"
              style={{ borderColor: colors.line }}
            >
              <Ionicons name="pricetag-outline" size={15} color={colors.brand} />
              <Text className="text-sm text-ink ml-2 flex-1">{t.label}</Text>
              <Text className="text-[11px] text-ink-muted">{t.category}</Text>
            </Pressable>
          ))}
          {showAddCustom ? (
            <Pressable
              onPress={() => addCustom(draft)}
              className="flex-row items-center px-4 py-2.5"
            >
              <Ionicons name="add-circle-outline" size={16} color={colors.brand} />
              <Text className="text-sm ml-2" style={{ color: colors.brand }}>
                Add “{draftClean}” as a custom tag
              </Text>
            </Pressable>
          ) : null}
          {suggestions.length === 0 && !showAddCustom ? (
            <Text className="text-xs text-ink-muted px-4 py-2.5">Already added.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  // ── Compact (profile): selected-only chips + autocomplete ───────────────
  if (compact) {
    const hasAny = selectedInterestIds.length > 0 || customTags.length > 0;
    return (
      <View>
        <View className="flex-row flex-wrap mb-3" style={{ gap: 8 }}>
          {selectedInterestIds.map((id) => (
            <Chip key={id} label={labelById[id] ?? id} onRemove={() => onToggleInterest(id)} />
          ))}
          {customTags.map((t) => (
            <Chip key={t} label={t} onRemove={() => onRemoveCustomTag(t)} />
          ))}
          {!hasAny ? (
            <Text className="text-ink-muted text-xs">
              No interests yet — add some below so we can match you.
            </Text>
          ) : null}
        </View>
        {autocomplete}
      </View>
    );
  }

  // ── Full (onboarding): browsable grid + autocomplete ────────────────────
  return (
    <View>
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-base font-bold text-ink">Interests</Text>
        <Text className="text-xs text-ink-muted">{selected.size} selected</Text>
      </View>

      {CATEGORY_ORDER.map((cat) => (
        <View key={cat} className="mt-3">
          <Text className="text-xs font-semibold text-ink-muted mb-2 uppercase">{cat}</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {grouped[cat].map((t) => {
              const on = selected.has(t.id);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => onToggleInterest(t.id)}
                  className="flex-row items-center rounded-full"
                  style={{
                    paddingLeft: on ? 10 : 14,
                    paddingRight: 14,
                    paddingVertical: 7,
                    backgroundColor: on ? colors.brand : colors.surfaceSoft,
                    borderWidth: 1,
                    borderColor: on ? colors.brand : colors.line,
                  }}
                >
                  {on ? (
                    <Ionicons name="checkmark" size={14} color="white" style={{ marginRight: 4 }} />
                  ) : null}
                  <Text className="text-sm font-medium" style={{ color: on ? "white" : colors.ink }}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {/* Custom tags — chips + the same autocomplete input. */}
      <View className="mt-6">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-bold text-ink">Custom tags</Text>
          <Text className="text-xs text-ink-muted">
            {customTags.length}/{MAX_CUSTOM_TAGS}
          </Text>
        </View>
        <Text className="text-xs text-ink-muted mt-1 leading-4">
          Anything not preset — your major, a course code, a niche hobby. These power search and
          matching.
        </Text>

        {customTags.length > 0 ? (
          <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
            {customTags.map((t) => (
              <Chip key={t} label={t} onRemove={() => onRemoveCustomTag(t)} />
            ))}
          </View>
        ) : null}

        <View className="mt-3">{autocomplete}</View>
      </View>
    </View>
  );
}

// Re-export so callers can share the cap if they want to show it elsewhere.
export { MAX_CUSTOM_TAGS };
