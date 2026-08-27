import { describe, expect, it } from "vitest";

import { getExifDisplayRows } from "../lib/exif-info";

describe("getExifDisplayRows", () => {
  it("formats camera metadata into concise display rows", () => {
    const exif = {
      status: "available" as const,
      message: "已读取 EXIF 信息。",
      make: "Sony",
      model: "ILCE-7M4",
      lensModel: "FE 24-70mm F2.8 GM",
      dateTime: "2026-08-27 10:30:12",
      focalLength: 35,
      aperture: 2.8,
      exposureTime: "1/125 s",
      iso: 400,
      width: 7008,
      height: 4672,
      orientation: 1,
    };

    expect(getExifDisplayRows(exif)).toEqual([
      { label: "相机", value: "Sony ILCE-7M4" },
      { label: "镜头", value: "FE 24-70mm F2.8 GM" },
      { label: "拍摄时间", value: "2026-08-27 10:30:12" },
      { label: "焦距", value: "35 mm" },
      { label: "光圈", value: "f/2.8" },
      { label: "快门", value: "1/125 s" },
      { label: "ISO", value: "400" },
      { label: "像素尺寸", value: "7008 × 4672 px" },
      { label: "方向", value: "EXIF 1" },
    ]);
  });

  it("omits unavailable optional fields", () => {
    expect(
      getExifDisplayRows({ status: "unavailable", message: "没有 EXIF。" }),
    ).toEqual([]);
  });
});
