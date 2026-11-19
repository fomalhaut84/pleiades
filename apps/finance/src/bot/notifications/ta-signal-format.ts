/**
 * TA 시그널 알림 서식 — 순수 함수 (#820).
 *
 * 한 종목 블록:
 *   **이름** (티커) — 전략 · 현재가 (등락률)      ← 가격은 PriceCache(알림 직전 갱신분) · 이름 = 티커면 한 번만
 *     시그널 줄…
 *     📏 5일 · 20일 · 52주 고점 대비                ← 숫자는 코드가 TA 리포트에서(모델이 옮기지 않는다)
 *     📊 RSI · 거래량 배수 · BB 위치
 *     💡 AI 결론 한 줄                              ← 모델 출력은 첫 2줄만 · 제목·구분선·라벨 줄은 버린다
 *        AI 근거 한 줄
 *     🔎 자세히: `!ai …`                             ← 시스템이 만든 추천 질문(AI 비용 0)
 *
 * 틀(제목 · 종목 이름 굵게 · 인라인 코드)만 서식이고, 그 밖의 글은 escape 한다(013 F5 · #785).
 */

import { escapeDiscordMarkdown } from '@pleiades/notify'
import type { BBPosition, TAReport } from '@/lib/ta/types'

export const STRATEGY_LABELS: Record<string, string> = {
  swing: '스윙', momentum: '모멘텀', scalp: '단타', long_hold: '장기',
}

/** AI 가이드 — 남길 줄 수와 줄당 상한(글자) */
export const AI_GUIDE_MAX_LINES = 2
export const AI_GUIDE_LINE_MAX_CHARS = 120

/** Discord `!ai` 명령 — 라우터 접두와 같다(fin `discord/router.ts` DISCORD_AI_COMMAND) */
export const AI_COMMAND = '!ai'

const BB_LABELS: Record<BBPosition, string> = {
  ABOVE_UPPER: '상단 이탈', NEAR_UPPER: '상단 근접', MIDDLE: '중간', NEAR_LOWER: '하단 근접', BELOW_LOWER: '하단 이탈',
}

/** 시그널 id → 방향 · 질문에 쓸 짧은 이름 (ta-signal-alert `checkSignals` 의 id 와 같다) */
const SIGNAL_INFO: Record<string, { side: 'buy' | 'sell'; label: string }> = {
  RSI_OVERSOLD: { side: 'buy', label: 'RSI 과매도' },
  RSI_OVERBOUGHT: { side: 'sell', label: 'RSI 과매수' },
  MACD_GOLDEN: { side: 'buy', label: 'MACD 골든크로스' },
  MACD_DEAD: { side: 'sell', label: 'MACD 데드크로스' },
  VOL_SURGE: { side: 'buy', label: '거래량 급증' },
  SMA_GOLDEN: { side: 'buy', label: 'SMA 골든크로스' },
  SMA_DEAD: { side: 'sell', label: 'SMA 데드크로스' },
  BB_BELOW: { side: 'buy', label: 'BB 하단 이탈' },
  BB_ABOVE: { side: 'sell', label: 'BB 상단 이탈' },
  RSI_EXTREME_LOW: { side: 'buy', label: 'RSI 극단 과매도' },
  RSI_EXTREME_HIGH: { side: 'sell', label: 'RSI 극단 과매수' },
  STRONG_BUY: { side: 'buy', label: '종합 STRONG_BUY' },
  STRONG_SELL: { side: 'sell', label: '종합 STRONG_SELL' },
}

const ASK_BY_SIDE = {
  buy: '지금 진입해도 될지, 진입가·손절가·분할 매수 계획을 알려줘',
  sell: '지금 매도(비중 축소)할지, 매도가·남은 물량 계획을 알려줘',
  mixed: '매수·매도 시그널이 함께 나왔는데 지금 어떻게 대응할지 알려줘',
} as const

/** 알림에 쓰는 TA 숫자 — 리포트에서 뽑는다 */
export interface TaMetrics {
  change5d: number
  change20d: number
  fromHigh52w: number
  rsi: number
  volumeRatio: number
  bbPosition: BBPosition
}

export interface TaQuote {
  price: number
  changePercent: number | null
  currency: string
}

export interface TaAlertItem {
  ticker: string
  displayName: string
  strategy: string
  signals: string[]
  signalIds?: string[]
  metrics?: TaMetrics
  quote?: TaQuote | null
}

export function metricsOf(report: Pick<TAReport, 'price' | 'indicators'>): TaMetrics {
  return {
    change5d: report.price.change5d,
    change20d: report.price.change20d,
    fromHigh52w: report.price.fromHigh52w,
    rsi: report.indicators.rsi14.value,
    volumeRatio: report.indicators.volume.ratio,
    bbPosition: report.indicators.bollingerBands.position,
  }
}

const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

function signedPct(n: number): string {
  const v = n.toFixed(1)
  return n > 0 && v !== '0.0' ? `+${v}%` : `${v === '-0.0' ? '0.0' : v}%`
}

/** 가격 표기 — KRW 는 정수 `원` · USD 는 `$` 소수 2자리 · 그 밖은 숫자 뒤 통화 코드 */
export function formatPrice(price: number, currency: string): string {
  const c = currency.toUpperCase()
  if (c === 'KRW') return `${Math.round(price).toLocaleString('ko-KR')}원`
  const n = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return c === 'USD' ? `$${n}` : `${n} ${c}`
}

function quoteText(q: TaQuote | null | undefined): string {
  if (!q || !finite(q.price)) return ''
  const pct = finite(q.changePercent) ? ` (${signedPct(q.changePercent)})` : ''
  return ` · ${formatPrice(q.price, q.currency)}${pct}`
}

/** 종목 줄 — 이름 = 티커면 괄호를 생략 */
function headLine(item: TaAlertItem): string {
  const stratLabel = item.strategy.split('/').map((s) => STRATEGY_LABELS[s] ?? s).join('/')
  const same = item.displayName.trim().toUpperCase() === item.ticker.trim().toUpperCase()
  // 티커는 괄호째 escape — `005930.KS` 홀로면 줄 머리 번호 목록으로 보고 `\.` 를 넣는다
  const tail = `${same ? '' : `(${item.ticker}) `}— ${stratLabel}${quoteText(item.quote)}`
  return `**${escapeDiscordMarkdown(item.displayName)}** ${escapeDiscordMarkdown(tail)}`
}

/** 지표 두 줄 — 판단(색)은 넣지 않는다. 숫자만 */
export function metricLines(m: TaMetrics): string[] {
  const moves = [
    finite(m.change5d) ? `5일 ${signedPct(m.change5d)}` : '',
    finite(m.change20d) ? `20일 ${signedPct(m.change20d)}` : '',
    finite(m.fromHigh52w) ? `52주 고점 대비 ${signedPct(m.fromHigh52w)}` : '',
  ].filter(Boolean)
  const ind = [
    finite(m.rsi) ? `RSI ${m.rsi.toFixed(1)}` : '',
    finite(m.volumeRatio) ? `거래량 ${m.volumeRatio.toFixed(1)}배(20일 평균 대비)` : '',
    BB_LABELS[m.bbPosition] ? `BB ${BB_LABELS[m.bbPosition]}` : '',
  ].filter(Boolean)
  return [
    ...(moves.length ? [`📏 ${moves.join(' · ')}`] : []),
    ...(ind.length ? [`📊 ${ind.join(' · ')}`] : []),
  ].map(escapeDiscordMarkdown)
}

const HEADING_RE = /^#{1,6}\s/
const RULE_RE = /^([-*_=])(?:\s*\1){2,}$/
const LIST_MARK_RE = /^(?:[-*+•]\s+|\d+[.)]\s+|>\s*)+/

/**
 * 모델 출력 → 남길 줄(최대 2). 제목 · 구분선 · 빈 줄 · `…:` 로 끝나는 라벨 줄은 버리고 목록 · 인용 기호를 뗀다.
 * 줄마다 120자(코드 포인트 · 넘으면 `…`) — 이모지를 반으로 가르지 않는다.
 */
export function guideLines(guide: string): string[] {
  const out: string[] = []
  for (const raw of guide.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line || HEADING_RE.test(line) || RULE_RE.test(line)) continue
    const body = line.replace(LIST_MARK_RE, '').trim()
    if (!body || /[:：]$/.test(body)) continue
    const chars = Array.from(body)
    out.push(chars.length > AI_GUIDE_LINE_MAX_CHARS ? `${chars.slice(0, AI_GUIDE_LINE_MAX_CHARS).join('').trimEnd()}…` : body)
    if (out.length >= AI_GUIDE_MAX_LINES) break
  }
  return out
}

/**
 * 가이드 한 줄 렌더 — 통째로 escape 한 뒤 **줄 안에서 짝이 맞는 `**굵게**` 만** 되살린다(#785 9-1 major —
 * 자르기나 모델 출력이 남긴 짝 없는 `**` · `||` · 백틱이 다음 종목 틀과 짝을 맺지 않게).
 */
function renderGuideLine(line: string): string {
  return escapeDiscordMarkdown(line).replace(/\\\*\\\*([^*\n]+?)\\\*\\\*/g, '**$1**')
}

/** 인라인 코드 안에 둘 글 — 코드를 깨거나 멘션 · 링크 표기가 될 글자를 뺀다 */
function codeSafe(s: string): string {
  return s.replace(/[`<>[\]\n\r]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** 추천 질문 — 종목 · 시그널 이름 · 방향별 질문. 시그널 id 를 모르면 시그널 글을 쓰지 않고 일반 질문 */
export function suggestedPrompt(item: Pick<TaAlertItem, 'ticker' | 'displayName' | 'signalIds'>): string {
  const infos = (item.signalIds ?? []).map((id) => SIGNAL_INFO[id]).filter((x): x is { side: 'buy' | 'sell'; label: string } => !!x)
  const sides = new Set(infos.map((i) => i.side))
  const ask = sides.size === 2 ? ASK_BY_SIDE.mixed : sides.has('sell') ? ASK_BY_SIDE.sell : sides.has('buy') ? ASK_BY_SIDE.buy : '지금 어떻게 대응할지 알려줘'
  const same = item.displayName.trim().toUpperCase() === item.ticker.trim().toUpperCase()
  const name = same ? item.ticker : `${item.displayName}(${item.ticker})`
  const sig = infos.length ? ` ${infos.map((i) => i.label).join('·')} 시그널이 나왔어.` : ''
  return codeSafe(`${AI_COMMAND} ${name}${sig} ${ask}`)
}

/**
 * TA 시그널 알림 본문 — Discord 마크다운(`markdown` 형식).
 */
export function buildTaSignalMessage(items: ReadonlyArray<TaAlertItem>, aiGuides: ReadonlyMap<string, string>): string {
  const lines = ['📊 **TA 시그널 알림**\n']
  for (const item of items) {
    lines.push(headLine(item))
    for (const sig of item.signals) lines.push(`  ${escapeDiscordMarkdown(sig)}`)
    if (item.metrics) for (const l of metricLines(item.metrics)) lines.push(`  ${l}`)
    const guide = aiGuides.get(item.ticker)
    const gl = guide ? guideLines(guide) : []
    gl.forEach((l, i) => lines.push(`  ${i === 0 ? '💡' : '　 '} ${renderGuideLine(l)}`))
    lines.push(`  🔎 자세히: \`${suggestedPrompt(item)}\``)
    lines.push('')
  }
  return lines.join('\n')
}
