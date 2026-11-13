// #665(012 4a-4 · K-5 · 011 W2): askAdvisor 호출당 비용 상한.
// 지금까지 fit 은 `--max-turns 15` 만 있고 비용 상한이 없었다 — 통합 층·크론·로컬 개발이 같은 계정 쿼터를 쓰므로(012 U2) 상한을 둔다.
//
// 기본 $1.00 — fin 크론 호출 상한과 같고 012 대장 D1(통합 층 호출당 상한)과 같다.
// 근거(011 S1b 서버 14일): fit 호출 평균 대화 $0.163(p90 $0.374) · 아침·저녁 리포트 $0.185~0.195(p90 $0.24) · 주간 $0.361(2회) →
// 기본값은 관측 최댓값의 약 2.7배 여유. 상한에 닿은 호출은 CLI 가 `error_max_budget_usd` 로 끝내고 askAdvisor 는 실패로 던진다.
//
// 상한은 **askAdvisor 한 번(재시도 포함) 전체**에 건다 — 재시도마다 새 상한을 주면 합계가 (재시도 수 + 1) 배가 된다(fin #487 P1 과 같은 이유).

export const ASK_ADVISOR_DEFAULT_MAX_BUDGET_USD = 1.0;

/** 호출부 값 검증 — 양의 유한수만. 없으면 기본값. */
export function resolveMaxBudgetUsd(value: number | undefined): number {
  const budget = value ?? ASK_ADVISOR_DEFAULT_MAX_BUDGET_USD;
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Error(`askAdvisor: maxBudgetUsd 는 양의 유한수여야 한다 (받은 값: ${String(value)})`);
  }
  return budget;
}

/** 이번 시도에 줄 상한. 이미 다 썼으면 null — 호출하지 않고 실패로 끝낸다. */
export function remainingBudgetUsd(cap: number, spent: number): number | null {
  const remaining = cap - spent;
  return remaining > 0 ? remaining : null;
}

/** CLI 인자 — 소수 넷째 자리까지(CLI 가 받는 형식 · 남은 잔액이 아주 작아도 0 으로 반올림하지 않게 올림). */
export function budgetArgs(budgetUsd: number): string[] {
  return ["--max-budget-usd", (Math.ceil(budgetUsd * 10_000) / 10_000).toFixed(4)];
}
