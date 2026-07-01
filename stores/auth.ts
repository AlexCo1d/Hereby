// Auth state, persisted to AsyncStorage so users stay logged in.
//
// Two backends, chosen by EXPO_PUBLIC_DATA_SOURCE (same switch as services/api):
//   • mock (default)  — any 6-digit code passes; the user id is pinned to "me"
//     so the seeded mock data (ORDERS / POSTS / MESSAGES) resolves.
//   • supabase        — real OTP via supabase.auth; the user gets a real UUID,
//     and the public.users profile row is auto-created by the handle_new_user
//     trigger. Profile edits are mirrored back to public.users.
//
// The store SHAPE is identical in both modes, so no screen needs to know which
// backend is live.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

const IS_SUPABASE = process.env.EXPO_PUBLIC_DATA_SOURCE === "supabase";

// DEV ONLY. When "true", any OTP-verified email is treated as `verified`
// (can post/order/chat) regardless of the .edu rule (spec 0.5). Lets you
// test the full flow with a personal inbox (QQ/Gmail) when you don't have two
// .edu addresses handy. The DB never gated posting on .edu (RLS only checks
// author_id = auth.uid()), so this is purely a client-side capability gate.
// Leave unset / "false" for real behaviour.
const ALLOW_ANY_EMAIL = process.env.EXPO_PUBLIC_ALLOW_ANY_EMAIL === "true";

// Lazy accessor so the supabase client (and its createClient call) is only
// evaluated in supabase mode — mock mode never touches it.
function sb() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("../services/supabase/client").supabase;
}

export type AuthMode = "verified" | "browse_only";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  campusId: string; // derived from email domain
  mode: AuthMode;
  /** Custom user-defined tags (free text), in addition to preset interest ids */
  customTags: string[];
  /** Preset interest ids the user picked during onboarding */
  interestIds: string[];
  /** Per-tag skill level (1..4). Key = interest id (preset) or the custom-tag
   *  label. Missing key ⇒ level 1 (beginner). Primary matching signal alongside
   *  the tags themselves; mirrored to `users.tag_levels` (jsonb) in supabase. */
  tagLevels: Record<string, number>;
  /** Local-area radius in miles chosen during onboarding (editable later) */
  radiusMiles: number;
  /** Center of the local-area circle. Undefined → fall back to a campus default. */
  centerLat?: number;
  centerLng?: number;
  bio?: string;
  /** Avg rating received (0-5) */
  ratingReceived: number;
  ratingReceivedCount: number;
  /** Avg rating GIVEN to others (0-5) — public per spec 0.7 */
  ratingGiven: number;
  ratingGivenCount: number;
};

type AuthState = {
  user: AuthUser | null;
  /** A pending email between login() and verifyOtp() */
  pendingEmail: string | null;
  hasFinishedOnboarding: boolean;

  // actions
  login: (email: string) => Promise<{ mode: AuthMode }>;
  verifyOtp: (code: string) => Promise<void>;
  /** Email + password sign-in for supabase mode (used while OTP email
   *  delivery isn't configured — see EXPO_PUBLIC_AUTH_PASSWORD). Signs in if
   *  the account exists, otherwise signs up. Requires "Confirm email" OFF in
   *  Supabase for an instant session. */
  signInWithPassword: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Restore the user from an existing supabase session on app boot. No-op in
   *  mock mode. Call once from the root layout. */
  initAuth: () => Promise<void>;
  finishOnboarding: (data: { interestIds: string[]; radiusMiles: number }) => void;
  updateProfile: (patch: Partial<Pick<AuthUser, "name" | "bio" | "avatarUrl" | "customTags" | "interestIds">>) => void;
  addCustomTag: (label: string) => void;
  removeCustomTag: (label: string) => void;
  /** Set the skill level (1..4) for a tag key (interest id or custom label). */
  setTagLevel: (key: string, level: number) => void;
  /** Update the local-area radius and/or its center point. */
  setAreaSettings: (patch: { radiusMiles?: number; centerLat?: number; centerLng?: number }) => void;
  /** Spec 0.7: record a rating the user just gave to someone. Updates the
   *  public `ratingGiven` aggregate (which is what surfaces malicious raters). */
  recordRatingGiven: (stars: number) => void;
};

const EDU_RE = /@([\w-]+\.)*[\w-]+\.edu$/i;

function campusFromEmail(email: string): string {
  // e.g. "alice@ucf.edu" → "ucf". Used to scope discovery later.
  const m = email.toLowerCase().match(/@([\w-]+)\.edu$/);
  return m?.[1] ?? "general";
}

// Map a public.users row (snake_case) + session into the AuthUser shape.
function rowToAuthUser(email: string, id: string, row: any): AuthUser {
  const eduVerified = row?.edu_verified ?? EDU_RE.test(email);
  return {
    id,
    email,
    name: row?.name ?? email.split("@")[0],
    avatarUrl: row?.avatar_url || `https://i.pravatar.cc/200?u=${encodeURIComponent(email)}`,
    campusId: row?.campus_id ?? campusFromEmail(email),
    mode: ALLOW_ANY_EMAIL || eduVerified ? "verified" : "browse_only",
    customTags: row?.custom_tags ?? [],
    interestIds: row?.interest_ids ?? [],
    tagLevels: row?.tag_levels ?? {},
    radiusMiles: row?.radius_miles ?? 5,
    centerLat: row?.center_lat ?? undefined,
    centerLng: row?.center_lng ?? undefined,
    bio: row?.bio ?? "",
    ratingReceived: Number(row?.rating_received ?? 0),
    ratingReceivedCount: row?.rating_received_count ?? 0,
    ratingGiven: Number(row?.rating_given ?? 0),
    ratingGivenCount: row?.rating_given_count ?? 0,
  };
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => {
      // Best-effort mirror of a profile change into public.users (supabase mode
      // only). Fire-and-forget — the local state is the source of truth for
      // the current session; the DB write keeps it durable across devices.
      const syncUserToDb = (patch: Record<string, any>) => {
        if (!IS_SUPABASE) return;
        const id = get().user?.id;
        if (!id) return;
        sb()
          .from("users")
          .update(patch)
          .eq("id", id)
          .then(
            () => {},
            () => {},
          );
      };

      return {
        user: null,
        pendingEmail: null,
        hasFinishedOnboarding: false,

        async login(email) {
          const isEdu = EDU_RE.test(email);
          set({ pendingEmail: email });
          if (IS_SUPABASE) {
            // Sends a 6-digit OTP (enable "Email OTP" in Supabase Auth
            // settings; locally it lands in the Inbucket test inbox).
            const { error } = await sb().auth.signInWithOtp({ email });
            if (error) throw error;
          }
          // Mock: pretend we emailed a code.
          return { mode: ALLOW_ANY_EMAIL || isEdu ? "verified" : "browse_only" };
        },

        async verifyOtp(code) {
          const email = get().pendingEmail;
          if (!email) throw new Error("No pending email");

          if (IS_SUPABASE) {
            const { data, error } = await sb().auth.verifyOtp({
              email,
              token: code,
              type: "email",
            });
            if (error) throw error;
            const uid = data.user!.id;
            // The handle_new_user trigger created the row on first sign-in.
            const { data: row } = await sb()
              .from("users")
              .select("*")
              .eq("id", uid)
              .maybeSingle();
            // Onboarding completion is per-user (DB), not the global persisted
            // flag — so a fresh account always sees the area/interests step.
            set({
              pendingEmail: null,
              user: rowToAuthUser(email, uid, row),
              hasFinishedOnboarding: !!row?.onboarded,
            });
            return;
          }

          // Mock OTP: any 6-digit code passes in dev. User id pinned to "me".
          if (!/^\d{6}$/.test(code)) throw new Error("Code must be 6 digits");
          const isEdu = EDU_RE.test(email);
          const name = email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          set({
            pendingEmail: null,
            user: {
              id: "me",
              email,
              name,
              avatarUrl: `https://i.pravatar.cc/200?u=${encodeURIComponent(email)}`,
              campusId: campusFromEmail(email),
              mode: ALLOW_ANY_EMAIL || isEdu ? "verified" : "browse_only",
              customTags: [],
              interestIds: [],
              tagLevels: {},
              radiusMiles: 5,
              bio: "",
              ratingReceived: 0,
              ratingReceivedCount: 0,
              ratingGiven: 0,
              ratingGivenCount: 0,
            },
          });
        },

        async signInWithPassword(email, password) {
          // Email + password path for supabase mode — a no-email fallback for
          // when OTP delivery (custom SMTP) isn't set up. Requires "Confirm
          // email" OFF in Supabase so signUp returns a live session. Not used
          // by the default OTP login UI; call it from a dev login if needed.
          if (!IS_SUPABASE) throw new Error("Password sign-in requires the supabase backend");
          if (password.length < 6) throw new Error("Password must be at least 6 characters");
          // Try to sign in; if the account doesn't exist yet, sign up.
          let res = await sb().auth.signInWithPassword({ email, password });
          if (res.error) {
            const signUp = await sb().auth.signUp({ email, password });
            if (signUp.error) throw signUp.error;
            if (!signUp.data.session) {
              throw new Error(
                "Account created, but email confirmation is on. Turn OFF 'Confirm email' in " +
                  "Supabase → Authentication → Providers → Email, then try again.",
              );
            }
            res = signUp;
          }
          const u = res.data.user!;
          const { data: row } = await sb().from("users").select("*").eq("id", u.id).maybeSingle();
          set({
            pendingEmail: null,
            user: rowToAuthUser(email, u.id, row),
            hasFinishedOnboarding: !!row?.onboarded,
          });
        },

        async logout() {
          if (IS_SUPABASE) {
            try {
              await sb().auth.signOut();
            } catch {
              // ignore — we clear local state regardless
            }
          }
          set({ user: null, pendingEmail: null, hasFinishedOnboarding: false });
        },

        async initAuth() {
          if (!IS_SUPABASE) return;
          const { data } = await sb().auth.getSession();
          const session = data?.session;
          if (!session) {
            // No live session — drop any stale persisted user.
            set({ user: null });
            return;
          }
          const { data: row } = await sb()
            .from("users")
            .select("*")
            .eq("id", session.user.id)
            .maybeSingle();
          set({
            user: rowToAuthUser(session.user.email!, session.user.id, row),
            hasFinishedOnboarding: !!row?.onboarded,
          });
        },

        finishOnboarding({ interestIds, radiusMiles }) {
          const u = get().user;
          if (!u) return;
          set({
            user: { ...u, interestIds, radiusMiles },
            hasFinishedOnboarding: true,
          });
          syncUserToDb({ interest_ids: interestIds, radius_miles: radiusMiles, onboarded: true });
        },

        updateProfile(patch) {
          const u = get().user;
          if (!u) return;
          set({ user: { ...u, ...patch } });
          syncUserToDb({
            ...(patch.name !== undefined ? { name: patch.name } : null),
            ...(patch.bio !== undefined ? { bio: patch.bio } : null),
            ...(patch.avatarUrl !== undefined ? { avatar_url: patch.avatarUrl } : null),
            ...(patch.customTags !== undefined ? { custom_tags: patch.customTags } : null),
            ...(patch.interestIds !== undefined ? { interest_ids: patch.interestIds } : null),
          });
        },

        addCustomTag(label) {
          const u = get().user;
          if (!u) return;
          const clean = label.trim();
          if (!clean || u.customTags.includes(clean)) return;
          const next = [...u.customTags, clean];
          set({ user: { ...u, customTags: next } });
          syncUserToDb({ custom_tags: next });
        },

        removeCustomTag(label) {
          const u = get().user;
          if (!u) return;
          const next = u.customTags.filter((t) => t !== label);
          // Drop the tag's skill level too so the map doesn't accumulate orphans.
          const nextLevels = { ...u.tagLevels };
          delete nextLevels[label];
          set({ user: { ...u, customTags: next, tagLevels: nextLevels } });
          syncUserToDb({ custom_tags: next, tag_levels: nextLevels });
        },

        setTagLevel(key, level) {
          const u = get().user;
          if (!u) return;
          const clamped = Math.min(4, Math.max(1, Math.round(level)));
          const nextLevels = { ...u.tagLevels, [key]: clamped };
          set({ user: { ...u, tagLevels: nextLevels } });
          syncUserToDb({ tag_levels: nextLevels });
        },

        setAreaSettings(patch) {
          const u = get().user;
          if (!u) return;
          set({
            user: {
              ...u,
              ...(patch.radiusMiles != null ? { radiusMiles: patch.radiusMiles } : null),
              ...(patch.centerLat != null ? { centerLat: patch.centerLat } : null),
              ...(patch.centerLng != null ? { centerLng: patch.centerLng } : null),
            },
          });
          syncUserToDb({
            ...(patch.radiusMiles != null ? { radius_miles: patch.radiusMiles } : null),
            ...(patch.centerLat != null ? { center_lat: patch.centerLat } : null),
            ...(patch.centerLng != null ? { center_lng: patch.centerLng } : null),
          });
        },

        recordRatingGiven(stars) {
          const u = get().user;
          if (!u) return;
          // In supabase mode the apply_rating trigger already maintains this
          // aggregate server-side; we still update locally so the profile
          // reflects it immediately (reconciled on next session load).
          const newCount = u.ratingGivenCount + 1;
          set({
            user: {
              ...u,
              ratingGiven: (u.ratingGiven * u.ratingGivenCount + stars) / newCount,
              ratingGivenCount: newCount,
            },
          });
        },
      };
    },
    {
      name: "hereby.auth",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ user: s.user, hasFinishedOnboarding: s.hasFinishedOnboarding }),
      // Mock-only migration: older builds stored a per-session user id; the
      // mock backend treats the viewer as "me" everywhere, so normalize it.
      // Skipped in supabase mode, where ids are real UUIDs that initAuth() will
      // reconcile against the live session.
      migrate: (persisted: any) => {
        if (!IS_SUPABASE && persisted?.user && persisted.user.id !== "me") {
          persisted.user = { ...persisted.user, id: "me" };
        }
        return persisted;
      },
    },
  ),
);

export const isEduEmail = (email: string) => EDU_RE.test(email);
