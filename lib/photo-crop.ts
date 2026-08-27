import * as FileSystem from "expo-file-system/legacy";

import {
  clampSourceCrop,
  getCenteredCrop,
  type CropAspectRatio,
  type CropRect,
} from "@/lib/crop-math";
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

async function getImageDimensions(
  uri: string,
): Promise<{ width: number; height: number }> {
  const { Image } = require("react-native") as {
    Image: {
      getSize(
        uri: string,
        success: (width: number, height: number) => void,
        failure?: (error: Error) => void,
      ): void;
    };
  };
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
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
  const ImageManipulator = require("expo-image-manipulator") as {
    SaveFormat: { JPEG: string; PNG: string };
    manipulateAsync(
      uri: string,
      actions: Array<{ crop: CropRect }>,
      options: { compress: number; format: string },
    ): Promise<{ uri: string; width: number; height: number }>;
  };
  const dimensions = await getImageDimensions(file.uri);
  const crop = clampSourceCrop(
    selectedCrop ?? getCenteredCrop(dimensions.width, dimensions.height, ratio),
    dimensions.width,
    dimensions.height,
  );
  const outputExtension = file.extension === "png" ? "png" : "jpg";
  const croppedResult = await ImageManipulator.manipulateAsync(
    file.uri,
    [{ crop }],
    {
      compress: 1,
      format:
        outputExtension === "png"
          ? ImageManipulator.SaveFormat.PNG
          : ImageManipulator.SaveFormat.JPEG,
    },
  );
  await FileSystem.makeDirectoryAsync(LIBRARY_DIRECTORY, {
    intermediates: true,
  });
  const requestedName = `${file.baseName}-裁切-${ratio.replace(":", "x")}.${outputExtension}`;
  const fileName = await getAvailableCropName(requestedName);
  const destinationUri = `${LIBRARY_DIRECTORY}${fileName}`;
  await FileSystem.copyAsync({ from: croppedResult.uri, to: destinationUri });
  const outputInfo = await FileSystem.getInfoAsync(destinationUri);
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
    uri: destinationUri,
    renameSyncStatus: "copy_only",
    size: outputInfo.size,
    importedAt: Date.now(),
  };
  const files = await loadLibrary();
  await saveLibrary([...files, croppedFile]);
  return croppedFile;
}
