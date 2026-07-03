// Unified interest + custom-tag manager with SKILL LEVELS. Used by BOTH
// onboarding and profile so tag management looks and behaves identically.
//
// Levels (spec): 1 Beginner / 2 Intermediate / 3 Advanced / 4 Expert. A tag's
// color encodes its level. Missing level ⇒ Beginner (orange, the theme color).
//
// Interaction (same everywhere):
//   • Onboarding grid: preset tags start GRAY. Tap once → selected (Beginner /
//     orange). Tap a selected tag → a level picker slides open beneath its
//     category; pick a level → the chip recolors. × removes / deselects.
//   • Custom tags: type + add → the new tag's level picker auto-opens so you
//     set a level immediately (defaults to Beginner if you skip).
//   • Profile (compact): shows ONLY selected tags as chips; same tap-to-set-
//     level + × to remove, plus the autocomplete input to add more.
//
// Controlled: parent owns selected interest ids, custom tags, and the
// tagLevels map (persisted to the auth store → users.tag_levels in supabase).
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

// Level → { label, color }. bg is the chip color; fg is readable text on it.
const LEVELS = [
  { level: 1, label: "Beginner", hint: "Entry-level", bg: colors.brand, fg: "#FFFFFF" },
  { level: 2, label: "Intermediate", hint: "Getting comfortable", bg: colors.accentYellow, fg: "#3D2E00" },
  { level: 3, label: "Advanced", hint: "Proficient", bg: colors.accentBlue, fg: "#FFFFFF" },
  { level: 4, label: "Expert", hint: "Master", bg: colors.accentPurple, fg: "#FFFFFF" },
] as const;
const levelMeta = (lvl?: number) => LEVELS[Math.min(4, Math.max(1, lvl ?? 1)) - 1];

type Props = {
  selectedInterestIds: string[];
  onToggleInterest: (id: string) => void;
  customTags: string[];
  onAddCustomTag: (label: string) => void;
  onRemoveCustomTag: (label: string) => void;
  /** key (interest id | custom label) → level 1..4. Missing ⇒ 1. */
  tagLevels: Record<string, number>;
  onSetTagLevel: (key: string, level: number) => void;
  /** compact = profile layout (selected-only + autocomplete). */
  compact?: boolean;
};

// A selected, level-colored chip: tap body → edit level, tap × → remove.
function LevelChip({
  label,
  level,
  expanded,
  onEdit,
  onRemove,
}: {
  label: string;
  level: number;
  expanded: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const m = levelMeta(level);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: m.bg,
        borderRadius: 999,
        paddingLeft: 4,
        paddingRight: 2,
        height: 34,
        // faint iridescent hint for Expert
        borderWidth: m.level === 4 ? 1.5 : 0,
        borderColor: "#C9BCFF",
      }}
    >
      <Pressable
        onPress={onEdit}
        style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 6, height: 34 }}
      >
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: "rgba(255,255,255,0.28)",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 6,
          }}
        >
          <Text style={{ color: m.fg, fontSize: 10, fontWeight: "800" }}>{m.level}</Text>
        </View>
        <Text style={{ color: m.fg, fontSize: 13, fontWeight: "600" }}>{label}</Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={13}
          color={m.fg}
          style={{ marginLeft: 4, opacity: 0.85 }}
        />
      </Pressable>
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          marginLeft: 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.22)",
        }}
      >
        <Ionicons name="close" size={13} color={m.fg} />
      </Pressable>
    </View>
  );
}

// The slide-open level picker for one tag.
function LevelEditor({
  title,
  current,
  onPick,
}: {
  title: string;
  current: number;
  onPick: (level: number) => void;
}) {
  return (
    <View
      style={{
        marginTop: 10,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        padding: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
      }}
    >
      <Text style={{ fontSize: 12, color: colors.inkMuted, marginBottom: 8 }}>
        Your level in <Text style={{ color: colors.ink, fontWeight: "700" }}>{title}</Text>
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {LEVELS.map((l) => {
          const on = current === l.level;
          return (
            <Pressable
              key={l.level}
              onPress={() => onPick(l.level)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: l.bg,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderWidth: on ? 2 : 0,
                borderColor: "#FFFFFF",
                opacity: on ? 1 : 0.9,
              }}
            >
              <Text style={{ color: l.fg, fontWeight: "700", fontSize: 12 }}>
                {l.level}. {l.label}
              </Text>
              {on ? (
                <Ionicons name="checkmark-circle" size={15} color={l.fg} style={{ marginLeft: 6 }} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={{ fontSize: 10, color: colors.inkMuted, marginTop: 8 }}>
        Not sure? Beginner is fine — you can change this anytime.
      </Text>
    </View>
  );
}

export function InterestPicker({
  selectedInterestIds,
  onToggleInterest,
  customTags,
  onAddCustomTag,
  onRemoveCustomTag,
  tagLevels,
  onSetTagLevel,
  compact,
}: Props) {
  const [draft, setDraft] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
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

  const levelOf = (key: string) => tagLevels[key] ?? 1;
  const toggleEditor = (key: string) => setExpandedKey((k) => (k === key ? null : key));
  const pickLevel = (key: string, level: number) => {
    onSetTagLevel(key, level);
    setExpandedKey(null);
  };
  const displayName = (key: string) => labelById[key] ?? key;

  const addCustom = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    if (clean.length > MAX_TAG_LEN) {
      Alert.alert("Tag too long", `Keep tags under ${MAX_TAG_LEN} characters.`);
      return;
    }
    // Matches a preset by label → select the preset instead of a dup free tag.
    const preset = INTERESTS.find((t) => t.label.toLowerCase() === clean.toLowerCase());
    if (preset) {
      if (!selected.has(preset.id)) onToggleInterest(preset.id);
      setDraft("");
      setExpandedKey(preset.id); // let them set a level right away
      return;
    }
    if (customTags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setDraft("");
      return;
    }
    if (customTags.length >= MAX_CUSTOM_TAGS) {
      Alert.alert("That's plenty", `You can add up to ${MAX_CUSTOM_TAGS} custom tags.`);
      return;
    }
    onAddCustomTag(clean);
    setDraft("");
    setExpandedKey(clean); // custom tag → auto-open the level picker
  };

  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return [];
    return INTERESTS.filter((t) => !selected.has(t.id) && t.label.toLowerCase().includes(q)).slice(
      0,
      MAX_SUGGESTIONS,
    );
  }, [draft, selected]);

  const draftClean = draft.trim();
  const exactPreset = INTERESTS.some((t) => t.label.toLowerCase() === draftClean.toLowerCase());
  const alreadyCustom = customTags.some((t) => t.toLowerCase() === draftClean.toLowerCase());
  const showAddCustom = draftClean.length > 0 && !exactPreset && !alreadyCustom;

  const removeInterest = (id: string) => {
    if (expandedKey === id) setExpandedKey(null);
    onToggleInterest(id);
  };
  const removeCustom = (t: string) => {
    if (expandedKey === t) setExpandedKey(null);
    onRemoveCustomTag(t);
  };

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
            <Pressable onPress={() => addCustom(draft)} className="flex-row items-center px-4 py-2.5">
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

  // ── Compact (profile): selected-only chips + level editor + autocomplete ──
  if (compact) {
    const hasAny = selectedInterestIds.length > 0 || customTags.length > 0;
    return (
      <View>
        <View className="flex-row flex-wrap mb-1" style={{ gap: 8 }}>
          {selectedInterestIds.map((id) => (
            <LevelChip
              key={id}
              label={labelById[id] ?? id}
              level={levelOf(id)}
              expanded={expandedKey === id}
              onEdit={() => toggleEditor(id)}
              onRemove={() => removeInterest(id)}
            />
          ))}
          {customTags.map((t) => (
            <LevelChip
              key={t}
              label={t}
              level={levelOf(t)}
              expanded={expandedKey === t}
              onEdit={() => toggleEditor(t)}
              onRemove={() => removeCustom(t)}
            />
          ))}
          {!hasAny ? (
            <Text className="text-ink-muted text-xs">
              No interests yet — add some below so we can match you.
            </Text>
          ) : null}
        </View>

        {expandedKey ? (
          <LevelEditor
            title={displayName(expandedKey)}
            current={levelOf(expandedKey)}
            onPick={(l) => pickLevel(expandedKey, l)}
          />
        ) : null}

        <View className="mt-3">{autocomplete}</View>

        <LevelLegend />
      </View>
    );
  }

  // ── Full (onboarding): browsable grid + inline level editor + custom ──────
  return (
    <View>
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-base font-bold text-ink">Interests</Text>
        <Text className="text-xs text-ink-muted">{selected.size} selected</Text>
      </View>

      {CATEGORY_ORDER.map((cat) => {
        const expandedInThisCat =
          expandedKey != null && INTERESTS.find((t) => t.id === expandedKey)?.category === cat;
        return (
          <View key={cat} className="mt-3">
            <Text className="text-xs font-semibold text-ink-muted mb-2 uppercase">{cat}</Text>
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {grouped[cat].map((t) => {
                const on = selected.has(t.id);
                if (on) {
                  return (
                    <LevelChip
                      key={t.id}
                      label={t.label}
                      level={levelOf(t.id)}
                      expanded={expandedKey === t.id}
                      onEdit={() => toggleEditor(t.id)}
                      onRemove={() => removeInterest(t.id)}
                    />
                  );
                }
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => onToggleInterest(t.id)}
                    className="flex-row items-center rounded-full"
                    style={{
                      paddingHorizontal: 14,
                      height: 34,
                      backgroundColor: colors.surfaceSoft,
                      borderWidth: 1,
                      borderColor: colors.line,
                    }}
                  >
                    <Text className="text-sm font-medium" style={{ color: colors.ink }}>
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {expandedInThisCat ? (
              <LevelEditor
                title={displayName(expandedKey!)}
                current={levelOf(expandedKey!)}
                onPick={(l) => pickLevel(expandedKey!, l)}
              />
            ) : null}
          </View>
        );
      })}

      {/* Custom tags */}
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
              <LevelChip
                key={t}
                label={t}
                level={levelOf(t)}
                expanded={expandedKey === t}
                onEdit={() => toggleEditor(t)}
                onRemove={() => removeCustom(t)}
              />
            ))}
          </View>
        ) : null}

        {expandedKey != null && customTags.includes(expandedKey) ? (
          <LevelEditor
            title={displayName(expandedKey)}
            current={levelOf(expandedKey)}
            onPick={(l) => pickLevel(expandedKey, l)}
          />
        ) : null}

        <View className="mt-3">{autocomplete}</View>
      </View>

      <LevelLegend />
    </View>
  );
}

// Small colored legend so the color→level mapping is self-explanatory.
function LevelLegend() {
  return (
    <View className="flex-row flex-wrap mt-4" style={{ gap: 10 }}>
      {LEVELS.map((l) => (
        <View key={l.level} className="flex-row items-center" style={{ gap: 5 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: l.bg }} />
          <Text style={{ fontSize: 10, color: colors.inkMuted }}>
            {l.level} {l.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
