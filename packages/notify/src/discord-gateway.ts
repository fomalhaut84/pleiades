/**
 * Discord gateway 수신기 — 버튼 클릭(INTERACTION_CREATE · message component)만 받는다 (M-6b-2 #149 · 003 §6 1b-2a).
 *
 * 텔레그램 롱폴링과 같은 모델: 봇 프로세스가 **아웃바운드 WebSocket** 하나를 유지한다(공개 URL 불필요).
 * 프로토콜(v10 · JSON): HELLO → heartbeat 주기 · IDENTIFY(intents 0 — 인터랙션은 intent 없이 온다) · READY(session · resume URL) ·
 * HEARTBEAT_ACK 누락 = 좀비 연결 → 끊고 RESUME · RECONNECT(7) · INVALID_SESSION(9) · 치명 close 코드(인증 실패 등)는 멈춘다.
 *
 * 버튼 처리: 허용 사용자 ID **그리고** 허용 채널 ID 일 때만(사용자 결정 #147 — Discord 서버엔 다른 멤버가 있을 수 있다).
 * Discord 는 3초 안에 응답해야 한다 → 먼저 지연 응답(type 6 · 원본 수정 예정)을 보내고 핸들러를 돌린다.
 * 거부는 본인에게만 보이는 안내(type 4 · flags 64). 토큰은 로그·오류에 나오지 않는다.
 *
 * 소비자 `prepare` 는 @types/node 없이 컴파일된다(build-config M3) — `ws` 는 런타임 require · 타입은 최소 선언.
 */
import { DISCORD_API_BASE } from './discord-bot';
import { escapeDiscordMarkdown, htmlToDiscordMarkdown, splitDiscordMarkdown } from './discord-md';
import { defaultFetch, type FetchLike } from './discord';
import { sanitizeError } from './error';
import type { Logger } from './types';

declare const require: (id: string) => unknown;
declare function setTimeout(fn: () => void, ms: number): unknown;
declare function clearTimeout(id: unknown): void;
declare function setInterval(fn: () => void, ms: number): unknown;
declare function clearInterval(id: unknown): void;

/** `ws` 의 최소 형태. */
export interface WebSocketLike {
  /** `ws` 의 EventEmitter 형태 — message(data) · close(code, reason) · error(err). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: 'message' | 'close' | 'error', fn: (...args: any[]) => void): void;
  send(data: string): void;
  close(code?: number): void;
  /** 즉시 끊기(`ws` 는 있다) — 응답 없는 좀비 소켓은 close 핸드셰이크를 30초 기다리므로 이걸 먼저 쓴다. */
  terminate?(): void;
}
export type WebSocketFactory = (url: string) => WebSocketLike;

const GATEWAY_URL = 'wss://gateway.discord.gg';
const QUERY = '/?v=10&encoding=json';
/** 다시 접속하면 안 되는 close 코드 — 인증 실패 · 샤드 · intent 오류. */
const FATAL_CLOSE = new Set([4004, 4010, 4011, 4012, 4013, 4014]);
/** 다시 접속하되 새 세션(IDENTIFY)으로 — 4007 잘못된 seq · 4009 세션 시간 초과. */
const NEW_SESSION_CLOSE = new Set([4007, 4009]);
const EPHEMERAL = 64;

/** 버튼 클릭 컨텍스트 — 핸들러는 이것만 본다(Discord 프로토콜 비노출). */
export interface DiscordButtonContext {
  /** 버튼의 custom_id (= 텔레그램 callback_data). */
  customId: string;
  userId: string;
  channelId: string;
  messageId: string;
  /** 원본 메시지 본문을 바꾼다(HTML · 텔레그램 editMessageText 대응). `keepButtons` 가 아니면 버튼을 지운다. */
  edit(html: string, opts?: { keepButtons?: boolean }): Promise<void>;
  /** 누른 사람에게만 보이는 짧은 안내(텔레그램 answerCallbackQuery 토스트·알림 대응). */
  reply(text: string): Promise<void>;
}

export interface DiscordGatewayOptions {
  token: string;
  /** 버튼 클릭 처리. 던지면 누른 사람에게 일반 실패 안내를 보낸다(원문 미노출). */
  onButton: (ctx: DiscordButtonContext) => Promise<void>;
  /** 허용 사용자 ID 목록 — 호출 때마다 읽는다. 비면 전부 거부. */
  allowedUserIds: () => readonly string[];
  /** 허용 채널 ID 목록 — 호출 때마다 읽는다. 비면 전부 거부. */
  allowedChannelIds: () => readonly string[];
  /** 로그 prefix (기본 `discord`). */
  label?: string;
  logger?: Logger;
  fetch?: FetchLike;
  /** 테스트 주입. 기본 `require('ws')`. */
  createSocket?: WebSocketFactory;
  /** 재연결 대기(ms) — 연속 실패마다 늘어난다. 기본 [1000, 5000, 15000, 30000]. */
  reconnectDelaysMs?: readonly number[];
  apiBase?: string;
}

export interface DiscordGateway {
  start(): void;
  /** 접속을 닫고 재연결하지 않는다. */
  stop(): void;
}

interface GatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

interface InteractionLike {
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

function defaultSocketFactory(): WebSocketFactory {
  let Ctor: (new (url: string) => WebSocketLike) | undefined;
  try {
    Ctor = require('ws') as new (url: string) => WebSocketLike;
  } catch {
    throw new Error("@pleiades/notify: 'ws' 패키지가 없다 — pleiades 루트에서 npm ci");
  }
  return (url) => new (Ctor as new (url: string) => WebSocketLike)(url);
}

function decode(data: unknown): GatewayPayload | undefined {
  try {
    const text = typeof data === 'string' ? data : String(data);
    const p = JSON.parse(text) as GatewayPayload;
    return typeof p?.op === 'number' ? p : undefined;
  } catch {
    return undefined;
  }
}

export function createDiscordGateway(opts: DiscordGatewayOptions): DiscordGateway {
  const label = opts.label ?? 'discord';
  const logger = opts.logger ?? console;
  const apiBase = opts.apiBase ?? DISCORD_API_BASE;
  const delays = opts.reconnectDelaysMs ?? [1000, 5000, 15000, 30000];
  const fetchFn = (): FetchLike => opts.fetch ?? defaultFetch();

  let ws: WebSocketLike | undefined;
  let stopped = true;
  let seq: number | null = null;
  let sessionId: string | undefined;
  let resumeUrl: string | undefined;
  let heartbeat: unknown;
  let firstBeat: unknown;
  let reconnectTimer: unknown;
  let acked = true;
  let failures = 0;

  const clearBeats = (): void => {
    if (heartbeat !== undefined) clearInterval(heartbeat);
    if (firstBeat !== undefined) clearTimeout(firstBeat);
    heartbeat = undefined;
    firstBeat = undefined;
  };
  const sendPayload = (p: GatewayPayload): void => ws?.send(JSON.stringify(p));
  const beat = (): void => sendPayload({ op: 1, d: seq });

  const scheduleReconnect = (): void => {
    if (stopped) return;
    const delay = delays[Math.min(failures, delays.length - 1)];
    failures++;
    logger.warn(`[${label}] gateway 재접속 ${delay}ms 후 (${sessionId === undefined ? '새 세션' : 'RESUME'})`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, delay);
  };

  const hardClose = (code: number, immediate = false): void => {
    clearBeats();
    const sock = ws;
    ws = undefined;
    try {
      if (immediate && sock?.terminate !== undefined) sock.terminate();
      else sock?.close(code);
    } catch {
      // 이미 닫힘
    }
  };

  const onHello = (interval: number): void => {
    clearBeats();
    acked = true;
    const tick = (): void => {
      if (!acked) {
        logger.warn(`[${label}] heartbeat ACK 없음 — 좀비 연결로 보고 다시 접속`);
        hardClose(4000, true);
        scheduleReconnect();
        return;
      }
      acked = false;
      beat();
    };
    firstBeat = setTimeout(() => {
      tick();
      heartbeat = setInterval(tick, interval);
    }, Math.floor(interval * Math.random()));
    if (sessionId !== undefined && seq !== null) {
      sendPayload({ op: 6, d: { token: opts.token, session_id: sessionId, seq } });
    } else {
      sendPayload({
        op: 2,
        d: { token: opts.token, intents: 0, properties: { os: 'linux', browser: 'pleiades', device: 'pleiades' } },
      });
    }
  };

  /** 인터랙션 REST — 실패 응답은 상태 코드만 담아 던진다(URL 에 인터랙션 토큰이 있다). */
  const call = async (url: string, method: string, body: unknown, what: string): Promise<void> => {
    const res = await fetchFn()(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Discord 인터랙션 ${what} 응답 ${res.status}`);
  };
  /** 본문을 Discord md 로 바꿔 한 메시지에 담는다 — 비면 보내지 않고 오류 · 2000자를 넘어 자르면 경고(#149 사전 리뷰 info). */
  const callText = (text: string, format: 'html' | 'plain', send: (content: string) => Promise<void>): Promise<void> => {
    const chunks = splitDiscordMarkdown(format === 'html' ? htmlToDiscordMarkdown(text) : escapeDiscordMarkdown(text), 2000);
    const content = chunks[0] ?? '';
    if (content.trim() === '') return Promise.reject(new Error('Discord 인터랙션 본문이 비었다'));
    if (chunks.length > 1) logger.warn(`[${label}] 인터랙션 본문이 2000자를 넘어 첫 조각만 보낸다`);
    return send(content);
  };
  const callback = (i: InteractionLike, body: unknown): Promise<void> =>
    call(`${apiBase}/interactions/${String(i.id)}/${String(i.token)}/callback`, 'POST', body, '응답');

  const handleInteraction = async (i: InteractionLike): Promise<void> => {
    // 버튼만 — type 3 은 모든 message component(선택 메뉴 포함)라 component_type 2 까지 본다 (PR #150 Codex P2)
    if (i.type !== 3 || i.data?.component_type !== 2 || typeof i.data?.custom_id !== 'string') return;
    const userId = String(i.member?.user?.id ?? i.user?.id ?? '');
    const channelId = String(i.channel_id ?? '');
    const allowed = opts.allowedUserIds().includes(userId) && opts.allowedChannelIds().includes(channelId);
    if (!allowed) {
      logger.warn(`[${label}] 허용되지 않은 버튼 클릭 거부 (user ${userId} · channel ${channelId})`);
      await callback(i, { type: 4, data: { content: '이 버튼을 누를 권한이 없습니다.', flags: EPHEMERAL } });
      return;
    }
    await callback(i, { type: 6 }); // 3초 안에 — 원본 수정 예정(DEFERRED_UPDATE_MESSAGE)
    const hook = `${apiBase}/webhooks/${String(i.application_id)}/${String(i.token)}`;
    const ctx: DiscordButtonContext = {
      customId: i.data.custom_id,
      userId,
      channelId,
      messageId: String(i.message?.id ?? ''),
      edit: (html, editOpts) =>
        callText(
          html,
          'html',
          (content) => call(
            `${hook}/messages/@original`,
            'PATCH',
            {
              content,
              allowed_mentions: { parse: [] },
              ...(editOpts?.keepButtons === true ? {} : { components: [] }),
            },
            '원본 수정',
          ),
        ),
      reply: (text) =>
        callText(text, 'plain', (content) =>
          call(hook, 'POST', { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } }, '후속'),
        ),
    };
    try {
      await opts.onButton(ctx);
    } catch (err) {
      logger.error(`[${label}] 버튼 처리 실패 (${ctx.customId}): ${sanitizeError(err)}`);
      await ctx.reply('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.').catch(() => undefined);
    }
  };

  const onDispatch = (t: string | null | undefined, d: unknown): void => {
    if (t === 'READY') {
      const r = (d ?? {}) as { session_id?: unknown; resume_gateway_url?: unknown };
      sessionId = typeof r.session_id === 'string' ? r.session_id : undefined;
      resumeUrl = typeof r.resume_gateway_url === 'string' ? r.resume_gateway_url : undefined;
      failures = 0;
      logger.warn(`[${label}] gateway 준비 완료`);
    } else if (t === 'RESUMED') {
      failures = 0;
      logger.warn(`[${label}] gateway 세션 이어받음`);
    } else if (t === 'INTERACTION_CREATE') {
      handleInteraction(d as InteractionLike).catch((err) =>
        logger.error(`[${label}] 인터랙션 응답 실패: ${sanitizeError(err)}`),
      );
    }
  };

  const onPayload = (p: GatewayPayload): void => {
    if (typeof p.s === 'number') seq = p.s;
    switch (p.op) {
      case 10:
        onHello(Number((p.d as { heartbeat_interval?: unknown })?.heartbeat_interval) || 41250);
        break;
      case 11:
        acked = true;
        break;
      case 1:
        beat();
        break;
      case 7: // RECONNECT — 이어받기
        hardClose(4000);
        scheduleReconnect();
        break;
      case 9: // INVALID_SESSION — d=false 면 새 세션
        if (p.d !== true) {
          sessionId = undefined;
          seq = null;
          resumeUrl = undefined;
        }
        hardClose(4000);
        scheduleReconnect();
        break;
      case 0:
        onDispatch(p.t, p.d);
        break;
      default:
        break;
    }
  };

  const connect = (): void => {
    if (stopped) return;
    const factory = opts.createSocket ?? defaultSocketFactory();
    const base = sessionId !== undefined && resumeUrl !== undefined ? resumeUrl : GATEWAY_URL;
    const sock = factory(`${base.replace(/\/+$/, '')}${QUERY}`);
    ws = sock;
    sock.on('message', (data: unknown) => {
      if (ws !== sock) return;
      const p = decode(data);
      if (p === undefined) return;
      try {
        onPayload(p);
      } catch (err) {
        // 리스너 밖으로 던지면 프로세스가 죽는다 — 기록만
        logger.error(`[${label}] gateway 메시지 처리 실패 (op ${p.op}): ${sanitizeError(err)}`);
      }
    });
    sock.on('error', (err: unknown) => logger.warn(`[${label}] gateway 오류: ${sanitizeError(err)}`));
    sock.on('close', (code: number) => {
      if (ws !== sock) return; // 우리가 닫은 이전 소켓
      ws = undefined;
      clearBeats();
      if (NEW_SESSION_CLOSE.has(code)) {
        // 재접속하되 이어받지 않는다(Discord: 잘못된 seq · 세션 만료)
        sessionId = undefined;
        seq = null;
        resumeUrl = undefined;
      }
      if (FATAL_CLOSE.has(code)) {
        stopped = true;
        logger.error(`[${label}] gateway 종료 코드 ${code} — 다시 접속하지 않는다(토큰·권한 확인)`);
        return;
      }
      scheduleReconnect();
    });
  };

  return {
    start() {
      if (!stopped) return;
      if (opts.token.trim() === '') throw new Error('@pleiades/notify: Discord 봇 토큰이 없다');
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      hardClose(1000);
    },
  };
}
