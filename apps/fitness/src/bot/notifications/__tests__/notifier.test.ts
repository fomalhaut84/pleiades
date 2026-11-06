import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, html } from "@pleiades/notify";
import cron from "node-cron";
import prisma from "@/lib/prisma";
import { generateMorningReport } from "@/lib/daily-report";
import { recommendTodayWorkout } from "@/mcp/tools/recommend-today-workout";
import { BOT_NOTIFY_CTX, BOT_PROCESS, interactiveNotifierFor, notifierFor } from "../notifier";
import { startBotScheduler } from "../scheduler";
import { runAutoAdjustProposal } from "../auto-adjust";
import { runAutoAdjustMaintenance } from "../auto-adjust-cron";
import { notifyClaudeAuthExpiredIfNeeded } from "@/lib/monitoring/admin-alerts";

// pleiades 009 D-5 B2 (pleiades#504): 옛 채널을 지웠다 — 텍스트는 #fitness 웹훅, 키보드는 fit Discord 봇.
// 스위치(NOTIFY_ALLOWED_CHANNEL · NOTIFY_INTERACTIVE_CHANNEL)는 읽지 않는다(009 §5-4). 재시도·분할·폴백 baseline 은
// 패키지 코어의 몫이라 packages/notify 테스트가 덮는다. 이 파일은 fit 의 배선만 고정한다 — 라우트 · label 'bot' ·
// first.ref 를 telegramMessageId 로 저장(D-a · 컬럼명 S-8) · admin alert 의 `!bot`(웹은 보내지 않는다 · 1-7).

vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  default: {
    userProfile: { findFirst: vi.fn() },
    trainingWorkout: { findFirst: vi.fn() },
    workoutAdjustment: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    aIAdvice: { create: vi.fn() },
    systemAlertState: { updateMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
}));
vi.mock("@/lib/daily-report", () => ({
  generateMorningReport: vi.fn(),
  generateEveningReport: vi.fn(),
  preSyncForReport: vi.fn(),
}));
vi.mock("@/lib/weekly-report", () => ({ generateWeeklyReport: vi.fn() }));
vi.mock("@/mcp/tools/recommend-today-workout", () => ({ recommendTodayWorkout: vi.fn() }));
vi.mock("@/mcp/tools/injury-risk", () => ({
  getInjuryRiskScore: vi.fn(async () => ({ content: [{ text: '{"topFactors":[]}' }] })),
}));

const WEBHOOK = "https://discord.com/api/webhooks/3/fit-token";
const CHANNEL = "123456789012345678";
const BOT_URL = `https://discord.com/api/v10/channels/${CHANNEL}/messages`;

type Call = [string, { body: string; headers: Record<string, string> }];

/** Discord 응답 스텁 — 웹훅·봇 REST 공통. `status` 가 2xx 가 아니면 실패(403 은 재시도하지 않는다). */
function stubFetch(status = 200, id = "d9") {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ id }),
    text: async () => "",
  }));
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls: () => fetchMock.mock.calls as unknown as Call[] };
}

function errorLogs(): string[] {
  return vi.mocked(console.error).mock.calls.map((c) => String(c[0]));
}

function expectBotLabelOnly(expectedFailures: number) {
  const logs = errorLogs();
  expect(logs.filter((l) => l.startsWith("[bot] 메시지 전송 실패"))).toHaveLength(expectedFailures);
  expect(logs.some((l) => l.startsWith("[notify]"))).toBe(false);
}

beforeEach(() => {
  // 셸 env 가 새지 않게 — 옛 채널 키는 있어도 쓰이지 않는다는 것을 아래 케이스가 본다
  vi.stubEnv("NOTIFY_ALLOWED_CHANNEL", "");
  vi.stubEnv("NOTIFY_INTERACTIVE_CHANNEL", "");
  vi.stubEnv("DISCORD_WEBHOOK_FITNESS", WEBHOOK);
  vi.stubEnv("DISCORD_BOT_TOKEN_FITNESS", "fake-token");
  vi.stubEnv("DISCORD_CHANNEL_ID_FITNESS", CHANNEL);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notifierFor — #fitness 웹훅", () => {
  it("텍스트 알림은 웹훅 1곳 · md 변환", async () => {
    const { calls } = stubFetch();
    const r = await notifierFor().notify(Route.ALLOWED, html("<b>리포트</b>"), BOT_NOTIFY_CTX);
    expect(r).toMatchObject({ sent: 1, total: 1, first: { target: "fitness", ref: "d9" } });
    expect(calls()[0][0]).toBe(`${WEBHOOK}?wait=true`);
    expect(JSON.parse(calls()[0][1].body).content).toBe("**리포트**");
  });

  // 회귀: #504 — 스위치를 읽지 않는다. 옛 기본값(빈 값)·옛 채널 값이어도 Discord 로만 간다
  it("스위치 값과 옛 채널 키에 상관없이 Discord 로만 보낸다", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:SECRET");
    vi.stubEnv("TELEGRAM_ALLOWED_CHAT_IDS", "1,2");
    for (const v of ["", "telegram", "discord"]) {
      const { calls } = stubFetch();
      vi.stubEnv("NOTIFY_ALLOWED_CHANNEL", v);
      const r = await notifierFor().notify(Route.ALLOWED, html("x"), BOT_NOTIFY_CTX);
      expect(r).toMatchObject({ sent: 1, total: 1 });
      expect(calls().map((c) => c[0])).toEqual([`${WEBHOOK}?wait=true`]);
    }
  });

  it("웹훅이 비거나 형식이 아니면 수신자 0 — 보내지 않는다", async () => {
    for (const v of [" ", "https://example.com/hook"]) {
      const { fetchMock } = stubFetch();
      vi.stubEnv("DISCORD_WEBHOOK_FITNESS", v);
      const r = await notifierFor().notify(Route.ALLOWED, html("x"), BOT_NOTIFY_CTX);
      expect(r.total).toBe(0);
      expect(notifierFor().targetCount(Route.ALLOWED)).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });
});

describe("interactiveNotifierFor — fit Discord 봇", () => {
  // 회귀: #504 — 스위치가 비어도(옛 기본값) 봇으로 간다
  it("스위치 없이도 봇 REST 로 · 버튼은 components", async () => {
    const { calls } = stubFetch(200, "d55");
    const buttons = [[{ label: "ok", action: "c" }]];
    const r = await interactiveNotifierFor().notify(Route.ALLOWED, html("제안", buttons), BOT_NOTIFY_CTX);
    expect(r).toMatchObject({ sent: 1, total: 1, first: { target: "fitness", ref: "d55" } });
    const [url, init] = calls()[0];
    expect(url).toBe(BOT_URL);
    expect(init.headers.authorization).toBe("Bot fake-token");
    expect(JSON.parse(init.body).components[0].components[0].custom_id).toBe("c");
  });

  it("봇 설정이 없으면 수신자 0", async () => {
    const { fetchMock } = stubFetch();
    vi.stubEnv("DISCORD_BOT_TOKEN_FITNESS", "");
    vi.stubEnv("DISCORD_CHANNEL_ID_FITNESS", "");
    const r = await interactiveNotifierFor().notify(Route.ALLOWED, html("제안", [[{ label: "ok", action: "c" }]]), BOT_NOTIFY_CTX);
    expect(r.total).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("호출부 — label 'bot' · first.ref 저장 (#48 I2 · D-a)", () => {
  const db = vi.mocked(prisma, true);

  const payload = {
    date: "2026-09-30",
    base: { source: "plan", type: "tempo", distanceKm: 10, pace: "5:00", planId: "p1" },
    recommendation: {
      type: "easy",
      distanceKm: 6,
      paceRange: { min: "6:00", max: "6:30" },
      adjusted: true,
      adjustmentReason: "피로 & 부하",
    },
    factors: {
      readiness: { score: 40, label: "low" },
      injury: { score: 70, label: "high" },
      plan: { hasActivePlan: true, todayWorkoutExists: true, todayIsRestPlanned: false, lthrPaceSource: "x" },
    },
    rationale: "r",
  };

  function arrangeProposal() {
    db.userProfile.findFirst.mockResolvedValue({ autoAdjustEnabled: true } as never);
    db.trainingWorkout.findFirst
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({
        id: "w1",
        type: "tempo",
        distanceKm: 10,
        paceSecPerKm: 300,
        zone: null,
        intervalDesc: null,
        notes: null,
      } as never);
    vi.mocked(recommendTodayWorkout).mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(payload) }],
    } as never);
    db.workoutAdjustment.create.mockResolvedValue({ id: "adj1" } as never);
    db.workoutAdjustment.update.mockResolvedValue({} as never);
    db.aIAdvice.create.mockResolvedValue({} as never);
  }

  function arrangeSnoozed() {
    db.workoutAdjustment.updateMany.mockResolvedValue({ count: 1 } as never);
    db.workoutAdjustment.findMany.mockResolvedValue([
      {
        id: "adj9",
        proposedType: "easy",
        proposedDistanceKm: 6,
        proposedPaceSecPerKm: 370,
        proposedZone: null,
        proposedIntervalDesc: null,
        reason: {},
      },
    ] as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scheduler 리포트 전송·에러 문구 전송 (호출 2건) 이 [bot] 으로 로그한다", async () => {
    const { calls } = stubFetch(403);
    vi.mocked(generateMorningReport).mockResolvedValue("hi");
    startBotScheduler(BOT_PROCESS);
    const morning = vi.mocked(cron.schedule).mock.calls[0][1] as () => Promise<void>;
    await morning();
    expect(calls()).toHaveLength(2);
    expect(JSON.parse(calls()[1][1].body).content).toContain("모닝 리포트 생성 실패");
    expectBotLabelOnly(2);
  });

  it("auto-adjust 제안(키보드 · 봇)·에러 문구(웹훅) 전송 (호출 2건) 이 [bot] 으로 로그한다", async () => {
    const { calls } = stubFetch(403);
    arrangeProposal();
    await runAutoAdjustProposal(BOT_PROCESS);
    expect(calls().map((c) => c[0])).toEqual([BOT_URL, `${WEBHOOK}?wait=true`]);
    expect(JSON.parse(calls()[0][1].body).components).toBeDefined();
    expect(JSON.parse(calls()[1][1].body).content).toContain("Auto-adjust 알림 실패");
    expectBotLabelOnly(2);
  });

  it("auto-adjust 제안 성공 → 버튼 custom_id · Discord id 를 telegramMessageId 에(D-a)", async () => {
    const { calls } = stubFetch(200, "d777");
    arrangeProposal();
    await runAutoAdjustProposal(BOT_PROCESS);
    const body = JSON.parse(calls()[0][1].body) as { components: Array<{ components: Array<{ custom_id: string }> }> };
    expect(body.components[0].components.map((b) => b.custom_id)).toEqual([
      "auto_adjust:accept:adj1",
      "auto_adjust:reject:adj1",
      "auto_adjust:snooze:adj1",
    ]);
    expect(db.workoutAdjustment.update).toHaveBeenCalledWith({
      where: { id: "adj1" },
      data: { telegramMessageId: "d777", telegramChatId: "fitness" },
    });
  });

  it("봇 설정이 없으면 제안을 보내지 않고 telegramMessageId 를 쓰지 않는다", async () => {
    const { calls } = stubFetch();
    vi.stubEnv("DISCORD_BOT_TOKEN_FITNESS", "");
    arrangeProposal();
    await runAutoAdjustProposal(BOT_PROCESS);
    expect(calls().some((c) => c[0] === BOT_URL)).toBe(false);
    expect(db.workoutAdjustment.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ telegramMessageId: expect.anything() }) }),
    );
  });

  it("auto-adjust-cron 스누즈 재전송 실패가 [bot] 으로 로그한다", async () => {
    const { calls } = stubFetch(403);
    arrangeSnoozed();
    await runAutoAdjustMaintenance(BOT_PROCESS);
    expect(calls().map((c) => c[0])).toEqual([BOT_URL]);
    expectBotLabelOnly(1);
  });

  it("auto-adjust-cron 스누즈 재전송 성공 → first.ref·target 이 그대로 저장된다", async () => {
    stubFetch(200, "d77");
    arrangeSnoozed();
    await runAutoAdjustMaintenance(BOT_PROCESS);
    expect(db.workoutAdjustment.updateMany).toHaveBeenLastCalledWith({
      where: { id: "adj9", decision: "snoozed" },
      data: { decision: "pending", snoozeUntil: null, telegramMessageId: "d77", telegramChatId: "fitness" },
    });
  });

  it("admin-alerts 관리자 alert 전송 실패가 [bot] 으로 로그하고 예약을 해제한다", async () => {
    const { calls } = stubFetch(403);
    db.systemAlertState.updateMany.mockResolvedValue({ count: 1 } as never);
    db.systemAlertState.deleteMany.mockResolvedValue({ count: 1 } as never);
    await notifyClaudeAuthExpiredIfNeeded(BOT_PROCESS, new Error("Please run /login · authentication failed"));
    expect(calls()).toHaveLength(1);
    expectBotLabelOnly(1);
    expect(db.systemAlertState.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("admin alert — 봇 프로세스는 보낸다 · 웹(표지 없음)은 건너뛴다 (!bot 의미 보존 · 1-7 · §4-3)", async () => {
    const { fetchMock } = stubFetch();
    db.systemAlertState.updateMany.mockResolvedValue({ count: 1 } as never);
    await notifyClaudeAuthExpiredIfNeeded(undefined, new Error("Please run /login · authentication failed"));
    expect(db.systemAlertState.updateMany).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    await notifyClaudeAuthExpiredIfNeeded(BOT_PROCESS, new Error("Please run /login · authentication failed"));
    expect(db.systemAlertState.updateMany).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
