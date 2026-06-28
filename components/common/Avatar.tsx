import { Image } from "expo-image";
import { View } from "react-native";

type Props = {
  uri: string;
  size?: number;
  ring?: boolean;
};

export function Avatar({ uri, size = 44, ring }: Props) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        borderWidth: ring ? 2 : 0,
        borderColor: "#FF6B35",
      }}
    >
      <Image
        source={{ uri }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        transition={150}
      />
    </View>
  );
}
