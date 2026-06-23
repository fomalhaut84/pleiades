import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runBacktest } from '@/lib/backtest/engine'
import { PRESET_STRATEGIES } from '@/lib/backtest/presets'
import { ok, fail } from '@/lib/api-response'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return fail('잘못된 요청 형식입니다.', 400)
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return fail('잘못된 요청 형식입니다.', 400)
    }

    const { ticker, strategyKey, days } = body as Record<string, unknown>

    if (!ticker || typeof ticker !== 'string') {
      return fail('종목 티커를 입력해주세요.', 400)
    }

    const key = typeof strategyKey === 'string' ? strategyKey : 'rsi'
    const strategy = PRESET_STRATEGIES[key]
    if (!strategy) {
      return fail(`사용 가능한 전략: ${Object.keys(PRESET_STRATEGIES).join(', ')}`, 400)
    }

    const periodDays = typeof days === 'number' && Number.isInteger(days) && days >= 30 && days <= 3650
      ? days : 365

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - periodDays)

    // 종목 통화 확인
    const upperTicker = ticker.toUpperCase()
    const priceData = await prisma.priceCache.findUnique({ where: { ticker: upperTicker } })
    const currency = priceData?.currency ?? 'USD'
    // USD 종목: $10,000, KRW 종목: ₩10,000,000
    const initialCapital = currency === 'USD' ? 10_000 : 10_000_000

    const result = await runBacktest({
      ticker: upperTicker,
      strategy,
      startDate,
      endDate,
      initialCapital,
      positionSize: 0.9,
      commission: 0.0025,
    })

    return ok({ ...result, currency })
  } catch (error) {
    console.error('POST /api/backtest error:', error)
    return fail('백테스트 실행에 실패했습니다.', 500)
  }
}
