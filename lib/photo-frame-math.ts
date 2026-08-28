import type { ExifInfo } from "@/lib/exif-info";
import type { LibraryFile } from "@/lib/raw-files";

export type PhotoFrameStyle =
  | "solid"
  | "rounded"
  | "film"
  | "polaroid"
  | "exif"
  | "brand";
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

export const LOGO_SCALE_MIN = 0.6;
export const LOGO_SCALE_MAX = 1.6;
export const LOGO_OFFSET_MIN = -1;
export const LOGO_OFFSET_MAX = 1;

export function clampLogoScale(value: number): number {
  return Math.min(
    LOGO_SCALE_MAX,
    Math.max(LOGO_SCALE_MIN, Number(value.toFixed(1))),
  );
}

export function clampLogoOffset(value: number): number {
  return Math.min(
    LOGO_OFFSET_MAX,
    Math.max(LOGO_OFFSET_MIN, Number(value.toFixed(1))),
  );
}

export type PhotoFrameRequest = {
  style: PhotoFrameStyle;
  themeId: PhotoFrameThemeId;
  brandMark: BrandMarkId;
  logoVisible?: boolean;
  logoScale?: number;
  logoOffsetX?: number;
  logoOffsetY?: number;
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
  { id: "rounded", label: "画廊圆角", description: "圆角图片与留白边框" },
  { id: "film", label: "胶片日期", description: "齿孔与日期戳风格" },
  { id: "polaroid", label: "拍立得", description: "宽底部留白与标题" },
  { id: "exif", label: "EXIF 参数", description: "显示相机与曝光信息" },
  { id: "brand", label: "品牌标识", description: "显示相机或手机品牌 Logo" },
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

const PHONE_BRANDS = new Set<BrandMarkId>([
  "Apple",
  "Samsung",
  "Google",
  "Huawei",
  "Xiaomi",
  "OPPO",
  "vivo",
]);

export function isPhoneBrand(brand: BrandMarkId): boolean {
  return PHONE_BRANDS.has(brand);
}

export function getBrandMonogram(brand: BrandMarkId): string {
  if (brand === "Hasselblad") return "H";
  if (brand === "Fujifilm") return "F";
  return brand.slice(0, 1).toUpperCase();
}

export type PhotoFrameLayout = {
  sideInset: number;
  bottomInset: number;
  outputWidth: number;
  outputHeight: number;
  imageLeft: number;
  imageTop: number;
  imageWidth: number;
  imageHeight: number;
  informationTop: number;
  informationHeight: number;
};

export function hasFrameInformation(style: PhotoFrameStyle): boolean {
  return style === "exif" || style === "brand" || style === "polaroid";
}

export function isRoundedFrame(style: PhotoFrameStyle): boolean {
  return style === "rounded" || style === "polaroid";
}

export function isFilmFrame(style: PhotoFrameStyle): boolean {
  return style === "film";
}

/**
 * Calculates the physical frame layout used by both the preview and Android renderer.
 * The source bitmap is drawn at its decoded size. Therefore left, right and top
 * margins are exactly the same `sideInset`; the information area is extra height
 * below the image and never participates in image scaling.
 */
export function getPhotoFrameLayout(
  sourceWidth: number,
  sourceHeight: number,
  style: PhotoFrameStyle,
): PhotoFrameLayout {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return {
      sideInset: 0,
      bottomInset: 0,
      outputWidth: 0,
      outputHeight: 0,
      imageLeft: 0,
      imageTop: 0,
      imageWidth: 0,
      imageHeight: 0,
      informationTop: 0,
      informationHeight: 0,
    };
  }

  const shortSide = Math.min(sourceWidth, sourceHeight);
  const sideRatio =
    style === "film" ? 0.068 : style === "polaroid" ? 0.062 : 0.052;
  const sideInset = Math.max(28, Math.round(shortSide * sideRatio));
  const hasInformation = hasFrameInformation(style);
  const bottomInset =
    style === "polaroid"
      ? Math.max(sideInset * 4, Math.round(shortSide * 0.24))
      : hasInformation
        ? Math.max(sideInset * 3, Math.round(shortSide * 0.17))
        : sideInset;
  const informationTop = sideInset + sourceHeight;

  return {
    sideInset,
    bottomInset,
    outputWidth: sourceWidth + sideInset * 2,
    outputHeight: sourceHeight + sideInset + bottomInset,
    imageLeft: sideInset,
    imageTop: sideInset,
    imageWidth: sourceWidth,
    imageHeight: sourceHeight,
    informationTop,
    informationHeight: bottomInset,
  };
}

export function getContainedFrameImageRect(
  sourceWidth: number,
  sourceHeight: number,
  availableWidth: number,
  availableHeight: number,
): { left: number; top: number; width: number; height: number } {
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    availableWidth <= 0 ||
    availableHeight <= 0
  ) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const scale = Math.min(
    availableWidth / sourceWidth,
    availableHeight / sourceHeight,
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    left: (availableWidth - width) / 2,
    top: (availableHeight - height) / 2,
    width,
    height,
  };
}

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
  if (request.style === "solid" || request.style === "rounded") {
    return { title: "", subtitle: "", details: "" };
  }
  if (request.style === "film") {
    const importedDate = new Date(file.importedAt)
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", ".");
    return {
      title: "RAW VIEW",
      subtitle: file.baseName.toUpperCase(),
      details: importedDate,
    };
  }
  if (request.style === "polaroid") {
    return {
      title: file.baseName,
      subtitle: camera || "RAW VIEW · POLAROID",
      details: exposureRows(exif) || "本地图片副本",
    };
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
