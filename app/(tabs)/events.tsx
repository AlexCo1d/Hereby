// Events tab — group activities (Posts whose format is not one_on_one).
// Sources from the single Post table via `api.listPosts({ onlyEvents: true })`
// so events and 1v1 posts share one schema. Tapping a card opens the same
// provider/[id] detail screen used elsewhere.
import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";

import { EventCard } from "../../components/post/EventCard";
import { FloatingPostButton } from "../../components/common/FloatingPostButton";
import { FilterSheet, FilterButton, FacetFilter, emptyFacets, countFacets, facetsToFilter } from "../../components/common/FilterSheet";
import { api } from "../../services/api";
import type { Post, User, PostFormat } from "../../services/types";
import { colors } from "../../constants/theme";

export default function EventsScreen() {
  const [items, setItems] = useState<Post[]>([]);
  const [hosts, setHosts] = useState<Record<string, User>>({});
  /** Set of postIds the viewer already has a non-cancelled order against —
   *  drives the "You're going" badge on each EventCard. */
  const [joinedPostIds, setJoinedPostIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<FacetFilter>(emptyFacets);
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, myOrders] = await Promise.all([
        api.listPosts({
          onlyEvents: true,
          query: query || undefined,
          ...facetsToFilter(facets),
        }),
        api.listMyOrders(),
      ]);
      setItems(list);
      setJoinedPostIds(
        new Set(myOrders.filter((o) => o.status !== "cancelled").map((o) => o.postId)),
      );
      const lookup: Record<string, User> = {};
      for (const p of list) {
        if (!lookup[p.authorId]) {
          const u = await api.getUser(p.authorId);
          if (u) lookup[p.authorId] = u;
        }
      }
      setHosts(lookup);
    } finally {
      setLoading(false);
    }
  }, [query, facets]);

  useEffect(() => {
    load();
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      {/* Top bar: round logo + search field + menu */}
      <View className="px-4 pt-2 pb-3 flex-row items-center">
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.brand,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="location" size={20} color="white" />
        </View>
        <View className="flex-1 mx-3 flex-row items-center bg-surface-soft rounded-full px-3 h-10">
          <Ionicons name="search" size={16} color={colors.inkMuted} />
          <TextInput
            placeholder="Search events"
            placeholderTextColor={colors.inkMuted}
            value={query}
            onChangeText={setQuery}
            className="flex-1 ml-2 text-ink"
          />
        </View>
        <FilterButton count={countFacets(facets)} onPress={() => setFilterOpen(true)} />
      </View>

      <FilterSheet
        visible={filterOpen}
        value={facets}
        onApply={setFacets}
        onClose={() => setFilterOpen(false)}
        formatOptions={["activity", "event"] as PostFormat[]}
      />

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 100 }}>
        {loading ? (
          <View className="items-center mt-12">
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : items.length === 0 ? (
          <Text className="text-ink-muted text-center mt-12">No events found</Text>
        ) : (
          items.map((p) => (
            <EventCard
              key={p.id}
              post={p}
              host={hosts[p.authorId]}
              joined={joinedPostIds.has(p.id)}
              onPress={() => router.push(`/provider/${p.id}` as any)}
            />
          ))
        )}
      </ScrollView>

      <FloatingPostButton onPress={() => router.push("/post/new" as any)} />
    </SafeAreaView>
  );
}
