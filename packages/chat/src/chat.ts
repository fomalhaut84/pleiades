/**
 * `createChat` — 앱 봇 프로세스가 부르는 진입점. gateway 하나로 메시지와 버튼을 받아 허용 검사 → 중립 컨텍스트 → 라우터 (009 D-0).
 *
 * - 메시지: 다른 봇·웹훅이 쓴 것, 일반/답장 외 유형은 무시. 메시지 채널(`messageChannelIds`)이 아니면 조용히 무시(다른 채널 잡담에 반응하지 않는다) ·
 *   메시지 채널의 허용 안 된 사용자는 기록만 하고 답하지 않는다(guild 채널은 남이 본다 · R8).
 * - 버튼: 허용 밖이면 누른 사람에게만 거부 안내 · 허용이면 3초 안에 지연 응답(type 6) 뒤 핸들러.
 * - 핸들러가 던지면 원문을 노출하지 않는 일반 안내로 답한다.
 * - **채널 대기열(009 D-2 Q3):** 같은 채널의 메시지·버튼 핸들러는 받은 순서대로 하나씩 돈다(기존 봇의 순차 처리와 같은 의미).
 *   자리는 받는 순간 동기로 잡는다 — 버튼은 지연 응답을 기다리기 전에(PR #361 Codex P2). 앞 핸들러가 실패하거나
 *   감시 시한을 넘어도 다음으로 넘어간다(넘긴 핸들러는 취소하지 않는다). 오래 기다린 버튼은 인터랙션 토큰(15분) 대신 봇 토큰으로 고친다.
 */
import { sanitizeError } from '@pleiades/notify';
import { DEFAULT_ATTACHMENT_POLICY, toAttachment, type AttachmentPolicy } from './attachments';
import { channelAllowed, isAllowed, type IdList } from './auth';
import { createGateway, MESSAGE_INTENTS, type IdentifyDecision, type WebSocketFactory } from './gateway';
import type { IdentifyGuard } from './identify-guard';
import { createRest, normalize, type ChatFetch, type Rest } from './rest';
import type { Router } from './router';
import type { ButtonContext, Logger, MessageContext, Outgoing, SentMessage } from './types';

declare function setTimeout(fn: () => void, ms: number): unknown;
declare function clearTimeout(id: unknown): void;

export interface ChatOptions {
  /** 봇 토큰 — 부를 때마다 읽는다. */
  token: () => string;
  router: Router;
  allowedUserIds: IdList;
  /** 버튼을 받는 채널 — 알림 채널과 대화 채널 둘 다(C-7). `messageChannelIds` 가 없으면 메시지도 여기서 받는다. */
  allowedChannelIds: IdList;
  /** 메시지를 받는 채널(대화 채널) — 없으면 `allowedChannelIds`. 알림 채널의 메시지를 명령으로 받지 않으려면 둔다(009 D-2 Ka3). */
  messageChannelIds?: IdList;
  /** 로그 prefix — 기존 봇 프로세스와 같은 `discord-<app>` 을 쓴다(0-4 판정 문자열). */
  label: string;
  /** IDENTIFY 보호(0-5) — 필수. 끄려면 `'none'` 을 명시한다(테스트 · 일회성 도구만 · #332 사전 리뷰 info 1). */
  identifyGuard: IdentifyGuard | 'none';
  /**
   * gateway intents — 기본 `MESSAGE_INTENTS`(일반 메시지 수신 · 개발자 포털 MESSAGE CONTENT 토글 필요 · 없으면 4014).
   * `0` 이면 버튼만 받는다 — 인터랙션은 intent 없이 온다(009 D-1 G1 · 포털 토글 전 단계).
   */
  intents?: number;
  /** 4014 에서 낮출 intents(보통 `0`) — 프로세스 수명 동안 유지. 없으면 4014 는 치명(009 D-2 F1). */
  fallbackIntents?: number;
  /** 강등 1회 알림 — 봇 토큰과 무관한 경로로 보낸다(호출부). 실패는 삼킨다. */
  onIntentsFallback?: () => void | Promise<void>;
  /** 같은 채널 입력을 순서대로 하나씩 — 기본 `true`(009 D-2 Q3). */
  serializeByChannel?: boolean;
  /** 핸들러 하나를 기다리는 상한 — 넘으면 취소하지 않고 다음 입력으로 넘어간다. 기본 10분(AI 최장 540초 + 여유). */
  handlerWatchdogMs?: number;
  /** 버튼을 받은 지 이만큼 지난 뒤의 편집·안내는 봇 토큰으로 한다(인터랙션 토큰 15분 만료 전 · 15분 미만 필수). 기본 14분. */
  staleButtonMs?: number;
  /**
   * 버튼이 같은 채널의 앞 요청 뒤에서 기다리게 되면 누른 사람에게만 바로 보이는 안내 — 결과가 늦어도 고장처럼 보이지 않게.
   * 기본 `BUSY_BUTTON_TEXT` · `false` 면 보내지 않는다.
   */
  busyButtonNotice?: string | false;
  attachmentPolicy?: AttachmentPolicy;
  logger?: Logger;
  fetch?: ChatFetch;
  createSocket?: WebSocketFactory;
  apiBase?: string;
  reconnectDelaysMs?: readonly number[];
  retryDelaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface Chat {
  start(): void;
  stop(): void;
  /** 받은 메시지와 무관하게 채널에 보낸다(같은 봇 토큰). */
  send(channelId: string, msg: Outgoing): Promise<SentMessage>;
}

const FAILURE_TEXT = '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
export const BUSY_BUTTON_TEXT = '⏳ 앞 요청을 처리하는 중입니다 — 끝나면 이 버튼을 반영합니다.';
const EPHEMERAL = 64;
/** 0 = 일반 · 19 = 답장. 그 밖(핀 · 입장 알림 등)은 명령이 아니다. */
const MESSAGE_TYPES = new Set([0, 19]);
const DEFAULT_WATCHDOG_MS = 10 * 60_000;
const DEFAULT_STALE_BUTTON_MS = 14 * 60_000;
/** Discord 인터랙션 토큰 수명. */
const INTERACTION_TOKEN_MS = 15 * 60_000;
/** Discord snowflake 의 시각 기준(2015-01-01T00:00:00Z) — 상위 비트 = 그 뒤 ms. */
const DISCORD_EPOCH = 1420070400000;
const SNOWFLAKE_SHIFT = 2 ** 22;

interface RawMessage {
  id?: unknown;
  channel_id?: unknown;
  content?: unknown;
  type?: unknown;
  timestamp?: unknown;
  webhook_id?: unknown;
  author?: { id?: unknown; bot?: unknown };
  attachments?: unknown;
}
interface RawInteraction {
  id?: unknown;
  token?: unknown;
  application_id?: unknown;
  type?: unknown;
  channel_id?: unknown;
  data?: { custom_id?: unknown; component_type?: unknown };
  member?: { user?: { id?: unknown } };
  user?: { id?: unknown };
  message?: { id?: unknown };
}

const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

/** 보낸 시각 — `timestamp`(ISO) → 메시지 ID(snowflake) → 받은 시각. ES2017 이라 BigInt 없이 나눈다(ms 단위 오차는 무해). */
export function messageSentAt(m: { id?: unknown; timestamp?: unknown }, receivedAt: number): number {
  const iso = typeof m.timestamp === 'string' ? Date.parse(m.timestamp) : Number.NaN;
  if (Number.isFinite(iso)) return iso;
  const id = str(m.id);
  if (/^\d{5,25}$/.test(id)) {
    const t = Math.floor(Number(id) / SNOWFLAKE_SHIFT) + DISCORD_EPOCH;
    if (Number.isFinite(t) && t > DISCORD_EPOCH) return t;
  }
  return receivedAt;
}

function positiveInt(v: number, what: string, label: string): number {
  if (!Number.isInteger(v) || v <= 0) throw new Error(`[${label}] ${what} 는 양의 정수여야 한다`);
  return v;
}

function nonNegativeInt(v: number, what: string, label: string): number {
  if (!Number.isInteger(v) || v < 0) throw new Error(`[${label}] ${what} 는 0 이상의 정수여야 한다`);
  return v;
}

export function createChat(opts: ChatOptions): Chat {
  const logger = opts.logger ?? console;
  const label = opts.label;
  const policy = opts.attachmentPolicy ?? DEFAULT_ATTACHMENT_POLICY;
  const now = opts.now ?? Date.now;
  const intents = nonNegativeInt(opts.intents ?? MESSAGE_INTENTS, 'intents', label);
  const fallbackIntents = opts.fallbackIntents === undefined ? undefined : nonNegativeInt(opts.fallbackIntents, 'fallbackIntents', label);
  const messageChannels = opts.messageChannelIds ?? opts.allowedChannelIds;
  const serialize = opts.serializeByChannel ?? true;
  const watchdogMs = positiveInt(opts.handlerWatchdogMs ?? DEFAULT_WATCHDOG_MS, 'handlerWatchdogMs', label);
  const staleMs = positiveInt(opts.staleButtonMs ?? DEFAULT_STALE_BUTTON_MS, 'staleButtonMs', label);
  if (staleMs >= INTERACTION_TOKEN_MS) throw new Error(`[${label}] staleButtonMs 는 인터랙션 토큰 수명(15분)보다 짧아야 한다`);
  const busyText = opts.busyButtonNotice === undefined ? BUSY_BUTTON_TEXT : opts.busyButtonNotice;
  const rest: Rest = createRest({
    token: opts.token,
    fetch: opts.fetch,
    apiBase: opts.apiBase,
    logger,
    retryDelaysMs: opts.retryDelaysMs,
    sleep: opts.sleep,
  });
  const apiBase = opts.apiBase ?? 'https://discord.com/api/v10';

  /** 채널별 꼬리 — 늘 resolve 한다(앞 실패가 사슬을 끊지 않게). */
  const tails = new Map<string, Promise<void>>();

  /** 감시 시한 — 넘으면 경고하고 대기열만 푼다(핸들러는 계속 돈다). */
  const watched = (task: Promise<void>, what: string): Promise<void> =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        logger.warn(`[${label}] ${what} 이 ${Math.round(watchdogMs / 1000)}초를 넘었다 — 다음 입력으로 넘어간다(취소하지 않는다)`);
        resolve();
      }, watchdogMs);
      const done = (): void => {
        clearTimeout(timer);
        resolve();
      };
      task.then(done, done);
    });

  /** 자리는 부르는 순간 잡힌다(동기) — `task` 는 앞 입력이 끝난 뒤 시작한다. */
  const enqueue = (channelId: string, what: string, task: () => Promise<void>): void => {
    const safe = (): Promise<void> =>
      Promise.resolve()
        .then(task)
        .catch((err) => logger.error(`[${label}] ${what} 실패: ${sanitizeError(err)}`));
    if (!serialize) {
      void safe();
      return;
    }
    const prev = tails.get(channelId) ?? Promise.resolve();
    const tail = prev.then(() => watched(safe(), what));
    tails.set(channelId, tail);
    void tail.then(() => {
      if (tails.get(channelId) === tail) tails.delete(channelId);
    });
  };

  const onMessage = (m: RawMessage): void => {
    if (m.author?.bot === true || m.webhook_id !== undefined) return;
    if (!MESSAGE_TYPES.has(Number(m.type ?? 0))) return;
    const userId = str(m.author?.id);
    const channelId = str(m.channel_id);
    if (!isAllowed(userId, channelId, opts.allowedUserIds, messageChannels)) {
      if (channelAllowed(channelId, messageChannels)) {
        logger.warn(`[${label}] 허용되지 않은 사용자의 메시지 무시 (user ${userId} · channel ${channelId})`);
      }
      return;
    }
    const raws = Array.isArray(m.attachments) ? (m.attachments as Record<string, unknown>[]) : [];
    const ctx: MessageContext = {
      platform: 'discord',
      userId,
      channelId,
      messageId: str(m.id),
      text: typeof m.content === 'string' ? m.content : '',
      attachments: raws.map((a) => toAttachment(a, policy, rest.fetch)),
      sentAt: messageSentAt(m, now()),
      reply: (msg) => rest.send(channelId, msg),
      replyFile: (file) => rest.sendFile(channelId, file),
      typing: () => rest.typing(channelId).catch((err) => logger.warn(`[${label}] 입력 중 표시 실패: ${sanitizeError(err)}`)),
    };
    if (ctx.text.trim() === '' && ctx.attachments.length === 0) return;
    enqueue(channelId, '메시지 처리', async () => {
      try {
        await opts.router.handleMessage(ctx);
      } catch (err) {
        logger.error(`[${label}] 메시지 처리 실패: ${sanitizeError(err)}`);
        await rest.send(channelId, FAILURE_TEXT).catch(() => undefined);
      }
    });
  };

  /**
   * 버튼 컨텍스트 — 인터랙션 토큰(15분)이 곧 만료되면 봇 토큰 경로로. 판정은 **메서드를 부를 때마다** 한다
   * (꺼낼 때 한 번만 보면 13분 대기 + 3분 핸들러가 만료 뒤 웹훅으로 가 조용히 실패한다 · PR-1 사전 리뷰 major · 009 D-2 [A2]#1).
   */
  const buttonContext = (i: RawInteraction, action: string, userId: string, channelId: string, receivedAt: number): ButtonContext => {
    const messageId = str(i.message?.id);
    const hook = `${apiBase}/webhooks/${str(i.application_id)}/${str(i.token)}`;
    let warned = false;
    const stale = (): boolean => {
      const s = now() - receivedAt > staleMs;
      if (s && !warned) {
        warned = true;
        logger.warn(`[${label}] 오래 기다린 버튼 — 봇 토큰으로 고친다 (${action.slice(0, 40)})`);
      }
      return s;
    };
    const send = (msg: Outgoing): Promise<SentMessage> => rest.send(channelId, msg);
    return {
      platform: 'discord',
      userId,
      channelId,
      messageId,
      action,
      send,
      // 버튼을 주지 않으면 지운다 — 눌린 버튼이 남아 두 번 눌리지 않게
      edit: async (msg) => {
        const m = normalize(msg);
        const withButtons = { ...m, buttons: m.buttons ?? [] };
        if (!stale()) return rest.editOriginal(hook, channelId, withButtons);
        // 원본 id 가 없으면 고칠 수 없다 — 새 메시지로(무표시보다 낫다)
        if (messageId === '') return void (await send(withButtons));
        return rest.edit(channelId, messageId, withButtons);
      },
      setButtons: async (rows) => {
        if (!stale()) return rest.setOriginalButtons(hook, rows);
        if (messageId === '') return logger.warn(`[${label}] 오래 기다린 버튼 — 원본 id 가 없어 버튼을 바꾸지 못했다`);
        return rest.setButtons(channelId, messageId, rows);
      },
      // 본인에게만 보이는 안내는 인터랙션 토큰이 있어야 한다 — 만료 직전이면 채널 메시지로 낮춘다(무표시보다 낫다)
      notice: async (text) => {
        if (!stale()) return rest.followupEphemeral(hook, text);
        await send(text);
      },
    };
  };

  const onInteraction = (i: RawInteraction): void => {
    // 버튼만 — type 3 은 모든 message component 라 component_type 2 까지 본다(PR #150 Codex P2)
    if (i.type !== 3 || i.data?.component_type !== 2 || typeof i.data?.custom_id !== 'string') return;
    const action = i.data.custom_id;
    const userId = str(i.member?.user?.id ?? i.user?.id);
    const channelId = str(i.channel_id);
    const callbackUrl = `${apiBase}/interactions/${str(i.id)}/${str(i.token)}/callback`;
    if (!isAllowed(userId, channelId, opts.allowedUserIds, opts.allowedChannelIds)) {
      logger.warn(`[${label}] 허용되지 않은 버튼 클릭 거부 (user ${userId} · channel ${channelId})`);
      rest
        .interactionCallback(callbackUrl, { type: 4, data: { content: '이 버튼을 누를 권한이 없습니다.', flags: EPHEMERAL } })
        .catch((err) => logger.error(`[${label}] 인터랙션 응답 실패: ${sanitizeError(err)}`));
      return;
    }
    const receivedAt = now();
    // 3초 안에 — 대기열 밖에서 바로 보낸다. 자리는 아래 enqueue 가 같은 틱에 잡는다(Codex P2 · ack 를 기다리는 사이 뒤 메시지가 앞지르지 않게)
    const busy = serialize && tails.has(channelId); // 앞 입력이 아직 돈다 — enqueue 전에 본다
    const ack = rest.interactionCallback(callbackUrl, { type: 6 });
    ack.catch(() => undefined); // 실패는 대기열 안에서 기록한다 — 처리 전 unhandled 방지
    if (busy && busyText !== false && busyText.trim() !== '') {
      // 대기열 밖 — ack 직후 바로(인터랙션 토큰이 살아 있다)
      const hook = `${apiBase}/webhooks/${str(i.application_id)}/${str(i.token)}`;
      ack
        .then(() => rest.followupEphemeral(hook, busyText))
        .catch((err) => logger.warn(`[${label}] 대기 안내 실패: ${sanitizeError(err)}`));
    }
    enqueue(channelId, `버튼 처리 (${action.slice(0, 40)})`, async () => {
      try {
        await ack;
      } catch (err) {
        logger.error(`[${label}] 인터랙션 응답 실패: ${sanitizeError(err)}`);
        return;
      }
      const ctx = buttonContext(i, action, userId, channelId, receivedAt);
      try {
        const handled = await opts.router.handleButton(ctx);
        if (!handled) logger.warn(`[${label}] 처리할 곳이 없는 버튼 (${action.slice(0, 40)})`);
      } catch (err) {
        logger.error(`[${label}] 버튼 처리 실패 (${action.slice(0, 40)}): ${sanitizeError(err)}`);
        await ctx.notice(FAILURE_TEXT).catch(() => undefined);
      }
    });
  };

  const beforeIdentify = async (): Promise<IdentifyDecision> => {
    if (opts.identifyGuard === 'none') return { ok: true };
    const remote = await rest.gatewayBot();
    const d = await opts.identifyGuard.check(remote);
    if (d.ok) return { ok: true };
    const why = {
      'local-limit': `24시간 IDENTIFY ${d.info.count}회 — 임계 ${d.info.limit}`,
      'remote-remaining': `Discord 가 알려 준 남은 IDENTIFY 가 임계 이하`,
      'state-unavailable': 'IDENTIFY 기록을 읽거나 쓸 수 없다',
    }[d.info.reason];
    return { ok: false, retryAt: d.info.retryAt, reason: why };
  };

  const gateway = createGateway({
    token: opts.token,
    intents,
    fallbackIntents,
    onIntentsFallback: opts.onIntentsFallback,
    label,
    logger,
    createSocket: opts.createSocket,
    reconnectDelaysMs: opts.reconnectDelaysMs,
    now,
    beforeIdentify,
    onDispatch: (type, data) => {
      // 동기로 부른다 — 대기열 자리가 받은 순서대로 잡힌다
      try {
        if (type === 'MESSAGE_CREATE') onMessage((data ?? {}) as RawMessage);
        else if (type === 'INTERACTION_CREATE') onInteraction((data ?? {}) as RawInteraction);
      } catch (err) {
        logger.error(`[${label}] ${type} 처리 실패: ${sanitizeError(err)}`);
      }
    },
  });

  return {
    start: () => gateway.start(),
    stop: () => gateway.stop(),
    send: (channelId, msg) => rest.send(channelId, msg),
  };
}
