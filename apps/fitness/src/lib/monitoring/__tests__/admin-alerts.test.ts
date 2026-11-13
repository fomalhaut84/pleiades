// #666: askAdvisor 비용 상한 도달(#665 · subtype=error_max_budget_usd) 전용 분류·문구·관리자 알림.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  ADMIN_ALERT_WAIT_MS,
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
    const msg = formatUserFriendlyError(CLI_BUDGET, { adminAlert: "sent" });
    expect(msg).toContain("비용 상한");
    expect(msg).toContain("관리자에게 알림 전송됨");
    expect(msg).not.toContain("서버 로그 확인 필요");
  });

  it("관리자 알림 결과를 넘기지 않으면(웹) 알림을 말하지 않는다", () => {
    const msg = formatUserFriendlyError(CLI_BUDGET);
    expect(msg).toContain("비용 상한");
    expect(msg).not.toContain("관리자에게");
    expect(formatUserFriendlyError(new Error("Please run /login"))).not.toContain("관리자에게");
  });

  it("어떤 문구에도 원본 메시지가 들어가지 않는다", () => {
    for (const err of [CLI_BUDGET, LOOP_BUDGET, new Error("secret stderr detail xyz")]) {
      const msg = formatUserFriendlyError(err);
      expect(msg).not.toContain("subtype");
      expect(msg).not.toContain("xyz");
      expect(msg).not.toContain("$1.0000");
    }
  });
});

describe("notifyAdminIfKnownFailure — 상한 도달 관리자 알림 (#666)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.notify.mockResolvedValue({ sent: 1, total: 1 });
  });

  it("봇 프로세스면 claude_budget_exceeded 키로 예약하고 한 번 보낸다", async () => {
    await expect(notifyAdminIfKnownFailure(BOT, CLI_BUDGET)).resolves.toBe("sent");
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany.mock.calls[0][0].where.alertType).toBe("claude_budget_exceeded");
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    const body = JSON.stringify(mocks.notify.mock.calls[0][1]);
    expect(body).toContain("비용 상한");
  });

  it("웹(봇 없음)은 예약도 발송도 하지 않는다", async () => {
    await expect(notifyAdminIfKnownFailure(undefined, CLI_BUDGET)).resolves.toBe("skipped");
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("관리자 알림 대상이 아닌 분류는 보내지 않는다", async () => {
    await expect(notifyAdminIfKnownFailure(BOT, new Error("api_status=429"))).resolves.toBe("none");
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});

// #673: "관리자에게 알림 전송됨" 은 실제로 보냈을 때만 — 1시간 rate-limit 으로 생략되면 "이미 알림" · 그 밖에는 말하지 않는다
describe("formatUserFriendlyError — 알림 결과별 문구 (#673)", () => {
  const AUTH = new Error("Please run /login · authentication failed");

  it("sent 만 '알림 전송됨' 이다", () => {
    expect(formatUserFriendlyError(AUTH, { adminAlert: "sent" })).toContain("관리자에게 알림 전송됨");
  });

  it("recent 는 '이미 나갔거나 진행 중' 이고 '전송됨' 이 아니다", () => {
    const msg = formatUserFriendlyError(AUTH, { adminAlert: "recent" });
    expect(msg).toContain("진행 중");
    expect(msg).not.toContain("알림 전송됨");
  });

  it("skipped · failed · pending · none 은 알림을 말하지 않는다", () => {
    for (const adminAlert of ["skipped", "failed", "pending", "none"] as const) {
      expect(formatUserFriendlyError(AUTH, { adminAlert })).not.toContain("관리자에게");
    }
  });
});

describe("notifyAdminIfKnownFailure — 결과 (#673)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("1시간 안의 예약이 있으면(P2002) recent · 발송하지 않는다", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.create.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));
    await expect(notifyAdminIfKnownFailure(BOT, CLI_BUDGET)).resolves.toBe("recent");
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  // 회귀: #673 9-1 major — 예약 생성의 다른 DB 오류를 "이미 알림" 으로 안내했다
  it("예약 생성이 P2002 가 아닌 오류면 failed · 발송하지 않는다", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.create.mockRejectedValue(Object.assign(new Error("connection lost"), { code: "P1001" }));
    await expect(notifyAdminIfKnownFailure(BOT, CLI_BUDGET)).resolves.toBe("failed");
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("예약 row 를 새로 만들면 보낸다", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.create.mockResolvedValue({});
    mocks.notify.mockResolvedValue({ sent: 1, total: 1 });
    await expect(notifyAdminIfKnownFailure(BOT, CLI_BUDGET)).resolves.toBe("sent");
  });

  it("발송이 sent=0 이면 failed · 예약을 해제한다", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.notify.mockResolvedValue({ sent: 0, total: 1 });
    await expect(notifyAdminIfKnownFailure(BOT, CLI_BUDGET)).resolves.toBe("failed");
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("발송 예외도 failed — 던지지 않는다", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.notify.mockRejectedValue(new Error("boom"));
    await expect(notifyAdminIfKnownFailure(BOT, CLI_BUDGET)).resolves.toBe("failed");
  });

  it("DB 오류면 failed", async () => {
    mocks.updateMany.mockRejectedValue(new Error("db down"));
    await expect(notifyAdminIfKnownFailure(BOT, CLI_BUDGET)).resolves.toBe("failed");
  });

  it("발송이 오래 걸리면 기다림 상한 뒤 pending — 사용자 답장을 막지 않는다", async () => {
    vi.useFakeTimers();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.notify.mockImplementation(() => new Promise(() => {}));
    const p = notifyAdminIfKnownFailure(BOT, CLI_BUDGET);
    await vi.advanceTimersByTimeAsync(ADMIN_ALERT_WAIT_MS);
    await expect(p).resolves.toBe("pending");
  });
});
