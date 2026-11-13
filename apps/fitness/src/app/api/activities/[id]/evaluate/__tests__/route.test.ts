// #666: 활동 AI 평가 route 는 error.message 원문을 돌려주지 않는다 — 분류된 한국어 정적 문구만.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ askAdvisor: vi.fn(), load: vi.fn() }));

vi.mock("@/lib/ai/claude-advisor", () => ({
  ADVISOR_MODEL: "sonnet",
  askAdvisor: mocks.askAdvisor,
  resetSession: vi.fn(),
}));
vi.mock("@/lib/ai/activity-eval/load", () => ({ loadActivityEvalInput: mocks.load }));
vi.mock("@/lib/ai/activity-eval/build-context", () => ({
  buildEvalContext: () => ({ prompt: "p", mode: "full", sections: [], omitted: [], templateFallback: true }),
}));
vi.mock("@/lib/prompts/resolve", () => ({ resolvePromptTemplate: vi.fn(async () => ({ body: "b", versionId: null })) }));
vi.mock("@/lib/prisma", () => ({
  default: {
    aIAdvice: { create: vi.fn() },
    systemAlertState: { updateMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { POST } from "../route";

function post(id: string) {
  return POST(new Request(`http://x/api/activities/${id}/evaluate`, { method: "POST" }), { params: Promise.resolve({ id }) });
}

describe("POST /api/activities/[id]/evaluate 오류 응답 (#666)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.load.mockResolvedValue({ activity: { ymd: "2026-11-13" } });
  });

  it("상한 도달은 전용 문구 · 원문 없음 · 원문은 서버 로그로", async () => {
    mocks.askAdvisor.mockRejectedValue(
      new Error("Claude CLI 실패 (subtype=error_max_budget_usd, turns=4, cap=$1.0000) | stderr=SECRET-STDERR"),
    );
    const res = await post("a1");
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("비용 상한");
    expect(data.error).not.toContain("SECRET-STDERR");
    expect(data.error).not.toContain("관리자에게 알림");
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("error_max_budget_usd");
  });

  it("빈 응답은 기존 정적 문구 그대로다", async () => {
    mocks.askAdvisor.mockResolvedValue({ result: "  ", duration_ms: 1, systemPromptVersionId: null });
    const res = await post("a1");
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("어드바이저가 빈 응답을 돌려줬습니다");
  });

  it("알 수 없는 실패는 원문 대신 일반 문구다", async () => {
    mocks.askAdvisor.mockRejectedValue(new Error("Claude CLI 에러 (code 1): SECRET-STDERR"));
    const data = await (await post("a1")).json();
    expect(data.error).not.toContain("SECRET-STDERR");
    expect(data.error).toContain("AI 요청 처리 중 오류");
  });

  it("404 · 400 정적 문구는 그대로다", async () => {
    mocks.load.mockResolvedValue(null);
    const res = await post("nope");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("활동을 찾을 수 없습니다");
  });
});
