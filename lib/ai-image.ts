import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { copyFileIntoLibrary } from "@/lib/local-file-bridge";
import {
  extractImageResult,
  normalizeApiBaseUrl,
  validateAiSettings,
  type AiApiMode,
} from "@/lib/ai-image-math";
import { loadLibrary, saveLibrary } from "@/lib/photo-library";
import {
  type LibraryFile,
  getBaseName,
  getFileDescriptor,
} from "@/lib/raw-files";

export type { AiApiMode } from "@/lib/ai-image-math";

export type AiSettings = {
  baseUrl: string;
  model: string;
  mode: AiApiMode;
};

export type StoredAiSettings = AiSettings & {
  apiKey: string;
};

export type AiConnectionResult = {
  models: string[];
};

const SETTINGS_KEY = "raw-view-ai-settings-v1";
const API_KEY_KEY = "raw-view-ai-api-key-v1";
const LIBRARY_DIRECTORY = `${FileSystem.documentDirectory}raw-view-library/`;
const CACHE_DIRECTORY = `${FileSystem.cacheDirectory}raw-view-ai/`;

export const DEFAULT_AI_SETTINGS: AiSettings = {
  baseUrl: "",
  model: "",
  mode: "images_edits",
};

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getWebStorage(): Storage | null {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") return null;
  return localStorage;
}

async function getSecret(): Promise<string | null> {
  if (Platform.OS === "web")
    return getWebStorage()?.getItem(API_KEY_KEY) ?? null;
  return SecureStore.getItemAsync(API_KEY_KEY);
}

async function setSecret(value: string): Promise<void> {
  if (Platform.OS === "web") {
    getWebStorage()?.setItem(API_KEY_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(API_KEY_KEY, value);
}

async function deleteSecret(): Promise<void> {
  if (Platform.OS === "web") {
    getWebStorage()?.removeItem(API_KEY_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(API_KEY_KEY);
}

export async function loadAiSettings(): Promise<StoredAiSettings> {
  const rawSettings =
    Platform.OS === "web"
      ? (getWebStorage()?.getItem(SETTINGS_KEY) ?? null)
      : await AsyncStorage.getItem(SETTINGS_KEY);
  let settings = DEFAULT_AI_SETTINGS;
  if (rawSettings) {
    try {
      const parsed = JSON.parse(rawSettings) as Partial<AiSettings>;
      settings = {
        baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
        model: typeof parsed.model === "string" ? parsed.model : "",
        mode: "images_edits",
      };
    } catch {
      settings = DEFAULT_AI_SETTINGS;
    }
  }
  return { ...settings, apiKey: (await getSecret()) ?? "" };
}

export async function saveAiSettings(
  settings: StoredAiSettings,
): Promise<void> {
  const cleanSettings: AiSettings = {
    baseUrl: settings.baseUrl.trim().replace(/\/+$/, ""),
    model: settings.model.trim(),
    mode: "images_edits",
  };
  const serialized = JSON.stringify(cleanSettings);
  if (Platform.OS === "web") getWebStorage()?.setItem(SETTINGS_KEY, serialized);
  else await AsyncStorage.setItem(SETTINGS_KEY, serialized);
  if (settings.apiKey.trim()) await setSecret(settings.apiKey.trim());
  else await deleteSecret();
}

function apiUrl(settings: AiSettings, path: string): string {
  return `${normalizeApiBaseUrl(settings.baseUrl)}/${path.replace(/^\/+/, "")}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string } | string;
    };
    const error = parsed.error;
    if (typeof error === "string" && error) return error;
    if (error && typeof error === "object" && error.message)
      return error.message;
  } catch {
    // Keep the status text below when the provider did not return JSON.
  }
  return text.slice(0, 240) || `${response.status} ${response.statusText}`;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 45_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI 请求超时，请检查网络或更换模型后重试。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function authorizationHeaders(apiKey: string): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export async function testAiConnection(
  settings: StoredAiSettings,
): Promise<AiConnectionResult> {
  const validationError = validateAiSettings(settings);
  if (validationError) throw new Error(validationError);
  const response = await fetchWithTimeout(
    apiUrl(settings, "models"),
    { headers: authorizationHeaders(settings.apiKey) },
    20_000,
  );
  if (!response.ok)
    throw new Error(`模型连接失败：${await readErrorMessage(response)}`);
  const body = (await response.json()) as {
    data?: Array<{ id?: string }>;
  };
  return {
    models: Array.isArray(body.data)
      ? body.data
          .map((entry) => entry.id)
          .filter((id): id is string => Boolean(id))
      : [],
  };
}

function mimeTypeForFile(file: LibraryFile): string {
  return file.extension === "png" ? "image/png" : "image/jpeg";
}

async function requestImageEdit(
  file: LibraryFile,
  prompt: string,
  settings: StoredAiSettings,
): Promise<string> {
  const form = new FormData();
  form.append("model", settings.model.trim());
  form.append("prompt", prompt.trim());
  form.append("image", {
    uri: file.uri,
    name: file.fileName,
    type: mimeTypeForFile(file),
  } as unknown as Blob);
  const response = await fetchWithTimeout(apiUrl(settings, "images/edits"), {
    method: "POST",
    headers: authorizationHeaders(settings.apiKey),
    body: form,
  });
  if (!response.ok)
    throw new Error(`AI 修图失败：${await readErrorMessage(response)}`);
  const body = (await response.json()) as unknown;
  const result = extractImageResult(body);
  if (!result) {
    throw new Error(
      "AI 返回中没有可保存的图片 URL 或 Base64 图片数据。请确认模型支持图像编辑输出。",
    );
  }
  return result;
}

async function materializeAiResult(result: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(CACHE_DIRECTORY, { intermediates: true });
  const destination = `${CACHE_DIRECTORY}result-${Date.now()}.png`;
  if (result.startsWith("data:")) {
    const separator = result.indexOf(",");
    if (separator < 0) throw new Error("AI 返回的 Base64 图片格式无效。");
    await FileSystem.writeAsStringAsync(
      destination,
      result.slice(separator + 1),
      { encoding: FileSystem.EncodingType.Base64 },
    );
    return destination;
  }
  const downloaded = await FileSystem.downloadAsync(result, destination);
  return downloaded.uri;
}

async function getAvailableAiName(fileName: string): Promise<string> {
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : ".png";
  let candidate = fileName;
  let suffix = 1;
  while (
    (await FileSystem.getInfoAsync(`${LIBRARY_DIRECTORY}${candidate}`)).exists
  ) {
    candidate = `${baseName} (${suffix})${extension}`;
    suffix += 1;
  }
  return candidate;
}

export async function createAiEditedLibraryCopy(
  file: LibraryFile,
  prompt: string,
  settings?: StoredAiSettings,
): Promise<LibraryFile> {
  if (file.kind !== "image") {
    throw new Error(
      "RAW 文件当前不能直接上传进行 AI 修图，请先使用 PNG、JPG 或 JPEG 图片。",
    );
  }
  if (!prompt.trim()) throw new Error("请先描述希望 AI 修改的内容。");
  const resolvedSettings = settings ?? (await loadAiSettings());
  const validationError = validateAiSettings(resolvedSettings);
  if (validationError) throw new Error(validationError);

  const result = await requestImageEdit(file, prompt, resolvedSettings);
  const cachedUri = await materializeAiResult(result);
  await FileSystem.makeDirectoryAsync(LIBRARY_DIRECTORY, {
    intermediates: true,
  });
  const fileName = await getAvailableAiName(`${file.baseName}-AI修图.png`);
  const destinationUri = `${LIBRARY_DIRECTORY}${fileName}`;
  const savedUri = await copyFileIntoLibrary(cachedUri, destinationUri);
  const info = await FileSystem.getInfoAsync(savedUri);
  await FileSystem.deleteAsync(cachedUri, { idempotent: true }).catch(
    () => undefined,
  );
  if (!info.exists || !info.size)
    throw new Error("AI 修图结果保存失败，请确认设备有可用存储空间。");

  const descriptor = getFileDescriptor(fileName);
  if (!descriptor) throw new Error("AI 修图结果格式无效。");
  const editedFile: LibraryFile = {
    id: makeId(),
    fileName,
    baseName: getBaseName(fileName),
    extension: descriptor.extension,
    kind: descriptor.kind,
    brand: descriptor.brand,
    uri: savedUri,
    sourceUri: file.sourceUri,
    renameSyncStatus: "copy_only",
    size: info.size,
    importedAt: Date.now(),
  };
  const files = await loadLibrary();
  await saveLibrary([...files, editedFile]);
  const verifiedFiles = await loadLibrary();
  const verified = verifiedFiles.find((entry) => entry.id === editedFile.id);
  if (
    !verified ||
    verified.uri !== savedUri ||
    verified.fileName !== fileName
  ) {
    throw new Error(
      "AI 修图副本已生成，但本地图库记录未能保存，请重新打开应用后重试。",
    );
  }
  return verified;
}
