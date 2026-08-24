import { describe, expect, it } from "vitest";

import {
  createFileName,
  formatBytes,
  getFileDescriptor,
  sanitizeBaseName,
} from "../lib/raw-files";

describe("RAW 文件识别", () => {
  it("识别四个相机品牌的 RAW 格式", () => {
    expect(getFileDescriptor("DSC0001.ARW")).toMatchObject({ kind: "raw", brand: "Sony" });
    expect(getFileDescriptor("IMG_0001.CR3")).toMatchObject({ kind: "raw", brand: "Canon" });
    expect(getFileDescriptor("NIK_0001.NEF")).toMatchObject({ kind: "raw", brand: "Nikon" });
    expect(getFileDescriptor("PANA0001.RW2")).toMatchObject({ kind: "raw", brand: "Panasonic" });
  });

  it("保留受支持图像格式并拒绝其他格式", () => {
    expect(getFileDescriptor("cover.jpeg")).toMatchObject({ kind: "image", brand: "Image" });
    expect(getFileDescriptor("notes.pdf")).toBeNull();
  });

  it("安全生成并保持扩展名", () => {
    expect(sanitizeBaseName('  trip:2026/08  ')).toBe("trip202608");
    expect(createFileName("trip:2026", "arw")).toBe("trip2026.arw");
  });

  it("格式化合理的文件大小", () => {
    expect(formatBytes(1024 * 1024 * 3.4)).toBe("3.4 MB");
  });
});
