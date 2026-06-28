// Compose a Post. After the v2 redesign:
//   • The Seek/Offer kind is gone — every post is "I'm proposing X, want
//     company". Whether it's a 1v1 service or a group event is conveyed by
//     `seats` (>= 2 = event, also surfaces in the Events tab).
//   • Start time uses a real OS date+time picker (with HTML datetime-local on
//     web), not preset chips.
//   • Duration is a slider in 15-min increments up to 4h.
//   • Seats is a +/- stepper.
//   • Location supports both pan-the-map and a Nominatim text search.
//   • Matching mode is gone — both auto and manual paths are always allowed
//     by the system; the UX detail of "who approves who" is handled later in
//     the order flow, not at post time.
import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "../../components/common/Button";
import { Tag } from "../../components/common/Tag";
import { NumberStepper } from "../../components/common/NumberStepper";
import { DateTimePickerField } from "../../components/common/DateTimePickerField";
import { AddressAutocomplete } from "../../components/common/AddressAutocomplete";
import { OSMMap } from "../../components/map/OSMMap";

import { api } from "../../services/api";
import { useAuth } from "../../stores/auth";
import { UCF_CENTER } from "../../services/mock/data";
import type { PostKind, PostFormat } from "../../services/types";
import { MAX_POST_TAGS } from "../../services/types";
import { colors } from "../../constants/theme";

const CATEGORIES = ["Tennis", "Gym", "UX/UI", "Coding", "Music", "Language", "Study", "Other"];

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
  const [category, setCategory] = useState("Tennis");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [title, setTitle] = useState("");

  const addTag = () => {
    const clean = tagDraft.trim();
    if (!clean) return;
    if (tags.length >= MAX_POST_TAGS) {
      Alert.alert("That's enough tags", `You can add up to ${MAX_POST_TAGS}.`);
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
  const [desc, setDesc] = useState("");
  const [startAt, setStartAt] = useState<Date>(defaultStart);
  const [durationMins, setDurationMins] = useState(60);
  const [seats, setSeats] = useState(1);
  const [priceText, setPriceText] = useState("");
  const [feeText, setFeeText] = useState("0");

  const [location, setLocation] = useState(defaultCenter);
  const [locationLabel, setLocationLabel] = useState("Pinned on map");
  const [recenterToken, setRecenterToken] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Throttle map pan → state so rapid gestures don't thrash.
  const pendingRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      if (pendingRef.current) {
        setLocation(pendingRef.current);
        setLocationLabel("Pinned on map");
        pendingRef.current = null;
      }
    }, 120);
    return () => clearInterval(id);
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
      setTitle(p.title);
      setDesc(p.description ?? "");
      const s = new Date(p.startAt);
      setStartAt(s);
      setDurationMins(
        Math.max(15, Math.round((new Date(p.endAt).getTime() - s.getTime()) / 60000)),
      );
      setSeats(p.seats);
      setPriceText(p.priceCentsPerHour > 0 ? String(p.priceCentsPerHour / 100) : "");
      setFeeText(String((p.cancellationFeeCents ?? 0) / 100));
      setLocation(p.location);
      setLocationLabel(p.locationName ?? "Pinned on map");
      setRecenterToken((n) => n + 1);
    })();
  }, [editPostId]);

  // Switching format keeps seats consistent: 1v1 is always a single slot;
  // activity/event need at least 2 (and default there if coming from 1v1).
  const onChangeFormat = (next: PostFormat) => {
    setFormat(next);
    if (next === "one_on_one") setSeats(1);
    else if (seats < 2) setSeats(2);
  };

  const submit = async () => {
    if (!title.trim()) {
      Alert.alert("Please add a title");
      return;
    }
    if (!user) return;
    try {
      setSubmitting(true);
      const endAt = new Date(startAt.getTime() + durationMins * 60_000).toISOString();
      // Convert display dollars → integer cents at the boundary. The rest
      // of the app (and backend) only ever speaks cents.
      const priceCents = Math.round((parseFloat(priceText.trim()) || 0) * 100);
      const feeCents = Math.round((parseFloat(feeText) || 0) * 100);
      const content = {
        kind,
        format,
        title: title.trim(),
        category,
        tags: tags.length > 0 ? tags : undefined,
        description: desc.trim() || undefined,
        priceCentsPerHour: priceCents,
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
    } catch {
      Alert.alert(isEditing ? "Couldn't save" : "Couldn't post", "Please try again.");
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
          {/* Kind — spec 0.1: dual-role accounts. */}
          <FieldLabel>I am…</FieldLabel>
          <View className="flex-row" style={{ gap: 8 }}>
            <Pressable
              onPress={() => setKind("offer")}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: kind === "offer" ? colors.brand : colors.line,
                backgroundColor: kind === "offer" ? "rgba(255,107,53,0.08)" : colors.surface,
              }}
            >
              <View className="flex-row items-center">
                <Ionicons
                  name="megaphone-outline"
                  size={16}
                  color={kind === "offer" ? colors.brand : colors.ink}
                />
                <Text
                  className="ml-2 font-bold"
                  style={{ color: kind === "offer" ? colors.brand : colors.ink }}
                >
                  Offering
                </Text>
              </View>
              <Text className="text-[11px] text-ink-muted mt-1 leading-4">
                I'll host this — others sign up to join me.
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setKind("seek")}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: kind === "seek" ? colors.brand : colors.line,
                backgroundColor: kind === "seek" ? "rgba(255,107,53,0.08)" : colors.surface,
              }}
            >
              <View className="flex-row items-center">
                <Ionicons
                  name="hand-right-outline"
                  size={16}
                  color={kind === "seek" ? colors.brand : colors.ink}
                />
                <Text
                  className="ml-2 font-bold"
                  style={{ color: kind === "seek" ? colors.brand : colors.ink }}
                >
                  Looking for
                </Text>
              </View>
              <Text className="text-[11px] text-ink-muted mt-1 leading-4">
                I'm the customer — someone else hosts.
              </Text>
            </Pressable>
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

          {/* Category */}
          <FieldLabel>Category</FieldLabel>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {CATEGORIES.map((c) => (
              <Tag key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
            ))}
          </View>

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

          {/* Title */}
          <FieldLabel>Title</FieldLabel>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Looking for a 3.0 tennis hitting partner"
          />

          {/* Description */}
          <FieldLabel>Description</FieldLabel>
          <Input
            value={desc}
            onChangeText={setDesc}
            placeholder="What level, what you're working on, any notes…"
            multiline
          />

          {/* Date + Time */}
          <FieldLabel>Starts</FieldLabel>
          <DateTimePickerField value={startAt} onChange={setStartAt} minimumDate={new Date()} />

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

          {/* Pricing */}
          <FieldLabel>Pricing</FieldLabel>
          <View className="flex-row" style={{ gap: 10 }}>
            <View className="flex-1">
              <Text className="text-xs text-ink-muted mb-1">Price ($ / hour)</Text>
              <Input
                value={priceText}
                onChangeText={setPriceText}
                placeholder="Empty = Free"
                keyboardType="numeric"
              />
            </View>
            <View className="flex-1">
              <Text className="text-xs text-ink-muted mb-1">Cancellation fee ($)</Text>
              <Input
                value={feeText}
                onChangeText={setFeeText}
                placeholder="0"
                keyboardType="numeric"
              />
            </View>
          </View>
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
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={colors.inkMuted}
      keyboardType={props.keyboardType ?? "default"}
      multiline={props.multiline}
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
