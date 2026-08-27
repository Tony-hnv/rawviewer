import { describe, expect, it } from "vitest";

import { getCenteredCrop } from "../lib/crop-math";

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
