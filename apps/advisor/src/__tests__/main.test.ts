// #679 — 골격 진입점은 아무것도 띄우지 않고 1 로 끝난다(코어 전).
import { describe, expect, it } from "vitest";
import { NOT_READY, main } from "../main";

describe("advisor main (4b-1a 골격)", () => {
  it("코어 전에는 안내 한 줄과 함께 1 을 돌려준다", () => {
    const lines: string[] = [];
    expect(main((l) => lines.push(l))).toBe(1);
    expect(lines).toEqual([NOT_READY]);
  });
});
