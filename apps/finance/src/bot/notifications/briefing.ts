/**
 * 모닝 브리핑 생성 + 텔레그램 발송
 *
 * AI(askAdvisor)로 보유 종목 전략별 맞춤 브리핑 생성.
 * 한국장 08:30 KST / 미국장 23:00 KST 자동 발송.
 */

import { notifyBot } from '@/bot/index'
import { askAdvisor, describeAdvisorError } from '@/lib/ai/claude-advisor'
import { markdownToTelegramHtml } from '@/bot/utils/markdown'
import type { Notifier } from '@pleiades/notify'
import { notifierFor, Route, htmlContent, type NotifyBot } from './notifier'
import { sanitizeError } from '@/bot/utils/error'
import { formatKstDate } from '@/lib/kst-date'
import { newsSearchRules } from '@/lib/ai/news-rules'

type MarketSession = 'KR' | 'US'

/** `now` 는 테스트 고정을 위한 주입점 (기본값 = 현재 시각) */
export function buildBriefingPrompt(session: MarketSession, now: Date = new Date()): string {
  const sessionLabel = session === 'KR' ? '🇰🇷 한국장' : '🇺🇸 미국장'

  return [
    `${sessionLabel} 모닝 브리핑을 작성해줘. (오늘: ${formatKstDate(now)} KST 기준)\n`,
    '다음 단계로 진행해:',
    '1. get_all_strategies로 전체 종목 전략 확인',
    '2. get_portfolio(전체)로 현재 보유 현황 확인',
    session === 'US'
      ? '3. 미국주(USD) 종목 중 스윙/모멘텀/단타 전략은 get_technical_analysis로 TA 확인'
      : '3. 한국주(KRW) 종목 중 스윙/모멘텀/단타 전략은 get_technical_analysis로 TA 확인',
    '4. WebSearch로 보유 종목 관련 뉴스 검색 — 아래 뉴스 규칙대로 (회사명 + 연·월 · 게시일 확인)',
    '',
    '브리핑 구성:',
    '- 시장 동향 요약 (주요 지수, 이슈)',
    '- 장기보유 종목: 간략 (뉴스 요약만, 특이사항 있을 때만)',
    '- 스윙/모멘텀 종목: TA 기반 매수/매도 타이밍 + 목표가/손절 대비',
    '- 감시 종목: 점검 기준 대비 현재 상태',
    '- 오늘 주목 이벤트 (실적, FOMC, 점검일 등)',
    '',
    '계좌별로 섹션 분리 (소담/다솜 장기 vs 세진 능동).',
    '',
    // pleiades#279: 게시일 없는 검색 결과에서 옛 기사가 "최신 뉴스" 로 인용됐다
    ...newsSearchRules('briefing', now),
  ].join('\n')
}

/**
 * 브리핑 응답 대상 — 봇을 받아 notifier 를 만든다(pleiades 009 D-3 PR-2b · pleiades#394 · 설계 §4 D2).
 * 봇 명령이 넘긴다: 텔레그램 = `notifierForChat(bot, chatId)`(요청 chat 하나) · Discord = 요청 채널(PR-3).
 * 없으면 크론 경로 — `notifierFor`(라우트 스위치). `notifyBot()` 은 지금처럼 이 함수 안에서 부른다(실패 경로 같음).
 */
export type BriefingTarget = (bot: NotifyBot) => Notifier

export interface BriefingOptions {
  /** 실패 안내의 AI 명령 표기 — 기본 텔레그램 `/ai` · Discord 는 `!ai`(PR-3 · 설계 D2 "문구를 인자로") */
  readonly aiCommand?: string
}

/**
 * 모닝 브리핑을 만들어 보낸다.
 * @param target 있으면 그 대상에만(봇 `/브리핑` 명령 — 요청한 곳) · 없으면 ALLOWED 라우트 전체(cron).
 * @param options.aiCommand 실패 안내의 AI 명령 표기(기본 `/ai`).
 */
export async function sendBriefing(
  session: MarketSession,
  target?: BriefingTarget,
  options: BriefingOptions = {},
): Promise<void> {
  const bot = notifyBot()
  const notifier = target === undefined ? notifierFor(bot) : target(bot)
  const prompt = buildBriefingPrompt(session)

  try {
    const result = await askAdvisor(prompt, {
      model: 'sonnet',
      timeout: 300_000,
      maxBudgetUsd: 1.0,
      caller: 'cron:briefing',
      // #483: 브리핑은 MCP 도구 (get_all_strategies / get_portfolio 등) 사용이
      // 필수. tools/list 는 성공했으나 tool 을 한 번도 호출하지 않고 "도구 접근
      // 불가" 안내 텍스트만 리턴하는 케이스를 no_tool_used AdvisorError 로
      // 재분류 → catch 블록 fallback + monitor alert 동작.
      expectsTools: true,
      // #486: no_tool_used 는 재시도로 대부분 해결되는 flaky 현상. 5회 재시도
      // (총 6회 시도, 90초 backoff, 최대 ~13분) → 15분 예산 안. 사용자 관점
      // fallback 최소화.
      retryOnNoToolUsed: 5,
      // Codex #487 P2: 각 subprocess timeout 300s × 6 + backoff 90s × 5 는
      // 최악 37.5분. overallTimeoutMs 로 전체 15분 상한 강제.
      overallTimeoutMs: 900_000,
    })

    const html = markdownToTelegramHtml(result.response)

    await notifier.notify(Route.ALLOWED, htmlContent(html), { label: 'briefing' })

    const label = session === 'KR' ? '한국장' : '미국장'
    console.log(`[briefing] ${label} 모닝 브리핑 발송 완료`)
  } catch (error) {
    console.error(`[briefing] 브리핑 생성 실패: ${sanitizeError(error)}`)

    // Phase 40-B (#469, Codex #478 P2): AdvisorError code 별 fallback (auth/quota/
    // server 원인 힌트). describeAdvisorError 는 AdvisorError/AdvisorTimeoutError/
    // Error 모두 받아 code 없는 일반 Error 는 unknown 으로 처리. 이 경우 기존
    // hint (`/ai 에서 직접 질문해주세요`) 를 붙여 사용자 액션 제시.
    const label = session === 'KR' ? '🇰🇷 한국장' : '🇺🇸 미국장'
    const advisorMsg = error instanceof Error ? describeAdvisorError(error) : ''
    const fallback =
      `📊 ${label} 모닝 브리핑 생성에 실패했습니다.\n` +
      `${advisorMsg}\n${options.aiCommand ?? '/ai'} 에서 직접 질문해주세요.`
    await notifier.notify(Route.ALLOWED, htmlContent(fallback), { label: 'briefing' })
  }
}
