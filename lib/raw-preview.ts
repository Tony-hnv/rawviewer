import { Platform } from "react-native";

type RawDecoderModule = {
  decodeRaw(sourceUri: string): Promise<string>;
};

function asFileUri(path: string): string {
  return path.startsWith("file://") ? path : `file://${path}`;
}

export async function createRawPreview(sourceUri: string): Promise<string> {
  if (Platform.OS !== "android") {
    throw new Error("RAW 原生解码仅在 Android 构建中可用。");
  }

  const { NativeModules } = require("react-native") as typeof import("react-native");
  const rawDecoder = NativeModules.RawDecoder as RawDecoderModule | undefined;
  if (!rawDecoder) {
    throw new Error("请使用最新发布的 Android 构建打开此文件，当前运行环境未包含 LibRaw 解码器。");
  }

  try {
    const outputPath = await rawDecoder.decodeRaw(sourceUri);
    if (!outputPath) {
      throw new Error("解码器未能生成预览图。");
    }
    return asFileUri(outputPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "RAW 解码失败。";
    if (message.includes("Expo Go") || message.includes("doesn't seem to be linked")) {
      throw new Error("请使用最新发布的 Android 构建打开此文件，Expo Go 不包含 LibRaw 解码器。");
    }
    if (message.includes("RAW_PREVIEW_WRITE_FAILED")) {
      throw new Error("RAW 图像已解码，但预览缓存写入失败。请确认设备有可用存储空间后重试。");
    }
    if (message.includes("RAW_OPEN_FAILED") || message.includes("RAW_PROCESS_FAILED")) {
      throw new Error("该 RAW 文件无法由当前 LibRaw 解码器处理。请稍后尝试新的兼容性版本。");
    }
    throw new Error(message);
  }
}
