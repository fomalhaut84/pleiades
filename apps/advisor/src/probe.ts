// `advisor probe` 판정 줄 (#839 · 015 V-1 · S0).
// 도메인마다 도구 정의 · 지식 바이트를, 끝에 시스템 프롬프트 합계를 낸다. 합계는 질문 경로와 같은 buildSystem 으로 잰다.
// 경고선(X2)을 넘으면 경고 줄만 낸다 — 막지 않는다(런타임 거부는 SYSTEM_MAX_BYTES 그대로 · rc 규칙은 main.ts).
import { SYSTEM_MAX_BYTES, buildSystem } from "./advisor";
import { DomainReady } from "./domains";

/** 015 §0-3 X2 — 상한의 75 % */
export const SYSTEM_WARN_BYTES = Math.floor(SYSTEM_MAX_BYTES * 0.75);

export interface ProbeReport {
  lines: string[];
  /** 준비된 도메인이 없으면 null(질문 경로도 시작하지 않는다) */
  systemBytes: number | null;
  warn: boolean;
}

const bytes = (s: string) => Buffer.byteLength(s, "utf8");

export function probeReport(lock: string, all: DomainReady[]): ProbeReport {
  const lines = [`배포 락: ${lock}`];
  for (const d of all) {
    lines.push(d.ok
      ? `${d.id}: 준비됨 · 읽기 도구 ${d.allow.length} · 도구 정의 ${d.toolBytes} B · 지식 ${bytes(d.knowledge)} B`
      : `${d.id}: 쓸 수 없음 · ${d.why}`);
  }
  const ready = all.filter((d): d is Extract<DomainReady, { ok: true }> => d.ok);
  if (!ready.length) return { lines, systemBytes: null, warn: false };
  const systemBytes = bytes(buildSystem(ready, all.filter((d) => !d.ok).map((d) => d.decl)));
  lines.push(`시스템 프롬프트: ${systemBytes} B · 경고선 ${SYSTEM_WARN_BYTES} B · 상한 ${SYSTEM_MAX_BYTES} B`);
  const warn = systemBytes > SYSTEM_WARN_BYTES;
  if (warn) lines.push("경고: 시스템 프롬프트가 경고선을 넘었다 — 015 §5 전환 조건 ③ · 막지 않는다(상한을 넘으면 새 세션이 거부된다)");
  return { lines, systemBytes, warn };
}
