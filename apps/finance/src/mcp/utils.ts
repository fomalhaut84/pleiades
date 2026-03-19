import { prisma } from '@/lib/prisma'
import { formatKRW, formatUSD } from '@/lib/format'

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
