// #665(012 4a-4): askAdvisor 호출 비용 상한 — 기본 $1.00 · 재시도 포함 전체 · CLI 인자.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ASK_ADVISOR_DEFAULT_MAX_BUDGET_USD,
  budgetArgs,
  remainingBudgetUsd,
  resolveMaxBudgetUsd,
} from "../advisor-budget";

const ADVISOR_SRC = readFileSync(join(__dirname, "..", "claude-advisor.ts"), "utf8");

describe("resolveMaxBudgetUsd", () => {
  it("없으면 기본 $1.00 — fin 크론 상한 · 012 D1 과 같다", () => {
    expect(ASK_ADVISOR_DEFAULT_MAX_BUDGET_USD).toBe(1.0);
    expect(resolveMaxBudgetUsd(undefined)).toBe(1.0);
    expect(resolveMaxBudgetUsd(0.25)).toBe(0.25);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("양의 유한수가 아니면 던진다: %s", (v) => {
    expect(() => resolveMaxBudgetUsd(v)).toThrow(/양의 유한수/);
  });
});

describe("remainingBudgetUsd — 재시도 포함 전체 상한", () => {
  it("남은 잔액을 준다", () => {
    expect(remainingBudgetUsd(1.0, 0)).toBe(1.0);
    expect(remainingBudgetUsd(1.0, 0.4)).toBeCloseTo(0.6);
  });

  it("다 썼거나 넘었으면 null — 더 부르지 않는다", () => {
    expect(remainingBudgetUsd(1.0, 1.0)).toBeNull();
    expect(remainingBudgetUsd(1.0, 1.2)).toBeNull();
  });
});

describe("budgetArgs", () => {
  it("--max-budget-usd 와 소수 넷째 자리 값", () => {
    expect(budgetArgs(1)).toEqual(["--max-budget-usd", "1.0000"]);
    expect(budgetArgs(0.6)).toEqual(["--max-budget-usd", "0.6000"]);
  });

  it("아주 작은 잔액도 0 으로 반올림하지 않는다 — 올림", () => {
    expect(budgetArgs(0.00001)).toEqual(["--max-budget-usd", "0.0001"]);
  });
});

describe("claude-advisor.ts 결선", () => {
  it("askAdvisor 가 상한을 정하고 시도마다 남은 잔액을 넘긴다", () => {
    expect(ADVISOR_SRC).toContain("const budgetCap = resolveMaxBudgetUsd(options.maxBudgetUsd);");
    expect(ADVISOR_SRC).toContain("const budget = remainingBudgetUsd(budgetCap, costSpent);");
    expect(ADVISOR_SRC).toContain("await askAdvisorOnce(effectivePrompt, options, budget);");
    // 비용 미상은 준 잔액을 다 쓴 것으로 — 재시도마다 상한 전액을 다시 주지 않는다(#665 9-1)
    expect(ADVISOR_SRC).toContain("costSpent += response.cost_usd ?? budget;");
  });

  it("CLI 실패 메시지에 비용·상한이 남는다 — 상한 도달 진단(#665 9-1)", () => {
    expect(ADVISOR_SRC).toMatch(/Claude CLI 실패 \(subtype=\$\{subtype\}, turns=\$\{numTurns\}\$\{costPart\}, cap=\$\$\{budgetUsd\.toFixed\(4\)\}\)/);
  });

  it("CLI 인자에 상한이 들어가고 성공 줄에 model · cap 이 남는다(K-5)", () => {
    expect(ADVISOR_SRC).toContain("...budgetArgs(budgetUsd),");
    expect(ADVISOR_SRC).toMatch(/\[askAdvisor\] channel=\$\{channel\} model=\$\{ADVISOR_MODEL\}/);
    expect(ADVISOR_SRC).toContain("cap=$${budgetUsd.toFixed(4)}");
  });

  it("askAdvisorOnce 는 askAdvisor 한 곳에서만 불린다 — 상한을 비켜 가는 호출이 없다", () => {
    expect(ADVISOR_SRC.match(/askAdvisorOnce\(/g)).toHaveLength(2); // 정의 1 + 호출 1
  });
});
