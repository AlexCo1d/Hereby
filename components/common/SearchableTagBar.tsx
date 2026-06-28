// A search-driven tag filter bar (Discover).
//
//   • Text input with a magnifier. As the user types, a dropdown shows fuzzy
//     matches from `allTags` — AND lets them add the raw text as a free-form
//     search term (so search isn't limited to known tags).
//   • When the input is focused and empty, the dropdown shows RECENT searches
//     (persisted locally via AsyncStorage) so users don't retype.
//   • Selected terms show as chips below the input, each with an × to remove.
//   • A "Clear" appears when at least one chip is active.
//
// Mainstream-app behavior: suggestions are an inline dropdown (not a modal),
// fuzzy, and history-aware.
import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../../constants/theme";

type Props = {
  allTags: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
};

const HISTORY_KEY = "hereby.searchHistory.v1";
const MAX_HISTORY = 8;

// Tiny fuzzy match: keep tags whose lowercased label contains the query, then
// rank by where the match starts (earlier = better) + shorter labels first.
function fuzzyRank(tag: string, q: string) {
  const t = tag.toLowerCase();
  const i = t.indexOf(q);
  if (i < 0) return -1;
  return i * 100 + tag.length;
}

export function SearchableTagBar({ allTags, selected, onChange, placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  // Load persisted history once.
  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY)
      .then((raw) => {
        if (raw) setHistory(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  const persistHistory = useCallback((next: string[]) => {
    setHistory(next);
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const pushHistory = useCallback(
    (term: string) => {
      const clean = term.trim();
      if (!clean) return;
      const next = [clean, ...history.filter((h) => h.toLowerCase() !== clean.toLowerCase())].slice(
        0,
        MAX_HISTORY,
      );
      persistHistory(next);
    },
    [history, persistHistory],
  );

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allTags
      .filter((t) => !selected.some((s) => s.toLowerCase() === t.toLowerCase()))
      .map((t) => ({ t, r: fuzzyRank(t, q) }))
      .filter(({ r }) => r >= 0)
      .sort((a, b) => a.r - b.r)
      .slice(0, 8)
      .map(({ t }) => t);
  }, [query, allTags, selected]);

  const addTerm = (t: string) => {
    const clean = t.trim();
    if (!clean) return;
    if (!selected.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      onChange([...selected, clean]);
    }
    pushHistory(clean);
    setQuery("");
  };
  const removeTerm = (t: string) => onChange(selected.filter((x) => x !== t));

  // What the dropdown shows: typed → fuzzy suggestions (+ "use exact text");
  // empty+focused → recent searches.
  const showSuggestions = focused && query.trim().length > 0;
  const showHistory = focused && query.trim().length === 0 && history.length > 0;

  return (
    <View className="bg-surface border-b border-ink-line" style={{ position: "relative", zIndex: 10 }}>
      {/* Search input */}
      <View className="px-4 pt-2 pb-2">
        <View
          className="flex-row items-center bg-surface-soft rounded-full px-3"
          style={{ height: 40 }}
        >
          <Ionicons name="search" size={16} color={colors.inkMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onSubmitEditing={() => addTerm(query)}
            returnKeyType="search"
            placeholder={placeholder ?? "Search tags (Tennis, Spanish, EECS 281…)"}
            placeholderTextColor={colors.inkMuted}
            style={{
              flex: 1,
              marginLeft: 8,
              height: 40,
              paddingVertical: 0,
              color: colors.ink,
              fontSize: 14,
            }}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} className="pl-2">
              <Ionicons name="close-circle" size={16} color={colors.inkMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Active filter chips */}
      {selected.length > 0 ? (
        <View className="px-3 pb-2 flex-row items-center">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ alignItems: "center", paddingHorizontal: 4 }}
          >
            {selected.map((t) => (
              <View
                key={t}
                className="flex-row items-center bg-brand rounded-full pl-3 pr-1 py-1 mr-2"
              >
                <Text className="text-white text-xs font-semibold">{t}</Text>
                <Pressable
                  onPress={() => removeTerm(t)}
                  hitSlop={6}
                  style={{
                    width: 18,
                    height: 18,
                    marginLeft: 4,
                    borderRadius: 9,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(255,255,255,0.25)",
                  }}
                >
                  <Ionicons name="close" size={12} color="white" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <Pressable onPress={() => onChange([])} hitSlop={6} className="pl-1 pr-2">
            <Text className="text-xs text-ink-muted underline">Clear</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Dropdown — suggestions while typing, recent searches when empty.
          Absolutely positioned so it overlays the content below. */}
      {showSuggestions || showHistory ? (
        <View
          style={{
            position: "absolute",
            top: "100%",
            left: 12,
            right: 12,
            backgroundColor: colors.surface,
            borderRadius: 12,
            paddingVertical: 4,
            marginTop: 4,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 12,
            elevation: 6,
            zIndex: 20,
          }}
        >
          {showSuggestions ? (
            <>
              {/* Always offer the raw typed text as a free-form term first. */}
              <Pressable
                onPress={() => addTerm(query)}
                className="px-4 py-2 flex-row items-center"
              >
                <Ionicons name="search" size={14} color={colors.brand} />
                <Text className="ml-2 text-sm text-ink">
                  Search “<Text className="font-semibold">{query.trim()}</Text>”
                </Text>
              </Pressable>
              {suggestions.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => addTerm(t)}
                  className="px-4 py-2 flex-row items-center"
                >
                  <Ionicons name="pricetag-outline" size={14} color={colors.inkMuted} />
                  <Text className="ml-2 text-sm text-ink">{t}</Text>
                </Pressable>
              ))}
            </>
          ) : (
            <>
              <View className="px-4 pt-2 pb-1 flex-row items-center justify-between">
                <Text className="text-[11px] font-semibold text-ink-muted uppercase">
                  Recent
                </Text>
                <Pressable onPress={() => persistHistory([])} hitSlop={6}>
                  <Text className="text-[11px] text-ink-muted underline">Clear history</Text>
                </Pressable>
              </View>
              {history.map((h) => (
                <Pressable
                  key={h}
                  onPress={() => addTerm(h)}
                  className="px-4 py-2 flex-row items-center"
                >
                  <Ionicons name="time-outline" size={14} color={colors.inkMuted} />
                  <Text className="ml-2 text-sm text-ink flex-1">{h}</Text>
                  <Ionicons name="arrow-up-outline" size={13} color={colors.inkMuted} style={{ transform: [{ rotate: "45deg" }] }} />
                </Pressable>
              ))}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}
