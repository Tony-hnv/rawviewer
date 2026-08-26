import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { ScreenContainer } from "@/components/screen-container";
import { pickWritableDocuments } from "@/lib/local-file-bridge";
import { importAssets, loadLibrary, renameLibraryFile, saveLibrary } from "@/lib/photo-library";
import { createRawPreview } from "@/lib/raw-preview";
import {
  type LibraryFile,
  formatBytes,
  sanitizeBaseName,
} from "@/lib/raw-files";

type Filter = "all" | "raw" | "image";
type RawPreviewStatus = "idle" | "loading" | "ready" | "failed";

interface RawPreviewState {
  fileId: string | null;
  status: RawPreviewStatus;
  uri: string | null;
  message: string | null;
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "raw", label: "RAW" },
  { id: "image", label: "JPG / PNG" },
];

const supportedFormats = [
  ["Sony", "ARW"],
  ["Canon", "CR2 · CR3"],
  ["Nikon", "NEF"],
  ["Panasonic", "RW2"],
  ["通用图像", "PNG · JPG · JPEG"],
];

function feedback(type: "light" | "success") {
  if (Platform.OS === "web") return;
  if (type === "success") {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } else {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

function fileBadge(file: LibraryFile) {
  return file.kind === "raw" ? "RAW" : file.extension.toUpperCase();
}

function FileThumbnail({ file, previewUri }: { file: LibraryFile; previewUri?: string }) {
  if (file.kind === "image" || previewUri) {
    return <Image source={{ uri: previewUri ?? file.uri }} style={styles.thumbnailImage} contentFit="cover" transition={120} />;
  }

  return (
    <View style={[styles.thumbnail, styles.rawThumbnail]}>
      <MaterialIcons name="photo-camera" size={24} color="#D7983D" />
      <Text style={styles.rawThumbText}>{file.extension.toUpperCase()}</Text>
    </View>
  );
}

export default function LibraryScreen() {
  const router = useRouter();
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedFile, setSelectedFile] = useState<LibraryFile | null>(null);
  const [isSupportVisible, setIsSupportVisible] = useState(false);
  const [isRenameVisible, setIsRenameVisible] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [renameNotice, setRenameNotice] = useState<string | null>(null);
  const [rawPreviewState, setRawPreviewState] = useState<RawPreviewState>({
    fileId: null,
    status: "idle",
    uri: null,
    message: null,
  });
  const [rawPreviewRetry, setRawPreviewRetry] = useState(0);
  const rawPreviewCache = useRef<Record<string, string>>({});
  const detailOffsetX = useSharedValue(0);

  const refreshLibrary = useCallback(async () => {
    setIsLoading(true);
    const savedFiles = await loadLibrary();
    setFiles(savedFiles.sort((a, b) => b.importedAt - a.importedAt));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  const filteredFiles = useMemo(() => {
    if (filter === "all") return files;
    return files.filter((file) => file.kind === filter);
  }, [files, filter]);

  const rawFileCount = useMemo(() => files.filter((file) => file.kind === "raw").length, [files]);

  const handleImport = useCallback(async () => {
    setIsImporting(true);
    try {
      const assets = Platform.OS === "android"
        ? await pickWritableDocuments()
        : await DocumentPicker.getDocumentAsync({
            type: "*/*",
            multiple: true,
            copyToCacheDirectory: true,
          }).then((result) => (result.canceled ? [] : result.assets));
      if (assets.length === 0) return;

      const { imported, skipped } = await importAssets(assets);
      if (imported.length > 0) {
        const nextFiles = [...imported, ...files].sort((a, b) => b.importedAt - a.importedAt);
        setFiles(nextFiles);
        await saveLibrary(nextFiles);
        feedback("success");
      }

      if (skipped.length > 0) {
        Alert.alert("已跳过不支持的文件", skipped.join("\n"));
      } else if (imported.length === 0) {
        Alert.alert("没有可导入的图片", "请选择 ARW、CR2、CR3、NEF、RW2、PNG、JPG 或 JPEG 文件。");
      }
    } catch {
      Alert.alert("导入未完成", "无法读取所选文件。请确认文件仍可访问后重试。");
    } finally {
      setIsImporting(false);
    }
  }, [files]);

  const openFile = useCallback((file: LibraryFile) => {
    feedback("light");
    router.push({ pathname: "/detail", params: { id: file.id } });
  }, [router]);

  const closeDetail = useCallback(() => {
    detailOffsetX.value = 0;
    setSelectedFile(null);
    setIsRenameVisible(false);
    setRenameNotice(null);
  }, [detailOffsetX]);

  useEffect(() => {
    if (!selectedFile || selectedFile.kind !== "raw") {
      setRawPreviewState({ fileId: null, status: "idle", uri: null, message: null });
      return;
    }

    const cachedUri = rawPreviewCache.current[selectedFile.id];
    if (cachedUri) {
      setRawPreviewState({ fileId: selectedFile.id, status: "ready", uri: cachedUri, message: null });
      return;
    }

    let isCurrent = true;
    setRawPreviewState({ fileId: selectedFile.id, status: "loading", uri: null, message: null });
    void createRawPreview(selectedFile.uri)
      .then((previewUri) => {
        if (!isCurrent) return;
        rawPreviewCache.current[selectedFile.id] = previewUri;
        setRawPreviewState({ fileId: selectedFile.id, status: "ready", uri: previewUri, message: null });
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        const message = error instanceof Error ? error.message : "RAW 解码失败。";
        setRawPreviewState({ fileId: selectedFile.id, status: "failed", uri: null, message });
      });

    return () => {
      isCurrent = false;
    };
  }, [rawPreviewRetry, selectedFile]);

  const edgeBackGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 0, width: 34 })
        .activeOffsetX(18)
        .failOffsetY([-22, 22])
        .onUpdate((event) => {
          detailOffsetX.value = Math.max(0, event.translationX);
        })
        .onEnd((event) => {
          const shouldDismiss = event.translationX > 86 || event.velocityX > 900;
          if (shouldDismiss) {
            detailOffsetX.value = withTiming(420, { duration: 180 }, (finished) => {
              if (finished) runOnJS(closeDetail)();
            });
            return;
          }
          detailOffsetX.value = withTiming(0, { duration: 160 });
        }),
    [closeDetail, detailOffsetX],
  );

  const detailAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: detailOffsetX.value }],
  }));

  const openRename = useCallback(() => {
    if (!selectedFile) return;
    feedback("light");
    setRenameDraft(selectedFile.baseName);
    setIsRenameVisible(true);
  }, [selectedFile]);

  const confirmRename = useCallback(async () => {
    if (!selectedFile) return;
    const cleanName = sanitizeBaseName(renameDraft);
    if (!cleanName) {
      Alert.alert("请输入文件名", "文件名不能是空白或只包含特殊字符。");
      return;
    }

    setIsRenaming(true);
    try {
      const renamed = await renameLibraryFile(selectedFile, cleanName);
      const nextFiles = files.map((file) => (file.id === renamed.id ? renamed : file));
      setFiles(nextFiles);
      setSelectedFile(renamed);
      setIsRenameVisible(false);
      setRenameNotice(`已重命名为 ${renamed.fileName}`);
      feedback("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "文件可能正在被其他应用使用，或设备存储空间不足。";
      Alert.alert("重命名未完成", message);
    } finally {
      setIsRenaming(false);
    }
  }, [files, renameDraft, selectedFile]);

  if (selectedFile) {
    const rawPreviewUri = rawPreviewState.fileId === selectedFile.id ? rawPreviewState.uri : null;
    const isRawPreviewLoading = selectedFile.kind === "raw" && rawPreviewState.status === "loading";
    const canRenderImage = (selectedFile.kind === "image" && !imageFailed) || Boolean(rawPreviewUri);
    return (
      <GestureDetector gesture={edgeBackGesture}>
        <Animated.View style={[styles.flexFill, detailAnimatedStyle]}>
      <ScreenContainer className="flex-1" containerClassName="bg-background">
        <StatusBar barStyle="light-content" />
        <View style={styles.detailHeader}>
          <Pressable onPress={closeDetail} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} accessibilityLabel="返回文件库">
            <MaterialIcons name="arrow-back" size={24} color="#F4F1EA" />
          </Pressable>
          <Text style={styles.detailTitle} numberOfLines={1}>文件预览</Text>
          <Pressable onPress={() => setIsSupportVisible(true)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} accessibilityLabel="查看支持格式">
            <MaterialIcons name="info-outline" size={24} color="#AAB4BE" />
          </Pressable>
        </View>

        <View style={styles.previewArea}>
          {canRenderImage ? (
            <Image
              source={{ uri: rawPreviewUri ?? selectedFile.uri }}
              style={styles.previewImage}
              contentFit="contain"
              onError={() => setImageFailed(true)}
            />
          ) : isRawPreviewLoading ? (
            <View style={styles.rawPreview}>
              <ActivityIndicator size="large" color="#D7983D" />
              <Text style={styles.rawPreviewTitle}>正在解码 RAW 文件</Text>
              <Text style={styles.rawPreviewText}>首次预览会在设备本地生成 PNG 缓存，完成后将直接显示图像。</Text>
            </View>
          ) : (
            <View style={styles.rawPreview}>
              <View style={styles.rawPreviewIcon}>
                <MaterialIcons name={selectedFile.kind === "raw" ? "camera" : "broken-image"} size={42} color="#D7983D" />
              </View>
              <Text style={styles.rawPreviewTitle}>{selectedFile.kind === "raw" ? `${selectedFile.brand} RAW` : "无法渲染预览"}</Text>
              <Text style={styles.rawPreviewText}>
                {selectedFile.kind === "raw"
                  ? rawPreviewState.message ?? "解码器未能生成预览图。"
                  : "设备无法解码此图像，但文件仍安全保存在图库中。"}
              </Text>
              {selectedFile.kind === "raw" && (
                <Pressable onPress={() => setRawPreviewRetry((value) => value + 1)} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
                  <MaterialIcons name="refresh" size={18} color="#F4D298" />
                  <Text style={styles.retryButtonText}>重新解码</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        <View style={styles.detailSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.fileTitleRow}>
            <View style={styles.titleTextBox}>
              <Text style={styles.fileName} numberOfLines={2}>{selectedFile.fileName}</Text>
              <Text style={styles.fileMeta}>{selectedFile.brand} · {formatBytes(selectedFile.size)}</Text>
            </View>
            <View style={styles.formatPill}><Text style={styles.formatPillText}>{fileBadge(selectedFile)}</Text></View>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>格式</Text>
            <Text style={styles.infoValue}>.{selectedFile.extension.toUpperCase()}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>导入方式</Text>
            <Text style={styles.infoValue}>本地副本</Text>
          </View>
          {renameNotice && (
            <View style={styles.renameNotice}>
              <MaterialIcons name="check-circle" size={17} color="#69C99A" />
              <Text style={styles.renameNoticeText} numberOfLines={1}>{renameNotice}</Text>
            </View>
          )}
          <View style={styles.backHintRow}>
            <MaterialIcons name="swipe-right" size={16} color="#7E8B95" />
            <Text style={styles.backHintText}>向右侧滑可返回文件库</Text>
          </View>
          <Pressable onPress={openRename} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
            <MaterialIcons name="drive-file-rename-outline" size={21} color="#11161C" />
            <Text style={styles.primaryButtonText}>重命名文件</Text>
          </Pressable>
        </View>

        <RenameModal
          visible={isRenameVisible}
          file={selectedFile}
          value={renameDraft}
          isSaving={isRenaming}
          onChangeText={setRenameDraft}
          onClear={() => setRenameDraft("")}
          onCancel={() => setIsRenameVisible(false)}
          onConfirm={confirmRename}
        />
        <SupportModal visible={isSupportVisible} onClose={() => setIsSupportVisible(false)} />
      </ScreenContainer>
        </Animated.View>
      </GestureDetector>
    );
  }

  return (
    <ScreenContainer className="flex-1" containerClassName="bg-background">
      <StatusBar barStyle="light-content" />
      <View style={styles.libraryHeader}>
        <View>
          <Text style={styles.kicker}>LOCAL PHOTO LIBRARY</Text>
          <Text style={styles.title}>RAW View</Text>
          <Text style={styles.subtitle}>浏览、整理并安全重命名相机文件</Text>
          <View style={styles.libraryStatusRow}>
            <MaterialIcons name="folder-open" size={14} color="#D7983D" />
            <Text style={styles.libraryStatusText}>已保存 {files.length} 个本地副本，其中 {rawFileCount} 个 RAW</Text>
          </View>
        </View>
        <Pressable onPress={() => setIsSupportVisible(true)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} accessibilityLabel="查看支持格式">
          <MaterialIcons name="info-outline" size={24} color="#AAB4BE" />
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => {
              feedback("light");
              setFilter(item.id);
            }}
            style={({ pressed }) => [styles.filterChip, filter === item.id && styles.filterChipActive, pressed && styles.pressed]}
          >
            <Text style={[styles.filterText, filter === item.id && styles.filterTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.centeredState}><ActivityIndicator color="#D7983D" /><Text style={styles.loadingText}>正在读取本地图库</Text></View>
      ) : (
        <FlatList
          data={filteredFiles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={filteredFiles.length === 0 ? styles.emptyList : styles.listContent}
          renderItem={({ item }) => (
            <Pressable onPress={() => openFile(item)} style={({ pressed }) => [styles.fileCard, pressed && styles.fileCardPressed]}>
              <FileThumbnail file={item} previewUri={rawPreviewCache.current[item.id]} />
              <View style={styles.fileCardContent}>
                <Text style={styles.fileCardName} numberOfLines={1}>{item.fileName}</Text>
                <Text style={styles.fileCardMeta}>{item.brand} · {formatBytes(item.size)}</Text>
                <View style={styles.fileCardFooter}>
                  <View style={styles.smallBadge}><Text style={styles.smallBadgeText}>{fileBadge(item)}</Text></View>
                  <Text style={styles.localCopyText}>本地副本</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#62717D" />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><MaterialIcons name="photo-library" size={36} color="#D7983D" /></View>
              <Text style={styles.emptyTitle}>还没有导入的文件</Text>
              <Text style={styles.emptyText}>从设备文件中选择相机 RAW、PNG 或 JPG 图片。导入后会在应用内保存一份本地副本。</Text>
            </View>
          }
        />
      )}

      <View style={styles.importDock}>
        <Pressable onPress={handleImport} disabled={isImporting} style={({ pressed }) => [styles.importButton, (pressed || isImporting) && styles.primaryButtonPressed]}>
          {isImporting ? <ActivityIndicator color="#11161C" /> : <MaterialIcons name="add-photo-alternate" size={22} color="#11161C" />}
          <Text style={styles.importButtonText}>{isImporting ? "正在导入…" : "导入文件"}</Text>
        </Pressable>
      </View>

      <SupportModal visible={isSupportVisible} onClose={() => setIsSupportVisible(false)} />
    </ScreenContainer>
  );
}

function RenameModal({
  visible,
  file,
  value,
  isSaving,
  onChangeText,
  onClear,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  file: LibraryFile;
  value: string;
  isSaving: boolean;
  onChangeText: (value: string) => void;
  onClear: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cleanName = sanitizeBaseName(value);
  const nextFileName = cleanName ? `${cleanName}.${file.extension}` : "";
  const isReady = Boolean(cleanName) && nextFileName !== file.fileName && !isSaving;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.modalTitle}>重命名文件</Text>
          <Text style={styles.modalDescription}>仅编辑名称部分，扩展名会保持为 .{file.extension.toUpperCase()}。</Text>
          <View style={styles.renameInputRow}>
            <TextInput
              value={value}
              onChangeText={onChangeText}
              autoFocus
              maxLength={96}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (isReady) onConfirm();
              }}
              style={styles.renameInput}
              placeholder="输入文件名"
              placeholderTextColor="#62717D"
              selectionColor="#D7983D"
            />
            {value.length > 0 && (
              <Pressable onPress={onClear} style={({ pressed }) => [styles.clearRenameButton, pressed && styles.pressed]} accessibilityLabel="清空文件名">
                <MaterialIcons name="close" size={17} color="#AAB4BE" />
              </Pressable>
            )}
            <Text style={styles.extensionSuffix}>.{file.extension}</Text>
          </View>
          <View style={styles.renamePreviewRow}>
            <MaterialIcons name="drive-file-rename-outline" size={16} color="#8D9AA4" />
            <Text style={styles.renamePreviewLabel}>将保存为</Text>
            <Text style={styles.renamePreviewName} numberOfLines={1}>{nextFileName || "请输入有效名称"}</Text>
          </View>
          <Text style={styles.renameHelperText}>会优先改名原始文件；若来源不允许写入，至少会更新应用内的本地副本。</Text>
          <View style={styles.modalActions}>
            <Pressable onPress={onCancel} disabled={isSaving} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>取消</Text></Pressable>
            <Pressable onPress={onConfirm} disabled={!isReady} style={({ pressed }) => [styles.confirmButton, !isReady && styles.confirmButtonDisabled, (pressed || isSaving) && isReady && styles.primaryButtonPressed]}>
              {isSaving ? <ActivityIndicator color="#11161C" /> : <Text style={styles.confirmButtonText}>确认重命名</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SupportModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.supportCard}>
          <View style={styles.supportTitleRow}>
            <View><Text style={styles.modalTitle}>支持格式</Text><Text style={styles.modalDescription}>导入时自动识别相机品牌与文件类别。</Text></View>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><MaterialIcons name="close" size={21} color="#F4F1EA" /></Pressable>
          </View>
          <View style={styles.supportList}>
            {supportedFormats.map(([brand, format]) => (
              <View key={brand} style={styles.supportRow}><Text style={styles.supportBrand}>{brand}</Text><Text style={styles.supportFormat}>{format}</Text></View>
            ))}
          </View>
          <View style={styles.noticeBox}>
            <MaterialIcons name="info-outline" size={18} color="#D7983D" />
            <Text style={styles.noticeText}>PNG、JPG 与 JPEG 可直接预览。RAW 文件会在 Android 原生构建中解码并生成设备本地 PNG 缓存；Expo Go 不包含该原生解码器。</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1 },
  libraryHeader: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kicker: { color: "#D7983D", fontSize: 10, letterSpacing: 1.6, fontWeight: "700", marginBottom: 5 },
  title: { color: "#F4F1EA", fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: "#AAB4BE", fontSize: 13, lineHeight: 19, marginTop: 4 },
  libraryStatusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 },
  libraryStatusText: { color: "#7F8E99", fontSize: 11, lineHeight: 16, fontWeight: "600" },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#1B242D" },
  pressed: { opacity: 0.68 },
  filterRow: { paddingHorizontal: 22, flexDirection: "row", gap: 8, marginBottom: 14 },
  filterChip: { height: 34, borderRadius: 17, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderColor: "#33414C", backgroundColor: "#1B242D" },
  filterChipActive: { borderColor: "#D7983D", backgroundColor: "#382D20" },
  filterText: { color: "#AAB4BE", fontSize: 12, fontWeight: "700" },
  filterTextActive: { color: "#F4D298" },
  listContent: { paddingHorizontal: 16, paddingBottom: 110, gap: 10 },
  emptyList: { flexGrow: 1, paddingHorizontal: 28, paddingBottom: 110, justifyContent: "center" },
  fileCard: { minHeight: 82, borderRadius: 18, backgroundColor: "#1B242D", padding: 10, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#26333E" },
  fileCardPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  thumbnail: { width: 60, height: 60, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbnailImage: { width: 60, height: 60, borderRadius: 12, backgroundColor: "#11161C" },
  rawThumbnail: { backgroundColor: "#121A21", borderWidth: 1, borderColor: "#394855" },
  rawThumbText: { color: "#F4D298", marginTop: 3, fontSize: 9, fontWeight: "800" },
  fileCardContent: { flex: 1, marginLeft: 12, justifyContent: "center", minWidth: 0 },
  fileCardName: { color: "#F4F1EA", fontSize: 15, lineHeight: 20, fontWeight: "700" },
  fileCardMeta: { color: "#AAB4BE", fontSize: 12, lineHeight: 17, marginTop: 2 },
  fileCardFooter: { flexDirection: "row", alignItems: "center", marginTop: 7, gap: 8 },
  smallBadge: { borderRadius: 5, backgroundColor: "#303A43", paddingHorizontal: 6, paddingVertical: 2 },
  smallBadgeText: { color: "#D5DCE3", fontSize: 9, letterSpacing: 0.5, fontWeight: "800" },
  localCopyText: { color: "#71808B", fontSize: 10, fontWeight: "600" },
  emptyState: { alignItems: "center", alignSelf: "center", maxWidth: 300 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, justifyContent: "center", alignItems: "center", backgroundColor: "#1B242D", borderWidth: 1, borderColor: "#33414C", marginBottom: 16 },
  emptyTitle: { color: "#F4F1EA", fontSize: 18, lineHeight: 24, fontWeight: "800", marginBottom: 6 },
  emptyText: { color: "#AAB4BE", textAlign: "center", fontSize: 13, lineHeight: 20 },
  centeredState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: "#AAB4BE", fontSize: 13 },
  importDock: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#11161C", paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#26333E" },
  importButton: { height: 52, borderRadius: 16, backgroundColor: "#D7983D", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  importButtonText: { color: "#11161C", fontSize: 15, fontWeight: "800" },
  detailHeader: { height: 64, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  detailTitle: { color: "#F4F1EA", fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
  previewArea: { flex: 1, marginHorizontal: 16, marginBottom: 12, backgroundColor: "#0C1115", borderRadius: 22, borderWidth: 1, borderColor: "#24313B", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  previewImage: { width: "100%", height: "100%" },
  rawPreview: { alignItems: "center", paddingHorizontal: 34, maxWidth: 360 },
  rawPreviewIcon: { width: 82, height: 82, borderRadius: 41, borderWidth: 1, borderColor: "#675233", backgroundColor: "#231F18", justifyContent: "center", alignItems: "center", marginBottom: 16 },
  rawPreviewTitle: { color: "#F4F1EA", fontSize: 20, lineHeight: 26, fontWeight: "800", marginBottom: 8 },
  rawPreviewText: { color: "#AAB4BE", textAlign: "center", fontSize: 13, lineHeight: 20 },
  retryButton: { marginTop: 18, minHeight: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: "#71582F", backgroundColor: "#382D20", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  retryButtonText: { color: "#F4D298", fontSize: 13, fontWeight: "800" },
  detailSheet: { backgroundColor: "#1B242D", borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingBottom: 18, paddingTop: 9, borderTopWidth: 1, borderColor: "#2B3944" },
  sheetHandle: { height: 4, width: 38, borderRadius: 2, backgroundColor: "#52616E", alignSelf: "center", marginBottom: 16 },
  fileTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  titleTextBox: { flex: 1 },
  fileName: { color: "#F4F1EA", fontSize: 17, lineHeight: 23, fontWeight: "800" },
  fileMeta: { color: "#AAB4BE", fontSize: 12, marginTop: 4 },
  formatPill: { borderRadius: 8, backgroundColor: "#3A3021", borderWidth: 1, borderColor: "#71582F", paddingVertical: 5, paddingHorizontal: 8 },
  formatPillText: { color: "#F4D298", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  infoDivider: { height: 1, backgroundColor: "#32414B", marginTop: 17, marginBottom: 9 },
  infoRow: { minHeight: 26, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoLabel: { color: "#AAB4BE", fontSize: 12 },
  infoValue: { color: "#E6E9E9", fontSize: 12, fontWeight: "700" },
  renameNotice: { marginTop: 10, minHeight: 34, borderRadius: 10, paddingHorizontal: 10, backgroundColor: "#19352C", flexDirection: "row", alignItems: "center", gap: 7 },
  renameNoticeText: { flex: 1, color: "#BFE8D0", fontSize: 11, lineHeight: 16, fontWeight: "700" },
  backHintRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 8 },
  backHintText: { color: "#7E8B95", fontSize: 11, lineHeight: 16 },
  primaryButton: { marginTop: 15, height: 50, borderRadius: 15, backgroundColor: "#D7983D", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryButtonText: { color: "#11161C", fontSize: 14, fontWeight: "800" },
  primaryButtonPressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(4, 7, 10, 0.72)", justifyContent: "flex-end" },
  bottomSheet: { backgroundColor: "#1B242D", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingBottom: 28, paddingTop: 9, borderTopWidth: 1, borderColor: "#394955" },
  modalTitle: { color: "#F4F1EA", fontSize: 19, lineHeight: 25, fontWeight: "800" },
  modalDescription: { color: "#AAB4BE", fontSize: 12, lineHeight: 18, marginTop: 5 },
  renameInputRow: { marginTop: 20, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: "#586976", backgroundColor: "#11161C", flexDirection: "row", alignItems: "center", paddingHorizontal: 14 },
  renameInput: { flex: 1, color: "#F4F1EA", fontSize: 15, paddingVertical: 12, minWidth: 0 },
  clearRenameButton: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#26333E" },
  extensionSuffix: { color: "#D7983D", fontSize: 14, fontWeight: "700", marginLeft: 8 },
  renamePreviewRow: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  renamePreviewLabel: { color: "#8D9AA4", fontSize: 11, fontWeight: "600" },
  renamePreviewName: { flex: 1, color: "#E9D0A4", fontSize: 12, lineHeight: 17, fontWeight: "800" },
  renameHelperText: { color: "#7F8E99", fontSize: 11, lineHeight: 16, marginTop: 8 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  secondaryButton: { height: 48, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: "#4D5C67" },
  secondaryButtonText: { color: "#E3E7E8", fontSize: 14, fontWeight: "800" },
  confirmButton: { height: 48, flex: 1.6, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#D7983D" },
  confirmButtonDisabled: { opacity: 0.42 },
  confirmButtonText: { color: "#11161C", fontSize: 14, fontWeight: "800" },
  supportCard: { marginHorizontal: 20, marginBottom: 26, borderRadius: 22, backgroundColor: "#1B242D", padding: 20, borderWidth: 1, borderColor: "#394955" },
  supportTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 16 },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#11161C" },
  supportList: { marginTop: 18, borderTopWidth: 1, borderTopColor: "#32414B" },
  supportRow: { minHeight: 38, borderBottomWidth: 1, borderBottomColor: "#32414B", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  supportBrand: { color: "#E8EBEC", fontSize: 13, fontWeight: "700" },
  supportFormat: { color: "#D7983D", fontSize: 12, fontWeight: "800" },
  noticeBox: { marginTop: 16, flexDirection: "row", gap: 9, padding: 12, borderRadius: 12, backgroundColor: "#231F18" },
  noticeText: { flex: 1, color: "#C2C9CE", fontSize: 11, lineHeight: 16 },
});
