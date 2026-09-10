/**
 * 코어 — 대상 1건 전송: 분할 → 청크마다 (재시도 + 파싱 실패 폴백).
 *
 * 정본 조합 (003 §3-1):
 *   - 재시도 백오프 `[2000, 8000, 30000]`ms × 총 4회 — 양쪽 동일. 네트워크 오류(`isNetworkError`)만.
 *   - 파싱 실패 폴백 판정 `isHtmlParseError` (fit 공유 정규식). 폴백 시 재시도 예산 보존 — fit `send.ts:59-62` 의 `attempt--`.
 *   - 길이 분할 fin `splitMessage` — 청크 단위 재시도·폴백은 fin `telegram.ts:61-73`.
 *
 * `transport.maxLength` 가 유한하면 코어가 분할하고 청크마다 정책을 건다(포트 계약: `send` = 청크 1건 = 멱등 단위).
 * `Infinity` 면 어댑터가 전부 소유하므로 `send` 를 한 번만 호출한다 — 재시도도 폴백도 하지 않는다.
 */
import { isHtmlParseError, isNetworkError, sanitizeError } from './error';
import { toPlain } from './plain';
import { splitMessage } from './split';
import type { Content, Logger, MessageRef, Transport } from './types';

export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [2000, 8000, 30000];

export interface DeliveryPolicy {
  retryDelaysMs: readonly number[];
  sleep: (ms: number) => Promise<void>;
  logger: Logger;
  /** 로그 prefix — 호출부 label (Q26 ①). */
  label: string;
}

export async function deliverOne(
  transport: Transport,
  target: string,
  content: Content,
  policy: DeliveryPolicy,
): Promise<MessageRef> {
  if (!Number.isFinite(transport.maxLength)) {
    // 어댑터 소유 모드 — 분할·재시도·폴백 전부 어댑터 몫.
    return transport.send(target, content);
  }

  const chunks = splitMessage(content.text, transport.maxLength);
  const last = chunks.length - 1;
  let ref: MessageRef | undefined;
  for (let i = 0; i < chunks.length; i++) {
    const chunk: Content =
      i === last && content.components !== undefined
        ? { text: chunks[i], format: content.format, components: content.components }
        : { text: chunks[i], format: content.format };
    ref = await sendChunkWithRetry(transport, target, chunk, policy);
  }
  // chunks 는 최소 1개 (splitMessage 는 빈 문자열에도 [''] 를 돌려준다)
  return ref as MessageRef;
}

async function sendChunkWithRetry(
  transport: Transport,
  target: string,
  chunk: Content,
  policy: DeliveryPolicy,
): Promise<MessageRef> {
  const maxAttempts = policy.retryDelaysMs.length + 1;
  let current = chunk;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await transport.send(target, current);
    } catch (err) {
      lastErr = err;
      // HTML 파싱 실패 → 같은 시도 횟수로 plain 전환 (백오프 없이 즉시 재시도 · fit 정본)
      if (current.format === 'html' && isHtmlParseError(err)) {
        current =
          current.components === undefined
            ? { text: toPlain(current.text), format: 'plain' }
            : { text: toPlain(current.text), format: 'plain', components: current.components };
        attempt--;
        continue;
      }
      if (!isNetworkError(err) || attempt === maxAttempts - 1) throw err;
      const delay = policy.retryDelaysMs[attempt];
      policy.logger.warn(
        `[${policy.label}] 전송 재시도 ${attempt + 1}/${maxAttempts} (${target}, ${delay}ms 후): ${sanitizeError(err)}`,
      );
      await policy.sleep(delay);
    }
  }
  throw lastErr ?? new Error('deliverOne: 재시도 모두 실패 (원인 미상)');
}
