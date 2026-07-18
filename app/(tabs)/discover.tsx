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
import { View, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";

import { SearchableTagBar } from "../../components/common/SearchableTagBar";
import { FilterSheet, FilterButton, FacetFilter, emptyFacets, countFacets, facetsToFilter } from "../../components/common/FilterSheet";
import { FloatingPostButton } from "../../components/common/FloatingPostButton";
import { LocateButton } from "../../components/common/LocateButton";
import { OSMMap, MapMarkerSpec } from "../../components/map/OSMMap";
import { ClusterPanel } from "../../components/post/ClusterPanel";
import { Ionicons } from "@expo/vector-icons";

import { api } from "../../services/api";
import { categoryVisual } from "../../services/categoryVisuals";
import { UCF_CENTER, INTERESTS } from "../../services/mock/data";
import type { Post, User } from "../../services/types";
import { isPostIncoming } from "../../services/types";
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
  // Cluster tap → floating vertical list. `ids` are the posts in the tapped
  // cluster; x/y anchor the panel next to the bubble.
  const [selected, setSelected] = useState<{ ids: string[]; x: number; y: number } | null>(null);
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  // The post whose detail is open in the cluster panel. When set, the map flies
  // to that post's location and zooms in; clearing it returns to the radius view.
  const [focusPost, setFocusPost] = useState<Post | null>(null);
  // The viewer's live GPS position, once they tap "locate me". When set, the map
  // recenters here and drops a "you are here" dot. Purely a viewing aid — it does
  // NOT change the saved area the feed is queried against.
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Bump whenever radius or center changes so the map programmatically
  // re-zooms to keep the circle at a constant on-screen size. Also bumps when
  // the focused post changes so the map flies to (or away from) it.
  const [mapToken, setMapToken] = useState(0);
  useEffect(() => {
    setMapToken((n) => n + 1);
  }, [radiusMiles, centerLat, centerLng]);
  useEffect(() => {
    setMapToken((n) => n + 1);
  }, [focusPost]);
  useEffect(() => {
    if (myLocation) setMapToken((n) => n + 1);
  }, [myLocation]);

  // spanDeg ≈ 0.04 × radius gives ~60% diameter of the viewport for the
  // radius circle — small radii zoom in tight, large radii zoom out. A focused
  // post overrides both the center and span so the map zooms in tight on it.
  const spanDeg = focusPost ? 0.006 : Math.max(0.005, radiusMiles * 0.04);
  // Priority: an open post > the viewer's GPS fix > their saved area.
  const mapCenter = focusPost ? focusPost.location : myLocation ?? center;

  // Re-fetch when filters change. Also re-run when this tab regains focus so
  // a freshly-created post immediately shows up in the feed.
  const load = useCallback(async () => {
    setLoading(true);
    setSelected(null);
    try {
      // Spec 0.8 — request server-side match scoring. The backend uses
      // `viewerInterestIds` for the tag-match term and ranks descending by
      // matchScore. We don't sort or score on the client.
      const list = await api.listPosts({
        tags: tags.length > 0 ? tags : undefined,
        center,
        radiusMiles,
        // Own posts DO belong on the map now (tapping one routes into its
        // order/check-in screen via the "My Post" CTA). We used to pass
        // excludeAuthorId here to hide them; that's intentionally dropped.
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
  }, [tags, facets, center, radiusMiles, viewerInterestIds]);

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

  // Memory guard with PROGRESSIVE (dynamic-cache) loading. Instantiating every
  // pin's <View> for hundreds of posts is what blows memory, so we render the
  // nearest `markerLimit` posts to the current center and grow that window one
  // PAGE at a time in the background after the first paint — fast initial
  // render, but nothing is permanently hidden past the first page. The window
  // resets whenever the result set or center changes, and it's bounded by
  // MARKER_CEILING so an enormous feed still can't exhaust memory. List surfaces
  // (ClusterPanel) are separately virtualized with FlatList.
  const PAGE = 150;
  const MARKER_CEILING = 600;
  const [markerLimit, setMarkerLimit] = useState(PAGE);

  // Reset the progressive window when the feed or center changes.
  useEffect(() => {
    setMarkerLimit(PAGE);
  }, [posts, center.lat, center.lng]);

  // Grow the rendered-marker window a page at a time until every nearby post is
  // pinned or we hit the ceiling.
  useEffect(() => {
    const cap = Math.min(posts.length, MARKER_CEILING);
    if (markerLimit >= cap) return;
    const id = setTimeout(() => setMarkerLimit((n) => Math.min(n + PAGE, cap)), 400);
    return () => clearTimeout(id);
  }, [markerLimit, posts.length]);

  const visiblePosts = useMemo(() => {
    if (posts.length <= markerLimit) return posts;
    const d2 = (p: Post) => {
      const dlat = p.location.lat - center.lat;
      const dlng = p.location.lng - center.lng;
      return dlat * dlat + dlng * dlng;
    };
    return [...posts].sort((a, b) => d2(a) - d2(b)).slice(0, markerLimit);
  }, [posts, center, markerLimit]);

  const markers: MapMarkerSpec[] = visiblePosts.map((p) => {
    // Per-sport colour so the map reads at a glance and clusters can tint by
    // activity when a spot is single-sport.
    const visual = categoryVisual(p);
    // "In-coming" (already agreed, not yet started) posts render greyed so they
    // read as distinct from an open, joinable post at a glance.
    const incoming = isPostIncoming(p);
    const accent = incoming ? "#9AA0A6" : visual.color;
    return {
      id: p.id,
      coordinate: p.location,
      color: accent,
      emoji: visual.emoji,
      // Single-event pin: a sport-coloured disc with the sport glyph. Colour
      // alone distinguishes the activity, so no (repetitive) avatar. Greyed for
      // in-coming posts.
      render: () => (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: accent,
            borderWidth: 2,
            borderColor: "white",
            alignItems: "center",
            justifyContent: "center",
            opacity: incoming ? 0.85 : 1,
            shadowColor: "#000",
            shadowOpacity: 0.3,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 4,
          }}
        >
          <Ionicons name={visual.icon} size={16} color="white" />
        </View>
      ),
      onPress: () => router.push(`/provider/${p.id}` as any),
    };
  });

  // "You are here" dot for the viewer's live GPS fix, drawn on top of the post
  // pins. A solid blue disc (distinct from the sport-coloured post pins).
  const allMarkers: MapMarkerSpec[] = myLocation
    ? [
        {
          id: "__me__",
          coordinate: myLocation,
          color: colors.accentBlue,
          render: () => (
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: colors.accentBlue,
                borderWidth: 3,
                borderColor: "white",
                shadowColor: "#000",
                shadowOpacity: 0.35,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
                elevation: 5,
              }}
            />
          ),
        },
        ...markers,
      ]
    : markers;

  // Posts for the currently-tapped cluster, in marker order.
  const selectedPosts = useMemo(() => {
    if (!selected) return [];
    const byId = new Map(posts.map((p) => [p.id, p]));
    return selected.ids.map((id) => byId.get(id)).filter((p): p is Post => !!p);
  }, [selected, posts]);

  // Floating list geometry — sized RELATIVE to the actual rendered map area
  // (mapSize, from onLayout) so it adapts to any device without a web-vs-phone
  // retune. Width tracks the viewport (wider than the old fixed 280, capped so
  // it never spans a tablet); height is a fraction of the map with sane floor/
  // ceiling. Falls back to reasonable defaults before the first layout pass.
  const LIST_W = mapSize.w
    ? Math.round(Math.min(Math.max(mapSize.w - 24, 300), 440))
    : 320;
  const LIST_MAXH = mapSize.h
    ? Math.round(Math.min(Math.max(mapSize.h * 0.62, 340), 560))
    : 420;
  const listLeft = selected
    ? Math.min(Math.max(8, selected.x - LIST_W / 2), Math.max(8, mapSize.w - LIST_W - 8))
    : 0;
  const listTop = selected
    ? Math.min(Math.max(8, selected.y + 26), Math.max(8, mapSize.h - LIST_MAXH - 8))
    : 0;

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

      {/* Map fills the area. Tapping a cluster bubble floats a vertical list of
          its posts beside it; single pins open the post directly. */}
      <View
        className="flex-1"
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setMapSize((d) => (d.w === width && d.h === height ? d : { w: width, h: height }));
        }}
      >
        <OSMMap
          center={mapCenter}
          markers={allMarkers}
          radiusMiles={focusPost ? undefined : radiusMiles}
          spanDeg={spanDeg}
          recenterToken={mapToken}
          onClusterPress={(ids, point) => setSelected({ ids, x: point.x, y: point.y })}
          onMapPress={() => {
            setSelected(null);
            setFocusPost(null);
          }}
        />

        {/* Status pill (loading / empty) — non-interactive. */}
        {loading ? (
          <View style={{ position: "absolute", top: 12, alignSelf: "center" }} pointerEvents="none">
            <View className="bg-surface/90 rounded-full px-4 py-2">
              <ActivityIndicator color={colors.brand} />
            </View>
          </View>
        ) : posts.length === 0 ? (
          <View
            style={{ position: "absolute", top: 12, left: 24, right: 24, alignItems: "center" }}
            pointerEvents="none"
          >
            <View
              className="rounded-full px-4 py-2"
              style={{ backgroundColor: "rgba(255,255,255,0.92)" }}
            >
              <Text className="text-ink-muted text-xs text-center">
                {tags.length > 0
                  ? `Nothing nearby matching ${tags.join(", ")}.`
                  : "Nothing nearby yet. Be the first to post!"}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Cluster popup — floated next to the tapped bubble/pin. Remounts per
            selection (key) so its internal list/detail view state resets. A
            single-pin tap (one member) opens straight into the detail view. */}
        {selected && selectedPosts.length > 0 ? (
          <View
            style={{
              position: "absolute",
              left: listLeft,
              top: listTop,
              width: LIST_W,
              maxHeight: LIST_MAXH,
            }}
          >
            <ClusterPanel
              key={selected.ids.join(",")}
              posts={selectedPosts}
              users={users}
              onClose={() => {
                setSelected(null);
                setFocusPost(null);
              }}
              initialDetailId={selected.ids.length === 1 ? selected.ids[0] : null}
              onFocusPost={setFocusPost}
              maxHeight={LIST_MAXH}
            />
          </View>
        ) : null}

        {/* Center the map on the viewer's live GPS position (sits above the +
            FAB so the two don't overlap). */}
        <LocateButton
          bottom={88}
          onLocate={(c) => {
            setSelected(null);
            setFocusPost(null);
            setMyLocation(c);
          }}
        />

        <FloatingPostButton onPress={() => router.push("/post/new" as any)} />
      </View>
    </SafeAreaView>
  );
}
