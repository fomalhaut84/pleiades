/**
 * Phase 37-B self-review (#445, P1) — CSV export truncation 회귀 방지.
 *
 * MAX_EXPORT_ROWS 초과 시 조용히 자르면 사용자가 부분 결과를 전체로 오해할 수 있으므로:
 *   1) 응답 헤더 `X-Truncated: true` + `X-Total-Count: {actualTotal}` 노출
 *   2) CSV body 마지막 라인에 `# TRUNCATED: showing first N of M ...` 안내 추가
 * 이 두 신호가 모두 살아있는지 검증한다.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../route'
import { MAX_EXPORT_ROWS } from '../csv-format'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    alertHistory: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

function makeRow(i: number) {
  return {
    id: `row-${i}`,
    firedAt: new Date('2026-07-08T00:00:00Z'),
    kind: 'drop',
    ticker: 'AAPL',
    price: 100,
    changePercent: -3,
    message: 'msg',
    deliveryStatus: 'sent',
    recipientCount: 1,
    errorMessage: null,
    contextJson: { type: 'drop', price: 100, changePercent: -3, marketOpen: true },
  }
}

function makeReq(qs = ''): NextRequest {
  return new NextRequest(`http://localhost/api/alerts/history/export${qs}`)
}

describe('GET /api/alerts/history/export — truncation 신호', () => {
  beforeEach(async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.findMany).mockReset()
    vi.mocked(prisma.alertHistory.count).mockReset()
  })

  it('total <= MAX_EXPORT_ROWS: truncated 헤더 없음, X-Total-Count 만 노출', async () => {
    const { prisma } = await import('@/lib/prisma')
    const rows = Array.from({ length: 5 }, (_, i) => makeRow(i))
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValueOnce(rows as never)
    vi.mocked(prisma.alertHistory.count).mockResolvedValueOnce(5 as never)

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Truncated')).toBeNull()
    expect(res.headers.get('X-Total-Count')).toBe('5')

    const body = await res.text()
    expect(body).not.toContain('# TRUNCATED')
    // CSV 마지막이 truncation 라인이 아니어야 함 (data row 로 끝남)
    expect(body.trim().endsWith(',type=drop; price=100; Δ%=-3; marketOpen=true')).toBe(true)
  })

  it('total > MAX_EXPORT_ROWS: X-Truncated + X-Total-Count + CSV 마지막 안내 라인', async () => {
    const { prisma } = await import('@/lib/prisma')
    const rows = Array.from({ length: MAX_EXPORT_ROWS }, (_, i) => makeRow(i))
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValueOnce(rows as never)
    // 실제 total 은 상한 초과.
    vi.mocked(prisma.alertHistory.count).mockResolvedValueOnce((MAX_EXPORT_ROWS + 1) as never)

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Truncated')).toBe('true')
    expect(res.headers.get('X-Total-Count')).toBe(String(MAX_EXPORT_ROWS + 1))

    const body = await res.text()
    // 마지막 라인이 truncation 안내여야 함
    const lastLine = body.split('\n').at(-1) ?? ''
    expect(lastLine).toMatch(/^# TRUNCATED: showing first 10000 of 10001/)
    expect(body).toContain('Narrow the filter')
  })

  it('findMany 에 take: MAX_EXPORT_ROWS 가 전달됨', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.alertHistory.count).mockResolvedValueOnce(0 as never)

    await GET(makeReq())
    const call = vi.mocked(prisma.alertHistory.findMany).mock.calls[0][0]
    expect(call?.take).toBe(MAX_EXPORT_ROWS)
    // 리스트 API 와 동일한 tiebreak 정렬 유지
    expect(call?.orderBy).toEqual([{ firedAt: 'desc' }, { id: 'desc' }])
  })

  it('필터 (kind + ticker) 는 count 와 findMany 양쪽에 동일 where 로 전달', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.alertHistory.findMany).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.alertHistory.count).mockResolvedValueOnce(0 as never)

    await GET(makeReq('?kind=drop&ticker=aapl&from=2026-07-01T00:00:00Z&to=2026-07-08T00:00:00Z'))

    const findCall = vi.mocked(prisma.alertHistory.findMany).mock.calls[0][0]
    const countCall = vi.mocked(prisma.alertHistory.count).mock.calls[0][0]
    expect(findCall?.where).toEqual(countCall?.where)
    expect(findCall?.where?.kind).toBe('drop')
    // ticker 대문자 정규화
    expect(findCall?.where?.ticker).toBe('AAPL')
  })
})
