import { describe, expect, it } from "vitest";

import {
  buildFrameText,
  getContainedFrameImageRect,
  getBrandMonogram,
  isPhoneBrand,
  type PhotoFrameRequest,
} from "../lib/photo-frame-math";
import type { LibraryFile } from "@/lib/raw-files";

const file: LibraryFile = {
  id: "file-1",
  fileName: "harbor.jpg",
  baseName: "harbor",
  extension: "jpg",
  kind: "image",
  brand: "Image",
  uri: "file:///private/raw-view-library/harbor.jpg",
  size: 100,
  importedAt: 1,
};

const request: PhotoFrameRequest = {
  style: "exif",
  themeId: "white",
  brandMark: "Sony",
};

describe("photo frame metadata", () => {
  it("builds an EXIF caption in photography reading order", () => {
    const text = buildFrameText(
      file,
      {
        status: "available",
        message: "ok",
        make: "Sony",
        model: "ILCE-7M4",
        lensModel: "FE 35mm F1.4 GM",
        aperture: 2.8,
        exposureTime: "1/250 s",
        iso: 100,
        focalLength: 35,
      },
      request,
    );
    expect(text.title).toBe("Sony ILCE-7M4");
    expect(text.subtitle).toBe("FE 35mm F1.4 GM");
    expect(text.details).toBe("f/2.8 · 1/250 s · ISO 100 · 35mm");
  });

  it("uses the selected brand mark and safe fallback text", () => {
    const text = buildFrameText(file, null, {
      ...request,
      style: "brand",
      brandMark: "Xiaomi",
    });
    expect(text.title).toBe("XIAOMI");
    expect(text.subtitle).toBe("harbor.jpg");
    expect(text.details).toBe("本地图片副本");
  });

  it("contains the source image without changing its aspect ratio", () => {
    const rect = getContainedFrameImageRect(400, 300, 600, 250);
    expect(rect).toEqual({
      left: 133.33333333333331,
      top: 0,
      width: 333.33333333333337,
      height: 250,
    });
    expect(rect.width / rect.height).toBeCloseTo(400 / 300);
  });

  it("distinguishes camera and phone brands for visual icon badges", () => {
    expect(isPhoneBrand("Apple")).toBe(true);
    expect(isPhoneBrand("Nikon")).toBe(false);
    expect(getBrandMonogram("Sony")).toBe("S");
  });
});
