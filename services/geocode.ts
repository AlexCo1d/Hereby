// Reverse geocoding: precise coordinates → a human street address.
//
// The post composer captures BOTH the exact lat/lng (for the geofence /
// distance / check-in math) AND the standard street address it resolves to
// (for display and to guide a joiner to the check-in spot). This helper turns
// the former into the latter.
//
// Platform split mirrors LocateButton:
//   • web    → OSM Nominatim /reverse (expo-location can't reverse-geocode in
//              the browser).
//   • native → expo-location's reverseGeocodeAsync (no extra network hop,
//              respects the OS geocoder).
import { Platform } from "react-native";
import * as Location from "expo-location";

/** Reverse-geocode a coordinate to a one-line street address. Returns null on
 *  failure so the caller can fall back to a generic label — never throws. */
export async function reverseGeocode(coord: {
  lat: number;
  lng: number;
}): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      const params = new URLSearchParams({
        format: "jsonv2",
        lat: String(coord.lat),
        lon: String(coord.lng),
        addressdetails: "1",
        // English, single-language labels (default returns semicolon-joined
        // multilingual names like "Orlando;奥兰多").
        "accept-language": "en",
        zoom: "18",
      });
      const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
      const r = await fetch(url, {
        headers: { Accept: "application/json", "Accept-Language": "en" },
      });
      if (!r.ok) return null;
      const j = await r.json();
      const label = j?.display_name;
      return typeof label === "string" && label.length > 0 ? label : null;
    }

    // Native: assemble the standard "number street, city, region ZIP" line from
    // the structured result. Nominatim's display_name is comma-heavy; the OS
    // geocoder gives cleaner components we join ourselves.
    const [p] = await Location.reverseGeocodeAsync({
      latitude: coord.lat,
      longitude: coord.lng,
    });
    if (!p) return null;
    const street = [p.streetNumber, p.street].filter(Boolean).join(" ");
    const line = [street, p.city ?? p.subregion, p.region, p.postalCode]
      .filter((s) => s && String(s).trim().length > 0)
      .join(", ");
    return line.length > 0 ? line : null;
  } catch {
    return null;
  }
}
