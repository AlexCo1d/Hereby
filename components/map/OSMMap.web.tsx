// Web implementation of the OSM map, backed by Leaflet (native platforms
// resolve `OSMMap.native.tsx` instead). We build the map imperatively against a
// real DOM node so we can attach custom DivIcon markers and run our own
// screen-space clustering, mirroring the native map's look: per-sport coloured
// glyph pins for single events, and count bubbles that split/merge with zoom.
//
// Only loaded by Metro on the web platform (file extension `.web.tsx`).
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type L from "leaflet";

import { colors } from "../../constants/theme";
import type { OSMMapProps, MapMarkerSpec } from "./OSMMap";
import { FIXED_RING_FRACTION } from "./OSMMap";
export type { OSMMapProps, MapMarkerSpec } from "./OSMMap";

// Pull in the Leaflet CSS so the tiles render at the right size.
if (typeof document !== "undefined") {
  const id = "leaflet-css";
  if (!document.getElementById(id)) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }
}

// Fallback viewport short-side (px) used before onLayout reports the real size.
const FALLBACK_MIN_DIM = 320;

// Two markers closer than this on screen (px) collapse into one cluster.
const CLUSTER_PX = 58;

// Web-Mercator zoom level at which `miles` spans `pixelRadius` pixels at `lat`.
function zoomForRadius(miles: number, lat: number, pixelRadius: number) {
  const meters = Math.max(1, miles * 1609.34);
  const z = Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180) * pixelRadius) / meters);
  return Math.max(3, Math.min(18, z));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** DivIcon HTML for a single event: a sport-coloured disc with the sport glyph.
 *  Colour alone distinguishes the activity, so we skip the (repetitive) avatar. */
function singlePinHtml(m: MapMarkerSpec): string {
  const color = m.color ?? colors.brand;
  const emoji = m.emoji ? escapeHtml(m.emoji) : "";
  return `
    <div style="width:32px;height:32px;border-radius:16px;background:${color};border:2px solid #fff;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${emoji}</div>`;
}

/** DivIcon HTML for a cluster: a round count bubble sized by member count. */
function clusterHtml(count: number, color: string): string {
  const size = count >= 10 ? 46 : count >= 5 ? 40 : 34;
  const font = count >= 10 ? 16 : 14;
  return `
    <div style="width:${size}px;height:${size}px;border-radius:${size / 2}px;background:${color};border:3px solid #fff;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${font}px;box-shadow:0 1px 4px rgba(0,0,0,0.35)">${count}</div>`;
}

type Cluster = { lat: number; lng: number; members: MapMarkerSpec[] };

/** Greedy screen-space clustering using Leaflet's own lat/lng→pixel projection
 *  so it stays correct at every zoom. Nearby pins merge; they split as you zoom. */
function clusterMarkers(map: L.Map, markers: MapMarkerSpec[]): Cluster[] {
  const pts = markers.map((m) => ({
    m,
    p: map.latLngToLayerPoint([m.coordinate.lat, m.coordinate.lng]),
  }));
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
      if (pts[i].p.distanceTo(pts[j].p) <= CLUSTER_PX) {
        used[j] = true;
        members.push(pts[j].m);
        sumLat += pts[j].m.coordinate.lat;
        sumLng += pts[j].m.coordinate.lng;
      }
    }
    clusters.push({ lat: sumLat / members.length, lng: sumLng / members.length, members });
  }
  return clusters;
}

export function OSMMap(props: OSMMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  // Latest props read by imperative handlers without re-subscribing.
  const propsRef = useRef(props);
  propsRef.current = props;

  const fixedMode = props.fixedRadiusMiles != null;
  const measured = Math.min(dims.w, dims.h);
  const pixelRadius = (measured > 0 ? measured : FALLBACK_MIN_DIM) * FIXED_RING_FRACTION;

  // Re-cluster + repaint markers and the radius circle for the current view.
  const redraw = () => {
    const map = mapRef.current;
    const L = LRef.current;
    const overlays = overlayLayerRef.current;
    if (!map || !L || !overlays) return;
    overlays.clearLayers();

    const p = propsRef.current;
    const fixed = p.fixedRadiusMiles != null;

    // Geographic circle only in the legacy (non-fixed) mode.
    if (!fixed && p.radiusMiles) {
      L.circle([p.center.lat, p.center.lng], {
        radius: p.radiusMiles * 1609.34,
        color: colors.brand,
        weight: 2,
        fillColor: colors.brand,
        fillOpacity: 0.18,
      }).addTo(overlays);
    }

    const clusters = clusterMarkers(map, p.markers ?? []);
    for (const c of clusters) {
      if (c.members.length === 1) {
        const m = c.members[0];
        const marker = L.marker([m.coordinate.lat, m.coordinate.lng], {
          icon: L.divIcon({
            html: singlePinHtml(m),
            className: "",
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
        });
        marker.on("click", () => {
          // Prefer the in-place popup (single-member "cluster") over navigation
          // so a single pin opens the same floating card as a cluster.
          const cb = propsRef.current.onClusterPress;
          if (cb) {
            const pt = map.latLngToContainerPoint([m.coordinate.lat, m.coordinate.lng]);
            cb([m.id], { x: pt.x, y: pt.y });
          } else {
            m.onPress?.();
          }
        });
        marker.addTo(overlays);
      } else {
        // A dominant colour makes single-sport clusters read at a glance; mixed
        // clusters fall back to brand orange.
        const first = c.members[0].color ?? colors.brand;
        const uniform = c.members.every((mm) => (mm.color ?? colors.brand) === first);
        const size = c.members.length >= 10 ? 46 : c.members.length >= 5 ? 40 : 34;
        const marker = L.marker([c.lat, c.lng], {
          icon: L.divIcon({
            html: clusterHtml(c.members.length, uniform ? first : colors.brand),
            className: "",
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
        });
        marker.on("click", () => {
          const cb = propsRef.current.onClusterPress;
          if (cb) {
            const pt = map.latLngToContainerPoint([c.lat, c.lng]);
            cb(
              c.members.map((mm) => mm.id),
              { x: pt.x, y: pt.y },
            );
          } else if (p.fixedRadiusMiles == null) {
            map.flyTo([c.lat, c.lng], Math.min(19, map.getZoom() + 2), { duration: 0.3 });
          }
        });
        marker.addTo(overlays);
      }
    }
  };

  // Create the map once (Leaflet is imported lazily so it never touches native).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = leaflet;
      const p = propsRef.current;
      const fixed = p.fixedRadiusMiles != null;

      const map = leaflet.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        // Lock zoom gestures in "life circle" mode so the fixed ring always
        // represents the chosen mileage; panning stays on.
        scrollWheelZoom: !fixed,
        doubleClickZoom: !fixed,
        touchZoom: !fixed,
        boxZoom: !fixed,
        zoomSnap: fixed ? 0 : 1,
      });
      leaflet
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 })
        .addTo(map);
      overlayLayerRef.current = leaflet.layerGroup().addTo(map);
      mapRef.current = map;

      const initZoom = fixed
        ? zoomForRadius(p.fixedRadiusMiles!, p.center.lat, pixelRadius)
        : p.spanDeg
          ? Math.round(14 - Math.log2(p.spanDeg / 0.04))
          : 13;
      map.setView([p.center.lat, p.center.lng], Math.max(3, Math.min(18, initZoom)));

      map.on("click", (e: any) =>
        propsRef.current.onMapPress?.({ lat: e.latlng.lat, lng: e.latlng.lng }),
      );
      map.on("moveend", () => {
        const c = map.getCenter();
        propsRef.current.onRegionChange?.({ lat: c.lat, lng: c.lng });
        redraw();
      });
      map.on("zoomend", redraw);
      redraw();

      // Leaflet caches the container size; when this screen is a tab that gets
      // hidden (display:none → size 0) and shown again, the cached size is stale
      // and tiles render misaligned/grey until a manual refresh. Observe the
      // container and invalidateSize() on every resize (incl. hide→show) so the
      // map self-heals on tab re-entry without a reload.
      if (typeof ResizeObserver !== "undefined" && containerRef.current) {
        const ro = new ResizeObserver(() => {
          const m = mapRef.current;
          if (!m) return;
          m.invalidateSize();
          redraw();
        });
        ro.observe(containerRef.current);
        resizeObsRef.current = ro;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-zoom / recenter on radius, span, or explicit recenter changes. Center is
  // read fresh (not a dep) so user panning isn't fought by a re-`setView`.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.invalidateSize();
    const p = propsRef.current;
    if (fixedMode) {
      const z = zoomForRadius(p.fixedRadiusMiles!, p.center.lat, pixelRadius);
      map.setView([p.center.lat, p.center.lng], z, { animate: true });
    } else if (p.spanDeg) {
      const z = Math.round(14 - Math.log2(p.spanDeg / 0.04));
      map.setView([p.center.lat, p.center.lng], Math.max(3, Math.min(18, z)), { animate: true });
    }
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.recenterToken, props.spanDeg, props.fixedRadiusMiles, pixelRadius]);

  // Repaint markers / circle when they change (no view change).
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.markers, props.radiusMiles, props.center.lat, props.center.lng]);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      resizeObsRef.current?.disconnect();
      resizeObsRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setDims((d) => (d.w === width && d.h === height ? d : { w: width, h: height }));
      }}
    >
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", minHeight: 200, background: "#E8EEF2" }}
      />
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
