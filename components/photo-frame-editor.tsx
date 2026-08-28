import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { ExifInfo } from "@/lib/exif-info";
import { getCropImageInfo } from "@/lib/local-file-bridge";
import {
  BRAND_MARKS,
  PHOTO_FRAME_STYLES,
  PHOTO_FRAME_THEMES,
  buildFrameText,
  getBrandMonogram,
  getPhotoFrameLayout,
  hasFrameInformation,
  isFilmFrame,
  isPhoneBrand,
  isRoundedFrame,
  type BrandMarkId,
  type PhotoFrameRequest,
  type PhotoFrameStyle,
  type PhotoFrameThemeId,
} from "@/lib/photo-frame-math";
import type { LibraryFile } from "@/lib/raw-files";

export function PhotoFrameEditor({
  visible,
  file,
  exif,
  value,
  isSaving,
  onChange,
  onClose,
  onSave,
}: {
  visible: boolean;
  file: LibraryFile;
  exif: ExifInfo | null;
  value: PhotoFrameRequest;
  isSaving: boolean;
  onChange: (value: PhotoFrameRequest) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const theme =
    PHOTO_FRAME_THEMES.find((item) => item.id === value.themeId) ??
    PHOTO_FRAME_THEMES[0];
  const text = buildFrameText(file, exif, value);
  const isInfoStyle = hasFrameInformation(value.style);
  const isFilmStyle = isFilmFrame(value.style);
  const isRoundedStyle = isRoundedFrame(value.style);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [sourceSize, setSourceSize] = useState({ width: 4, height: 3 });

  useEffect(() => {
    let cancelled = false;
    void getCropImageInfo(file.uri)
      .then(({ width, height }) => {
        if (!cancelled && width > 0 && height > 0) {
          setSourceSize({ width, height });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [file.uri]);

  const frameLayout = useMemo(
    () => getPhotoFrameLayout(sourceSize.width, sourceSize.height, value.style),
    [sourceSize.height, sourceSize.width, value.style],
  );
  const previewFrame = useMemo(() => {
    const availableWidth = Math.max(previewWidth - 26, 280);
    const availableHeight = 224;
    const scale =
      frameLayout.outputWidth > 0 && frameLayout.outputHeight > 0
        ? Math.min(
            1,
            availableWidth / frameLayout.outputWidth,
            availableHeight / frameLayout.outputHeight,
          )
        : 1;
    return {
      scale,
      width: frameLayout.outputWidth * scale,
      height: frameLayout.outputHeight * scale,
    };
  }, [frameLayout, previewWidth]);

  const setStyle = (style: PhotoFrameStyle) => onChange({ ...value, style });
  const setTheme = (themeId: PhotoFrameThemeId) =>
    onChange({ ...value, themeId });
  const setBrand = (brandMark: BrandMarkId) =>
    onChange({ ...value, brandMark });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.heading}>
            <View style={styles.headingText}>
              <Text style={styles.title}>照片边框</Text>
              <Text style={styles.description}>
                参考摄影参数边框排版，导出新的应用本地副本，原图不会修改。
              </Text>
            </View>
            <View style={styles.headingIcon}>
              <MaterialIcons name="wallpaper" size={20} color="#F4D298" />
            </View>
          </View>

          <View
            style={styles.preview}
            onLayout={(event) =>
              setPreviewWidth(event.nativeEvent.layout.width)
            }
          >
            <View
              style={[
                styles.previewFrame,
                {
                  width: previewFrame.width,
                  height: previewFrame.height,
                  backgroundColor: theme.backgroundColor,
                },
              ]}
            >
              <Image
                source={{ uri: file.uri }}
                style={{
                  position: "absolute",
                  left: frameLayout.imageLeft * previewFrame.scale,
                  top: frameLayout.imageTop * previewFrame.scale,
                  width: frameLayout.imageWidth * previewFrame.scale,
                  height: frameLayout.imageHeight * previewFrame.scale,
                  borderRadius: isRoundedStyle
                    ? Math.max(5, Math.min(14, 12 * previewFrame.scale))
                    : 0,
                }}
                contentFit="contain"
              />
              {isFilmStyle && (
                <>
                  <View
                    style={[
                      styles.previewFilmStrip,
                      {
                        left: frameLayout.sideInset * previewFrame.scale,
                        top: frameLayout.sideInset * previewFrame.scale * 0.24,
                        width: frameLayout.imageWidth * previewFrame.scale,
                      },
                    ]}
                  >
                    {Array.from({ length: 9 }, (_, index) => (
                      <View
                        key={`top-${index}`}
                        style={styles.previewFilmHole}
                      />
                    ))}
                  </View>
                  <View
                    style={[
                      styles.previewFilmStrip,
                      {
                        left: frameLayout.sideInset * previewFrame.scale,
                        bottom:
                          frameLayout.sideInset * previewFrame.scale * 0.24,
                        width: frameLayout.imageWidth * previewFrame.scale,
                      },
                    ]}
                  >
                    {Array.from({ length: 9 }, (_, index) => (
                      <View
                        key={`bottom-${index}`}
                        style={styles.previewFilmHole}
                      />
                    ))}
                  </View>
                  <Text
                    style={[
                      styles.previewFilmStamp,
                      {
                        color: theme.foregroundColor,
                        left: frameLayout.sideInset * previewFrame.scale,
                      },
                    ]}
                  >
                    {text.details || "RAW VIEW"}
                  </Text>
                </>
              )}
              {isInfoStyle && (
                <View
                  style={[
                    styles.previewInfo,
                    {
                      left: frameLayout.sideInset * previewFrame.scale,
                      top: frameLayout.informationTop * previewFrame.scale,
                      width: frameLayout.imageWidth * previewFrame.scale,
                      height:
                        frameLayout.informationHeight * previewFrame.scale,
                      paddingTop:
                        frameLayout.informationHeight *
                        previewFrame.scale *
                        0.17,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.previewTitle,
                      {
                        color: theme.foregroundColor,
                        fontSize: Math.max(9, 12 * previewFrame.scale),
                        lineHeight: Math.max(11, 16 * previewFrame.scale),
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {text.title}
                  </Text>
                  <Text
                    style={[
                      styles.previewSubtitle,
                      {
                        color: theme.foregroundColor,
                        fontSize: Math.max(7, 9 * previewFrame.scale),
                        lineHeight: Math.max(9, 13 * previewFrame.scale),
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {text.subtitle}
                  </Text>
                  <Text
                    style={[
                      styles.previewDetail,
                      {
                        color: theme.foregroundColor,
                        fontSize: Math.max(7, 9 * previewFrame.scale),
                        lineHeight: Math.max(9, 13 * previewFrame.scale),
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {text.details || "本地图片副本"}
                  </Text>
                </View>
              )}
              {value.style === "brand" && (
                <View
                  style={[
                    styles.previewBrandBadge,
                    {
                      right: frameLayout.sideInset * previewFrame.scale,
                      top:
                        frameLayout.informationTop * previewFrame.scale +
                        frameLayout.informationHeight *
                          previewFrame.scale *
                          0.2,
                    },
                  ]}
                >
                  <MaterialIcons
                    name={
                      isPhoneBrand(value.brandMark)
                        ? "smartphone"
                        : "camera-alt"
                    }
                    size={Math.max(11, 17 * previewFrame.scale)}
                    color={theme.foregroundColor}
                  />
                  <Text
                    style={[
                      styles.previewBrandMonogram,
                      {
                        color: theme.foregroundColor,
                        fontSize: Math.max(8, 11 * previewFrame.scale),
                      },
                    ]}
                  >
                    {getBrandMonogram(value.brandMark)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <Text style={styles.sectionLabel}>边框样式</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.optionRow}
          >
            {PHOTO_FRAME_STYLES.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setStyle(item.id)}
                disabled={isSaving}
                style={({ pressed }) => [
                  styles.styleChip,
                  value.style === item.id && styles.styleChipActive,
                  (pressed || isSaving) && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.styleLabel,
                    value.style === item.id && styles.styleLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
                <Text
                  style={[
                    styles.styleDescription,
                    value.style === item.id && styles.styleDescriptionActive,
                  ]}
                >
                  {item.description}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.sectionLabel}>边框颜色</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.colorRow}
          >
            {PHOTO_FRAME_THEMES.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setTheme(item.id)}
                disabled={isSaving}
                style={({ pressed }) => [
                  styles.colorChip,
                  value.themeId === item.id && styles.colorChipActive,
                  (pressed || isSaving) && styles.pressed,
                ]}
              >
                <View
                  style={[
                    styles.colorDot,
                    { backgroundColor: item.backgroundColor },
                  ]}
                />
                <Text style={styles.colorText}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {value.style === "brand" && (
            <>
              <Text style={styles.sectionLabel}>品牌标识</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.brandRow}
              >
                {BRAND_MARKS.map((brand) => (
                  <Pressable
                    key={brand}
                    onPress={() => setBrand(brand)}
                    disabled={isSaving}
                    style={({ pressed }) => [
                      styles.brandChip,
                      value.brandMark === brand && styles.brandChipActive,
                      (pressed || isSaving) && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.brandIcon,
                        value.brandMark === brand && styles.brandIconActive,
                      ]}
                    >
                      <MaterialIcons
                        name={isPhoneBrand(brand) ? "smartphone" : "camera-alt"}
                        size={13}
                        color={
                          value.brandMark === brand ? "#1A1610" : "#AAB4BE"
                        }
                      />
                      <Text
                        style={[
                          styles.brandMonogram,
                          value.brandMark === brand &&
                            styles.brandMonogramActive,
                        ]}
                      >
                        {getBrandMonogram(brand)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.brandText,
                        value.brandMark === brand && styles.brandTextActive,
                      ]}
                    >
                      {brand}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          {value.style === "exif" && !exif && (
            <View style={styles.infoNotice}>
              <MaterialIcons name="info-outline" size={16} color="#F4D298" />
              <Text style={styles.infoNoticeText}>
                未读取到 EXIF 时会显示文件名与本地副本标识。
              </Text>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              disabled={isSaving}
              style={({ pressed }) => [
                styles.cancelButton,
                (pressed || isSaving) && styles.pressed,
              ]}
            >
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
            <Pressable
              onPress={onSave}
              disabled={isSaving}
              style={({ pressed }) => [
                styles.saveButton,
                (pressed || isSaving) && styles.pressed,
              ]}
            >
              <MaterialIcons name="save-alt" size={18} color="#11161C" />
              <Text style={styles.saveText}>
                {isSaving ? "正在生成" : "生成边框副本"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(4, 7, 10, 0.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#1B242D",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 9,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: "#394955",
  },
  handle: {
    height: 4,
    width: 38,
    borderRadius: 2,
    backgroundColor: "#52616E",
    alignSelf: "center",
    marginBottom: 15,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: 12 },
  headingText: { flex: 1 },
  title: { color: "#F4F1EA", fontSize: 19, lineHeight: 25, fontWeight: "800" },
  description: { color: "#AAB4BE", fontSize: 12, lineHeight: 18, marginTop: 4 },
  headingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#382D20",
  },
  preview: {
    marginTop: 16,
    height: 250,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#121A21",
  },
  previewFrame: { position: "relative", overflow: "hidden" },
  previewInfo: {
    position: "absolute",
    justifyContent: "center",
    overflow: "hidden",
  },
  previewBrandBadge: {
    position: "absolute",
    minWidth: 28,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 2,
  },
  previewBrandMonogram: { fontWeight: "900" },
  previewFilmStrip: {
    position: "absolute",
    height: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewFilmHole: {
    width: 5,
    height: 3,
    borderRadius: 1,
    backgroundColor: "rgba(255, 255, 255, 0.68)",
  },
  previewFilmStamp: {
    position: "absolute",
    bottom: 5,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  previewTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  previewSubtitle: { fontSize: 9, lineHeight: 13, opacity: 0.76, marginTop: 1 },
  previewDetail: {
    fontSize: 9,
    lineHeight: 13,
    opacity: 0.85,
    marginTop: 1,
    fontWeight: "700",
  },
  sectionLabel: {
    color: "#AAB4BE",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    marginTop: 15,
    marginBottom: 8,
  },
  optionRow: { gap: 8, paddingRight: 10 },
  styleChip: {
    width: 118,
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3B4A55",
    backgroundColor: "#121A21",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  styleChipActive: { borderColor: "#D7983D", backgroundColor: "#382D20" },
  styleLabel: { color: "#D5DCE3", fontSize: 12, fontWeight: "800" },
  styleLabelActive: { color: "#F4D298" },
  styleDescription: {
    color: "#7E8B95",
    fontSize: 9,
    lineHeight: 13,
    marginTop: 3,
  },
  styleDescriptionActive: { color: "#D8BA88" },
  colorRow: { gap: 8, paddingRight: 10 },
  colorChip: {
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#3B4A55",
    backgroundColor: "#121A21",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  colorChipActive: { borderColor: "#D7983D", backgroundColor: "#382D20" },
  colorDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#74818B",
  },
  colorText: { color: "#D5DCE3", fontSize: 11, fontWeight: "700" },
  brandRow: { gap: 7, paddingRight: 10 },
  brandChip: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#3B4A55",
    backgroundColor: "#121A21",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    paddingHorizontal: 11,
  },
  brandChipActive: { borderColor: "#D7983D", backgroundColor: "#382D20" },
  brandText: {
    color: "#D5DCE3",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  brandTextActive: { color: "#F4D298" },
  brandIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#52616E",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 1,
  },
  brandIconActive: { backgroundColor: "#F4D298", borderColor: "#F4D298" },
  brandMonogram: { color: "#AAB4BE", fontSize: 7, fontWeight: "900" },
  brandMonogramActive: { color: "#1A1610" },
  infoNotice: {
    marginTop: 12,
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: "#382D20",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  infoNoticeText: {
    flex: 1,
    color: "#F4D298",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancelButton: {
    flex: 0.8,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#4C5E6A",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: "#D5DCE3", fontSize: 13, fontWeight: "800" },
  saveButton: {
    flex: 1.4,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#D7983D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  saveText: { color: "#11161C", fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
