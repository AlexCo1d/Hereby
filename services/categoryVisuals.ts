// Maps a post's category/tags to a visual identity:
//   • `icon`  — a clean Ionicon name, used on the Discover map marker.
//   • `image` — a stock cover photo, used as the Events card fallback when a
//               post has no coverImageUrl of its own.
// One source of truth so Discover and Events stay consistent, and every post
// gets a sensible picture/icon even without an uploaded cover.
import { Ionicons } from "@expo/vector-icons";

type IconName = keyof typeof Ionicons.glyphMap;

type Visual = { icon: IconName; image: string };

// Keyed by lowercase keyword found in the category or any tag. Order matters:
// the first rule whose keyword matches wins.
const RULES: { match: string[]; icon: IconName; image: string }[] = [
  { match: ["basketball"], icon: "basketball", image: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=600" },
  { match: ["tennis"], icon: "tennisball", image: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=600" },
  { match: ["soccer", "football"], icon: "football", image: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=600" },
  { match: ["baseball"], icon: "baseball", image: "https://images.unsplash.com/photo-1508344928928-7165b67de128?w=600" },
  { match: ["badminton", "ping pong", "pingpong", "golf"], icon: "tennisball", image: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600" },
  { match: ["gym", "workout", "fitness"], icon: "barbell", image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600" },
  { match: ["yoga"], icon: "body", image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600" },
  { match: ["coding", "python", "cs", "programming", "hackathon"], icon: "code-slash", image: "https://images.unsplash.com/photo-1526379095098-d400fd0bf935?w=600" },
  { match: ["guitar", "piano", "violin", "music"], icon: "musical-notes", image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600" },
  { match: ["painting", "pottery", "art"], icon: "color-palette", image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600" },
  { match: ["spanish", "japanese", "chinese", "french", "korean", "portuguese", "language"], icon: "language", image: "https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=600" },
  { match: ["study", "academic", "eecs", "workshop", "seminar"], icon: "school", image: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600" },
  { match: ["volunteer", "service", "food bank"], icon: "heart", image: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=600" },
  { match: ["brunch", "social", "networking", "food"], icon: "restaurant", image: "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=600" },
];

const DEFAULT: Visual = {
  icon: "pricetag",
  image: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600",
};

/** Resolve a post's visual identity from its category + tags. */
export function categoryVisual(p: { category?: string; tags?: string[] }): Visual {
  const hay = [p.category ?? "", ...(p.tags ?? [])].join(" ").toLowerCase();
  for (const r of RULES) {
    if (r.match.some((kw) => hay.includes(kw))) return { icon: r.icon, image: r.image };
  }
  return DEFAULT;
}
