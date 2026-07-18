// A folded page-corner (dog-ear) in a card's top-left that colour-codes the
// post's kind — Offer (orange) / Seek (purple) / Partner (green). It's the ONE
// place a card wears the kind colour, so the type never competes with the
// category tags or skill chips inside the card body.
//
// The parent must clip it: give the card `overflow-hidden` plus a border radius
// so the corner tip follows the rounded edge instead of poking past it.
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { postKindMeta } from "../../services/types";
import type { PostKind } from "../../services/types";

export function KindCorner({
  kind,
  size = 40,
  iconSize = 14,
}: {
  kind: PostKind;
  size?: number;
  iconSize?: number;
}) {
  const meta = postKindMeta(kind);
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, width: size, height: size, zIndex: 10 }}
    >
      {/* The fold itself — a right-triangle filling the corner. */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          borderTopWidth: size,
          borderRightWidth: size,
          borderTopColor: meta.color,
          borderRightColor: "transparent",
        }}
      />
      <Ionicons
        name={meta.icon as any}
        size={iconSize}
        color="white"
        style={{ position: "absolute", top: 4, left: 4 }}
      />
    </View>
  );
}
