export type SupportedExtension =
  | "arw"
  | "cr2"
  | "cr3"
  | "nef"
  | "rw2"
  | "png"
  | "jpg"
  | "jpeg";

export type MediaKind = "raw" | "image";
export type RenameSyncStatus = "original_and_copy" | "copy_only";

export type CameraBrand = "Sony" | "Canon" | "Nikon" | "Panasonic" | "Image";

export interface LibraryFile {
  id: string;
  fileName: string;
  baseName: string;
  extension: SupportedExtension;
  kind: MediaKind;
  brand: CameraBrand;
  uri: string;
  sourceUri?: string;
  renameSyncStatus?: RenameSyncStatus;
  size: number;
  importedAt: number;
}

const rawExtensions: Record<string, CameraBrand> = {
  arw: "Sony",
  cr2: "Canon",
  cr3: "Canon",
  nef: "Nikon",
  rw2: "Panasonic",
};

const imageExtensions = new Set(["png", "jpg", "jpeg"]);

export function getExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex <= 0 ? "" : fileName.slice(dotIndex + 1).toLowerCase();
}

export function getBaseName(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex <= 0 ? fileName : fileName.slice(0, dotIndex);
}

export function getFileDescriptor(fileName: string): {
  extension: SupportedExtension;
  kind: MediaKind;
  brand: CameraBrand;
} | null {
  const extension = getExtension(fileName);
  const rawBrand = rawExtensions[extension];
  if (rawBrand) {
    return {
      extension: extension as SupportedExtension,
      kind: "raw",
      brand: rawBrand,
    };
  }

  if (imageExtensions.has(extension)) {
    return {
      extension: extension as SupportedExtension,
      kind: "image",
      brand: "Image",
    };
  }

  return null;
}

export function sanitizeBaseName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim()
    .slice(0, 96);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "大小未知";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const precision = value >= 10 || exponent === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[exponent]}`;
}

export function createFileName(baseName: string, extension: SupportedExtension): string {
  return `${sanitizeBaseName(baseName)}.${extension}`;
}
