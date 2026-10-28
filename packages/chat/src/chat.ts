/**
 * `createChat` — 앱 봇 프로세스가 부르는 진입점. gateway 하나로 메시지와 버튼을 받아 허용 검사 → 중립 컨텍스트 → 라우터 (009 D-0).
 *
 * - 메시지: 다른 봇·웹훅이 쓴 것, 일반/답장 외 유형은 무시. 허용 채널이 아니면 조용히 무시(다른 채널 잡담에 반응하지 않는다) ·
 *   허용 채널의 허용 안 된 사용자는 기록만 하고 답하지 않는다(guild 채널은 남이 본다 · R8).
 * - 버튼: 허용 밖이면 누른 사람에게만 거부 안내 · 허용이면 3초 안에 지연 응답(type 6) 뒤 핸들러.
 * - 핸들러가 던지면 원문을 노출하지 않는 일반 안내로 답한다.
 */
import { sanitizeError } from '@pleiades/notify';
import { DEFAULT_ATTACHMENT_POLICY, toAttachment, type AttachmentPolicy } from './attachments';
import { channelAllowed, isAllowed, type IdList } from './auth';
import { createGateway, MESSAGE_INTENTS, type IdentifyDecision, type WebSocketFactory } from './gateway';
import type { IdentifyGuard } from './identify-guard';
import { createRest, normalize, type ChatFetch, type Rest } from './rest';
import type { Router } from './router';
import type { ButtonContext, Logger, MessageContext, Outgoing, SentMessage } from './types';

export interface ChatOptions {
  /** 봇 토큰 — 부를 때마다 읽는다. */
  token: () => string;
  router: Router;
  allowedUserIds: IdList;
  /** 대화를 받는 채널 · 버튼이 달린 알림 채널 둘 다 여기에(C-7). */
  allowedChannelIds: IdList;
  /** 로그 prefix — 기존 봇 프로세스와 같은 `discord-<app>` 을 쓴다(0-4 판정 문자열). */
  label: string;
  /** IDENTIFY 보호(0-5) — 필수. 끄려면 `'none'` 을 명시한다(테스트 · 일회성 도구만 · #332 사전 리뷰 info 1). */
  identifyGuard: IdentifyGuard | 'none';
  /**
   * gateway intents — 기본 `MESSAGE_INTENTS`(일반 메시지 수신 · 개발자 포털 MESSAGE CONTENT 토글 필요 · 없으면 4014).
   * `0` 이면 버튼만 받는다 — 인터랙션은 intent 없이 온다(009 D-1 G1 · 포털 토글 전 단계).
   */
  intents?: number;
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
const EPHEMERAL = 64;
/** 0 = 일반 · 19 = 답장. 그 밖(핀 · 입장 알림 등)은 명령이 아니다. */
const MESSAGE_TYPES = new Set([0, 19]);

interface RawMessage {
  id?: unknown;
  channel_id?: unknown;
  content?: unknown;
  type?: unknown;
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

export function createChat(opts: ChatOptions): Chat {
  const logger = opts.logger ?? console;
  const label = opts.label;
  const policy = opts.attachmentPolicy ?? DEFAULT_ATTACHMENT_POLICY;
  const now = opts.now ?? Date.now;
  const intents = opts.intents ?? MESSAGE_INTENTS;
  if (!Number.isInteger(intents) || intents < 0) throw new Error(`[${label}] intents 는 0 이상의 정수여야 한다`);
  const rest: Rest = createRest({
    token: opts.token,
    fetch: opts.fetch,
    apiBase: opts.apiBase,
    logger,
    retryDelaysMs: opts.retryDelaysMs,
    sleep: opts.sleep,
  });
  const apiBase = opts.apiBase ?? 'https://discord.com/api/v10';

  const onMessage = async (m: RawMessage): Promise<void> => {
    if (m.author?.bot === true || m.webhook_id !== undefined) return;
    if (!MESSAGE_TYPES.has(Number(m.type ?? 0))) return;
    const userId = str(m.author?.id);
    const channelId = str(m.channel_id);
    if (!isAllowed(userId, channelId, opts.allowedUserIds, opts.allowedChannelIds)) {
      if (channelAllowed(channelId, opts.allowedChannelIds)) {
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
      reply: (msg) => rest.send(channelId, msg),
      replyFile: (file) => rest.sendFile(channelId, file),
    };
    if (ctx.text.trim() === '' && ctx.attachments.length === 0) return;
    try {
      await opts.router.handleMessage(ctx);
    } catch (err) {
      logger.error(`[${label}] 메시지 처리 실패: ${sanitizeError(err)}`);
      await rest.send(channelId, FAILURE_TEXT).catch(() => undefined);
    }
  };

  const onInteraction = async (i: RawInteraction): Promise<void> => {
    // 버튼만 — type 3 은 모든 message component 라 component_type 2 까지 본다(PR #150 Codex P2)
    if (i.type !== 3 || i.data?.component_type !== 2 || typeof i.data?.custom_id !== 'string') return;
    const action = i.data.custom_id;
    const userId = str(i.member?.user?.id ?? i.user?.id);
    const channelId = str(i.channel_id);
    const callbackUrl = `${apiBase}/interactions/${str(i.id)}/${str(i.token)}/callback`;
    if (!isAllowed(userId, channelId, opts.allowedUserIds, opts.allowedChannelIds)) {
      logger.warn(`[${label}] 허용되지 않은 버튼 클릭 거부 (user ${userId} · channel ${channelId})`);
      await rest.interactionCallback(callbackUrl, { type: 4, data: { content: '이 버튼을 누를 권한이 없습니다.', flags: EPHEMERAL } });
      return;
    }
    await rest.interactionCallback(callbackUrl, { type: 6 }); // 3초 안에 — 원본 수정 예정
    const hook = `${apiBase}/webhooks/${str(i.application_id)}/${str(i.token)}`;
    const ctx: ButtonContext = {
      platform: 'discord',
      userId,
      channelId,
      messageId: str(i.message?.id),
      action,
      // 버튼을 주지 않으면 지운다 — 눌린 버튼이 남아 두 번 눌리지 않게
      edit: (msg) => {
        const m = normalize(msg);
        return rest.editOriginal(hook, channelId, { ...m, buttons: m.buttons ?? [] });
      },
      setButtons: (rows) => rest.setOriginalButtons(hook, rows),
      notice: (text) => rest.followupEphemeral(hook, text),
      send: (msg) => rest.send(channelId, msg),
    };
    try {
      const handled = await opts.router.handleButton(ctx);
      if (!handled) logger.warn(`[${label}] 처리할 곳이 없는 버튼 (${action.slice(0, 40)})`);
    } catch (err) {
      logger.error(`[${label}] 버튼 처리 실패 (${action.slice(0, 40)}): ${sanitizeError(err)}`);
      await ctx.notice(FAILURE_TEXT).catch(() => undefined);
    }
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
    label,
    logger,
    createSocket: opts.createSocket,
    reconnectDelaysMs: opts.reconnectDelaysMs,
    now,
    beforeIdentify,
    onDispatch: (type, data) => {
      if (type === 'MESSAGE_CREATE') {
        onMessage((data ?? {}) as RawMessage).catch((err) => logger.error(`[${label}] 메시지 응답 실패: ${sanitizeError(err)}`));
      } else if (type === 'INTERACTION_CREATE') {
        onInteraction((data ?? {}) as RawInteraction).catch((err) =>
          logger.error(`[${label}] 인터랙션 응답 실패: ${sanitizeError(err)}`),
        );
      }
    },
  });

  return {
    start: () => gateway.start(),
    stop: () => gateway.stop(),
    send: (channelId, msg) => rest.send(channelId, msg),
  };
}
