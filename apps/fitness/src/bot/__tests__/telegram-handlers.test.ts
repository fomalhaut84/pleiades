import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineKeyboard } from "grammy";

// pleiades 009 D-2 PR-2 (pleiades#364): 텔레그램 어댑터 특성 테스트 — 판단 분리(H2) 전후로 텔레그램 쪽 호출열
// (reply 인자 · answerCallbackQuery · editMessageReplyMarkup · typing · sendMessage · deleteMessage)이 같아야 한다.
// 기대값은 리팩터 전 코드(commands/*.ts · index.ts)에서 그대로 옮겼다. getBot() 의 등록을 가짜 Bot 으로 받아 실행한다.

type Handler = (ctx: unknown) => Promise<unknown> | unknown;

const registry = vi.hoisted(() => ({
  commands: new Map<string, Handler>(),
  callbacks: [] as Array<[RegExp, Handler]>,
  ons: new Map<string, Handler>(),
  order: [] as string[],
  instances: [] as unknown[],
}));

vi.mock("grammy", async (importOriginal) => {
  const orig = await importOriginal<typeof import("grammy")>();
  class FakeBot {
    api = { tag: "fake-api" };
    constructor() {
      registry.instances.push(this);
    }
    use() {
      registry.order.push("use");
    }
    command(name: string, h: Handler) {
      registry.order.push(`command:${name}`);
      registry.commands.set(name, h);
    }
    callbackQuery(re: RegExp, h: Handler) {
      registry.order.push(`callback:${re.source}`);
      registry.callbacks.push([re, h]);
    }
    on(filter: string, h: Handler) {
      registry.order.push(`on:${filter}`);
      registry.ons.set(filter, h);
    }
  }
  return { ...orig, Bot: FakeBot };
});

const httpsGet = vi.hoisted(() => vi.fn());
vi.mock("https", async (importOriginal) => {
  const orig = await importOriginal<typeof import("https")>();
  return { ...orig, default: { ...orig, get: httpsGet }, get: httpsGet };
});

const db = vi.hoisted(() => ({
  dailySummary: { findUnique: vi.fn() },
  sleepRecord: { findFirst: vi.fn() },
  activity: { findMany: vi.fn() },
  bodyComposition: { findMany: vi.fn() },
  aIAdvice: { findFirst: vi.fn() },
  foodLog: {
    create: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("../prisma", () => ({ default: db }));

vi.mock("@/generated/prisma/client", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, opts: { code: string }) {
      super(message);
      this.code = opts.code;
    }
  }
  return { Prisma: { PrismaClientKnownRequestError, DbNull: "DbNull" } };
});
vi.mock("@/lib/garmin/sync", () => ({ syncAll: vi.fn() }));
vi.mock("@/lib/garmin/activity-recheck", () => ({ ACTIVITY_RECHECK_DAYS: 30 }));
vi.mock("@/lib/daily-report", () => ({
  generateMorningReport: vi.fn(),
  generateEveningReport: vi.fn(),
}));
vi.mock("@/lib/weekly-report", () => ({ generateWeeklyReport: vi.fn() }));
vi.mock("@/lib/ai/claude-advisor", () => ({ askAdvisor: vi.fn(), resetSession: vi.fn() }));
vi.mock("@/lib/monitoring/admin-alerts", () => ({
  formatUserFriendlyError: vi.fn(() => "친절한 오류"),
  notifyAdminIfKnownFailure: vi.fn(async () => undefined),
}));
vi.mock("@/lib/history/cache", () => ({
  withHistoryCacheBump: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
vi.mock("@/lib/fitness/calorie-balance", () => ({ recalculateCalorieBalance: vi.fn(async () => undefined) }));
vi.mock("@/lib/nutrition/estimate-nutrition", () => ({ estimateNutritionFromText: vi.fn() }));
vi.mock("@/lib/nutrition/estimate-nutrition-mfds", () => ({ estimateNutritionFromMfds: vi.fn() }));
vi.mock("@/lib/nutrition/stale-recalc", () => ({ markStaleRecalcDate: vi.fn(async () => undefined) }));
vi.mock("@/lib/nutrition/repeat-lookup", () => ({ findRecentSameDescription: vi.fn() }));
vi.mock("@/lib/nutrition/scale-macros", () => ({
  applyKcalCorrection: vi.fn(),
  scaleMacrosForNewKcal: vi.fn(),
}));
vi.mock("@/lib/nutrition/food-items", () => ({ scaleItemsForNewKcal: vi.fn() }));
vi.mock("@/lib/nutrition/estimate-nutrition-photo", () => ({ estimateNutritionFromPhoto: vi.fn() }));
vi.mock("../notifications/auto-adjust-callback", () => ({ registerAutoAdjustCallback: vi.fn() }));

import { getBot } from "../index";
import { Prisma } from "@/generated/prisma/client";
import { syncAll } from "@/lib/garmin/sync";
import { generateMorningReport } from "@/lib/daily-report";
import { askAdvisor, resetSession } from "@/lib/ai/claude-advisor";
import { notifyAdminIfKnownFailure } from "@/lib/monitoring/admin-alerts";
import { estimateNutritionFromText } from "@/lib/nutrition/estimate-nutrition";
import { estimateNutritionFromMfds } from "@/lib/nutrition/estimate-nutrition-mfds";
import { findRecentSameDescription } from "@/lib/nutrition/repeat-lookup";
import { applyKcalCorrection } from "@/lib/nutrition/scale-macros";
import { estimateNutritionFromPhoto } from "@/lib/nutrition/estimate-nutrition-photo";

const HTML = { parse_mode: "HTML" };
const CLEAR = { reply_markup: { remove_keyboard: true } };
const foodKeyboard = (id: string) =>
  new InlineKeyboard()
    .text("🔢 kcal", `food:edit:${id}`)
    .text("📝 설명", `food:edit-desc:${id}`)
    .text("🗑️ 삭제", `food:delete:${id}`);
const cancelKeyboard = (id: string) => new InlineKeyboard().text("✕ 취소", `food:edit-cancel:${id}`);

let nextChatId = 1000;

/** 텔레그램 ctx 가짜 — 호출을 한 줄 로그로 모은다(순서 비교). */
function tctx(opts: {
  text?: string;
  match?: string;
  data?: string;
  photo?: boolean;
  caption?: string;
  date?: number;
  chatId?: number;
}) {
  const calls: unknown[][] = [];
  const chatId = opts.chatId ?? nextChatId++;
  const ctx = {
    chat: { id: chatId },
    match: opts.match,
    message: {
      text: opts.text ?? "",
      date: opts.date,
      caption: opts.caption,
      photo: opts.photo ? [{ file_id: "small" }, { file_id: "large" }] : undefined,
    },
    callbackQuery: { data: opts.data },
    reply: vi.fn(async (...args: unknown[]) => {
      calls.push(["reply", ...args]);
      return { message_id: 77 };
    }),
    replyWithChatAction: vi.fn(async (...args: unknown[]) => {
      calls.push(["typing", ...args]);
      return true;
    }),
    answerCallbackQuery: vi.fn(async (...args: unknown[]) => {
      calls.push(["answer", ...args]);
      return true;
    }),
    editMessageReplyMarkup: vi.fn(async (...args: unknown[]) => {
      calls.push(["editMarkup", ...args]);
      return true;
    }),
    api: {
      sendMessage: vi.fn(async (...args: unknown[]) => {
        calls.push(["sendMessage", ...args]);
        return { message_id: 1 };
      }),
      getFile: vi.fn(async (...args: unknown[]) => {
        calls.push(["getFile", ...args]);
        return { file_path: "photos/x.jpg" };
      }),
      deleteMessage: vi.fn(async (...args: unknown[]) => {
        calls.push(["deleteMessage", ...args]);
        return true;
      }),
    },
  };
  return { ctx, calls, chatId };
}

const command = (name: string) => {
  const h = registry.commands.get(name);
  if (!h) throw new Error(`command ${name} 없음`);
  return h;
};
const onText = () => registry.ons.get("message:text")!;
const onPhoto = () => registry.ons.get("message:photo")!;
const foodCallback = () => registry.callbacks.find(([re]) => re.source === "^food:")![1];

let bot: unknown;

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  registry.commands.clear();
  registry.callbacks.length = 0;
  registry.ons.clear();
  registry.order.length = 0;
  registry.instances.length = 0;
  bot = getBot();
  vi.mocked(estimateNutritionFromMfds).mockReset();
  vi.mocked(estimateNutritionFromText).mockReset();
  vi.mocked(findRecentSameDescription).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getBot 등록 순서", () => {
  it("미들웨어 → 명령 10 → 콜백 2 → 사진 → 자유 텍스트", () => {
    expect(registry.order).toEqual([
      "use",
      "command:start",
      "command:help",
      "command:today",
      "command:run",
      "command:sleep",
      "command:weight",
      "command:sync",
      "command:report",
      "command:ai",
      "command:reset",
      "callback:^food:",
      "on:message:photo",
      "on:message:text",
    ]);
    // auto_adjust 콜백은 registerAutoAdjustCallback(모킹) — 등록 위치는 명령 뒤 · food 앞
    expect(bot).toBe(registry.instances[0]);
  });
});

describe("명령 11 — 텔레그램 호출열", () => {
  it("/start — HTML 도움말", async () => {
    const { ctx, calls } = tctx({});
    await command("start")(ctx);
    expect(calls).toEqual([
      [
        "reply",
        "🏃 <b>myFitness 봇</b>\n\n" +
          "Garmin 데이터 기반 피트니스 어드바이저\n\n" +
          "<b>커맨드:</b>\n" +
          "/today — 오늘 요약\n" +
          "/run — 최근 러닝\n" +
          "/sleep — 어젯밤 수면\n" +
          "/weight — 최근 체중\n" +
          "/sync — 데이터 싱크\n" +
          "/report — 최근 리포트\n" +
          "/ai [질문] — AI 어드바이저\n" +
          "/reset — AI 세션 초기화\n\n" +
          "자유 텍스트로 질문하거나\n" +
          '"점심 김치찌개 밥" 형태로 식단 기록',
        HTML,
      ],
    ]);
  });

  it("/help — api.sendMessage(chat.id)", async () => {
    const { ctx, calls, chatId } = tctx({});
    await command("help")(ctx);
    expect(calls).toEqual([["sendMessage", chatId, "/start 참조"]]);
  });

  it("/today — 데이터 없음 안내(plain · 옵션 없음)", async () => {
    db.dailySummary.findUnique.mockResolvedValue(null);
    db.sleepRecord.findFirst.mockResolvedValue(null);
    const { ctx, calls } = tctx({});
    await command("today")(ctx);
    // 원문 그대로 — 소스에 U+FFFD 3자가 들어 있다(서비스 유래 · Q57 고치지 않는다)
    expect(calls).toEqual([["reply", "오늘 데이터가 아직 없습니다. /sync 로 싱크해보세요."]]);
  });

  it("/today — 요약 HTML", async () => {
    db.dailySummary.findUnique.mockResolvedValue({
      steps: 12345,
      restingHR: 50,
      bodyBatteryHigh: null,
      avgStress: 20,
      activeCalories: null,
    });
    db.sleepRecord.findFirst.mockResolvedValue({ sleepScore: 80, hrvOvernight: 61.6 });
    const { ctx, calls } = tctx({});
    await command("today")(ctx);
    expect(calls).toEqual([
      [
        "reply",
        [
          "📊 <b>오늘 요약</b>\n",
          `👣 걸음 수: <b>${(12345).toLocaleString()}</b>`,
          "❤️ 안정시 심박: <b>50</b> bpm",
          "😰 평균 스트레스: <b>20</b>",
          "😴 수면 점수: <b>80</b>",
          "💓 야간 HRV: <b>62</b> ms",
        ].join("\n"),
        HTML,
      ],
    ]);
  });

  it("/run — 기록 없음 · 기록 있음", async () => {
    db.activity.findMany.mockResolvedValueOnce([]);
    const a = tctx({});
    await command("run")(a.ctx);
    expect(a.calls).toEqual([["reply", "최근 러닝 기록이 없습니다."]]);

    db.activity.findMany.mockResolvedValueOnce([
      {
        name: "아침 러닝",
        startTime: new Date("2026-10-27T22:00:00Z"),
        duration: 1800,
        distance: 5000,
        avgPace: 360,
        avgHR: 150,
        trainingEffect: 3.24,
      },
    ]);
    const b = tctx({});
    await command("run")(b.ctx);
    expect(b.calls).toHaveLength(1);
    const [name, text, opts] = b.calls[0] as [string, string, unknown];
    expect(name).toBe("reply");
    expect(opts).toEqual(HTML);
    expect(text.startsWith("🏃 <b>최근 러닝</b>\n\n<b>아침 러닝</b> (")).toBe(true);
    expect(text).toContain("❤️ 150 bpm · TE 3.2");
  });

  it("/sleep — 최근 수면 HTML", async () => {
    db.sleepRecord.findFirst.mockResolvedValue({
      date: new Date("2026-10-27T00:00:00Z"),
      sleepStart: new Date("2026-10-26T14:00:00Z"),
      sleepEnd: new Date("2026-10-26T21:00:00Z"),
      totalSleep: 25200,
      sleepScore: 81,
      deepSleep: null,
      remSleep: null,
      lightSleep: null,
      avgSpO2: null,
      lowestSpO2: null,
      hrvOvernight: null,
      bodyBatteryChange: 40,
    });
    const { ctx, calls } = tctx({});
    await command("sleep")(ctx);
    const [name, text, opts] = calls[0] as [string, string, unknown];
    expect(calls).toHaveLength(1);
    expect(name).toBe("reply");
    expect(opts).toEqual(HTML);
    expect(text.startsWith("😴 <b>최근 수면</b>\n\n📅 ")).toBe(true);
    expect(text).toContain("📊 점수: <b>81</b>");
    expect(text.endsWith("🔋 배터리 충전: +40")).toBe(true);

    db.sleepRecord.findFirst.mockResolvedValue(null);
    const b = tctx({});
    await command("sleep")(b.ctx);
    expect(b.calls).toEqual([["reply", "수면 기록이 없습니다."]]);
  });

  it("/weight — 체중 추세 HTML", async () => {
    db.bodyComposition.findMany.mockResolvedValue([
      { date: new Date("2026-10-27T00:00:00Z"), weight: 70.04, bodyFat: 15.26 },
    ]);
    const { ctx, calls } = tctx({});
    await command("weight")(ctx);
    const [name, text, opts] = calls[0] as [string, string, unknown];
    expect(name).toBe("reply");
    expect(opts).toEqual(HTML);
    expect(text.startsWith("⚖️ <b>체중 추세</b>\n\n")).toBe(true);
    expect(text.endsWith(": <b>70.0</b> kg · 15.3%")).toBe(true);
  });

  it("/sync — 시작 · 완료(실패 건수) · notifyBot = 폴링 봇", async () => {
    vi.mocked(syncAll).mockResolvedValue([
      { synced: 2, error: undefined },
      { synced: 1, error: "x" },
    ] as never);
    const { ctx, calls } = tctx({});
    await command("sync")(ctx);
    expect(calls).toEqual([
      ["reply", "🔄 Garmin 데이터 싱크 시작..."],
      ["reply", "✅ 싱크 완료: 3건 (1건 실패)"],
    ]);
    expect(vi.mocked(syncAll).mock.calls[0][0]).toMatchObject({ notifyBot: bot, activityRecheckDays: 30 });

    vi.mocked(syncAll).mockRejectedValue(new Error("garmin down"));
    const b = tctx({});
    await command("sync")(b.ctx);
    expect(b.calls).toEqual([
      ["reply", "🔄 Garmin 데이터 싱크 시작..."],
      ["reply", "❌ 싱크 실패: garmin down"],
    ]);
  });

  it("/report — 최근 리포트 · 없음 · 재생성 · 사용법", async () => {
    db.aIAdvice.findFirst.mockResolvedValueOnce({
      category: "morning_report",
      reportDate: "2026-10-28",
      response: "## 제목\n**굵게**",
    });
    const a = tctx({ match: "" });
    await command("report")(a.ctx);
    expect(a.calls).toEqual([
      ["reply", "<b>☀️ 모닝 리포트</b> (2026-10-28)\n\n<b>제목</b>\n<b>굵게</b>", HTML],
    ]);

    db.aIAdvice.findFirst.mockResolvedValueOnce(null);
    const b = tctx({ match: "" });
    await command("report")(b.ctx);
    expect(b.calls).toEqual([["reply", "리포트가 아직 없습니다."]]);

    vi.mocked(generateMorningReport).mockResolvedValueOnce("본문");
    const c = tctx({ match: "Regenerate Morning" });
    await command("report")(c.ctx);
    expect(c.calls).toEqual([
      ["reply", "🔄 모닝 리포트 재생성 중..."],
      ["reply", "✅ 재생성 완료\n\n본문", HTML],
    ]);
    expect(generateMorningReport).toHaveBeenLastCalledWith(true, undefined, { notifyBot: bot });

    const d = tctx({ match: "regenerate noon" });
    await command("report")(d.ctx);
    expect(d.calls).toEqual([["reply", "사용법: /report regenerate morning|evening"]]);

    vi.mocked(generateMorningReport).mockRejectedValueOnce(new Error("boom"));
    const e = tctx({ match: "regenerate morning" });
    await command("report")(e.ctx);
    expect(e.calls).toEqual([
      ["reply", "🔄 모닝 리포트 재생성 중..."],
      ["reply", "❌ 재생성 실패: boom"],
    ]);
  });

  it("/report — HTML 전송 실패면 태그를 벗겨 plain 재전송(replyLong)", async () => {
    db.aIAdvice.findFirst.mockResolvedValueOnce({ category: "x", reportDate: null, response: "본문" });
    const { ctx, calls } = tctx({ match: "" });
    ctx.reply.mockImplementationOnce(async (...args: unknown[]) => {
      calls.push(["reply", ...args]);
      throw new Error("can't parse entities");
    });
    await command("report")(ctx);
    expect(calls).toEqual([
      ["reply", "<b>x</b>\n\n본문", HTML],
      ["reply", "x\n\n본문"],
    ]);
  });

  it("/ai — 사용법 · 질문 · 리포트 감지", async () => {
    const a = tctx({ match: "  " });
    await command("ai")(a.ctx);
    expect(a.calls).toEqual([["reply", "사용법: /ai [질문]\n예: /ai 이번 주 러닝 분석해줘"]]);

    vi.mocked(askAdvisor).mockResolvedValueOnce({ result: "**답**" } as never);
    const b = tctx({ match: "러닝 분석" });
    await command("ai")(b.ctx);
    expect(b.calls).toEqual([
      ["reply", "🤔 분석 중..."],
      ["reply", "<b>답</b>", HTML],
    ]);
    expect(askAdvisor).toHaveBeenLastCalledWith("러닝 분석", { channel: "telegram" });

    vi.mocked(generateMorningReport).mockResolvedValueOnce("리포트");
    const c = tctx({ match: "모닝 리포트 만들어줘" });
    await command("ai")(c.ctx);
    expect(c.calls).toEqual([
      ["reply", "📝 모닝 리포트 생성 중..."],
      ["reply", "리포트", HTML],
      ["reply", "✅ 모닝 리포트 저장 완료"],
    ]);
    expect(generateMorningReport).toHaveBeenLastCalledWith(true, undefined, { notifyBot: bot });
  });

  it("/ai — 실패면 친절한 문구 · 관리자 알림에 폴링 봇", async () => {
    vi.mocked(askAdvisor).mockRejectedValueOnce(new Error("auth expired"));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { ctx, calls } = tctx({ match: "질문" });
    await command("ai")(ctx);
    err.mockRestore();
    expect(calls).toEqual([
      ["reply", "🤔 분석 중..."],
      ["reply", "친절한 오류"],
    ]);
    expect(vi.mocked(notifyAdminIfKnownFailure).mock.calls.at(-1)?.[0]).toBe(bot);
  });

  it("/reset — 텔레그램 세션만", async () => {
    const { ctx, calls } = tctx({});
    await command("reset")(ctx);
    expect(resetSession).toHaveBeenLastCalledWith("telegram");
    expect(calls).toEqual([["reply", "🔄 AI 세션이 초기화되었습니다."]]);
  });

  it("/food_kcal — 사용법 · 범위 · 성공 · 없음", async () => {
    const a = tctx({ text: "/food_kcal abc" });
    await onText()(a.ctx);
    expect(a.calls).toEqual([["reply", "사용법: /food_kcal <id> <kcal>\n예: /food_kcal ckabc123 650"]]);

    const b = tctx({ text: "/food_kcal abc 20000" });
    await onText()(b.ctx);
    expect(b.calls).toEqual([["reply", "kcal 은 0~10000 범위 정수여야 합니다."]]);

    vi.mocked(applyKcalCorrection).mockResolvedValueOnce({ ok: true } as never);
    db.foodLog.findUnique.mockResolvedValueOnce({ date: new Date(), description: "김밥", mealType: "lunch" });
    const c = tctx({ text: "/food_kcal@fitbot abc 650" });
    await onText()(c.ctx);
    expect(c.calls).toEqual([["reply", '✏️ 점심 "김밥" → 650 kcal 로 수정됨']]);

    vi.mocked(applyKcalCorrection).mockResolvedValueOnce({ ok: false, reason: "not-found" } as never);
    const d = tctx({ text: "/food_kcal zzz 650" });
    await onText()(d.ctx);
    expect(d.calls).toEqual([["reply", "해당 id 를 찾을 수 없습니다: zzz"]]);
  });
});

describe("자유 텍스트 4 분기 — 순서", () => {
  /** food:edit 버튼으로 이 chat 에 kcal 편집 대기를 건다. */
  async function armKcal(chatId: number, logId: string) {
    db.foodLog.findUnique.mockResolvedValueOnce({ description: "김밥", mealType: "lunch", estimatedKcal: 300 });
    const { ctx } = tctx({ data: `food:edit:${logId}`, chatId });
    await foodCallback()(ctx);
  }

  it("① /food_kcal 은 편집 대기보다 먼저", async () => {
    const chatId = nextChatId++;
    await armKcal(chatId, "log1");
    const { ctx, calls } = tctx({ text: "/food_kcal abc", chatId });
    await onText()(ctx);
    expect(calls).toEqual([["reply", "사용법: /food_kcal <id> <kcal>\n예: /food_kcal ckabc123 650"]]);
  });

  it("② 편집 대기 중이면 식단 형식 텍스트도 편집 입력", async () => {
    const chatId = nextChatId++;
    await armKcal(chatId, "log1");
    const { ctx, calls } = tctx({ text: "점심 김치찌개", chatId });
    await onText()(ctx);
    expect(calls).toEqual([["reply", "0~10000 사이 정수만 입력해주세요. 예: 650", { reply_markup: cancelKeyboard("log1") }]]);
  });

  it("② 편집 대기 kcal 성공 — 완료 문구 + 키보드 제거", async () => {
    const chatId = nextChatId++;
    await armKcal(chatId, "log1");
    vi.mocked(applyKcalCorrection).mockResolvedValueOnce({ ok: true } as never);
    db.foodLog.findUnique.mockResolvedValueOnce({ date: new Date(), description: "김밥" });
    const { ctx, calls } = tctx({ text: " 650 ", chatId });
    await onText()(ctx);
    expect(calls).toEqual([["reply", '✏️ "김밥" → 650 kcal 로 수정됨', CLEAR]]);
    // 소비됐다 — 다음 숫자는 AI 로
    vi.mocked(askAdvisor).mockResolvedValueOnce({ result: "ok" } as never);
    const next = tctx({ text: "650", chatId });
    await onText()(next.ctx);
    expect(next.calls[0]).toEqual(["reply", "🤔 분석 중..."]);
  });

  it("② 편집 대기 중 슬래시 텍스트는 소비하지 않는다 → AI", async () => {
    const chatId = nextChatId++;
    await armKcal(chatId, "log1");
    vi.mocked(askAdvisor).mockResolvedValueOnce({ result: "ok" } as never);
    const { ctx, calls } = tctx({ text: "/unknown", chatId });
    await onText()(ctx);
    expect(calls[0]).toEqual(["reply", "🤔 분석 중..."]);
  });

  it("③ 식단 — typing → 키보드 붙은 기록 완료", async () => {
    db.foodLog.create.mockResolvedValueOnce({ id: "log9" });
    vi.mocked(findRecentSameDescription).mockResolvedValueOnce(null);
    vi.mocked(estimateNutritionFromMfds).mockResolvedValueOnce({
      kcal: 500,
      proteinG: 20,
      carbsG: 60,
      fatG: 10,
      confidence: "high",
      notes: null,
    } as never);
    db.foodLog.updateMany.mockResolvedValueOnce({ count: 1 });
    const { ctx, calls } = tctx({ text: "점심 김치찌개" });
    await onText()(ctx);
    expect(calls).toEqual([
      ["typing", "typing"],
      [
        "reply",
        "✅ 점심 기록 완료\n📝 김치찌개\n📊 약 500 kcal (신뢰도 높음)\n🥩 P 20g · C 60g · F 10g",
        { reply_markup: foodKeyboard("log9") },
      ],
    ]);
  });

  it("③ 식단 — 설명 없음 · 명령형 안내", async () => {
    const a = tctx({ text: "점심" });
    await onText()(a.ctx);
    expect(a.calls).toEqual([["reply", "먹은 것을 함께 입력해주세요.\n예: 점심 김치찌개 밥 계란후라이"]]);

    const b = tctx({ text: "아침 리포트 만들어줘" });
    await onText()(b.ctx);
    expect(b.calls).toHaveLength(1);
    expect((b.calls[0] as string[])[1].startsWith('"아침 리포트 만들어줘" 이 식단이 맞나요?')).toBe(true);
    expect(b.calls[0]).toHaveLength(2);
  });

  it("④ 그 외 → AI(리포트 감지 끔 · 폴링 봇)", async () => {
    vi.mocked(generateMorningReport).mockClear();
    vi.mocked(askAdvisor).mockResolvedValueOnce({ result: "답" } as never);
    const { ctx, calls } = tctx({ text: "모닝 리포트 만들어줘" });
    await onText()(ctx);
    expect(calls).toEqual([
      ["reply", "🤔 분석 중..."],
      ["reply", "답", HTML],
    ]);
    expect(generateMorningReport).not.toHaveBeenCalled();
  });
});

describe("food: 콜백", () => {
  beforeEach(() => vi.mocked(generateMorningReport).mockClear());

  it("알 수 없는 data", async () => {
    const { ctx, calls } = tctx({ data: "food:nope:1" });
    await foodCallback()(ctx);
    expect(calls).toEqual([["answer", { text: "알 수 없는 요청입니다." }]]);
  });

  it("수정 kcal — 응답 · 프롬프트 + 취소 버튼", async () => {
    db.foodLog.findUnique.mockResolvedValueOnce({ description: "김밥", mealType: "lunch", estimatedKcal: null });
    const { ctx, calls } = tctx({ data: "food:edit:log1" });
    await foodCallback()(ctx);
    expect(calls).toEqual([
      ["answer"],
      [
        "reply",
        '🔢 "김밥" 의 새 kcal 을 숫자로만 입력해주세요 (0~10000, 5분 이내).\n현재 값: 미측정',
        { reply_markup: cancelKeyboard("log1") },
      ],
    ]);
  });

  it("수정 설명 — 프롬프트 → 입력 → 완료", async () => {
    const chatId = nextChatId++;
    db.foodLog.findUnique.mockResolvedValueOnce({ description: "김밥", mealType: "lunch", estimatedKcal: 300 });
    const a = tctx({ data: "food:edit-desc:log2", chatId });
    await foodCallback()(a.ctx);
    expect(a.calls).toEqual([
      ["answer"],
      [
        "reply",
        '📝 "김밥" 의 새 설명을 텍스트로 입력해주세요 (5분 이내).\n설명 변경 시 kcal/매크로가 자동 재추정됩니다.',
        { reply_markup: cancelKeyboard("log2") },
      ],
    ]);
    db.foodLog.findUnique.mockResolvedValueOnce({ description: "김밥", date: new Date() });
    db.foodLog.update.mockResolvedValueOnce({});
    const b = tctx({ text: "참치김밥", chatId });
    await onText()(b.ctx);
    expect(b.calls).toEqual([
      [
        "reply",
        '📝 설명 변경 완료: "참치김밥"\n이전 설명: "김밥" (잘못 바뀐 경우 [📝 설명] 로 되돌리세요)\nkcal/매크로는 backfill cron 이 곧 재추정합니다.',
        CLEAR,
      ],
    ]);
  });

  it("수정 — 로그 없음", async () => {
    db.foodLog.findUnique.mockResolvedValueOnce(null);
    const { ctx, calls } = tctx({ data: "food:edit:gone" });
    await foodCallback()(ctx);
    expect(calls).toEqual([
      ["answer", { text: "이미 삭제된 로그입니다." }],
      ["editMarkup", { reply_markup: undefined }],
    ]);
  });

  it("삭제 — 성공(편집 대기도 정리)", async () => {
    const chatId = nextChatId++;
    db.foodLog.findUnique.mockResolvedValueOnce({ description: "김밥", mealType: "lunch", estimatedKcal: 300 });
    await foodCallback()(tctx({ data: "food:edit:log3", chatId }).ctx);
    db.foodLog.delete.mockResolvedValueOnce({ date: new Date() });
    const { ctx, calls } = tctx({ data: "food:delete:log3", chatId });
    await foodCallback()(ctx);
    expect(calls).toEqual([
      ["answer", { text: "삭제되었습니다." }],
      ["editMarkup", { reply_markup: undefined }],
      ["reply", "🗑️ 위 기록이 삭제되었습니다."],
    ]);
    // 대기가 정리됐다 — 숫자는 AI 로
    vi.mocked(askAdvisor).mockResolvedValueOnce({ result: "ok" } as never);
    const next = tctx({ text: "650", chatId });
    await onText()(next.ctx);
    expect(next.calls[0]).toEqual(["reply", "🤔 분석 중..."]);
  });

  it("삭제 — 이미 없음(P2025)", async () => {
    db.foodLog.delete.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("gone", { code: "P2025", clientVersion: "x" } as never),
    );
    const { ctx, calls } = tctx({ data: "food:delete:log4" });
    await foodCallback()(ctx);
    expect(calls).toEqual([
      ["answer", { text: "이미 삭제된 로그입니다." }],
      ["editMarkup", { reply_markup: undefined }],
    ]);
  });

  it("취소 — 대기 해제 · 버튼 제거 · 안내 / 이미 종료", async () => {
    const chatId = nextChatId++;
    db.foodLog.findUnique.mockResolvedValueOnce({ description: "김밥", mealType: "lunch", estimatedKcal: 300 });
    await foodCallback()(tctx({ data: "food:edit:log5", chatId }).ctx);
    const a = tctx({ data: "food:edit-cancel:log5", chatId });
    await foodCallback()(a.ctx);
    expect(a.calls).toEqual([
      ["answer", { text: "편집을 취소했습니다." }],
      ["editMarkup", { reply_markup: undefined }],
      ["reply", "✕ 편집을 취소했습니다.", CLEAR],
    ]);
    const b = tctx({ data: "food:edit-cancel:log5", chatId });
    await foodCallback()(b.ctx);
    expect(b.calls).toEqual([
      ["answer", { text: "이미 종료된 요청입니다." }],
      ["editMarkup", { reply_markup: undefined }],
    ]);
  });
});

describe("사진", () => {
  it("다운로드 → Vision → 기록 → 키보드 응답 → ack 삭제", async () => {
    httpsGet.mockImplementation((_url: string, _opts: unknown, cb: (res: unknown) => void) => {
      const res = Object.assign(Readable.from([Buffer.from("img")]), { statusCode: 200 });
      queueMicrotask(() => cb(res));
      return { on: vi.fn() };
    });
    vi.mocked(estimateNutritionFromPhoto).mockResolvedValueOnce({
      kcal: 700,
      proteinG: null,
      carbsG: null,
      fatG: null,
      confidence: "med",
      notes: "추정",
      items: [{ name: "비빔밥" }],
    } as never);
    db.foodLog.create.mockResolvedValueOnce({ id: "p1" });
    const date = Math.floor(new Date("2026-10-28T03:00:00Z").getTime() / 1000); // KST 12시 → 점심
    const { ctx, calls, chatId } = tctx({ photo: true, date });
    await onPhoto()(ctx);
    expect(calls).toEqual([
      ["typing", "typing"],
      ["reply", "🖼️ 사진 분석 중… (약 20~40초 소요)"],
      ["getFile", "large"],
      [
        "reply",
        "✅ 점심 기록 완료\n📝 비빔밥\n📊 약 700 kcal (신뢰도 중간)\nℹ️ 추정",
        { reply_markup: foodKeyboard("p1") },
      ],
      ["deleteMessage", chatId, 77],
    ]);
    const arg = vi.mocked(estimateNutritionFromPhoto).mock.calls.at(-1)![0];
    expect(arg).toMatchObject({ caption: undefined, mealType: "lunch" });
    expect(arg.imagePath).toMatch(/mfp-photo-\d+-[a-z0-9]+\.jpg$/);
    expect(db.foodLog.create.mock.calls.at(-1)![0].data.date).toEqual(new Date(date * 1000));
  });

  it("Vision 실패 + 캡션 없음 → 저장 없이 안내", async () => {
    httpsGet.mockImplementation((_url: string, _opts: unknown, cb: (res: unknown) => void) => {
      const res = Object.assign(Readable.from([Buffer.from("img")]), { statusCode: 200 });
      queueMicrotask(() => cb(res));
      return { on: vi.fn() };
    });
    vi.mocked(estimateNutritionFromPhoto).mockResolvedValueOnce(null);
    db.foodLog.create.mockClear();
    const { ctx, calls, chatId } = tctx({ photo: true, date: 1 });
    await onPhoto()(ctx);
    expect(calls).toEqual([
      ["typing", "typing"],
      ["reply", "🖼️ 사진 분석 중… (약 20~40초 소요)"],
      ["getFile", "large"],
      ["reply", "⚠️ Vision 분석 실패 — 사진을 다시 보내거나, 텍스트 (예: 아침 김치찌개 밥) 로 입력해주세요."],
      ["deleteMessage", chatId, 77],
    ]);
    expect(db.foodLog.create).not.toHaveBeenCalled();
  });
});
