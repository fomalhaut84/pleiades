/**
 * 게시 루프의 순수 판정(014 · #807) — main.ts 의 루프가 쓴다. 따로 떼어 시험한다.
 */
import type { PauseReason, StepResult } from "./poster";

/** 결과별 다음 걸음까지 — 보낼 것이 있으면 바로(0 · 루프가 한 번 양보한다) · 기다릴 때는 최대 5 s 씩 끊어 다시 본다 */
export function pauseAfter(r: StepResult | null): number {
  if (r === null) return 5_000;
  switch (r.kind) {
    case "idle":
      return 1_000;
    case "paused":
      return 5_000;
    case "wait":
      return Math.min(r.ms, 5_000);
    case "retry":
      return Math.min(r.delayMs, 5_000);
    default:
      return 0;
  }
}

/**
 * 다음 멈춤 상태 — 멈춤은 웹훅 · 비밀 재료에 관한 상태라, 그와 무관한 결과(할 일 없음 · 기다림 · 루프 오류 · **나이 만료 dead**)는
 * 멈춤을 풀지 않는다. 나이 만료는 웹훅이 없어도 일어난다(#807) — 풀면 만료 1건마다 "게시 멈춤" 경고가 다시 나간다(#807 9-1 major).
 */
export function nextPaused(r: StepResult | null, paused: PauseReason | null): PauseReason | null {
  if (r === null) return paused;
  if (r.kind === "paused") return r.why;
  if (r.kind === "idle" || r.kind === "wait" || (r.kind === "dead" && r.reason === "age")) return paused;
  return null;
}
