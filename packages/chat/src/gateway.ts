/**
 * Discord gateway 연결 — 한 토큰 한 WebSocket (009 0-1 · B 제약). 프로토콜만 다루고 이벤트는 `onDispatch` 로 넘긴다.
 *
 * notify `discord-gateway.ts`(M-6b-2 #149)의 수명주기를 그대로 잇는다: HELLO → heartbeat · IDENTIFY/RESUME · READY ·
 * ACK 누락 = 좀비 → 끊고 RESUME · RECONNECT(7) · INVALID_SESSION(9) · 치명 close 코드는 멈춘다.
 * 바뀐 것: intents(메시지 수신) · **IDENTIFY 직전 보호 검사**(0-5) — 거부되면 접속하지 않고 허용 시각까지 기다린다.
 *
 * **로그 문자열 계약(0-4 · L16′):** `[<label>] gateway 준비 완료` — `deploy/discord-switch.sh` 가 이 줄로 판정한다. 바꾸지 않는다.
 */
import { sanitizeError } from '@pleiades/notify';
import type { Logger } from './types';

declare const require: (id: string) => unknown;
declare function setTimeout(fn: () => void, ms: number): unknown;
declare function clearTimeout(id: unknown): void;
declare function setInterval(fn: () => void, ms: number): unknown;
declare function clearInterval(id: unknown): void;

export interface WebSocketLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: 'message' | 'close' | 'error', fn: (...args: any[]) => void): void;
  send(data: string): void;
  close(code?: number): void;
  terminate?(): void;
}
export type WebSocketFactory = (url: string) => WebSocketLike;

/** GUILD_MESSAGES(1<<9) | MESSAGE_CONTENT(1<<15) — 인터랙션은 intent 없이 온다. */
export const MESSAGE_INTENTS = (1 << 9) | (1 << 15);

/** IDENTIFY 직전 검사 결과 — 거부면 `retryAt`(epoch ms)까지 접속하지 않는다. */
export type IdentifyDecision = { ok: true } | { ok: false; retryAt: number; reason: string };

export interface GatewayOptions {
  token: () => string;
  intents: number;
  onDispatch: (type: string, data: unknown) => void;
  /** IDENTIFY(새 세션) 직전에만 부른다 — RESUME 은 횟수 제한 대상이 아니다. */
  beforeIdentify?: () => Promise<IdentifyDecision>;
  label: string;
  logger: Logger;
  createSocket?: WebSocketFactory;
  reconnectDelaysMs?: readonly number[];
  now?: () => number;
}

export interface Gateway {
  start(): void;
  stop(): void;
}

const GATEWAY_URL = 'wss://gateway.discord.gg';
const QUERY = '/?v=10&encoding=json';
const FATAL_CLOSE = new Set([4004, 4010, 4011, 4012, 4013, 4014]);
const NEW_SESSION_CLOSE = new Set([4007, 4009]);
/** setTimeout 상한(약 24.8일) 안에서만 기다린다. */
const MAX_WAIT_MS = 2 ** 31 - 1;

interface Payload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

function defaultSocketFactory(): WebSocketFactory {
  let Ctor: (new (url: string) => WebSocketLike) | undefined;
  try {
    Ctor = require('ws') as new (url: string) => WebSocketLike;
  } catch {
    throw new Error("@pleiades/chat: 'ws' 패키지가 없다 — pleiades 루트에서 npm ci");
  }
  return (url) => new (Ctor as new (url: string) => WebSocketLike)(url);
}

function decode(data: unknown): Payload | undefined {
  try {
    const p = JSON.parse(typeof data === 'string' ? data : String(data)) as Payload;
    return typeof p?.op === 'number' ? p : undefined;
  } catch {
    return undefined;
  }
}

export function createGateway(opts: GatewayOptions): Gateway {
  const { label, logger } = opts;
  const delays = opts.reconnectDelaysMs ?? [1000, 5000, 15000, 30000];
  const now = opts.now ?? Date.now;

  let ws: WebSocketLike | undefined;
  let stopped = true;
  let seq: number | null = null;
  let sessionId: string | undefined;
  let resumeUrl: string | undefined;
  let heartbeat: unknown;
  let firstBeat: unknown;
  let timer: unknown;
  let acked = true;
  let failures = 0;

  const clearBeats = (): void => {
    if (heartbeat !== undefined) clearInterval(heartbeat);
    if (firstBeat !== undefined) clearTimeout(firstBeat);
    heartbeat = undefined;
    firstBeat = undefined;
  };
  const clearTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const sendPayload = (p: Payload): void => ws?.send(JSON.stringify(p));
  const beat = (): void => sendPayload({ op: 1, d: seq });
  const forgetSession = (): void => {
    sessionId = undefined;
    seq = null;
    resumeUrl = undefined;
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

  const later = (ms: number): void => {
    clearTimer();
    timer = setTimeout(() => {
      timer = undefined;
      connect();
    }, Math.min(Math.max(ms, 0), MAX_WAIT_MS));
  };

  const scheduleReconnect = (): void => {
    if (stopped) return;
    const delay = delays[Math.min(failures, delays.length - 1)];
    failures++;
    logger.warn(`[${label}] gateway 재접속 ${delay}ms 후 (${sessionId === undefined ? '새 세션' : 'RESUME'})`);
    later(delay);
  };

  const identify = async (sock: WebSocketLike): Promise<void> => {
    let decision: IdentifyDecision = { ok: true };
    if (opts.beforeIdentify !== undefined) {
      try {
        decision = await opts.beforeIdentify();
      } catch (err) {
        // 검사가 깨지면 접속하지 않는다(fail-closed) — 5분 뒤 다시 본다
        decision = { ok: false, retryAt: now() + 5 * 60_000, reason: `검사 실패: ${sanitizeError(err)}` };
      }
    }
    if (ws !== sock || stopped) return; // 그 사이 닫혔다
    if (!decision.ok) {
      const waitMs = decision.retryAt - now();
      logger.error(`[${label}] gateway IDENTIFY 보류 — ${decision.reason} · ${Math.ceil(Math.max(waitMs, 0) / 60_000)}분 뒤 다시 본다`);
      hardClose(1000);
      later(waitMs);
      return;
    }
    sendPayload({
      op: 2,
      d: { token: opts.token(), intents: opts.intents, properties: { os: 'linux', browser: 'pleiades', device: 'pleiades' } },
    });
  };

  const onHello = (sock: WebSocketLike, interval: number): void => {
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
      sendPayload({ op: 6, d: { token: opts.token(), session_id: sessionId, seq } });
      return;
    }
    identify(sock).catch((err) => logger.error(`[${label}] gateway IDENTIFY 실패: ${sanitizeError(err)}`));
  };

  const onPayload = (sock: WebSocketLike, p: Payload): void => {
    if (typeof p.s === 'number') seq = p.s;
    switch (p.op) {
      case 10:
        onHello(sock, Number((p.d as { heartbeat_interval?: unknown })?.heartbeat_interval) || 41250);
        break;
      case 11:
        acked = true;
        break;
      case 1:
        beat();
        break;
      case 7:
        hardClose(4000);
        scheduleReconnect();
        break;
      case 9:
        if (p.d !== true) forgetSession();
        hardClose(4000);
        scheduleReconnect();
        break;
      case 0:
        if (p.t === 'READY') {
          const r = (p.d ?? {}) as { session_id?: unknown; resume_gateway_url?: unknown };
          sessionId = typeof r.session_id === 'string' ? r.session_id : undefined;
          resumeUrl = typeof r.resume_gateway_url === 'string' ? r.resume_gateway_url : undefined;
          failures = 0;
          logger.warn(`[${label}] gateway 준비 완료`);
        } else if (p.t === 'RESUMED') {
          failures = 0;
          logger.warn(`[${label}] gateway 세션 이어받음`);
        } else if (typeof p.t === 'string') {
          opts.onDispatch(p.t, p.d);
        }
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
        onPayload(sock, p);
      } catch (err) {
        logger.error(`[${label}] gateway 메시지 처리 실패 (op ${p.op}): ${sanitizeError(err)}`);
      }
    });
    sock.on('error', (err: unknown) => logger.warn(`[${label}] gateway 오류: ${sanitizeError(err)}`));
    sock.on('close', (code: number) => {
      if (ws !== sock) return;
      ws = undefined;
      clearBeats();
      if (NEW_SESSION_CLOSE.has(code)) forgetSession();
      if (FATAL_CLOSE.has(code)) {
        stopped = true;
        const hint = code === 4014 ? ' — 포털에서 MESSAGE CONTENT INTENT 를 켠다' : '(토큰·권한 확인)';
        logger.error(`[${label}] gateway 종료 코드 ${code} — 다시 접속하지 않는다${hint}`);
        return;
      }
      scheduleReconnect();
    });
  };

  return {
    start() {
      if (!stopped) return;
      if (opts.token().trim() === '') throw new Error('@pleiades/chat: Discord 봇 토큰이 없다');
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      clearTimer();
      hardClose(1000);
    },
  };
}
