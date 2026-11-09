// 회귀: pleiades#196 — 기본 싱크 순서에서 프로필이 활동보다 먼저다(역치 변경 직후 첫 싱크의 강도 분류)
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

import { SYNC_ORDER } from "../sync";

const at = (t: string) => SYNC_ORDER.indexOf(t as (typeof SYNC_ORDER)[number]);

describe("SYNC_ORDER", () => {
  it("user_profile 이 activities 보다 먼저", () => {
    expect(at("user_profile")).toBeGreaterThanOrEqual(0);
    expect(at("user_profile")).toBeLessThan(at("activities"));
  });

  it("fitness_metrics 는 user_profile 앞 (#378) · OMRON 은 Garmin 체중·혈압 뒤 (#514)", () => {
    expect(at("fitness_metrics")).toBeLessThan(at("user_profile"));
    expect(at("omron_body_composition")).toBeGreaterThan(at("body_composition"));
    expect(at("omron_blood_pressure")).toBeGreaterThan(at("blood_pressure"));
  });

  it("타입은 한 번씩만", () => {
    expect(new Set(SYNC_ORDER).size).toBe(SYNC_ORDER.length);
  });
});
