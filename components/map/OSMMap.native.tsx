// Native (iOS / Android) implementation backed by react-native-maps and
// OpenStreetMap raster tiles. Web resolves the sibling `OSMMap.tsx` instead.
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text } from "react-native";
import MapView, { UrlTile, Marker, Circle, type Region } from "react-native-maps";
import { colors } from "../../constants/theme";
import type { OSMMapProps, MapMarkerSpec } from "./OSMMap";
import { FIXED_RING_FRACTION } from "./OSMMap";
export type { OSMMapProps, MapMarkerSpec } from "./OSMMap";

// Fallback viewport dims (px) before onLayout reports the real size, so the
// ring + zoom are sane on the first frame and never gated on layout timing.
const FALLBACK_MIN_DIM = 320;
const FALLBACK_HEIGHT = 600;

// Two markers closer than this on screen (px) collapse into one cluster. Tuned
// so pins don't visually overlap but nearby-but-distinct spots stay separate.
const CLUSTER_PX = 58;

// latitudeDelta so a circle of `miles` shows as `pixelRadius` px in a viewport
// `heightPx` tall. (1 deg latitude ≈ 111.32 km.)
function latDeltaForRadius(miles: number, pixelRadius: number, heightPx: number) {
  const meters = miles * 1609.34;
  const metersPerPixel = meters / Math.max(1, pixelRadius);
  const visibleMeters = metersPerPixel * heightPx;
  return visibleMeters / 111320;
}

type Cluster = {
  key: string;
  lat: number;
  lng: number;
  members: MapMarkerSpec[];
};

/** Greedy screen-space clustering: project every marker to pixels for the
 *  current region, then absorb neighbours within CLUSTER_PX. Re-runs whenever
 *  the region (pan/zoom) or the marker set changes, so clusters split apart as
 *  the user zooms in and merge as they zoom out — exactly the "cluster follows
 *  the scale" behaviour we want. */
function clusterMarkers(
  markers: MapMarkerSpec[],
  region: Region,
  w: number,
  h: number,
): Cluster[] {
  const west = region.longitude - region.longitudeDelta / 2;
  const north = region.latitude + region.latitudeDelta / 2;
  const toPx = (lat: number, lng: number) => ({
    x: ((lng - west) / region.longitudeDelta) * w,
    y: ((north - lat) / region.latitudeDelta) * h,
  });

  const pts = markers.map((m) => ({ m, ...toPx(m.coordinate.lat, m.coordinate.lng) }));
  const used = new Array(pts.length).fill(false);
  const clusters: Cluster[] = [];

  for (let i = 0; i < pts.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const members = [pts[i].m];
    let sumLat = pts[i].m.coordinate.lat;
    let sumLng = pts[i].m.coordinate.lng;
    for (let j = i + 1; j < pts.length; j++) {
      if (used[j]) continue;
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      if (dx * dx + dy * dy <= CLUSTER_PX * CLUSTER_PX) {
        used[j] = true;
        members.push(pts[j].m);
        sumLat += pts[j].m.coordinate.lat;
        sumLng += pts[j].m.coordinate.lng;
      }
    }
    clusters.push({
      key: members.map((m) => m.id).join("_"),
      lat: sumLat / members.length,
      lng: sumLng / members.length,
      members,
    });
  }
  return clusters;
}

/** A round count bubble sized by how many events it holds. */
function ClusterBubble({ count, color }: { count: number; color: string }) {
  const size = count >= 10 ? 46 : count >= 5 ? 40 : 34;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 3,
        borderColor: "white",
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        elevation: 4,
      }}
    >
      <Text style={{ color: "white", fontWeight: "800", fontSize: count >= 10 ? 16 : 14 }}>
        {count}
      </Text>
    </View>
  );
}

export function OSMMap(props: OSMMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const fixedMode = props.fixedRadiusMiles != null;
  const measured = Math.min(dims.w, dims.h);
  const pixelRadius = (measured > 0 ? measured : FALLBACK_MIN_DIM) * FIXED_RING_FRACTION;
  const heightPx = dims.h > 0 ? dims.h : FALLBACK_HEIGHT;

  const legacySpan = props.spanDeg ?? 0.04;
  const fixedDelta = latDeltaForRadius(props.fixedRadiusMiles ?? 5, pixelRadius, heightPx);
  const span = fixedMode ? fixedDelta : legacySpan;

  // Live region — seeded from center/span, kept fresh on every pan/zoom so the
  // clustering projection matches what's actually on screen.
  const [region, setRegion] = useState<Region>({
    latitude: props.center.lat,
    longitude: props.center.lng,
    latitudeDelta: span > 0 ? span : 0.04,
    longitudeDelta: span > 0 ? span : 0.04,
  });

  // Animate on radius / recenter / measured-size change. Skip the very first
  // render so we don't double-animate over initialRegion.
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    if (span <= 0) return;
    mapRef.current?.animateToRegion(
      {
        latitude: props.center.lat,
        longitude: props.center.lng,
        latitudeDelta: span,
        longitudeDelta: span,
      },
      300,
    );
    // Deliberately NOT depending on center — panning shouldn't re-animate and
    // fight the user. Radius/slider (span), recenterToken (search/locate), and
    // measured size are what should re-zoom; center is read fresh via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.recenterToken, props.fixedRadiusMiles, span]);

  const clusters = useMemo(() => {
    const w = dims.w > 0 ? dims.w : FALLBACK_MIN_DIM;
    const h = dims.h > 0 ? dims.h : FALLBACK_HEIGHT;
    return clusterMarkers(props.markers ?? [], region, w, h);
  }, [props.markers, region, dims.w, dims.h]);

  const onClusterSelect = async (c: Cluster) => {
    const cb = props.onClusterPress;
    if (cb) {
      // Surface the member posts + on-screen anchor so the caller can float a
      // list beside the bubble. pointForCoordinate is async on native.
      let point = { x: (dims.w || FALLBACK_MIN_DIM) / 2, y: (dims.h || FALLBACK_HEIGHT) / 2 };
      try {
        const p = await mapRef.current?.pointForCoordinate({
          latitude: c.lat,
          longitude: c.lng,
        });
        if (p) point = { x: p.x, y: p.y };
      } catch {
        // fall back to viewport centre
      }
      cb(
        c.members.map((m) => m.id),
        point,
      );
      return;
    }
    mapRef.current?.animateToRegion(
      {
        latitude: c.lat,
        longitude: c.lng,
        latitudeDelta: Math.max(0.0025, region.latitudeDelta / 2.5),
        longitudeDelta: Math.max(0.0025, region.longitudeDelta / 2.5),
      },
      300,
    );
  };

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setDims((d) => (d.w === width && d.h === height ? d : { w: width, h: height }));
      }}
    >
      <MapView
        ref={(r) => {
          mapRef.current = r;
        }}
        style={{ flex: 1 }}
        initialRegion={{
          latitude: props.center.lat,
          longitude: props.center.lng,
          latitudeDelta: span > 0 ? span : 0.04,
          longitudeDelta: span > 0 ? span : 0.04,
        }}
        mapType="none"
        // Lock zoom/rotate/pitch in "life circle" mode so the fixed ring keeps
        // representing the chosen mileage; panning (scroll) stays on.
        zoomEnabled={!fixedMode}
        rotateEnabled={!fixedMode}
        pitchEnabled={!fixedMode}
        onPress={
          props.onMapPress
            ? (e: any) =>
                props.onMapPress!({
                  lat: e.nativeEvent.coordinate.latitude,
                  lng: e.nativeEvent.coordinate.longitude,
                })
            : undefined
        }
        onRegionChangeComplete={(r: Region) => {
          setRegion(r);
          props.onRegionChange?.({ lat: r.latitude, lng: r.longitude });
        }}
      >
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
        />
        {/* Geographic circle only in legacy (non-fixed) mode. */}
        {!fixedMode && props.radiusMiles ? (
          <Circle
            center={{ latitude: props.center.lat, longitude: props.center.lng }}
            radius={props.radiusMiles * 1609.34}
            strokeColor={colors.brand}
            strokeWidth={2}
            fillColor={"rgba(255,107,53,0.18)"}
          />
        ) : null}
        {clusters.map((c) => {
          if (c.members.length === 1) {
            const m = c.members[0];
            return (
              <Marker
                key={m.id}
                coordinate={{ latitude: m.coordinate.lat, longitude: m.coordinate.lng }}
                // Prefer the in-place popup (single-member cluster) so a lone pin
                // opens the same floating card as a cluster; fall back to onPress.
                onPress={props.onClusterPress ? () => onClusterSelect(c) : m.onPress}
              >
                {m.render?.()}
              </Marker>
            );
          }
          // A dominant colour makes single-sport clusters read at a glance;
          // mixed clusters fall back to brand orange.
          const first = c.members[0].color ?? colors.brand;
          const uniform = c.members.every((m) => (m.color ?? colors.brand) === first);
          return (
            <Marker
              key={c.key}
              coordinate={{ latitude: c.lat, longitude: c.lng }}
              onPress={() => onClusterSelect(c)}
              tracksViewChanges={false}
            >
              <ClusterBubble count={c.members.length} color={uniform ? first : colors.brand} />
            </Marker>
          );
        })}
        {props.children}
      </MapView>

      {/* Fixed-size ring overlay (life-circle mode) — always rendered. */}
      {fixedMode ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: pixelRadius * 2,
              height: pixelRadius * 2,
              borderRadius: pixelRadius,
              borderWidth: 2,
              borderColor: colors.brand,
              backgroundColor: "rgba(255,107,53,0.14)",
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
