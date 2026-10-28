import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BotReply, ButtonOutput } from "../../core/reply";
import { discordStateKey, telegramStateKey } from "../../core/state-key";

// pleiades 009 D-2 PR-2 (pleiades#364 · 설계 H2 · T): 플랫폼 중립 판단 함수 — 입력(텍스트 · 인자 · 상태 키 · 시각)과
// 중립 응답 모델(본문 · 형식 · 버튼 · clearKeyboard · long)만 본다. 텔레그램 호출열은 ../../__tests__/telegram-handlers.test.ts.

const db = vi.hoisted(() => ({
  dailySummary: { findUnique: vi.fn() },
  sleepRecord: { findFirst: vi.fn() },
  activity: { findMany: vi.fn() },
  bodyComposition: { findMany: vi.fn() },
  aIAdvice: { findFirst: vi.fn() },
  foodLog: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() },
}));
vi.mock("../../prisma", () => ({ default: db }));
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
vi.mock("@/lib/daily-report", () => ({ generateMorningReport: vi.fn(), generateEveningReport: vi.fn() }));
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
vi.mock("@/lib/nutrition/estimate-nutrition", () => ({ estimateNutritionFromText: vi.fn(async () => null) }));
vi.mock("@/lib/nutrition/estimate-nutrition-mfds", () => ({ estimateNutritionFromMfds: vi.fn(async () => null) }));
vi.mock("@/lib/nutrition/stale-recalc", () => ({ markStaleRecalcDate: vi.fn(async () => undefined) }));
vi.mock("@/lib/nutrition/repeat-lookup", () => ({ findRecentSameDescription: vi.fn(async () => null) }));
vi.mock("@/lib/nutrition/scale-macros", () => ({ applyKcalCorrection: vi.fn(), scaleMacrosForNewKcal: vi.fn() }));
vi.mock("@/lib/nutrition/food-items", () => ({ scaleItemsForNewKcal: vi.fn() }));
vi.mock("@/lib/nutrition/estimate-nutrition-photo", () => ({ estimateNutritionFromPhoto: vi.fn() }));
// food-photo 가 텔레그램 agent 를 ../index 에서 가져온다 — 판단 테스트는 index 를 띄우지 않는다
vi.mock("../../index", () => ({ telegramAgent: {} }));

import { syncAll } from "@/lib/garmin/sync";
import { generateMorningReport } from "@/lib/daily-report";
import { askAdvisor, resetSession } from "@/lib/ai/claude-advisor";
import { notifyAdminIfKnownFailure } from "@/lib/monitoring/admin-alerts";
import { applyKcalCorrection } from "@/lib/nutrition/scale-macros";
import { estimateNutritionFromPhoto } from "@/lib/nutrition/estimate-nutrition-photo";
import { decideHelp, decideStart } from "../start";
import { decideToday } from "../today";
import { decideRun } from "../run";
import { decideSleep } from "../sleep";
import { decideWeight } from "../weight";
import { decideSync } from "../sync";
import { decideReport } from "../report";
import { decideAi, decideAiQuestion, decideReset } from "../ai";
import { decideFoodKcal } from "../food";
import { decideFoodButton, foodLogButtons } from "../food-edit-callback";
import { decidePhotoFood } from "../food-photo";
import { decideFreeText } from "../free-text";
import { deletePendingEdit, markPendingEdit } from "../food-edit-state";

/** 가짜 출력 — 모델과 버튼 동작을 한 줄 로그로. */
function sink() {
  const log: Array<BotReply | string> = [];
  const out: ButtonOutput = {
    reply: vi.fn(async (m: BotReply) => {
      log.push(m);
    }),
    typing: vi.fn(async () => {
      log.push("typing");
    }),
    notice: vi.fn(async (text?: string) => {
      log.push(text === undefined ? "notice" : `notice:${text}`);
    }),
    removeButtons: vi.fn(async () => {
      log.push("removeButtons");
    }),
  };
  return { out, log };
}

const discordBot = { api: undefined };

beforeEach(() => {
  vi.mocked(askAdvisor).mockReset();
});

describe("명령 판단 11", () => {
  it("start — html · help — plain", () => {
    const s = decideStart();
    expect(s.format).toBe("html");
    expect(s.text).toContain("/ai [질문] — AI 어드바이저");
    expect(decideHelp()).toEqual({ text: "/start 참조", format: "plain" });
  });

  it("today — 시각 입력으로 오늘 00:00 · 어제 범위", async () => {
    db.dailySummary.findUnique.mockResolvedValueOnce({
      steps: null,
      restingHR: 48,
      bodyBatteryHigh: null,
      avgStress: null,
      activeCalories: null,
    });
    db.sleepRecord.findFirst.mockResolvedValueOnce(null);
    const now = new Date(2026, 9, 28, 15, 30);
    const r = await decideToday(now);
    expect(r).toEqual({ text: "📊 <b>오늘 요약</b>\n\n❤️ 안정시 심박: <b>48</b> bpm", format: "html" });
    const where = db.dailySummary.findUnique.mock.calls.at(-1)![0].where;
    expect(where.date).toEqual(new Date(2026, 9, 28));
  });

  it("run · sleep · weight — 빈 결과는 plain 안내", async () => {
    db.activity.findMany.mockResolvedValueOnce([]);
    db.sleepRecord.findFirst.mockResolvedValueOnce(null);
    db.bodyComposition.findMany.mockResolvedValueOnce([]);
    expect(await decideRun()).toEqual({ text: "최근 러닝 기록이 없습니다.", format: "plain" });
    expect(await decideSleep()).toEqual({ text: "수면 기록이 없습니다.", format: "plain" });
    expect(await decideWeight()).toEqual({ text: "체중 기록이 없습니다.", format: "plain" });
  });

  it("sync — 넘긴 bot 을 그대로 lib 에(Discord 판 = standalone notifyBot)", async () => {
    vi.mocked(syncAll).mockResolvedValueOnce([{ synced: 4 }] as never);
    const { out, log } = sink();
    await decideSync(out, { now: new Date(2026, 9, 28, 9), bot: discordBot });
    expect(log).toEqual([
      { text: "🔄 Garmin 데이터 싱크 시작...", format: "plain" },
      { text: "✅ 싱크 완료: 4건", format: "plain" },
    ]);
    const arg = vi.mocked(syncAll).mock.calls.at(-1)![0]!;
    expect(arg.notifyBot).toBe(discordBot);
    expect(arg.startDate).toEqual(new Date(2026, 9, 27));
    expect(arg.endDate).toEqual(new Date(2026, 9, 28));
  });

  it("report — 인자는 플랫폼 접두를 뗀 문자열 · 재생성 본문은 long html", async () => {
    vi.mocked(generateMorningReport).mockResolvedValueOnce("본문");
    const { out, log } = sink();
    await decideReport(" regenerate morning ", out, { bot: discordBot });
    expect(log).toEqual([
      { text: "🔄 모닝 리포트 재생성 중...", format: "plain" },
      { text: "✅ 재생성 완료\n\n본문", format: "html", long: true },
    ]);
    expect(generateMorningReport).toHaveBeenLastCalledWith(true, undefined, { notifyBot: discordBot });
  });

  it("ai — 빈 인자 사용법 · 세션 채널은 인자대로", async () => {
    const a = sink();
    await decideAi(undefined, a.out, { channel: "discord" });
    expect(a.log).toEqual([{ text: "사용법: /ai [질문]\n예: /ai 이번 주 러닝 분석해줘", format: "plain" }]);

    vi.mocked(askAdvisor).mockResolvedValueOnce({ result: "답" } as never);
    const b = sink();
    await decideAi("질문", b.out, { channel: "discord" });
    expect(askAdvisor).toHaveBeenLastCalledWith("질문", { channel: "discord" });
    expect(b.log).toEqual([
      { text: "🤔 분석 중...", format: "plain" },
      { text: "답", format: "html", long: true },
    ]);
  });

  it("ai — 처리 중이면 다른 플랫폼 질문도 막는다(락 공유)", async () => {
    let release!: (v: unknown) => void;
    vi.mocked(askAdvisor).mockImplementationOnce(() => new Promise((r) => (release = r)) as never);
    const first = sink();
    const p = decideAiQuestion("하나", first.out, { channel: "telegram" });
    const second = sink();
    await decideAiQuestion("둘", second.out, { channel: "discord" });
    expect(second.log).toEqual([{ text: "⏳ 이전 질문 처리 중입니다. 잠시 후 다시 시도해주세요.", format: "plain" }]);
    release({ result: "끝" });
    await p;
  });

  it("ai — 실패 시 관리자 알림에 넘긴 bot", async () => {
    vi.mocked(askAdvisor).mockRejectedValueOnce(new Error("x"));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { out, log } = sink();
    await decideAiQuestion("q", out, { channel: "discord", bot: discordBot });
    err.mockRestore();
    expect(log.at(-1)).toEqual({ text: "친절한 오류", format: "plain" });
    expect(vi.mocked(notifyAdminIfKnownFailure).mock.calls.at(-1)?.[0]).toBe(discordBot);
  });

  it("reset — 자기 플랫폼 세션만", () => {
    expect(decideReset("discord")).toEqual({ text: "🔄 AI 세션이 초기화되었습니다.", format: "plain" });
    expect(resetSession).toHaveBeenLastCalledWith("discord");
  });

  it("food_kcal — 사용법", async () => {
    const { out, log } = sink();
    await decideFoodKcal("/food_kcal", out);
    expect(log).toEqual([{ text: "사용법: /food_kcal <id> <kcal>\n예: /food_kcal ckabc123 650", format: "plain" }]);
  });
});

describe("자유 텍스트 4 분기 순서", () => {
  const key = discordStateKey("10", "20");
  beforeEach(() => deletePendingEdit(key));
  const opts = { stateKey: key, aiChannel: "discord" };

  it("① /food_kcal 이 편집 대기보다 먼저", async () => {
    markPendingEdit(key, "log1", "kcal");
    const { out, log } = sink();
    await decideFreeText("/food_kcal x", out, opts);
    expect((log[0] as BotReply).text.startsWith("사용법: /food_kcal")).toBe(true);
  });

  it("② 편집 대기가 식단 형식보다 먼저 — 재프롬프트에 취소 버튼", async () => {
    markPendingEdit(key, "log1", "kcal");
    const { out, log } = sink();
    await decideFreeText("점심 김밥", out, opts);
    expect(log).toEqual([
      {
        text: "0~10000 사이 정수만 입력해주세요. 예: 650",
        format: "plain",
        buttons: [[{ label: "✕ 취소", action: "food:edit-cancel:log1" }]],
      },
    ]);
  });

  it("② 다른 사용자의 대기는 소비하지 않는다 → ③ 식단", async () => {
    markPendingEdit(key, "log1", "kcal");
    const { out, log } = sink();
    await decideFreeText("점심", out, { ...opts, stateKey: discordStateKey("10", "99") });
    expect(log).toEqual([{ text: "먹은 것을 함께 입력해주세요.\n예: 점심 김치찌개 밥 계란후라이", format: "plain" }]);
  });

  it("③ 식단 — 버튼 3개 · typing 먼저", async () => {
    db.foodLog.create.mockResolvedValueOnce({ id: "f1" });
    const { out, log } = sink();
    await decideFreeText("저녁 국수", out, opts);
    expect(log[0]).toBe("typing");
    expect(log[1]).toEqual({
      text: "✅ 저녁 기록 완료\n📝 국수\n⚠️ kcal 자동 추정 실패 — [수정] 버튼으로 직접 입력하세요",
      format: "plain",
      buttons: foodLogButtons("f1"),
    });
  });

  it("④ AI — 상태 키 없음이면 편집 분기를 건너뛴다", async () => {
    vi.mocked(askAdvisor).mockResolvedValueOnce({ result: "답" } as never);
    const { out, log } = sink();
    await decideFreeText("650", out, { stateKey: undefined, aiChannel: "discord" });
    expect(log[0]).toEqual({ text: "🤔 분석 중...", format: "plain" });
  });
});

describe("food: 버튼 4 경로", () => {
  const key = telegramStateKey(5);
  beforeEach(() => deletePendingEdit(key));

  it("수정 kcal — 응답 · 프롬프트 · 대기 설정", async () => {
    db.foodLog.findUnique.mockResolvedValueOnce({ description: "김밥", mealType: "lunch", estimatedKcal: 320 });
    const { out, log } = sink();
    await decideFoodButton("food:edit:a", key, out);
    expect(log).toEqual([
      "notice",
      {
        text: '🔢 "김밥" 의 새 kcal 을 숫자로만 입력해주세요 (0~10000, 5분 이내).\n현재 값: 320 kcal',
        format: "plain",
        buttons: [[{ label: "✕ 취소", action: "food:edit-cancel:a" }]],
      },
    ]);
    vi.mocked(applyKcalCorrection).mockResolvedValueOnce({ ok: true } as never);
    db.foodLog.findUnique.mockResolvedValueOnce({ date: new Date(), description: "김밥" });
    const next = sink();
    await decideFreeText("400", next.out, { stateKey: key, aiChannel: "telegram" });
    expect(next.log).toEqual([{ text: '✏️ "김밥" → 400 kcal 로 수정됨', format: "plain", clearKeyboard: true }]);
  });

  it("수정 설명 — 상태 키 없으면 응답만(대기 없음)", async () => {
    db.foodLog.findUnique.mockResolvedValueOnce({ description: "김밥", mealType: "lunch", estimatedKcal: null });
    const { out, log } = sink();
    await decideFoodButton("food:edit-desc:b", undefined, out);
    expect(log).toEqual(["notice"]);
  });

  it("삭제 — 응답 · 버튼 제거 · 안내", async () => {
    db.foodLog.delete.mockResolvedValueOnce({ date: new Date() });
    const { out, log } = sink();
    await decideFoodButton("food:delete:c", key, out);
    expect(log).toEqual([
      "notice:삭제되었습니다.",
      "removeButtons",
      { text: "🗑️ 위 기록이 삭제되었습니다.", format: "plain" },
    ]);
  });

  it("취소 — 상태 키 없으면 처리 불가 안내", async () => {
    const { out, log } = sink();
    await decideFoodButton("food:edit-cancel:d", undefined, out);
    expect(log).toEqual(["notice:처리할 수 없는 요청입니다."]);
  });

  it("출력 실패는 삼킨다(버튼 제거 실패에도 안내는 간다)", async () => {
    markPendingEdit(key, "e", "kcal");
    const { out, log } = sink();
    vi.mocked(out.removeButtons).mockRejectedValueOnce(new Error("old message"));
    await decideFoodButton("food:edit-cancel:e", key, out);
    expect(log).toEqual(["notice:편집을 취소했습니다.", { text: "✕ 편집을 취소했습니다.", format: "plain", clearKeyboard: true }]);
  });
});

describe("사진 판단", () => {
  it("캡션 식사 접두 → mealType · 잔여 설명 · 저장 날짜 = sentAt", async () => {
    vi.mocked(estimateNutritionFromPhoto).mockResolvedValueOnce({
      kcal: 1234,
      proteinG: 10,
      carbsG: 20,
      fatG: 30,
      confidence: "low",
      notes: null,
      items: [],
    } as never);
    db.foodLog.create.mockResolvedValueOnce({ id: "ph" });
    const sentAt = new Date("2026-10-27T14:59:00Z"); // KST 23:59
    const r = await decidePhotoFood({ imagePath: "/tmp/x.png", caption: " 아침 토스트 ", sentAt });
    expect(vi.mocked(estimateNutritionFromPhoto).mock.calls.at(-1)![0]).toEqual({
      imagePath: "/tmp/x.png",
      caption: "토스트",
      mealType: "breakfast",
    });
    expect(db.foodLog.create.mock.calls.at(-1)![0].data.date).toBe(sentAt);
    expect(r).toEqual({
      text: "✅ 아침 기록 완료\n📝 토스트\n📊 약 1,234 kcal (신뢰도 낮음)\n🥩 P 10g · C 20g · F 30g",
      format: "plain",
      buttons: foodLogButtons("ph"),
    });
  });

  it("4096 을 넘어도 판단은 자르지 않는다(절단은 텔레그램 어댑터)", async () => {
    vi.mocked(estimateNutritionFromPhoto).mockResolvedValueOnce({
      kcal: 1,
      proteinG: null,
      carbsG: null,
      fatG: null,
      confidence: "high",
      notes: "가".repeat(5000),
      items: [],
    } as never);
    db.foodLog.create.mockResolvedValueOnce({ id: "long" });
    const r = await decidePhotoFood({ imagePath: "/tmp/y.jpg", caption: "점심 국밥", sentAt: new Date() });
    expect(r.text.length).toBeGreaterThan(5000);
  });
});
