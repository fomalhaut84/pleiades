/**
 * KRX 상장 종목 크롤러: 한글 종목명 → yahoo ticker 매핑
 *
 * kind.krx.co.kr에서 전체 상장법인 목록 HTML을 파싱하여
 * KrxStock 테이블에 upsert한다.
 */

import { prisma } from './prisma'

const KRX_BASE_URL = 'https://kind.krx.co.kr/corpgeneral/corpList.do?method=download'

interface KrxStockEntry {
  code: string
  name: string
  market: string
  yahooTicker: string
}

/**
 * KRX HTML 테이블을 파싱하여 종목 리스트를 반환한다.
 * 컬럼 순서: 회사명(0), 시장구분(1), 종목코드(2), 업종(3), ...
 * 시장구분 값에 줄바꿈/공백이 많으므로 HTML 태그 제거 + 공백 정리 필수.
 */
function parseKrxHtml(html: string): KrxStockEntry[] {
  const entries: KrxStockEntry[] = []
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/g
  let match: RegExpExecArray | null
  let isHeader = true

  while ((match = rowRegex.exec(html)) !== null) {
    if (isHeader) {
      isHeader = false
      continue
    }

    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g
    const cells: string[] = []
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRegex.exec(match[1])) !== null) {
      // HTML 태그 제거 + 공백 정리
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim())
    }

    if (cells.length < 3) continue

    const name = cells[0]
    const marketRaw = cells[1]
    const code = cells[2]

    // 6자리 숫자 종목코드만 처리
    if (!/^\d{6}$/.test(code)) continue
    if (!name) continue

    const marketMap: Record<string, string> = { '유가': 'KOSPI', '코스닥': 'KOSDAQ' }
    const market = marketMap[marketRaw]
    if (!market) continue
    const suffix = market === 'KOSPI' ? '.KS' : '.KQ'
    const yahooTicker = `${code}${suffix}`

    entries.push({ code, name, market, yahooTicker })
  }

  return entries
}

/**
 * KRX에서 시장별 종목 리스트 HTML을 다운로드한다.
 */
async function fetchKrxHtml(marketType: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  const url = `${KRX_BASE_URL}&marketType=${marketType}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))

  if (!res.ok) {
    throw new Error(`KRX 종목 리스트 다운로드 실패 (${marketType}): ${res.status}`)
  }

  const buffer = await res.arrayBuffer()
  return new TextDecoder('euc-kr').decode(buffer)
}

/**
 * KOSPI + KOSDAQ 종목 리스트를 병렬로 가져와 합친다.
 */
async function fetchKrxStockList(): Promise<KrxStockEntry[]> {
  const [kospiHtml, kosdaqHtml] = await Promise.all([
    fetchKrxHtml('stockMkt'),
    fetchKrxHtml('kosdaqMkt'),
  ])

  return [...parseKrxHtml(kospiHtml), ...parseKrxHtml(kosdaqHtml)]
}

/**
 * KRX 종목 리스트를 DB에 동기화한다.
 * - 신규 종목: 추가
 * - 기존 종목: 이름/시장 업데이트
 * - 상폐 종목: 삭제
 */
export async function syncKrxStocks(): Promise<{ total: number; added: number; updated: number; removed: number }> {
  const entries = await fetchKrxStockList()

  if (entries.length === 0) {
    throw new Error('KRX 종목 리스트가 비어 있습니다. 파싱 오류일 수 있습니다.')
  }

  const result = { total: entries.length, added: 0, updated: 0, removed: 0 }

  // 기존 데이터 조회
  const existing = await prisma.krxStock.findMany({
    select: { id: true, code: true, name: true, market: true },
  })
  const existingMap = new Map(existing.map((e) => [e.code, e]))
  const newCodes = new Set(entries.map((e) => e.code))

  // 카운트 집계
  for (const entry of entries) {
    const ex = existingMap.get(entry.code)
    if (!ex) {
      result.added++
    } else if (ex.name !== entry.name || ex.market !== entry.market) {
      result.updated++
    }
  }

  // upsert 먼저 실행 (실패 시에도 기존 데이터 보존)
  const BATCH_SIZE = 100
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)
    await prisma.$transaction(
      batch.map((entry) =>
        prisma.krxStock.upsert({
          where: { code: entry.code },
          create: entry,
          update: {
            name: entry.name,
            market: entry.market,
            yahooTicker: entry.yahooTicker,
          },
        })
      )
    )
  }

  // 상폐 종목 삭제 (upsert 완료 후 실행)
  // 안전장치: 수집 결과가 기존의 80% 미만이면 삭제 skip (파싱 이상 방지)
  const toDelete = existing.filter((e) => !newCodes.has(e.code))
  if (toDelete.length > 0) {
    if (existing.length > 0 && entries.length < existing.length * 0.8) {
      console.warn(
        `[krx-stocks] 수집 ${entries.length}개 < 기존 ${existing.length}개의 80%. 삭제 건너뜀 (파싱 이상 가능성)`
      )
    } else {
      await prisma.krxStock.deleteMany({
        where: { id: { in: toDelete.map((e) => e.id) } },
      })
      result.removed = toDelete.length
    }
  }

  return result
}

/**
 * 한글 종목명으로 KrxStock을 검색한다.
 * - 정확 일치 우선, 부분 일치 fallback
 */
export async function searchKrxByName(
  query: string
): Promise<{ ticker: string; name: string; market: string }[]> {
  // 정확 일치
  const exact = await prisma.krxStock.findMany({
    where: { name: { equals: query, mode: 'insensitive' } },
    select: { yahooTicker: true, name: true, market: true },
    take: 5,
  })

  if (exact.length > 0) {
    return exact.map((e) => ({ ticker: e.yahooTicker, name: e.name, market: e.market }))
  }

  // 부분 일치
  const partial = await prisma.krxStock.findMany({
    where: { name: { contains: query, mode: 'insensitive' } },
    select: { yahooTicker: true, name: true, market: true },
    orderBy: { name: 'asc' },
    take: 11,
  })

  return partial.map((e) => ({ ticker: e.yahooTicker, name: e.name, market: e.market }))
}
