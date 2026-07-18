// Compose a Post.
//   • Kind (Offering / Looking for) and Format (one-on-one / activity / event)
//     are both explicit choices — format is NOT derived from the seat count.
//   • Category is free text and is the primary term matched against people's
//     tags/interests; free-form tags widen the search surface.
//   • Start time uses a real OS date+time picker (with HTML datetime-local on
//     web), not preset chips.
//   • Duration is a slider in 15-min increments up to 4h.
//   • Seats is a +/- stepper, shown only for group formats.
//   • Location supports both pan-the-map and a Nominatim text search.
//   • Matching mode is gone — both auto and manual paths are always allowed
//     by the system; the UX detail of "who approves who" is handled later in
//     the order flow, not at post time.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "../../components/common/Button";
import { NumberStepper } from "../../components/common/NumberStepper";
import { DateTimeWheels } from "../../components/common/DateTimeWheels";
import { AddressAutocomplete } from "../../components/common/AddressAutocomplete";
import { LocateButton } from "../../components/common/LocateButton";
import { OSMMap } from "../../components/map/OSMMap";
import { reverseGeocode } from "../../services/geocode";

import { api } from "../../services/api";
import { notify } from "../../services/notify";
import { useAuth } from "../../stores/auth";
import { UCF_CENTER, INTERESTS } from "../../services/mock/data";
import type { PostKind, PostFormat, PostSkillMode, PriceMode } from "../../services/types";
import {
  MAX_POST_TAGS,
  SKILL_LEVELS,
  describeSkillRequirement,
  postKindMeta,
  resolvePriceMode,
} from "../../services/types";
import { colors } from "../../constants/theme";

// Cap the title so it renders in full on a compact Discover card row. Longer
// context belongs in the (optional) description.
const TITLE_MAX = 60;

// Round "now + 1h" to next half-hour as the default start.
function defaultStart() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 0);
  if (d.getMinutes() === 0) d.setHours(d.getHours() + 1);
  d.setSeconds(0, 0);
  return d;
}

export default function NewPostScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  // When `editPostId` is present we're editing an existing post: prefill the
  // form from it and PATCH on submit instead of creating.
  const { editPostId } = useLocalSearchParams<{ editPostId?: string }>();
  const isEditing = !!editPostId;
  const defaultCenter = {
    lat: user?.centerLat ?? UCF_CENTER.lat,
    lng: user?.centerLng ?? UCF_CENTER.lng,
  };

  // Spec 0.1 — dual-role accounts. Default "offer" because that's the more
  // common starting point (host running an activity); flipping to "seek"
  // turns the post into "I'm looking for someone to do X with me".
  const [kind, setKind] = useState<PostKind>("offer");
  // Format is explicit now (not seat-count derived). Changing it adjusts the
  // seats stepper: one_on_one locks to 1, group formats default to 2.
  const [format, setFormat] = useState<PostFormat>("one_on_one");
  // Free-text activity category (e.g. "Tennis", "Study group"). It's the
  // primary matching term — it feeds the post's search surface and is matched
  // against people's tags/interests. No fixed list; the user types their own,
  // but we suggest from the shared interest universe so categories line up with
  // the tags people actually carry (better matching).
  const [category, setCategory] = useState("");
  const categorySuggestions = useMemo(() => {
    const q = category.trim().toLowerCase();
    if (!q) return [];
    const out: string[] = [];
    for (const t of INTERESTS) {
      if (t.label.toLowerCase() === q) continue; // already an exact match — hide
      if (t.label.toLowerCase().includes(q)) out.push(t.label);
      if (out.length >= 6) break;
    }
    return out;
  }, [category]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [title, setTitle] = useState("");

  const addTag = () => {
    const clean = tagDraft.trim();
    if (!clean) return;
    if (tags.length >= MAX_POST_TAGS) {
      notify("That's enough tags", `You can add up to ${MAX_POST_TAGS}.`);
      return;
    }
    // Case-insensitive de-dupe.
    if (tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setTagDraft("");
      return;
    }
    setTags([...tags, clean]);
    setTagDraft("");
  };
  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));
  // Skill-level matching requirement (spec: leveled-tag matching). "any" = no
  // requirement; otherwise skillLevel + mode (exact / min = up-compatible /
  // max = down-compatible).
  const [skillMode, setSkillMode] = useState<PostSkillMode>("any");
  const [skillLevel, setSkillLevel] = useState(2);
  const [desc, setDesc] = useState("");
  const [startAt, setStartAt] = useState<Date>(defaultStart);
  const [durationMins, setDurationMins] = useState(60);
  const [seats, setSeats] = useState(1);
  // Structured money expectation (spec: upfront, not free-text). `priceMode`
  // picks the shape; `priceText` is the hourly rate for "paid", `budgetText`
  // the total for "budget". free/split carry no amount.
  const [priceMode, setPriceMode] = useState<PriceMode>("paid");
  const [priceText, setPriceText] = useState("");
  const [budgetText, setBudgetText] = useState("");
  const [feeText, setFeeText] = useState("0");

  const [location, setLocation] = useState(defaultCenter);
  const [locationLabel, setLocationLabel] = useState("Pinned on map");
  const [recenterToken, setRecenterToken] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Throttle map pan → state so rapid gestures don't thrash. While the pin is
  // moving we only track coordinates (label reads a transient "Locating…"); the
  // costly reverse-geocode fires ONCE the pin settles (no new center for 700ms),
  // per the spec "拖动然后停下来的时候才找街道地址，移动的时候不用".
  const pendingRef = useRef<{ lat: number; lng: number } | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic id so a slow earlier reverse response can't overwrite a newer one.
  const reverseReqRef = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (pendingRef.current) {
        const c = pendingRef.current;
        pendingRef.current = null;
        setLocation(c);
        setLocationLabel("Locating…");
        // Re-arm the settle timer on every flush: only the LAST one (the pin at
        // rest) survives to actually resolve the street address.
        if (settleRef.current) clearTimeout(settleRef.current);
        settleRef.current = setTimeout(async () => {
          const myReq = ++reverseReqRef.current;
          const label = await reverseGeocode(c);
          if (myReq !== reverseReqRef.current) return;
          setLocationLabel(label ?? "Pinned on map");
        }, 700);
      }
    }, 120);
    return () => {
      clearInterval(id);
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, []);

  // Edit mode: load the post once and hydrate every field.
  useEffect(() => {
    if (!editPostId) return;
    (async () => {
      const p = await api.getPost(editPostId);
      if (!p) return;
      setKind(p.kind);
      setFormat(p.format);
      setCategory(p.category);
      setTags(p.tags ?? []);
      setSkillMode(p.skillMode ?? "any");
      if (p.skillLevel) setSkillLevel(p.skillLevel);
      setTitle(p.title);
      setDesc(p.description ?? "");
      const s = new Date(p.startAt);
      setStartAt(s);
      setDurationMins(
        Math.max(15, Math.round((new Date(p.endAt).getTime() - s.getTime()) / 60000)),
      );
      setSeats(p.seats);
      const mode = resolvePriceMode(p);
      setPriceMode(mode);
      setPriceText(p.priceCentsPerHour > 0 ? String(p.priceCentsPerHour / 100) : "");
      setBudgetText(p.budgetCents ? String(p.budgetCents / 100) : "");
      setFeeText(String((p.cancellationFeeCents ?? 0) / 100));
      setLocation(p.location);
      setLocationLabel(p.locationName ?? "Pinned on map");
      setRecenterToken((n) => n + 1);
    })();
  }, [editPostId]);

  // Picking a kind nudges the money mode to that kind's natural default
  // (offer→paid, seek→budget, partner→free) so the form pre-fills sensibly.
  // The user can still override the money mode afterward.
  const onChangeKind = (next: PostKind) => {
    setKind(next);
    setPriceMode(postKindMeta(next).defaultPriceMode);
  };

  // Switching format keeps seats consistent: 1v1 is always a single slot;
  // activity/event need at least 2 (and default there if coming from 1v1).
  const onChangeFormat = (next: PostFormat) => {
    setFormat(next);
    if (next === "one_on_one") setSeats(1);
    else if (seats < 2) setSeats(2);
  };

  const submit = async () => {
    if (!title.trim()) {
      notify("Please add a title");
      return;
    }
    if (!category.trim()) {
      notify("Please add a category", "The category is what we match people on.");
      return;
    }
    if (!user) return;
    try {
      setSubmitting(true);
      const endAt = new Date(startAt.getTime() + durationMins * 60_000).toISOString();
      // Convert display dollars → integer cents at the boundary. The rest
      // of the app (and backend) only ever speaks cents. Which amount is
      // meaningful depends on the money mode: "paid" carries an hourly rate,
      // "budget" carries a total, free/split carry none.
      const priceCents =
        priceMode === "paid" ? Math.round((parseFloat(priceText.trim()) || 0) * 100) : 0;
      const budgetCents =
        priceMode === "budget" ? Math.round((parseFloat(budgetText.trim()) || 0) * 100) : 0;
      const feeCents = Math.round((parseFloat(feeText) || 0) * 100);
      const content = {
        kind,
        format,
        title: title.trim(),
        category,
        tags: tags.length > 0 ? tags : undefined,
        skillMode,
        skillLevel: skillMode === "any" ? undefined : skillLevel,
        description: desc.trim() || undefined,
        priceMode,
        priceCentsPerHour: priceCents,
        budgetCents,
        cancellationFeeCents: feeCents,
        seats,
        startAt: startAt.toISOString(),
        endAt,
        location,
        locationName: locationLabel,
      };
      if (isEditing && editPostId) {
        await api.updatePost(editPostId, content);
      } else {
        await api.createPost({ authorId: user.id, ...content });
      }
      router.back();
    } catch (e: any) {
      // Surface the real backend error — a swallowed "Please try again" made it
      // impossible to tell whether the post failed on validation, RLS, or the
      // network. Prefer the Supabase/PostgREST message when present.
      const msg =
        e?.message || e?.error_description || e?.details || "Please try again.";
      notify(isEditing ? "Couldn't save" : "Couldn't post", String(msg));
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="px-4 pt-2 pb-2 flex-row items-center border-b border-ink-line">
          <Pressable onPress={() => router.back()} className="p-1 mr-2">
            <Ionicons name="close" size={24} color={colors.ink} />
          </Pressable>
          <Text className="text-lg font-bold text-ink flex-1">
            {isEditing ? "Edit Post" : "New Post"}
          </Text>
          <Pressable
            onPress={submit}
            disabled={submitting}
            className="px-3 py-1"
            style={{ opacity: submitting ? 0.5 : 1 }}
          >
            {submitting ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Text className="text-brand font-semibold">{isEditing ? "Save" : "Post"}</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 24 }}
          keyboardShouldPersistTaps="handled"
          // Swipe down anywhere on the form to dismiss the keyboard (there's
          // no hardware "Done" for the multiline Description / Title fields).
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          {/* Kind — spec 0.1: dual-role accounts, now three-way. Stacked rows
              (not side-by-side) so each intent's blurb reads clearly and the
              accent colour matches the chip shown later on the map. */}
          <FieldLabel>I am…</FieldLabel>
          <View style={{ gap: 8 }}>
            {(["offer", "seek", "partner"] as PostKind[]).map((k) => {
              const meta = postKindMeta(k);
              const active = kind === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => onChangeKind(k)}
                  className="flex-row items-center"
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: active ? meta.color : colors.line,
                    backgroundColor: active ? meta.color + "14" : colors.surface,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: active ? meta.color : colors.surfaceSoft,
                    }}
                  >
                    <Ionicons
                      name={meta.icon as any}
                      size={17}
                      color={active ? "white" : colors.inkMuted}
                    />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text
                      className="font-bold text-sm"
                      style={{ color: active ? meta.color : colors.ink }}
                    >
                      {meta.label}
                    </Text>
                    <Text className="text-[11px] text-ink-muted mt-0.5 leading-4">
                      {meta.blurb}
                    </Text>
                  </View>
                  {active ? (
                    <Ionicons name="checkmark-circle" size={18} color={meta.color} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/* Format — explicit, not seat-derived. */}
          <FieldLabel>Format</FieldLabel>
          <View className="flex-row" style={{ gap: 8 }}>
            {(
              [
                { value: "one_on_one", label: "One-on-one", icon: "person-outline" },
                { value: "activity", label: "Activity", icon: "people-outline" },
                { value: "event", label: "Event", icon: "calendar-outline" },
              ] as { value: PostFormat; label: string; icon: keyof typeof Ionicons.glyphMap }[]
            ).map((opt) => {
              const active = format === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => onChangeFormat(opt.value)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: active ? colors.brand : colors.line,
                    backgroundColor: active ? "rgba(255,107,53,0.08)" : colors.surface,
                    alignItems: "center",
                  }}
                >
                  <Ionicons name={opt.icon} size={18} color={active ? colors.brand : colors.ink} />
                  <Text
                    className="text-xs font-bold mt-1"
                    style={{ color: active ? colors.brand : colors.ink }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text className="text-[11px] text-ink-muted mt-1.5 leading-4">
            {format === "one_on_one"
              ? "Just you and one other person."
              : format === "activity"
                ? "A casual group thing — pickup game, study group, a Costco run."
                : "An organized event you're hosting — workshop, volunteer day, tournament."}
          </Text>

          {/* Category — free text with type-ahead suggestions from the shared
              interest universe. Type your own or tap a suggestion. This is the
              primary term matched against people's tags/interests. */}
          <FieldLabel>Category</FieldLabel>
          <Input
            value={category}
            onChangeText={setCategory}
            placeholder="What's the activity? e.g. Tennis, Study group, Coding"
          />
          {categorySuggestions.length > 0 ? (
            <View
              className="mt-2 rounded-2xl overflow-hidden border"
              style={{ borderColor: colors.line, backgroundColor: colors.surface }}
            >
              {categorySuggestions.map((label, i) => (
                <Pressable
                  key={label}
                  onPress={() => setCategory(label)}
                  className="flex-row items-center px-4 py-2.5"
                  style={{
                    borderBottomWidth: i < categorySuggestions.length - 1 ? 1 : 0,
                    borderColor: colors.line,
                  }}
                >
                  <Ionicons name="pricetag-outline" size={15} color={colors.brand} />
                  <Text className="text-sm text-ink ml-2 flex-1">{label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text className="text-[11px] text-ink-muted mt-1.5 leading-4">
            This is what we match against people's interests — keep it short and clear.
          </Text>

          {/* Free-form tags — the primary search surface. Up to MAX_POST_TAGS. */}
          <View className="flex-row items-center justify-between mt-5 mb-2">
            <Text className="text-sm font-semibold text-ink">Tags</Text>
            <Text className="text-xs text-ink-muted">
              {tags.length}/{MAX_POST_TAGS}
            </Text>
          </View>
          {tags.length > 0 ? (
            <View className="flex-row flex-wrap mb-2" style={{ gap: 8 }}>
              {tags.map((t) => (
                <View
                  key={t}
                  className="flex-row items-center bg-brand rounded-full pl-3 pr-1 py-1"
                >
                  <Text className="text-white text-sm font-medium">{t}</Text>
                  <Pressable
                    onPress={() => removeTag(t)}
                    hitSlop={8}
                    style={{
                      width: 20,
                      height: 20,
                      marginLeft: 4,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(255,255,255,0.25)",
                    }}
                  >
                    <Ionicons name="close" size={13} color="white" />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <View
            className="flex-row items-center bg-surface-soft rounded-full pl-4 pr-1"
            style={{ height: 44 }}
          >
            <TextInput
              value={tagDraft}
              onChangeText={setTagDraft}
              placeholder="Add a tag — e.g. 2.5 level, doubles, evenings"
              placeholderTextColor={colors.inkMuted}
              onSubmitEditing={addTag}
              returnKeyType="done"
              editable={tags.length < MAX_POST_TAGS}
              style={{ flex: 1, height: 44, paddingVertical: 0, color: colors.ink, fontSize: 14 }}
            />
            <Pressable
              onPress={addTag}
              className="ml-2 rounded-full bg-brand items-center justify-center"
              style={{ width: 36, height: 36 }}
            >
              <Ionicons name="add" size={20} color="white" />
            </Pressable>
          </View>
          <Text className="text-[11px] text-ink-muted mt-1.5 leading-4">
            Tags power search — add what people might look for: level, style, time of day, language.
          </Text>

          {/* Skill level requirement — who can join, by ability. */}
          <FieldLabel>Skill level</FieldLabel>
          <View className="flex-row" style={{ gap: 6 }}>
            {(
              [
                { value: "any", label: "Any" },
                { value: "exact", label: "Exactly" },
                { value: "min", label: "At least" },
                { value: "max", label: "At most" },
              ] as { value: PostSkillMode; label: string }[]
            ).map((opt) => {
              const active = skillMode === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setSkillMode(opt.value)}
                  style={{
                    flex: 1,
                    paddingVertical: 9,
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: active ? colors.brand : colors.line,
                    backgroundColor: active ? "rgba(255,107,53,0.08)" : colors.surface,
                    alignItems: "center",
                  }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: active ? colors.brand : colors.ink }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {skillMode !== "any" ? (
            <View className="mt-3">
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {SKILL_LEVELS.map((l, i) => {
                  const bg = [colors.brand, colors.accentYellow, colors.accentBlue, colors.accentPurple][i];
                  const fg = i === 1 ? "#3D2E00" : "#FFFFFF";
                  const on = skillLevel === l.level;
                  return (
                    <Pressable
                      key={l.level}
                      onPress={() => setSkillLevel(l.level)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: bg,
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderWidth: on ? 2 : 0,
                        borderColor: "#FFFFFF",
                        opacity: on ? 1 : 0.9,
                      }}
                    >
                      <Text style={{ color: fg, fontWeight: "700", fontSize: 12 }}>
                        {l.level}. {l.label}
                      </Text>
                      {on ? (
                        <Ionicons name="checkmark-circle" size={15} color={fg} style={{ marginLeft: 6 }} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              <Text className="text-[11px] mt-2 leading-4" style={{ color: colors.brand, fontWeight: "600" }}>
                {describeSkillRequirement({ skillLevel, skillMode })} can join.
              </Text>
            </View>
          ) : (
            <Text className="text-[11px] text-ink-muted mt-1.5 leading-4">
              Anyone can join, whatever their level. Pick a requirement to match by ability.
            </Text>
          )}

          {/* Title — REQUIRED and length-capped. It's the headline shown on the
              Discover cards, so it must be present and short enough to render in
              full on a compact row. */}
          <View className="flex-row items-center justify-between mt-5 mb-2">
            <Text className="text-sm font-semibold text-ink">
              Title <Text style={{ color: colors.brand }}>*</Text>
            </Text>
            <Text className="text-xs text-ink-muted">
              {title.length}/{TITLE_MAX}
            </Text>
          </View>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Looking for a 3.0 tennis hitting partner"
            maxLength={TITLE_MAX}
          />

          {/* Description — OPTIONAL. Can be skipped entirely. */}
          <FieldLabel>Description (optional)</FieldLabel>
          <Input
            value={desc}
            onChangeText={setDesc}
            placeholder="Optional — level, what you're working on, any notes…"
            multiline
          />

          {/* Date + Time — day / hour / minute wheels, bounded to 6 AM–10 PM. */}
          <FieldLabel>Starts</FieldLabel>
          <DateTimeWheels value={startAt} onChange={setStartAt} />

          {/* Duration slider */}
          <View className="flex-row items-center justify-between mt-5 mb-1">
            <Text className="text-sm font-semibold text-ink">Duration</Text>
            <Text className="text-sm font-bold text-brand">
              {durationMins >= 60
                ? `${Math.floor(durationMins / 60)}h${durationMins % 60 ? ` ${durationMins % 60}m` : ""}`
                : `${durationMins} min`}
            </Text>
          </View>
          <Slider
            minimumValue={15}
            maximumValue={240}
            step={15}
            value={durationMins}
            minimumTrackTintColor={colors.brand}
            maximumTrackTintColor={colors.line}
            thumbTintColor={colors.brand}
            onValueChange={setDurationMins}
          />

          {/* Where — autocomplete search + map pin. The precise lat/lng is
              what we store; the label is for display. Pan the map for fine
              adjustment after picking. */}
          <FieldLabel>Where</FieldLabel>
          <View className="mb-2">
            <AddressAutocomplete
              near={location}
              value={locationLabel === "Pinned on map" ? undefined : locationLabel}
              placeholder="Address, place, or ZIP"
              onSelect={(hit) => {
                setLocation({ lat: hit.lat, lng: hit.lng });
                setLocationLabel(hit.label);
                setRecenterToken((n) => n + 1);
              }}
            />
          </View>
          <View
            style={{
              height: 200,
              borderRadius: 12,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <OSMMap
              center={location}
              spanDeg={0.02}
              onRegionChange={(c) => {
                pendingRef.current = c;
              }}
              recenterToken={recenterToken}
            />
            {/* Fixed center pin overlay */}
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
              <Ionicons name="location" size={28} color={colors.brand} />
            </View>
            {/* Jump the pin to the user's current GPS position. */}
            <LocateButton
              bottom={10}
              onLocate={(c) => {
                setLocation(c);
                setLocationLabel("Current location");
                setRecenterToken((n) => n + 1);
              }}
            />
          </View>
          <Text className="text-[11px] text-ink-muted mt-1">
            Drag the map to fine-tune — the pin's exact spot is what we save.
          </Text>

          {/* Seats — only shown for group formats. One-on-one is implicitly
              a single slot, so we hide the stepper entirely. */}
          {format !== "one_on_one" ? (
            <>
              <FieldLabel>Spots</FieldLabel>
              <View className="flex-row items-center">
                <NumberStepper value={seats} onChange={setSeats} min={2} max={50} suffix="people" />
                <Text className="ml-3 text-xs text-brand font-semibold">
                  {format === "event" ? "Event" : "Activity"} — appears in Events
                </Text>
              </View>
            </>
          ) : null}

          {/* Money expectation — structured & upfront (spec) instead of buried
              in the description. Drives the money badge on the Discover map. */}
          <FieldLabel>Money</FieldLabel>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {(
              [
                { value: "paid", label: "Paid", icon: "cash-outline", color: colors.accentBlue },
                { value: "budget", label: "Budget", icon: "wallet-outline", color: colors.accentPurple },
                { value: "free", label: "Free", icon: "gift-outline", color: "#138C5E" },
                { value: "split", label: "Split", icon: "swap-horizontal-outline", color: colors.brand },
              ] as { value: PriceMode; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[]
            ).map((opt) => {
              const active = priceMode === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setPriceMode(opt.value)}
                  className="flex-row items-center"
                  style={{
                    // Two per row: (100% - 8px gap) / 2.
                    width: "48%",
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: active ? opt.color : colors.line,
                    backgroundColor: active ? opt.color + "14" : colors.surface,
                  }}
                >
                  <Ionicons name={opt.icon} size={16} color={active ? opt.color : colors.inkMuted} />
                  <Text
                    className="ml-2 font-bold text-sm"
                    style={{ color: active ? opt.color : colors.ink }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {priceMode === "paid" ? (
            <View className="mt-3">
              <Text className="text-xs text-ink-muted mb-1">Rate ($ / hour)</Text>
              <Input
                value={priceText}
                onChangeText={setPriceText}
                placeholder="e.g. 20"
                keyboardType="numeric"
              />
            </View>
          ) : priceMode === "budget" ? (
            <View className="mt-3">
              <Text className="text-xs text-ink-muted mb-1">Willing to pay ($ total)</Text>
              <Input
                value={budgetText}
                onChangeText={setBudgetText}
                placeholder="e.g. 50"
                keyboardType="numeric"
              />
            </View>
          ) : (
            <Text className="text-[11px] text-ink-muted mt-2 leading-4">
              {priceMode === "split"
                ? "You'll split shared costs (court fee, gas, groceries) evenly."
                : "No money changes hands — free or a mutual exchange."}
            </Text>
          )}

          {/* Cancellation fee — kept separate from the money expectation. */}
          <FieldLabel>Cancellation fee ($)</FieldLabel>
          <Input
            value={feeText}
            onChangeText={setFeeText}
            placeholder="0"
            keyboardType="numeric"
          />
          <Text className="text-[11px] text-ink-muted mt-2 leading-4">
            All fees are $0 during pilot. 12 h free cancellation; later cancellations charge the
            canceler; weather-related cancellations don't charge anyone.
          </Text>
        </ScrollView>

        <View className="px-5 py-3 border-t border-ink-line">
          <Button
            label={submitting ? (isEditing ? "Saving…" : "Posting…") : isEditing ? "Save changes" : "Post"}
            onPress={submit}
            loading={submitting}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text className="text-sm font-semibold text-ink mt-5 mb-2">{children}</Text>;
}

function Input(props: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "email-address";
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={colors.inkMuted}
      keyboardType={props.keyboardType ?? "default"}
      multiline={props.multiline}
      maxLength={props.maxLength}
      style={{
        backgroundColor: colors.surfaceSoft,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: props.multiline ? 12 : 0,
        height: props.multiline ? undefined : 48,
        minHeight: props.multiline ? 96 : undefined,
        color: colors.ink,
        fontSize: 14,
        textAlignVertical: props.multiline ? "top" : "center",
      }}
    />
  );
}
