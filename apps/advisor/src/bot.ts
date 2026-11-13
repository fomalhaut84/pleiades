// 통합 어드바이저 Discord 조립 (#686 · 012 §8 4b-2 · E-a1 · fit `bot/notifications/discord-interactions.ts` 와 같은 모양).
// 새 통합 채널 하나 — 그 채널의 메시지를 코어(Advisor.ask)로 · `!reset` · 첨부는 받지 않는다 · 버튼 없음.
// 허용 = 허용 사용자(전용 키 · 비면 공유 목록) AND 그 채널(chat 이 본다) · 같은 채널 입력은 하나씩(chat serializeByChannel).
// 하루 상한 [D2]: 질문 전 확인 → 닿았으면 거부 + 관리자 알림(그날 1회). 사용액 = 답의 비용(모르면 호출당 상한으로 센다 — 적게 세지 않는다).
// 012 4b-3a2(#695): 사용액은 질문 **전** 호출당 상한을 예약하고 끝나면 차분으로 정산한다(B7 — 강제 종료돼도 상한 쪽으로 남는다) ·
// 진행 중 질문을 추적해 종료 때 정산까지 기다린다 · 치명 close(4014 등)는 관리자 알림(B8).
import fs from "node:fs";
import path from "node:path";
import {
  createChat,
  createIdentifyGuard,
  createRouter,
  fileAliveMarker,
  fileGuardStore,
  MESSAGE_INTENTS,
  type Chat,
  type MessageContext,
  type Router,
} from "@pleiades/chat";
import { AskOutcome } from "./advisor";
import { CALL_BUDGET_USD } from "./cli";
import { answerToHtml } from "./format";
import { BotConfig } from "./platform";
import { sessionKey } from "./session-store";
import { DailySpend } from "./spend";

export const LABEL = "discord-adv";
/** cwd(apps/advisor) 상대 — 루트 .gitignore `/apps/advisor/logs`(#679) · 4b-3 수집기가 생존 표지를 본다 */
export const IDENTIFY_RECORD = path.join("logs", "identify-adv.json");
export const ALIVE_RECORD = path.join("logs", "alive-adv.json");
export const READY_POLL_MS = 60_000;
const TYPING_EVERY_MS = 8_000;

export const BOT_MESSAGES = {
  dailyCap: (cap: number) => `🧾 오늘 통합 어드바이저 사용 한도($${cap.toFixed(2)})에 닿았어요. 내일(KST 자정 뒤) 다시 물어봐 주세요.`,
  textOnly: "📎 통합 어드바이저는 텍스트 질문만 받아요.",
} as const;

/** 라우터가 쓰는 코어 — 시험에서 가짜로 바꾼다 */
export interface AdvisorLike {
  ask(key: string, question: string): Promise<AskOutcome>;
  reset(key: string): string;
}

export interface RouterDeps {
  advisor: AdvisorLike;
  spend: DailySpend;
  alert: (text: string) => Promise<boolean>;
  log: (line: string) => void;
  /** 진행 중 질문 추적 — 종료 때 정산까지 기다린다(B7) */
  inflight?: Inflight;
}

/** 진행 중 작업 수 — 종료 때 `idle(ms)` 로 정산까지 기다린다(012 4b-3a2 #695 B7) */
export class Inflight {
  private n = 0;
  private waiters: (() => void)[] = [];

  async track<T>(work: () => Promise<T>): Promise<T> {
    this.n++;
    try {
      return await work();
    } finally {
      this.n--;
      if (this.n === 0) for (const w of this.waiters.splice(0)) w();
    }
  }

  /** 0 이 되면 true · ms 안에 안 되면 false */
  idle(ms: number): Promise<boolean> {
    if (this.n === 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(t);
        resolve(true);
      };
      const t = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== done);
        resolve(false);
      }, ms);
      this.waiters.push(done);
    });
  }
}

/** 치명 close 알림(B8) — 4014 = 개발자 포털 MESSAGE CONTENT INTENT 꺼짐 · 그 밖 = 토큰·권한. 알림 실패는 chat 이 삼킨다 */
export function fatalCloseAlert(deps: Pick<RouterDeps, "log" | "alert">): (code: number) => Promise<void> {
  return async (code) => {
    deps.log(`[${LABEL}] 치명 종료 ${code} — 다시 접속하지 않는다`);
    const hint = code === 4014 ? "개발자 포털에서 MESSAGE CONTENT INTENT 를 켠 뒤 스크립트로 재기동" : "토큰·권한 확인 뒤 스크립트로 재기동";
    await deps.alert(`통합 어드바이저 Discord 접속 종료(코드 ${code}) — 메시지를 받지 않는다 · ${hint}`);
  };
}

/**
 * 그 질문이 쓴 비용 — CLI 가 보고한 비용이 있으면 그 값(상태와 무관 · init 뒤 hook 위반도 모델이 돌았다 · PR #688 Codex P2).
 * 보고가 없을 때: init 단계에서 끊긴 것(첫 줄 판정 — 모델 호출 전)은 0(9-1 major 2 — 도메인 MCP 가 잠깐 끊긴 것만으로 상한이 닫히지 않게),
 * 그 밖(timeout · no-result · init 뒤 hook)은 호출당 상한(적게 세지 않는다). 거부(CLI 안 띄움)는 0.
 * 이어 묻기 재시도(advisor.ts)는 두 번째 결과만 돌아오지만 첫 시도는 init 단계 실패라 비용 0 이다.
 */
export const POST_INIT_HOOK_CODE = "violation:hook";
export function costOf(r: AskOutcome): number {
  if (r.kind === "refused" || !r.verdict) return 0;
  if (r.verdict.cost !== null) return r.verdict.cost;
  if (r.verdict.status === "init" && r.verdict.code !== POST_INIT_HOOK_CODE) return 0;
  return CALL_BUDGET_USD;
}

export function createAdvisorRouter(deps: RouterDeps): Router {
  let alertedDate = "";
  const capAlert = async (date: string, why: string) => {
    if (alertedDate === date) return;
    alertedDate = date;
    await deps.alert(`하루 상한 ${why} — ${date} · 상한 $${deps.spend.cap.toFixed(2)} · 남은 질문은 거부한다(파일 삭제로 초기화)`);
  };
  const keyOf = (ctx: MessageContext) => sessionKey(ctx.channelId, ctx.userId);

  return createRouter({ commandPrefix: "!" })
    .command(["reset"], async (ctx) => {
      await ctx.reply(deps.advisor.reset(keyOf(ctx)));
    })
    .attachment(async (ctx) => {
      await ctx.reply(BOT_MESSAGES.textOnly);
    })
    .fallback((ctx) => (deps.inflight ? deps.inflight.track(() => onQuestion(ctx)) : onQuestion(ctx)));

  async function onQuestion(ctx: MessageContext): Promise<void> {
    const before = deps.spend.read();
    if (before.broken || before.usd >= deps.spend.cap) {
      deps.log(`[advisor] refused daily-cap usd=${before.usd.toFixed(4)}${before.broken ? " broken=true" : ""}`);
      await capAlert(before.date, before.broken ? "파일을 읽지 못함" : "도달");
      await ctx.reply(BOT_MESSAGES.dailyCap(deps.spend.cap));
      return;
    }
    // 예약(B7) — 쓰지 못하면 질문을 시작하지 않는다(상한을 셀 수 없다 · 닫힌 쪽)
    const reserved = deps.spend.reserve(CALL_BUDGET_USD, before.date);
    if (reserved.broken) {
      deps.log("[advisor] daily-cap 기록 실패 — 오늘 남은 질문은 거부한다");
      await capAlert(reserved.date, "기록 실패");
      await ctx.reply(BOT_MESSAGES.dailyCap(deps.spend.cap));
      return;
    }
    await ctx.typing();
    const typing = setInterval(() => void ctx.typing(), TYPING_EVERY_MS);
    let r: AskOutcome;
    try {
      r = await deps.advisor.ask(keyOf(ctx), ctx.text);
    } finally {
      clearInterval(typing);
    }
    // 질문 전에 읽은 날짜로 정산한다(KST 자정을 넘긴 질문 · 9-1 info 1). 기록에 실패해도 이미 받은 답은 보낸다(9-1 major 1) · 예약분은 남는다
    const after = deps.spend.settle(costOf(r) - CALL_BUDGET_USD, before.date);
    if (after.broken) {
      deps.log("[advisor] daily-cap 기록 실패 — 오늘 남은 질문은 거부한다");
      await capAlert(after.date, "기록 실패");
    } else if (after.usd >= deps.spend.cap) await capAlert(after.date, "도달");
    await ctx.reply(r.kind === "answer" ? { text: answerToHtml(r.text), format: "html" } : r.text);
  }
}

export interface StartDeps extends RouterDeps {
  config: () => BotConfig;
}

/** 설정이 갖춰졌으면 gateway 를 시작해 돌려준다. 아니면 undefined(로그 1줄). */
export function startBot(deps: StartDeps): Chat | undefined {
  const cfg = deps.config();
  if (!cfg.ready) {
    deps.log(`[${LABEL}] 봇 토큰·채널 미설정 — 기다린다`);
    return undefined;
  }
  if (cfg.allowedUserIds.length === 0) deps.log(`[${LABEL}] 허용 사용자 0 — 모든 메시지를 거부한다`);
  deps.log(`[${LABEL}] 메시지 수신 켜짐(통합 채널 · 허용 ${cfg.dedicatedAllow ? "전용 키" : "공유 목록"})`);
  fs.mkdirSync(path.dirname(path.resolve(IDENTIFY_RECORD)), { recursive: true });
  const chat = createChat({
    token: () => deps.config().token,
    label: LABEL,
    intents: MESSAGE_INTENTS, // 메시지만 받는다 — 4014(포털 MESSAGE CONTENT 꺼짐)는 강등 없이 치명(버튼이 없어 낮출 곳이 없다)
    router: createAdvisorRouter(deps),
    allowedUserIds: () => deps.config().allowedUserIds,
    allowedChannelIds: () => {
      const c = deps.config().channelId;
      return c ? [c] : [];
    },
    aliveMarker: fileAliveMarker(path.resolve(ALIVE_RECORD)),
    onFatalClose: fatalCloseAlert(deps),
    identifyGuard: createIdentifyGuard({
      store: fileGuardStore(path.resolve(IDENTIFY_RECORD)),
      onBlocked: async (info) => {
        deps.log(`[${LABEL}] IDENTIFY 보호 — ${info.reason} · ${info.count}/${info.limit}`);
        await deps.alert(`Discord 봇 접속 중단 — IDENTIFY 보호(${info.reason} · 24시간 ${info.count}/${info.limit}) · ${new Date(info.retryAt).toISOString()} 이후 재시도. 재시작 루프 확인`);
      },
    }),
    logger: { warn: (m: unknown) => deps.log(`[${LABEL}] ${String(m)}`), error: (m: unknown) => deps.log(`[${LABEL}] ${String(m)}`) },
  });
  chat.start();
  return chat;
}

/** 기동 때 설정이 없으면 READY_POLL_MS 마다 다시 보고, 갖춰지는 순간 한 번 시작한다(fit #157 과 같다 · 012 4b-2 "키가 없으면 기다린다"). */
export function startBotWhenReady(deps: StartDeps, pollMs = READY_POLL_MS): { stop(): void } {
  let chat = startBot(deps);
  let timer: ReturnType<typeof setInterval> | undefined;
  if (!chat) {
    timer = setInterval(() => {
      if (!deps.config().ready) return;
      clearInterval(timer);
      timer = undefined;
      deps.log(`[${LABEL}] 봇 토큰·채널 설정 감지 — gateway 시작`);
      chat = startBot(deps);
    }, pollMs);
  }
  return {
    stop() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      chat?.stop();
    },
  };
}
