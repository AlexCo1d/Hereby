// Web implementation of the OSM map using Leaflet, the de-facto standard
// open-source web mapping library. Pulls the same OSM raster tiles the
// native side uses, so iOS / Android / web look consistent.
//
// Only loaded by Metro on the web platform (file extension `.web.tsx`).
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type L from "leaflet";

import { colors } from "../../constants/theme";
import type { OSMMapProps } from "./OSMMap";
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

// Web-Mercator zoom level at which `miles` spans `pixelRadius` pixels at `lat`.
function zoomForRadius(miles: number, lat: number, pixelRadius: number) {
  const meters = Math.max(1, miles * 1609.34);
  const z = Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180) * pixelRadius) / meters);
  return Math.max(3, Math.min(18, z));
}

export function OSMMap(props: OSMMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const fixedMode = props.fixedRadiusMiles != null;
  const pixelRadius = Math.min(dims.w, dims.h) * FIXED_RING_FRACTION;

  // Track what we last applied so a radius change re-zooms but a pan doesn't
  // fight the user by snapping the center back.
  const prevRadiusRef = useRef<number | undefined>(undefined);
  const prevTokenRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = leaflet.map(containerRef.current, {
          zoomControl: false,
          attributionControl: false,
          // Lock zoom gestures in "life circle" mode so the fixed ring always
          // represents the chosen mileage; panning stays on.
          scrollWheelZoom: !fixedMode,
          doubleClickZoom: !fixedMode,
          touchZoom: !fixedMode,
          boxZoom: !fixedMode,
          zoomSnap: fixedMode ? 0 : 1,
        });
        leaflet
          .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 })
          .addTo(mapRef.current);
        overlayLayerRef.current = leaflet.layerGroup().addTo(mapRef.current);
        const initZoom = fixedMode
          ? zoomForRadius(props.fixedRadiusMiles!, props.center.lat, pixelRadius || 140)
          : props.spanDeg
            ? Math.round(14 - Math.log2(props.spanDeg / 0.04))
            : 13;
        mapRef.current.setView([props.center.lat, props.center.lng], Math.max(3, Math.min(18, initZoom)));
      }

      const map = mapRef.current!;
      const overlays = overlayLayerRef.current!;

      // (Re)bind gesture handlers each render so closures see latest callbacks.
      map.off("click");
      if (props.onMapPress) {
        const cb = props.onMapPress;
        map.on("click", (e: any) => cb({ lat: e.latlng.lat, lng: e.latlng.lng }));
      }
      map.off("moveend");
      if (props.onRegionChange) {
        const cb = props.onRegionChange;
        map.on("moveend", () => {
          const c = map.getCenter();
          cb({ lat: c.lat, lng: c.lng });
        });
      }

      overlays.clearLayers();

      // Geographic circle only in the legacy (non-fixed) mode.
      if (!fixedMode && props.radiusMiles) {
        leaflet
          .circle([props.center.lat, props.center.lng], {
            radius: props.radiusMiles * 1609.34,
            color: colors.brand,
            weight: 2,
            fillColor: colors.brand,
            fillOpacity: 0.18,
          })
          .addTo(overlays);
      }

      props.markers?.forEach((m) => {
        const icon = leaflet.divIcon({
          className: "",
          html:
            `<div style="width:34px;height:34px;border-radius:50%;` +
            `border:2px solid ${colors.brand};background:#fff;` +
            `box-shadow:0 1px 4px rgba(0,0,0,0.2);"></div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        const marker = leaflet.marker([m.coordinate.lat, m.coordinate.lng], { icon }).addTo(overlays);
        if (m.onPress) marker.on("click", m.onPress);
      });

      if (fixedMode) {
        if (pixelRadius > 0) {
          const z = zoomForRadius(props.fixedRadiusMiles!, props.center.lat, pixelRadius);
          const radiusChanged = prevRadiusRef.current !== props.fixedRadiusMiles;
          const tokenChanged = prevTokenRef.current !== props.recenterToken;
          if (tokenChanged) {
            // Fly to a searched / located point.
            map.setView([props.center.lat, props.center.lng], z, { animate: true });
          } else if (radiusChanged) {
            // Radius slider moved → re-zoom around the CURRENT center (don't
            // yank the map back to the prop center, which lags the pan).
            map.setZoom(z);
          }
          prevRadiusRef.current = props.fixedRadiusMiles;
          prevTokenRef.current = props.recenterToken;
        }
      } else if (props.spanDeg) {
        const desiredZoom = Math.round(14 - Math.log2(props.spanDeg / 0.04));
        map.setView([props.center.lat, props.center.lng], Math.max(3, Math.min(18, desiredZoom)));
      } else {
        map.setView([props.center.lat, props.center.lng], map.getZoom());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    props.center.lat,
    props.center.lng,
    props.radiusMiles,
    props.spanDeg,
    props.fixedRadiusMiles,
    props.markers,
    props.onMapPress,
    props.onRegionChange,
    props.recenterToken,
    fixedMode,
    pixelRadius,
  ]);

  useEffect(() => {
    return () => {
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
      {fixedMode && pixelRadius > 0 ? (
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
