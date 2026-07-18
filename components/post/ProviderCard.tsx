import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "../common/Avatar";
import { AvatarStack } from "../common/AvatarStack";
import { KindCorner } from "./KindCorner";
import type { Post, User } from "../../services/types";
import { moneyBadge, dayPrefix, isGroupPost, isPostIncoming } from "../../services/types";

type Props = {
  post: Post;
  author: User;
  onPress?: () => void;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Compact list row for the Discover cluster popup. The headline is the activity
// TITLE (not member names) so the row reads at a glance even when several
// avatars are stacked; the full title is shown (no truncation) so people
// understand what the post is. Tags/badges/skill chips were removed to keep the
// list as thin and scannable as possible — those details live in the detail view.
export function ProviderCard({ post, author, onPress }: Props) {
  const money = moneyBadge(post);
  const group = isGroupPost(post) && (post.participants?.length ?? 0) > 1;
  const members = post.participants ?? [author];
  // Already-agreed (not yet started) 1-on-1 posts read greyed + carry an
  // "Upcoming" tag instead of the money badge, so the list mirrors the map's
  // grey pin. Group activities are never "incoming" (they keep filling seats).
  const incoming = isPostIncoming(post);

  return (
    <Pressable
      onPress={onPress}
      className="bg-surface rounded-xl px-3 py-2.5 flex-row items-center overflow-hidden"
      style={{
        opacity: incoming ? 0.65 : 1,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.07,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      {/* Post kind lives only in the folded top-left corner (Offer / Seek /
          Partner) so its colour never collides with the content. */}
      <KindCorner kind={post.kind} size={30} iconSize={11} />
      {group ? (
        // Compact row: cap the stack to 2 faces + "+N" and overlap tightly so
        // the avatars never crowd out the title column (which must stay wide
        // enough to wrap the title on word boundaries, not per-character).
        <AvatarStack users={members} size={34} max={2} overlap={13} />
      ) : (
        <Avatar uri={author.avatarUrl} size={42} />
      )}
      <View className="flex-1 ml-3" style={{ minWidth: 0 }}>
        {/* Activity title — the primary read. Shown in full so the post is
            self-explanatory. */}
        <Text className="text-sm font-bold text-ink">{post.title}</Text>
        <Text className="text-xs text-ink-muted mt-0.5">
          {dayPrefix(post.startAt)} {formatTime(post.startAt)} - {formatTime(post.endAt)}
        </Text>
      </View>
      {/* Upcoming tag (agreed, not started) OR the money badge — instant read. */}
      {incoming ? (
        <View
          className="flex-row items-center rounded-full px-2 py-0.5 ml-2"
          style={{ backgroundColor: "rgba(120,120,120,0.16)" }}
        >
          <Ionicons name="time-outline" size={12} color="#6B6B6B" />
          <Text className="text-xs font-bold ml-1" style={{ color: "#6B6B6B" }}>
            Upcoming
          </Text>
        </View>
      ) : (
        <View
          className="flex-row items-center rounded-full px-2 py-0.5 ml-2"
          style={{ backgroundColor: money.color + "1F" }}
        >
          <Ionicons name={money.icon as any} size={12} color={money.color} />
          <Text className="text-xs font-bold ml-1" style={{ color: money.color }}>
            {money.label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
