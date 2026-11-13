// #666: askAdvisor 비용 상한 도달(#665 · subtype=error_max_budget_usd) 전용 분류·문구·관리자 알림.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    systemAlertState: { updateMany: mocks.updateMany, create: mocks.create, deleteMany: mocks.deleteMany },
  },
}));
vi.mock("@/bot/notifications/notifier", () => ({
  BOT_NOTIFY_CTX: {},
  notifierFor: () => ({ notify: mocks.notify }),
}));
vi.mock("@/lib/omron/client", () => ({ OmronAuthError: class OmronAuthError extends Error {} }));

import {
  classifyClaudeError,
  formatUserFriendlyError,
  notifyAdminIfKnownFailure,
} from "../admin-alerts";
import type { BotProcess } from "@/bot/notifications/notifier";

const BOT = {} as BotProcess;

// claude-advisor.ts askAdvisorOnce 의 실패 메시지 형식 그대로 (CLI 가 상한에서 끝낸 경우)
const CLI_BUDGET = new Error(
  "Claude CLI 실패 (subtype=error_max_budget_usd, turns=7, cost=$1.0123, cap=$1.0000)",
);
// askAdvisor 재시도 루프가 남은 잔액 0 에서 멈춘 경우
const LOOP_BUDGET = new Error("askAdvisor: 예산 상한 도달 (spent=$1.0000 / cap=$1.0000) channel=web");

describe("classifyClaudeError — 비용 상한 (#666)", () => {
  it("CLI subtype=error_max_budget_usd 를 상한 도달로 분류한다", () => {
    expect(classifyClaudeError(CLI_BUDGET)).toBe("claude_budget_exceeded");
  });

  it("재시도 루프의 예산 상한 도달을 같은 분류로 본다", () => {
    expect(classifyClaudeError(LOOP_BUDGET)).toBe("claude_budget_exceeded");
  });

  it("stderr 에 다른 패턴이 섞여도 subtype 이 우선한다", () => {
    const err = new Error(
      "Claude CLI 실패 (subtype=error_max_budget_usd, turns=3, cap=$1.0000) | stderr=connect ECONNREFUSED 127.0.0.1:4301 network",
    );
    expect(classifyClaudeError(err)).toBe("claude_budget_exceeded");
  });

  it("다른 실패는 기존 분류 그대로다", () => {
    expect(classifyClaudeError(new Error("Claude CLI 실패 (subtype=error_max_turns, turns=15, cap=$1.0000)"))).toBe("unknown");
    expect(classifyClaudeError(new Error("api_status=429"))).toBe("claude_rate_limit");
  });
});

describe("formatUserFriendlyError (#666)", () => {
  it("상한 도달은 전용 문구 — 일반 '서버 로그 확인 필요' 가 아니다", () => {
    const msg = formatUserFriendlyError(CLI_BUDGET);
    expect(msg).toContain("비용 상한");
    expect(msg).toContain("관리자에게 알림 전송됨");
    expect(msg).not.toContain("서버 로그 확인 필요");
  });

  it("관리자 알림이 없는 경로(웹)에서는 '알림 전송됨' 을 말하지 않는다", () => {
    const msg = formatUserFriendlyError(CLI_BUDGET, { adminAlerted: false });
    expect(msg).toContain("비용 상한");
    expect(msg).not.toContain("관리자에게 알림");
    expect(formatUserFriendlyError(new Error("Please run /login"), { adminAlerted: false })).not.toContain("관리자에게 알림");
  });

  it("어떤 문구에도 원본 메시지가 들어가지 않는다", () => {
    for (const err of [CLI_BUDGET, LOOP_BUDGET, new Error("secret stderr detail xyz")]) {
      const msg = formatUserFriendlyError(err, { adminAlerted: false });
      expect(msg).not.toContain("subtype");
      expect(msg).not.toContain("xyz");
      expect(msg).not.toContain("$1.0000");
    }
  });
});

describe("notifyAdminIfKnownFailure — 상한 도달 관리자 알림 (#666)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.notify.mockResolvedValue({ sent: 1, total: 1 });
  });

  it("봇 프로세스면 claude_budget_exceeded 키로 예약하고 한 번 보낸다", async () => {
    await notifyAdminIfKnownFailure(BOT, CLI_BUDGET);
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany.mock.calls[0][0].where.alertType).toBe("claude_budget_exceeded");
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    const body = JSON.stringify(mocks.notify.mock.calls[0][1]);
    expect(body).toContain("비용 상한");
  });

  it("웹(봇 없음)은 예약도 발송도 하지 않는다", async () => {
    await notifyAdminIfKnownFailure(undefined, CLI_BUDGET);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("관리자 알림 대상이 아닌 분류는 보내지 않는다", async () => {
    await notifyAdminIfKnownFailure(BOT, new Error("api_status=429"));
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
