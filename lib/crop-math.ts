export type CropAspectRatio = "1:1" | "4:3" | "3:4" | "16:9" | "9:16";

export const CROP_ASPECT_RATIOS: ReadonlyArray<{
  id: CropAspectRatio;
  width: number;
  height: number;
}> = [
  { id: "1:1", width: 1, height: 1 },
  { id: "4:3", width: 4, height: 3 },
  { id: "3:4", width: 3, height: 4 },
  { id: "16:9", width: 16, height: 9 },
  { id: "9:16", width: 9, height: 16 },
];

export type CropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

export type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function requirePositiveSize(width: number, height: number, message: string) {
  if (width <= 0 || height <= 0) {
    throw new Error(message);
  }
}

export function getCropAspectValue(ratio: CropAspectRatio): number {
  const target = CROP_ASPECT_RATIOS.find((option) => option.id === ratio);
  if (!target) {
    throw new Error("无法识别裁切比例。请重新选择后重试。");
  }
  return target.width / target.height;
}

export function getCenteredCrop(
  sourceWidth: number,
  sourceHeight: number,
  ratio: CropAspectRatio,
): CropRect {
  requirePositiveSize(
    sourceWidth,
    sourceHeight,
    "无法计算裁切区域。请重新打开图片后重试。",
  );
  const targetRatio = getCropAspectValue(ratio);
  const sourceRatio = sourceWidth / sourceHeight;
  const width =
    sourceRatio > targetRatio
      ? Math.round(sourceHeight * targetRatio)
      : sourceWidth;
  const height =
    sourceRatio > targetRatio
      ? sourceHeight
      : Math.round(sourceWidth / targetRatio);
  return {
    originX: Math.max(0, Math.floor((sourceWidth - width) / 2)),
    originY: Math.max(0, Math.floor((sourceHeight - height) / 2)),
    width,
    height,
  };
}

/** 返回 contentFit=contain 时，图片在裁切画布内实际可见的区域。 */
export function getContainedImageBounds(
  sourceWidth: number,
  sourceHeight: number,
  containerWidth: number,
  containerHeight: number,
): CropBox {
  requirePositiveSize(sourceWidth, sourceHeight, "无法读取图片尺寸。");
  requirePositiveSize(containerWidth, containerHeight, "裁切画布尺寸无效。");
  const scale = Math.min(
    containerWidth / sourceWidth,
    containerHeight / sourceHeight,
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
}

function getMaximumCropWidth(bounds: CropBox, aspect: number): number {
  return Math.min(bounds.width, bounds.height * aspect);
}

function getMinimumCropWidth(
  maximumWidth: number,
  aspect: number,
  minimumEdge: number,
): number {
  const preferredMinimum = aspect >= 1 ? minimumEdge * aspect : minimumEdge;
  return Math.min(maximumWidth, Math.max(1, preferredMinimum));
}

/** 建立居中、留白的初始框，让用户能直观看到并调整其位置。 */
export function getInitialCropBox(
  bounds: CropBox,
  ratio: CropAspectRatio,
  coverage = 0.86,
): CropBox {
  requirePositiveSize(bounds.width, bounds.height, "裁切画布尺寸无效。");
  const aspect = getCropAspectValue(ratio);
  const width = getMaximumCropWidth(bounds, aspect) * clamp(coverage, 0.1, 1);
  const height = width / aspect;
  return {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + (bounds.height - height) / 2,
    width,
    height,
  };
}

/** 拖动时限制裁切框的每一条边都位于图片可见范围内。 */
export function moveCropBox(
  crop: CropBox,
  bounds: CropBox,
  translationX: number,
  translationY: number,
): CropBox {
  const width = Math.min(Math.max(1, crop.width), bounds.width);
  const height = Math.min(Math.max(1, crop.height), bounds.height);
  return {
    x: clamp(crop.x + translationX, bounds.x, bounds.x + bounds.width - width),
    y: clamp(
      crop.y + translationY,
      bounds.y,
      bounds.y + bounds.height - height,
    ),
    width,
    height,
  };
}

/** 以右下角手柄缩放，始终保持用户选定的比例。 */
export function resizeCropBoxFromBottomRight(
  crop: CropBox,
  bounds: CropBox,
  ratio: CropAspectRatio,
  translationX: number,
  translationY: number,
  minimumEdge = 48,
): CropBox {
  const aspect = getCropAspectValue(ratio);
  const maximumWidth = Math.min(
    Math.max(1, bounds.x + bounds.width - crop.x),
    Math.max(1, (bounds.y + bounds.height - crop.y) * aspect),
  );
  const minimumWidth = getMinimumCropWidth(maximumWidth, aspect, minimumEdge);
  const widthFromHorizontalDrag = crop.width + translationX;
  const widthFromVerticalDrag = (crop.height + translationY) * aspect;
  const useHorizontalDrag =
    Math.abs(translationX) >= Math.abs(translationY * aspect);
  const width = clamp(
    useHorizontalDrag ? widthFromHorizontalDrag : widthFromVerticalDrag,
    minimumWidth,
    maximumWidth,
  );
  return { x: crop.x, y: crop.y, width, height: width / aspect };
}

/** 以裁切框中心为锚点处理双指缩放，并在边缘处自动回退。 */
export function resizeCropBoxFromCenter(
  crop: CropBox,
  bounds: CropBox,
  ratio: CropAspectRatio,
  scale: number,
  minimumEdge = 48,
): CropBox {
  const aspect = getCropAspectValue(ratio);
  const maximumWidth = getMaximumCropWidth(bounds, aspect);
  const minimumWidth = getMinimumCropWidth(maximumWidth, aspect, minimumEdge);
  const width = clamp(crop.width * scale, minimumWidth, maximumWidth);
  const height = width / aspect;
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  return {
    x: clamp(centerX - width / 2, bounds.x, bounds.x + bounds.width - width),
    y: clamp(centerY - height / 2, bounds.y, bounds.y + bounds.height - height),
    width,
    height,
  };
}

/** 将显示坐标的裁切框还原为原图像素坐标，供图片处理模块直接使用。 */
export function getSourceCropFromPreview(
  crop: CropBox,
  imageBounds: CropBox,
  sourceWidth: number,
  sourceHeight: number,
): CropRect {
  requirePositiveSize(sourceWidth, sourceHeight, "原图尺寸无效，无法裁切。");
  requirePositiveSize(
    imageBounds.width,
    imageBounds.height,
    "裁切画布尺寸无效。",
  );
  const visibleCrop = moveCropBox(crop, imageBounds, 0, 0);
  const scaleX = sourceWidth / imageBounds.width;
  const scaleY = sourceHeight / imageBounds.height;
  const originX = clamp(
    Math.floor((visibleCrop.x - imageBounds.x) * scaleX),
    0,
    sourceWidth - 1,
  );
  const originY = clamp(
    Math.floor((visibleCrop.y - imageBounds.y) * scaleY),
    0,
    sourceHeight - 1,
  );
  const right = clamp(
    Math.ceil((visibleCrop.x + visibleCrop.width - imageBounds.x) * scaleX),
    originX + 1,
    sourceWidth,
  );
  const bottom = clamp(
    Math.ceil((visibleCrop.y + visibleCrop.height - imageBounds.y) * scaleY),
    originY + 1,
    sourceHeight,
  );
  return { originX, originY, width: right - originX, height: bottom - originY };
}

/** 在调用原生裁切前再次收紧像素坐标，避免任何浮点或边界误差。 */
export function clampSourceCrop(
  crop: CropRect,
  sourceWidth: number,
  sourceHeight: number,
): CropRect {
  requirePositiveSize(sourceWidth, sourceHeight, "原图尺寸无效，无法裁切。");
  const width = clamp(Math.round(crop.width), 1, sourceWidth);
  const height = clamp(Math.round(crop.height), 1, sourceHeight);
  return {
    originX: clamp(Math.floor(crop.originX), 0, sourceWidth - width),
    originY: clamp(Math.floor(crop.originY), 0, sourceHeight - height),
    width,
    height,
  };
}

/** 优先保留用户选择的原图像素区域；没有手动选区时才使用居中默认值。 */
export function getSelectedOrCenteredCrop(
  selectedCrop: CropRect | undefined,
  sourceWidth: number,
  sourceHeight: number,
  ratio: CropAspectRatio,
): CropRect {
  return clampSourceCrop(
    selectedCrop ?? getCenteredCrop(sourceWidth, sourceHeight, ratio),
    sourceWidth,
    sourceHeight,
  );
}
