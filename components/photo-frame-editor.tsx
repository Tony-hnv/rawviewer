import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Switch,
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
  clampLogoOffset,
  clampLogoScale,
  getPhotoFrameLayout,
  hasFrameInformation,
  isFilmFrame,
  isRoundedFrame,
  type BrandMarkId,
  type PhotoFrameRequest,
  type PhotoFrameStyle,
  type PhotoFrameThemeId,
} from "@/lib/photo-frame-math";
import type { LibraryFile } from "@/lib/raw-files";

const BRAND_LOGO_SOURCES: Record<BrandMarkId, number> = {
  Sony: require("@/assets/brand-logos/sony.png"),
  Canon: require("@/assets/brand-logos/canon.png"),
  Nikon: require("@/assets/brand-logos/nikon.png"),
  Fujifilm: require("@/assets/brand-logos/fujifilm.png"),
  Leica: require("@/assets/brand-logos/leica.png"),
  Hasselblad: require("@/assets/brand-logos/hasselblad.png"),
  Panasonic: require("@/assets/brand-logos/panasonic.png"),
  Apple: require("@/assets/brand-logos/apple.png"),
  Samsung: require("@/assets/brand-logos/samsung.png"),
  Google: require("@/assets/brand-logos/google.png"),
  Huawei: require("@/assets/brand-logos/huawei.png"),
  Xiaomi: require("@/assets/brand-logos/xiaomi.png"),
  OPPO: require("@/assets/brand-logos/oppo.png"),
  vivo: require("@/assets/brand-logos/vivo.png"),
};

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
  const logoVisible = value.logoVisible !== false;
  const logoScale = value.logoScale ?? 1;
  const logoOffsetX = value.logoOffsetX ?? 0;
  const logoOffsetY = value.logoOffsetY ?? 0;
  const adjustLogoScale = (delta: number) =>
    onChange({
      ...value,
      logoScale: clampLogoScale(logoScale + delta),
    });
  const adjustLogoPosition = (x: number, y: number) =>
    onChange({
      ...value,
      logoOffsetX: clampLogoOffset(logoOffsetX + x),
      logoOffsetY: clampLogoOffset(logoOffsetY + y),
    });

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
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
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
                          top:
                            frameLayout.sideInset * previewFrame.scale * 0.24,
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
                {value.style === "brand" && logoVisible && (
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
                        transform: [
                          { translateX: logoOffsetX * 18 * previewFrame.scale },
                          { translateY: logoOffsetY * 10 * previewFrame.scale },
                          { scale: logoScale },
                        ],
                      },
                    ]}
                  >
                    <Image
                      source={BRAND_LOGO_SOURCES[value.brandMark]}
                      contentFit="contain"
                      tintColor={theme.foregroundColor}
                      accessibilityLabel={`${value.brandMark} Logo`}
                      style={[
                        styles.previewBrandLogo,
                        {
                          width: Math.max(36, 68 * previewFrame.scale),
                          height: Math.max(15, 25 * previewFrame.scale),
                        },
                      ]}
                    />
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
                        <Image
                          source={BRAND_LOGO_SOURCES[brand]}
                          contentFit="contain"
                          tintColor={
                            value.brandMark === brand ? "#1A1610" : "#D5DCE3"
                          }
                          accessibilityLabel={`${brand} Logo`}
                          style={styles.brandLogo}
                        />
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
                <View style={styles.logoControlsCard}>
                  <View style={styles.logoToggleRow}>
                    <View style={styles.logoToggleText}>
                      <Text style={styles.logoControlTitle}>显示品牌 Logo</Text>
                      <Text style={styles.logoControlHint}>
                        关闭后仍保留品牌名称和拍摄信息
                      </Text>
                    </View>
                    <Switch
                      value={logoVisible}
                      onValueChange={(nextValue) =>
                        onChange({ ...value, logoVisible: nextValue })
                      }
                      disabled={isSaving}
                      trackColor={{ false: "#3B4A55", true: "#B9792C" }}
                      thumbColor={logoVisible ? "#F4D298" : "#AAB4BE"}
                    />
                  </View>
                  <View style={styles.logoControlRow}>
                    <Text style={styles.logoControlLabel}>Logo 大小</Text>
                    <View style={styles.stepper}>
                      <Pressable
                        onPress={() => adjustLogoScale(-0.1)}
                        disabled={isSaving || !logoVisible}
                        style={({ pressed }) => [
                          styles.stepperButton,
                          (pressed || isSaving || !logoVisible) &&
                            styles.pressed,
                        ]}
                      >
                        <MaterialIcons
                          name="remove"
                          size={17}
                          color="#F4D298"
                        />
                      </Pressable>
                      <Text style={styles.stepperValue}>
                        {Math.round(logoScale * 100)}%
                      </Text>
                      <Pressable
                        onPress={() => adjustLogoScale(0.1)}
                        disabled={isSaving || !logoVisible}
                        style={({ pressed }) => [
                          styles.stepperButton,
                          (pressed || isSaving || !logoVisible) &&
                            styles.pressed,
                        ]}
                      >
                        <MaterialIcons name="add" size={17} color="#F4D298" />
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.logoControlRow}>
                    <Text style={styles.logoControlLabel}>Logo 位置</Text>
                    <View style={styles.positionPad}>
                      <Pressable
                        onPress={() => adjustLogoPosition(0, -0.1)}
                        disabled={isSaving || !logoVisible}
                        style={styles.positionButton}
                      >
                        <MaterialIcons
                          name="keyboard-arrow-up"
                          size={18}
                          color="#D5DCE3"
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => adjustLogoPosition(-0.1, 0)}
                        disabled={isSaving || !logoVisible}
                        style={styles.positionButton}
                      >
                        <MaterialIcons
                          name="keyboard-arrow-left"
                          size={18}
                          color="#D5DCE3"
                        />
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          onChange({ ...value, logoOffsetX: 0, logoOffsetY: 0 })
                        }
                        disabled={isSaving || !logoVisible}
                        style={styles.positionCenterButton}
                      >
                        <MaterialIcons
                          name="center-focus-strong"
                          size={16}
                          color="#F4D298"
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => adjustLogoPosition(0.1, 0)}
                        disabled={isSaving || !logoVisible}
                        style={styles.positionButton}
                      >
                        <MaterialIcons
                          name="keyboard-arrow-right"
                          size={18}
                          color="#D5DCE3"
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => adjustLogoPosition(0, 0.1)}
                        disabled={isSaving || !logoVisible}
                        style={styles.positionButton}
                      >
                        <MaterialIcons
                          name="keyboard-arrow-down"
                          size={18}
                          color="#D5DCE3"
                        />
                      </Pressable>
                    </View>
                  </View>
                </View>
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
          </ScrollView>
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
    maxHeight: "92%",
    backgroundColor: "#1B242D",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 9,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: "#394955",
  },
  sheetScroll: { flexGrow: 0 },
  sheetContent: { paddingBottom: 2 },
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
    minWidth: 42,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  previewBrandLogo: { maxWidth: 74 },
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
    width: 39,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#52616E",
    alignItems: "center",
    justifyContent: "center",
  },
  brandIconActive: { backgroundColor: "#F4D298", borderColor: "#F4D298" },
  brandLogo: { width: 32, height: 15 },
  logoControlsCard: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3B4A55",
    backgroundColor: "#121A21",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  logoToggleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoToggleText: { flex: 1 },
  logoControlTitle: { color: "#E9EDF0", fontSize: 12, fontWeight: "800" },
  logoControlHint: {
    color: "#7E8B95",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  logoControlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoControlLabel: { color: "#B9C4CC", fontSize: 11, fontWeight: "700" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepperButton: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#26323B",
    borderWidth: 1,
    borderColor: "#52616E",
  },
  stepperValue: {
    minWidth: 46,
    textAlign: "center",
    color: "#F4D298",
    fontSize: 12,
    fontWeight: "800",
  },
  positionPad: { flexDirection: "row", alignItems: "center", gap: 5 },
  positionButton: {
    width: 29,
    height: 29,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#26323B",
    borderWidth: 1,
    borderColor: "#52616E",
  },
  positionCenterButton: {
    width: 29,
    height: 29,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#382D20",
    borderWidth: 1,
    borderColor: "#B9792C",
  },
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
