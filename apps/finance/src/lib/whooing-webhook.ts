/**
 * 후잉 웹훅 전송 유틸
 *
 * 내역 생성 시 후잉에 자동 전송 (다이렉트 방식).
 * WhooingConfig DB 설정 기반. 비활성이면 즉시 리턴.
 */

import { prisma } from './prisma'

interface WhooingTransactionData {
  amount: number
  description: string
  categoryId: string
  transactedAt: Date
}

/**
 * 후잉 웹훅으로 거래 데이터를 전송한다.
 *
 * - DB WhooingConfig가 없거나 비활성이면 즉시 리턴
 * - 환경변수 WHOOING_WEBHOOK_URL도 fallback으로 지원
 * - 전송 실패 시 에러를 throw (호출부에서 catch 처리)
 */
export async function sendToWhooing(data: WhooingTransactionData): Promise<void> {
  // DB 설정 조회 (싱글톤)
  const config = await prisma.whooingConfig.findUnique({ where: { id: 'whooing-config' } })

  const webhookUrl = config?.webhookUrl ?? process.env.WHOOING_WEBHOOK_URL
  const isActive = config ? config.isActive : !!process.env.WHOOING_WEBHOOK_URL

  if (!webhookUrl || !isActive) return

  // 카테고리 매핑 조회
  const mapping = await prisma.whooingCategoryMap.findUnique({
    where: { categoryId: data.categoryId },
  })

  const entryDate = formatWhooingDate(data.transactedAt)

  const payload = {
    entry_date: entryDate,
    item: data.description,
    money: data.amount,
    left: mapping?.whooingLeft ?? '',
    right: mapping?.whooingRight ?? config?.defaultRight ?? '',
    memo: '',
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  })

  if (!res.ok) {
    throw new Error(`후잉 웹훅 응답 오류: ${res.status} ${res.statusText}`)
  }
}

function formatWhooingDate(date: Date): string {
  // KST (UTC+9) 기준 날짜 — 서버 타임존 무관하게 일관된 결과
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kst.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}
