// #461: stream-json 입출력 형식 — 줄 하나 · 블록 순서 · 마지막 result 줄 · 깨진 줄
import { describe, expect, it } from "vitest";
import { buildImageInputLine, parseStreamResult } from "../cli-image-input";

describe("buildImageInputLine", () => {
  it("형식별 media_type · 이미지 뒤 텍스트 · 줄바꿈으로 끝나는 한 줄", () => {
    const cases = [
      ["jpeg", "image/jpeg"],
      ["png", "image/png"],
      ["webp", "image/webp"],
    ] as const;
    for (const [type, mediaType] of cases) {
      const line = buildImageInputLine(new Uint8Array([1, 2, 3]), type, "줄1\n줄2");
      expect(line.endsWith("\n")).toBe(true);
      expect(line.trimEnd().includes("\n")).toBe(false);
      const { message } = JSON.parse(line) as { message: { content: Array<Record<string, unknown>> } };
      expect(message.content[0]).toEqual({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: "AQID" },
      });
      expect(message.content[1]).toEqual({ type: "text", text: "줄1\n줄2" });
    }
  });
});

describe("parseStreamResult", () => {
  it("다른 줄과 깨진 줄을 건너뛰고 마지막 result 줄을 고른다", () => {
    const out = [
      '{"type":"system"}',
      "not json",
      '{"type":"result","result":"앞"}',
      "",
      '{"type":"result","result":"뒤"}',
      "null",
    ].join("\n");
    expect(parseStreamResult(out)?.result).toBe("뒤");
  });

  it("result 줄이 없으면 null", () => {
    expect(parseStreamResult("")).toBeNull();
    expect(parseStreamResult('{"type":"system"}\n')).toBeNull();
  });
});
