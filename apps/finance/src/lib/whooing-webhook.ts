/**
 * 후잉 웹훅 전송 유틸
 *
 * 내역 생성 시 후잉에 자동 전송 (다이렉트 방식).
 * Phase 17-E에서 WhooingConfig/WhooingCategoryMap DB 모델이 추가되면
 * DB 기반 설정으로 전환. 현재는 환경변수 기반 스텁.
 */

interface WhooingTransactionData {
  amount: number
  description: string
  categoryId: string
  transactedAt: Date
}

/**
 * 후잉 웹훅으로 거래 데이터를 전송한다.
 *
 * - WHOOING_WEBHOOK_URL 환경변수가 없으면 즉시 리턴 (비활성)
 * - 전송 실패 시 에러를 throw (호출부에서 catch 처리)
 * - Phase 17-E에서 DB 기반 설정 + 카테고리 매핑으로 고도화 예정
 */
export async function sendToWhooing(data: WhooingTransactionData): Promise<void> {
  const webhookUrl = process.env.WHOOING_WEBHOOK_URL
  if (!webhookUrl) return

  const entryDate = formatWhooingDate(data.transactedAt)

  const payload = {
    entry_date: entryDate,
    item: data.description,
    money: data.amount,
    left: '',   // Phase 17-E에서 카테고리 매핑으로 채움
    right: '',  // Phase 17-E에서 기본 결제수단 설정으로 채움
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
