// 통합 어드바이저 Discord 조립 (#686 · 012 §8 4b-2 · E-a1 · fit `bot/notifications/discord-interactions.ts` 와 같은 모양).
// 새 통합 채널 하나 — 그 채널의 메시지를 코어(Advisor.ask)로 · `!reset` · 첨부는 받지 않는다 · 버튼 없음.
// 허용 = 허용 사용자(전용 키 · 비면 공유 목록) AND 그 채널(chat 이 본다) · 같은 채널 입력은 하나씩(chat serializeByChannel).
// 하루 상한 [D2]: 질문 전 확인 → 닿았으면 거부 + 관리자 알림(그날 1회). 사용액 = 답의 비용(모르면 호출당 상한으로 센다 — 적게 세지 않는다).
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
}

/**
 * 그 질문이 쓴 비용 — 답의 비용 · 모르면 호출당 상한(적게 세지 않는다).
 * 0: 거부(CLI 안 띄움) · init 실패(첫 줄에서 끊어 모델 호출 전 — 도메인 MCP 가 잠깐 끊긴 것만으로 상한이 닫히지 않게 · 9-1 major 2).
 * 이어 묻기 재시도(advisor.ts)는 두 번째 결과만 돌아오지만 첫 시도는 init 실패라 비용 0 이다.
 */
export function costOf(r: AskOutcome): number {
  if (r.kind === "refused" || !r.verdict || r.verdict.status === "init") return 0;
  return r.verdict.cost ?? CALL_BUDGET_USD;
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
    .fallback(async (ctx) => {
      const before = deps.spend.read();
      if (before.broken || before.usd >= deps.spend.cap) {
        deps.log(`[advisor] refused daily-cap usd=${before.usd.toFixed(4)}${before.broken ? " broken=true" : ""}`);
        await capAlert(before.date, before.broken ? "파일을 읽지 못함" : "도달");
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
      // 질문 전에 읽은 날짜로 더한다(KST 자정을 넘긴 질문 · 9-1 info 1). 기록에 실패해도 이미 받은 답은 보낸다(9-1 major 1)
      const after = deps.spend.add(costOf(r), before.date);
      if (after.broken) {
        deps.log("[advisor] daily-cap 기록 실패 — 오늘 남은 질문은 거부한다");
        await capAlert(after.date, "기록 실패");
      } else if (after.usd >= deps.spend.cap) await capAlert(after.date, "도달");
      await ctx.reply(r.kind === "answer" ? { text: answerToHtml(r.text), format: "html" } : r.text);
    });
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
