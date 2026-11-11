/**
 * 생존 표지 — gateway 가 살아 있다는 신호(READY · RESUMED · heartbeat ACK)를 파일 수정 시각으로 남긴다(#589).
 *
 * 서버 수집기(`deploy/ops/collect.cjs`)는 이 파일의 **수정 시각만** 본다 — 내용은 읽지 않는다.
 * 내용은 사람이 볼 때를 위한 시각·상태 이름뿐이다(토큰 · ID · 메시지 없음).
 * ACK 는 약 41초마다 오므로 쓰기는 `minIntervalMs`(기본 60초)에 한 번만 · READY·RESUMED 는 곧바로 쓴다.
 * 쓰기가 던지면 그대로 던진다 — gateway 가 삼키고 경고를 한 번 남긴다(실패한 쓰기는 간격을 잡지 않아 다음 ACK 에 다시 쓴다).
 */
import { fileGuardStore } from './identify-guard';

export type AliveState = 'ready' | 'resumed' | 'ack';

export interface AliveMarker {
  mark(state: AliveState): void;
}

export interface AliveMarkerOptions {
  write: (text: string) => void;
  /** ACK 쓰기 최소 간격 — 수집기 판정 시간(10분)보다 충분히 짧게. 기본 60초. */
  minIntervalMs?: number;
  now?: () => number;
}

export const DEFAULT_ALIVE_INTERVAL_MS = 60_000;

export function createAliveMarker(opts: AliveMarkerOptions): AliveMarker {
  const minInterval = opts.minIntervalMs ?? DEFAULT_ALIVE_INTERVAL_MS;
  const now = opts.now ?? Date.now;
  let last: number | undefined;
  return {
    mark(state) {
      const t = now();
      if (state === 'ack' && last !== undefined && t - last < minInterval) return;
      opts.write(JSON.stringify({ at: new Date(t).toISOString(), state }));
      last = t;
    },
  };
}

/** 파일 표지 — `fileGuardStore` 와 같은 쓰기(같은 디렉터리 임시 파일 600 → rename · 디렉터리 700). */
export function fileAliveMarker(file: string, opts: Omit<AliveMarkerOptions, 'write'> = {}): AliveMarker {
  const store = fileGuardStore(file);
  return createAliveMarker({ ...opts, write: (text) => store.write(text) });
}
