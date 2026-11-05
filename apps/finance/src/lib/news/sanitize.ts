/**
 * pleiades#280 — 기사 제목·출처는 외부 텍스트이고 AI 프롬프트로 들어간다.
 * 봇 대화는 쓰기 도구를 가지므로(#421) 태그·꺾쇠·제어 문자를 없애고 한 줄로 줄여, 데이터 블록을 닫거나
 * 새 줄로 지시처럼 보이게 만들지 못하게 한다.
 */

export const NEWS_TITLE_MAX_LENGTH = 200
export const NEWS_SOURCE_MAX_LENGTH = 60
const URL_MAX_LENGTH = 500
const RAW_LENGTH_FACTOR = 8
const ENTITY_DECODE_ROUNDS = 4
const ANGLE_LIKE = /[<>＜＞〈〉《》⟨⟩‹›«»﹤﹥]/g

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeCodePoint(code: number, original: string): string {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : original
}

/** XML 엔티티를 한 번만 푼다. pure */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] !== '#') return NAMED_ENTITIES[body.toLowerCase()] ?? match
    const hex = body[1] === 'x' || body[1] === 'X'
    return decodeCodePoint(parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10), match)
  })
}

/** 이중·삼중 인코딩이 `&lt;/news_data&gt;` 로 남지 않게 더 풀리지 않을 때까지 푼다 (상한 있음). pure */
function decodeFully(text: string): string {
  let current = text
  for (let i = 0; i < ENTITY_DECODE_ROUNDS; i += 1) {
    const next = decodeEntities(current)
    if (next === current) break
    current = next
  }
  return current
}

/** 엔티티 해제 → 태그 제거 → 꺾쇠(닮은 글자 포함)·남은 엔티티·제어·서식 문자 제거 → 한 줄 → 길이 상한. pure */
export function sanitizeNewsText(raw: string, maxLength: number): string {
  // 먼저 자른다 — 동기 처리라 비정상적으로 긴 입력은 시간 제한도 끊지 못한다
  const cleaned = decodeFully(raw.slice(0, maxLength * RAW_LENGTH_FACTOR))
    .replace(/<[^<>]*>/g, ' ')
    .replace(ANGLE_LIKE, ' ')
    .replace(/&[#a-z0-9]+;/gi, ' ')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = Array.from(cleaned)
  return chars.length <= maxLength ? cleaned : `${chars.slice(0, maxLength).join('')}…`
}

/** http(s) 만 · 계정 정보 없음 · 길이 상한. 아니면 null. pure */
export function sanitizeNewsUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > URL_MAX_LENGTH) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}
