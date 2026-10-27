/**
 * IDENTIFY 보호 (009 0-5 · R5 · S-2).
 *
 * Discord 는 봇 토큰 하나당 24시간 IDENTIFY 횟수를 제한하고(한도 1000), 넘기면 토큰을 리셋한다.
 * 기전은 **재시작 루프**라 메모리 안 카운터는 매번 0 부터 센다 — 그래서 시각을 **파일**에 남겨 재시작을 넘어 센다.
 * 임계(기본 100 · 사용자 2026-10-27)에 닿으면 IDENTIFY 를 거부하고 `onBlocked` 를 **한 번만** 부른다 —
 * 알림을 보냈다는 사실도 파일에 남겨 재시작마다 다시 알리지 않는다. 알림 경로는 호출자가 봇 토큰과 무관한 것(웹훅)으로 고른다.
 *
 * 기록을 쓸 수 없으면 거부한다(fail-closed) — 셀 수 없으면 보호도 없다. 그 사실도 `onBlocked` 로 1회(프로세스당) 알린다.
 */

declare const require: (id: string) => unknown;

const processId = (): string => String((globalThis as { process?: { pid?: unknown } }).process?.pid ?? 'p');

export interface GuardStore {
  /** 없으면 `undefined`. */
  read(): string | undefined;
  /** 원자적으로 바꾼다. */
  write(text: string): void;
}

export type BlockReason = 'local-limit' | 'remote-remaining' | 'state-unavailable';

export interface BlockInfo {
  reason: BlockReason;
  /** 창 안 IDENTIFY 횟수(로컬 기록). */
  count: number;
  limit: number;
  /** 다시 시도해도 되는 시각(epoch ms). */
  retryAt: number;
}

export interface IdentifyGuardOptions {
  store: GuardStore;
  /** 기본 100. */
  limit?: number;
  /** 기본 24 h. */
  windowMs?: number;
  /** 플랫폼이 알려 준 남은 횟수가 이 값 이하면 거부. 기본 100(`limit` 과 무관 — limit 을 키워도 영구 차단이 되지 않게). */
  minRemaining?: number;
  onBlocked: (info: BlockInfo) => void | Promise<void>;
  now?: () => number;
}

export type GuardDecision = { ok: true } | { ok: false; info: BlockInfo };

export interface IdentifyGuard {
  /** IDENTIFY 직전에 부른다. 허용이면 그 시도를 기록한다. `remaining` 은 `GET /gateway/bot` 결과(모르면 생략). */
  check(remote?: { remaining: number; resetAfterMs: number }): Promise<GuardDecision>;
}

interface State {
  attempts: number[];
  /** 마지막으로 알린 시각 — 그 뒤 창이 지나기 전엔 다시 알리지 않는다. */
  alertedAt?: number;
}

export const DEFAULT_IDENTIFY_LIMIT = 100;
export const DEFAULT_MIN_REMAINING = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseState(text: string | undefined): State {
  if (text === undefined) return { attempts: [] };
  try {
    const raw = JSON.parse(text) as { attempts?: unknown; alertedAt?: unknown };
    const attempts = Array.isArray(raw.attempts) ? raw.attempts.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : [];
    const alertedAt = typeof raw.alertedAt === 'number' && Number.isFinite(raw.alertedAt) ? raw.alertedAt : undefined;
    return { attempts, ...(alertedAt === undefined ? {} : { alertedAt }) };
  } catch {
    // 깨진 기록 — 원자적 쓰기라 정상 경로에선 생기지 않는다. 비어 있다고 보되 다음 쓰기로 덮는다
    return { attempts: [] };
  }
}

export function createIdentifyGuard(opts: IdentifyGuardOptions): IdentifyGuard {
  const limit = opts.limit ?? DEFAULT_IDENTIFY_LIMIT;
  const windowMs = opts.windowMs ?? DAY_MS;
  const minRemaining = opts.minRemaining ?? DEFAULT_MIN_REMAINING;
  const now = opts.now ?? Date.now;
  let unwritableAlerted = false;

  const alert = async (info: BlockInfo): Promise<void> => {
    try {
      await opts.onBlocked(info);
    } catch {
      // 알림 실패는 차단을 바꾸지 않는다 — 호출자 로그에 맡긴다
    }
  };

  return {
    async check(remote) {
      const t = now();
      let text: string | undefined;
      try {
        text = opts.store.read();
      } catch {
        const info: BlockInfo = { reason: 'state-unavailable', count: 0, limit, retryAt: t + 5 * 60_000 };
        if (!unwritableAlerted) {
          unwritableAlerted = true;
          await alert(info);
        }
        return { ok: false, info };
      }
      const prev = parseState(text);
      // 미래 시각 기록도 남긴다 — 시계가 뒤로 가면(NTP 보정) 버리는 순간 카운트가 줄어 보호가 풀린다(#332 사전 리뷰 info 2)
      const attempts = prev.attempts.filter((a) => a > t - windowMs);
      const alreadyAlerted = prev.alertedAt !== undefined && prev.alertedAt > t - windowMs;

      let blocked: BlockInfo | undefined;
      if (attempts.length >= limit) {
        // 가장 오래된 기록이 창 밖으로 나가 한도 아래가 되는 시각
        const sorted = [...attempts].sort((a, b) => a - b);
        blocked = { reason: 'local-limit', count: attempts.length, limit, retryAt: sorted[attempts.length - limit] + windowMs };
      } else if (remote !== undefined && remote.remaining <= minRemaining) {
        blocked = { reason: 'remote-remaining', count: attempts.length, limit, retryAt: t + Math.max(remote.resetAfterMs, 60_000) };
      }

      if (blocked !== undefined) {
        const next: State = { attempts, alertedAt: alreadyAlerted ? prev.alertedAt : t };
        try {
          opts.store.write(JSON.stringify(next));
        } catch {
          // 기록을 못 써도 차단은 유지한다 — 알림 중복 방지만 잃는다
        }
        if (!alreadyAlerted) await alert(blocked);
        return { ok: false, info: blocked };
      }

      const next: State = { attempts: [...attempts, t], ...(alreadyAlerted ? { alertedAt: prev.alertedAt } : {}) };
      try {
        opts.store.write(JSON.stringify(next));
      } catch {
        const info: BlockInfo = { reason: 'state-unavailable', count: attempts.length, limit, retryAt: t + 5 * 60_000 };
        if (!unwritableAlerted) {
          unwritableAlerted = true;
          await alert(info);
        }
        return { ok: false, info };
      }
      return { ok: true };
    },
  };
}

interface FsLike {
  readFileSync(p: string, enc: 'utf8'): string;
  writeFileSync(p: string, data: string, o: { mode: number }): void;
  renameSync(a: string, b: string): void;
  mkdirSync(p: string, o: { recursive: true; mode: number }): void;
  chmodSync(p: string, mode: number): void;
}
interface PathLike {
  dirname(p: string): string;
  basename(p: string): string;
  join(...p: string[]): string;
}

/** 파일 기록 — 같은 디렉터리 임시 파일(600)에 쓰고 rename. 경로는 호출자가 정한다(서버 상태 경로 · 로컬 `.chat-local/`). */
export function fileGuardStore(file: string): GuardStore {
  const fs = require('fs') as FsLike;
  const path = require('path') as PathLike;
  return {
    read() {
      try {
        return fs.readFileSync(file, 'utf8');
      } catch (err) {
        if ((err as { code?: unknown })?.code === 'ENOENT') return undefined;
        throw err;
      }
    },
    write(text) {
      const dir = path.dirname(file);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      // 같은 기록을 두 프로세스가 써도 서로의 임시 파일을 rename 하지 않게(#332 사전 리뷰 info 3)
      const tmp = path.join(dir, `.${path.basename(file)}.${processId()}.${Math.random().toString(36).slice(2)}.tmp`);
      fs.writeFileSync(tmp, text, { mode: 0o600 });
      fs.chmodSync(tmp, 0o600);
      fs.renameSync(tmp, file);
    },
  };
}
