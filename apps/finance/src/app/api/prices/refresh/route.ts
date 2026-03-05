import { NextResponse } from 'next/server'
import { refreshPrices } from '@/lib/price-fetcher'

/** 최소 갱신 간격 (ms) — 연속 호출 방지 */
const MIN_REFRESH_INTERVAL_MS = 30_000

let lastRefreshAt = 0

export async function POST() {
  try {
    const now = Date.now()
    if (now - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) {
      return NextResponse.json(
        { error: '갱신 간격이 너무 짧습니다. 30초 후 다시 시도해주세요.' },
        { status: 429 }
      )
    }

    lastRefreshAt = now
    const result = await refreshPrices()
    return NextResponse.json(result)
  } catch (error) {
    console.error('POST /api/prices/refresh error:', error)
    return NextResponse.json(
      { error: '주가 갱신에 실패했습니다.' },
      { status: 500 }
    )
  }
}
