// Discover — v2 redesign.
//   • Top: SearchableTagBar (multi-select, fuzzy autocomplete).
//   • Upper third: horizontal scroller of provider cards for posts within
//     the user's radius, EXCLUDING posts the user authored themselves
//     (those live in My Post). Auto-refreshes when filters change.
//   • Bottom: free-explore map with a pin per post and a radius circle whose
//     visual size stays constant — we drive map zoom from the radius value
//     so the circle always takes ~the same fraction of the viewport.
//   • Floating "+" FAB → new post.
import { useEffect, useMemo, useState } from "react";
import { View, ScrollView, Text, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";

import { SearchableTagBar } from "../../components/common/SearchableTagBar";
import { FilterSheet, FilterButton, FacetFilter, emptyFacets, countFacets, facetsToFilter } from "../../components/common/FilterSheet";
import { FloatingPostButton } from "../../components/common/FloatingPostButton";
import { OSMMap, MapMarkerSpec } from "../../components/map/OSMMap";
import { ProviderCard } from "../../components/post/ProviderCard";
import { Avatar } from "../../components/common/Avatar";

import { api } from "../../services/api";
import { categoryVisual } from "../../services/categoryVisuals";
import { UCF_CENTER, INTERESTS } from "../../services/mock/data";
import type { Post, User } from "../../services/types";
import { useAuth } from "../../stores/auth";
import { colors } from "../../constants/theme";

// All known tags that can be used to filter Discover. We feed the searchable
// chip bar these so users can type "Spanish", "Tennis", or anything else.
const ALL_TAGS = Array.from(
  new Set([
    ...INTERESTS.map((i) => i.label),
    "Tennis",
    "Gym",
    "UX/UI",
    "Coding",
    "Music",
    "Language",
    "Study",
    "Volunteer",
    "Workshop",
    "Social",
    "Sports",
  ]),
);

export default function DiscoverScreen() {
  const radiusMiles = useAuth((s) => s.user?.radiusMiles ?? 5);
  const centerLat = useAuth((s) => s.user?.centerLat);
  const centerLng = useAuth((s) => s.user?.centerLng);
  const myId = useAuth((s) => s.user?.id ?? "");
  const viewerInterestIds = useAuth((s) => s.user?.interestIds ?? []);
  const center = useMemo(
    () => ({ lat: centerLat ?? UCF_CENTER.lat, lng: centerLng ?? UCF_CENTER.lng }),
    [centerLat, centerLng],
  );

  const [tags, setTags] = useState<string[]>([]);
  const [facets, setFacets] = useState<FacetFilter>(emptyFacets);
  const [filterOpen, setFilterOpen] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(false);

  // Bump whenever radius or center changes so the map programmatically
  // re-zooms to keep the circle at a constant on-screen size.
  const [mapToken, setMapToken] = useState(0);
  useEffect(() => {
    setMapToken((n) => n + 1);
  }, [radiusMiles, centerLat, centerLng]);

  // spanDeg ≈ 0.04 × radius gives ~60% diameter of the viewport for the
  // radius circle — small radii zoom in tight, large radii zoom out.
  const spanDeg = Math.max(0.005, radiusMiles * 0.04);

  // Re-fetch when filters change. Also re-run when this tab regains focus so
  // a freshly-created post immediately shows up in the feed.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Spec 0.8 — request server-side match scoring. The backend uses
      // `viewerInterestIds` for the tag-match term and ranks descending by
      // matchScore. We don't sort or score on the client.
      const list = await api.listPosts({
        tags: tags.length > 0 ? tags : undefined,
        center,
        radiusMiles,
        excludeAuthorId: myId,
        viewerInterestIds,
        useMatchScore: true,
        ...facetsToFilter(facets),
      });
      setPosts(list);
      const lookup: Record<string, User> = {};
      for (const p of list) {
        if (!lookup[p.authorId]) {
          const u = await api.getUser(p.authorId);
          if (u) lookup[p.authorId] = u;
        }
      }
      setUsers(lookup);
    } finally {
      setLoading(false);
    }
  }, [tags, facets, center, radiusMiles, myId, viewerInterestIds]);

  useEffect(() => {
    load();
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Tag universe for autocomplete: the static seed list + every tag that
  // actually appears on a loaded post, so freshly-typed custom tags surface.
  const tagUniverse = useMemo(() => {
    const set = new Set(ALL_TAGS);
    for (const p of posts) {
      for (const t of p.tags ?? []) set.add(t);
      if (p.category) set.add(p.category);
    }
    return Array.from(set);
  }, [posts]);

  const markers: MapMarkerSpec[] = posts.map((p) => {
    const accent = p.format !== "one_on_one" ? colors.accentBlue : colors.brand;
    return {
      id: p.id,
      coordinate: p.location,
      render: () => (
        <View
          style={{
            backgroundColor: "white",
            padding: 3,
            borderRadius: 999,
            borderWidth: 2,
            borderColor: accent,
          }}
        >
          <Avatar uri={users[p.authorId]?.avatarUrl ?? ""} size={28} />
          {/* Clean category icon badge (basketball / tennis / …) so the map
              reads at a glance without opening each pin. */}
          <View
            style={{
              position: "absolute",
              right: -3,
              bottom: -3,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: accent,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1.5,
              borderColor: "white",
            }}
          >
            <Ionicons name={categoryVisual(p).icon} size={10} color="white" />
          </View>
        </View>
      ),
      onPress: () => router.push(`/provider/${p.id}` as any),
    };
  });

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      {/* Searchable filter bar (replaces the old static category tabs) with a
          funnel button on the right for the facet filters. */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", zIndex: 10 }}>
        <View style={{ flex: 1 }}>
          <SearchableTagBar allTags={tagUniverse} selected={tags} onChange={setTags} />
        </View>
        <View style={{ paddingTop: 8, paddingRight: 12, paddingLeft: 4 }}>
          <FilterButton count={countFacets(facets)} onPress={() => setFilterOpen(true)} />
        </View>
      </View>

      <FilterSheet
        visible={filterOpen}
        value={facets}
        onApply={setFacets}
        onClose={() => setFilterOpen(false)}
      />

      {/* Map fills the area; the card scroller floats over it with a
          transparent strip so the map shows through (more spacious look). */}
      <View className="flex-1">
        <OSMMap
          center={center}
          markers={markers}
          radiusMiles={radiusMiles}
          spanDeg={spanDeg}
          recenterToken={mapToken}
        />

        {/* Floating horizontal card scroller (transparent background) */}
        <View
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 134 }}
          pointerEvents="box-none"
        >
          {loading ? (
            <View className="mt-4 self-center bg-surface/90 rounded-full px-4 py-2">
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : posts.length === 0 ? (
            <View className="mt-4 mx-6 self-center rounded-full px-4 py-2" style={{ backgroundColor: "rgba(255,255,255,0.92)" }}>
              <Text className="text-ink-muted text-xs text-center">
                {tags.length > 0
                  ? `Nothing nearby matching ${tags.join(", ")}.`
                  : "Nothing nearby yet. Be the first to post!"}
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
              decelerationRate="fast"
              snapToInterval={284}
              snapToAlignment="start"
            >
              {posts.map((p) => {
                const u = users[p.authorId];
                if (!u) return null;
                return (
                  <View key={p.id} style={{ width: 276, marginRight: 8 }}>
                    <ProviderCard
                      post={p}
                      author={u}
                      onPress={() => router.push(`/provider/${p.id}` as any)}
                    />
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>

        <FloatingPostButton onPress={() => router.push("/post/new" as any)} />
      </View>
    </SafeAreaView>
  );
}
