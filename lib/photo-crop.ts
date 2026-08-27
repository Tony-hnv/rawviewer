import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import {
  getSelectedOrCenteredCrop,
  type CropAspectRatio,
  type CropRect,
} from "@/lib/crop-math";
import { copyFileIntoLibrary } from "@/lib/local-file-bridge";
import {
  cropImageIntoLibrary,
  getCropImageInfo,
} from "@/lib/local-file-bridge";
import { loadLibrary, saveLibrary } from "@/lib/photo-library";
import {
  type LibraryFile,
  getBaseName,
  getFileDescriptor,
} from "@/lib/raw-files";

export { CROP_ASPECT_RATIOS, getCenteredCrop } from "@/lib/crop-math";
export type { CropAspectRatio } from "@/lib/crop-math";

const LIBRARY_DIRECTORY = `${FileSystem.documentDirectory}raw-view-library/`;

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getAvailableCropName(fileName: string): Promise<string> {
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

export async function createCroppedLibraryCopy(
  file: LibraryFile,
  ratio: CropAspectRatio,
  selectedCrop?: CropRect,
): Promise<LibraryFile> {
  if (file.kind !== "image") {
    throw new Error(
      "RAW 文件请先生成预览；当前裁切仅支持 PNG、JPG 和 JPEG 图片。",
    );
  }
  const dimensions = await getCropImageInfo(file.uri);
  const crop = getSelectedOrCenteredCrop(
    selectedCrop,
    dimensions.width,
    dimensions.height,
    ratio,
  );
  const outputExtension = file.extension === "png" ? "png" : "jpg";
  await FileSystem.makeDirectoryAsync(LIBRARY_DIRECTORY, {
    intermediates: true,
  });
  const requestedName = `${file.baseName}-裁切-${ratio.replace(":", "x")}.${outputExtension}`;
  const fileName = await getAvailableCropName(requestedName);
  const destinationUri = `${LIBRARY_DIRECTORY}${fileName}`;
  const croppedResult =
    Platform.OS === "android"
      ? await cropImageIntoLibrary(
          file.uri,
          crop,
          destinationUri,
          outputExtension === "png" ? "png" : "jpeg",
        )
      : await createFallbackCrop(file.uri, crop, outputExtension);
  if (
    !croppedResult.uri ||
    croppedResult.width !== crop.width ||
    croppedResult.height !== crop.height
  ) {
    throw new Error(
      "裁切区域未被正确应用，已取消保存以避免生成错误图片。请重新打开裁切后再试。",
    );
  }
  const savedUri =
    Platform.OS === "android"
      ? croppedResult.uri
      : await copyFileIntoLibrary(croppedResult.uri, destinationUri);
  const outputInfo = await FileSystem.getInfoAsync(savedUri);
  if (!outputInfo.exists || !outputInfo.size) {
    throw new Error("裁切副本保存失败。请确认设备有可用存储空间后重试。");
  }
  const descriptor = getFileDescriptor(fileName);
  if (!descriptor) {
    throw new Error("裁切结果格式无效。请重新尝试。");
  }
  const croppedFile: LibraryFile = {
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
  await saveLibrary([...files, croppedFile]);
  const verifiedFiles = await loadLibrary();
  const verifiedFile = verifiedFiles.find(
    (entry) => entry.id === croppedFile.id,
  );
  if (
    !verifiedFile ||
    verifiedFile.uri !== savedUri ||
    verifiedFile.fileName !== fileName
  ) {
    throw new Error(
      "裁切副本已生成，但本地图库记录未能保存。请重新打开应用后重试。",
    );
  }
  return verifiedFile;
}

async function createFallbackCrop(
  uri: string,
  crop: CropRect,
  outputExtension: "png" | "jpg",
): Promise<{ uri: string; width: number; height: number }> {
  const ImageManipulator = require("expo-image-manipulator") as {
    SaveFormat: { JPEG: string; PNG: string };
    manipulateAsync(
      sourceUri: string,
      actions: Array<{ crop: CropRect }>,
      options: { compress: number; format: string },
    ): Promise<{ uri: string; width: number; height: number }>;
  };
  return ImageManipulator.manipulateAsync(uri, [{ crop }], {
    compress: 1,
    format:
      outputExtension === "png"
        ? ImageManipulator.SaveFormat.PNG
        : ImageManipulator.SaveFormat.JPEG,
  });
}
