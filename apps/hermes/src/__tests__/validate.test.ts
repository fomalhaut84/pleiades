// 014 §2 API v1 — 본문 · Idempotency-Key 검증(H-1a · #791)
import { describe, expect, it } from "vitest";
import { validateIdempotencyKey, validateMessage } from "../validate";

const ok = (body: unknown) => validateMessage(JSON.stringify(body));

describe("validateMessage", () => {
  it("최소 · 기본 level info", () => {
    expect(ok({ text: "주문 #1" })).toEqual({ ok: true, value: { text: "주문 #1", level: "info" } });
  });

  it("모든 칸", () => {
    expect(
      ok({ title: "새 주문", text: "a\nb", link: { label: "보기", url: "https://shop.example.com/o/1" }, level: "warn" }),
    ).toEqual({
      ok: true,
      value: { title: "새 주문", text: "a\nb", link: { label: "보기", url: "https://shop.example.com/o/1" }, level: "warn" },
    });
  });

  it("길이는 글자(코드 포인트)로 센다 — 이모지 1500개는 통과", () => {
    expect(ok({ text: "📦".repeat(1500) }).ok).toBe(true);
    expect(ok({ text: "📦".repeat(1501) })).toEqual({ ok: false, reason: "text" });
    expect(ok({ text: "a", title: "가".repeat(100) }).ok).toBe(true);
  });

  it.each([
    ["JSON 아님", "{", "json"],
    ["배열", "[]", "shape"],
    ["null", "null", "shape"],
  ])("%s → %s", (_n, raw, reason) => {
    expect(validateMessage(raw)).toEqual({ ok: false, reason });
  });

  it.each([
    ["text 없음", {}, "text"],
    ["text 공백만", { text: "  \n " }, "text"],
    ["text 숫자", { text: 1 }, "text"],
    ["text 제어 문자", { text: "a\u0000b" }, "text"],
    ["title 줄바꿈", { text: "a", title: "a\nb" }, "title"],
    ["title 101자", { text: "a", title: "가".repeat(101) }, "title"],
    ["level 모름", { text: "a", level: "error" }, "level"],
    ["link http", { text: "a", link: { label: "x", url: "http://a.com" } }, "link"],
    ["link 주소 안 줄바꿈(#791 9-1 major)", { text: "a", link: { label: "x", url: "https://ex\nample.com/a\nFAKE LINE" } }, "link"],
    ["link 주소 앞뒤 공백", { text: "a", link: { label: "x", url: "  https://example.com/x " } }, "link"],
    ["link 주소 탭", { text: "a", link: { label: "x", url: "https://example.com/\tx" } }, "link"],
    ["link 주소 백슬래시(#794 9-1 critical)", { text: "a", link: { label: "x", url: "https://a.com\\@evil.com/x" } }, "link"],
    ["link 계정 포함", { text: "a", link: { label: "x", url: "https://u:p@a.com" } }, "link"],
    ["link 주소 아님", { text: "a", link: { label: "x", url: "not a url" } }, "link"],
    ["link label 없음", { text: "a", link: { url: "https://a.com" } }, "link"],
    ["link label 줄바꿈", { text: "a", link: { label: "a\nb", url: "https://a.com" } }, "link"],
    ["link 모르는 칸", { text: "a", link: { label: "x", url: "https://a.com", icon: 1 } }, "link"],
    ["link 둘(배열)", { text: "a", link: [{ label: "x", url: "https://a.com" }] }, "link"],
    ["모르는 칸", { text: "a", channel: "admin" }, "unknown-field"],
  ])("%s → %s", (_n, body, reason) => {
    expect(ok(body)).toEqual({ ok: false, reason });
  });
});

describe("validateIdempotencyKey", () => {
  it("없으면 null · 있으면 그대로", () => {
    expect(validateIdempotencyKey(undefined)).toEqual({ ok: true, value: null });
    expect(validateIdempotencyKey("order-123:v1")).toEqual({ ok: true, value: "order-123:v1" });
  });
  it.each([["빈 값", ""], ["129자", "k".repeat(129)], ["공백", "a b"], ["한글", "주문"], ["여러 개", ["a", "b"]]])(
    "%s → 거부",
    (_n, v) => {
      expect(validateIdempotencyKey(v as string)).toEqual({ ok: false, reason: "idempotency-key" });
    },
  );
});
