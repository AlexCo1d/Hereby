// A lightweight, cross-platform (iOS / Android / web) scroll-snap wheel.
//   • Vertical ScrollView with snapToInterval = one row height.
//   • The centered row is the selected value; a highlight band (drawn by the
//     parent) marks the selection line so three wheels can share one band.
//   • Controlled: `selectedIndex` drives the initial scroll and re-syncs when
//     the parent resets it externally; user scrolls report back via onChange.
// Deliberately no Animated fades — static styling keeps it crisp and cheap.
import { useEffect, useRef } from "react";
import {
  Platform,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { colors } from "../../constants/theme";

export const WHEEL_ITEM_HEIGHT = 40;
export const WHEEL_VISIBLE_ROWS = 5; // odd so there's a true centre row

export type WheelItem = { label: string; value: number };

type Props = {
  items: WheelItem[];
  selectedIndex: number;
  onChange: (index: number) => void;
  width?: number;
};

export function WheelPicker({ items, selectedIndex, onChange, width = 96 }: Props) {
  const ref = useRef<ScrollView | null>(null);
  // Guard so programmatic scrollTo (sync) doesn't echo back as user input.
  const settledIndex = useRef(selectedIndex);
  const padRows = Math.floor(WHEEL_VISIBLE_ROWS / 2);
  const height = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;

  // Position the wheel on the selected row at mount. Web ignores the
  // `contentOffset` prop, so without this the wheel opens pinned to the first
  // row while state says otherwise. rAF lets the scroll node lay out first.
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      ref.current?.scrollTo({ y: selectedIndex * WHEEL_ITEM_HEIGHT, animated: false }),
    );
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync when the parent changes the value out from under us (e.g. Reset,
  // or clamping "to" above "from"). Skip if we're already there.
  useEffect(() => {
    if (settledIndex.current === selectedIndex) return;
    settledIndex.current = selectedIndex;
    ref.current?.scrollTo({ y: selectedIndex * WHEEL_ITEM_HEIGHT, animated: true });
  }, [selectedIndex]);

  const settleFromY = (y: number) => {
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(y / WHEEL_ITEM_HEIGHT)));
    if (idx !== settledIndex.current) {
      settledIndex.current = idx;
      onChange(idx);
    }
    // Web has no momentum/snap, so pull the wheel onto the exact row ourselves —
    // but only when it's actually off the row, else the scrollTo re-fires onScroll
    // and we'd loop.
    if (Platform.OS === "web" && Math.abs(y - idx * WHEEL_ITEM_HEIGHT) > 1) {
      ref.current?.scrollTo({ y: idx * WHEEL_ITEM_HEIGHT, animated: true });
    }
  };

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    settleFromY(e.nativeEvent.contentOffset.y);

  // Web fires neither onMomentumScrollEnd nor onScrollEndDrag for wheel/trackpad
  // scrolling, so the value would never commit. Debounce onScroll to detect the
  // end of scrolling and settle then. Harmless on native (idempotent + guarded).
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Platform.OS !== "web") return;
    const y = e.nativeEvent.contentOffset.y;
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => settleFromY(y), 120);
  };
  useEffect(() => () => {
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
  }, []);

  return (
    <View style={{ width, height, overflow: "hidden" }}>
      <ScrollView
        ref={(r) => {
          ref.current = r;
        }}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: padRows * WHEEL_ITEM_HEIGHT }}
        contentOffset={{ x: 0, y: selectedIndex * WHEEL_ITEM_HEIGHT }}
        onScroll={onScroll}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
      >
        {items.map((it, i) => {
          const active = i === settledIndex.current;
          return (
            <View
              key={`${it.value}-${i}`}
              style={{ height: WHEEL_ITEM_HEIGHT, alignItems: "center", justifyContent: "center" }}
            >
              <Text
                style={{
                  fontSize: active ? 17 : 15,
                  fontWeight: active ? "800" : "500",
                  color: active ? colors.ink : colors.inkMuted,
                }}
                numberOfLines={1}
              >
                {it.label}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
