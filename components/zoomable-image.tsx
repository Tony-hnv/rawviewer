import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

export function ZoomableImage({ uri }: { uri: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const scale = useSharedValue(1);
  const baseScale = useSharedValue(1);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const baseOffsetX = useSharedValue(0);
  const baseOffsetY = useSharedValue(0);

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1, { duration: 180 });
    baseScale.value = 1;
    offsetX.value = withTiming(0, { duration: 180 });
    offsetY.value = withTiming(0, { duration: 180 });
    baseOffsetX.value = 0;
    baseOffsetY.value = 0;
  }, [baseOffsetX, baseOffsetY, baseScale, offsetX, offsetY, scale]);

  const open = useCallback(() => {
    resetZoom();
    setIsOpen(true);
  }, [resetZoom]);

  const transformStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }, { translateY: offsetY.value }, { scale: scale.value }],
  }));

  const zoomGesture = useMemo(() => Gesture.Simultaneous(
    Gesture.Pinch()
      .onUpdate((event) => { scale.value = Math.min(5, Math.max(1, baseScale.value * event.scale)); })
      .onEnd(() => { baseScale.value = scale.value; }),
    Gesture.Pan()
      .onUpdate((event) => {
        if (scale.value > 1) {
          offsetX.value = baseOffsetX.value + event.translationX;
          offsetY.value = baseOffsetY.value + event.translationY;
        }
      })
      .onEnd(() => { baseOffsetX.value = offsetX.value; baseOffsetY.value = offsetY.value; }),
    Gesture.Tap().numberOfTaps(2).maxDelay(300).shouldCancelWhenOutside(false).onEnd(() => {
      scale.value = withTiming(1, { duration: 160 });
      baseScale.value = 1;
      offsetX.value = withTiming(0, { duration: 160 });
      offsetY.value = withTiming(0, { duration: 160 });
      baseOffsetX.value = 0;
      baseOffsetY.value = 0;
    }),
  ), [baseOffsetX, baseOffsetY, baseScale, offsetX, offsetY, scale]);

  return (
    <>
      <Pressable onPress={open} style={styles.previewPressable} accessibilityLabel="打开图片放大浏览">
        <Image source={{ uri }} style={styles.previewImage} contentFit="contain" />
        <View style={styles.cue} pointerEvents="none"><MaterialIcons name="zoom-in" size={15} color="#DDE3E6" /><Text style={styles.cueText}>点击放大</Text></View>
      </Pressable>
      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <GestureHandlerRootView style={styles.flex}>
          <View style={styles.backdrop}>
            <GestureDetector gesture={zoomGesture}>
              <View style={styles.canvas} collapsable={false}>
                <Animated.View style={[styles.imageWrapper, transformStyle]}>
                  <Image source={{ uri }} style={styles.fullImage} contentFit="contain" />
                </Animated.View>
              </View>
            </GestureDetector>
            <View style={styles.toolbar} pointerEvents="box-none">
              <View style={styles.hint}><MaterialIcons name="pinch" size={16} color="#DDE3E6" /><Text style={styles.hintText}>双指缩放 · 单指拖动 · 双击复位</Text></View>
              <Pressable onPress={() => setIsOpen(false)} style={styles.closeButton} accessibilityLabel="关闭放大图片"><MaterialIcons name="close" size={24} color="#F4F1EA" /></Pressable>
            </View>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  previewPressable: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  previewImage: { width: "100%", height: "100%" },
  cue: { position: "absolute", right: 12, bottom: 12, borderRadius: 14, backgroundColor: "rgba(17,22,28,0.76)", paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 },
  cueText: { color: "#DDE3E6", fontSize: 10, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "#05080B" },
  canvas: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  imageWrapper: { width: "100%", height: "100%" },
  fullImage: { width: "100%", height: "100%" },
  toolbar: { position: "absolute", top: 54, left: 18, right: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hint: { borderRadius: 16, backgroundColor: "rgba(27,36,45,0.88)", paddingHorizontal: 10, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 5 },
  hintText: { color: "#DDE3E6", fontSize: 10, fontWeight: "700" },
  closeButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(27,36,45,0.94)" },
});
