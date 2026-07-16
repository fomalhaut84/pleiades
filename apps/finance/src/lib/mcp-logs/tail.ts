/**
 * Phase 37-C (#446) — MCP 로그 실시간 tail 유틸.
 * `route.ts` 는 이 pure util 위에서 SSE stream 을 조립한다.
 *
 * 접근: `fs.watch` 는 Linux append 이벤트 신뢰성이 낮아 (드롭·중복) 폴링 기반으로 파일
 * 사이즈 성장을 감지한다. 신규 바이트만 UTF-8 로 디코드해 라인 분리, 마지막 불완전
 * 라인은 다음 poll 까지 `carry` 로 유지한다.
 */

import fs from 'node:fs'

/** poll 간격 (ms). 실서비스 UX 와 CPU 부하 사이 균형. */
export const POLL_INTERVAL_MS = 1500

/** SSE keepalive (프록시 idle timeout 방어). */
export const KEEPALIVE_INTERVAL_MS = 25_000

/**
 * 한 poll 당 읽어들일 최대 바이트. 로그 폭주(스트레스/부트 로그 대량 flush) 시
 * 이벤트 루프가 오래 블록되지 않도록 컷.
 */
export const MAX_CHUNK_BYTES = 512 * 1024

/**
 * 신규 라인만 방출하기 위한 라인 분리기.
 * - chunk 는 이번 poll 에서 새로 읽은 텍스트 (UTF-8 조각일 수 있음).
 * - carry 는 지난 poll 에서 남긴 불완전 라인 (뒤에 `\n` 이 없던 부분).
 *
 * 반환: `lines` 는 완결된 라인 배열 (`\n` 제거 후, 공백만 있는 라인은 제외).
 *      `carry` 는 마지막 `\n` 이후의 나머지 (다음 poll 로 넘김).
 *
 * 마지막 문자가 `\n` 이면 carry 는 빈 문자열.
 */
export function splitLinesWithCarryover(
  chunk: string,
  carry: string,
): { lines: string[]; carry: string } {
  if (!chunk) return { lines: [], carry }
  const combined = carry + chunk
  const parts = combined.split('\n')
  // 마지막 원소는 항상 "마지막 \n 이후" 이므로 carry 로 유지.
  const nextCarry = parts.pop() ?? ''
  const lines = parts.filter((l) => l.length > 0)
  return { lines, carry: nextCarry }
}

/**
 * 파일 descriptor 에서 `[from, to)` 구간을 raw Buffer 로 읽는다.
 * `to - from` 이 0 이하이면 빈 결과.
 *
 * 반환 `bytesRead` 는 실제 fs.readSync 가 채운 바이트 수 (요청보다 작을 수 있음).
 * caller 는 `position += bytesRead` 로 소비한 만큼만 전진해야 데이터 유실이 없다
 * (Codex #454 P1 — 이전엔 요청 size 만큼 무조건 전진하다 short-read 시 스킵).
 *
 * ⚠️ UTF-8 디코딩은 이 함수에서 수행하지 않는다 (Codex #455 P2). Buffer 를 직접
 * `.toString('utf-8')` 하면 멀티바이트가 chunk 경계에 걸릴 때 U+FFFD 로 치환되어
 * 데이터 손실 → 다음 poll 로 이어붙일 수 없다. caller 가 `StringDecoder` 세션을
 * 유지하며 `decoder.write(buf)` 로 partial byte 를 내부 버퍼에 남기도록 해야 한다.
 */
export function readNewBytes(
  fd: number,
  from: number,
  to: number,
): { buf: Buffer; bytesRead: number } {
  const size = to - from
  if (size <= 0) return { buf: Buffer.alloc(0), bytesRead: 0 }
  const buf = Buffer.alloc(size)
  const bytesRead = fs.readSync(fd, buf, 0, size, from)
  if (bytesRead <= 0) return { buf: Buffer.alloc(0), bytesRead: 0 }
  return { buf: buf.subarray(0, bytesRead), bytesRead }
}
