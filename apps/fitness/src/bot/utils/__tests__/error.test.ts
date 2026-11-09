import { describe, expect, it } from "vitest";
import { sanitizeError, sanitizeMessage } from "../error";

// 1a-2 회귀 baseline (pleiades 003 §5-2 · pleiades#58). 분류 함수 3개는 pleiades#96 에서 지웠다 — 판정 정본은 @pleiades/notify.

describe("sanitizeMessage", () => {
  it("봇 토큰을 마스킹한다", () => {
    expect(sanitizeMessage("call bot123456:ABC-def_78 failed")).toBe(
      "call bot<REDACTED> failed",
    );
  });

  it("토큰이 없으면 원문을 유지한다", () => {
    expect(sanitizeMessage("plain message")).toBe("plain message");
  });
});

describe("sanitizeError", () => {
  it("Error 는 name: message 형태로 만든다", () => {
    expect(sanitizeError(new Error("boom"))).toBe("Error: boom");
  });

  it("cause 체인을 ' | ' 로 잇는다", () => {
    const inner = new TypeError("inner");
    const outer = new Error("outer", { cause: inner });
    expect(sanitizeError(outer)).toBe("Error: outer | TypeError: inner");
  });

  it("error 속성(HttpError 형태)도 따라간다", () => {
    const outer = Object.assign(new Error("outer"), {
      error: new Error("bot123:abc timed out"),
    });
    expect(sanitizeError(outer)).toBe(
      "Error: outer | Error: bot<REDACTED> timed out",
    );
  });

  it("체인은 최대 5단계까지만 따라간다", () => {
    let err: Error = new Error("e6");
    for (let i = 5; i >= 0; i--) {
      err = new Error(`e${i}`, { cause: err });
    }
    expect(sanitizeError(err)).toBe(
      "Error: e0 | Error: e1 | Error: e2 | Error: e3 | Error: e4",
    );
  });

  it("문자열 · 객체 · 직렬화 불가 값을 처리한다", () => {
    expect(sanitizeError("bot1:x")).toBe("bot<REDACTED>");
    expect(sanitizeError({ code: 1 })).toBe('{"code":1}');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(sanitizeError(circular)).toBe("[unserializable]");
  });

  it("null · undefined 는 빈 문자열이다", () => {
    expect(sanitizeError(null)).toBe("");
    expect(sanitizeError(undefined)).toBe("");
  });
});
