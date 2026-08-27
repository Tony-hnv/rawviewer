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

export function getCenteredCrop(
  sourceWidth: number,
  sourceHeight: number,
  ratio: CropAspectRatio,
): CropRect {
  const target = CROP_ASPECT_RATIOS.find((option) => option.id === ratio);
  if (!target || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("无法计算裁切区域。请重新打开图片后重试。");
  }
  const targetRatio = target.width / target.height;
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
