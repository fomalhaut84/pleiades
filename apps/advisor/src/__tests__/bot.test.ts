// #686 — Discord 조립: 플랫폼 설정 · 하루 상한 파일 · 답 서식 · 라우터(가짜 메시지) · 관리자 알림. 실제 gateway 접속 0.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { MessageContext, Outgoing } from "@pleiades/chat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AskOutcome, MESSAGES } from "../advisor";
import { BOT_MESSAGES, costOf, createAdvisorRouter, fatalCloseAlert, Inflight, startBot, startBotWhenReady } from "../bot";
import { CALL_BUDGET_USD } from "../cli";
import { answerToHtml } from "../format";
import { AnswerVerdict } from "../judge";
import { botConfig, createAdminAlert } from "../platform";
import { DailySpend, kstDate } from "../spend";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "adv-bot-"));
});
afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const envOf = (o: Record<string, string>) => (k: string) => o[k];
/** root 는 디렉터리 권한을 무시한다 — 쓰기 실패 재현 시험은 건너뛴다 */
const itUnlessRoot = process.getuid?.() === 0 ? it.skip : it;

describe("botConfig", () => {
  it("전용 허용 키가 있으면 그것 · 비면 공유 목록 · 형식 밖 ID 는 버린다", () => {
    const base = { DISCORD_BOT_TOKEN_ADVISOR: "t", DISCORD_CHANNEL_ID_ADVISOR: "123456", DISCORD_ALLOWED_USER_IDS: "111111, 222222" };
    expect(botConfig(envOf({ ...base, DISCORD_ALLOWED_USER_IDS_ADVISOR: "333333,x" }))).toMatchObject({
      allowedUserIds: ["333333"], dedicatedAllow: true, ready: true });
    expect(botConfig(envOf({ ...base, DISCORD_ALLOWED_USER_IDS_ADVISOR: " , " }))).toMatchObject({
      allowedUserIds: ["111111", "222222"], dedicatedAllow: false });
  });

  it("토큰·채널 둘 다 있어야 ready · 채널 형식 검사", () => {
    expect(botConfig(envOf({ DISCORD_BOT_TOKEN_ADVISOR: "t" })).ready).toBe(false);
    expect(botConfig(envOf({ DISCORD_BOT_TOKEN_ADVISOR: "t", DISCORD_CHANNEL_ID_ADVISOR: "abc" })).ready).toBe(false);
  });
});

describe("DailySpend (비공개 파일 · KST)", () => {
  it("더하고 · 재시작(새 인스턴스)해도 남고 · 날짜가 바뀌면 0", () => {
    let now = Date.parse("2026-11-13T05:00:00Z");
    const a = new DailySpend(tmp, () => now);
    a.add(1.25);
    expect(new DailySpend(tmp, () => now).read()).toMatchObject({ date: "2026-11-13", usd: 1.25, broken: false });
    expect(fs.statSync(path.join(tmp, "spend-2026-11-13.json")).mode & 0o777).toBe(0o600);
    now = Date.parse("2026-11-13T15:30:00Z"); // KST 11-14 00:30
    expect(a.read()).toMatchObject({ date: "2026-11-14", usd: 0 });
  });

  // 회귀: #686 9-1 major 1 — 쓰기만 실패하면 읽기는 옛 값이라 상한이 꺼졌다
  itUnlessRoot("쓰기에 실패하면 던지지 않고 그날을 broken(상한)으로 둔다", () => {
    const now = () => Date.parse("2026-11-13T05:00:00Z");
    const s = new DailySpend(tmp, now);
    s.add(0.5);
    fs.chmodSync(tmp, 0o500); // 디렉터리 쓰기 금지 → 임시 파일 생성 실패
    try {
      expect(s.add(0.5)).toMatchObject({ broken: true, usd: 0.5 });
      expect(s.reached()).toBe(true);
    } finally {
      fs.chmodSync(tmp, 0o700);
    }
    expect(new DailySpend(tmp, now).read().usd).toBe(0.5); // 파일은 옛 값 그대로 — 새 인스턴스(재기동)는 다시 판정
  });

  // 회귀: #686 9-1 info 1 — KST 자정을 넘긴 질문은 시작한 날로 센다
  it("날짜를 넘기면 그날로 더한다 · KST 경계", () => {
    let now = Date.parse("2026-11-13T14:59:59Z"); // KST 11-13 23:59:59
    const s = new DailySpend(tmp, () => now);
    const start = s.read().date;
    now = Date.parse("2026-11-13T15:00:00Z"); // KST 11-14 00:00
    s.add(0.7, start);
    expect(s.read("2026-11-13").usd).toBe(0.7);
    expect(s.read().usd).toBe(0);
  });

  // 012 4b-3a2 (#695) B7 — 예약 후 차분 정산 · 파일 형식은 그대로 { date, usd }(4b-2 판으로 되돌려도 읽힌다)
  it("reserve 는 usd 에 더하고 · settle 은 차분(음수 허용 · 0 아래로 안 감) · 형식 무변경", () => {
    const now = () => Date.parse("2026-11-13T05:00:00Z");
    const s = new DailySpend(tmp, now);
    s.add(0.3);
    expect(s.reserve(1, "2026-11-13")).toMatchObject({ usd: 1.3, broken: false });
    expect(s.settle(0.12 - 1, "2026-11-13")).toMatchObject({ usd: 0.42, broken: false });
    expect(JSON.parse(fs.readFileSync(path.join(tmp, "spend-2026-11-13.json"), "utf8"))).toEqual({ date: "2026-11-13", usd: 0.42 });
    expect(s.settle(-5, "2026-11-13").usd).toBe(0);
    expect(s.settle(0, "2026-11-13").usd).toBe(0);
  });

  itUnlessRoot("reserve 쓰기 실패 = broken(질문을 시작하지 않는 근거)", () => {
    const now = () => Date.parse("2026-11-13T05:00:00Z");
    const s = new DailySpend(tmp, now);
    fs.chmodSync(tmp, 0o500);
    try {
      expect(s.reserve(1, "2026-11-13").broken).toBe(true);
    } finally {
      fs.chmodSync(tmp, 0o700);
    }
  });

  it("상한 도달 · 깨진 파일은 상한으로 본다(닫힌 쪽) · 덮어쓰지 않는다", () => {
    const now = () => Date.parse("2026-11-13T05:00:00Z");
    const s = new DailySpend(tmp, now, 2);
    s.add(1.5);
    expect(s.reached()).toBe(false);
    s.add(0.6);
    expect(s.reached()).toBe(true);
    fs.writeFileSync(path.join(tmp, `spend-${kstDate(now())}.json`), "{깨짐");
    expect(s.reached()).toBe(true);
    expect(s.add(1).broken).toBe(true);
    expect(fs.readFileSync(path.join(tmp, `spend-${kstDate(now())}.json`), "utf8")).toBe("{깨짐");
  });
});

describe("answerToHtml", () => {
  it("먼저 이스케이프한 뒤 굵게·코드·목록만 바꾼다", () => {
    expect(answerToHtml("**결론** <script> & `x`\n- 하나")).toBe("<b>결론</b> &lt;script&gt; &amp; <code>x</code>\n• 하나");
  });

  // 회귀: #686 9-1 info 5 — 코드 스팬 안은 그대로 · * 목록 안 기울임
  it("코드 스팬 안의 ** 는 굵게가 아니다 · * 목록 안의 기울임", () => {
    expect(answerToHtml("`a**b**c` **d**")).toBe("<code>a**b**c</code> <b>d</b>");
    expect(answerToHtml("* 항목 *강조*")).toBe("• 항목 <i>강조</i>");
  });
});

const verdict = (cost: number | null): AnswerVerdict => ({
  status: "완료", code: "", text: "답", sessionId: null, cost, turns: 1, contextTokens: 1, drift: "없음", violation: false, byPrefix: {}, outside: 0 });

describe("costOf", () => {
  it("거부는 0 · 비용을 모르면 호출당 상한으로 센다", () => {
    expect(costOf({ kind: "refused", reason: "busy", text: "" })).toBe(0);
    expect(costOf({ kind: "failed", text: "", verdict: null, code: "x" })).toBe(0);
    expect(costOf({ kind: "answer", text: "", verdict: verdict(0.3) })).toBe(0.3);
    expect(costOf({ kind: "failed", text: "", verdict: verdict(null), code: "timeout" })).toBe(CALL_BUDGET_USD);
  });

  // 회귀: #686 9-1 major 2 — init 실패(모델 호출 전)를 $1 로 셌다
  it("init 실패는 0", () => {
    expect(costOf({ kind: "failed", text: "", verdict: { ...verdict(null), status: "init", code: "format:MCP 미연결" }, code: "format:MCP 미연결" })).toBe(0);
  });

  // 회귀: PR #688 Codex P2 — init 뒤 hook 위반은 모델이 돌았는데 0 으로 셌다
  it("init 뒤 hook 위반은 보고된 비용 · 보고가 없으면 호출당 상한", () => {
    const hook = { ...verdict(0.42), status: "init" as const, code: "violation:hook", violation: true };
    expect(costOf({ kind: "failed", text: "", verdict: hook, code: "violation:hook" })).toBe(0.42);
    expect(costOf({ kind: "failed", text: "", verdict: { ...hook, cost: null }, code: "violation:hook" })).toBe(CALL_BUDGET_USD);
  });
});

function fakeCtx(text: string, attachments: unknown[] = []) {
  const replies: Outgoing[] = [];
  const ctx = {
    platform: "discord", userId: "222222", channelId: "123456", messageId: "1", text, attachments, sentAt: 0,
    typing: vi.fn(async () => undefined),
    reply: vi.fn(async (m: Outgoing) => {
      replies.push(m);
      return {} as never;
    }),
    replyFile: vi.fn(),
  } as unknown as MessageContext;
  return { ctx, replies };
}

describe("createAdvisorRouter", () => {
  const setup = (outcome: AskOutcome, cap = 5) => {
    const asks: [string, string][] = [];
    const alerts: string[] = [];
    const logs: string[] = [];
    const spend = new DailySpend(tmp, () => Date.parse("2026-11-13T05:00:00Z"), cap);
    const inflight = new Inflight();
    let hook: () => unknown = () => undefined;
    const router = createAdvisorRouter({
      advisor: {
        ask: async (k, q) => {
          asks.push([k, q]);
          await hook();
          return outcome;
        },
        reset: () => MESSAGES.reset,
      },
      spend,
      alert: async (t) => {
        alerts.push(t);
        return true;
      },
      log: (l) => logs.push(l),
      inflight,
    });
    return { router, asks, alerts, logs, spend, inflight, onAsk: (f: () => unknown) => (hook = f) };
  };

  it("자유 텍스트 → 코어(키 discord:<채널>:<사용자>) → html 답 · 사용액 더함", async () => {
    const s = setup({ kind: "answer", text: "**네**", verdict: verdict(0.42) });
    const { ctx, replies } = fakeCtx("지출과 수면");
    expect(await s.router.handleMessage(ctx)).toBe(true);
    expect(s.asks).toEqual([["discord:123456:222222", "지출과 수면"]]);
    expect(replies).toEqual([{ text: "<b>네</b>", format: "html" }]);
    expect(s.spend.read().usd).toBe(0.42);
    expect(ctx.typing).toHaveBeenCalled();
  });

  it("거부·실패 문구는 plain 그대로", async () => {
    const s = setup({ kind: "refused", reason: "deploying", text: MESSAGES.deploying });
    const { ctx, replies } = fakeCtx("q");
    await s.router.handleMessage(ctx);
    expect(replies).toEqual([MESSAGES.deploying]);
    expect(s.spend.read().usd).toBe(0);
  });

  it("하루 상한에 닿으면 코어를 부르지 않고 거부 · 관리자 알림은 그날 1회 · 알림에 질문 없음", async () => {
    const s = setup({ kind: "answer", text: "답", verdict: verdict(0.8) }, 1);
    await s.router.handleMessage(fakeCtx("첫 질문").ctx); // 0.8
    await s.router.handleMessage(fakeCtx("둘째 질문").ctx); // 1.6 → 도달 알림
    const third = fakeCtx("셋째 질문");
    await s.router.handleMessage(third.ctx);
    await s.router.handleMessage(fakeCtx("넷째 질문").ctx);
    expect(s.asks).toHaveLength(2);
    expect(third.replies).toEqual([BOT_MESSAGES.dailyCap(1)]);
    expect(s.alerts).toHaveLength(1);
    expect(s.alerts[0]).toContain("하루 상한 도달");
    for (const q of ["첫 질문", "둘째 질문", "셋째 질문"]) expect(s.alerts.join(" ")).not.toContain(q);
  });

  // 회귀: #686 9-1 major 1 — 기록 실패가 받은 답을 잃게 하고 그 뒤로 상한이 꺼졌다
  // 012 4b-3a2 (#695) B7 — 예약이 질문 앞이라 쓰기 실패는 예약에서 드러난다 → 질문을 시작하지 않는다
  itUnlessRoot("예약 쓰기에 실패하면 코어를 부르지 않고 거부 · 관리자 알림 · 다음 질문도 거부", async () => {
    const s = setup({ kind: "answer", text: "답", verdict: verdict(0.2) });
    fs.chmodSync(tmp, 0o500);
    try {
      const first = fakeCtx("q1");
      await s.router.handleMessage(first.ctx);
      expect(first.replies).toEqual([BOT_MESSAGES.dailyCap(5)]);
      expect(s.alerts).toEqual([expect.stringContaining("기록 실패")]);
      const second = fakeCtx("q2");
      await s.router.handleMessage(second.ctx);
      expect(second.replies).toEqual([BOT_MESSAGES.dailyCap(5)]);
      expect(s.asks).toHaveLength(0);
    } finally {
      fs.chmodSync(tmp, 0o700);
    }
  });

  itUnlessRoot("정산 쓰기에 실패해도 받은 답은 보내고 · 관리자 알림 · 예약분은 남는다(과다 쪽)", async () => {
    const s = setup({ kind: "answer", text: "답", verdict: verdict(0.2) });
    s.onAsk(() => fs.chmodSync(tmp, 0o500));
    try {
      const first = fakeCtx("q1");
      await s.router.handleMessage(first.ctx);
      expect(first.replies).toEqual([{ text: "답", format: "html" }]);
      expect(s.alerts).toEqual([expect.stringContaining("기록 실패")]);
    } finally {
      fs.chmodSync(tmp, 0o700);
    }
    expect(new DailySpend(tmp, () => Date.parse("2026-11-13T05:00:00Z")).read().usd).toBe(CALL_BUDGET_USD);
  });

  it("질문 동안 호출당 상한이 예약돼 있다 · 끝나면 실제 비용으로 정산", async () => {
    const s = setup({ kind: "answer", text: "답", verdict: verdict(0.42) });
    let during = -1;
    s.onAsk(() => {
      during = s.spend.read().usd;
    });
    await s.router.handleMessage(fakeCtx("q").ctx);
    expect(during).toBe(CALL_BUDGET_USD);
    expect(s.spend.read().usd).toBe(0.42);
  });

  it("진행 중 질문 추적 — idle 은 정산까지 끝난 뒤 true · 시간 안에 안 끝나면 false", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = setup({ kind: "answer", text: "답", verdict: verdict(0.1) });
    s.onAsk(() => gate);
    const done = s.router.handleMessage(fakeCtx("q").ctx);
    await new Promise((r) => setTimeout(r, 5));
    expect(await s.inflight.idle(20)).toBe(false);
    release();
    expect(await s.inflight.idle(1000)).toBe(true);
    await done;
    expect(s.spend.read().usd).toBe(0.1);
    expect(await s.inflight.idle(0)).toBe(true);
  });

  it("!reset 은 그 키의 세션을 버린다 · 첨부는 받지 않는다", async () => {
    const s = setup({ kind: "answer", text: "답", verdict: verdict(0.1) });
    const r = fakeCtx("!reset");
    await s.router.handleMessage(r.ctx);
    expect(r.replies).toEqual([MESSAGES.reset]);
    const a = fakeCtx("사진", [{ id: "1" }]);
    await s.router.handleMessage(a.ctx);
    expect(a.replies).toEqual([BOT_MESSAGES.textOnly]);
    expect(s.asks).toHaveLength(0);
  });
});

// 012 4b-3a2 (#695) B8 — 치명 close(4014 = 포털 MESSAGE CONTENT 꺼짐)는 관리자 알림 1회
describe("fatalCloseAlert", () => {
  it("4014 → 로그 1줄 · 관리자 알림(포털 안내) · 그 밖 코드도 알림", async () => {
    const logs: string[] = [];
    const alerts: string[] = [];
    const f = fatalCloseAlert({ log: (l) => logs.push(l), alert: async (t) => (alerts.push(t), true) });
    await f(4014);
    await f(4004);
    expect(logs).toEqual([expect.stringContaining("치명 종료 4014"), expect.stringContaining("치명 종료 4004")]);
    expect(alerts[0]).toMatch(/4014.*MESSAGE CONTENT/);
    expect(alerts[1]).toMatch(/4004.*토큰/);
  });
});

describe("startBot", () => {
  it("설정이 없으면 시작하지 않고 로그 1줄", () => {
    const logs: string[] = [];
    const chat = startBot({
      advisor: { ask: async () => ({ kind: "refused", reason: "busy", text: "" }), reset: () => "" },
      spend: new DailySpend(tmp),
      alert: async () => true,
      log: (l) => logs.push(l),
      config: () => ({ token: "", channelId: "", allowedUserIds: [], dedicatedAllow: false, ready: false }),
    });
    expect(chat).toBeUndefined();
    expect(logs).toEqual(["[discord-adv] 봇 토큰·채널 미설정 — 기다린다"]);
  });
});

describe("startBotWhenReady", () => {
  it("설정이 생길 때까지 폴링하고 · stop 하면 멈춘다(설정이 없는 동안 접속 0)", async () => {
    vi.useFakeTimers();
    try {
      const logs: string[] = [];
      let polls = 0;
      const h = startBotWhenReady({
        advisor: { ask: async () => ({ kind: "refused", reason: "busy", text: "" }), reset: () => "" },
        spend: new DailySpend(tmp),
        alert: async () => true,
        log: (l) => logs.push(l),
        config: () => {
          polls++;
          return { token: "", channelId: "", allowedUserIds: [], dedicatedAllow: false, ready: false };
        },
      }, 1000);
      await vi.advanceTimersByTimeAsync(3000);
      expect(polls).toBe(4); // 시작 1 + 폴링 3
      h.stop();
      await vi.advanceTimersByTimeAsync(3000);
      expect(polls).toBe(4);
      expect(logs).toEqual(["[discord-adv] 봇 토큰·채널 미설정 — 기다린다"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createAdminAlert", () => {
  it("웹훅이 없으면 보내지 않는다(네트워크 0)", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const logs: string[] = [];
    expect(await createAdminAlert((l) => logs.push(l), envOf({}))("x")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ADMIN 웹훅으로 [advisor] 라벨을 붙여 보낸다 · 본문 이스케이프", async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: "9" }), text: async () => "{\"id\":\"9\"}" }));
    vi.stubGlobal("fetch", fetch);
    const send = createAdminAlert(() => undefined, envOf({ DISCORD_WEBHOOK_ADMIN: "https://discord.com/api/webhooks/1/abc" }));
    expect(await send("상한 <도달>")).toBe(true);
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body) as { content: string };
    // Discord 마크다운으로 이스케이프돼 나간다 — 라벨은 굵게 · 본문의 < 는 글자로
    expect(body.content).toBe("**\\[advisor\\]** 상한 \\<도달>");
  });
});
