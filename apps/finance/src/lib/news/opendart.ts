/**
 * pleiades#280 PR-3 — OpenDART 공시. 키(`OPENDART_API_KEY`)가 없으면 기능만 꺼진다.
 * 공시검색은 고유번호(8자리)를 받는데 앱은 종목코드만 안다 → 고유번호 ZIP 을 내려받아 프로세스 메모리에 둔다(DB 무변경).
 * 인증키는 URL 에 들어간다 — 오류 문구 · 로그에 URL 과 라이브러리 원문을 쓰지 않고 정해진 사유만 쓴다.
 */

import { inflateRawSync } from 'node:zlib'
import { formatKstDate } from '@/lib/kst-date'
import { NEWS_TITLE_MAX_LENGTH, sanitizeNewsText } from './sanitize'
import { NewsFetchError, newsFailureReason } from './types'

const API_BASE = 'https://opendart.fss.or.kr/api'
const VIEWER_BASE = 'https://dart.fss.or.kr/dsaf001/main.do'

const LIST_TIMEOUT_MS = 5_000
const CORP_TIMEOUT_MS = 15_000
const LIST_MAX_BYTES = 2 * 1024 * 1024
/** 고유번호 파일의 실제 크기는 키가 있어야 잰다 — 넉넉히 두되 끝이 있게 한다 */
const CORP_ZIP_MAX_BYTES = 20 * 1024 * 1024
const CORP_XML_MAX_BYTES = 100 * 1024 * 1024
const CORP_TTL_MS = 24 * 60 * 60 * 1000
/** 실패를 곧바로 다시 시도하면 브리핑 한 번에 대상 수만큼 큰 파일을 받게 된다 */
const CORP_FAILURE_TTL_MS = 10 * 60 * 1000
const PAGE_COUNT = 100
/** 소유 보고가 첫 페이지를 다 채우는 대형주에서 거짓 0건이 나지 않게 더 읽는다. 끝이 있어야 한다 */
const MAX_PAGES = 3
const DAY_MS = 24 * 60 * 60 * 1000

/** 임원·주요주주 소유 보고는 대형주에서 목록을 다 채우고 회사 소식이 아니다 */
const ROUTINE_REPORT = /임원\s*.?\s*주요주주\s*특정증권/
/**
 * 지분·보상 보고는 의미가 있을 수 있어 버리지 않고 뒤로 보낸다.
 * 2026-11-05 실측: 삼성전자 최근 4건이 전부 이 종류였고 실적·계약 공시가 상한 밖으로 밀렸다.
 */
const OWNERSHIP_REPORT = /대량보유상황|최대주주등소유주식|특수관계인|주식매수선택권|자기주식처분결과/

const STATUS_REASON: Record<string, string> = {
  '010': '키 오류',
  '011': '키 오류',
  '012': '허용되지 않은 IP',
  '020': '요청 제한 초과',
  '021': '요청 제한 초과',
  '100': '요청 값 오류',
  '101': '접근 거부',
  '800': '시스템 점검',
  '900': 'OpenDART 오류',
  '901': '키 만료',
}

function statusFailure(status: unknown): NewsFetchError {
  const reason = typeof status === 'string' ? STATUS_REASON[status] : undefined
  return new NewsFetchError(reason ?? '응답 형식 오류')
}

export interface Disclosure {
  /** 접수일 YYYY-MM-DD (시각은 제공되지 않는다) */
  date: string
  /** 보고서명 (외부 텍스트 · 정리됨) */
  title: string
  url: string
}

export type DisclosureResult =
  | { status: 'disabled' }
  | { status: 'unsupported' }
  /** 고유번호 파일은 회사 단위다 — ETF 등은 정상적으로 없다. 장애가 아니다 */
  | { status: 'no_corp' }
  | { status: 'failed'; reason: string }
  /** `incomplete` = 읽지 못한 페이지가 남았다. 이때 0건은 '없음' 이 아니다 */
  | { status: 'ok'; items: Disclosure[]; routine: number; truncated: number; incomplete: boolean }

export type DartFetch = (url: string, init: RequestInit) => Promise<Response>

export interface DartDeps {
  fetchImpl?: DartFetch
  apiKey?: string | null
  now?: Date
  clock?: () => number
}

function apiKeyOf(deps: DartDeps): string | null {
  const key = deps.apiKey === undefined ? process.env.OPENDART_API_KEY : deps.apiKey
  return key?.trim() || null
}

/** `005930.KS` → `005930`. 한국 종목이 아니면 null. pure */
export function koreanStockCode(ticker: string): string | null {
  return /^([0-9A-Z]{6})\.(KS|KQ)$/.exec(ticker.trim().toUpperCase())?.[1] ?? null
}

async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new NewsFetchError('응답 형식 오류')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return Buffer.concat(chunks)
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new NewsFetchError('응답 크기 초과')
    }
    chunks.push(value)
  }
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const EOCD_MIN = 22
const EOCD_SEARCH = 0xffff + EOCD_MIN

/** ZIP 의 첫 항목을 푼다. 고유번호 파일은 XML 하나다. 형식이 다르면 정해진 사유로 실패한다. pure */
export function extractFirstZipEntry(zip: Buffer, maxOutput: number): Buffer {
  const bad = new NewsFetchError('응답 형식 오류')
  const lowest = Math.max(0, zip.length - EOCD_SEARCH)
  let eocd = -1
  for (let i = zip.length - EOCD_MIN; i >= lowest; i -= 1) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw bad
  const central = zip.readUInt32LE(eocd + 16)
  if (central + 46 > zip.length || zip.readUInt32LE(central) !== CENTRAL_SIGNATURE) throw bad
  // 지역 헤더의 크기는 스트리밍 ZIP 에서 0 일 수 있어 중앙 디렉터리 값을 쓴다
  const method = zip.readUInt16LE(central + 10)
  const compressedSize = zip.readUInt32LE(central + 20)
  const local = zip.readUInt32LE(central + 42)
  if (local + 30 > zip.length || zip.readUInt32LE(local) !== LOCAL_SIGNATURE) throw bad
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
  const end = start + compressedSize
  if (end > zip.length) throw bad
  const data = zip.subarray(start, end)
  if (method === 0) {
    if (data.length > maxOutput) throw new NewsFetchError('응답 크기 초과')
    return data
  }
  if (method !== 8) throw bad
  try {
    return inflateRawSync(data, { maxOutputLength: maxOutput })
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') throw new NewsFetchError('응답 크기 초과')
    throw bad
  }
}

function xmlValue(block: string, tag: string): string {
  const open = `<${tag}>`
  const at = block.indexOf(open)
  if (at < 0) return ''
  const close = block.indexOf(`</${tag}>`, at)
  return close < 0 ? '' : block.slice(at + open.length, close).trim()
}

/** 고유번호 XML → 종목코드 · 고유번호. 상장사만 남긴다. 파일이 커서 정규식 대신 indexOf 로 나눈다. pure */
export function parseCorpCodes(xml: string): Map<string, string> {
  const map = new Map<string, string>()
  let from = 0
  for (;;) {
    const open = xml.indexOf('<list>', from)
    if (open < 0) return map
    const close = xml.indexOf('</list>', open)
    if (close < 0) return map
    const block = xml.slice(open, close)
    const stock = xmlValue(block, 'stock_code')
    const corp = xmlValue(block, 'corp_code')
    if (/^[0-9A-Z]{6}$/.test(stock) && /^\d{8}$/.test(corp)) map.set(stock, corp)
    from = close + '</list>'.length
  }
}

interface CorpCache {
  map: Map<string, string> | null
  /** 지도를 마지막으로 받은 시각 */
  loadedAt: number
  failure: string | null
  /** 실패 뒤 이 시각까지 다시 받지 않는다 */
  retryAt: number
}

let corpCache: CorpCache = { map: null, loadedAt: 0, failure: null, retryAt: 0 }
let corpLoading: Promise<Map<string, string>> | null = null

/** 테스트 전용 — 프로세스 전역 캐시를 비운다 */
export function resetOpenDartCache(): void {
  corpCache = { map: null, loadedAt: 0, failure: null, retryAt: 0 }
  corpLoading = null
}

async function downloadCorpCodes(key: string, fetchImpl: DartFetch): Promise<Map<string, string>> {
  const url = `${API_BASE}/corpCode.xml?${new URLSearchParams({ crtfc_key: key })}`
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(CORP_TIMEOUT_MS) })
  if (!response.ok) throw new NewsFetchError(`HTTP ${response.status}`)
  const body = await readCapped(response, CORP_ZIP_MAX_BYTES)
  // 오류 응답은 ZIP 이 아니라 status 를 담은 XML 로 온다(규격에 설명 없음 · 실측 전)
  if (body.subarray(0, 2).toString('latin1') !== 'PK') {
    throw statusFailure(xmlValue(body.subarray(0, 4096).toString('utf8'), 'status'))
  }
  const map = parseCorpCodes(extractFirstZipEntry(body, CORP_XML_MAX_BYTES).toString('utf8'))
  // 빈 지도를 캐시하면 하루 동안 모든 종목이 '찾을 수 없음' 이 된다
  if (map.size === 0) throw new NewsFetchError('응답 형식 오류')
  return map
}

function startCorpDownload(key: string, deps: DartDeps): Promise<Map<string, string>> {
  const clock = deps.clock ?? Date.now
  // 같이 들어온 호출은 다운로드 하나를 나눠 쓴다
  corpLoading ??= downloadCorpCodes(key, deps.fetchImpl ?? ((url, init) => fetch(url, init)))
    .then((map) => {
      corpCache = { map, loadedAt: clock(), failure: null, retryAt: 0 }
      return map
    })
    .catch((error: unknown) => {
      const failure = newsFailureReason(error)
      corpCache = { ...corpCache, failure, retryAt: clock() + CORP_FAILURE_TTL_MS }
      throw new NewsFetchError(failure)
    })
    .finally(() => {
      corpLoading = null
    })
  return corpLoading
}

async function corpCodes(key: string, deps: DartDeps): Promise<Map<string, string>> {
  const now = (deps.clock ?? Date.now)()
  const { map, loadedAt, failure, retryAt } = corpCache
  if (map && now - loadedAt < CORP_TTL_MS) return map
  const coolingDown = now < retryAt
  if (map) {
    // 고유번호는 거의 바뀌지 않는다 — 갱신을 기다리거나 갱신 실패로 공시를 막지 않고 옛 지도를 쓴다
    if (!coolingDown) startCorpDownload(key, deps).catch(() => undefined)
    return map
  }
  if (coolingDown) throw new NewsFetchError(failure ?? '조회 오류')
  return startCorpDownload(key, deps)
}

const dartDate = (date: Date): string => formatKstDate(date).replaceAll('-', '')

interface DartRow {
  report_nm?: unknown
  rcept_no?: unknown
  rcept_dt?: unknown
}

/** 응답 행 → 공시. 날짜·번호·제목이 온전한 것만 남긴다. pure */
export function mapDisclosure(row: DartRow): Disclosure | null {
  const title = sanitizeNewsText(typeof row.report_nm === 'string' ? row.report_nm : '', NEWS_TITLE_MAX_LENGTH)
  const no = typeof row.rcept_no === 'string' ? row.rcept_no : ''
  const day = typeof row.rcept_dt === 'string' ? row.rcept_dt : ''
  if (!title || !/^\d{14}$/.test(no) || !/^\d{8}$/.test(day)) return null
  return {
    date: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`,
    title,
    url: `${VIEWER_BASE}?rcpNo=${no}`,
  }
}

/**
 * 같은 날짜·같은 제목은 하나만 — 2026-11-05 실측: 카카오 최근 4건이 같은 정정 공시였다.
 * 회사 소식을 먼저 · 지분 보고를 뒤로. 각 묶음 안의 순서(최신순)는 그대로다. pure
 */
export function rankDisclosures(items: readonly Disclosure[]): Disclosure[] {
  const seen = new Set<string>()
  const unique = items.filter((item) => {
    const key = `${item.date}|${item.title}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return [...unique.filter((i) => !OWNERSHIP_REPORT.test(i.title)), ...unique.filter((i) => OWNERSHIP_REPORT.test(i.title))]
}

function parseListBody(text: string): { rows: DartRow[]; totalPage: number } {
  let body: { status?: unknown; list?: unknown; total_page?: unknown }
  try {
    body = JSON.parse(text) as { status?: unknown; list?: unknown; total_page?: unknown }
  } catch {
    throw new NewsFetchError('응답 형식 오류')
  }
  if (body.status === '013') return { rows: [], totalPage: 0 }
  if (body.status !== '000') throw statusFailure(body.status)
  if (!Array.isArray(body.list)) throw new NewsFetchError('응답 형식 오류')
  const totalPage = Number(body.total_page)
  return { rows: body.list as DartRow[], totalPage: Number.isFinite(totalPage) ? totalPage : 1 }
}

/** 우선주(`005935`)는 고유번호 파일에 없고 보통주(`005930`)로 같은 회사다. pure */
function corpCodeOf(map: ReadonlyMap<string, string>, stockCode: string): string | null {
  return map.get(stockCode) ?? map.get(`${stockCode.slice(0, 5)}0`) ?? null
}

async function fetchListPage(
  params: URLSearchParams,
  deps: DartDeps,
): Promise<{ rows: DartRow[]; totalPage: number }> {
  const response = await (deps.fetchImpl ?? ((url, init) => fetch(url, init)))(`${API_BASE}/list.json?${params}`, {
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
  })
  if (!response.ok) throw new NewsFetchError(`HTTP ${response.status}`)
  return parseListBody((await readCapped(response, LIST_MAX_BYTES)).toString('utf8'))
}

/** 최근 공시. 던지지 않는다 — 실패는 결과로 돌려준다. */
export async function fetchDisclosures(
  args: { ticker: string; days: number; limit: number },
  deps: DartDeps = {},
): Promise<DisclosureResult> {
  const stockCode = koreanStockCode(args.ticker)
  if (!stockCode) return { status: 'unsupported' }
  const key = apiKeyOf(deps)
  if (!key) return { status: 'disabled' }
  try {
    const corp = corpCodeOf(await corpCodes(key, deps), stockCode)
    if (!corp) return { status: 'no_corp' }
    const now = deps.now ?? new Date()
    const rows: DartRow[] = []
    let page = 0
    let totalPage = 1
    let material = 0
    // 회사 소식이 상한만큼 모일 때까지만 더 읽는다 — 정상 종목은 한 번이면 끝난다
    while (page < totalPage && page < MAX_PAGES && material < args.limit) {
      page += 1
      const fetched = await fetchListPage(new URLSearchParams({
        crtfc_key: key,
        corp_code: corp,
        bgn_de: dartDate(new Date(now.getTime() - args.days * DAY_MS)),
        end_de: dartDate(now),
        sort: 'date',
        sort_mth: 'desc',
        page_count: String(PAGE_COUNT),
        page_no: String(page),
      }), deps)
      rows.push(...fetched.rows)
      totalPage = fetched.totalPage
      material = rows.map(mapDisclosure).filter((item) => item && !ROUTINE_REPORT.test(item.title) && !OWNERSHIP_REPORT.test(item.title)).length
    }
    const all = rows.map(mapDisclosure).filter((item): item is Disclosure => item !== null)
    // 받은 행을 하나도 못 읽었으면 형식이 바뀐 것이다 — 0건으로 읽히면 실패가 숨는다
    if (rows.length > 0 && all.length === 0) throw new NewsFetchError('응답 형식 오류')
    const kept = all.filter((item) => !ROUTINE_REPORT.test(item.title))
    const items = rankDisclosures(kept)
    return {
      status: 'ok',
      items: items.slice(0, args.limit),
      routine: all.length - kept.length,
      truncated: Math.max(0, items.length - args.limit),
      incomplete: page < totalPage,
    }
  } catch (error) {
    return { status: 'failed', reason: newsFailureReason(error) }
  }
}

/** 공시 목록 줄. 뉴스 줄과 모양이 달라 출처 이름이 '공시' 인 기사가 1차 자료로 읽히지 않는다. pure */
export function disclosureRows(items: readonly Disclosure[]): string[] {
  return items.map((item) => `- [공시] ${item.date} · ${item.title}`)
}
