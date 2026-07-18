// Maps a post's category/tags to a visual identity:
//   • `icon`  — a clean Ionicon name, used on the Discover map marker.
//   • `image` — a stock cover photo, used as the Events card fallback when a
//               post has no coverImageUrl of its own.
// One source of truth so Discover and Events stay consistent, and every post
// gets a sensible picture/icon even without an uploaded cover.
import { Ionicons } from "@expo/vector-icons";

type IconName = keyof typeof Ionicons.glyphMap;

// `color` is the map-marker accent — each activity gets a distinct hue so the
// Discover map reads at a glance (basketball orange, tennis green, swim cyan…).
// `emoji` is a font-independent glyph used on the web map (where the Ionicons
// icon font may not be available) so every pin still reads at a glance.
type Visual = { icon: IconName; image: string; color: string; emoji: string };

// Keyed by lowercase keyword found in the category or any tag. Order matters:
// the first rule whose keyword matches wins.
const RULES: { match: string[]; icon: IconName; image: string; color: string; emoji: string }[] = [
  { match: ["basketball"], icon: "basketball", color: "#E8622C", emoji: "🏀", image: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=600" },
  { match: ["tennis"], icon: "tennisball", color: "#7BB661", emoji: "🎾", image: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=600" },
  { match: ["soccer", "football"], icon: "football", color: "#2F80ED", emoji: "⚽", image: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=600" },
  { match: ["baseball"], icon: "baseball", color: "#C0392B", emoji: "⚾", image: "https://images.unsplash.com/photo-1508344928928-7165b67de128?w=600" },
  { match: ["swim", "swimming", "pool", "diving"], icon: "water", color: "#1FA2C4", emoji: "🏊", image: "https://images.unsplash.com/photo-1560090995-01632a28895b?w=600" },
  { match: ["volleyball"], icon: "ellipse", color: "#F2994A", emoji: "🏐", image: "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=600" },
  { match: ["pickleball"], icon: "tennisball", color: "#16A085", emoji: "🏓", image: "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=600" },
  { match: ["run", "running", "jog", "track"], icon: "walk", color: "#EB5757", emoji: "🏃", image: "https://images.unsplash.com/photo-1502224562085-639556652f33?w=600" },
  { match: ["badminton", "ping pong", "pingpong", "golf"], icon: "tennisball", color: "#11998E", emoji: "🏸", image: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600" },
  { match: ["gym", "workout", "fitness", "weight", "lifting"], icon: "barbell", color: "#8E44AD", emoji: "🏋️", image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600" },
  { match: ["yoga", "pilates", "stretch"], icon: "body", color: "#D96BA0", emoji: "🧘", image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600" },
  { match: ["coding", "python", "cs", "programming", "hackathon"], icon: "code-slash", color: "#4B6584", emoji: "💻", image: "https://images.unsplash.com/photo-1526379095098-d400fd0bf935?w=600" },
  { match: ["guitar", "piano", "violin", "music"], icon: "musical-notes", color: "#9B59B6", emoji: "🎵", image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600" },
  { match: ["painting", "pottery", "art"], icon: "color-palette", color: "#D35400", emoji: "🎨", image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600" },
  { match: ["spanish", "japanese", "chinese", "french", "korean", "portuguese", "language"], icon: "language", color: "#2D9CDB", emoji: "🗣️", image: "https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=600" },
  { match: ["study", "academic", "eecs", "workshop", "seminar"], icon: "school", color: "#2F80ED", emoji: "📚", image: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600" },
  { match: ["volunteer", "service", "food bank"], icon: "heart", color: "#EB5757", emoji: "❤️", image: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=600" },
  { match: ["brunch", "social", "networking", "food"], icon: "restaurant", color: "#F2994A", emoji: "🍽️", image: "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=600" },
];

const DEFAULT: Visual = {
  icon: "pricetag",
  color: "#6B7280",
  emoji: "📍",
  image: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600",
};

/** Resolve a post's visual identity from its category + tags. */
export function categoryVisual(p: { category?: string; tags?: string[] }): Visual {
  const hay = [p.category ?? "", ...(p.tags ?? [])].join(" ").toLowerCase();
  for (const r of RULES) {
    if (r.match.some((kw) => hay.includes(kw))) return { icon: r.icon, image: r.image, color: r.color, emoji: r.emoji };
  }
  return DEFAULT;
}
