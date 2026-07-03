// A compact bottom-sheet filter for Discover / Events. Three facets:
//   • Type       — post format (one-on-one / activity / event)
//   • Skill level — 1..4, color-coded to match the rest of the app
//   • Group size  — 1-on-1 / small / large (maps to seat count)
// Kept deliberately spacious: one facet per row, big tap targets, no clutter.
// Controlled by the parent; "Apply" commits, "Reset" clears.
import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "../../constants/theme";
import { SKILL_LEVELS } from "../../services/types";
import type { DiscoverFilter, PostFormat } from "../../services/types";

export type SeatsBucket = "any" | "solo" | "small" | "large";

export type FacetFilter = {
  formats: PostFormat[];
  skillLevels: number[];
  seats: SeatsBucket;
};

export const emptyFacets: FacetFilter = { formats: [], skillLevels: [], seats: "any" };

/** Number of active facets — drives the little badge on the funnel button. */
export function countFacets(f: FacetFilter): number {
  return f.formats.length + f.skillLevels.length + (f.seats !== "any" ? 1 : 0);
}

/** Translate the UI facets into the DiscoverFilter fields the api understands. */
export function facetsToFilter(f: FacetFilter): Partial<DiscoverFilter> {
  const out: Partial<DiscoverFilter> = {};
  if (f.formats.length) out.formats = f.formats;
  if (f.skillLevels.length) out.skillLevels = f.skillLevels;
  if (f.seats === "solo") out.maxSeats = 1;
  else if (f.seats === "small") {
    out.minSeats = 2;
    out.maxSeats = 6;
  } else if (f.seats === "large") out.minSeats = 7;
  return out;
}

const FORMAT_LABELS: Record<PostFormat, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  one_on_one: { label: "One-on-one", icon: "person-outline" },
  activity: { label: "Activity", icon: "people-outline" },
  event: { label: "Event", icon: "calendar-outline" },
};

const SEATS_OPTIONS: { value: SeatsBucket; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "solo", label: "1-on-1" },
  { value: "small", label: "Small · 2–6" },
  { value: "large", label: "Large · 7+" },
];

const LEVEL_COLORS = [colors.brand, colors.accentYellow, colors.accentBlue, colors.accentPurple];

type Props = {
  visible: boolean;
  value: FacetFilter;
  onApply: (next: FacetFilter) => void;
  onClose: () => void;
  /** Which format chips to show. Events passes just activity + event. */
  formatOptions?: PostFormat[];
};

function Chip({
  label,
  icon,
  active,
  activeColor = colors.brand,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  active: boolean;
  activeColor?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        height: 40,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: active ? activeColor : colors.line,
        backgroundColor: active ? activeColor : colors.surface,
      }}
    >
      {icon ? (
        <Ionicons name={icon} size={15} color={active ? "white" : colors.ink} style={{ marginRight: 6 }} />
      ) : null}
      <Text style={{ color: active ? "white" : colors.ink, fontWeight: "600", fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 22 }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.inkMuted, marginBottom: 12, letterSpacing: 0.3 }}>
        {title.toUpperCase()}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{children}</View>
    </View>
  );
}

export function FilterSheet({ visible, value, onApply, onClose, formatOptions }: Props) {
  const [draft, setDraft] = useState<FacetFilter>(value);
  // Re-sync when opened so the sheet reflects the committed state.
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible]);

  const formats = formatOptions ?? (["one_on_one", "activity", "event"] as PostFormat[]);

  const toggleFormat = (f: PostFormat) =>
    setDraft((d) => ({
      ...d,
      formats: d.formats.includes(f) ? d.formats.filter((x) => x !== f) : [...d.formats, f],
    }));
  const toggleLevel = (l: number) =>
    setDraft((d) => ({
      ...d,
      skillLevels: d.skillLevels.includes(l)
        ? d.skillLevels.filter((x) => x !== l)
        : [...d.skillLevels, l],
    }));
  const setSeats = (s: SeatsBucket) => setDraft((d) => ({ ...d, seats: s }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={onClose} />
      <View
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: 28,
        }}
      >
        {/* Grabber + header */}
        <View style={{ alignItems: "center", marginBottom: 6 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.ink }}>Filters</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
          <Section title="Type">
            {formats.map((f) => (
              <Chip
                key={f}
                label={FORMAT_LABELS[f].label}
                icon={FORMAT_LABELS[f].icon}
                active={draft.formats.includes(f)}
                onPress={() => toggleFormat(f)}
              />
            ))}
          </Section>

          <Section title="Skill level">
            {SKILL_LEVELS.map((l, i) => (
              <Chip
                key={l.level}
                label={l.label}
                active={draft.skillLevels.includes(l.level)}
                activeColor={LEVEL_COLORS[i]}
                onPress={() => toggleLevel(l.level)}
              />
            ))}
          </Section>

          <Section title="Group size">
            {SEATS_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                active={draft.seats === o.value}
                onPress={() => setSeats(o.value)}
              />
            ))}
          </Section>
        </ScrollView>

        {/* Footer actions */}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 22, gap: 12 }}>
          <Pressable
            onPress={() => setDraft(emptyFacets)}
            style={{ paddingVertical: 14, paddingHorizontal: 18 }}
          >
            <Text style={{ color: colors.inkMuted, fontWeight: "700", fontSize: 15 }}>Reset</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onApply(draft);
              onClose();
            }}
            style={{
              flex: 1,
              backgroundColor: colors.brand,
              borderRadius: 14,
              paddingVertical: 15,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "800", fontSize: 15 }}>Apply</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** A funnel button with an active-count badge. Reused by Discover and Events. */
export function FilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: count > 0 ? colors.brand : colors.surfaceSoft,
      }}
    >
      <Ionicons name="options-outline" size={20} color={count > 0 ? "white" : colors.ink} />
      {count > 0 ? (
        <View
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 3,
            borderRadius: 8,
            backgroundColor: colors.accentBlue,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1.5,
            borderColor: colors.surface,
          }}
        >
          <Text style={{ color: "white", fontSize: 9, fontWeight: "800" }}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
