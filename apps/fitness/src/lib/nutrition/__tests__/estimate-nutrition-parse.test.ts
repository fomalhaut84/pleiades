// #626 — 식단 AI 응답 검증 실패 사유 · 프롬프트와 검증의 kcal null 모순
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  describeParseFailure,
  parseNutritionResponse,
  parseNutritionResponseDetailed,
} from "../estimate-nutrition";

const item = (name: string, kcal: number | null, p: number | null, c: number | null, f: number | null) => ({
  name,
  kcal,
  protein_g: p,
  carbs_g: c,
  fat_g: f,
});
const body = (items: unknown[], total: unknown) => JSON.stringify({ items, total_kcal: total, confidence: "med" });
const RICE = item("밥", 300, 6, 66, 1); // 6·4 + 66·4 + 1·9 = 297
const STEW = item("김치찌개", 350, 22, 15, 20); // 88 + 60 + 180 = 328

describe("parseNutritionResponseDetailed — 실패 사유(#626)", () => {
  it("정상 응답은 통과하고 기존 함수와 같은 값", () => {
    const text = body([RICE, STEW], 650);
    const r = parseNutritionResponseDetailed(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estimate).toEqual(parseNutritionResponse(text));
    expect(parseNutritionResponse(text)?.kcal).toBe(650);
  });

  it("코드 펜스 · 앞뒤 글이 있어도 JSON 을 찾는다(기존 동작)", () => {
    expect(parseNutritionResponseDetailed("```json\n" + body([RICE], 300) + "\n```").ok).toBe(true);
    expect(parseNutritionResponseDetailed("추정 결과입니다.\n" + body([RICE], 300)).ok).toBe(true);
  });

  const cases: Array<[string, string, string, number]> = [
    ["빈 응답", "", "empty", 0],
    ["JSON 없음", "사진을 확인할 수 없습니다", "json", 0],
    ["깨진 JSON", '{"items": [', "json", 0],
    ["배열", "[1,2]", "shape", 0],
    ["total 없음", JSON.stringify({ items: [RICE] }), "total", 1],
    ["items 비어 있음", body([], 300), "items", 0],
    ["항목 이름 없음", body([{ kcal: 300 }], 300), "item-shape", 1],
    ["항목 kcal null", body([RICE, item("소주", null, null, null, null)], 300), "kcal-null", 2],
    ["항목 합 ≠ total", body([RICE, STEW], 900), "sum", 2],
    ["total 음수", body([RICE], -1), "total", 1],
    ["total 상한 초과", body([RICE], 1e9), "total", 1],
    ["items 상한 초과", body(Array.from({ length: 16 }, () => RICE), 4800), "items", 16],
    ["항목 kcal 상한 초과(3000)", body([item("뷔페", 3500, null, null, null)], 3500), "item-range", 1],
    ["매크로 4·4·9 불일치", body([item("소주 1병", 400, 0, 0, 0)], 400), "macro", 1],
  ];
  it.each(cases)("%s → reason %s", (_label, text, reason, items) => {
    const r = parseNutritionResponseDetailed(text);
    expect(r).toEqual({ ok: false, reason, items });
  });

  it("실패 로그 꼬리는 사유 · 길이 · 항목 수뿐 — 응답 원문(음식 이름)을 담지 않는다", () => {
    const text = body([RICE, item("비밀메뉴", null, null, null, null)], 300);
    const r = parseNutritionResponseDetailed(text);
    if (r.ok) throw new Error("실패해야 한다");
    const tail = describeParseFailure(r, text);
    expect(tail).toBe(`reason=kcal-null len=${text.length} items=2`);
    expect(tail).not.toContain("비밀메뉴");
  });
});

describe("프롬프트 — kcal 은 null 로 두지 않게(#626)", () => {
  const dir = path.join(__dirname, "..");
  it.each(["estimate-nutrition.ts", "estimate-nutrition-photo.ts"])("%s", (file) => {
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    // 검증은 kcal null 항목이 있으면 응답 전체를 버린다 — 프롬프트가 null 을 허용하면 그대로 실패한다
    expect(src).not.toContain("모르는 항목의 kcal/매크로는 해당 필드를 null 로");
    expect(src).toContain("null 금지");
    // 응답 원문을 로그에 싣던 줄이 돌아오지 않게
    expect(src).not.toMatch(/AI 응답 파싱\/검증 실패: \$\{text/);
  });
});
