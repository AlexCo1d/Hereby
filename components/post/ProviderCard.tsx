import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "../common/Avatar";
import { colors } from "../../constants/theme";
import type { Post, User } from "../../services/types";
import { formatHourlyPrice, describeSkillRequirement } from "../../services/types";

type Props = {
  post: Post;
  author: User;
  onPress?: () => void;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function relativeTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins} mins ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function ProviderCard({ post, author, onPress }: Props) {
  const price = formatHourlyPrice(post.priceCentsPerHour);
  const priceColor = colors.accentBlue;

  return (
    <Pressable
      onPress={onPress}
      className="bg-surface rounded-2xl p-3 mb-3 flex-row items-center"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 3,
      }}
    >
      <Avatar uri={author.avatarUrl} size={56} />
      <View className="flex-1 ml-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-bold text-ink">{author.name}</Text>
          <Text className="text-sm font-semibold" style={{ color: priceColor }}>
            {price}
          </Text>
        </View>
        <Text className="text-sm text-ink-muted mt-0.5">
          {formatTime(post.startAt)} - {formatTime(post.endAt)}
        </Text>
        <View className="flex-row items-center mt-1.5">
          {author.level ? (
            <View className="bg-brand-100 rounded-md px-2 py-0.5 mr-2">
              <Text className="text-xs text-brand-700 font-medium">{author.level}</Text>
            </View>
          ) : null}
          {post.badges?.map((b) => (
            <View key={b} className="bg-accent-blue/15 rounded-md px-2 py-0.5 mr-2">
              <Text className="text-xs font-medium" style={{ color: colors.accentBlue }}>
                {b}
              </Text>
            </View>
          ))}
          {(() => {
            const req = describeSkillRequirement(post);
            return req ? (
              <View
                className="flex-row items-center rounded-md px-2 py-0.5 mr-2"
                style={{ backgroundColor: "rgba(124,108,240,0.15)" }}
              >
                <Ionicons name="ribbon-outline" size={11} color={colors.accentPurple} />
                <Text className="text-xs font-medium ml-1" style={{ color: colors.accentPurple }}>
                  {req}
                </Text>
              </View>
            ) : null;
          })()}
        </View>
        <Text className="text-[11px] text-ink-muted mt-1">Posted {relativeTime(post.postedAt)}</Text>
      </View>
      <Pressable
        onPress={onPress}
        className="ml-2 w-9 h-9 rounded-full bg-brand items-center justify-center"
      >
        <Ionicons name="add" size={20} color="white" />
      </Pressable>
    </Pressable>
  );
}
