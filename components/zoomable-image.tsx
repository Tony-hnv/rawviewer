import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

export function ZoomableImage({ uri }: { uri: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [scaleLabel, setScaleLabel] = useState("100%");
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
    setScaleLabel("100%");
  }, [baseOffsetX, baseOffsetY, baseScale, offsetX, offsetY, scale]);

  const setDisplayScale = useCallback((value: number) => {
    setScaleLabel(`${Math.round(value * 100)}%`);
  }, []);

  const toggleDoubleTapZoom = useCallback(() => {
    const targetScale = baseScale.value > 1.01 ? 1 : 2;
    scale.value = withTiming(targetScale, { duration: 160 });
    baseScale.value = targetScale;
    offsetX.value = withTiming(0, { duration: 160 });
    offsetY.value = withTiming(0, { duration: 160 });
    baseOffsetX.value = 0;
    baseOffsetY.value = 0;
    setDisplayScale(targetScale);
  }, [baseOffsetX, baseOffsetY, baseScale, offsetX, offsetY, scale, setDisplayScale]);

  const open = useCallback(() => {
    resetZoom();
    setIsOpen(true);
  }, [resetZoom]);

  const transformStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }, { translateY: offsetY.value }, { scale: scale.value }],
  }));

  const zoomGesture = useMemo(() => Gesture.Simultaneous(
    Gesture.Pinch()
      .shouldCancelWhenOutside(false)
      .onUpdate((event) => { scale.value = Math.min(5, Math.max(1, baseScale.value * event.scale)); })
      .onEnd(() => { baseScale.value = scale.value; runOnJS(setDisplayScale)(scale.value); }),
    Gesture.Pan()
      .onUpdate((event) => {
        if (scale.value > 1) {
          offsetX.value = baseOffsetX.value + event.translationX;
          offsetY.value = baseOffsetY.value + event.translationY;
        }
      })
      .onEnd(() => { baseOffsetX.value = offsetX.value; baseOffsetY.value = offsetY.value; }),
    Gesture.Tap().numberOfTaps(2).maxDelay(300).shouldCancelWhenOutside(false).onEnd((_event, success) => {
      if (success) runOnJS(toggleDoubleTapZoom)();
    }),
  ), [baseOffsetX, baseOffsetY, baseScale, offsetX, offsetY, scale, setDisplayScale, toggleDoubleTapZoom]);

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
              <View style={styles.toolbarLeft}>
                <View style={styles.scaleBadge}><MaterialIcons name="zoom-in" size={15} color="#F4D298" /><Text style={styles.scaleText}>{scaleLabel}</Text></View>
                <Pressable onPress={resetZoom} style={styles.fitButton} accessibilityLabel="适应屏幕"><MaterialIcons name="fit-screen" size={16} color="#DDE3E6" /><Text style={styles.fitText}>适应屏幕</Text></Pressable>
              </View>
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
  toolbarLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  scaleBadge: { minWidth: 62, borderRadius: 16, backgroundColor: "rgba(27,36,45,0.92)", paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  scaleText: { color: "#F4D298", fontSize: 11, fontWeight: "800" },
  fitButton: { borderRadius: 16, backgroundColor: "rgba(27,36,45,0.92)", paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  fitText: { color: "#DDE3E6", fontSize: 11, fontWeight: "700" },
  closeButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(27,36,45,0.94)" },
});
