export type ExifReadStatus = "available" | "unavailable" | "unsupported";

export interface ExifInfo {
  status: ExifReadStatus;
  message: string;
  metadataSource?: "standard_exif" | "raw_vendor";
  make?: string;
  model?: string;
  lensModel?: string;
  dateTime?: string;
  focalLength?: number;
  aperture?: number;
  exposureTime?: string;
  iso?: number;
  width?: number;
  height?: number;
  orientation?: number;
}

type RawDecoderExifModule = {
  readExif(localUri: string): Promise<ExifInfo>;
};

export type ExifDisplayRow = {
  label: string;
  value: string;
};

function asFileUri(path: string): string {
  return path.startsWith("file://") ? path : `file://${path}`;
}

function formatFocalLength(value: number): string {
  return Number.isInteger(value) ? `${value} mm` : `${value.toFixed(1)} mm`;
}

function formatAperture(value: number): string {
  return `f/${value.toFixed(1)}`;
}

export function getExifDisplayRows(exif: ExifInfo): ExifDisplayRow[] {
  const camera = [exif.make, exif.model].filter(Boolean).join(" ").trim();
  const dimensions =
    exif.width && exif.height ? `${exif.width} × ${exif.height} px` : undefined;

  return [
    exif.metadataSource === "raw_vendor"
      ? { label: "数据来源", value: "厂商 RAW 元数据" }
      : null,
    camera ? { label: "相机", value: camera } : null,
    exif.lensModel ? { label: "镜头", value: exif.lensModel } : null,
    exif.dateTime ? { label: "拍摄时间", value: exif.dateTime } : null,
    exif.focalLength
      ? { label: "焦距", value: formatFocalLength(exif.focalLength) }
      : null,
    exif.aperture
      ? { label: "光圈", value: formatAperture(exif.aperture) }
      : null,
    exif.exposureTime ? { label: "快门", value: exif.exposureTime } : null,
    exif.iso ? { label: "ISO", value: String(exif.iso) } : null,
    dimensions ? { label: "像素尺寸", value: dimensions } : null,
    exif.orientation
      ? { label: "方向", value: `EXIF ${exif.orientation}` }
      : null,
  ].filter((row): row is ExifDisplayRow => row !== null);
}

export function createExifShareText(fileName: string, exif: ExifInfo): string {
  const rows = getExifDisplayRows(exif);
  const detailLines =
    rows.length > 0
      ? rows.map((row) => `${row.label}：${row.value}`)
      : ["没有可显示的拍摄参数"];
  return [
    "RAW View EXIF 信息",
    `文件：${fileName}`,
    "",
    ...detailLines,
    "",
    exif.message,
  ].join("\n");
}

export async function copyExifInfo(
  fileName: string,
  exif: ExifInfo,
): Promise<void> {
  const Clipboard = require("expo-clipboard") as {
    setStringAsync(value: string): Promise<boolean>;
  };
  await Clipboard.setStringAsync(createExifShareText(fileName, exif));
}

export async function shareExifInfo(
  fileName: string,
  exif: ExifInfo,
): Promise<void> {
  const FileSystem = require("expo-file-system/legacy") as {
    cacheDirectory: string | null;
    EncodingType: { UTF8: string };
    writeAsStringAsync(
      uri: string,
      contents: string,
      options: { encoding: string },
    ): Promise<void>;
  };
  const Sharing = require("expo-sharing") as {
    isAvailableAsync(): Promise<boolean>;
    shareAsync(
      uri: string,
      options: { dialogTitle: string; mimeType: string },
    ): Promise<void>;
  };
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("当前设备不支持系统分享。请改用复制 EXIF 信息。");
  }
  if (!FileSystem.cacheDirectory) {
    throw new Error("无法创建 EXIF 分享文件。请稍后重试。");
  }
  const safeName =
    fileName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "photo";
  const uri = `${FileSystem.cacheDirectory}raw-view-exif-${safeName}.txt`;
  await FileSystem.writeAsStringAsync(
    uri,
    createExifShareText(fileName, exif),
    {
      encoding: FileSystem.EncodingType.UTF8,
    },
  );
  await Sharing.shareAsync(uri, {
    dialogTitle: "分享 EXIF 信息",
    mimeType: "text/plain",
  });
}

export async function readExifInfo(localUri: string): Promise<ExifInfo> {
  const { Platform, NativeModules } = require("react-native") as {
    Platform: { OS: string };
    NativeModules: Record<string, unknown>;
  };
  if (Platform.OS !== "android") {
    return {
      status: "unsupported",
      message: "EXIF 信息仅在最新 Android 发布构建中可读取。",
    };
  }

  const rawDecoder = NativeModules.RawDecoder as
    | RawDecoderExifModule
    | undefined;
  if (!rawDecoder) {
    return {
      status: "unsupported",
      message:
        "请使用最新发布的 Android 构建查看 EXIF 信息，Expo Go 不包含此模块。",
    };
  }

  try {
    const result = await rawDecoder.readExif(asFileUri(localUri));
    return (
      result ?? {
        status: "unavailable",
        message: "未读取到可显示的 EXIF 信息。",
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "无法读取 EXIF 信息。";
    return { status: "unavailable", message };
  }
}
