/**
 * fin 알림 카드 — 013 P3-b2 (#779). 순수 함수(DB · 전송 없음)라 시험이 모양을 고정한다.
 * 위 한 줄 = 제목 + 핵심 숫자(F7 · 푸시 미리보기) · 표는 설명 칸 행 목록(F8) · 색 = 청록 + 손익만 덮기(F6).
 * 행 이름 · 값(계좌명 · 종목명)은 `rowListCard`(notify `cardRowList`)가 escape 한다 — 위 한 줄은 plain(escape).
 */
import type { ButtonRows, Content } from '@pleiades/notify'
import { accountEmoji, formatKRWCompact, formatKRWFull, formatPercent, formatSignedKRWCompact, profitEmoji } from '@/bot/utils/formatter'
import { FIN_CARD_COLOR, profitColor, rowListCard } from '@/bot/utils/card'
import type { ReplyCard } from '@/bot/core/reply'

export interface DailyAccountRow {
  name: string
  value: number
  returnPct: number
  /** 전일 스냅샷 대비 · 없으면 생략 */
  change?: number
}

export interface DailySummaryInput {
  dateStr: string
  total: number
  returnPct: number
  /** 전일 데이터가 있는 계좌만 비교한 총 변동 · 없으면 생략 */
  change?: { amount: number; pct: number }
  accounts: readonly DailyAccountRow[]
  fxRate: number
}

/** 일일 포트폴리오 요약 — 카드 색 = 전일 대비 손익(없으면 앱 색). */
export function dailySummaryContent(d: DailySummaryInput): Content {
  const head = `📊 일일 포트폴리오 요약 (${d.dateStr}) · 총 ${formatKRWCompact(d.total)} (${formatPercent(d.returnPct)})`
  const change = d.change ? ` · 전일 ${formatSignedKRWCompact(d.change.amount)} (${formatPercent(d.change.pct)})` : ''
  const card = rowListCard(
    '계좌별',
    d.accounts.map((a) => ({
      label: `${accountEmoji(a.name)} ${a.name}`,
      text:
        `${formatKRWCompact(a.value)} · ${formatPercent(a.returnPct)}` +
        (a.change === undefined ? '' : ` · 전일 ${formatSignedKRWCompact(a.change)} ${profitEmoji(a.change)}`),
    })),
    {
      color: d.change ? profitColor(d.change.pct) : FIN_CARD_COLOR,
      empty: '계좌가 없습니다.',
      footer: `환율 ${d.fxRate.toLocaleString('ko-KR')}원/달러`,
    },
  )
  return { text: head + change, format: 'plain', cards: [card] }
}

const dLabel = (daysLeft: number): string => (daysLeft === 1 ? '⚠️ D-1' : '📅 D-7')

export interface RsuReminder {
  daysLeft: number
  accountName: string
  shares: number
  /** 표시용(`formatDate`) */
  vestingDate: string
  basisValue: number
}

/** RSU D-7 · D-1 정보성 카드 — D-1 은 다음 [확정] 알림 안내를 꼬리말로. */
export function rsuReminderCard(r: RsuReminder): ReplyCard {
  return rowListCard(
    `${dLabel(r.daysLeft)} RSU 베스팅`,
    [
      { label: '계좌', text: r.accountName },
      { label: '주수', text: `${r.shares}주` },
      { label: '베스팅일', text: r.vestingDate },
      { label: '기준가', text: formatKRWFull(r.basisValue) },
    ],
    r.daysLeft === 1 ? { footer: '내일 15:35 KST 이후 [확정] 알림 발송됨' } : {},
  )
}

export interface OptionReminder {
  daysLeft: number
  name: string
  shares: number
  strikePrice: number
  vestingDate: string
}

export function optionReminderCard(o: OptionReminder): ReplyCard {
  return rowListCard(`${dLabel(o.daysLeft)} 스톡옵션 행사 가능`, [
    { label: '종목', text: o.name },
    { label: '주수', text: `${o.shares}주` },
    { label: '행사가', text: formatKRWFull(o.strikePrice) },
    { label: '행사 가능일', text: o.vestingDate },
  ])
}

export type DdayPrice = { kind: 'ok'; value: number; source: string } | { kind: 'missing' } | { kind: 'error' }

export interface RsuDday extends Omit<RsuReminder, 'daysLeft'> {
  price: DdayPrice
  sellShares: number
  autoSell: boolean
}

const priceText = (p: DdayPrice): string =>
  p.kind === 'ok' ? `${formatKRWFull(Math.round(p.value))} (${p.source})` : p.kind === 'missing' ? '자동 조회 실패 — 웹에서 직접 처리' : '조회 실패'

/** D-day RSU 확정 알림 — 버튼은 그대로(마지막 조각 · 카드와 같은 메시지). */
export function rsuDdayContent(r: RsuDday, buttons: ButtonRows): Content {
  const card = rowListCard(
    '처리 정보',
    [
      { label: '계좌', text: r.accountName },
      { label: '주수', text: `${r.shares}주` },
      { label: '베스팅일', text: r.vestingDate },
      { label: '기준가', text: formatKRWFull(r.basisValue) },
      { label: '종가', text: priceText(r.price) },
      { label: '매도 예정', text: r.autoSell ? `${r.sellShares}주 (autoSell=✓)` : '없음 (autoSell=✗)' },
    ],
    { footer: '아래 [확정] 한 번 탭으로 BUY/SELL Trade + Holding 자동 반영됩니다.' },
  )
  return {
    text: `🎯 D-day RSU 베스팅 — 오늘 처리 가능 · ${r.accountName} ${r.shares}주`,
    format: 'plain',
    components: buttons,
    cards: [card],
  }
}
