import { COLORS } from "@/lib/colors";
import { Minus, Plus } from "lucide-react-native";
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";

type MapZoomControlsProps = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  style?: ViewStyle;
};

export default function MapZoomControls({
  onZoomIn,
  onZoomOut,
  style,
}: MapZoomControlsProps) {
  return (
    <View style={[styles.wrap, style]} pointerEvents="box-none">
      <Pressable style={styles.button} onPress={onZoomIn}>
        <Plus color={COLORS.text} size={18} strokeWidth={2.5} />
      </Pressable>
      <Pressable style={styles.button} onPress={onZoomOut}>
        <Minus color={COLORS.text} size={18} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 16,
    gap: 10,
  },
  button: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,19,21,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
  },
});
