import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Attachment, ButtonContext, MessageContext, OutgoingMessage, SentMessage } from "@pleiades/chat";

// pleiades 009 D-2 PR-3 (pleiades#367 · 설계 T): fit Discord 라우터 — 명령 · 자유 텍스트 4 분기 · 사진 · 버튼 접두 · 어댑터.
// 판단 함수 자체는 ../../commands/__tests__/decide.test.ts 가 본다. 여기서는 Discord 쪽 배선만(가짜 MessageContext).

const db = vi.hoisted(() => ({
  dailySummary: { findUnique: vi.fn() },
  sleepRecord: { findFirst: vi.fn() },
  activity: { findMany: vi.fn() },
  bodyComposition: { findMany: vi.fn() },
  aIAdvice: { findFirst: vi.fn() },
  foodLog: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() },
}));
vi.mock("../../prisma", () => ({ default: db }));
vi.mock("@/lib/prisma", () => ({ default: {} }));
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
vi.mock("../../notifications/auto-adjust-callback", () => ({ decideAutoAdjust: vi.fn() }));
// 자동조정 크론 모듈(mcp 도구 · DB)은 띄우지 않는다 — 접두만
vi.mock("../../notifications/auto-adjust", () => ({ CALLBACK_PREFIX: "auto_adjust" }));

import { syncAll } from "@/lib/garmin/sync";
import { generateMorningReport } from "@/lib/daily-report";
import { askAdvisor, resetSession } from "@/lib/ai/claude-advisor";
import { applyKcalCorrection } from "@/lib/nutrition/scale-macros";
import { estimateNutritionFromPhoto } from "@/lib/nutrition/estimate-nutrition-photo";
import { decideAutoAdjust } from "../../notifications/auto-adjust-callback";
import { discordStateKey } from "../../core/state-key";
import { deletePendingEdit, isPendingEdit, markPendingEdit } from "../../commands/food-edit-state";
import { createDiscordRouter } from "../router";
import {
  FIT_ATTACHMENT_POLICY,
  PHOTO_ACK_TEXT,
  PHOTO_FAILED_TEXT,
  PHOTO_FIRST_ONLY_TEXT,
  PHOTO_NOT_IMAGE_TEXT,
  PHOTO_TOO_LARGE_TEXT,
  handleDiscordAttachment,
  photoExtension,
  photoTempPath,
} from "../photo";
import { discordButtonOutput, toDiscordCommandText, toOutgoing, withTyping } from "../reply";

const CH = "423456789012345678";
const USER = "323456789012345678";
const bot = { api: undefined };

type Sent = { msg: OutgoingMessage | string; deleted: boolean };

function attachment(over: Partial<Attachment> & { bytes?: Uint8Array } = {}): Attachment {
  const { bytes = new Uint8Array([1, 2, 3]), ...rest } = over;
  return {
    id: "a1",
    name: "p.png",
    size: bytes.byteLength,
    contentType: "image/png",
    download: vi.fn(async () => bytes),
    ...rest,
  };
}

function msg(text: string, attachments: Attachment[] = []) {
  const sent: Sent[] = [];
  const ctx: MessageContext = {
    platform: "discord",
    userId: USER,
    channelId: CH,
    messageId: "m1",
    text,
    attachments,
    sentAt: Date.parse("2026-10-28T03:30:00Z"), // KST 12:30
    typing: vi.fn(async () => undefined),
    reply: vi.fn(async (m) => {
      const entry: Sent = { msg: m, deleted: false };
      sent.push(entry);
      const s: SentMessage = {
        id: `s${sent.length}`,
        channelId: CH,
        edit: async () => undefined,
        setButtons: async () => undefined,
        delete: vi.fn(async () => {
          entry.deleted = true;
        }),
      };
      return s;
    }),
    replyFile: vi.fn(),
  };
  return { ctx, sent, texts: () => sent.map((s) => (typeof s.msg === "string" ? s.msg : s.msg.text)) };
}

function button(action: string) {
  return {
    platform: "discord" as const,
    action,
    userId: USER,
    channelId: CH,
    messageId: "b1",
    edit: vi.fn(async () => undefined),
    send: vi.fn(async (m: unknown) => ({ id: "n", channelId: CH, edit: async () => {}, setButtons: async () => {}, delete: async () => {}, m })),
    notice: vi.fn(async () => undefined),
    setButtons: vi.fn(async () => undefined),
  } satisfies ButtonContext;
}

const router = createDiscordRouter(bot);
const key = discordStateKey(CH, USER);

beforeEach(() => {
  vi.mocked(askAdvisor).mockReset();
  vi.mocked(askAdvisor).mockResolvedValue({ result: "AI 답" } as never);
  deletePendingEdit(key);
});

describe("라우팅 표", () => {
  it("!today → 명령(DB 조회 · html)", async () => {
    db.dailySummary.findUnique.mockResolvedValueOnce(null);
    db.sleepRecord.findFirst.mockResolvedValueOnce(null);
    const { ctx, texts } = msg("!today");
    expect(await router.handleMessage(ctx)).toBe(true);
    // 안내문의 /sync 는 Discord 접두로 보인다(문구 끝 깨진 글자는 서비스 유래 · 고치지 않는다 Q57)
    expect(texts()).toHaveLength(1);
    expect(texts()[0]).toMatch(/^오늘 데이터가 아직 없습니다\. !sync 로 싱크해보세/);
    expect(askAdvisor).not.toHaveBeenCalled();
  });

  it("today 뭐 먹지 → 명령 아님 · AI(세션 discord) · 입력 중 표시", async () => {
    const { ctx, texts } = msg("today 뭐 먹지");
    await router.handleMessage(ctx);
    expect(askAdvisor).toHaveBeenCalledWith("today 뭐 먹지", { channel: "discord" });
    expect(texts()).toEqual(["🤔 분석 중...", "AI 답"]);
    expect(ctx.typing).toHaveBeenCalled();
  });

  it("/today(Discord 가 보내도) → 명령 아님", async () => {
    const { ctx } = msg("/today");
    await router.handleMessage(ctx);
    expect(askAdvisor).toHaveBeenCalledTimes(1);
  });

  it("편집 대기 중 숫자 → 편집 입력(상태 키 discord:<채널>:<사용자>)", async () => {
    markPendingEdit(key, "log1", "kcal");
    vi.mocked(applyKcalCorrection).mockResolvedValueOnce({ ok: true } as never);
    db.foodLog.findUnique.mockResolvedValueOnce({ date: new Date(), description: "국밥", mealType: "lunch" });
    const { ctx, texts } = msg("650");
    await router.handleMessage(ctx);
    expect(vi.mocked(applyKcalCorrection).mock.calls.at(-1)!.slice(1)).toEqual(["log1", 650]);
    expect(askAdvisor).not.toHaveBeenCalled();
    expect(texts().join("\n")).toContain("650");
  });

  it("다른 사용자의 편집 대기는 소비하지 않는다(사용자까지 키)", async () => {
    markPendingEdit(discordStateKey(CH, "999999999999999999"), "other", "kcal");
    const { ctx } = msg("650");
    await router.handleMessage(ctx);
    expect(applyKcalCorrection).not.toHaveBeenCalledWith(expect.anything(), "other", 650);
    expect(askAdvisor).toHaveBeenCalled();
    deletePendingEdit(discordStateKey(CH, "999999999999999999"));
  });

  it("편집 대기 중 등록되지 않은 !foo → 편집 입력으로 먹지 않는다", async () => {
    markPendingEdit(key, "log2", "desc");
    const { ctx } = msg("!foo 650");
    await router.handleMessage(ctx);
    expect(isPendingEdit(key)).toBe(true);
    expect(askAdvisor).toHaveBeenCalledWith("!foo 650", { channel: "discord" });
  });

  it("!food_kcal <id> <kcal> → kcal 정정 · 인자 없으면 ! 사용법", async () => {
    vi.mocked(applyKcalCorrection).mockResolvedValueOnce({ ok: true } as never);
    db.foodLog.findUnique.mockResolvedValueOnce({ date: new Date(), description: "라면", mealType: null });
    const a = msg("!food_kcal ck1 500");
    await router.handleMessage(a.ctx);
    expect(vi.mocked(applyKcalCorrection).mock.calls.at(-1)!.slice(1)).toEqual(["ck1", 500]);
    const b = msg("!food_kcal");
    await router.handleMessage(b.ctx);
    expect(b.texts()).toEqual(["사용법: !food_kcal <id> <kcal>\n예: !food_kcal ckabc123 650"]);
  });

  it("!start 도움말은 ! 접두로 · html", async () => {
    const { ctx, sent } = msg("!start");
    await router.handleMessage(ctx);
    const m = sent[0].msg as OutgoingMessage;
    expect(m.format).toBe("html");
    expect(m.text).toContain("!today — 오늘 요약");
    expect(m.text).not.toMatch(/(^|\n)\/today/);
  });

  it("!reset → Discord 세션만", async () => {
    const { ctx } = msg("!reset");
    await router.handleMessage(ctx);
    expect(resetSession).toHaveBeenCalledWith("discord");
  });

  it("!ai 질문 → 리포트 감지 켠 AI · 세션 discord", async () => {
    const { ctx } = msg("!ai 이번 주 러닝 분석해줘");
    await router.handleMessage(ctx);
    expect(askAdvisor).toHaveBeenCalledWith("이번 주 러닝 분석해줘", { channel: "discord" });
  });

  it("!sync 실패 → 원문 대신 정적 안내(#365) · bot 을 넘긴다", async () => {
    vi.mocked(syncAll).mockRejectedValueOnce(new Error("secret path /home/x"));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { ctx, texts } = msg("!sync");
    await router.handleMessage(ctx);
    expect(texts()).toEqual(["🔄 Garmin 데이터 싱크 시작...", "❌ 싱크 실패 — 잠시 후 다시 시도해주세요."]);
    expect(vi.mocked(syncAll).mock.calls.at(-1)![0]?.notifyBot).toBe(bot);
    err.mockRestore();
  });

  it("!report regenerate morning 실패 → 정적 안내", async () => {
    vi.mocked(generateMorningReport).mockRejectedValueOnce(new Error("raw detail"));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { ctx, texts } = msg("!report regenerate morning");
    await router.handleMessage(ctx);
    expect(texts().at(-1)).toBe("❌ 재생성 실패 — 잠시 후 다시 시도해주세요.");
    expect(texts().join("")).not.toContain("raw detail");
    err.mockRestore();
  });
});

describe("버튼 접두", () => {
  it("auto_adjust: → 자동조정 판단", async () => {
    vi.mocked(decideAutoAdjust).mockResolvedValueOnce({ notice: "✅", removeKeyboard: true });
    const c = button("auto_adjust:accept:a1");
    expect(await router.handleButton(c)).toBe(true);
    expect(decideAutoAdjust).toHaveBeenCalledWith("auto_adjust:accept:a1");
    expect(c.setButtons).toHaveBeenCalledWith([]);
  });

  it("food:edit → 누른 사람 키로 편집 대기 · 프롬프트는 같은 채널 새 메시지(취소 버튼)", async () => {
    db.foodLog.findUnique.mockResolvedValueOnce({ id: "f1", description: "국밥", estimatedKcal: 500, mealType: "lunch" });
    const c = button("food:edit:f1");
    await router.handleButton(c);
    expect(isPendingEdit(key)).toBe(true);
    const sent = c.send.mock.calls.at(-1)![0] as OutgoingMessage;
    expect(sent.buttons?.[0]?.[0]?.action).toBe("food:edit-cancel:f1");
  });

  it("food:edit-cancel → 본인 안내 · 버튼 제거", async () => {
    markPendingEdit(key, "f2", "kcal");
    const c = button("food:edit-cancel:f2");
    await router.handleButton(c);
    expect(c.notice).toHaveBeenCalledWith("편집을 취소했습니다.");
    expect(c.setButtons).toHaveBeenCalledWith([]);
    expect(isPendingEdit(key)).toBe(false);
  });

  it("알 수 없는 접두 → 안내 · 처리됨", async () => {
    const c = button("vest:confirm:1");
    expect(await router.handleButton(c)).toBe(true);
    expect(c.notice).toHaveBeenCalledWith("알 수 없는 요청입니다.");
  });
});

describe("사진(P)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fit-discord-photo-"));
    vi.mocked(estimateNutritionFromPhoto).mockReset();
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const handleText = vi.fn(async () => undefined);

  it("정책 · 확장자 매핑 · 임시파일 이름", () => {
    expect(FIT_ATTACHMENT_POLICY.maxBytes).toBe(8 * 1024 * 1024);
    expect(photoExtension("image/jpeg")).toBe("jpg");
    expect(photoExtension("image/PNG; x=1")).toBe("png");
    expect(photoExtension("image/webp")).toBe("webp");
    expect(photoExtension("image/gif")).toBeUndefined();
    expect(photoExtension(undefined)).toBeUndefined();
    expect(path.basename(photoTempPath("webp", 123, tmp))).toMatch(/^mfp-photo-123-[a-z0-9]+\.webp$/);
  });

  it("이미지 → ack · Vision(캡션 · sentAt) · 결과 · ack 삭제 · 임시파일 삭제(0o600 · MIME 확장자)", async () => {
    let seen: { path: string; mode: number } | undefined;
    vi.mocked(estimateNutritionFromPhoto).mockImplementationOnce(async (input: { imagePath: string }) => {
      seen = { path: input.imagePath, mode: fs.statSync(input.imagePath).mode & 0o777 };
      return { kcal: 600, proteinG: null, carbsG: null, fatG: null, confidence: "med", notes: null, items: [] } as never;
    });
    db.foodLog.create.mockResolvedValueOnce({ id: "p1" });
    const { ctx, sent, texts } = msg("점심 국밥", [attachment({ contentType: "image/webp" })]);
    await handleDiscordAttachment(ctx, { handleText, tmpDir: tmp });
    expect(seen?.path.endsWith(".webp")).toBe(true);
    expect(seen?.mode).toBe(0o600);
    expect(fs.readdirSync(tmp)).toEqual([]);
    expect(vi.mocked(estimateNutritionFromPhoto).mock.calls[0][0]).toMatchObject({ caption: "국밥", mealType: "lunch" });
    expect(db.foodLog.create.mock.calls.at(-1)![0].data.date).toEqual(new Date(ctx.sentAt));
    expect(texts()[0]).toBe(PHOTO_ACK_TEXT);
    expect(sent[0].deleted).toBe(true);
    expect(texts()[1]).toContain("✅ 점심 기록 완료");
    expect((sent[1].msg as OutgoingMessage).buttons?.[0]).toHaveLength(3);
    expect(ctx.typing).toHaveBeenCalled();
  });

  it("이미지 아님 · 텍스트 없음 → 안내 · download 하지 않는다", async () => {
    const a = attachment({ contentType: "image/gif" });
    const { ctx, texts } = msg("", [a]);
    await handleDiscordAttachment(ctx, { handleText, tmpDir: tmp });
    expect(texts()).toEqual([PHOTO_NOT_IMAGE_TEXT]);
    expect(a.download).not.toHaveBeenCalled();
  });

  it("이미지 아님 + 텍스트 → 텍스트 경로로(첨부를 뗀다)", async () => {
    handleText.mockClear();
    const { ctx } = msg("!today", [attachment({ contentType: "application/pdf" })]);
    await handleDiscordAttachment(ctx, { handleText, tmpDir: tmp });
    expect(handleText).toHaveBeenCalledTimes(1);
    expect((handleText.mock.calls[0] as unknown as [MessageContext])[0].attachments).toEqual([]);
  });

  it("라우터: pdf + !today → 명령으로", async () => {
    db.dailySummary.findUnique.mockResolvedValueOnce(null);
    db.sleepRecord.findFirst.mockResolvedValueOnce(null);
    const { ctx, texts } = msg("!today", [attachment({ contentType: "application/pdf" })]);
    await router.handleMessage(ctx);
    expect(texts()[0]).toContain("오늘 데이터가 아직 없습니다");
  });

  it("8 MiB 초과 → 안내 · download 하지 않는다", async () => {
    const a = attachment({ size: 8 * 1024 * 1024 + 1 });
    const { ctx, texts } = msg("", [a]);
    await handleDiscordAttachment(ctx, { handleText, tmpDir: tmp });
    expect(texts()).toEqual([PHOTO_TOO_LARGE_TEXT]);
    expect(a.download).not.toHaveBeenCalled();
  });

  it("여러 장 → 첫 이미지만 분석 · 안내 1줄", async () => {
    vi.mocked(estimateNutritionFromPhoto).mockResolvedValueOnce(null as never);
    db.foodLog.create.mockResolvedValueOnce({ id: "p2" });
    const first = attachment({ contentType: "image/jpeg" });
    const second = attachment({ id: "a2", contentType: "image/png" });
    const { ctx, texts } = msg("저녁 샐러드", [attachment({ contentType: "text/plain" }), first, second]);
    await handleDiscordAttachment(ctx, { handleText, tmpDir: tmp });
    expect(first.download).toHaveBeenCalledTimes(1);
    expect(second.download).not.toHaveBeenCalled();
    expect(vi.mocked(estimateNutritionFromPhoto).mock.calls[0][0].imagePath.endsWith(".jpg")).toBe(true);
    expect(texts().at(-1)).toBe(PHOTO_FIRST_ONLY_TEXT);
  });

  // 회귀: PR-3 사전 리뷰 info 3 — 이미지가 아닌 첨부까지 세어 "여러 장" 안내가 나갔다
  it("사진 1장 + 이미지 아닌 첨부 → 여러 장 안내 없음", async () => {
    vi.mocked(estimateNutritionFromPhoto).mockResolvedValueOnce(null as never);
    db.foodLog.create.mockResolvedValueOnce({ id: "p3" });
    const { ctx, texts } = msg("점심", [attachment({ contentType: "image/jpeg" }), attachment({ id: "a9", contentType: "application/pdf" })]);
    await handleDiscordAttachment(ctx, { handleText, tmpDir: tmp });
    expect(texts()).not.toContain(PHOTO_FIRST_ONLY_TEXT);
  });

  it("내려받기 실패 → 텔레그램과 같은 안내 · ack 삭제 · 임시파일 없음", async () => {
    const a = attachment({ download: vi.fn(async () => Promise.reject(new Error("응답 500"))) });
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { ctx, sent, texts } = msg("", [a]);
    await handleDiscordAttachment(ctx, { handleText, tmpDir: tmp });
    expect(texts()).toEqual([PHOTO_ACK_TEXT, PHOTO_FAILED_TEXT]);
    expect(sent[0].deleted).toBe(true);
    expect(fs.readdirSync(tmp)).toEqual([]);
    err.mockRestore();
  });
});

describe("어댑터", () => {
  it("응답 모델 → chat 메시지 · clearKeyboard 무시 · long 은 명령 표기 그대로", () => {
    expect(toOutgoing({ text: "a", format: "plain", clearKeyboard: true })).toEqual({ text: "a", format: "plain" });
    expect(toOutgoing({ text: "/sync 해보세요", format: "html", long: true }).text).toBe("/sync 해보세요");
    expect(toOutgoing({ text: "b", format: "html", buttons: [[{ label: "x", action: "food:delete:1" }]] })).toEqual({
      text: "b",
      format: "html",
      buttons: [[{ label: "x", action: "food:delete:1" }]],
    });
  });

  it("명령 표기 변환은 URL 경로를 건드리지 않는다", () => {
    expect(toDiscordCommandText("/run 과 (/sleep) https://x.com/run /runner")).toBe("!run 과 (!sleep) https://x.com/run /runner");
  });

  it("버튼 출력 — text 없는 notice 는 무표시 · removeButtons = setButtons([])", async () => {
    const c = button("food:x:1");
    const o = discordButtonOutput(c);
    await o.notice();
    expect(c.notice).not.toHaveBeenCalled();
    await o.removeButtons();
    expect(c.setButtons).toHaveBeenCalledWith([]);
  });

  it("withTyping — 시작 1회 + 주기 반복 · 끝나면 멈춘다", async () => {
    vi.useFakeTimers();
    try {
      const typing = vi.fn(async () => undefined);
      let release!: () => void;
      const p = withTyping(typing, () => new Promise<void>((r) => (release = r)), 1000);
      expect(typing).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2500);
      expect(typing).toHaveBeenCalledTimes(3);
      release();
      await p;
      await vi.advanceTimersByTimeAsync(5000);
      expect(typing).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("withTyping — typing 실패는 삼키고 결과는 그대로", async () => {
    await expect(withTyping(async () => Promise.reject(new Error("x")), async () => 7)).resolves.toBe(7);
  });
});
