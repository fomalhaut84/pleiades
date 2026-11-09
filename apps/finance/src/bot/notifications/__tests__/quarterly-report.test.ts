/**
 * pleiades#514 — 분기 리포트 PDF 첨부 결과 분기(`sent` · `no-webhook` · throw).
 *
 * throw 면 같은 채널(ALLOWED)에 텍스트 대체 알림이 1건 더 나가고, `no-webhook` 이면 완료 로그가 없다.
 * 생성 단계(PDF · 파일 읽기)는 모킹한다 — 여기서 보는 것은 첨부 뒤 분기뿐이다.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

vi.mock('@/lib/report/pdf-generator', () => ({
  generateReportPDF: vi.fn(async () => ({ pdfPath: '/x/reports/report-2026-Q3.pdf' })),
}))
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, promises: { ...actual.promises, readFile: vi.fn(async () => Buffer.from('%PDF')) } }
})
vi.mock('../notifier', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../notifier')>()),
  notifierFor: vi.fn(),
  fileRecipientCount: vi.fn(() => 1),
  sendFile: vi.fn(),
}))

import { notifierFor, Route, sendFile } from '../notifier'
import { sendQuarterlyReport } from '../quarterly-report'

let notify: ReturnType<typeof vi.fn>
let log: MockInstance<Console['log']>

beforeEach(() => {
  notify = vi.fn(async () => ({ sent: 1, total: 1, deliveries: [] }))
  vi.mocked(notifierFor).mockReset().mockReturnValue({ notify } as never)
  vi.mocked(sendFile).mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

// console spy 가 테스트 사이에 누적되지 않게 — 순서에 기대지 않는다(9-1 info)
afterEach(() => {
  vi.restoreAllMocks()
})

const texts = () => notify.mock.calls.map((c) => String((c[1] as { text: string }).text))
const doneLogged = () => log.mock.calls.some((c) => String(c[0]).includes('발송 완료'))

describe('sendQuarterlyReport PDF 첨부 결과', () => {
  it('첨부가 throw 하면 같은 채널에 텍스트 대체 알림 1건 · 완료 로그 없음', async () => {
    vi.mocked(sendFile).mockRejectedValueOnce(new Error('413 Payload Too Large'))
    await sendQuarterlyReport()
    expect(notify).toHaveBeenCalledTimes(2) // 시작 알림 + 대체 알림
    expect(notify.mock.calls[1][0]).toBe(Route.ALLOWED)
    expect(texts()[1]).toContain('PDF 첨부에 실패했습니다')
    expect(texts().some((t) => t.includes('생성에 실패했습니다'))).toBe(false) // 바깥 생성 실패 분기로 새지 않는다
    expect(doneLogged()).toBe(false)
  })

  it('no-webhook 이면 대체 알림도 완료 로그도 없다', async () => {
    vi.mocked(sendFile).mockResolvedValueOnce('no-webhook' as never)
    await sendQuarterlyReport()
    expect(notify).toHaveBeenCalledTimes(1) // 시작 알림만
    expect(doneLogged()).toBe(false)
  })

  it('sent 면 대체 알림 없이 완료 로그', async () => {
    vi.mocked(sendFile).mockResolvedValueOnce('sent' as never)
    await sendQuarterlyReport()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendFile).mock.calls[0][0]).toBe(Route.ALLOWED)
    expect(vi.mocked(sendFile).mock.calls[0][1]).toMatchObject({ name: 'report-2026-Q3.pdf', contentType: 'application/pdf' })
    expect(doneLogged()).toBe(true)
  })
})
