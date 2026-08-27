import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image as ExpoImage } from "expo-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image as NativeImage,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";

import {
  type CropAspectRatio,
  type CropBox,
  type CropRect,
  getContainedImageBounds,
  getInitialCropBox,
  getSourceCropFromPreview,
  moveCropBox,
  resizeCropBoxFromBottomRight,
  resizeCropBoxFromCenter,
} from "@/lib/crop-math";

type ImageSize = { width: number; height: number };

type ManualCropperProps = {
  uri: string;
  ratio: CropAspectRatio;
  resetKey?: number;
  disabled?: boolean;
  onCropChange: (crop: CropRect | null) => void;
  onLoadError: (message: string | null) => void;
};

const RESIZE_HIT_SIZE = 54;

function sameSize(first: ImageSize | null, second: ImageSize): boolean {
  return first?.width === second.width && first.height === second.height;
}

export function ManualCropper({
  uri,
  ratio,
  resetKey = 0,
  disabled = false,
  onCropChange,
  onLoadError,
}: ManualCropperProps) {
  const [sourceSize, setSourceSize] = useState<ImageSize | null>(null);
  const [canvasSize, setCanvasSize] = useState<ImageSize | null>(null);
  const [cropBox, setCropBox] = useState<CropBox | null>(null);
  const cropRef = useRef<CropBox | null>(null);
  const panStartRef = useRef<CropBox | null>(null);
  const interactionModeRef = useRef<"move" | "resize">("move");
  const pinchStartRef = useRef<CropBox | null>(null);

  const imageBounds = useMemo(() => {
    if (!sourceSize || !canvasSize) return null;
    return getContainedImageBounds(
      sourceSize.width,
      sourceSize.height,
      canvasSize.width,
      canvasSize.height,
    );
  }, [canvasSize, sourceSize]);

  const commitCrop = useCallback((nextCrop: CropBox) => {
    cropRef.current = nextCrop;
    setCropBox(nextCrop);
  }, []);

  useEffect(() => {
    let active = true;
    setSourceSize(null);
    setCropBox(null);
    cropRef.current = null;
    onCropChange(null);
    onLoadError(null);
    NativeImage.getSize(
      uri,
      (width, height) => {
        if (!active || width <= 0 || height <= 0) return;
        setSourceSize({ width, height });
      },
      () => {
        if (!active) return;
        onLoadError(
          "无法读取图片尺寸。请关闭裁切后重新打开，或确认图片文件仍可访问。",
        );
      },
    );
    return () => {
      active = false;
    };
  }, [onCropChange, onLoadError, uri]);

  useEffect(() => {
    if (!imageBounds) return;
    onCropChange(null);
    commitCrop(getInitialCropBox(imageBounds, ratio));
  }, [commitCrop, imageBounds, onCropChange, ratio, resetKey]);

  useEffect(() => {
    if (!cropBox || !imageBounds || !sourceSize) {
      onCropChange(null);
      return;
    }
    onCropChange(
      getSourceCropFromPreview(
        cropBox,
        imageBounds,
        sourceSize.width,
        sourceSize.height,
      ),
    );
  }, [cropBox, imageBounds, onCropChange, sourceSize]);

  const handleCanvasLayout = useCallback((event: LayoutChangeEvent) => {
    const nextSize = {
      width: Math.round(event.nativeEvent.layout.width),
      height: Math.round(event.nativeEvent.layout.height),
    };
    if (nextSize.width <= 0 || nextSize.height <= 0) return;
    setCanvasSize((current) =>
      sameSize(current, nextSize) ? current : nextSize,
    );
  }, []);

  const beginPan = useCallback(
    (x: number, y: number) => {
      const current = cropRef.current;
      if (!current || disabled) return;
      panStartRef.current = current;
      const isResizeHandle =
        x >= current.x + current.width - RESIZE_HIT_SIZE &&
        y >= current.y + current.height - RESIZE_HIT_SIZE;
      interactionModeRef.current = isResizeHandle ? "resize" : "move";
    },
    [disabled],
  );

  const updatePan = useCallback(
    (translationX: number, translationY: number) => {
      const start = panStartRef.current;
      if (!start || !imageBounds || disabled) return;
      const nextCrop =
        interactionModeRef.current === "resize"
          ? resizeCropBoxFromBottomRight(
              start,
              imageBounds,
              ratio,
              translationX,
              translationY,
            )
          : moveCropBox(start, imageBounds, translationX, translationY);
      commitCrop(nextCrop);
    },
    [commitCrop, disabled, imageBounds, ratio],
  );

  const endPan = useCallback(() => {
    panStartRef.current = null;
  }, []);

  const beginPinch = useCallback(() => {
    if (disabled) return;
    pinchStartRef.current = cropRef.current;
  }, [disabled]);

  const updatePinch = useCallback(
    (scale: number) => {
      const start = pinchStartRef.current;
      if (!start || !imageBounds || disabled) return;
      commitCrop(resizeCropBoxFromCenter(start, imageBounds, ratio, scale));
    },
    [commitCrop, disabled, imageBounds, ratio],
  );

  const endPinch = useCallback(() => {
    pinchStartRef.current = null;
  }, []);

  const cropGesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Pan()
          .maxPointers(1)
          .minDistance(2)
          .runOnJS(true)
          .onBegin((event) => beginPan(event.x, event.y))
          .onUpdate((event) =>
            updatePan(event.translationX, event.translationY),
          )
          .onFinalize(endPan),
        Gesture.Pinch()
          .runOnJS(true)
          .onBegin(beginPinch)
          .onUpdate((event) => updatePinch(event.scale))
          .onFinalize(endPinch),
      ),
    [beginPan, beginPinch, endPan, endPinch, updatePan, updatePinch],
  );

  const pixelCrop = useMemo(() => {
    if (!cropBox || !imageBounds || !sourceSize) return null;
    return getSourceCropFromPreview(
      cropBox,
      imageBounds,
      sourceSize.width,
      sourceSize.height,
    );
  }, [cropBox, imageBounds, sourceSize]);

  const dimTopHeight =
    cropBox && imageBounds ? Math.max(0, cropBox.y - imageBounds.y) : 0;
  const dimBottomHeight =
    cropBox && imageBounds
      ? Math.max(
          0,
          imageBounds.y + imageBounds.height - (cropBox.y + cropBox.height),
        )
      : 0;
  const dimSideHeight = cropBox?.height ?? 0;

  return (
    <View style={styles.editor}>
      <GestureHandlerRootView style={styles.gestureRoot}>
        <GestureDetector gesture={cropGesture}>
          <View
            collapsable={false}
            onLayout={handleCanvasLayout}
            style={[styles.canvas, disabled && styles.canvasDisabled]}
          >
            <ExpoImage
              source={{ uri }}
              style={styles.image}
              contentFit="contain"
            />
            {imageBounds && cropBox && (
              <>
                <View
                  pointerEvents="none"
                  style={[
                    styles.dim,
                    {
                      left: imageBounds.x,
                      top: imageBounds.y,
                      width: imageBounds.width,
                      height: dimTopHeight,
                    },
                  ]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    styles.dim,
                    {
                      left: imageBounds.x,
                      top: cropBox.y + cropBox.height,
                      width: imageBounds.width,
                      height: dimBottomHeight,
                    },
                  ]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    styles.dim,
                    {
                      left: imageBounds.x,
                      top: cropBox.y,
                      width: Math.max(0, cropBox.x - imageBounds.x),
                      height: dimSideHeight,
                    },
                  ]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    styles.dim,
                    {
                      left: cropBox.x + cropBox.width,
                      top: cropBox.y,
                      width: Math.max(
                        0,
                        imageBounds.x +
                          imageBounds.width -
                          (cropBox.x + cropBox.width),
                      ),
                      height: dimSideHeight,
                    },
                  ]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    styles.cropFrame,
                    {
                      left: cropBox.x,
                      top: cropBox.y,
                      width: cropBox.width,
                      height: cropBox.height,
                    },
                  ]}
                >
                  <View style={styles.gridVerticalLeft} />
                  <View style={styles.gridVerticalRight} />
                  <View style={styles.gridHorizontalTop} />
                  <View style={styles.gridHorizontalBottom} />
                  <View style={styles.resizeHandle}>
                    <MaterialIcons
                      name="open-in-full"
                      color="#191322"
                      size={15}
                    />
                  </View>
                </View>
              </>
            )}
            {!imageBounds && (
              <View pointerEvents="none" style={styles.canvasLoading}>
                <Text style={styles.canvasLoadingText}>正在载入裁切画布</Text>
              </View>
            )}
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
      <View style={styles.caption}>
        <View style={styles.captionIcon}>
          <MaterialIcons name="pan-tool-alt" size={16} color="#D7C6F7" />
        </View>
        <View style={styles.captionTextBox}>
          <Text style={styles.captionTitle}>
            拖动裁切框选择位置，拖动右下角调整尺寸
          </Text>
          <Text style={styles.captionDetail}>
            {pixelCrop
              ? `当前输出约 ${pixelCrop.width} × ${pixelCrop.height} 像素 · 双指也可缩放裁切框`
              : "正在读取可裁切区域"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { marginTop: 16 },
  gestureRoot: { height: 244 },
  canvas: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "#090D12",
    borderWidth: 1,
    borderColor: "#374452",
  },
  canvasDisabled: { opacity: 0.55 },
  image: { width: "100%", height: "100%" },
  dim: { position: "absolute", backgroundColor: "rgba(3, 6, 9, 0.58)" },
  cropFrame: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#E7DFFD",
    borderRadius: 3,
    overflow: "visible",
  },
  gridVerticalLeft: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "33.333%",
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(231,223,253,0.72)",
  },
  gridVerticalRight: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "66.666%",
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(231,223,253,0.72)",
  },
  gridHorizontalTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "33.333%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(231,223,253,0.72)",
  },
  gridHorizontalBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "66.666%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(231,223,253,0.72)",
  },
  resizeHandle: {
    position: "absolute",
    width: 30,
    height: 30,
    right: -15,
    bottom: -15,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7DFFD",
    borderWidth: 2,
    borderColor: "#574A70",
  },
  canvasLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  canvasLoadingText: { color: "#AAB4BE", fontSize: 12, fontWeight: "700" },
  caption: {
    minHeight: 48,
    marginTop: 10,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: "#171322",
    borderWidth: 1,
    borderColor: "#413651",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  captionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#28203A",
  },
  captionTextBox: { flex: 1 },
  captionTitle: {
    color: "#E8E0FA",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800",
  },
  captionDetail: {
    color: "#B9A8D7",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 1,
  },
});
