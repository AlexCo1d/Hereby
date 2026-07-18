// Three-wheel start-time picker (Day / Hour / Minute) — the same scroll-snap
// wheels the Discover filter uses, reused here so the composer matches. The
// day wheel spans Today / Tomorrow / MM-DD for a week; hours are bounded to the
// 6 AM–10 PM activity window (posts may not START in the 10 PM–6 AM gap) and
// minutes snap to 15-minute steps. Cross-platform via WheelPicker.
import { useEffect, useMemo } from "react";
import { View, Text } from "react-native";
import { WheelPicker, WHEEL_ITEM_HEIGHT, WHEEL_VISIBLE_ROWS, type WheelItem } from "./WheelPicker";
import { colors } from "../../constants/theme";

const EARLIEST_HOUR = 6; // 6 AM — earliest a post may start
const LATEST_HOUR = 22; // 10 PM — latest a post may start (cap)
const MINUTE_STEP = 15;
const DAY_MS = 86400000;

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Next 7 days as wheel items (Today / Tomorrow / "07/11" MM/DD).
const DAY_ITEMS: WheelItem[] = (() => {
  const base = startOfToday();
  const out: WheelItem[] = [];
  for (let off = 0; off < 7; off++) {
    const d = new Date(base + off * DAY_MS);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const label = off === 0 ? "Today" : off === 1 ? "Tomorrow" : `${mm}/${dd}`;
    out.push({ label, value: off });
  }
  return out;
})();

function hourLabel(h: number): string {
  const ap = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${ap}`;
}
const HOUR_ITEMS: WheelItem[] = (() => {
  const out: WheelItem[] = [];
  for (let h = EARLIEST_HOUR; h <= LATEST_HOUR; h++) out.push({ label: hourLabel(h), value: h });
  return out;
})();

// 00 / 15 / 30 / 45 — but at the 10 PM cap only :00 is valid (no 10:15 PM start).
function minuteItems(hour: number): WheelItem[] {
  const out: WheelItem[] = [];
  const max = hour >= LATEST_HOUR ? 0 : 60 - MINUTE_STEP;
  for (let m = 0; m <= max; m += MINUTE_STEP) out.push({ label: String(m).padStart(2, "0"), value: m });
  return out;
}

function compose(dayOffset: number, hour: number, minute: number): Date {
  const d = new Date(startOfToday() + dayOffset * DAY_MS);
  d.setHours(hour, minute, 0, 0);
  return d;
}

type Props = { value: Date; onChange: (d: Date) => void };

/** Controlled by `value`. Any wheel scroll composes a new Date and reports it up. */
export function DateTimeWheels({ value, onChange }: Props) {
  // Derive wheel positions from `value`, clamped/snapped into the allowed domain.
  const dayOffset = useMemo(() => {
    const d0 = new Date(value);
    d0.setHours(0, 0, 0, 0);
    const off = Math.round((d0.getTime() - startOfToday()) / DAY_MS);
    return Math.max(0, Math.min(DAY_ITEMS.length - 1, off));
  }, [value]);
  const hour = Math.max(EARLIEST_HOUR, Math.min(LATEST_HOUR, value.getHours()));
  const minuteOptions = minuteItems(hour);
  const snapped = Math.min(60 - MINUTE_STEP, Math.round(value.getMinutes() / MINUTE_STEP) * MINUTE_STEP);
  const minute = minuteOptions.some((m) => m.value === snapped)
    ? snapped
    : minuteOptions[minuteOptions.length - 1].value;

  // On mount, if `value` fell outside the grid/window, normalise it once so the
  // form state matches what the wheels show.
  useEffect(() => {
    const composed = compose(dayOffset, hour, minute);
    if (composed.getTime() !== value.getTime()) onChange(composed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dayIdx = Math.max(0, DAY_ITEMS.findIndex((d) => d.value === dayOffset));
  const hourIdx = Math.max(0, HOUR_ITEMS.findIndex((h) => h.value === hour));
  const minuteIdx = Math.max(0, minuteOptions.findIndex((m) => m.value === minute));

  const setDay = (i: number) => onChange(compose(DAY_ITEMS[i].value, hour, minute));
  const setHour = (i: number) => {
    const h = HOUR_ITEMS[i].value;
    const opts = minuteItems(h);
    const m = opts.some((x) => x.value === minute) ? minute : opts[opts.length - 1].value;
    onChange(compose(dayOffset, h, m));
  };
  const setMinute = (i: number) => onChange(compose(dayOffset, hour, minuteOptions[i].value));

  const wheelHeight = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;
  const bandTop = Math.floor(WHEEL_VISIBLE_ROWS / 2) * WHEEL_ITEM_HEIGHT;

  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 4 }}>
        {["Day", "Hour", "Min"].map((t) => (
          <Text
            key={t}
            style={{ fontSize: 12, fontWeight: "700", color: colors.inkMuted, letterSpacing: 0.3 }}
          >
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
          <WheelPicker items={HOUR_ITEMS} selectedIndex={hourIdx} onChange={setHour} width={90} />
          <WheelPicker items={minuteOptions} selectedIndex={minuteIdx} onChange={setMinute} width={90} />
        </View>
      </View>
    </View>
  );
}
