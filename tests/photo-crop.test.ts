import { describe, expect, it } from "vitest";

import {
  getCenteredCrop,
  getContainedImageBounds,
  getInitialCropBox,
  getSourceCropFromPreview,
  moveCropBox,
  resizeCropBoxFromBottomRight,
} from "../lib/crop-math";

describe("getCenteredCrop", () => {
  it("creates a centered landscape crop for a square output", () => {
    expect(getCenteredCrop(4000, 3000, "1:1")).toEqual({
      originX: 500,
      originY: 0,
      width: 3000,
      height: 3000,
    });
  });

  it("creates a centered portrait crop for a vertical output", () => {
    expect(getCenteredCrop(4000, 3000, "9:16")).toEqual({
      originX: 1156,
      originY: 0,
      width: 1688,
      height: 3000,
    });
  });
});

describe("manual crop geometry", () => {
  it("places a contain-fitted landscape image in the centre of a portrait canvas", () => {
    expect(getContainedImageBounds(4000, 3000, 300, 500)).toEqual({
      x: 0,
      y: 137.5,
      width: 300,
      height: 225,
    });
  });

  it("starts the manual frame inset and centred rather than at the top-left", () => {
    expect(
      getInitialCropBox({ x: 0, y: 137.5, width: 300, height: 225 }, "1:1"),
    ).toEqual({
      x: 53.25,
      y: 153.25,
      width: 193.5,
      height: 193.5,
    });
  });

  it("keeps a dragged frame inside the visible image bounds", () => {
    expect(
      moveCropBox(
        { x: 53.25, y: 153.25, width: 193.5, height: 193.5 },
        { x: 0, y: 137.5, width: 300, height: 225 },
        400,
        -400,
      ),
    ).toEqual({ x: 106.5, y: 137.5, width: 193.5, height: 193.5 });
  });

  it("resizes from the handle without changing the selected 4:3 proportion", () => {
    const resized = resizeCropBoxFromBottomRight(
      { x: 20, y: 30, width: 160, height: 120 },
      { x: 0, y: 0, width: 300, height: 220 },
      "4:3",
      80,
      10,
    );
    expect(resized).toEqual({ x: 20, y: 30, width: 240, height: 180 });
    expect(resized.width / resized.height).toBeCloseTo(4 / 3);
  });

  it("maps an off-centre portrait selection to the corresponding source pixels", () => {
    expect(
      getSourceCropFromPreview(
        { x: 105, y: 150, width: 90, height: 160 },
        { x: 75, y: 0, width: 150, height: 300 },
        3000,
        6000,
      ),
    ).toEqual({ originX: 600, originY: 2800, width: 1800, height: 3200 });
  });
});
