import { prisma } from '@/lib/prisma'
import { resolveAccountId, toolResult, toolError } from '../utils'

const STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  vested: '베스팅 완료',
  exercisable: '행사 가능',
  exercised: '행사 완료',
  expired: '만료',
}

/**
 * get_rsu_schedule: 계좌별 RSU 베스팅 일정 조회
 */
export async function getRsuSchedule(args: { account_name?: string }) {
  try {
    const accountId = await resolveAccountId(args.account_name ?? '전체')
    const where = accountId ? { accountId } : {}

    const schedules = await prisma.rSUSchedule.findMany({
      where,
      include: { account: { select: { name: true } } },
      orderBy: { vestingDate: 'asc' },
    })

    if (schedules.length === 0) {
      return toolResult('등록된 RSU 일정이 없습니다.')
    }

    const lines: string[] = ['## RSU 베스팅 일정\n']

    for (const s of schedules) {
      const status = STATUS_LABELS[s.status] ?? s.status
      const vestDate = s.vestingDate.toISOString().slice(0, 10)
      const basisDate = s.basisDate?.toISOString().slice(0, 10) ?? '-'

      lines.push(`**${s.account.name}** — ${vestDate}`)
      lines.push(`- 상태: ${status}`)
      lines.push(`- 주수: ${s.shares}주`)
      lines.push(`- 기준가: ${s.basisValue.toLocaleString()}원 (기준일: ${basisDate})`)
      if (s.basisPrice != null) lines.push(`- 기준 주가: ${s.basisPrice.toLocaleString()}원`)
      if (s.vestPrice != null) lines.push(`- 베스팅 시 주가: ${s.vestPrice.toLocaleString()}원`)
      if (s.sellShares != null) lines.push(`- 매도 예정: ${s.sellShares}주`)
      if (s.keepShares != null) lines.push(`- 보유 예정: ${s.keepShares}주`)
      if (s.note) lines.push(`- 메모 (사용자 입력): ${s.note.slice(0, 200)}`)
      lines.push('')
    }

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}

/**
 * get_stock_options: 스톡옵션 현황 + 베스팅 일정 조회
 */
export async function getStockOptions(args: { account_name?: string }) {
  try {
    const accountId = await resolveAccountId(args.account_name ?? '전체')
    const where = accountId ? { accountId } : {}

    const options = await prisma.stockOption.findMany({
      where,
      include: {
        account: { select: { name: true } },
        vestings: { orderBy: { vestingDate: 'asc' } },
      },
      orderBy: { grantDate: 'asc' },
    })

    if (options.length === 0) {
      return toolResult('등록된 스톡옵션이 없습니다.')
    }

    const lines: string[] = ['## 스톡옵션 현황\n']

    for (const opt of options) {
      const grantDate = opt.grantDate.toISOString().slice(0, 10)
      const expiryDate = opt.expiryDate.toISOString().slice(0, 10)

      lines.push(`**${opt.account.name}** — ${opt.displayName} (${opt.ticker})`)
      lines.push(`- 부여일: ${grantDate} / 만료일: ${expiryDate}`)
      lines.push(`- 행사가: ${opt.strikePrice.toLocaleString()}원`)
      lines.push(`- 총 부여: ${opt.totalShares}주 / 행사: ${opt.exercisedShares}주 / 취소: ${opt.cancelledShares}주 / 잔여: ${opt.remainingShares}주`)
      if (opt.adjustedShares !== 0) lines.push(`- 조정: ${opt.adjustedShares > 0 ? '+' : ''}${opt.adjustedShares}주`)
      if (opt.note) lines.push(`- 메모 (사용자 입력): ${opt.note.slice(0, 200)}`)

      if (opt.vestings.length > 0) {
        lines.push('- 베스팅 일정:')
        for (const v of opt.vestings) {
          const vDate = v.vestingDate.toISOString().slice(0, 10)
          const vStatus = STATUS_LABELS[v.status] ?? v.status
          lines.push(`  - ${vDate}: ${v.shares}주 (${vStatus})`)
        }
      }
      lines.push('')
    }

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}
