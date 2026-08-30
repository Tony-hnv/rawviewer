export type AiApiMode = "images_edits";

export type AiSettingsForValidation = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

export function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed}/v1`;
}

export function validateAiSettings(
  settings: AiSettingsForValidation,
): string | null {
  if (!settings.baseUrl.trim()) return "请输入 API 地址。";
  if (!settings.model.trim()) return "请输入图像模型名称。";
  if (!settings.apiKey.trim()) return "请输入 API Key。";
  try {
    const parsed = new URL(settings.baseUrl.trim());
    if (!["https:", "http:"].includes(parsed.protocol)) {
      return "API 地址必须使用 http:// 或 https://。";
    }
  } catch {
    return "API 地址格式无效，例如 https://example.com/v1。";
  }
  return null;
}

export function expectedRotatedSize(
  width: number,
  height: number,
  degrees: 90 | 180 | 270,
) {
  return degrees === 180 ? { width, height } : { width: height, height: width };
}

export function extractImageResult(value: unknown): string | null {
  if (typeof value === "string") {
    const dataUri = value.match(
      /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/,
    );
    if (dataUri) return dataUri[0];
    if (/^https?:\/\//i.test(value)) return value;
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = extractImageResult(item);
      if (result) return result;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  if (typeof object.b64_json === "string" && object.b64_json.trim()) {
    return `data:image/png;base64,${object.b64_json.trim()}`;
  }
  for (const key of ["url", "image_url", "data", "content"]) {
    const result = extractImageResult(object[key]);
    if (result) return result;
  }
  return null;
}
