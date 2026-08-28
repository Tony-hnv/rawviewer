import { describe, expect, it } from "vitest";

import {
  BRAND_MARKS,
  buildFrameText,
  getContainedFrameImageRect,
  getPhotoFrameLayout,
  hasFrameInformation,
  isFilmFrame,
  isPhoneBrand,
  isRoundedFrame,
  type PhotoFrameRequest,
} from "../lib/photo-frame-math";
import {
  BRAND_LOGO_RESOURCE_NAMES,
  getBrandLogoResourceName,
} from "../lib/brand-logo";
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

  it("keeps the physical frame margins equal around the source image", () => {
    const layout = getPhotoFrameLayout(1600, 1000, "exif");
    expect(layout.imageLeft).toBe(layout.sideInset);
    expect(layout.imageTop).toBe(layout.sideInset);
    expect(layout.outputWidth - layout.imageLeft - layout.imageWidth).toBe(
      layout.sideInset,
    );
    expect(layout.informationTop).toBe(layout.imageTop + layout.imageHeight);
    expect(layout.informationHeight).toBeGreaterThan(layout.sideInset);
    expect(layout.outputHeight).toBe(
      layout.imageHeight + layout.sideInset + layout.informationHeight,
    );
  });

  it("uses an equal four-sided margin for a solid frame", () => {
    const layout = getPhotoFrameLayout(1200, 800, "solid");
    expect(layout.bottomInset).toBe(layout.sideInset);
    expect(layout.outputHeight - layout.imageTop - layout.imageHeight).toBe(
      layout.sideInset,
    );
  });

  it("provides a wider independent caption panel for a polaroid frame", () => {
    const layout = getPhotoFrameLayout(1200, 800, "polaroid");
    expect(hasFrameInformation("polaroid")).toBe(true);
    expect(isRoundedFrame("polaroid")).toBe(true);
    expect(layout.informationHeight).toBeGreaterThanOrEqual(
      layout.sideInset * 4,
    );
    expect(layout.imageTop).toBe(layout.sideInset);
    expect(layout.outputWidth - layout.imageWidth).toBe(layout.sideInset * 2);
  });

  it("formats film date-stamp text and identifies the film template", () => {
    const text = buildFrameText(file, null, { ...request, style: "film" });
    expect(isFilmFrame("film")).toBe(true);
    expect(text.title).toBe("RAW VIEW");
    expect(text.subtitle).toBe("HARBOR");
    expect(text.details).toMatch(/^1970\.01\.01$/);
  });

  it("maps every selectable brand to a dedicated offline Logo drawable", () => {
    expect(Object.keys(BRAND_LOGO_RESOURCE_NAMES)).toEqual(BRAND_MARKS);
    expect(getBrandLogoResourceName("Sony")).toBe("rawview_logo_sony");
    expect(getBrandLogoResourceName("Hasselblad")).toBe(
      "rawview_logo_hasselblad",
    );
    expect(getBrandLogoResourceName("OPPO")).toBe("rawview_logo_oppo");
    expect(new Set(Object.values(BRAND_LOGO_RESOURCE_NAMES)).size).toBe(
      BRAND_MARKS.length,
    );
  });
});
