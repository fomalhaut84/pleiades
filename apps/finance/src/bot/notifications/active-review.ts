/**
 * 능동 AI 인사이트 리뷰 — 클로징 (KR/US) + 주간.
 *
 * 아침 브리핑 (briefing.ts) 은 시장 대비, 본 파일은 마감 후 회고 + 다음 세션 대비.
 * `AlertConfig.active_review` = 'off' 시 조용.
 * `stock-trading-method` 프레임워크 기반 AI 조언 (참고용 면책).
 */

import { prisma } from '@/lib/prisma'
import { getBot } from '@/bot/index'
import { askAdvisor, describeAdvisorError } from '@/lib/ai/claude-advisor'
import { markdownToTelegramHtml } from '@/bot/utils/markdown'
import { sendHtml } from '@/bot/utils/telegram'
import { sanitizeError } from '@/bot/utils/error'
import { formatKstDate } from '@/lib/kst-date'

type MarketSession = 'KR' | 'US'

const ACTIVE_REVIEW_KEY = 'active_review'
const ACTIVE_REVIEW_LABEL = '능동 AI 리뷰 (on/off)'

/**
 * `active_review` 키 존재 보장 — 봇 스케줄러 등록 시 호출.
 *
 * 이유: `deploy/deploy.sh` 는 `prisma migrate deploy` 만 실행 (seed 재실행 X).
 * seed 재실행 없이 기존 배포에서 첫 cron 실행 전에 row 를 만들어 두어야
 * 사용자가 `PUT /api/alerts/config` 로 off 로 설정 가능 (라우트가 존재하지 않는 key 는 404).
 * 봇 프로세스 시작 시 실행되므로 배포 직후 즉시 row 존재.
 */
export async function ensureActiveReviewSetting(): Promise<void> {
  try {
    await prisma.alertConfig.upsert({
      where: { key: ACTIVE_REVIEW_KEY },
      update: {},
      create: { key: ACTIVE_REVIEW_KEY, value: 'on', label: ACTIVE_REVIEW_LABEL },
    })
  } catch (error) {
    console.error('[active-review] active_review 설정 초기화 실패:', error)
  }
}

async function isActiveReviewEnabled(): Promise<boolean> {
  // ensureActiveReviewSetting() 이 봇 시작 시 실행되어 row 존재 보장.
  // 만약 그 사이 삭제되었으면 lazy upsert 로 재생성 (기본 on).
  const config = await prisma.alertConfig.upsert({
    where: { key: ACTIVE_REVIEW_KEY },
    update: {},
    create: { key: ACTIVE_REVIEW_KEY, value: 'on', label: ACTIVE_REVIEW_LABEL },
  })
  return config.value.toLowerCase() !== 'off'
}

/**
 * 세션별 클로징 리뷰에서 확인할 주요 지수 티커 (#499).
 * KR 클로징은 마감 10분 뒤에 돌아 당일 마감 기사가 검색에 안 잡히는 날이 많다
 * → 지수 수치는 WebSearch 가 아니라 get_prices 도구값을 출처로 삼는다.
 */
const CLOSING_INDEX_TICKERS: Record<MarketSession, string[]> = {
  KR: ['^KS11', '^KQ11'],
  US: ['^GSPC', '^IXIC', '^DJI'],
}

/**
 * 클로징 리뷰 프롬프트 생성.
 * `now` 는 테스트 고정을 위한 주입점 (기본값 = 현재 시각).
 */
export function buildClosingPrompt(session: MarketSession, now: Date = new Date()): string {
  const sessionLabel = session === 'KR' ? '🇰🇷 한국장' : '🇺🇸 미국장'
  // KR 클로징 (15:40 KST): 방금 마감한 세션 = 오늘 (KST). 다음 세션 = 내일.
  // US 클로징 (07:15 KST 화-토): 방금 마감한 세션 = 지난밤 미국장 (KST 어제 밤 개장 ~ 오늘 이른 아침 마감).
  //   다음 세션은 오늘 밤 개장. AI 가 '오늘 미국장' 검색 시 개장 전 프리마켓 뉴스만 잡힐 위험 → 표현 명시.
  const closedSession = session === 'KR' ? '오늘 한국장' : '방금 마감한 지난밤 미국장'
  const nextSession = session === 'KR' ? '내일' : '오늘밤'
  const marketCurrency = session === 'KR' ? '한국주(KRW)' : '미국주(USD)'
  const today = formatKstDate(now)
  const indexArgs = CLOSING_INDEX_TICKERS[session].map((t) => `'${t}'`).join(', ')

  return [
    `${sessionLabel} 클로징 리뷰를 작성해줘. (오늘: ${today} KST 기준)\n`,
    '다음 단계로 진행해:',
    '1. get_all_strategies로 전체 종목 전략 확인',
    '2. get_portfolio(전체)로 현재 보유 상태 (평가금액, 손익)',
    `3. get_prices([${indexArgs}])로 ${closedSession} 주요 지수 마감치 확인 — 지수 수치는 반드시 이 도구값을 출처로 사용`,
    `4. WebSearch로 ${closedSession} 관련 뉴스/이슈 보조 검색 (뉴스는 배경 설명용, 지수 수치 출처로 쓰지 말 것)`,
    `5. ${marketCurrency} 종목 중 ${closedSession} 에서 유의미한 움직임 있는 것만 get_technical_analysis로 재확인`,
    '',
    '리뷰 구성 (총 6~8줄, 간결하게):',
    `- ${closedSession} 시장 요약 (주요 지수 수치 + 등락률, 이슈 1~2개)`,
    `- 보유 종목 ${closedSession} 성과 (전략별 요약, top-3 움직임)`,
    `- ${nextSession} 관찰 필요 종목 (다음 세션 대비 포인트)`,
    `- ${nextSession} 예정 이벤트 (실적/FOMC/일정, 있다면)`,
    '',
    '표기 규칙:',
    '- 지수는 3번 도구값 그대로 쓰고, 도구가 함께 반환한 "시세 기준" 시각이 리뷰 대상 세션과 다르면 그 시각을 명시',
    `- ${today} 가 아닌 날짜의 기사를 인용할 땐 기사 날짜를 함께 표기하고, 날짜가 불확실하면 인용하지 말 것`,
    ...(session === 'US'
      ? ['- 단, 미국장 기사는 미국 현지 날짜 기준이라 KST 로는 어제 날짜인 것이 정상 — 해당 세션 기사면 그대로 인용']
      : []),
    '- 도구로 수치를 받았으면 "데이터 부족"·"확인 불가" 라고 쓰지 말 것. 뉴스만 못 찾은 경우엔 "당일 뉴스 미확인" 으로 표현',
    '',
    '주의: 매매 결정은 사용자 몫이라 참고만. 손절 없음 전략 (stock-trading-method 스킬 참조).',
  ].join('\n')
}

function buildWeeklyPrompt(): string {
  return [
    '지난주 (월-금) 포트폴리오 회고 + 다음주 관찰 캘린더를 작성해줘.\n',
    '다음 단계:',
    '1. get_networth로 순자산 스냅샷',
    '2. get_performance(전체, 1M)로 지난 1개월 TWR + 알파',
    '3. get_all_strategies + get_portfolio(전체)로 전략별 종목 상태',
    '4. 관심종목/보유종목 중 지난주 유의미한 이벤트 (전략 태그별 요약)',
    '5. WebSearch로 다음주 주요 이벤트 (미국 FOMC, 실적, 한국 지표 발표 등)',
    '',
    '리뷰 구성 (총 10~14줄, 섹션 구분):',
    '- 지난주 하이라이트 (성과 요약, top-3 종목 기여도)',
    '- 리스크/기회 지점 (변동성 크거나 시그널 발생 종목)',
    '- 다음주 관찰 캘린더 (요일별 이벤트 리스트)',
    '- 전략 재조정 힌트 (있다면, 참고용)',
    '',
    '주의: 매매/자산 결정은 사용자 몫. stock-trading-method 스킬 기반 참고 조언.',
  ].join('\n')
}

async function sendReview(
  chatIds: number[],
  label: string,
  prompt: string,
  fallbackHint: string,
): Promise<void> {
  const bot = getBot()

  try {
    const result = await askAdvisor(prompt, {
      model: 'sonnet',
      timeout: 300_000,
      maxBudgetUsd: 1.0,
      caller: 'cron:active_review',
      // #483: 능동 리뷰는 보유 종목·TA·전략 MCP 도구 사용 필수.
      expectsTools: true,
      // #486: 5회 재시도 (총 6회, 90초 backoff, 최대 ~13분).
      retryOnNoToolUsed: 5,
      // Codex #487 P2: 15분 상한 강제.
      overallTimeoutMs: 900_000,
    })

    const html = markdownToTelegramHtml(result.response)

    for (const chatId of chatIds) {
      try {
        await sendHtml(bot, chatId, html)
      } catch (error) {
        console.error(`[active-review] ${label} 발송 실패 (chatId: ${chatId}): ${sanitizeError(error)}`)
      }
    }

    console.log(`[active-review] ${label} 발송 완료`)
  } catch (error) {
    console.error(`[active-review] ${label} 생성 실패: ${sanitizeError(error)}`)

    // Phase 40-B (#469): AdvisorError code 별 fallback 메시지 (auth_expired 등 원인 힌트).
    // Advisor 관련이 아닌 다른 예외는 hint 유지.
    const advisorMsg =
      error instanceof Error && ('code' in error) ? describeAdvisorError(error) : ''
    const fallback = `📊 ${label} 리뷰 생성에 실패했습니다.\n${advisorMsg || fallbackHint}`
    for (const chatId of chatIds) {
      try {
        await sendHtml(bot, chatId, fallback)
      } catch {
        // 무시
      }
    }
  }
}

export async function sendClosingReview(
  chatIds: number[],
  session: MarketSession,
): Promise<void> {
  if (!(await isActiveReviewEnabled())) {
    console.log(`[active-review] ${session} 클로징 스킵 (active_review=off)`)
    return
  }
  const label = session === 'KR' ? '🇰🇷 한국장 클로징' : '🇺🇸 미국장 클로징'
  await sendReview(
    chatIds,
    label,
    buildClosingPrompt(session),
    '/ai 에서 직접 질문해주세요.',
  )
}

export async function sendWeeklyReview(chatIds: number[]): Promise<void> {
  if (!(await isActiveReviewEnabled())) {
    console.log('[active-review] 주간 리뷰 스킵 (active_review=off)')
    return
  }
  await sendReview(
    chatIds,
    '📅 주간 리뷰',
    buildWeeklyPrompt(),
    '웹 AI 분석 페이지 또는 /ai 명령으로 회고를 확인해주세요.',
  )
}
