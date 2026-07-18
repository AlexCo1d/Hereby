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
import { SKILL_LEVELS, postKindMeta } from "../../services/types";
import type { DiscoverFilter, PostFormat, PostKind } from "../../services/types";
import { WheelPicker, WHEEL_ITEM_HEIGHT, WHEEL_VISIBLE_ROWS, type WheelItem } from "./WheelPicker";

export type SeatsBucket = "any" | "solo" | "small" | "large";

export type FacetFilter = {
  /** Post-type facet (Offer Help / Need a Hand / Find a Buddy). */
  kinds: PostKind[];
  formats: PostFormat[];
  skillLevels: number[];
  seats: SeatsBucket;
  /** Time-window facet. When enabled, keep only posts overlapping [from, to]
   *  on the selected day. dayOffset 0..6 from today; fromMin/toMin are minutes
   *  from midnight. */
  timeEnabled: boolean;
  dayOffset: number;
  fromMin: number;
  toMin: number;
};

export const emptyFacets: FacetFilter = {
  kinds: [],
  formats: [],
  skillLevels: [],
  seats: "any",
  timeEnabled: false,
  dayOffset: 0,
  fromMin: 8 * 60, // 8:00 AM
  toMin: 20 * 60, // 8:00 PM
};

/** Number of active facets — drives the little badge on the funnel button. */
export function countFacets(f: FacetFilter): number {
  return (
    f.kinds.length +
    f.formats.length +
    f.skillLevels.length +
    (f.seats !== "any" ? 1 : 0) +
    (f.timeEnabled ? 1 : 0)
  );
}

// ---- Time-wheel domain ----------------------------------------------------
/** Earliest / latest selectable half-hour slot (6:00 AM … 10:00 PM). */
const EARLIEST_MIN = 6 * 60; // 6:00 AM
const LATEST_MIN = 22 * 60; // 10:00 PM cap

function fmtClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ap = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${m === 0 ? "00" : m} ${ap}`;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function roundUpToSlot(min: number): number {
  return Math.ceil(min / 30) * 30;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Earliest selectable "from" for a day. For today, start at the next
 *  half-hour slot from now (never earlier than 6 AM, never past 10 PM). */
function fromFloor(dayOffset: number): number {
  if (dayOffset !== 0) return EARLIEST_MIN;
  return Math.min(LATEST_MIN, Math.max(EARLIEST_MIN, roundUpToSlot(nowMinutes())));
}

/** Half-hour slots in [startMin, endMin]. value = minutes from midnight. */
function buildSlots(startMin: number, endMin: number): WheelItem[] {
  const out: WheelItem[] = [];
  for (let m = startMin; m <= endMin; m += 30) out.push({ label: fmtClock(m), value: m });
  if (out.length === 0) out.push({ label: fmtClock(endMin), value: endMin });
  return out;
}

/** Next 7 days as wheel items (Today / Tomorrow / "09/07" MM/DD). */
export const DAY_ITEMS: WheelItem[] = (() => {
  const base = startOfToday();
  const out: WheelItem[] = [];
  for (let off = 0; off < 7; off++) {
    const d = new Date(base + off * 86400000);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const label = off === 0 ? "Today" : off === 1 ? "Tomorrow" : `${mm}/${dd}`;
    out.push({ label, value: off });
  }
  return out;
})();

/** Translate the UI facets into the DiscoverFilter fields the api understands. */
export function facetsToFilter(f: FacetFilter): Partial<DiscoverFilter> {
  const out: Partial<DiscoverFilter> = {};
  if (f.kinds.length) out.kinds = f.kinds;
  if (f.formats.length) out.formats = f.formats;
  if (f.skillLevels.length) out.skillLevels = f.skillLevels;
  if (f.seats === "solo") out.maxSeats = 1;
  else if (f.seats === "small") {
    out.minSeats = 2;
    out.maxSeats = 6;
  } else if (f.seats === "large") out.minSeats = 7;
  if (f.timeEnabled) {
    const dayStart = startOfToday() + f.dayOffset * 86400000;
    const to = f.toMin > f.fromMin ? f.toMin : Math.min(LATEST_MIN, f.fromMin + 30);
    out.windowStart = new Date(dayStart + f.fromMin * 60000).toISOString();
    out.windowEnd = new Date(dayStart + to * 60000).toISOString();
  }
  return out;
}

// Post-type options. The filter uses its own friendlier, emoji-led labels
// (the composer/cards use postKindMeta's "Offering"/"Looking for"/… wording),
// but the accent colour is shared via postKindMeta so a chip lights up in the
// same hue the card tint / badge uses.
const KIND_OPTIONS: { value: PostKind; label: string }[] = [
  { value: "offer", label: "🙋 Offer Help" },
  { value: "seek", label: "🆘 Need a Hand" },
  { value: "partner", label: "🤝 Find a Buddy" },
];

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

/** The three synchronised wheels (day / from / to) with a single centre
 *  highlight band drawn across all of them. */
function TimeWheels({
  draft,
  fromItems,
  toItems,
  fromIdx,
  toIdx,
  setDay,
  setFrom,
  setTo,
}: {
  draft: FacetFilter;
  fromItems: WheelItem[];
  toItems: WheelItem[];
  fromIdx: number;
  toIdx: number;
  setDay: (i: number) => void;
  setFrom: (i: number) => void;
  setTo: (i: number) => void;
}) {
  const wheelHeight = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;
  const bandTop = Math.floor(WHEEL_VISIBLE_ROWS / 2) * WHEEL_ITEM_HEIGHT;
  const dayIdx = Math.max(0, DAY_ITEMS.findIndex((d) => d.value === draft.dayOffset));

  return (
    <View style={{ marginTop: 18 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 4 }}>
        {["Day", "From", "To"].map((t) => (
          <Text key={t} style={{ fontSize: 12, fontWeight: "700", color: colors.inkMuted, letterSpacing: 0.3 }}>
            {t.toUpperCase()}
          </Text>
        ))}
      </View>
      <View style={{ height: wheelHeight }}>
        {/* Centre highlight band, shared by all three wheels. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: bandTop,
            height: WHEEL_ITEM_HEIGHT,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.brandSoft,
            borderRadius: 8,
          }}
        />
        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          <WheelPicker items={DAY_ITEMS} selectedIndex={dayIdx} onChange={setDay} width={110} />
          <WheelPicker items={fromItems} selectedIndex={fromIdx} onChange={setFrom} width={100} />
          <WheelPicker items={toItems} selectedIndex={toIdx} onChange={setTo} width={100} />
        </View>
      </View>
    </View>
  );
}

export function FilterSheet({ visible, value, onApply, onClose, formatOptions }: Props) {
  const [draft, setDraft] = useState<FacetFilter>(value);
  // Re-sync when opened so the sheet reflects the committed state, clamping the
  // window into the current valid range (today can't start in the past; 10 PM cap).
  useEffect(() => {
    if (!visible) return;
    const floor = fromFloor(value.dayOffset);
    const fromMin = Math.max(floor, Math.min(LATEST_MIN, value.fromMin));
    const toMin = Math.max(fromMin, Math.min(LATEST_MIN, value.toMin));
    setDraft({ ...value, fromMin, toMin });
  }, [visible]);

  const formats = formatOptions ?? (["one_on_one", "activity", "event"] as PostFormat[]);

  const toggleKind = (k: PostKind) =>
    setDraft((d) => ({
      ...d,
      kinds: d.kinds.includes(k) ? d.kinds.filter((x) => x !== k) : [...d.kinds, k],
    }));
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

  // From starts at today's "now" floor (or 6 AM on later days); To starts at From.
  const fromItems = buildSlots(fromFloor(draft.dayOffset), LATEST_MIN);
  const toItems = buildSlots(draft.fromMin, LATEST_MIN);
  const fromIdx = Math.max(0, fromItems.findIndex((t) => t.value === draft.fromMin));
  const toIdx = Math.max(0, toItems.findIndex((t) => t.value === draft.toMin));
  const setFrom = (i: number) =>
    setDraft((d) => {
      const fromMin = fromItems[i].value;
      // Keep "to" at or after "from" so the window stays valid.
      const toMin = d.toMin >= fromMin ? d.toMin : Math.min(LATEST_MIN, fromMin + 30);
      return { ...d, fromMin, toMin };
    });
  const setTo = (i: number) => setDraft((d) => ({ ...d, toMin: toItems[i].value }));
  const setDay = (i: number) =>
    setDraft((d) => {
      const dayOffset = DAY_ITEMS[i].value;
      const floor = fromFloor(dayOffset);
      const fromMin = Math.max(floor, Math.min(LATEST_MIN, d.fromMin));
      const toMin = Math.max(fromMin, Math.min(LATEST_MIN, d.toMin));
      return { ...d, dayOffset, fromMin, toMin };
    });

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
          <Section title="Post type">
            {KIND_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                active={draft.kinds.includes(o.value)}
                activeColor={postKindMeta(o.value).color}
                onPress={() => toggleKind(o.value)}
              />
            ))}
          </Section>

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

          <Section title="Time">
            <Chip
              label="Any time"
              icon="time-outline"
              active={!draft.timeEnabled}
              onPress={() => setDraft((d) => ({ ...d, timeEnabled: false }))}
            />
            <Chip
              label="Pick a window"
              icon="calendar-outline"
              active={draft.timeEnabled}
              onPress={() => setDraft((d) => ({ ...d, timeEnabled: true }))}
            />
          </Section>

          {draft.timeEnabled ? (
            <TimeWheels
              draft={draft}
              fromItems={fromItems}
              toItems={toItems}
              fromIdx={fromIdx}
              toIdx={toIdx}
              setDay={setDay}
              setFrom={setFrom}
              setTo={setTo}
            />
          ) : null}
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
      <Ionicons name="funnel-outline" size={18} color={count > 0 ? "white" : colors.ink} />
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
