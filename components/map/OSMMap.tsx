// Shared types + constants for the OSM map. The actual rendering lives in the
// platform files, resolved by Metro via file extension:
//   • OSMMap.web.tsx    — Leaflet (raster OSM tiles)
//   • OSMMap.native.tsx — react-native-maps (raster OSM tiles)
// This unsuffixed file is what TypeScript sees for `import { OSMMap } from
// "./OSMMap"`, so it must export a matching `OSMMap` symbol. It is a
// runtime-neutral stub that is never actually executed, and it deliberately
// imports NO web-only deps (e.g. leaflet) so the native bundle stays clean.
import type { ReactNode } from "react";
import type { LatLng } from "../../services/types";

export type MapMarkerSpec = {
  id: string;
  coordinate: LatLng;
  render?: () => ReactNode;
  onPress?: () => void;
  /** Per-sport accent colour for the pin ring / cluster bubble. */
  color?: string;
  /** Author avatar shown inside the pin. */
  avatarUrl?: string;
  /** Sport glyph shown as a small badge on the pin (font-independent). */
  emoji?: string;
};

export type OSMMapProps = {
  center: LatLng;
  spanDeg?: number;
  markers?: MapMarkerSpec[];
  radiusMiles?: number;
  onMapPress?: (coord: LatLng) => void;
  onRegionChange?: (center: LatLng) => void;
  /** Fired when a multi-post cluster bubble is tapped. `memberIds` are the post
   *  ids in that cluster; `point` is the cluster's on-screen pixel position
   *  (relative to the map container) so callers can float a list beside it. */
  onClusterPress?: (memberIds: string[], point: { x: number; y: number }) => void;
  recenterToken?: number;
  fixedRadiusMiles?: number;
  children?: ReactNode;
};

/** Fraction of the smaller viewport dimension used as the fixed ring radius.
 *  Shared by every renderer so the drawn ring and the computed zoom agree. */
export const FIXED_RING_FRACTION = 0.4;

/** Neutral stub — the platform-specific `.web` / `.native` files provide the
 *  real implementation at bundle time. Never runs at runtime. */
export function OSMMap(_props: OSMMapProps): ReactNode {
  return null;
}
