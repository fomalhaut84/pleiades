// #552 R6: 시스템 프롬프트 버전이 바뀌면 다음 호출에서 새 세션 — 웹 · 봇이 별도 프로세스라 활성화 시점에 세션을 비울 수 없다
import { afterEach, describe, expect, it } from "vitest";
import { contextTokensOf, getSession, resetAll, setSession } from "../session-store";

describe("session-store 시스템 프롬프트 버전", () => {
  afterEach(() => resetAll());

  it("같은 버전이면 세션을 이어 쓴다", () => {
    setSession("web", "s1", 10, "pv1");
    expect(getSession("web", "pv1")).toBe("s1");
  });

  it("다른 버전이 활성화되면 세션을 버린다 (다시 조회해도 없음)", () => {
    setSession("web", "s1", 10, "pv1");
    expect(getSession("web", "pv2")).toBeNull();
    expect(getSession("web")).toBeNull();
  });

  it("폴백 (null) ↔ DB 버전 전환도 새 세션", () => {
    setSession("discord", "s1", 10, null);
    expect(getSession("discord", "pv1")).toBeNull();
  });

  it("버전을 넘기지 않는 조회 (getSessionId) 는 버전을 보지 않는다", () => {
    setSession("web", "s1", 10, "pv1");
    expect(getSession("web")).toBe("s1");
  });
});

// 회귀: pleiades#683 — 상한이 `input_tokens` 만 누적해 `--resume` 대화(입력 대부분이 캐시)에서 사실상 걸리지 않았다.
// 통합 층(apps/advisor · #680)과 같이 마지막 호출의 컨텍스트 크기(입력 + 캐시 읽기 + 캐시 생성)로 판정한다.
describe("session-store 컨텍스트 상한", () => {
  afterEach(() => resetAll());

  it("컨텍스트 크기 = input + cache_read + cache_creation", () => {
    expect(contextTokensOf({ input_tokens: 5, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 2_000 })).toBe(92_005);
    expect(contextTokensOf({ input_tokens: 5 })).toBe(5);
  });

  it("여러 턴의 합산 usage 는 턴 수로 나눈다 — 도구 왕복이 많아도 일찍 끊지 않는다 (9-1 major)", () => {
    // 컨텍스트 ~22.5k 를 4 턴 동안 캐시로 다시 읽으면 합이 90k — 합으로 보면 상한 근처, 실제는 4 분의 1
    expect(contextTokensOf({ input_tokens: 40, cache_read_input_tokens: 90_000 }, 4)).toBe(22_510);
    expect(contextTokensOf({ input_tokens: 40, cache_read_input_tokens: 90_000 }, 1)).toBe(90_040);
    expect(contextTokensOf({ input_tokens: 40, cache_read_input_tokens: 90_000 }, "4")).toBe(90_040); // 숫자가 아니면 나누지 않는다
    setSession("discord", "s1", contextTokensOf({ input_tokens: 3, cache_read_input_tokens: 200_000 }, 4), null);
    expect(getSession("discord")).toBe("s1");
  });

  it("input_tokens 가 없으면 판정 불가(null)", () => {
    expect(contextTokensOf(undefined)).toBeNull();
    expect(contextTokensOf({ cache_read_input_tokens: 10 })).toBeNull();
    expect(contextTokensOf({ input_tokens: Number.NaN })).toBeNull();
  });

  it("캐시가 대부분인 대화도 상한을 넘으면 다음 조회에서 새 세션", () => {
    setSession("discord", "s1", contextTokensOf({ input_tokens: 3, cache_read_input_tokens: 100_500 }), null);
    expect(getSession("discord")).toBeNull();
  });

  it("누적하지 않고 마지막 호출의 크기로 바꾼다", () => {
    setSession("web", "s1", 60_000, null);
    setSession("web", "s1", 60_000, null);
    expect(getSession("web")).toBe("s1");
  });

  it("크기를 모르면(null) 직전 값을 유지한다", () => {
    setSession("web", "s1", 100_001, null);
    setSession("web", "s1", null, null);
    expect(getSession("web")).toBeNull();
  });
});
