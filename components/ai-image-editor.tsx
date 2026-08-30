import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

import {
  createAiEditedLibraryCopy,
  loadAiSettings,
  type StoredAiSettings,
} from "@/lib/ai-image";
import type { LibraryFile } from "@/lib/raw-files";

const PRESETS = [
  "自然提亮并校正白平衡，保留真实细节",
  "降低噪点并提升清晰度，不改变主体内容",
  "移除背景中的杂物，保持主体和光线自然",
  "调整为低饱和胶片色调，保留高光和阴影细节",
];

type AiImageEditorProps = {
  visible: boolean;
  file: LibraryFile;
  onClose: () => void;
  onConfigure: () => void;
  onComplete: (file: LibraryFile) => void;
};

export function AiImageEditor({
  visible,
  file,
  onClose,
  onConfigure,
  onComplete,
}: AiImageEditorProps) {
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<StoredAiSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setError(null);
    setIsLoadingSettings(true);
    void loadAiSettings().then((stored) => {
      if (active) {
        setSettings(stored);
        setIsLoadingSettings(false);
      }
    });
    return () => {
      active = false;
    };
  }, [visible]);

  const handleEdit = async () => {
    if (!settings || !prompt.trim()) {
      setError("请先配置 AI 服务并描述希望修改的内容。");
      return;
    }
    setIsEditing(true);
    setError(null);
    try {
      const editedFile = await createAiEditedLibraryCopy(
        file,
        prompt,
        settings,
      );
      onComplete(editedFile);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "AI 修图失败，请检查服务配置后重试。",
      );
    } finally {
      setIsEditing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => !isEditing && onClose()}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.heading}>
            <View style={styles.headingCopy}>
              <Text style={styles.eyebrow}>AI EDIT</Text>
              <Text style={styles.title}>AI 修图</Text>
              <Text style={styles.description}>
                用文字描述修改内容，结果会另存为新的应用本地副本。
              </Text>
            </View>
            <View style={styles.iconCircle}>
              <MaterialIcons name="auto-awesome" size={21} color="#F4D298" />
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.protectionCard}>
              <MaterialIcons name="verified-user" size={18} color="#82D5AF" />
              <Text style={styles.protectionText}>
                仅处理 PNG、JPG、JPEG；原图不会覆盖。图片会上传到你配置的第三方
                API，请确认服务商的数据政策。
              </Text>
            </View>

            {isLoadingSettings ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#D7983D" />
                <Text style={styles.loadingText}>正在读取服务配置</Text>
              </View>
            ) : !settings?.baseUrl || !settings.model || !settings.apiKey ? (
              <View style={styles.configureCard}>
                <MaterialIcons name="cloud-off" size={24} color="#F4D298" />
                <View style={styles.configureCopy}>
                  <Text style={styles.configureTitle}>还没有配置 AI 服务</Text>
                  <Text style={styles.configureText}>
                    先填写 API 地址、Key 和图像模型，才能开始修图。
                  </Text>
                </View>
                <Pressable
                  onPress={onConfigure}
                  style={({ pressed }) => [
                    styles.configureButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.configureButtonText}>去配置</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.readyRow}>
                <MaterialIcons name="cloud-done" size={18} color="#82D5AF" />
                <Text style={styles.readyText} numberOfLines={1}>
                  已连接：{settings.model}
                </Text>
                <Pressable onPress={onConfigure} style={styles.changeButton}>
                  <Text style={styles.changeButtonText}>修改</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.sectionLabel}>常用操作</Text>
            <View style={styles.presetGrid}>
              {PRESETS.map((preset) => (
                <Pressable
                  key={preset}
                  onPress={() => {
                    setPrompt(preset);
                    setError(null);
                  }}
                  style={({ pressed }) => [
                    styles.preset,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.presetText}>{preset}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionLabel}>编辑描述</Text>
            <TextInput
              value={prompt}
              onChangeText={(value) => {
                setPrompt(value);
                setError(null);
              }}
              placeholder="例如：把天空改成日落橙色，但保持建筑和人物不变"
              placeholderTextColor="#71808C"
              multiline
              textAlignVertical="top"
              maxLength={600}
              style={styles.promptInput}
            />
            <Text style={styles.counter}>{prompt.length}/600</Text>

            {error && (
              <View style={styles.errorCard}>
                <MaterialIcons name="error-outline" size={18} color="#F0A6A0" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              disabled={isEditing}
              style={({ pressed }) => [
                styles.cancelButton,
                isEditing && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleEdit()}
              disabled={isEditing || isLoadingSettings || !prompt.trim()}
              style={({ pressed }) => [
                styles.submitButton,
                (isEditing || isLoadingSettings || !prompt.trim()) &&
                  styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {isEditing ? (
                <ActivityIndicator size="small" color="#11161C" />
              ) : (
                <>
                  <MaterialIcons
                    name="auto-fix-high"
                    size={18}
                    color="#11161C"
                  />
                  <Text style={styles.submitText}>生成新副本</Text>
                </>
              )}
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
    backgroundColor: "rgba(4, 7, 10, 0.76)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "92%",
    backgroundColor: "#1B242D",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 9,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: "#725932",
  },
  handle: {
    height: 4,
    width: 38,
    borderRadius: 2,
    backgroundColor: "#52616E",
    alignSelf: "center",
    marginBottom: 16,
  },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  headingCopy: { flex: 1 },
  eyebrow: {
    color: "#D7983D",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  title: {
    color: "#F4F1EA",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    marginTop: 3,
  },
  description: { color: "#AAB4BE", fontSize: 12, lineHeight: 18, marginTop: 5 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3A3021",
    borderWidth: 1,
    borderColor: "#71582F",
  },
  scroll: { marginTop: 15 },
  content: { paddingBottom: 8 },
  protectionCard: {
    borderRadius: 13,
    backgroundColor: "#19352C",
    borderWidth: 1,
    borderColor: "#386B55",
    padding: 11,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  protectionText: {
    flex: 1,
    color: "#BFE8D0",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "700",
  },
  loadingRow: {
    minHeight: 62,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
  },
  loadingText: { color: "#AAB4BE", fontSize: 12 },
  configureCard: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: "#382D20",
    borderWidth: 1,
    borderColor: "#71582F",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  configureCopy: { flex: 1 },
  configureTitle: { color: "#F4D298", fontSize: 13, fontWeight: "900" },
  configureText: {
    color: "#D8C6A7",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  configureButton: {
    minHeight: 36,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: "#D7983D",
    alignItems: "center",
    justifyContent: "center",
  },
  configureButtonText: { color: "#11161C", fontSize: 12, fontWeight: "900" },
  readyRow: {
    marginTop: 12,
    minHeight: 42,
    borderRadius: 12,
    paddingHorizontal: 11,
    backgroundColor: "#19352C",
    borderWidth: 1,
    borderColor: "#386B55",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  readyText: { flex: 1, color: "#BFE8D0", fontSize: 12, fontWeight: "700" },
  changeButton: { paddingHorizontal: 8, paddingVertical: 5 },
  changeButtonText: { color: "#82D5AF", fontSize: 11, fontWeight: "900" },
  sectionLabel: {
    color: "#D9E0E4",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 16,
    marginBottom: 8,
  },
  presetGrid: { gap: 8 },
  preset: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#4C5D69",
    backgroundColor: "#11161C",
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  presetText: { color: "#C8D0D5", fontSize: 12, lineHeight: 17 },
  promptInput: {
    minHeight: 104,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#4C5D69",
    backgroundColor: "#11161C",
    padding: 12,
    color: "#F4F1EA",
    fontSize: 13,
    lineHeight: 19,
  },
  counter: { color: "#71808C", fontSize: 10, textAlign: "right", marginTop: 5 },
  errorCard: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: "#3B2525",
    borderWidth: 1,
    borderColor: "#7C4444",
    padding: 11,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: "#F0C0BC",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "700",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  cancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#4C5D69",
    backgroundColor: "#11161C",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: "#C5CDD2", fontSize: 13, fontWeight: "900" },
  submitButton: {
    flex: 1.35,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#D7983D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  submitText: { color: "#11161C", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
