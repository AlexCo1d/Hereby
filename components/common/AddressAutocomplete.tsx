// Debounced address autocomplete backed by OSM Nominatim. Replaces the old
// single-shot "type then press the arrow" geocode, which often "found
// nothing" because it only ever tried the raw string once.
//
// Behaviour (mirrors mainstream map search):
//   • Type ≥ 3 chars → after a 350 ms pause we query Nominatim for up to 6
//     candidates and list them inline (no z-index/clipping games — the list
//     sits in normal flow and pushes content down while open).
//   • Tap a candidate → we hand back { lat, lng, label } and collapse.
//   • Optional `near` biases results toward the user's area.
//
// We always surface lat/lng (not just text): that's the precise anchor the
// geofence / distance / check-in logic needs. The label is for display only.
import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Keyboard,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/theme";

export type GeoResult = { lat: number; lng: number; label: string };

type Props = {
  /** The currently chosen label, shown under the field as confirmation. */
  value?: string;
  onSelect: (r: GeoResult) => void;
  placeholder?: string;
  /** Bias search toward this point (the user's local area / current pin). */
  near?: { lat: number; lng: number };
};

export function AddressAutocomplete({ value, onSelect, placeholder, near }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request id so a slow earlier response can't overwrite a newer one.
  const reqIdRef = useRef(0);

  const nearLat = near?.lat;
  const nearLng = near?.lng;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const myReq = ++reqIdRef.current;
      try {
        const params = new URLSearchParams({
          format: "json",
          limit: "6",
          addressdetails: "1",
          q,
        });
        if (nearLat != null && nearLng != null) {
          // Soft bias: a viewbox around `near` without hard-bounding, so a
          // searched city far away still resolves.
          const d = 0.7;
          params.set(
            "viewbox",
            `${nearLng - d},${nearLat + d},${nearLng + d},${nearLat - d}`,
          );
        }
        const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
        const r = await fetch(url, { headers: { Accept: "application/json" } });
        const arr = r.ok ? await r.json() : [];
        if (myReq !== reqIdRef.current) return; // a newer query superseded us
        const mapped: GeoResult[] = (Array.isArray(arr) ? arr : [])
          .map((h: any) => ({
            lat: Number(h.lat),
            lng: Number(h.lon),
            label: String(h.display_name),
          }))
          .filter((g: GeoResult) => Number.isFinite(g.lat) && Number.isFinite(g.lng));
        setResults(mapped);
      } catch {
        if (myReq === reqIdRef.current) setResults([]);
      } finally {
        if (myReq === reqIdRef.current) setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, nearLat, nearLng]);

  const pick = (r: GeoResult) => {
    onSelect(r);
    setQuery("");
    setResults([]);
    setOpen(false);
    Keyboard.dismiss();
  };

  return (
    <View>
      <View
        className="flex-row items-center bg-surface-soft rounded-full px-3"
        style={{ height: 44 }}
      >
        <Ionicons name="search" size={16} color={colors.inkMuted} />
        <TextInput
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "Search address, place, or ZIP"}
          placeholderTextColor={colors.inkMuted}
          autoCorrect={false}
          style={{
            flex: 1,
            marginLeft: 8,
            height: 44,
            paddingVertical: 0,
            color: colors.ink,
            fontSize: 14,
          }}
        />
        {loading ? <ActivityIndicator size="small" color={colors.brand} /> : null}
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8} className="pl-1">
            <Ionicons name="close-circle" size={16} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Inline results — normal flow, so no overflow clipping inside the
          parent ScrollView. */}
      {open && (results.length > 0 || (loading && query.trim().length >= 3)) ? (
        <View
          className="mt-1 rounded-xl overflow-hidden"
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
            ...Platform.select({
              ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.08,
                shadowRadius: 8,
              },
              android: { elevation: 3 },
              default: {},
            }),
          }}
        >
          {results.length === 0 && loading ? (
            <Text className="text-xs text-ink-muted px-3 py-3">Searching…</Text>
          ) : (
            results.map((r, i) => (
              <Pressable
                key={`${r.lat},${r.lng},${i}`}
                onPress={() => pick(r)}
                className="flex-row items-start px-3 py-2.5 border-b border-ink-line"
              >
                <Ionicons
                  name="location-outline"
                  size={15}
                  color={colors.brand}
                  style={{ marginTop: 2 }}
                />
                <Text className="text-sm text-ink ml-2 flex-1" numberOfLines={2}>
                  {r.label}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      {/* Chosen location confirmation. */}
      {value ? (
        <Text className="text-[11px] text-ink-muted mt-1" numberOfLines={1}>
          📍 {value}
        </Text>
      ) : null}
    </View>
  );
}
