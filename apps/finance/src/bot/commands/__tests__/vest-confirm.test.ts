/**
 * pleiades M-6b-4 (pleiades#155) — vest 버튼 판단(decideVest)을 채널 중립으로 분리한 회귀 테스트.
 * Discord 버튼 핸들러는 `notifications/__tests__/discord-interactions.test.ts`(텔레그램 핸들러는 009 D-5 B3b · pleiades#508 에서 지웠다).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/rsu-vest-service', async () => {
  class RsuVestError extends Error {
    constructor(public code: string) {
      super(code)
    }
  }
  return {
    RsuVestError,
    getRsuVestPreview: vi.fn(),
    processRsuVest: vi.fn(),
    rsuVestErrorMessage: (err: { code: string }) => `msg:${err.code}`,
  }
})

import { getRsuVestPreview, processRsuVest, RsuVestError } from '@/lib/rsu-vest-service'
import { decideVest } from '../vest-confirm'

const preview = {
  id: 'r1',
  accountId: 'a1',
  accountName: '증권',
  ticker: '005930.KS',
  displayName: '삼성전자',
  vestingDate: new Date('2026-10-16'),
  shares: 10,
  sellShares: 3,
  keepShares: 7,
  note: null,
  vestPrice: 70000,
  vestPriceSource: 'historical' as const,
  autoSellDefault: true,
}

const result = {
  schedule: { id: 'r1', status: 'vested', vestPrice: 70000, vestedAt: new Date() },
  holding: { shares: 17, avgPrice: 65000.4 },
  buyShares: 10,
  sellShares: 3,
  vestPrice: 70000,
}

const mkErr = (code: string) => new (RsuVestError as unknown as new (c: string) => Error)(code)

beforeEach(() => {
  vi.mocked(getRsuVestPreview).mockReset()
  vi.mocked(processRsuVest).mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('decideVest', () => {
  it('형식이 아니면 알 수 없는 요청', async () => {
    expect(await decideVest('auto_adjust:accept:x')).toEqual({ kind: 'alert', text: '알 수 없는 요청입니다.' })
  })

  it('취소 — 원본을 취소 문구로 · DB 무접촉', async () => {
    expect(await decideVest('vest:cancel:r1')).toEqual({
      kind: 'edit',
      text: '🚫 RSU 베스팅 처리가 취소되었습니다.',
      toast: '취소됨',
    })
    expect(getRsuVestPreview).not.toHaveBeenCalled()
  })

  it('preview 의 RsuVestError — 매핑 문구 alert (만료·이미 처리)', async () => {
    vi.mocked(getRsuVestPreview).mockRejectedValue(mkErr('NOT_FOUND'))
    expect(await decideVest('vest:confirm:none')).toEqual({ kind: 'alert', text: 'msg:NOT_FOUND' })
    expect(processRsuVest).not.toHaveBeenCalled()
  })

  it('preview 의 그 밖의 오류 — 일반 문구(원문 미노출)', async () => {
    vi.mocked(getRsuVestPreview).mockRejectedValue(new Error('db down secret'))
    expect(await decideVest('vest:confirm:r1')).toEqual({ kind: 'alert', text: '미리보기 실패. 웹에서 확인해주세요.' })
  })

  it('종가 자동 조회 실패 — 트랜잭션하지 않는다', async () => {
    vi.mocked(getRsuVestPreview).mockResolvedValue({ ...preview, vestPrice: null })
    expect(await decideVest('vest:confirm:r1')).toEqual({
      kind: 'alert',
      text: '종가 자동 조회 실패. 웹 페이지에서 직접 처리해주세요.',
    })
    expect(processRsuVest).not.toHaveBeenCalled()
  })

  it('트랜잭션의 RsuVestError · 비즈니스 예외 · 그 밖의 오류', async () => {
    vi.mocked(getRsuVestPreview).mockResolvedValue(preview)
    vi.mocked(processRsuVest).mockRejectedValueOnce(mkErr('ALREADY_VESTED'))
    expect(await decideVest('vest:confirm:r1')).toEqual({ kind: 'alert', text: 'msg:ALREADY_VESTED' })
    vi.mocked(processRsuVest).mockRejectedValueOnce(new Error('보유 수량 부족: 3주'))
    expect(await decideVest('vest:confirm:r1')).toEqual({ kind: 'alert', text: '보유 수량 부족: 3주' })
    vi.mocked(processRsuVest).mockRejectedValueOnce(new Error('raw'))
    expect(await decideVest('vest:confirm:r1')).toEqual({
      kind: 'alert',
      text: '처리 실패. 잠시 후 다시 시도하거나 웹에서 처리해주세요.',
    })
  })

  it('확정 성공 — 최신 종가·autoSell 로 트랜잭션 · 완료 본문', async () => {
    vi.mocked(getRsuVestPreview).mockResolvedValue(preview)
    vi.mocked(processRsuVest).mockResolvedValue(result)
    const d = await decideVest('vest:confirm:r1')
    expect(processRsuVest).toHaveBeenCalledWith('r1', 70000, true)
    expect(d).toMatchObject({ kind: 'edit', toast: '완료' })
    const text = (d as { text: string }).text
    expect(text.split('\n')[0]).toBe('✅ RSU 베스팅 처리 완료')
    expect(text).toContain('종목: 삼성전자 (005930.KS)')
    expect(text).toContain('매수: 10주')
    expect(text).toContain('매도: 3주')
    expect(text).toContain('보유: 17주')
  })
})
