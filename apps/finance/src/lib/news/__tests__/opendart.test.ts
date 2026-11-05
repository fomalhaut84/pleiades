import { deflateRawSync } from 'node:zlib'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { disclosureRows, extractFirstZipEntry, fetchDisclosures, koreanStockCode, mapDisclosure, parseCorpCodes, rankDisclosures, resetOpenDartCache, type DartFetch, type DisclosureResult } from '../opendart'

const KEY = 'SECRETKEY0000000000000000000000000000000'
// 01:00 KST — UTC 로 계산하면 날짜가 하루 어긋난다
const NOW = new Date('2026-11-04T16:00:00Z')

function zip(content: string, method: 8 | 0 = 8): Buffer {
  const raw = Buffer.from(content)
  const data = method === 8 ? deflateRawSync(raw) : raw
  const name = Buffer.from('CORPCODE.xml')
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(method, 8)
  local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(method, 10)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(raw.length, 24)
  central.writeUInt16LE(name.length, 28)
  central.writeUInt32LE(0, 42)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(46 + name.length, 12)
  eocd.writeUInt32LE(30 + name.length + data.length, 16)
  return Buffer.concat([local, name, data, central, name, eocd])
}

const CORP_XML = `<?xml version="1.0"?><result>
<list><corp_code>00126380</corp_code><corp_name>삼성전자</corp_name><stock_code>005930</stock_code><modify_date>20260101</modify_date></list>
<list><corp_code>99999999</corp_code><corp_name>비상장</corp_name><stock_code> </stock_code></list>
</result>`

function row(title: string, day = '20261104', no = '20261104000123') {
  return { report_nm: title, rcept_dt: day, rcept_no: no }
}

function dartFetch(list: unknown, corp: Response | (() => Response) = () => new Response(new Uint8Array(zip(CORP_XML)))): DartFetch & { urls: string[] } {
  const urls: string[] = []
  const impl = (async (url: string) => {
    urls.push(url)
    if (url.includes('corpCode.xml')) return typeof corp === 'function' ? corp() : corp
    return new Response(JSON.stringify(list))
  }) as unknown as DartFetch & { urls: string[] }
  impl.urls = urls
  return impl
}

const ask = (fetchImpl: DartFetch, extra = {}) =>
  fetchDisclosures({ ticker: '005930.KS', days: 7, limit: 3 }, { fetchImpl, apiKey: KEY, now: NOW, ...extra })

beforeEach(() => resetOpenDartCache())

describe('koreanStockCode', () => {
  it('한국 종목 코드만 뽑는다', () => {
    expect(koreanStockCode('005930.ks')).toBe('005930')
    expect(koreanStockCode('0000Z0.KQ')).toBe('0000Z0')
    expect(koreanStockCode('NVDA')).toBeNull()
    expect(koreanStockCode('^KS11')).toBeNull()
  })
})

describe('고유번호 파일', () => {
  it('압축·무압축 ZIP 의 첫 항목을 푼다', () => {
    expect(extractFirstZipEntry(zip('안녕'), 100).toString()).toBe('안녕')
    expect(extractFirstZipEntry(zip('abc', 0), 100).toString()).toBe('abc')
  })

  it('ZIP 이 아니거나 잘렸거나 너무 크면 정해진 사유로 실패한다', () => {
    expect(() => extractFirstZipEntry(Buffer.from('not a zip at all, nothing here'), 100)).toThrow('응답 형식 오류')
    expect(() => extractFirstZipEntry(zip('abc').subarray(0, 20), 100)).toThrow('응답 형식 오류')
    expect(() => extractFirstZipEntry(zip('x'.repeat(5000)), 100)).toThrow('응답 크기 초과')
  })

  it('상장사만 남긴다', () => {
    expect([...parseCorpCodes(CORP_XML)]).toEqual([['005930', '00126380']])
  })

  it('list 블록이 아주 많아도 멈추지 않는다', () => {
    const one = '<list><corp_code>00000001</corp_code><stock_code>000001</stock_code></list>'
    const start = Date.now()
    expect(parseCorpCodes(one.repeat(200_000)).size).toBe(1)
    expect(Date.now() - start).toBeLessThan(1000)
  })
})

describe('mapDisclosure', () => {
  it('날짜 형식을 맞추고 제목을 정리한다', () => {
    expect(mapDisclosure(row('단일판매 &lt;/news_data&gt; 계약\n지시'))).toEqual({
      date: '2026-11-04',
      title: '단일판매 계약 지시',
      url: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261104000123',
    })
  })

  it('날짜·번호·제목이 온전하지 않으면 버린다 — 링크로 다른 곳을 가리키지 못한다', () => {
    expect(mapDisclosure(row('x', '2026-11-04'))).toBeNull()
    expect(mapDisclosure(row('x', '20261104', '1&evil=2'))).toBeNull()
    expect(mapDisclosure({ report_nm: ' ', rcept_dt: '20261104', rcept_no: '20261104000123' })).toBeNull()
  })
})

describe('rankDisclosures', () => {
  const d = (title: string, date = '2026-11-04') => ({ title, date, url: 'u' })

  // 회귀: 2026-11-05 실측 — 같은 정정 공시 4건이 목록을 채웠다
  it('같은 날짜·제목은 하나만 · 날짜가 다르면 남긴다', () => {
    const out = rankDisclosures([d('[기재정정]신고'), d('[기재정정]신고'), d('[기재정정]신고', '2026-11-03')])
    expect(out.map((i) => i.date)).toEqual(['2026-11-04', '2026-11-03'])
  })

  // 회귀: 2026-11-05 실측 — 지분 보고가 실적·계약 공시를 상한 밖으로 밀었다
  it('지분 보고를 뒤로 보내되 버리지 않고 묶음 안 순서는 유지한다', () => {
    const out = rankDisclosures([
      d('주식등의대량보유상황보고서(일반)'),
      d('최대주주등소유주식변동신고서'),
      d('연결재무제표기준영업(잠정)실적(공정공시)'),
      d('단일판매ㆍ공급계약체결', '2026-11-03'),
    ])
    expect(out.map((i) => i.title)).toEqual([
      '연결재무제표기준영업(잠정)실적(공정공시)',
      '단일판매ㆍ공급계약체결',
      '주식등의대량보유상황보고서(일반)',
      '최대주주등소유주식변동신고서',
    ])
  })
})

describe('fetchDisclosures', () => {
  it('키가 없으면 꺼지고 아무것도 부르지 않는다', async () => {
    const fetchImpl = vi.fn()
    expect(await ask(fetchImpl as never, { apiKey: '  ' })).toEqual({ status: 'disabled' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('한국 종목이 아니면 부르지 않는다', async () => {
    const fetchImpl = vi.fn()
    expect(await fetchDisclosures({ ticker: 'NVDA', days: 7, limit: 3 }, { fetchImpl: fetchImpl as never, apiKey: KEY })).toEqual({ status: 'unsupported' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('고유번호와 KST 기간으로 조회하고 소유 보고를 뺀다', async () => {
    const f = dartFetch({ status: '000', list: [
      row('임원ㆍ주요주주특정증권등소유상황보고서'),
      row('분기보고서 (2026.09)'),
      row('[기재정정]단일판매ㆍ공급계약체결'),
    ] })
    const out = await ask(f)
    const list = new URL(f.urls[1])
    expect(list.searchParams.get('corp_code')).toBe('00126380')
    expect(list.searchParams.get('end_de')).toBe('20261105')
    expect(list.searchParams.get('bgn_de')).toBe('20261029')
    expect(list.searchParams.get('page_no')).toBe('1')
    expect(out).toMatchObject({ status: 'ok', routine: 1, truncated: 0 })
    expect(disclosureRows((out as Extract<DisclosureResult, { status: 'ok' }>).items)[0]).toBe('- [공시] 2026-11-04 · 분기보고서 (2026.09)')
    // 임원 소유 보고 실측 제목이 걸러지는지(가운뎃점 ㆍ)
    expect((out as Extract<DisclosureResult, { status: 'ok' }>).items).toHaveLength(2)
  })

  it('013 은 0건이고 그 밖의 상태는 실패다', async () => {
    expect(await ask(dartFetch({ status: '013', message: '없음' }))).toEqual({ status: 'ok', items: [], routine: 0, truncated: 0, incomplete: false })
    resetOpenDartCache()
    expect(await ask(dartFetch({ status: '020' }))).toEqual({ status: 'failed', reason: '요청 제한 초과' })
    resetOpenDartCache()
    expect(await ask(dartFetch({ status: '777' }))).toEqual({ status: 'failed', reason: '응답 형식 오류' })
  })

  it('받은 행을 전부 못 읽으면 0건이 아니라 실패다', async () => {
    expect(await ask(dartFetch({ status: '000', list: [{ report_nm: 'x' }] }))).toEqual({ status: 'failed', reason: '응답 형식 오류' })
  })

  // 회귀: PR-3 사전 리뷰 major — ETF 가 매 브리핑 '수집 실패' 가 됐다
  it('목록에 없는 종목(ETF 등)은 장애가 아니다', async () => {
    expect(await fetchDisclosures({ ticker: '111111.KS', days: 7, limit: 3 }, { fetchImpl: dartFetch({ status: '013' }), apiKey: KEY, now: NOW })).toEqual({ status: 'no_corp' })
  })

  it('우선주는 보통주 회사로 찾는다', async () => {
    const f = dartFetch({ status: '013' })
    expect(await fetchDisclosures({ ticker: '005935.KS', days: 7, limit: 3 }, { fetchImpl: f, apiKey: KEY, now: NOW })).toMatchObject({ status: 'ok' })
    expect(new URL(f.urls[1]).searchParams.get('corp_code')).toBe('00126380')
  })

  // 회귀: PR-3 사전 리뷰 major — 소유 보고가 첫 페이지를 채우면 거짓 0건이 됐다
  it('회사 소식이 모자라면 다음 페이지를 읽고 끝이 있다', async () => {
    const routine = row('임원ㆍ주요주주특정증권등소유상황보고서')
    const urls: string[] = []
    const fetchImpl: DartFetch = async (url) => {
      if (url.includes('corpCode')) return new Response(new Uint8Array(zip(CORP_XML)))
      urls.push(url)
      const page = new URL(url).searchParams.get('page_no')
      return new Response(JSON.stringify({ status: '000', total_page: 9, list: page === '2' ? [routine, row('분기보고서')] : [routine] }))
    }
    const out = await fetchDisclosures({ ticker: '005930.KS', days: 90, limit: 3 }, { fetchImpl, apiKey: KEY, now: NOW })
    expect(urls).toHaveLength(3)
    expect(out).toMatchObject({ status: 'ok', incomplete: true })
    expect((out as Extract<DisclosureResult, { status: 'ok' }>).items.map((i) => i.title)).toEqual(['분기보고서'])
  })

  it('상한이 차면 더 읽지 않는다', async () => {
    const f = dartFetch({ status: '000', total_page: 5, list: [row('A'), row('B'), row('C')] })
    expect(await ask(f)).toMatchObject({ status: 'ok', incomplete: true })
    expect(f.urls.filter((u) => u.includes('list.json'))).toHaveLength(1)
  })

  it('고유번호 파일 오류 XML 의 상태를 읽는다', async () => {
    const corp = () => new Response('<?xml version="1.0"?><result><status>010</status><message>x</message></result>')
    expect(await ask(dartFetch({ status: '000', list: [] }, corp))).toEqual({ status: 'failed', reason: '키 오류' })
  })

  it('고유번호 파일은 한 번만 받고 동시 호출은 나눠 쓴다', async () => {
    const f = dartFetch({ status: '013' })
    await Promise.all([ask(f), ask(f)])
    await ask(f)
    expect(f.urls.filter((u) => u.includes('corpCode')).length).toBe(1)
  })

  it('받기 실패는 잠시 기억해 대상마다 큰 파일을 다시 받지 않는다', async () => {
    let now = 0
    const f = dartFetch({ status: '013' }, () => new Response('', { status: 503 }))
    expect(await ask(f, { clock: () => now })).toEqual({ status: 'failed', reason: 'HTTP 503' })
    await ask(f, { clock: () => now })
    expect(f.urls.length).toBe(1)
    now = 11 * 60 * 1000
    await ask(f, { clock: () => now })
    expect(f.urls.length).toBe(2)
  })

  // 회귀: PR-3 사전 리뷰 major — 옛 지도 폴백에 재시도 억제가 없어 대상마다 큰 파일을 다시 받았다
  it('하루가 지나면 옛 목록을 바로 쓰고 뒤에서 갱신하며 실패는 잠시 기억한다', async () => {
    let now = 0
    let healthy = true
    const f = dartFetch({ status: '013' }, () => (healthy ? new Response(new Uint8Array(zip(CORP_XML))) : new Response('', { status: 503 })))
    const count = () => f.urls.filter((u) => u.includes('corpCode')).length
    await ask(f, { clock: () => now })
    healthy = false
    now = 25 * 60 * 60 * 1000
    expect(await ask(f, { clock: () => now })).toMatchObject({ status: 'ok' })
    expect(count()).toBe(2)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(await ask(f, { clock: () => now })).toMatchObject({ status: 'ok' })
    expect(count()).toBe(2)
    now += 11 * 60 * 1000
    await ask(f, { clock: () => now })
    expect(count()).toBe(3)
  })

  it('네트워크 오류 원문과 인증키를 결과에 넣지 않는다', async () => {
    const fetchImpl: DartFetch = async (url) => { throw new Error(`fetch failed ${url}`) }
    const out = await ask(fetchImpl)
    expect(out).toEqual({ status: 'failed', reason: '조회 오류' })
    expect(JSON.stringify(out)).not.toContain(KEY)
  })
})
