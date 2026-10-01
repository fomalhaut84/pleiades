import { prisma } from '@/lib/prisma'
import { toVestingEvents, toKSTDateString } from '@/lib/vesting-events'
import { buildICS, type ICSEvent } from '@/lib/ics'
import { fail } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

const ICS_UID_DOMAIN = 'myfinance.starryjeju.net'

/**
 * GET /api/exports/vesting.ics
 *
 * RSU + 스톡옵션 베스팅 + 옵션 만료일을 RFC 5545 iCalendar 파일로 내보낸다.
 * Google Calendar / Apple Calendar / Outlook 모두 import 가능.
 */
export async function GET() {
  try {
    const [rsus, options] = await Promise.all([
      prisma.rSUSchedule.findMany({
        include: { account: { select: { name: true } } },
        orderBy: { vestingDate: 'asc' },
      }),
      prisma.stockOption.findMany({
        include: {
          account: { select: { name: true } },
          vestings: { orderBy: { vestingDate: 'asc' } },
        },
        orderBy: { grantDate: 'asc' },
      }),
    ])

    const vestingEvents = toVestingEvents(rsus, options)

    // 베스팅 이벤트 (이미 종료된 상태 제외)
    const icsEvents: ICSEvent[] = []
    for (const ev of vestingEvents) {
      if (ev.status === 'exercised' || ev.status === 'expired') continue
      const tickerLabel = ev.ticker ?? ''
      const tickerPart = tickerLabel ? `${tickerLabel} ` : ''
      const summary = ev.type === 'RSU'
        ? `[RSU] ${ev.shares}주 베스팅`
        : `[Option] ${tickerPart}${ev.shares}주 베스팅`
      icsEvents.push({
        uid: `${ev.id}@${ICS_UID_DOMAIN}`,
        summary,
        date: ev.date,
        description: `${ev.accountName} 계좌`,
      })
    }

    // 옵션 만료 이벤트 (이미 행사 완료된 옵션 제외)
    for (const opt of options) {
      if (opt.remainingShares <= 0) continue
      icsEvents.push({
        uid: `opt-expire-${opt.id}@${ICS_UID_DOMAIN}`,
        summary: `[Option 만료] ${opt.ticker}`,
        date: toKSTDateString(opt.expiryDate),
        description: `${opt.account.name} 계좌 · 잔여 ${opt.remainingShares}주`,
      })
    }

    const ics = buildICS(icsEvents)

    return new Response(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="vesting.ics"',
      },
    })
  } catch (error) {
    console.error('GET /api/exports/vesting.ics error:', error)
    return fail('캘린더 내보내기에 실패했습니다.', 500)
  }
}
