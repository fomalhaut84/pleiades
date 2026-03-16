import { NextRequest, NextResponse } from 'next/server'
import { searchKrxByName } from '@/lib/krx-stocks'
import { searchYahooByName } from '@/lib/price-fetcher'

export const dynamic = 'force-dynamic'

/**
 * GET /api/prices/search?q=삼성전자
 * 종목명으로 ticker 검색 (한글 → KRX DB, 영문 → Yahoo Search)
 */
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')?.trim()

    if (!q || q.length < 2) {
      return NextResponse.json(
        { error: '검색어는 2자 이상 입력해주세요.' },
        { status: 400 }
      )
    }

    const hasKorean = /[가-힣]/.test(q)

    if (hasKorean) {
      const results = await searchKrxByName(q)
      return NextResponse.json({
        source: 'krx',
        results: results.map((r) => ({
          ticker: r.ticker,
          name: r.name,
          market: r.market,
        })),
      })
    }

    const results = await searchYahooByName(q)
    return NextResponse.json({
      source: 'yahoo',
      results: results.map((r) => ({
        ticker: r.symbol,
        name: r.shortname,
        market: r.exchange,
        quoteType: r.quoteType,
      })),
    })
  } catch (error) {
    console.error('[api] 종목 검색 실패:', error)
    return NextResponse.json({ error: '종목 검색에 실패했습니다.' }, { status: 500 })
  }
}
