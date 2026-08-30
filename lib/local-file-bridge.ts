import * as FileSystem from "expo-file-system/legacy";
import { Image, NativeModules, Platform } from "react-native";

import type { PhotoFrameStyle } from "@/lib/photo-frame-math";

interface NativeFileRenameResult {
  uri: string;
  sourceUri?: string | null;
  sourceRenamed?: boolean;
  sourceRenameError?: string | null;
}

export interface WritableDocumentAsset {
  name: string;
  uri: string;
  size?: number;
}

interface RawDecoderNativeModule {
  pickWritableDocuments(): Promise<WritableDocumentAsset[]>;
  copyToLibrary(sourceUri: string, destinationUri: string): Promise<string>;
  renameLibraryFile(
    localUri: string,
    sourceUri: string | null,
    fileName: string,
  ): Promise<NativeFileRenameResult>;
  exportLibraryFile(localUri: string, fileName: string): Promise<string | null>;
  readExif(localUri: string): Promise<import("./exif-info").ExifInfo>;
  getCropImageInfo(localUri: string): Promise<CropImageInfo>;
  cropImage(
    localUri: string,
    originX: number,
    originY: number,
    width: number,
    height: number,
    destinationUri: string,
    format: "png" | "jpeg",
  ): Promise<CropImageResult>;
  rotateImage(
    localUri: string,
    degrees: 90 | 180 | 270,
    destinationUri: string,
    format: "png" | "jpeg",
  ): Promise<RotatedImageResult>;
  createPhotoFrame(
    localUri: string,
    destinationUri: string,
    format: "png" | "jpeg",
    style: PhotoFrameStyle,
    backgroundColor: string,
    foregroundColor: string,
    title: string,
    subtitle: string,
    details: string,
    brandMark: string,
    logoVisible: boolean,
    logoScale: number,
    logoOffsetX: number,
    logoOffsetY: number,
  ): Promise<FramedImageResult>;
}

export interface CropImageInfo {
  width: number;
  height: number;
  orientation: number;
}

export interface CropImageResult {
  uri: string;
  width: number;
  height: number;
}

export interface RotatedImageResult {
  uri: string;
  width: number;
  height: number;
}

export interface FramedImageResult {
  uri: string;
  width: number;
  height: number;
}

function nativeModule(): RawDecoderNativeModule {
  const module = NativeModules.RawDecoder as RawDecoderNativeModule | undefined;
  if (!module) {
    throw new Error(
      "请使用发布后的 Android 构建处理本地文件，Expo Go 不包含文件管理模块。",
    );
  }
  return module;
}

export async function pickWritableDocuments(): Promise<
  WritableDocumentAsset[]
> {
  if (Platform.OS !== "android") {
    throw new Error("可写文件选择器仅在 Android 原生构建中可用。");
  }
  return nativeModule().pickWritableDocuments();
}

export async function copyFileIntoLibrary(
  sourceUri: string,
  destinationUri: string,
): Promise<string> {
  if (Platform.OS === "android") {
    return nativeModule().copyToLibrary(sourceUri, destinationUri);
  }
  await FileSystem.copyAsync({ from: sourceUri, to: destinationUri });
  return destinationUri;
}

function getReactNativeImageSize(uri: string): Promise<CropImageInfo> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height, orientation: 1 }),
      reject,
    );
  });
}

/** 返回裁切编辑器与 Android 裁切器共同使用的直立视觉尺寸。 */
export async function getCropImageInfo(uri: string): Promise<CropImageInfo> {
  if (Platform.OS === "android") {
    return nativeModule().getCropImageInfo(uri);
  }
  return getReactNativeImageSize(uri);
}

/** 将裁切区域直接输出到 Android 的应用私有图库目录。 */
export async function cropImageIntoLibrary(
  localUri: string,
  crop: { originX: number; originY: number; width: number; height: number },
  destinationUri: string,
  format: "png" | "jpeg",
): Promise<CropImageResult> {
  if (Platform.OS !== "android") {
    throw new Error("本地图片裁切仅在 Android 原生构建中可用。");
  }
  return nativeModule().cropImage(
    localUri,
    crop.originX,
    crop.originY,
    crop.width,
    crop.height,
    destinationUri,
    format,
  );
}

/** 将带有边框的标准图片直接写入 Android 应用私有图库目录。 */
/** 将直立后的普通图片按 90 度倍数旋转并直接写入 Android 应用私有图库目录。 */
export async function rotateImageIntoLibrary(
  localUri: string,
  degrees: 90 | 180 | 270,
  destinationUri: string,
  format: "png" | "jpeg",
): Promise<RotatedImageResult> {
  if (Platform.OS !== "android") {
    throw new Error("本地图片旋转仅在 Android 原生构建中可用。");
  }
  return nativeModule().rotateImage(localUri, degrees, destinationUri, format);
}

export async function renderPhotoFrameIntoLibrary(
  localUri: string,
  destinationUri: string,
  format: "png" | "jpeg",
  style: PhotoFrameStyle,
  backgroundColor: string,
  foregroundColor: string,
  text: { title: string; subtitle: string; details: string },
  brandMark: string,
  logoVisible = true,
  logoScale = 1,
  logoOffsetX = 0,
  logoOffsetY = 0,
): Promise<FramedImageResult> {
  if (Platform.OS !== "android") {
    throw new Error(
      "照片边框需使用最新 Android 发布构建，Expo Go 不包含本地渲染模块。",
    );
  }
  return nativeModule().createPhotoFrame(
    localUri,
    destinationUri,
    format,
    style,
    backgroundColor,
    foregroundColor,
    text.title,
    text.subtitle,
    text.details,
    brandMark,
    logoVisible,
    logoScale,
    logoOffsetX,
    logoOffsetY,
  );
}

export async function renameLibraryCopy(
  localUri: string,
  sourceUri: string | undefined,
  fileName: string,
): Promise<NativeFileRenameResult> {
  if (Platform.OS === "android") {
    return nativeModule().renameLibraryFile(
      localUri,
      sourceUri ?? null,
      fileName,
    );
  }

  const currentPath = localUri.slice(localUri.lastIndexOf("/") + 1);
  const destinationUri = localUri.slice(0, -currentPath.length) + fileName;
  await FileSystem.moveAsync({ from: localUri, to: destinationUri });
  return { uri: destinationUri, sourceUri, sourceRenamed: false };
}

export async function exportLibraryCopy(
  localUri: string,
  fileName: string,
): Promise<string | null> {
  if (Platform.OS !== "android") {
    throw new Error("导出到指定文件夹仅在 Android 原生构建中可用。");
  }
  return nativeModule().exportLibraryFile(localUri, fileName);
}
