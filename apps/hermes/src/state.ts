/**
 * 상태 파일(014 §3-G · H-1b #794) — 수집기(H-3)가 읽는다. **수치만** — 본문 · 키 · 웹훅 주소는 쓰지 않는다.
 * 원자적으로 쓴다(임시 파일 → rename) · 0600.
 */
import { renameSync, writeFileSync } from "node:fs";
import type { Queue } from "./queue";
import type { RegistryStatus } from "./registry";

export interface HermesState {
  readonly updatedAt: string;
  readonly queued: number;
  readonly oldestQueuedAt: string | null;
  readonly dead: number;
  readonly deadToday: number;
  readonly blockedToday: number;
  readonly linkDroppedToday: number;
  readonly lastSentAt: string | null;
  readonly webhook: boolean;
  readonly paused: "webhook" | "secrets" | null;
  readonly registrySources: number;
  readonly registryError: boolean;
  readonly expiringSoon: readonly string[];
}

export interface StateInputs {
  readonly webhook: boolean;
  readonly paused: "webhook" | "secrets" | null;
  readonly registry: RegistryStatus;
  readonly linkDroppedToday: number;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 그 시각이 속한 KST 날의 시작(UTC ms) */
export const kstDayStart = (now: number): number => Math.floor((now + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

export function buildState(queue: Queue, now: number, inputs: StateInputs): HermesState {
  const s = queue.stats(kstDayStart(now));
  return {
    updatedAt: new Date(now).toISOString(),
    queued: s.queued,
    oldestQueuedAt: iso(s.oldestQueuedAt),
    dead: s.dead,
    deadToday: s.deadSince,
    blockedToday: s.blockedSince,
    linkDroppedToday: inputs.linkDroppedToday,
    lastSentAt: iso(s.lastSentAt),
    webhook: inputs.webhook,
    paused: inputs.paused,
    registrySources: inputs.registry.sources,
    registryError: inputs.registry.error,
    expiringSoon: inputs.registry.expiringSoon,
  };
}

export function writeState(file: string, state: HermesState): void {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}
