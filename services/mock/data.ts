// Hand-crafted mock data tuned to look like the pitch-deck screenshots.
// All coordinates are around UCF (Orlando) so the OSM map shows the right area.
import type {
  ChatThread,
  CheckInMethod,
  InterestTag,
  Message,
  Notification,
  Order,
  PartyCheckIn,
  Post,
  PublicNote,
  User,
} from "../types";
import { FEE_POLICY_VERSION } from "../types";

export const UCF_CENTER = { lat: 28.6024, lng: -81.2001 };

// All tags use the brand orange when active so behavior is uniform. We
// intentionally dropped per-tag accent colors — they previously pointed at
// Tailwind classes that weren't registered (bg-accent-yellow / -purple),
// which made selected chips render with no background and white-on-white
// text, giving the impression that the tag had "disappeared".
export const INTERESTS: InterestTag[] = [
  // Sports
  { id: "tennis", label: "Tennis", category: "Sports" },
  { id: "badminton", label: "Badminton", category: "Sports" },
  { id: "basketball", label: "Basketball", category: "Sports" },
  { id: "skateboard", label: "Skateboard", category: "Sports" },
  { id: "golf", label: "Golf", category: "Sports" },
  { id: "pingpong", label: "Ping Pong", category: "Sports" },
  { id: "soccer", label: "Soccer", category: "Sports" },
  { id: "yoga", label: "Yoga", category: "Sports" },
  { id: "gym", label: "Gym Pal", category: "Sports" },

  // Skills & Hobby
  { id: "guitar", label: "Guitar", category: "Skills & Hobby Sharing" },
  { id: "piano", label: "Piano", category: "Skills & Hobby Sharing" },
  { id: "violin", label: "Violin", category: "Skills & Hobby Sharing" },
  { id: "painting", label: "Painting", category: "Skills & Hobby Sharing" },
  { id: "pottery", label: "Pottery", category: "Skills & Hobby Sharing" },

  // Language
  { id: "es", label: "Spanish", category: "Language Exchange" },
  { id: "ja", label: "Japanese", category: "Language Exchange" },
  { id: "zh", label: "Chinese", category: "Language Exchange" },
  { id: "fr", label: "French", category: "Language Exchange" },
  { id: "ko", label: "Korean", category: "Language Exchange" },
  { id: "pt", label: "Portuguese", category: "Language Exchange" },

  // Academic
  { id: "studybuddy", label: "Study Buddy", category: "Academic & Career" },
  { id: "jobhunt", label: "Job Hunting Pal", category: "Academic & Career" },
];

export const ME: User = {
  id: "me",
  name: "You",
  avatarUrl: "https://i.pravatar.cc/150?img=12",
  rating: 4.8,
  ratingCount: 23,
  interests: ["tennis", "studybuddy", "ko"],
  eduVerified: true,
};

export const USERS: User[] = [
  {
    id: "u_jennie",
    name: "Jennie Frank",
    avatarUrl: "https://i.pravatar.cc/150?img=47",
    level: "Level 2.5",
    rating: 5.0,
    ratingCount: 18,
    bio:
      "I'm a student and a 2.5 level tennis player. I'm looking for a hitting partner (around 2.5 or 3.0) to improve my game. My main goal is to work on rallying consistency, but I'm also happy to play some casual practice sets.",
    interests: ["tennis"],
    eduVerified: true,
  },
  {
    id: "u_micheal",
    name: "Micheal Chou",
    avatarUrl: "https://i.pravatar.cc/150?img=33",
    level: "Level 3.0",
    rating: 4.7,
    ratingCount: 41,
    interests: ["tennis"],
    eduVerified: true,
  },
  {
    id: "u_marcus",
    name: "Marcus Singh",
    avatarUrl: "https://i.pravatar.cc/150?img=15",
    level: "Level 3.0",
    rating: 4.9,
    ratingCount: 12,
    interests: ["tennis", "gym"],
    eduVerified: true,
  },
  {
    id: "u_alex",
    name: "Alex Ryan",
    avatarUrl: "https://i.pravatar.cc/150?img=8",
    rating: 4.6,
    ratingCount: 9,
    interests: ["tennis"],
    eduVerified: true,
  },
  {
    id: "u_yuxuan",
    name: "Yuxuan Lin",
    avatarUrl: "https://i.pravatar.cc/150?img=24",
    rating: 4.9,
    ratingCount: 33,
    interests: ["studybuddy"],
    eduVerified: true,
  },
  {
    id: "u_michael_b",
    name: "Michael Brown",
    avatarUrl: "https://i.pravatar.cc/150?img=11",
    rating: 4.5,
    ratingCount: 7,
    interests: ["studybuddy"],
    eduVerified: true,
  },
  {
    id: "u_emily",
    name: "Emily Davis",
    avatarUrl: "https://i.pravatar.cc/150?img=44",
    rating: 5.0,
    ratingCount: 6,
    interests: ["golf"],
    eduVerified: true,
  },
  {
    id: "u_ethan",
    name: "Ethan Brown",
    avatarUrl: "https://i.pravatar.cc/150?img=53",
    rating: 4.4,
    ratingCount: 4,
    interests: ["tennis"],
    eduVerified: true,
  },
  // ---- Test fixture: a virtual user actively asking for a tennis partner,
  //      seeded so order-taking (接单) can be exercised without another device. ----
  {
    id: "u_test_sophia",
    name: "Sophia Lee",
    avatarUrl: "https://i.pravatar.cc/150?img=45",
    level: "Level 3.0",
    rating: 4.9,
    ratingCount: 15,
    bio: "3.0 tennis player looking for a hitting partner this week. Happy to rally or play practice sets.",
    interests: ["tennis"],
    eduVerified: true,
  },
  // ---- "Host" pseudo-users seeded for the group events ----
  {
    id: "u_host_umc",
    name: "Faith UMC",
    avatarUrl: "https://i.pravatar.cc/150?img=64",
    rating: 4.9,
    ratingCount: 220,
    interests: [],
    eduVerified: true,
  },
  {
    id: "u_host_wesley",
    name: "Wesley Foundation",
    avatarUrl: "https://i.pravatar.cc/150?img=68",
    rating: 4.8,
    ratingCount: 88,
    interests: [],
    eduVerified: true,
  },
  {
    id: "u_host_studentunion",
    name: "UCF Student Union",
    avatarUrl: "https://i.pravatar.cc/150?img=58",
    rating: 4.7,
    ratingCount: 156,
    interests: [],
    eduVerified: true,
  },
  // ---- Extra students seeded to populate the UCF RWC map clusters ----
  { id: "u_liam", name: "Liam Carter", avatarUrl: "https://i.pravatar.cc/150?img=13", level: "Level 3.5", rating: 4.8, ratingCount: 21, interests: ["basketball", "gym"], eduVerified: true },
  { id: "u_ava", name: "Ava Nguyen", avatarUrl: "https://i.pravatar.cc/150?img=5", rating: 4.9, ratingCount: 30, interests: ["yoga", "gym"], eduVerified: true },
  { id: "u_noah", name: "Noah Patel", avatarUrl: "https://i.pravatar.cc/150?img=60", rating: 4.6, ratingCount: 14, interests: ["soccer"], eduVerified: true },
  { id: "u_mia", name: "Mia Torres", avatarUrl: "https://i.pravatar.cc/150?img=32", rating: 5.0, ratingCount: 11, interests: ["tennis", "pickleball"], eduVerified: true },
  { id: "u_lucas", name: "Lucas Kim", avatarUrl: "https://i.pravatar.cc/150?img=52", level: "Level 3.0", rating: 4.7, ratingCount: 26, interests: ["badminton", "pingpong"], eduVerified: true },
  { id: "u_zoe", name: "Zoe Bennett", avatarUrl: "https://i.pravatar.cc/150?img=41", rating: 4.9, ratingCount: 19, interests: ["swim"], eduVerified: true },
  { id: "u_kai", name: "Kai Rivera", avatarUrl: "https://i.pravatar.cc/150?img=17", rating: 4.5, ratingCount: 8, interests: ["gym", "running"], eduVerified: true },
  { id: "u_nina", name: "Nina Alvarez", avatarUrl: "https://i.pravatar.cc/150?img=26", rating: 4.8, ratingCount: 22, interests: ["volleyball"], eduVerified: true },
];

const nowMinus = (hours: number) => new Date(Date.now() - hours * 3600 * 1000).toISOString();
const nowPlus = (hours: number) => new Date(Date.now() + hours * 3600 * 1000).toISOString();

// Business-hours guard for FUTURE seeds. Activities may only START in the
// 6 AM–10 PM window (mirrors the Discover time-wheel bounds in FilterSheet).
// A raw `Date.now() + offset` can land at 3 AM depending on wall-clock, so snap
// any start falling in the 10 PM–6 AM overnight gap forward to 8 AM.
const snapToDay = (offsetHours: number) => {
  const d = new Date(Date.now() + offsetHours * 3600 * 1000);
  const h = d.getHours();
  if (h >= 22) {
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
  } else if (h < 6) {
    d.setHours(8, 0, 0, 0);
  }
  return d;
};
// Windowed start / end that preserve the requested duration. `winEnd` re-snaps
// the same offset so start & end always share one (windowed) anchor.
const winStart = (offsetHours: number) => snapToDay(offsetHours).toISOString();
const winEnd = (offsetHours: number, durationHours: number) =>
  new Date(snapToDay(offsetHours).getTime() + durationHours * 3600 * 1000).toISOString();

// Absolute clock time on a day `off` days from today (used by the UCF RWC seed
// so the time-window filter has real morning / evening slots to bite on).
const dayAt = (off: number, h: number, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  d.setDate(d.getDate() + off);
  return d.toISOString();
};

// Three real spots around the UCF Recreation & Wellness Center. Members are
// jittered a few metres off each anchor so they fan out into individual
// coloured pins when zoomed in, and collapse into a count bubble when zoomed
// out — driving the cluster demo.
const RWC_BUILDING = { lat: 28.6046, lng: -81.1996 }; // indoor courts / gym
const RWC_POOL = { lat: 28.6053, lng: -81.1999 }; // leisure pool
const RWC_COURTS = { lat: 28.6034, lng: -81.2012 }; // outdoor courts
const jitter = (c: { lat: number; lng: number }, i: number) => ({
  lat: c.lat + Math.sin(i * 2.399) * 0.00016,
  lng: c.lng + Math.cos(i * 2.399) * 0.00016,
});

export const POSTS: Post[] = [
  // Test fixture — a virtual user asking for a tennis partner, right at the
  // default map center so it always shows up in Discover for order-taking tests.
  {
    id: "p_test_tennis_seek",
    authorId: "u_test_sophia",
    kind: "seek", // Sophia is the customer looking for a partner — you can take it
    format: "one_on_one",
    seats: 1,
    title: "Looking for a tennis partner",
    category: "Tennis",
    tags: ["Tennis", "3.0 level", "hitting partner", "rally", "this week"],
    description:
      "3.0 tennis player looking for a hitting partner this week. Happy to rally or play practice sets — mornings or evenings work.",
    priceCentsPerHour: 0, // Free
    cancellationFeeCents: 0,
    skillLevel: 3,
    skillMode: "min",
    startAt: winStart(6),
    endAt: winEnd(6, 1.5),
    location: UCF_CENTER,
    locationName: "UCF Tennis Complex",
    badges: ["Student"],
    commentsCount: 0,
    postedAt: nowMinus(0.5),
  },
  {
    id: "p_jennie_tennis",
    authorId: "u_jennie",
    kind: "seek", // Jennie wants someone to hit with — she's the customer
    format: "one_on_one",
    seats: 1,
    title: "Tennis hitting partner",
    category: "Tennis",
    tags: ["Tennis", "2.5 level", "rally", "hitting partner", "casual"],
    description:
      "I'm a student and a 2.5 level tennis player. I'm looking for a hitting partner (around 2.5 or 3.0) to improve my game. My main goal is to work on rallying consistency, but I'm also happy to play some casual practice sets.",
    priceCentsPerHour: 700, // $7
    cancellationFeeCents: 700,
    startAt: winStart(20),
    endAt: winEnd(20, 1.5),
    location: { lat: 28.6041, lng: -81.2008 },
    locationName: "UCF Tennis Complex",
    badges: ["Student"],
    commentsCount: 10,
    postedAt: nowMinus(27),
  },
  {
    id: "p_micheal_tennis",
    authorId: "u_micheal",
    kind: "offer", // Micheal is the coach
    format: "one_on_one",
    seats: 1,
    title: "Competitive tennis training",
    category: "Tennis",
    tags: ["Tennis", "3.0 level", "competition", "training", "serves"],
    priceCentsPerHour: 500, // $5
    startAt: winStart(22),
    endAt: winEnd(22, 1.5),
    location: { lat: 28.5994, lng: -81.2086 },
    locationName: "Tampa Tennis Courts",
    badges: ["Competition"],
    commentsCount: 4,
    postedAt: nowMinus(6),
  },
  {
    id: "p_marcus_tennis",
    authorId: "u_marcus",
    kind: "offer",
    format: "one_on_one",
    seats: 1,
    title: "Casual rallying buddy",
    category: "Tennis",
    tags: ["Tennis", "casual", "rally", "beginner friendly", "evenings"],
    priceCentsPerHour: 0, // Free
    startAt: winStart(24),
    endAt: winEnd(24, 1),
    location: { lat: 28.6072, lng: -81.1955 },
    locationName: "Palmer Field",
    badges: ["StayActive"],
    commentsCount: 2,
    postedAt: nowMinus(1),
  },
  // ---- Group events (seats >= 2). These surface in the Events tab AND as
  //      pins on the Discover map. All are "offer" (host running an event). ----
  {
    id: "p_event_serve_day",
    authorId: "u_host_umc",
    kind: "offer",
    format: "event",
    seats: 40,
    title: "Serve Day",
    category: "Volunteer",
    tags: ["Volunteer", "community", "food bank", "service", "weekend"],
    priceCentsPerHour: 0,
    startAt: winStart(48),
    endAt: winEnd(48, 4),
    location: { lat: 28.6035, lng: -81.2009 },
    locationName: "Faith UMC Food",
    badges: ["Volunteer"],
    postedAt: nowMinus(72),
    coverImageUrl: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=600",
  },
  {
    id: "p_event_brunch",
    authorId: "u_host_wesley",
    kind: "offer",
    format: "event",
    seats: 25,
    title: "Brunch and Learn",
    category: "Social",
    tags: ["Social", "brunch", "networking", "free food", "students"],
    priceCentsPerHour: 0,
    startAt: winStart(60),
    endAt: winEnd(60, 2),
    location: { lat: 28.604, lng: -81.198 },
    locationName: "Wesley Foundation",
    badges: ["Social"],
    postedAt: nowMinus(40),
    coverImageUrl: "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=600",
  },
  {
    id: "p_event_baseball",
    authorId: "u_marcus",
    kind: "offer",
    format: "activity", // casual pickup game, not an organized event
    seats: 6,
    title: "Fun Baseball Game!",
    category: "Sports",
    tags: ["Baseball", "pickup game", "casual", "Sports", "beginners welcome"],
    priceCentsPerHour: 0,
    startAt: winStart(72),
    endAt: winEnd(72, 2),
    location: { lat: 28.601, lng: -81.21 },
    locationName: "1204 Union Park St.",
    badges: ["Casual"],
    postedAt: nowMinus(12),
    coverImageUrl: "https://images.unsplash.com/photo-1508344928928-7165b67de128?w=600",
  },
  {
    id: "p_event_python",
    authorId: "u_yuxuan",
    kind: "offer",
    format: "event",
    seats: 20,
    title: "Intro to Python Workshop",
    category: "Workshop",
    tags: ["Python", "Coding", "Workshop", "beginners", "CS"],
    priceCentsPerHour: 0,
    startAt: winStart(96),
    endAt: winEnd(96, 2),
    location: { lat: 28.602, lng: -81.2 },
    locationName: "4000 Central Florida Blvd",
    badges: ["Workshop"],
    postedAt: nowMinus(20),
    coverImageUrl: "https://images.unsplash.com/photo-1526379095098-d400fd0bf935?w=600",
  },
  {
    id: "p_event_football",
    authorId: "u_host_studentunion",
    kind: "offer",
    format: "event",
    seats: 30,
    title: "Football Contest",
    category: "Sports",
    tags: ["Football", "Sports", "tournament", "competition", "teams"],
    priceCentsPerHour: 0,
    startAt: winStart(120),
    endAt: winEnd(120, 3),
    location: { lat: 28.6015, lng: -81.2003 },
    locationName: "STUDENT UNION, 12715 Pegasus Dr",
    badges: ["Tournament"],
    postedAt: nowMinus(48),
    coverImageUrl: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=600",
  },

  // ================= UCF RWC cluster A — indoor building (10) =================
  {
    id: "p_rwc_bball_pickup", authorId: "u_liam", kind: "offer", format: "activity", seats: 10,
    title: "Indoor basketball pickup", category: "Basketball",
    tags: ["Basketball", "pickup game", "5v5", "indoor", "all levels"],
    description: "Running full-court 5v5 at the RWC. Just show up — we rotate teams.",
    priceCentsPerHour: 0, startAt: dayAt(0, 18, 0), endAt: dayAt(0, 20, 0),
    location: jitter(RWC_BUILDING, 1), locationName: "UCF RWC — Indoor Courts", badges: ["Casual"], postedAt: nowMinus(3),
  },
  {
    id: "p_rwc_gym_lift", authorId: "u_kai", kind: "partner", format: "one_on_one", seats: 1,
    title: "Gym buddy for push day", category: "Gym",
    tags: ["Gym", "workout", "spotter", "morning", "fitness"],
    description: "Looking for a spotter for a morning push session (chest/shoulders).",
    priceCentsPerHour: 0, priceMode: "free", skillLevel: 2, skillMode: "any", startAt: dayAt(0, 8, 0), endAt: dayAt(0, 9, 30),
    location: jitter(RWC_BUILDING, 2), locationName: "UCF RWC — Weight Room", badges: ["StayActive"], postedAt: nowMinus(5),
  },
  {
    id: "p_rwc_badminton", authorId: "u_lucas", kind: "offer", format: "activity", seats: 4,
    title: "Badminton doubles", category: "Badminton",
    tags: ["Badminton", "doubles", "intermediate", "evenings"],
    priceCentsPerHour: 0, skillLevel: 2, skillMode: "min", startAt: dayAt(1, 17, 0), endAt: dayAt(1, 18, 30),
    location: jitter(RWC_BUILDING, 3), locationName: "UCF RWC — Court 3", badges: ["Casual"], postedAt: nowMinus(8),
  },
  {
    id: "p_rwc_volleyball", authorId: "u_nina", kind: "offer", format: "activity", seats: 12,
    title: "Volleyball open gym", category: "Volleyball",
    tags: ["Volleyball", "open gym", "beginners welcome", "6v6"],
    priceCentsPerHour: 0, startAt: dayAt(0, 19, 0), endAt: dayAt(0, 21, 0),
    location: jitter(RWC_BUILDING, 4), locationName: "UCF RWC — Main Gym", badges: ["Social"], postedAt: nowMinus(6),
  },
  {
    id: "p_rwc_yoga", authorId: "u_ava", kind: "offer", format: "activity", seats: 15,
    title: "Morning yoga flow", category: "Yoga",
    tags: ["Yoga", "vinyasa", "morning", "all levels", "wellness"],
    priceCentsPerHour: 0, startAt: dayAt(1, 9, 0), endAt: dayAt(1, 10, 0),
    location: jitter(RWC_BUILDING, 5), locationName: "UCF RWC — Studio B", badges: ["Wellness"], postedAt: nowMinus(10),
  },
  {
    id: "p_rwc_tabletennis", authorId: "u_lucas", kind: "partner", format: "one_on_one", seats: 1,
    title: "Table tennis rally partner", category: "Ping Pong",
    tags: ["Ping Pong", "table tennis", "rally", "casual"],
    priceCentsPerHour: 0, priceMode: "free", startAt: dayAt(2, 16, 0), endAt: dayAt(2, 17, 0),
    location: jitter(RWC_BUILDING, 6), locationName: "UCF RWC — Game Area", badges: ["Casual"], postedAt: nowMinus(12),
  },
  {
    id: "p_rwc_pickleball_in", authorId: "u_mia", kind: "offer", format: "activity", seats: 4,
    title: "Indoor pickleball", category: "Pickleball",
    tags: ["Pickleball", "doubles", "beginner friendly"],
    priceCentsPerHour: 0, startAt: dayAt(2, 10, 0), endAt: dayAt(2, 11, 30),
    location: jitter(RWC_BUILDING, 7), locationName: "UCF RWC — Court 1", badges: ["Casual"], postedAt: nowMinus(9),
  },
  {
    id: "p_rwc_climb", authorId: "u_kai", kind: "partner", format: "one_on_one", seats: 1,
    title: "Rock climbing belay partner", category: "Gym",
    tags: ["climbing", "gym", "fitness", "belay", "afternoon"],
    description: "Need a belay partner for the climbing wall — we split the day-pass / gear rental.",
    priceCentsPerHour: 0, priceMode: "split", startAt: dayAt(3, 14, 0), endAt: dayAt(3, 16, 0),
    location: jitter(RWC_BUILDING, 8), locationName: "UCF RWC — Climbing Wall", badges: ["StayActive"], postedAt: nowMinus(14),
  },
  {
    id: "p_rwc_hiit", authorId: "u_ava", kind: "offer", format: "activity", seats: 20,
    title: "Sunrise HIIT class", category: "Gym",
    tags: ["fitness", "HIIT", "cardio", "workout", "early"],
    priceCentsPerHour: 0, startAt: dayAt(1, 6, 30), endAt: dayAt(1, 7, 30),
    location: jitter(RWC_BUILDING, 9), locationName: "UCF RWC — Studio A", badges: ["StayActive"], postedAt: nowMinus(16),
  },
  {
    id: "p_rwc_bball_shoot", authorId: "u_liam", kind: "partner", format: "one_on_one", seats: 1,
    title: "Shootaround / 1v1 hoops", category: "Basketball",
    tags: ["Basketball", "1v1", "shootaround", "evening"],
    priceCentsPerHour: 0, priceMode: "free", startAt: dayAt(0, 20, 30), endAt: dayAt(0, 21, 30),
    location: jitter(RWC_BUILDING, 10), locationName: "UCF RWC — Indoor Courts", badges: ["Casual"], postedAt: nowMinus(2),
  },

  // ================= UCF RWC cluster B — leisure pool (3) =================
  {
    id: "p_rwc_lapswim", authorId: "u_zoe", kind: "partner", format: "one_on_one", seats: 1,
    title: "Lap swim partner", category: "Swimming",
    tags: ["swim", "swimming", "pool", "laps", "morning"],
    description: "Early lap swim before class — looking for someone to keep pace with.",
    priceCentsPerHour: 0, priceMode: "free", startAt: dayAt(0, 7, 0), endAt: dayAt(0, 8, 0),
    location: jitter(RWC_POOL, 1), locationName: "UCF RWC — Leisure Pool", badges: ["StayActive"], postedAt: nowMinus(4),
  },
  {
    id: "p_rwc_waterpolo", authorId: "u_noah", kind: "offer", format: "activity", seats: 8,
    title: "Water polo pickup", category: "Swimming",
    tags: ["swim", "pool", "water polo", "team", "evening"],
    priceCentsPerHour: 0, startAt: dayAt(2, 18, 0), endAt: dayAt(2, 19, 30),
    location: jitter(RWC_POOL, 2), locationName: "UCF RWC — Pool", badges: ["Casual"], postedAt: nowMinus(11),
  },
  {
    id: "p_rwc_swimlesson", authorId: "u_zoe", kind: "offer", format: "one_on_one", seats: 1,
    title: "Beginner swim coaching", category: "Swimming",
    tags: ["swim", "swimming", "lessons", "coaching", "beginner"],
    priceCentsPerHour: 800, skillLevel: 1, skillMode: "max", startAt: dayAt(3, 10, 0), endAt: dayAt(3, 11, 0),
    location: jitter(RWC_POOL, 3), locationName: "UCF RWC — Pool", badges: ["Coach"], postedAt: nowMinus(18),
  },

  // ================= UCF RWC cluster C — outdoor courts/fields (5) =================
  {
    id: "p_rwc_bball_out", authorId: "u_liam", kind: "offer", format: "activity", seats: 6,
    title: "Outdoor 3v3 basketball", category: "Basketball",
    tags: ["Basketball", "3v3", "outdoor", "evening", "pickup game"],
    priceCentsPerHour: 0, startAt: dayAt(0, 17, 0), endAt: dayAt(0, 18, 30),
    location: jitter(RWC_COURTS, 1), locationName: "UCF Outdoor Courts", badges: ["Casual"], postedAt: nowMinus(3),
  },
  {
    id: "p_rwc_tennis_out", authorId: "u_mia", kind: "seek", format: "one_on_one", seats: 1,
    title: "Want a stronger player to hit with", category: "Tennis",
    tags: ["Tennis", "hitting partner", "rally", "3.0 level", "morning"],
    description: "3.0 looking to level up — happy to pay a stronger player to hit and give pointers.",
    priceCentsPerHour: 0, priceMode: "budget", budgetCents: 2000, skillLevel: 3, skillMode: "min", startAt: dayAt(1, 8, 0), endAt: dayAt(1, 9, 30),
    location: jitter(RWC_COURTS, 2), locationName: "UCF Tennis Courts", badges: ["Student"], postedAt: nowMinus(7),
  },
  {
    id: "p_rwc_soccer", authorId: "u_noah", kind: "offer", format: "activity", seats: 10,
    title: "Soccer pickup on the field", category: "Soccer",
    tags: ["Soccer", "football", "pickup game", "5v5", "evening"],
    priceCentsPerHour: 0, startAt: dayAt(2, 17, 30), endAt: dayAt(2, 19, 0),
    location: jitter(RWC_COURTS, 3), locationName: "UCF Rec Fields", badges: ["Casual"], postedAt: nowMinus(9),
  },
  {
    id: "p_rwc_pickleball_out", authorId: "u_mia", kind: "offer", format: "activity", seats: 4,
    title: "Outdoor pickleball round-robin", category: "Pickleball",
    tags: ["Pickleball", "round robin", "outdoor", "morning"],
    priceCentsPerHour: 0, startAt: dayAt(1, 9, 0), endAt: dayAt(1, 10, 30),
    location: jitter(RWC_COURTS, 4), locationName: "UCF Outdoor Courts", badges: ["Social"], postedAt: nowMinus(13),
  },
  {
    id: "p_rwc_run", authorId: "u_kai", kind: "offer", format: "activity", seats: 8,
    title: "Morning run group (3 mi)", category: "Running",
    tags: ["running", "run", "jog", "cardio", "morning", "track"],
    priceCentsPerHour: 0, startAt: dayAt(1, 7, 0), endAt: dayAt(1, 8, 0),
    location: jitter(RWC_COURTS, 5), locationName: "UCF Rec Fields — Track", badges: ["StayActive"], postedAt: nowMinus(15),
  },

  // ================= Partnering (co-doing) posts (3) =================
  {
    id: "p_rwc_study_buddy", authorId: "u_ava", kind: "partner", format: "one_on_one", seats: 1,
    title: "COP3502 study buddy", category: "Study group",
    tags: ["study", "COP3502", "CS", "exam prep", "library"],
    description: "Grinding for the midterm — want someone to quiz each other and stay accountable.",
    priceCentsPerHour: 0, priceMode: "free", startAt: dayAt(1, 15, 0), endAt: dayAt(1, 17, 0),
    location: jitter(RWC_BUILDING, 4), locationName: "UCF Library — 3rd floor", badges: ["Student"], postedAt: nowMinus(4),
  },
  {
    id: "p_rwc_costco_run", authorId: "u_noah", kind: "partner", format: "one_on_one", seats: 1,
    title: "Costco run — split gas", category: "Errands",
    tags: ["costco", "grocery", "carpool", "errands", "weekend"],
    description: "Driving to Costco Sunday — ride along and we split gas. Bring your own list.",
    priceCentsPerHour: 0, priceMode: "split", startAt: dayAt(2, 11, 0), endAt: dayAt(2, 13, 0),
    location: jitter(RWC_COURTS, 3), locationName: "UCF — Memory Mall pickup", badges: ["Social"], postedAt: nowMinus(6),
  },
  {
    id: "p_rwc_doubles_partner", authorId: "u_lucas", kind: "partner", format: "one_on_one", seats: 1,
    title: "Doubles partner for league night", category: "Tennis",
    tags: ["Tennis", "doubles", "league", "3.5 level", "evening"],
    description: "Need a doubles partner for Thursday league — we split the court fee.",
    priceCentsPerHour: 0, priceMode: "split", skillLevel: 3, skillMode: "min", startAt: dayAt(3, 18, 0), endAt: dayAt(3, 19, 30),
    location: jitter(RWC_COURTS, 2), locationName: "UCF Tennis Courts", badges: ["Casual"], postedAt: nowMinus(9),
  },
];

// (The standalone EVENTS array was removed — group events are now Posts
// with seats ≥ 2 in the POSTS array above. The Events tab pulls them via
// api.listPosts({ onlyEvents: true }), so there's one source of truth.)

// ---- Group rosters (multi-avatar / multi-name display) --------------------
// Fill `participants` for every multi-person activity/event so Discover + the
// order screen render several faces + names (Liam, Ava, Noah · 6 members)
// instead of only the host — which would read as a 1-on-1 and be ambiguous.
// participants[0] is ALWAYS the author/host; the rest are a deterministic
// rotating slice of the student pool (excluding the author), capped so the
// label stays legible. The real backend derives this from the orders table.
const GROUP_POOL_IDS = [
  "u_liam", "u_ava", "u_noah", "u_mia", "u_lucas", "u_kai", "u_nina",
  "u_yuxuan", "u_ethan", "u_emily", "u_alex", "u_michael_b", "u_marcus",
];
(function seedGroupParticipants() {
  let salt = 0;
  for (const p of POSTS) {
    if (p.format === "one_on_one" || p.seats <= 1) continue;
    const author = USERS.find((u) => u.id === p.authorId);
    if (!author) continue;
    const pool = GROUP_POOL_IDS.filter((id) => id !== p.authorId)
      .map((id) => USERS.find((u) => u.id === id))
      .filter((u): u is User => !!u);
    const wanted = Math.min(p.seats, 5) - 1; // minus the host
    const picked: User[] = [];
    for (let i = 0; i < wanted && i < pool.length; i++) {
      picked.push(pool[(salt + i) % pool.length]);
    }
    salt += 2;
    p.participants = [author, ...picked];
  }
})();

// Helper factories so the per-party check-in schema doesn't make the seed
// data unreadable.
const pendingParty = (): PartyCheckIn => ({ status: "pending" });
const fullParty = (method: CheckInMethod = "location"): PartyCheckIn => ({
  status: "confirmed",
  method,
});

export const ORDERS: Order[] = [
  {
    // Pending request — someone tapped "I'll take that" on YOUR post and is
    // waiting for you (the author) to accept. Exercises the host-side
    // Accept / Decline flow on the order screen.
    id: "o0_pending",
    postId: "p_alex",
    placedAt: nowMinus(0.2),
    postTitleSnapshot: "Tennis Partner",
    counterpart: USERS.find((u) => u.id === "u_marcus")!,
    startAt: winStart(5),
    endAt: winEnd(5, 1.5),
    status: "pending",
    isMyPost: true,
    checkIn: { self: pendingParty(), counterpart: pendingParty() },
    paymentStatus: "not_required",
  },
  {
    id: "o1",
    postId: "p_alex",
    placedAt: nowMinus(2),
    postTitleSnapshot: "Tennis Partner",
    counterpart: USERS.find((u) => u.id === "u_alex")!,
    startAt: winStart(28),
    endAt: winEnd(28, 2),
    status: "upcoming",
    isMyPost: true,
    checkIn: { self: pendingParty(), counterpart: pendingParty() },
    paymentStatus: "not_required",
  },
  {
    id: "o2",
    postId: "p_eecs",
    placedAt: nowMinus(5),
    postTitleSnapshot: "EECS 281 Study Help",
    // Within the check-in window (start in 10 min) — exercises the "Check in
    // now" prompt on the My Orders list.
    counterpart: USERS.find((u) => u.id === "u_yuxuan")!,
    startAt: nowPlus(0.15),
    endAt: nowPlus(1.15),
    status: "upcoming",
    isMyPost: true,
    checkIn: { self: pendingParty(), counterpart: pendingParty() },
    paymentStatus: "not_required",
  },
  {
    id: "o3",
    postId: "p_study",
    placedAt: nowMinus(30),
    postTitleSnapshot: "Study Session",
    counterpart: USERS.find((u) => u.id === "u_michael_b")!,
    startAt: nowMinus(24),
    endAt: nowMinus(22),
    status: "completed",
    isMyPost: true,
    reviewed: false,
    checkIn: { self: fullParty(), counterpart: fullParty() },
    feeAmountCents: 0,
    feePolicyVersion: FEE_POLICY_VERSION,
    paymentStatus: "not_required",
  },
  {
    id: "o4",
    postId: "p_golf",
    placedAt: nowMinus(80),
    // One-sided no-show example: counterpart was present (GPS only),
    // self never made it. Surfaces what the fee-attribution UI looks like.
    postTitleSnapshot: "Golf Learning",
    counterpart: USERS.find((u) => u.id === "u_emily")!,
    startAt: nowMinus(72),
    endAt: nowMinus(70),
    status: "no_show",
    isMyPost: true,
    noShowSide: "self",
    checkIn: {
      self: pendingParty(),
      counterpart: fullParty("location"),
    },
    feeAmountCents: 0, // MVP rate. Phase 2: pulled from fee_policy table.
    feeChargedToUserId: "me",
    feeKind: "no_show",
    feePolicyVersion: FEE_POLICY_VERSION,
    paymentStatus: "not_required",
  },
  {
    id: "o5",
    postId: "p_eth",
    placedAt: nowMinus(130),
    postTitleSnapshot: "Tennis Partner",
    counterpart: USERS.find((u) => u.id === "u_ethan")!,
    startAt: nowMinus(120),
    endAt: nowMinus(118),
    status: "completed",
    isMyPost: true,
    reviewed: true,
    checkIn: { self: fullParty(), counterpart: fullParty() },
    feeAmountCents: 0,
    feePolicyVersion: FEE_POLICY_VERSION,
    paymentStatus: "not_required",
  },
  {
    id: "o6",
    postId: "p_brunch",
    placedAt: nowMinus(50),
    // Both-no-show example: auto-cancelled, refund, no fee/rating.
    postTitleSnapshot: "Brunch Hangout",
    counterpart: USERS.find((u) => u.id === "u_marcus")!,
    startAt: nowMinus(48),
    endAt: nowMinus(46),
    status: "cancelled",
    isMyPost: false,
    autoCancelled: true,
    cancelReason: "mutual_no_show",
    checkIn: { self: pendingParty(), counterpart: pendingParty() },
    feeAmountCents: 0,
    refundIssued: true,
    refundAmountCents: 0,
    feePolicyVersion: FEE_POLICY_VERSION,
    paymentStatus: "not_required",
  },
  {
    // Group activity — you joined u_marcus's pickup baseball game. Sits inside
    // the check-in window (starts in ~10 min) so the N-person check-in roster
    // is demoable: check yourself in via location, then manually vouch for the
    // others who haven't arrived. Its chat is a group chat (see THREADS).
    id: "o7_group",
    postId: "p_event_baseball",
    placedAt: nowMinus(8),
    postTitleSnapshot: "Fun Baseball Game!",
    counterpart: USERS.find((u) => u.id === "u_marcus")!,
    startAt: nowPlus(0.15),
    endAt: nowPlus(2.15),
    status: "upcoming",
    isMyPost: false,
    checkIn: {
      self: pendingParty(),
      counterpart: pendingParty(),
      others: [
        { user: USERS.find((u) => u.id === "u_yuxuan")!, checkIn: pendingParty() },
        { user: USERS.find((u) => u.id === "u_ethan")!, checkIn: pendingParty() },
        { user: USERS.find((u) => u.id === "u_emily")!, checkIn: pendingParty() },
      ],
    },
    paymentStatus: "not_required",
  },
];

// Seed message previews keyed by counterpart. The actual thread set is
// derived from ORDERS in the mock api (spec 0.9 — gated by an order), so the
// previews here are looked up by counterpart id for the threads that DO
// unlock. Counterparts chosen to match the seeded ORDERS (u_alex=o1,
// u_yuxuan=o2, u_marcus=o6).
export const THREADS: ChatThread[] = [
  {
    id: "t_u_alex",
    counterpart: USERS.find((u) => u.id === "u_alex")!,
    lastMessage: "See you at the courts! I'll bring extra balls.",
    lastMessageAt: nowMinus(0.5),
    unread: 2,
    linkedOrderIds: [],
  },
  {
    id: "t_u_yuxuan",
    counterpart: USERS.find((u) => u.id === "u_yuxuan")!,
    lastMessage: "Sounds good — let's meet at the library entrance.",
    lastMessageAt: nowMinus(3),
    unread: 0,
    linkedOrderIds: [],
  },
  {
    id: "t_u_marcus",
    counterpart: USERS.find((u) => u.id === "u_marcus")!,
    lastMessage: "No worries, let's reschedule the brunch.",
    lastMessageAt: nowMinus(46),
    unread: 0,
    linkedOrderIds: [],
  },
  {
    // Group chat for the baseball activity (p_event_baseball). buildThreads()
    // keys group rooms by POST → `t_g_<postId>` (one shared room for every
    // participant, not per-order), and fills isGroup/title/members from the
    // post's real joiners, so only the preview/unread live here.
    id: "t_g_p_event_baseball",
    counterpart: USERS.find((u) => u.id === "u_marcus")!,
    lastMessage: "Running 5 min late but on my way!",
    lastMessageAt: nowMinus(0.3),
    unread: 1,
    linkedOrderIds: [],
  },
];

export const MESSAGES: Record<string, Message[]> = {
  t_u_alex: [
    { id: "ma1", threadId: "t_u_alex", fromUserId: "u_alex", text: "Hey! Looking forward to the match.", sentAt: nowMinus(5) },
    { id: "ma2", threadId: "t_u_alex", fromUserId: "me", text: "Same! What's your level roughly?", sentAt: nowMinus(4.7) },
    { id: "ma3", threadId: "t_u_alex", fromUserId: "u_alex", text: "Around 3.0. Should be a good rally.", sentAt: nowMinus(4.5) },
    { id: "ma4", threadId: "t_u_alex", fromUserId: "u_alex", text: "See you at the courts! I'll bring extra balls.", sentAt: nowMinus(0.5) },
  ],
  t_u_yuxuan: [
    { id: "my1", threadId: "t_u_yuxuan", fromUserId: "me", text: "Hi! Thanks for taking the EECS 281 session.", sentAt: nowMinus(4) },
    { id: "my2", threadId: "t_u_yuxuan", fromUserId: "u_yuxuan", text: "Of course — which topics are giving you trouble?", sentAt: nowMinus(3.6) },
    { id: "my3", threadId: "t_u_yuxuan", fromUserId: "me", text: "Mostly hash tables and the priority queue project.", sentAt: nowMinus(3.3) },
    { id: "my4", threadId: "t_u_yuxuan", fromUserId: "u_yuxuan", text: "Sounds good — let's meet at the library entrance.", sentAt: nowMinus(3) },
  ],
  t_u_marcus: [
    { id: "mm1", threadId: "t_u_marcus", fromUserId: "u_marcus", text: "Hey, are we still on for brunch?", sentAt: nowMinus(50) },
    { id: "mm2", threadId: "t_u_marcus", fromUserId: "u_marcus", text: "No worries, let's reschedule the brunch.", sentAt: nowMinus(46) },
  ],
  t_g_p_event_baseball: [
    { id: "mg1", threadId: "t_g_p_event_baseball", fromUserId: "u_marcus", text: "Welcome everyone! Field's at 1204 Union Park St.", sentAt: nowMinus(7.5) },
    { id: "mg2", threadId: "t_g_p_event_baseball", fromUserId: "u_yuxuan", text: "Sweet, I'll bring a couple of bats.", sentAt: nowMinus(7) },
    { id: "mg3", threadId: "t_g_p_event_baseball", fromUserId: "me", text: "I've got gloves for anyone who needs one.", sentAt: nowMinus(6.5) },
    { id: "mg4", threadId: "t_g_p_event_baseball", fromUserId: "u_ethan", text: "Running 5 min late but on my way!", sentAt: nowMinus(0.3) },
  ],
};

// Public note (per-post open Q&A) seeds. Keyed by post id. Messages authored by
// the post's author render on the RIGHT (answers); everyone else on the LEFT.
// The mock appends new notes here at runtime (addPublicNote). In prod these live
// in a `post_notes` table read/written under RLS scoped to the post.
const noteUser = (id: string) => USERS.find((u) => u.id === id)!;
export const PUBLIC_NOTES: Record<string, PublicNote[]> = {
  p_rwc_bball_out: [
    { id: "pn1", postId: "p_rwc_bball_out", author: noteUser("u_ava"), text: "Is this beginner-friendly? Haven't played in a while.", sentAt: nowMinus(2.4) },
    { id: "pn2", postId: "p_rwc_bball_out", author: noteUser("u_liam"), text: "Totally — it's casual pickup, all levels welcome!", sentAt: nowMinus(2.2) },
    { id: "pn3", postId: "p_rwc_bball_out", author: noteUser("u_kai"), text: "Any street parking near the outdoor courts?", sentAt: nowMinus(1.1) },
    { id: "pn4", postId: "p_rwc_bball_out", author: noteUser("u_liam"), text: "Garage C is closest, ~3 min walk. Bring a $ for the meter.", sentAt: nowMinus(1) },
    // A note authored by the viewer ("me") that someone else replies to — this
    // drives the seeded "you were replied to" notification below so the
    // Notification tab isn't empty on first run.
    { id: "pn_me", postId: "p_rwc_bball_out", author: ME, text: "Mind if I bring a friend? We're both pretty new to pickup.", sentAt: nowMinus(0.9) },
    {
      id: "pn_reply",
      postId: "p_rwc_bball_out",
      author: noteUser("u_liam"),
      text: "Of course — the more the merrier! See you both there.",
      sentAt: nowMinus(0.6),
      replyTo: { noteId: "pn_me", authorId: "me", authorName: "You", excerpt: "Mind if I bring a friend? We're both pretty new to pickup." },
    },
  ],
  p_event_baseball: [
    { id: "pn5", postId: "p_event_baseball", author: noteUser("u_emily"), text: "Do we need our own gloves?", sentAt: nowMinus(5) },
    { id: "pn6", postId: "p_event_baseball", author: noteUser("u_marcus"), text: "Nope, I'll bring a few spares. Just show up!", sentAt: nowMinus(4.8) },
  ],
};

// In-app notifications for the viewer ("me"). Seeded with the reply to `pn_me`
// so the Notification tab and the unread dots have something to show. New ones
// are appended by the mock when the viewer replies to someone else's note.
export const NOTIFICATIONS: Notification[] = [
  {
    id: "ntf_seed_reply",
    userId: "me",
    kind: "public_note_reply",
    read: false,
    createdAt: nowMinus(0.6),
    actor: { id: "u_liam", name: noteUser("u_liam").name, avatarUrl: noteUser("u_liam").avatarUrl },
    postId: "p_rwc_bball_out",
    postTitle: POSTS.find((p) => p.id === "p_rwc_bball_out")?.title ?? "Pickup basketball",
    noteId: "pn_reply",
    parentNoteId: "pn_me",
    excerpt: "Of course — the more the merrier! See you both there.",
  },
];
