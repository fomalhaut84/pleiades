import { prisma } from '@/lib/prisma'
import { formatKRW, formatUSD, formatQuoteValue as formatQuoteValueShared } from '@/lib/format'
import { formatKstDateTimeFull } from '@/lib/kst-date'
import { normalizeMarket } from '@/lib/market-hours'

/**
 * 계좌명 → Account ID 변환
 * '전체'인 경우 null 반환 (전 계좌 대상)
 */
export async function resolveAccountId(
  name: string
): Promise<string | null> {
  if (name === '전체') return null

  const accounts = await prisma.account.findMany({
    where: { name },
    select: { id: true },
  })

  if (accounts.length === 0) {
    throw new ToolInputError(`계좌를 찾을 수 없습니다: ${name}`)
  }
  if (accounts.length > 1) {
    throw new ToolInputError(`동일 이름 계좌가 ${accounts.length}개 존재합니다: ${name}`)
  }

  return accounts[0].id
}

/**
 * 전체 계좌 ID 목록 반환
 */
export async function getAllAccountIds(): Promise<
  { id: string; name: string }[]
> {
  return prisma.account.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

/**
 * MCP 도구 응답용 텍스트 생성 헬퍼
 */
export function toolResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
  }
}

/**
 * 사용자에게 보여줄 수 있는 비즈니스 에러
 */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolInputError'
  }
}

/**
 * 에러를 MCP 도구 에러 응답으로 변환
 * - ToolInputError / string: 사용자에게 메시지 노출
 * - 기타 예외: 일반 메시지만 노출, 상세는 stderr 로깅
 */
export function toolError(error: unknown) {
  if (typeof error === 'string') {
    return {
      content: [{ type: 'text' as const, text: `오류: ${error}` }],
      isError: true,
    }
  }

  if (error instanceof ToolInputError) {
    return {
      content: [{ type: 'text' as const, text: `오류: ${error.message}` }],
      isError: true,
    }
  }

  // 내부 에러는 상세를 숨기고 stderr에만 기록
  console.error('[MCP tool error]', error)
  return {
    content: [{ type: 'text' as const, text: '요청 처리 중 오류가 발생했습니다.' }],
    isError: true,
  }
}

/**
 * 금액을 읽기 좋은 형태로 포맷 (lib/format.ts 위임)
 */
export function formatMoney(amount: number, currency: string): string {
  return currency === 'USD' ? formatUSD(amount) : formatKRW(amount)
}

/**
 * 시세 값 포맷 (#499). 지수 티커는 통화가 아니라 포인트로 표기한다.
 * 예) `^KS11` → "6,717.28", `AAPL` → "$252.82"
 *
 * 지수 판별 규칙 자체는 `@/lib/format` 의 공용 헬퍼에 있다 (#500 — 봇과 공유).
 */
export function formatQuoteValue(ticker: string, value: number, currency: string): string {
  return formatQuoteValueShared(ticker, value, (v) => formatMoney(v, currency))
}

/**
 * 야후 `marketState` → 한국어 라벨. 미지의 값은 원문 그대로 노출 (#499).
 *
 * 실측: 정규장 전 AAPL 이 `PREPRE`, 마감 후 `^KS11` 이 `POST` 를 반환한다.
 * 한국장은 정규장 마감 후 거래가 없으므로 POST 계열은 '장 마감 후' 가 기본값.
 */
const MARKET_STATE_LABELS: Record<string, string> = {
  REGULAR: '장중',
  CLOSED: '마감',
  PRE: '프리마켓',
  PREPRE: '장 시작 전',
  POST: '장 마감 후',
  POSTPOST: '장 마감 후',
}

/**
 * 미국장 전용 라벨 오버라이드 (#500).
 *
 * 미국장은 정규장 마감 후에도 애프터마켓 거래가 이어져 시세가 계속 움직인다.
 * '장 마감 후' 로 뭉뚱그리면 "더 이상 안 움직이는 값" 으로 읽혀 AI/사용자가
 * 마감가와 시간외가를 구분하지 못한다. PRE 계열은 한국장의 시가 단일가 개념과
 * 겹쳐 '프리마켓'/'장 시작 전' 이 양쪽에 무해하므로 분기하지 않는다.
 */
const US_MARKET_STATE_LABELS: Record<string, string> = {
  POST: '시간외',
  POSTPOST: '시간외',
}

/**
 * 장 상태 라벨 확정. `market` 은 이미 정규화된 `QuoteResult.market`
 * ('KR'|'US'|'FX'|'OTHER') 이므로 `normalizeMarket` 은 방어적 no-op 이다 —
 * 호출부가 raw exchange 코드 (`NMS` 등) 를 넘기게 바뀌어도 라벨이 조용히
 * 틀리지 않도록 한 겹 둔다. 미지정이면 한국장 기준 기본 라벨.
 */
function marketStateLabel(state: string, market?: string | null): string {
  const key = state.toUpperCase()
  const usOverride =
    market && normalizeMarket(market) === 'US' ? US_MARKET_STATE_LABELS[key] : undefined
  return usOverride ?? MARKET_STATE_LABELS[key] ?? state
}

/**
 * 시세 기준 시각 표기 (#499): "09-17 15:30 KST (마감)".
 *
 * `marketTime` 이 없으면 null — 호출 시각을 시세 시각인 양 표기하지 않는다.
 * 연도를 항상 포함한다 — 거래정지/상폐 종목처럼 야후가 유효하지만 오래된
 * `regularMarketTime` 을 주는 경우 MM-DD 만 찍으면 올해 값처럼 읽힌다 (Codex #501 P2).
 * `marketState` 가 없으면 괄호 없이 시각만 표기.
 * `market` 은 장 상태 라벨의 시장별 분기용 (#500) — 없으면 기본 라벨.
 */
export function formatMarketStamp(
  marketTime: Date | null | undefined,
  marketState?: string | null,
  market?: string | null,
): string | null {
  if (!marketTime) return null
  const at = formatKstDateTimeFull(marketTime)
  const state = marketState?.trim()
  if (!state) return at
  return `${at} (${marketStateLabel(state, market)})`
}

/**
 * YYYY-MM-DD 문자열을 UTC 자정 Date로 엄격 파싱.
 * 형식 불일치 또는 실존하지 않는 날짜(2026-02-30 등)는 null 반환.
 */
export function parseDateStrict(str: string): Date | null {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, y, m, d] = match.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date
}
