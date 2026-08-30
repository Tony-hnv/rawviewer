import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import {
  copyFileIntoLibrary,
  getCropImageInfo,
  rotateImageIntoLibrary,
} from "@/lib/local-file-bridge";
import { expectedRotatedSize } from "@/lib/ai-image-math";
import { loadLibrary, saveLibrary } from "@/lib/photo-library";
import {
  type LibraryFile,
  getBaseName,
  getFileDescriptor,
} from "@/lib/raw-files";

export type RotationDegrees = 90 | 180 | 270;

const LIBRARY_DIRECTORY = `${FileSystem.documentDirectory}raw-view-library/`;

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getAvailableRotationName(fileName: string): Promise<string> {
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

export async function createRotatedLibraryCopy(
  file: LibraryFile,
  degrees: RotationDegrees,
): Promise<LibraryFile> {
  if (file.kind !== "image") {
    throw new Error(
      "RAW 文件请先生成预览；当前旋转仅支持 PNG、JPG 和 JPEG 图片。",
    );
  }

  const sourceDimensions = await getCropImageInfo(file.uri);
  await FileSystem.makeDirectoryAsync(LIBRARY_DIRECTORY, {
    intermediates: true,
  });
  const outputExtension = file.extension === "png" ? "png" : "jpg";
  const requestedName = `${file.baseName}-旋转-${degrees}度.${outputExtension}`;
  const fileName = await getAvailableRotationName(requestedName);
  const destinationUri = `${LIBRARY_DIRECTORY}${fileName}`;

  const rotatedResult =
    Platform.OS === "android"
      ? await rotateImageIntoLibrary(
          file.uri,
          degrees,
          destinationUri,
          outputExtension === "png" ? "png" : "jpeg",
        )
      : await createFallbackRotation(file.uri, degrees, outputExtension);

  const expected = expectedRotatedSize(
    sourceDimensions.width,
    sourceDimensions.height,
    degrees,
  );
  if (
    rotatedResult.width !== expected.width ||
    rotatedResult.height !== expected.height
  ) {
    throw new Error(
      "旋转角度未被正确应用，已取消保存以避免生成错误图片。请重新尝试。",
    );
  }

  const savedUri =
    Platform.OS === "android"
      ? rotatedResult.uri
      : await copyFileIntoLibrary(rotatedResult.uri, destinationUri);
  const outputInfo = await FileSystem.getInfoAsync(savedUri);
  if (!outputInfo.exists || !outputInfo.size) {
    throw new Error("旋转副本保存失败。请确认设备有可用存储空间后重试。");
  }

  const descriptor = getFileDescriptor(fileName);
  if (!descriptor) {
    throw new Error("旋转结果格式无效。请重新尝试。");
  }
  const rotatedFile: LibraryFile = {
    id: makeId(),
    fileName,
    baseName: getBaseName(fileName),
    extension: descriptor.extension,
    kind: descriptor.kind,
    brand: descriptor.brand,
    uri: savedUri,
    renameSyncStatus: "copy_only",
    size: outputInfo.size,
    importedAt: Date.now(),
  };

  const files = await loadLibrary();
  await saveLibrary([...files, rotatedFile]);
  const verifiedFiles = await loadLibrary();
  const verifiedFile = verifiedFiles.find(
    (entry) => entry.id === rotatedFile.id,
  );
  if (
    !verifiedFile ||
    verifiedFile.uri !== savedUri ||
    verifiedFile.fileName !== fileName
  ) {
    throw new Error(
      "旋转副本已生成，但本地图库记录未能保存。请重新打开应用后重试。",
    );
  }
  return verifiedFile;
}

async function createFallbackRotation(
  uri: string,
  degrees: RotationDegrees,
  outputExtension: "png" | "jpg",
): Promise<{ uri: string; width: number; height: number }> {
  const ImageManipulator = require("expo-image-manipulator") as {
    SaveFormat: { JPEG: string; PNG: string };
    manipulateAsync(
      sourceUri: string,
      actions: Array<{ rotate: number }>,
      options: { compress: number; format: string },
    ): Promise<{ uri: string; width: number; height: number }>;
  };
  return ImageManipulator.manipulateAsync(uri, [{ rotate: degrees }], {
    compress: 1,
    format:
      outputExtension === "png"
        ? ImageManipulator.SaveFormat.PNG
        : ImageManipulator.SaveFormat.JPEG,
  });
}
