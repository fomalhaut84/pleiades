// #666: 웹 AI route 는 error.message 원문(CLI stderr 일부 포함 가능)을 돌려주지 않는다 — 분류된 한국어 정적 문구만.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ askAdvisor: vi.fn(), create: vi.fn() }));

vi.mock("@/lib/ai/claude-advisor", () => ({
  askAdvisor: mocks.askAdvisor,
  resetSession: vi.fn(),
  getSessionId: vi.fn(() => null),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    aIAdvice: { create: mocks.create },
    systemAlertState: { updateMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { POST } from "../route";

function post(body: unknown) {
  return POST(new Request("http://x/api/ai", { method: "POST", body: JSON.stringify(body) }));
}

describe("POST /api/ai 오류 응답 (#666)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("상한 도달은 전용 문구 · 원문 없음 · 원문은 서버 로그로", async () => {
    const raw = "Claude CLI 실패 (subtype=error_max_budget_usd, turns=7, cost=$1.0123, cap=$1.0000) | stderr=SECRET-STDERR";
    mocks.askAdvisor.mockRejectedValue(new Error(raw));
    const res = await post({ prompt: "오늘 어때?" });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("비용 상한");
    expect(data.error).not.toContain("SECRET-STDERR");
    expect(data.error).not.toContain("subtype");
    expect(data.error).not.toContain("관리자에게 알림");
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("error_max_budget_usd");
  });

  it("알 수 없는 실패도 원문을 돌려주지 않는다", async () => {
    mocks.askAdvisor.mockRejectedValue(new Error("Claude CLI 에러 (code 1): SECRET-STDERR"));
    const data = await (await post({ prompt: "x" })).json();
    expect(data.error).not.toContain("SECRET-STDERR");
    expect(data.error).toContain("AI 요청 처리 중 오류");
  });

  it("정상 응답은 그대로다", async () => {
    mocks.askAdvisor.mockResolvedValue({ result: "좋아요", sessionId: "s1", duration_ms: 5, systemPromptVersionId: null });
    const res = await post({ prompt: "x" });
    expect(res.status).toBe(200);
    expect((await res.json()).result).toBe("좋아요");
  });
});
