// Hand-crafted mock data tuned to look like the pitch-deck screenshots.
// All coordinates are around UCF (Orlando) so the OSM map shows the right area.
import type {
  ChatThread,
  InterestTag,
  Message,
  Order,
  Post,
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
];

const nowMinus = (hours: number) => new Date(Date.now() - hours * 3600 * 1000).toISOString();
const nowPlus = (hours: number) => new Date(Date.now() + hours * 3600 * 1000).toISOString();

export const POSTS: Post[] = [
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
    startAt: nowPlus(20),
    endAt: nowPlus(21.5),
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
    startAt: nowPlus(22),
    endAt: nowPlus(23.5),
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
    startAt: nowPlus(24),
    endAt: nowPlus(25),
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
    startAt: nowPlus(48),
    endAt: nowPlus(52),
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
    startAt: nowPlus(60),
    endAt: nowPlus(62),
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
    startAt: nowPlus(72),
    endAt: nowPlus(74),
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
    startAt: nowPlus(96),
    endAt: nowPlus(98),
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
    startAt: nowPlus(120),
    endAt: nowPlus(123),
    location: { lat: 28.6015, lng: -81.2003 },
    locationName: "STUDENT UNION, 12715 Pegasus Dr",
    badges: ["Tournament"],
    postedAt: nowMinus(48),
    coverImageUrl: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=600",
  },
];

// (The standalone EVENTS array was removed — group events are now Posts
// with seats ≥ 2 in the POSTS array above. The Events tab pulls them via
// api.listPosts({ onlyEvents: true }), so there's one source of truth.)

// Helper factories so the per-party check-in schema doesn't make the seed
// data unreadable.
const pendingParty = () => ({
  location: "pending" as const,
  qr: "pending" as const,
  peer: "pending" as const,
});
const fullParty = () => ({
  location: "confirmed" as const,
  qr: "confirmed" as const,
  peer: "confirmed" as const,
});

export const ORDERS: Order[] = [
  {
    id: "o1",
    postId: "p_alex",
    placedAt: nowMinus(2),
    postTitleSnapshot: "Tennis Partner",
    counterpart: USERS.find((u) => u.id === "u_alex")!,
    startAt: nowPlus(28),
    endAt: nowPlus(30),
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
      counterpart: { location: "confirmed", qr: "pending", peer: "pending" },
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
};
