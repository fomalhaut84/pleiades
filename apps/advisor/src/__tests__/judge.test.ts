// #680 — 순수 판정(X1 judge.cjs 이식 · 대화용 judgeAnswer).
import { describe, expect, it } from "vitest";
import { BUILTIN_PLUGINS, judgeAnswer, judgeDrift, judgeInit, parseStream, safeName } from "../judge";
import { initLine, resultLine, toolResult, toolUse } from "./helpers/stream";

const FIN = "mcp__myfinance__get_portfolio";
const FIT = "mcp__myfitness__get_sleep";
const ALLOW = new Set([FIN, FIT]);
const KEYS = ["myfinance", "myfitness"];
const PIN = { haiku: "claude-h", sonnet: "claude-s" };
const lines = (...xs: unknown[]) => xs.map((x) => JSON.stringify(x)).join("\n");

describe("safeName", () => {
  it("이름 형식만 통과 · 나머지는 ?", () => {
    expect(safeName("error_max_turns")).toBe("error_max_turns");
    expect(safeName("a b")).toBe("?");
    expect(safeName(3)).toBe("?");
  });
});

describe("parseStream", () => {
  it("도구 호출 · 결과 성공 여부 · 마지막 result", () => {
    const { calls, result } = parseStream(lines(toolUse("t1", FIN), toolResult("t1"), toolUse("t2", FIT), toolResult("t2", true), resultLine()) + "\n깨진 줄");
    expect(calls).toEqual([{ name: FIN, ok: true }, { name: FIT, ok: false }]);
    expect(result?.subtype).toBe("success");
  });
});

describe("judgeInit (fail-closed)", () => {
  it("정상 init 은 통과", () => {
    expect(judgeInit(initLine([FIN, FIT], KEYS), ALLOW, KEYS)).toMatchObject({ ok: true, connected: 2, outside: 0 });
  });

  it("init 앞 hook 이벤트는 위반(#635)", () => {
    expect(judgeInit({ type: "system", subtype: "hook_started" }, ALLOW, KEYS)).toMatchObject({ ok: false, kind: "violation" });
  });

  it("플러그인은 위반 · 실측 내장 출처만 뺀다", () => {
    const builtin = [...BUILTIN_PLUGINS].map((source) => ({ name: "x", source }));
    expect(judgeInit(initLine([FIN, FIT], KEYS, { plugins: builtin }), ALLOW, KEYS)).toMatchObject({ ok: true, builtin: 3 });
    expect(judgeInit(initLine([FIN, FIT], KEYS, { plugins: [{ name: "evil", source: "evil@builtin" }] }), ALLOW, KEYS))
      .toMatchObject({ ok: false, kind: "violation", why: "플러그인" });
  });

  it("목록 밖 도구(내장 도구 포함)는 위반", () => {
    expect(judgeInit(initLine([FIN, FIT, "Bash"], KEYS), ALLOW, KEYS)).toMatchObject({ ok: false, why: "목록 밖 도구", outside: 1 });
  });

  it("서버 수·이름이 다르면 위반", () => {
    expect(judgeInit(initLine([FIN], ["myfinance", "other"]), ALLOW, KEYS)).toMatchObject({ ok: false, why: "MCP 서버" });
  });

  it("미연결 · 알 수 없는 상태 · init 없음은 형식", () => {
    const pending = { ...initLine([FIN, FIT], KEYS), mcp_servers: [{ name: "myfinance", status: "connected" }, { name: "myfitness", status: "pending" }] };
    expect(judgeInit(pending, ALLOW, KEYS)).toMatchObject({ ok: false, kind: "format", why: "MCP 미연결" });
    const weird = { ...pending, mcp_servers: [{ name: "myfinance", status: "connected" }, { name: "myfitness", status: "zzz" }] };
    expect(judgeInit(weird, ALLOW, KEYS)).toMatchObject({ kind: "format", why: "알 수 없는 MCP 상태" });
    expect(judgeInit(null, ALLOW, KEYS)).toMatchObject({ kind: "format", why: "init 없음" });
    expect(judgeInit({ type: "system", subtype: "init", tools: [] }, ALLOW, KEYS)).toMatchObject({ kind: "format", why: "init 필드 없음" });
  });
});

describe("judgeAnswer", () => {
  const ok = judgeInit(initLine([FIN, FIT], KEYS), ALLOW, KEYS);
  const prefixes = ["mcp__myfinance__", "mcp__myfitness__"];

  it("완료 — 텍스트 · 세션 id · 비용 · 도메인별 호출", () => {
    const v = judgeAnswer({ out: lines(toolUse("a", FIN), toolResult("a"), resultLine()), timedOut: false, init: ok }, ALLOW, prefixes, PIN);
    expect(v).toMatchObject({ status: "완료", text: "답입니다", cost: 0.1234, turns: 3, contextTokens: 1200, outside: 0, violation: false });
    expect(v.sessionId).toBe("11111111-2222-3333-4444-555555555555");
    expect(v.byPrefix["mcp__myfinance__"]).toEqual({ n: 1, ok: 1 });
  });

  it("상한 도달 · timeout · result 없음 · 실패 subtype", () => {
    const run = (out: string, timedOut = false) => judgeAnswer({ out, timedOut, init: ok }, ALLOW, prefixes, PIN);
    expect(run(lines(resultLine({ subtype: "error_max_budget_usd", is_error: true })))).toMatchObject({ status: "상한", text: "" });
    expect(run(lines(resultLine()), true)).toMatchObject({ status: "오류", code: "timeout" });
    expect(run("")).toMatchObject({ status: "오류", code: "no-result" });
    expect(run(lines(resultLine({ subtype: "error_max_turns", is_error: true })))).toMatchObject({ status: "오류", code: "error_max_turns" });
  });

  it("init 실패면 init 상태", () => {
    expect(judgeAnswer({ out: "", timedOut: false, init: null }, ALLOW, prefixes, PIN)).toMatchObject({ status: "init", violation: false });
    const bad = judgeInit(initLine([FIN, FIT, "Bash"], KEYS), ALLOW, KEYS);
    expect(judgeAnswer({ out: "", timedOut: false, init: bad }, ALLOW, prefixes, PIN)).toMatchObject({ status: "init", violation: true });
  });

  it("목록 밖 호출을 센다 · 이상한 세션 id 는 버린다", () => {
    const v = judgeAnswer({ out: lines(toolUse("x", "mcp__myfinance__add_transaction"), resultLine({ session_id: "../../etc" })), timedOut: false, init: ok },
      ALLOW, prefixes, PIN);
    expect(v.outside).toBe(1);
    expect(v.sessionId).toBeNull();
  });
});

// 회귀: #680 9-1 — major M2(드리프트) · M3(캐시 토큰) · info 7(init 뒤 hook)
describe("judgeAnswer — 9-1 반영", () => {
  const ok = judgeInit(initLine([FIN, FIT], KEYS), ALLOW, KEYS);
  const prefixes = ["mcp__myfinance__", "mcp__myfitness__"];
  const run = (out: string) => judgeAnswer({ out, timedOut: false, init: ok }, ALLOW, prefixes, PIN);

  it("드리프트 — 핀 밖 모델 · sonnet 없음 · modelUsage 없음", () => {
    expect(judgeDrift({ "claude-s": {}, "claude-h": {} }, PIN)).toBe("없음");
    expect(judgeDrift({ "claude-other": {} }, PIN)).toBe("있음");
    expect(judgeDrift({ "claude-h": {} }, PIN)).toBe("있음");
    expect(judgeDrift(undefined, PIN)).toBe("판정 불가");
    expect(run(lines(resultLine({ modelUsage: { "claude-x": {} } }))).drift).toBe("있음");
  });

  it("컨텍스트 = input + cache_read + cache_creation", () => {
    const usage = { input_tokens: 10, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 15_000 };
    expect(run(lines(resultLine({ usage }))).contextTokens).toBe(105_010);
    expect(run(lines(resultLine({ usage: {} }))).contextTokens).toBeNull();
  });

  it("init 뒤 hook 이벤트도 위반 — 답을 내지 않는다", () => {
    const v = run(lines({ type: "system", subtype: "hook_started" }, resultLine()));
    expect(v).toMatchObject({ status: "init", code: "violation:hook", violation: true, text: "" });
  });
});
