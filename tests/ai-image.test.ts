import { describe, expect, it } from "vitest";

import {
  expectedRotatedSize,
  extractImageResult,
  normalizeApiBaseUrl,
  validateAiSettings,
} from "../lib/ai-image-math";

describe("图片旋转和 AI API 纯函数", () => {
  it("按旋转角度正确计算输出尺寸", () => {
    expect(expectedRotatedSize(4000, 3000, 90)).toEqual({
      width: 3000,
      height: 4000,
    });
    expect(expectedRotatedSize(4000, 3000, 180)).toEqual({
      width: 4000,
      height: 3000,
    });
    expect(expectedRotatedSize(4000, 3000, 270)).toEqual({
      width: 3000,
      height: 4000,
    });
  });

  it("补齐并规范化 OpenAI-compatible API 的 v1 路径", () => {
    expect(normalizeApiBaseUrl("https://example.com")).toBe(
      "https://example.com/v1",
    );
    expect(normalizeApiBaseUrl("https://example.com/v1/")).toBe(
      "https://example.com/v1",
    );
  });

  it("识别常见的 AI 图片返回格式", () => {
    expect(
      extractImageResult({ data: [{ url: "https://example.com/output.png" }] }),
    ).toBe("https://example.com/output.png");
    expect(extractImageResult({ data: [{ b64_json: "YWJj" }] })).toBe(
      "data:image/png;base64,YWJj",
    );
    expect(extractImageResult("data:image/jpeg;base64,AAAA")).toBe(
      "data:image/jpeg;base64,AAAA",
    );
    expect(extractImageResult({ data: [{ text: "not an image" }] })).toBeNull();
  });

  it("拒绝缺少必要信息或不支持协议的 API 配置", () => {
    expect(validateAiSettings({ baseUrl: "", model: "", apiKey: "" })).toBe(
      "请输入 API 地址。",
    );
    expect(
      validateAiSettings({
        baseUrl: "ftp://example.com/v1",
        model: "gpt-image-1",
        apiKey: "sk-test",
      }),
    ).toBe("API 地址必须使用 http:// 或 https://。");
    expect(
      validateAiSettings({
        baseUrl: "http://192.168.1.20:1234/v1",
        model: "gpt-image-1",
        apiKey: "local-key",
      }),
    ).toBeNull();
    expect(
      validateAiSettings({
        baseUrl: "https://example.com/v1",
        model: "gpt-image-1",
        apiKey: "sk-test",
      }),
    ).toBeNull();
  });
});
