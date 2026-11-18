/**
 * fin 카드 도우미 — 013 P3-b1 (#777).
 * 표는 설명 칸 행 목록(F8 — inline 칸은 모바일에서 세로로 무너진다) · 색은 앱 고정 청록 + 손익만 덮기(F6 · 국내 관례).
 * 행 이름 · 값은 notify `cardRowList` 가 escape 한다(외부 값 — 종목명 · 계좌명 · 거래 설명).
 */
import { cardRowList } from '@pleiades/notify'
import type { ReplyCard } from '../core/reply'

/** fin 고정 색 — 청록(사용자 2026-11-18 · 손익 빨강 · 파랑과 겹치지 않게). */
export const FIN_CARD_COLOR = 0x0ca678
/** 오르면 빨강. */
export const GAIN_COLOR = 0xe03131
/** 내리면 파랑. */
export const LOSS_COLOR = 0x1971c2

/**
 * 손익 색 — 양수 빨강 · 음수 파랑 · 0 · 숫자 아님은 앱 색. 화면 표기(`formatPercent` 소수 첫째 자리)와 같은 정밀도로 반올림해 본다 —
 * `+0.0%` 인데 빨강이 되지 않게(P3-b1 9-1 info).
 */
export function profitColor(value: number): number {
  const shown = Math.round(value * 10) / 10
  if (!Number.isFinite(shown) || shown === 0) return FIN_CARD_COLOR
  return shown > 0 ? GAIN_COLOR : LOSS_COLOR
}

export interface RowListCardOptions {
  color?: number
  footer?: string
  /** 행이 없을 때 설명(plain) — 없으면 제목만. */
  empty?: string
}

/** 제목 + 행 목록 카드. 행이 없으면 `empty` 안내로(빈 행 목록을 보내지 않는다). */
export function rowListCard(
  title: string,
  rows: readonly { label: string; text: string }[],
  opts: RowListCardOptions = {},
): ReplyCard {
  const body = rows.length > 0 ? cardRowList(rows) : opts.empty ? { description: opts.empty } : {}
  return {
    title,
    ...body,
    color: opts.color ?? FIN_CARD_COLOR,
    ...(opts.footer ? { footer: opts.footer } : {}),
  }
}
