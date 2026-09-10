/**
 * 길이 분할 — 정본 myFinance `src/bot/utils/formatter.ts:50-78` (003 §3-1 · 발견 11 "fit 절단은 내용 유실").
 * 줄 경계 우선 · 한도보다 긴 한 줄은 하드 슬라이스. 분할 위치는 코어(§4-3 제약 2 둘째 형태 — `Transport.maxLength`).
 */

export const TELEGRAM_MAX_LENGTH = 4096;

export function splitMessage(text: string, maxLength = TELEGRAM_MAX_LENGTH): string[] {
  if (text.length <= maxLength) return [text];

  const lines = text.split('\n');
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    if (line.length > maxLength) {
      if (current) chunks.push(current);
      for (let i = 0; i < line.length; i += maxLength) {
        chunks.push(line.slice(i, i + maxLength));
      }
      current = '';
      continue;
    }
    if (current.length + line.length + 1 > maxLength) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}
