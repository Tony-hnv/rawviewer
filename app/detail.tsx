import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { ScreenContainer } from "@/components/screen-container";
import { ZoomableImage } from "@/components/zoomable-image";
import { exportLibraryFile, loadLibrary, renameLibraryFile } from "@/lib/photo-library";
import { createRawPreview } from "@/lib/raw-preview";
import { type LibraryFile, formatBytes, sanitizeBaseName } from "@/lib/raw-files";

type PreviewState = { status: "idle" | "loading" | "ready" | "failed"; uri: string | null; message: string | null };

function hapticSuccess() {
  if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [file, setFile] = useState<LibraryFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRenameVisible, setIsRenameVisible] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle", uri: null, message: null });
  const [retryCount, setRetryCount] = useState(0);
  const translateX = useSharedValue(0);

  const refreshFile = useCallback(async () => {
    const files = await loadLibrary();
    const nextFile = files.find((entry) => entry.id === id) ?? null;
    setFile(nextFile);
    setIsLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => {
    void refreshFile();
  }, [refreshFile]));

  const returnToPreviousView = useCallback(() => {
    translateX.value = 0;
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router, translateX]);

  const edgeBackGesture = useMemo(() => Gesture.Pan()
    .hitSlop({ left: 0, width: 34 })
    .activeOffsetX(16)
    .failOffsetY([-22, 22])
    .onUpdate((event) => { translateX.value = Math.max(0, event.translationX); })
    .onEnd((event) => {
      const shouldGoBack = event.translationX > 84 || event.velocityX > 850;
      if (shouldGoBack) {
        translateX.value = withTiming(420, { duration: 180 }, (finished) => {
          if (finished) runOnJS(returnToPreviousView)();
        });
      } else {
        translateX.value = withTiming(0, { duration: 160 });
      }
    }), [returnToPreviousView, translateX]);

  const pageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  useFocusEffect(useCallback(() => {
    if (!file || file.kind !== "raw") {
      setPreview({ status: "idle", uri: null, message: null });
      return;
    }
    let active = true;
    const requestAttempt = retryCount;
    setPreview({ status: "loading", uri: null, message: null });
    void createRawPreview(file.uri)
      .then((uri) => active && requestAttempt === retryCount && setPreview({ status: "ready", uri, message: null }))
      .catch((error: unknown) => active && requestAttempt === retryCount && setPreview({ status: "failed", uri: null, message: error instanceof Error ? error.message : "RAW 解码失败。" }));
    return () => { active = false; };
  }, [file, retryCount]));

  const openRename = useCallback(() => {
    if (!file) return;
    setDraft(file.baseName);
    setIsRenameVisible(true);
  }, [file]);

  const confirmRename = useCallback(async () => {
    if (!file) return;
    const cleanName = sanitizeBaseName(draft);
    if (!cleanName) return;
    setIsSaving(true);
    try {
      const outcome = await renameLibraryFile(file, cleanName);
      setFile(outcome.file);
      setIsRenameVisible(false);
      setNotice(outcome.sourceRenamed ? `已同步改名：${outcome.file.fileName}` : `已改本地副本：${outcome.file.fileName}`);
      hapticSuccess();
    } catch (error) {
      Alert.alert("重命名未保存", error instanceof Error ? error.message : "请确认文件未被其他应用占用后重试。");
    } finally {
      setIsSaving(false);
    }
  }, [draft, file]);

  const handleExport = useCallback(async () => {
    if (!file) return;
    setIsExporting(true);
    try {
      const exportedUri = await exportLibraryFile(file);
      if (exportedUri) {
        setNotice(`已导出副本：${file.fileName}`);
        hapticSuccess();
      }
    } catch (error) {
      Alert.alert("导出未完成", error instanceof Error ? error.message : "无法将本地副本导出到所选文件夹。");
    } finally {
      setIsExporting(false);
    }
  }, [file]);

  if (isLoading) {
    return <ScreenContainer className="items-center justify-center"><ActivityIndicator color="#D7983D" /><Text style={styles.loadingText}>正在读取文件</Text></ScreenContainer>;
  }

  if (!file) {
    return <ScreenContainer className="items-center justify-center px-7"><MaterialIcons name="folder-off" size={42} color="#D7983D" /><Text style={styles.missingTitle}>文件已不可用</Text><Text style={styles.missingText}>该文件可能已被移除。请返回文件库后重新导入。</Text><Pressable onPress={returnToPreviousView} style={styles.backButton}><Text style={styles.backButtonText}>返回文件库</Text></Pressable></ScreenContainer>;
  }

  const isImage = file.kind === "image";
  const canRender = isImage || preview.status === "ready";
  const cleanDraft = sanitizeBaseName(draft);
  const proposedName = cleanDraft ? `${cleanDraft}.${file.extension}` : "";
  const canConfirm = Boolean(cleanDraft) && proposedName !== file.fileName && !isSaving;
  const renameStatusText = file.renameSyncStatus === "original_and_copy"
    ? "已改本地副本和原文件"
    : file.renameSyncStatus === "copy_only"
      ? "已改本地副本 / 原文件未改"
      : "当前管理应用本地副本";

  return (
    <GestureDetector gesture={edgeBackGesture}>
      <Animated.View style={[styles.flex, pageStyle]}>
        <ScreenContainer className="flex-1" containerClassName="bg-background">
          <Stack.Screen options={{ title: "文件预览", headerShown: false, gestureEnabled: true }} />
          <StatusBar barStyle="light-content" />
          <View style={styles.header}>
            <Pressable onPress={returnToPreviousView} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={25} color="#F4F1EA" /></Pressable>
            <Text style={styles.headerTitle}>文件预览</Text>
            <View style={styles.roundButton}><MaterialIcons name="swipe-right" size={22} color="#AAB4BE" /></View>
          </View>

          <View style={styles.previewArea}>
            {canRender ? <ZoomableImage uri={isImage ? file.uri : preview.uri ?? ""} /> : preview.status === "loading" ? <View style={styles.centered}><ActivityIndicator size="large" color="#D7983D" /><Text style={styles.previewTitle}>正在解码 RAW 文件</Text><Text style={styles.previewText}>首次预览会生成设备本地缓存。</Text></View> : <View style={styles.centered}><View style={styles.rawIcon}><MaterialIcons name="camera" size={42} color="#D7983D" /></View><Text style={styles.previewTitle}>{file.brand} RAW</Text><Text style={styles.previewText}>{preview.message ?? "无法生成预览图。"}</Text><Pressable onPress={() => setRetryCount((value) => value + 1)} style={styles.retryButton}><MaterialIcons name="refresh" size={18} color="#F4D298" /><Text style={styles.retryText}>重新解码</Text></Pressable></View>}
          </View>

          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.titleRow}><View style={styles.titleBox}><Text style={styles.fileName} numberOfLines={2}>{file.fileName}</Text><Text style={styles.fileMeta}>{file.brand} · {formatBytes(file.size)}</Text></View><View style={styles.badge}><Text style={styles.badgeText}>{file.kind === "raw" ? "RAW" : file.extension.toUpperCase()}</Text></View></View>
            <View style={[styles.syncStatus, file.renameSyncStatus === "original_and_copy" ? styles.syncStatusSynced : styles.syncStatusLocal]}><MaterialIcons name={file.renameSyncStatus === "original_and_copy" ? "sync" : "folder-copy"} size={16} color={file.renameSyncStatus === "original_and_copy" ? "#82D5AF" : "#F4D298"} /><Text style={styles.syncStatusText}>{renameStatusText}</Text></View>
            {notice && <View style={styles.notice}><MaterialIcons name="check-circle" size={17} color="#69C99A" /><Text style={styles.noticeText} numberOfLines={1}>{notice}</Text></View>}
            <View style={styles.hintRow}><MaterialIcons name="swipe-right" size={16} color="#7E8B95" /><Text style={styles.hintText}>从左侧边缘右滑，返回上一视图</Text></View>
            <View style={styles.fileActions}><Pressable onPress={handleExport} disabled={isExporting} style={({ pressed }) => [styles.exportButton, (pressed || isExporting) && styles.renameButtonPressed]}>{isExporting ? <ActivityIndicator size="small" color="#F4D298" /> : <MaterialIcons name="folder-open" size={19} color="#F4D298" />}<Text style={styles.exportButtonText}>{isExporting ? "正在导出" : "导出副本"}</Text></Pressable><Pressable onPress={openRename} style={({ pressed }) => [styles.renameButton, pressed && styles.renameButtonPressed]}><MaterialIcons name="drive-file-rename-outline" size={21} color="#11161C" /><Text style={styles.renameButtonText}>重命名</Text></Pressable></View>
          </View>

          <Modal visible={isRenameVisible} transparent animationType="slide" onRequestClose={() => setIsRenameVisible(false)}>
            <View style={styles.modalBackdrop}><View style={styles.modalSheet}><View style={styles.handle} /><Text style={styles.modalTitle}>重命名文件</Text><Text style={styles.modalDescription}>扩展名将保持为 .{file.extension.toUpperCase()}，确认后会验证文件库记录。</Text><View style={styles.inputRow}><TextInput value={draft} onChangeText={setDraft} autoFocus maxLength={96} returnKeyType="done" onSubmitEditing={() => canConfirm && confirmRename()} style={styles.input} placeholder="输入文件名" placeholderTextColor="#62717D" selectionColor="#D7983D" />{draft && <Pressable onPress={() => setDraft("")} style={styles.clearButton}><MaterialIcons name="close" size={17} color="#AAB4BE" /></Pressable>}<Text style={styles.extension}>.{file.extension}</Text></View><Text style={styles.saveAs}>将保存为：{proposedName || "请输入有效名称"}</Text><View style={styles.actions}><Pressable onPress={() => setIsRenameVisible(false)} disabled={isSaving} style={styles.cancelButton}><Text style={styles.cancelText}>取消</Text></Pressable><Pressable onPress={confirmRename} disabled={!canConfirm} style={[styles.confirmButton, !canConfirm && styles.confirmDisabled]}>{isSaving ? <ActivityIndicator color="#11161C" /> : <Text style={styles.confirmText}>确认并保存</Text>}</Pressable></View></View></View>
          </Modal>
        </ScreenContainer>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { height: 64, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { color: "#F4F1EA", fontSize: 16, fontWeight: "800" },
  roundButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#1B242D" },
  previewArea: { flex: 1, marginHorizontal: 16, marginBottom: 12, borderRadius: 22, backgroundColor: "#0C1115", borderWidth: 1, borderColor: "#24313B", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  centered: { alignItems: "center", paddingHorizontal: 32, maxWidth: 360 },
  rawIcon: { width: 82, height: 82, borderRadius: 41, borderWidth: 1, borderColor: "#675233", backgroundColor: "#231F18", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  previewTitle: { color: "#F4F1EA", fontSize: 20, lineHeight: 26, fontWeight: "800", marginTop: 16, marginBottom: 8 },
  previewText: { color: "#AAB4BE", textAlign: "center", fontSize: 13, lineHeight: 20 },
  retryButton: { marginTop: 18, minHeight: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: "#71582F", backgroundColor: "#382D20", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  retryText: { color: "#F4D298", fontSize: 13, fontWeight: "800" },
  sheet: { backgroundColor: "#1B242D", borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingBottom: 18, paddingTop: 9, borderTopWidth: 1, borderColor: "#2B3944" },
  handle: { height: 4, width: 38, borderRadius: 2, backgroundColor: "#52616E", alignSelf: "center", marginBottom: 16 },
  titleRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  titleBox: { flex: 1 },
  fileName: { color: "#F4F1EA", fontSize: 17, lineHeight: 23, fontWeight: "800" },
  fileMeta: { color: "#AAB4BE", fontSize: 12, marginTop: 4 },
  badge: { borderRadius: 8, backgroundColor: "#3A3021", borderWidth: 1, borderColor: "#71582F", paddingVertical: 5, paddingHorizontal: 8 },
  badgeText: { color: "#F4D298", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  notice: { minHeight: 34, marginTop: 12, borderRadius: 10, paddingHorizontal: 10, backgroundColor: "#19352C", flexDirection: "row", alignItems: "center", gap: 7 },
  noticeText: { flex: 1, color: "#BFE8D0", fontSize: 11, fontWeight: "700" },
  syncStatus: { minHeight: 32, marginTop: 12, borderRadius: 10, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 7 },
  syncStatusSynced: { backgroundColor: "#19352C" },
  syncStatusLocal: { backgroundColor: "#382D20" },
  syncStatusText: { color: "#F1E7D5", fontSize: 11, fontWeight: "700" },
  hintRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 12 },
  hintText: { color: "#7E8B95", fontSize: 11, lineHeight: 16 },
  fileActions: { marginTop: 15, flexDirection: "row", gap: 10 },
  renameButton: { height: 50, flex: 1.25, borderRadius: 15, backgroundColor: "#D7983D", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  exportButton: { height: 50, flex: 1, borderRadius: 15, borderWidth: 1, borderColor: "#71582F", backgroundColor: "#382D20", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  exportButtonText: { color: "#F4D298", fontSize: 13, fontWeight: "800" },
  renameButtonPressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  renameButtonText: { color: "#11161C", fontSize: 14, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(4, 7, 10, 0.72)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#1B242D", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingBottom: 28, paddingTop: 9, borderTopWidth: 1, borderColor: "#394955" },
  modalTitle: { color: "#F4F1EA", fontSize: 19, lineHeight: 25, fontWeight: "800" },
  modalDescription: { color: "#AAB4BE", fontSize: 12, lineHeight: 18, marginTop: 5 },
  inputRow: { marginTop: 20, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: "#586976", backgroundColor: "#11161C", flexDirection: "row", alignItems: "center", paddingHorizontal: 14 },
  input: { flex: 1, color: "#F4F1EA", fontSize: 15, paddingVertical: 12, minWidth: 0 },
  clearButton: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#26333E" },
  extension: { color: "#D7983D", fontSize: 14, fontWeight: "700", marginLeft: 8 },
  saveAs: { color: "#E9D0A4", fontSize: 12, lineHeight: 18, fontWeight: "700", marginTop: 10 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelButton: { height: 48, flex: 1, borderRadius: 14, borderWidth: 1, borderColor: "#4D5C67", alignItems: "center", justifyContent: "center" },
  cancelText: { color: "#E3E7E8", fontSize: 14, fontWeight: "800" },
  confirmButton: { height: 48, flex: 1.6, borderRadius: 14, backgroundColor: "#D7983D", alignItems: "center", justifyContent: "center" },
  confirmDisabled: { opacity: 0.42 },
  confirmText: { color: "#11161C", fontSize: 14, fontWeight: "800" },
  loadingText: { marginTop: 12, color: "#AAB4BE", fontSize: 13 },
  missingTitle: { color: "#F4F1EA", fontSize: 19, fontWeight: "800", marginTop: 15 },
  missingText: { color: "#AAB4BE", textAlign: "center", fontSize: 13, lineHeight: 20, marginTop: 6 },
  backButton: { marginTop: 20, height: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: "#D7983D", alignItems: "center", justifyContent: "center" },
  backButtonText: { color: "#11161C", fontWeight: "800" },
  pressed: { opacity: 0.68 },
});
