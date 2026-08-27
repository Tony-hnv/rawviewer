import * as FileSystem from "expo-file-system/legacy";

import type { ExifInfo } from "@/lib/exif-info";
import { renderPhotoFrameIntoLibrary } from "@/lib/local-file-bridge";
import {
  PHOTO_FRAME_THEMES,
  buildFrameText,
  type PhotoFrameRequest,
  type PhotoFrameTheme,
  type PhotoFrameThemeId,
} from "@/lib/photo-frame-math";
import { loadLibrary, saveLibrary } from "@/lib/photo-library";
import {
  type LibraryFile,
  getBaseName,
  getFileDescriptor,
} from "@/lib/raw-files";

export {
  BRAND_MARKS,
  PHOTO_FRAME_STYLES,
  PHOTO_FRAME_THEMES,
  buildFrameText,
} from "@/lib/photo-frame-math";
export type {
  BrandMarkId,
  FrameText,
  PhotoFrameRequest,
  PhotoFrameStyle,
  PhotoFrameTheme,
  PhotoFrameThemeId,
} from "@/lib/photo-frame-math";

const LIBRARY_DIRECTORY = `${FileSystem.documentDirectory}raw-view-library/`;

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getTheme(themeId: PhotoFrameThemeId): PhotoFrameTheme {
  return (
    PHOTO_FRAME_THEMES.find((theme) => theme.id === themeId) ??
    PHOTO_FRAME_THEMES[0]
  );
}

async function getAvailableFrameName(fileName: string): Promise<string> {
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : "";
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

export async function createFramedLibraryCopy(
  file: LibraryFile,
  exif: ExifInfo | null,
  request: PhotoFrameRequest,
): Promise<LibraryFile> {
  if (file.kind !== "image") {
    throw new Error(
      "为保护原始 RAW 数据，边框导出当前仅支持 PNG、JPG 和 JPEG 图片。",
    );
  }
  const theme = getTheme(request.themeId);
  const text = buildFrameText(file, exif, request);
  const outputExtension = file.extension === "png" ? "png" : "jpg";
  await FileSystem.makeDirectoryAsync(LIBRARY_DIRECTORY, {
    intermediates: true,
  });
  const styleName =
    request.style === "solid"
      ? "留白"
      : request.style === "exif"
        ? "参数"
        : request.brandMark;
  const requestedName = `${file.baseName}-边框-${styleName}.${outputExtension}`;
  const fileName = await getAvailableFrameName(requestedName);
  const result = await renderPhotoFrameIntoLibrary(
    file.uri,
    `${LIBRARY_DIRECTORY}${fileName}`,
    outputExtension === "png" ? "png" : "jpeg",
    request.style,
    theme.backgroundColor,
    theme.foregroundColor,
    text,
  );
  const outputInfo = await FileSystem.getInfoAsync(result.uri);
  if (
    !outputInfo.exists ||
    !outputInfo.size ||
    result.width <= 0 ||
    result.height <= 0
  ) {
    throw new Error("边框副本保存失败。请确认设备有足够存储空间后重试。");
  }
  const descriptor = getFileDescriptor(fileName);
  if (!descriptor) throw new Error("边框结果格式无效。请重新尝试。");
  const framedFile: LibraryFile = {
    id: makeId(),
    fileName,
    baseName: getBaseName(fileName),
    extension: descriptor.extension,
    kind: descriptor.kind,
    brand: descriptor.brand,
    uri: result.uri,
    renameSyncStatus: "copy_only",
    size: outputInfo.size,
    importedAt: Date.now(),
  };
  const storedFiles = await loadLibrary();
  await saveLibrary([...storedFiles, framedFile]);
  const verified = (await loadLibrary()).find(
    (entry) => entry.id === framedFile.id,
  );
  if (
    !verified ||
    verified.uri !== result.uri ||
    verified.fileName !== fileName
  ) {
    throw new Error(
      "边框副本已生成，但未能写入本地图库记录。请重新打开应用后重试。",
    );
  }
  return verified;
}
