import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BotReply, ButtonOutput } from "../../core/reply";
import { discordStateKey } from "../../core/state-key";
import { BOT_PROCESS } from "../../notifications/notifier";

// pleiades 009 D-2 PR-2 (pleiades#364 · 설계 H2 · T): 플랫폼 중립 판단 함수 — 입력(텍스트 · 인자 · 상태 키 · 시각)과
// 중립 응답 모델(본문 · 형식 · 버튼 · long)만 본다. 009 D-5 B2(#504)에서 옛 특성 테스트(31건)를 지우며
// 남는 테스트가 덮지 않던 케이스를 맨 아래 "특성 테스트 이관" 블록으로 옮겼다(대조표는 PR 본문).

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

import { Prisma } from "@/generated/prisma/client";
import { syncAll } from "@/lib/garmin/sync";
import { generateMorningReport } from "@/lib/daily-report";
import { askAdvisor, resetSession } from "@/lib/ai/claude-advisor";
import { notifyAdminIfKnownFailure } from "@/lib/monitoring/admin-alerts";
import { applyKcalCorrection } from "@/lib/nutrition/scale-macros";
import { estimateNutritionFromPhoto } from "@/lib/nutrition/estimate-nutrition-photo";
import { estimateNutritionFromMfds } from "@/lib/nutrition/estimate-nutrition-mfds";
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
import { decidePhotoFood } from "../food-photo-decide";
import { decideFreeText } from "../free-text";
import { deletePendingEdit, isPendingEdit, markPendingEdit } from "../food-edit-state";

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

const discordBot = BOT_PROCESS;

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
    expect(arg.activityRecheckDays).toBe(30); // #414 · 이관 31-#9
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
    const p = decideAiQuestion("하나", first.out, { channel: "other" });
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
  const key = discordStateKey("5", "5");
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
    await decideFreeText("400", next.out, { stateKey: key, aiChannel: "discord" });
    expect(next.log).toEqual([{ text: '✏️ "김밥" → 400 kcal 로 수정됨', format: "plain" }]);
    expect(isPendingEdit(key)).toBe(false); // 성공하면 대기를 소비한다 — 이관 31-#18
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
    expect(log).toEqual(["notice:편집을 취소했습니다.", { text: "✕ 편집을 취소했습니다.", format: "plain" }]);
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

  it("4096 을 넘어도 판단은 자르지 않는다(분할은 chat)", async () => {
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

// 009 D-5 B2 (#504): 옛 특성 테스트에서 이관 — 남는 decide·discord-router 테스트가 덮지 않던 분기.
// 본문·형식만 본다(옛 어댑터 호출열은 사라졌다). 실패 안내는 원문 대신 정적 문구다(#365 — 원문 분기는 이 PR 에서 지웠다).
describe("특성 테스트 이관 — 명령", () => {
  const view = (log: Array<BotReply | string>) =>
    log.map((m) => (typeof m === "string" ? m : { text: m.text, format: m.format }));

  it("today — 요약 HTML", async () => {
    db.dailySummary.findUnique.mockResolvedValueOnce({
      steps: 12345,
      restingHR: 50,
      bodyBatteryHigh: null,
      avgStress: 20,
      activeCalories: null,
    });
    db.sleepRecord.findFirst.mockResolvedValueOnce({ sleepScore: 80, hrvOvernight: 61.6 });
    const r = await decideToday();
    expect(r).toEqual({
      text: [
        "📊 <b>오늘 요약</b>\n",
        `👣 걸음 수: <b>${(12345).toLocaleString()}</b>`,
        "❤️ 안정시 심박: <b>50</b> bpm",
        "😰 평균 스트레스: <b>20</b>",
        "😴 수면 점수: <b>80</b>",
        "💓 야간 HRV: <b>62</b> ms",
      ].join("\n"),
      format: "html",
    });
  });

  it("run — 기록 있음 HTML", async () => {
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
    const r = await decideRun();
    expect(r.format).toBe("html");
    expect(r.text.startsWith("🏃 <b>최근 러닝</b>\n\n<b>아침 러닝</b> (")).toBe(true);
    expect(r.text).toContain("❤️ 150 bpm · TE 3.2");
  });

  it("sleep — 최근 수면 HTML", async () => {
    db.sleepRecord.findFirst.mockResolvedValueOnce({
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
    const r = await decideSleep();
    expect(r.format).toBe("html");
    expect(r.text.startsWith("😴 <b>최근 수면</b>\n\n📅 ")).toBe(true);
    expect(r.text).toContain("📊 점수: <b>81</b>");
    expect(r.text.endsWith("🔋 배터리 충전: +40")).toBe(true);
  });

  it("weight — 체중 추세 HTML", async () => {
    db.bodyComposition.findMany.mockResolvedValueOnce([
      { date: new Date("2026-10-27T00:00:00Z"), weight: 70.04, bodyFat: 15.26 },
    ]);
    const r = await decideWeight();
    expect(r.format).toBe("html");
    expect(r.text.startsWith("⚖️ <b>체중 추세</b>\n\n")).toBe(true);
    expect(r.text.endsWith(": <b>70.0</b> kg · 15.3%")).toBe(true);
  });

  it("sync — 완료(실패 건수) · 실패는 정적 안내", async () => {
    vi.mocked(syncAll).mockResolvedValueOnce([
      { synced: 2, error: undefined },
      { synced: 1, error: "x" },
    ] as never);
    const a = sink();
    await decideSync(a.out, { bot: BOT_PROCESS });
    expect(view(a.log)).toEqual([
      { text: "🔄 Garmin 데이터 싱크 시작...", format: "plain" },
      { text: "✅ 싱크 완료: 3건 (1건 실패)", format: "plain" },
    ]);

    vi.mocked(syncAll).mockRejectedValueOnce(new Error("garmin down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const b = sink();
    await decideSync(b.out, { bot: BOT_PROCESS });
    err.mockRestore();
    expect(view(b.log)).toEqual([
      { text: "🔄 Garmin 데이터 싱크 시작...", format: "plain" },
      { text: "❌ 싱크 실패 — 잠시 후 다시 시도해주세요.", format: "plain" },
    ]);
  });

  it("report — 최근 리포트 · 없음 · 사용법 · 재생성 실패는 정적 안내", async () => {
    db.aIAdvice.findFirst.mockResolvedValueOnce({
      category: "morning_report",
      reportDate: "2026-10-28",
      response: "## 제목\n**굵게**",
    });
    const a = sink();
    await decideReport(undefined, a.out, {});
    expect(view(a.log)).toEqual([{ text: "<b>☀️ 모닝 리포트</b> (2026-10-28)\n\n<b>제목</b>\n<b>굵게</b>", format: "html" }]);

    db.aIAdvice.findFirst.mockResolvedValueOnce(null);
    const b = sink();
    await decideReport(undefined, b.out, {});
    expect(view(b.log)).toEqual([{ text: "리포트가 아직 없습니다.", format: "plain" }]);

    const c = sink();
    await decideReport("regenerate noon", c.out, {});
    expect(view(c.log)).toEqual([{ text: "사용법: /report regenerate morning|evening", format: "plain" }]);

    vi.mocked(generateMorningReport).mockRejectedValueOnce(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const d = sink();
    await decideReport("regenerate morning", d.out, { bot: BOT_PROCESS });
    err.mockRestore();
    expect(view(d.log)).toEqual([
      { text: "🔄 모닝 리포트 재생성 중...", format: "plain" },
      { text: "❌ 재생성 실패 — 잠시 후 다시 시도해주세요.", format: "plain" },
    ]);
  });

  it("ai — 답은 HTML · 실패면 친절한 문구", async () => {
    vi.mocked(askAdvisor).mockResolvedValueOnce({ result: "**답**" } as never);
    const a = sink();
    await decideAi("러닝 분석", a.out, { channel: "discord", bot: BOT_PROCESS });
    expect(view(a.log)).toEqual([
      { text: "🤔 분석 중...", format: "plain" },
      { text: "<b>답</b>", format: "html" },
    ]);

    vi.mocked(askAdvisor).mockRejectedValueOnce(new Error("auth expired"));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const b = sink();
    await decideAi("질문", b.out, { channel: "discord", bot: BOT_PROCESS });
    err.mockRestore();
    expect(view(b.log)).toEqual([
      { text: "🤔 분석 중...", format: "plain" },
      { text: "친절한 오류", format: "plain" },
    ]);
  });

  it("food_kcal — 범위 · 성공 · 없음", async () => {
    const a = sink();
    await decideFoodKcal("/food_kcal abc 20000", a.out);
    expect(view(a.log)).toEqual([{ text: "kcal 은 0~10000 범위 정수여야 합니다.", format: "plain" }]);

    vi.mocked(applyKcalCorrection).mockResolvedValueOnce({ ok: true } as never);
    db.foodLog.findUnique.mockResolvedValueOnce({ date: new Date(), description: "김밥", mealType: "lunch" });
    const b = sink();
    await decideFoodKcal("/food_kcal abc 650", b.out);
    expect(view(b.log)).toEqual([{ text: '✏️ 점심 "김밥" → 650 kcal 로 수정됨', format: "plain" }]);

    vi.mocked(applyKcalCorrection).mockResolvedValueOnce({ ok: false, reason: "not-found" } as never);
    const c = sink();
    await decideFoodKcal("/food_kcal zzz 650", c.out);
    expect(view(c.log)).toEqual([{ text: "해당 id 를 찾을 수 없습니다: zzz", format: "plain" }]);
  });
});

describe("특성 테스트 이관 — 자유 텍스트 · food: 버튼", () => {
  const key = discordStateKey("31", "31");
  const opts = { stateKey: key, aiChannel: "discord", bot: BOT_PROCESS };
  beforeEach(() => deletePendingEdit(key));
  const view = (log: Array<BotReply | string>) =>
    log.map((m) => (typeof m === "string" ? m : { text: m.text, format: m.format }));

  it("③ 식단 — 명령형 텍스트는 확인 안내만(저장 없음)", async () => {
    db.foodLog.create.mockClear();
    const { out, log } = sink();
    await decideFreeText("아침 리포트 만들어줘", out, opts);
    expect(log).toHaveLength(1);
    expect((log[0] as BotReply).text.startsWith('"아침 리포트 만들어줘" 이 식단이 맞나요?')).toBe(true);
    expect(db.foodLog.create).not.toHaveBeenCalled();
  });

  it("④ 그 외 → AI · 리포트 감지 끔", async () => {
    vi.mocked(generateMorningReport).mockClear();
    vi.mocked(askAdvisor).mockResolvedValueOnce({ result: "답" } as never);
    const { out, log } = sink();
    await decideFreeText("모닝 리포트 만들어줘", out, opts);
    expect(view(log)).toEqual([
      { text: "🤔 분석 중...", format: "plain" },
      { text: "답", format: "html" },
    ]);
    expect(generateMorningReport).not.toHaveBeenCalled();
  });

  it("알 수 없는 data", async () => {
    const { out, log } = sink();
    await decideFoodButton("food:nope:1", key, out);
    expect(log).toEqual(["notice:알 수 없는 요청입니다."]);
  });

  it("수정 설명 — 프롬프트 → 입력 → 완료", async () => {
    db.foodLog.findUnique.mockResolvedValueOnce({ description: "김밥", mealType: "lunch", estimatedKcal: 300 });
    const a = sink();
    await decideFoodButton("food:edit-desc:log2", key, a.out);
    expect(a.log).toEqual([
      "notice",
      {
        text: '📝 "김밥" 의 새 설명을 텍스트로 입력해주세요 (5분 이내).\n설명 변경 시 kcal/매크로가 자동 재추정됩니다.',
        format: "plain",
        buttons: [[{ label: "✕ 취소", action: "food:edit-cancel:log2" }]],
      },
    ]);
    db.foodLog.findUnique.mockResolvedValueOnce({ description: "김밥", date: new Date() });
    db.foodLog.update.mockResolvedValueOnce({});
    const b = sink();
    await decideFreeText("참치김밥", b.out, opts);
    expect(view(b.log)).toEqual([
      {
        text: '📝 설명 변경 완료: "참치김밥"\n이전 설명: "김밥" (잘못 바뀐 경우 [📝 설명] 로 되돌리세요)\nkcal/매크로는 backfill cron 이 곧 재추정합니다.',
        format: "plain",
      },
    ]);
    expect(isPendingEdit(key)).toBe(false); // 이관 31-#25
  });

  it("수정 — 로그 없음", async () => {
    db.foodLog.findUnique.mockResolvedValueOnce(null);
    const { out, log } = sink();
    await decideFoodButton("food:edit:gone", key, out);
    expect(log).toEqual(["notice:이미 삭제된 로그입니다.", "removeButtons"]);
  });

  it("삭제 — 성공이면 편집 대기도 정리한다(다음 숫자는 AI 로)", async () => {
    db.foodLog.findUnique.mockResolvedValueOnce({ description: "김밥", mealType: "lunch", estimatedKcal: 300 });
    await decideFoodButton("food:edit:log3", key, sink().out);
    db.foodLog.delete.mockResolvedValueOnce({ date: new Date() });
    await decideFoodButton("food:delete:log3", key, sink().out);
    vi.mocked(askAdvisor).mockResolvedValueOnce({ result: "ok" } as never);
    const next = sink();
    await decideFreeText("650", next.out, opts);
    expect(view(next.log)[0]).toEqual({ text: "🤔 분석 중...", format: "plain" });
  });

  it("삭제 — 이미 없음(P2025)", async () => {
    db.foodLog.delete.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("gone", { code: "P2025", clientVersion: "x" } as never),
    );
    const { out, log } = sink();
    await decideFoodButton("food:delete:log4", key, out);
    expect(log).toEqual(["notice:이미 삭제된 로그입니다.", "removeButtons"]);
  });

  it("취소 — 대기 해제 · 버튼 제거 · 안내 / 이미 종료", async () => {
    markPendingEdit(key, "log5", "kcal");
    const a = sink();
    await decideFoodButton("food:edit-cancel:log5", key, a.out);
    expect(a.log).toEqual([
      "notice:편집을 취소했습니다.",
      "removeButtons",
      { text: "✕ 편집을 취소했습니다.", format: "plain" },
    ]);
    const b = sink();
    await decideFoodButton("food:edit-cancel:log5", key, b.out);
    expect(b.log).toEqual(["notice:이미 종료된 요청입니다.", "removeButtons"]);
  });
});

describe("특성 테스트 이관 — 사전 리뷰 빈 칸", () => {
  const view = (log: Array<BotReply | string>) =>
    log.map((m) => (typeof m === "string" ? m : { text: m.text, format: m.format }));

  // 이관 31-#12 — /ai 명시 진입에서만 리포트 감지(#212)
  it("ai — 리포트 요청이면 생성 · 저장 안내 · notifyBot 을 lib 에", async () => {
    vi.mocked(generateMorningReport).mockResolvedValueOnce("리포트");
    const { out, log } = sink();
    await decideAi("모닝 리포트 만들어줘", out, { channel: "discord", bot: BOT_PROCESS });
    expect(view(log)).toEqual([
      { text: "📝 모닝 리포트 생성 중...", format: "plain" },
      { text: "리포트", format: "html" },
      { text: "✅ 모닝 리포트 저장 완료", format: "plain" },
    ]);
    expect(generateMorningReport).toHaveBeenLastCalledWith(true, undefined, { notifyBot: BOT_PROCESS });
    expect(askAdvisor).not.toHaveBeenCalled();
  });

  // 이관 31-#10 — 인자 대소문자 무시
  it("report — Regenerate Morning 도 재생성", async () => {
    vi.mocked(generateMorningReport).mockResolvedValueOnce("본문");
    const { out, log } = sink();
    await decideReport("Regenerate Morning", out, { bot: BOT_PROCESS });
    expect(view(log)).toEqual([
      { text: "🔄 모닝 리포트 재생성 중...", format: "plain" },
      { text: "✅ 재생성 완료\n\n본문", format: "html" },
    ]);
  });

  // 이관 31-#20 — MFDS 추정 성공 분기
  it("③ 식단 — MFDS 추정 성공이면 kcal · 신뢰도 · 매크로 줄과 버튼", async () => {
    db.foodLog.create.mockResolvedValueOnce({ id: "f2" });
    db.foodLog.updateMany.mockResolvedValueOnce({ count: 1 });
    vi.mocked(estimateNutritionFromMfds).mockResolvedValueOnce({
      kcal: 500,
      proteinG: 20,
      carbsG: 60,
      fatG: 10,
      confidence: "high",
      notes: null,
      items: null,
    } as never);
    const { out, log } = sink();
    await decideFreeText("점심 김치찌개", out, { stateKey: undefined, aiChannel: "discord" });
    expect(log[1]).toEqual({
      text: "✅ 점심 기록 완료\n📝 김치찌개\n📊 약 500 kcal (신뢰도 높음)\n🥩 P 20g · C 60g · F 10g",
      format: "plain",
      buttons: foodLogButtons("f2"),
    });
    expect(db.foodLog.updateMany.mock.calls.at(-1)![0].data).toMatchObject({ estimatedKcal: 500, proteinG: 20 });
  });

  // 이관 31-#24 — kcal 미측정
  it("수정 kcal — 추정값이 없으면 '미측정'", async () => {
    db.foodLog.findUnique.mockResolvedValueOnce({ description: "김밥", mealType: "lunch", estimatedKcal: null });
    const { out, log } = sink();
    const k = discordStateKey("41", "41");
    await decideFoodButton("food:edit:n1", k, out);
    deletePendingEdit(k);
    expect((log[1] as BotReply).text).toBe('🔢 "김밥" 의 새 kcal 을 숫자로만 입력해주세요 (0~10000, 5분 이내).\n현재 값: 미측정');
  });

  // 이관 31-#30 — 캡션이 없으면 끼니를 보낸 시각(KST)으로
  it("사진 — 캡션 없음이면 KST 시각으로 끼니(12시 → 점심)", async () => {
    vi.mocked(estimateNutritionFromPhoto).mockResolvedValueOnce({
      kcal: 600,
      proteinG: null,
      carbsG: null,
      fatG: null,
      confidence: "medium",
      notes: null,
      items: [],
    } as never);
    db.foodLog.create.mockResolvedValueOnce({ id: "ph2" });
    await decidePhotoFood({ imagePath: "/tmp/y.png", caption: undefined, sentAt: new Date("2026-10-28T03:00:00Z") });
    expect(vi.mocked(estimateNutritionFromPhoto).mock.calls.at(-1)![0]).toEqual({
      imagePath: "/tmp/y.png",
      caption: undefined,
      mealType: "lunch",
    });
  });
});
