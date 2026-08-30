import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenContainer } from "@/components/screen-container";
import {
  DEFAULT_AI_SETTINGS,
  loadAiSettings,
  saveAiSettings,
  testAiConnection,
  type StoredAiSettings,
} from "@/lib/ai-image";

export default function AiSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<StoredAiSettings>({
    ...DEFAULT_AI_SETTINGS,
    apiKey: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"success" | "error">(
    "success",
  );

  useEffect(() => {
    let active = true;
    void loadAiSettings().then((stored) => {
      if (active) {
        setSettings(stored);
        setIsLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const update = <K extends keyof StoredAiSettings>(
    key: K,
    value: StoredAiSettings[K],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      await saveAiSettings(settings);
      setFeedbackKind("success");
      setFeedback("AI 服务配置已保存。API Key 仅保存在本机安全存储中。");
    } catch (error) {
      setFeedbackKind("error");
      setFeedback(
        error instanceof Error ? error.message : "配置保存失败，请重试。",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setFeedback(null);
    try {
      const result = await testAiConnection(settings);
      setFeedbackKind("success");
      setFeedback(
        result.models.length > 0
          ? `连接成功，读取到 ${result.models.length} 个模型。`
          : "连接成功，但服务未返回模型列表；仍可尝试图像编辑。",
      );
    } catch (error) {
      setFeedbackKind("error");
      setFeedback(
        error instanceof Error ? error.message : "连接测试失败，请检查配置。 ",
      );
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator color="#D7983D" />
        <Text style={styles.loadingText}>正在读取 AI 配置</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <Stack.Screen options={{ gestureEnabled: true }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: Math.max(insets.top, 14) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="返回详情"
            >
              <Text style={styles.backButtonText}>‹</Text>
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>AI IMAGE TOOLS</Text>
              <Text style={styles.title}>AI 修图服务</Text>
              <Text style={styles.subtitle}>
                连接你自己的 OpenAI-compatible 图像接口
              </Text>
            </View>
          </View>

          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>先配置，再开始编辑</Text>
            <Text style={styles.noticeText}>
              RAW View 只把普通 PNG、JPG 或 JPEG 发送到你填写的服务，RAW
              文件保持只读。原图不会被覆盖，AI 结果会另存为图库新副本。
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>服务连接</Text>
            <Text style={styles.label}>API 地址</Text>
            <TextInput
              value={settings.baseUrl}
              onChangeText={(value) => update("baseUrl", value)}
              placeholder="https://example.com/v1"
              placeholderTextColor="#687985"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.input}
            />
            <Text style={styles.helper}>
              可填写带或不带 /v1 的地址，应用会自动补齐；公网服务建议使用
              HTTPS，局域网服务可使用 HTTP。
            </Text>

            <Text style={styles.label}>API Key</Text>
            <TextInput
              value={settings.apiKey}
              onChangeText={(value) => update("apiKey", value)}
              placeholder="sk-…"
              placeholderTextColor="#687985"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.input}
            />
            <Text style={styles.helper}>
              Android 使用 Keystore 加密保存；请求会直接发送至上述第三方服务。
            </Text>

            <Text style={styles.label}>图像模型</Text>
            <TextInput
              value={settings.model}
              onChangeText={(value) => update("model", value)}
              placeholder="例如 gpt-image-1"
              placeholderTextColor="#687985"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />

            <View style={styles.endpointHint}>
              <Text style={styles.endpointHintLabel}>当前图像编辑接口</Text>
              <Text style={styles.endpointHintValue}>
                POST /v1/images/edits
              </Text>
            </View>
            <Text style={styles.helper}>
              服务需要兼容 OpenAI 图像编辑请求，并返回图片 URL 或 Base64
              图片数据。
            </Text>
          </View>

          {feedback && (
            <View
              style={[
                styles.feedback,
                feedbackKind === "error"
                  ? styles.feedbackError
                  : styles.feedbackSuccess,
              ]}
            >
              <Text style={styles.feedbackText}>{feedback}</Text>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable
              onPress={() => void handleTest()}
              disabled={isTesting || isSaving}
              style={({ pressed }) => [
                styles.secondaryButton,
                (isTesting || isSaving) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {isTesting ? (
                <ActivityIndicator size="small" color="#C5E5FA" />
              ) : (
                <Text style={styles.secondaryButtonText}>测试连接</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => void handleSave()}
              disabled={isSaving || isTesting}
              style={({ pressed }) => [
                styles.primaryButton,
                (isSaving || isTesting) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#11161C" />
              ) : (
                <Text style={styles.primaryButtonText}>保存配置</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.disclaimer}>
            使用第三方 API
            可能产生费用，并会将图片内容传输给对应服务商。请在使用前确认服务商的隐私政策与数据保留规则。
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 22, paddingBottom: 34 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 22,
  },
  headerCopy: { flex: 1 },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#202C36",
    borderWidth: 1,
    borderColor: "#394955",
  },
  backButtonText: {
    color: "#F4D298",
    fontSize: 34,
    lineHeight: 37,
    marginTop: -4,
  },
  eyebrow: {
    color: "#D7983D",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.7,
  },
  title: {
    color: "#F4F1EA",
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: { color: "#9CAAB5", fontSize: 13, lineHeight: 19, marginTop: 4 },
  noticeCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: "#2C241A",
    borderWidth: 1,
    borderColor: "#725932",
    marginBottom: 20,
  },
  noticeTitle: { color: "#F4D298", fontSize: 14, fontWeight: "900" },
  noticeText: { color: "#D8C6A7", fontSize: 12, lineHeight: 19, marginTop: 6 },
  section: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: "#1B242D",
    borderWidth: 1,
    borderColor: "#344551",
  },
  sectionTitle: {
    color: "#F4F1EA",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 14,
  },
  label: {
    color: "#D9E0E4",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 7,
  },
  input: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4C5D69",
    backgroundColor: "#11161C",
    paddingHorizontal: 13,
    color: "#F4F1EA",
    fontSize: 13,
  },
  helper: { color: "#7F909B", fontSize: 11, lineHeight: 16, marginTop: 6 },
  endpointHint: {
    marginTop: 14,
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 10,
    backgroundColor: "#172633",
    borderWidth: 1,
    borderColor: "#315069",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  endpointHintLabel: { color: "#AAB4BE", fontSize: 11, fontWeight: "700" },
  endpointHintValue: { color: "#C5E5FA", fontSize: 11, fontWeight: "900" },
  feedback: { marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1 },
  feedbackSuccess: { backgroundColor: "#19352C", borderColor: "#386B55" },
  feedbackError: { backgroundColor: "#3B2525", borderColor: "#7C4444" },
  feedbackText: {
    color: "#D9EAE0",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#315069",
    backgroundColor: "#172633",
  },
  secondaryButtonText: { color: "#C5E5FA", fontSize: 13, fontWeight: "900" },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D7983D",
  },
  primaryButtonText: { color: "#11161C", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  disclaimer: {
    color: "#71808C",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 18,
    paddingHorizontal: 3,
  },
  loadingText: { color: "#9CAAB5", fontSize: 13, marginTop: 12 },
});
