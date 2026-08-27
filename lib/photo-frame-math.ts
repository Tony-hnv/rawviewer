import type { ExifInfo } from "@/lib/exif-info";
import type { LibraryFile } from "@/lib/raw-files";

export type PhotoFrameStyle = "solid" | "exif" | "brand";
export type PhotoFrameThemeId = "white" | "black" | "ivory" | "slate";
export type BrandMarkId =
  | "Sony"
  | "Canon"
  | "Nikon"
  | "Fujifilm"
  | "Leica"
  | "Hasselblad"
  | "Panasonic"
  | "Apple"
  | "Samsung"
  | "Google"
  | "Huawei"
  | "Xiaomi"
  | "OPPO"
  | "vivo";

export type PhotoFrameTheme = {
  id: PhotoFrameThemeId;
  label: string;
  backgroundColor: string;
  foregroundColor: string;
};

export type PhotoFrameRequest = {
  style: PhotoFrameStyle;
  themeId: PhotoFrameThemeId;
  brandMark: BrandMarkId;
};

export type FrameText = {
  title: string;
  subtitle: string;
  details: string;
};

export const PHOTO_FRAME_STYLES: {
  id: PhotoFrameStyle;
  label: string;
  description: string;
}[] = [
  { id: "solid", label: "纯色留白", description: "简约画廊式边框" },
  { id: "exif", label: "EXIF 参数", description: "显示相机与曝光信息" },
  { id: "brand", label: "品牌标识", description: "显示相机或手机品牌字样" },
];

export const PHOTO_FRAME_THEMES: PhotoFrameTheme[] = [
  {
    id: "white",
    label: "画廊白",
    backgroundColor: "#FAFAF7",
    foregroundColor: "#171717",
  },
  {
    id: "black",
    label: "暗房黑",
    backgroundColor: "#111111",
    foregroundColor: "#F8F7F3",
  },
  {
    id: "ivory",
    label: "象牙米",
    backgroundColor: "#EFE8D8",
    foregroundColor: "#302B24",
  },
  {
    id: "slate",
    label: "胶片灰",
    backgroundColor: "#27313A",
    foregroundColor: "#F0F3F4",
  },
];

export const BRAND_MARKS: BrandMarkId[] = [
  "Sony",
  "Canon",
  "Nikon",
  "Fujifilm",
  "Leica",
  "Hasselblad",
  "Panasonic",
  "Apple",
  "Samsung",
  "Google",
  "Huawei",
  "Xiaomi",
  "OPPO",
  "vivo",
];

function numberText(value: number, digits = 1): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function exposureRows(exif: ExifInfo | null): string {
  if (!exif) return "本地图片副本";
  return [
    exif.aperture ? `f/${numberText(exif.aperture)}` : null,
    exif.exposureTime ?? null,
    exif.iso ? `ISO ${exif.iso}` : null,
    exif.focalLength ? `${numberText(exif.focalLength)}mm` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function buildFrameText(
  file: LibraryFile,
  exif: ExifInfo | null,
  request: PhotoFrameRequest,
): FrameText {
  const camera = [exif?.make, exif?.model].filter(Boolean).join(" ").trim();
  if (request.style === "solid") {
    return { title: "", subtitle: "", details: "" };
  }
  if (request.style === "brand") {
    return {
      title: request.brandMark.toUpperCase(),
      subtitle: camera || file.fileName,
      details: exposureRows(exif),
    };
  }
  return {
    title: camera || file.fileName,
    subtitle: exif?.lensModel ?? "RAW VIEW · EXIF FRAME",
    details: exposureRows(exif),
  };
}
