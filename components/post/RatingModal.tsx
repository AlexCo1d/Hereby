import { useState } from "react";
import { Modal, View, Text, Pressable, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Stars } from "../common/Stars";
import { Button } from "../common/Button";
import { colors } from "../../constants/theme";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (stars: 1 | 2 | 3 | 4 | 5, comment: string) => void;
};

export function RatingModal({ visible, title, onClose, onSubmit }: Props) {
  const [stars, setStars] = useState(3);
  const [comment, setComment] = useState("");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
      >
        <View className="bg-surface rounded-2xl mx-8 p-5" style={{ width: "82%" }}>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-base font-bold text-ink">{title}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.inkMuted} />
            </Pressable>
          </View>
          <View className="items-center my-2">
            <Stars value={stars} size={32} onChange={(v) => setStars(v)} />
          </View>
          <Text className="text-sm text-ink mt-3">Can you tell us more?</Text>
          <TextInput
            placeholder="How was your experience with your buddy? How did it go?"
            placeholderTextColor={colors.inkMuted}
            multiline
            value={comment}
            onChangeText={setComment}
            className="mt-1 text-ink"
            style={{ minHeight: 60, textAlignVertical: "top" }}
          />
          <View className="flex-row mt-5">
            <Button
              label="Cancel"
              variant="secondary"
              className="flex-1 mr-2"
              onPress={onClose}
            />
            <Button
              label="Submit"
              variant="primary"
              className="flex-1 ml-2"
              onPress={() => onSubmit(stars as 1 | 2 | 3 | 4 | 5, comment)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
