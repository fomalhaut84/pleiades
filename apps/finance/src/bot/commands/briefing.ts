import type { Bot, Context } from 'grammy'
import { sendBriefing, type BriefingOptions, type BriefingTarget } from '@/bot/notifications/briefing'
import { notifierForChat } from '@/bot/notifications/notifier'
import { askAdvisor, AdvisorError, describeAdvisorError } from '@/lib/ai/claude-advisor'
import { splitMessage } from '@/bot/utils/formatter'
import { markdownToTelegramHtml } from '@/bot/utils/markdown'
import { formatKstDate } from '@/lib/kst-date'
import { newsSearchRules } from '@/lib/ai/news-rules'
import { modelReply, plainReply, type ReplyOutput } from '../core/reply'
import { telegramOutput } from '../utils/telegram-reply'

/*
 * pleiades 009 D-3 PR-2b (pleiades#394 · 설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 D2 · A2 · Q · H2): 브리핑 · 종목 심층 분석.
 * 판단(decideBriefing)은 인자 · 응답 대상(`BriefingTarget` — 없으면 대상 불명) · 중립 응답 모델만 안다.
 * Discord 어댑터(PR-3 · pleiades#398)는 요청 채널 notifier 와 `{ aiCommand: '!ai' }` 를 넘긴다 · 모델 출력은 `modelReply`(명령 표기 변환 없음).
 * 텔레그램 어댑터는 요청 chat 의 `notifierForChat` 을 대상으로 넘긴다(지금 `sendBriefing(session, chatId)` 와 같은 notifier).
 * 특성 테스트 `__tests__/special-telegram.test.ts` 가 텔레그램 호출열을 고정한다.
 */

const SESSION_KEYWORDS = new Set(['한국', '미국', 'kr', 'KR', 'us', 'US'])

export const BRIEFING_RE = /^브리핑(?:\s+.*)?$/

/** 텔레그램 원문 → 인자 — `/briefing[@bot]` · `브리핑` 을 벗기고 trim(대소문자 무시). */
export function briefingArgsFromText(text: string): string {
  return text.replace(/^(\/briefing(?:@\w+)?|브리핑)\s*/i, '').trim()
}

/**
 * /브리핑 — 수동 모닝 브리핑 트리거
 * /브리핑 한국 — 한국장 브리핑
 * /브리핑 미국 — 미국장 브리핑
 * /브리핑 NVDA — 종목 심층 분석
 * /브리핑 (기본) — 현재 시간 기준 자동 판단
 */
export async function decideBriefing(
  args: string,
  target: BriefingTarget | undefined,
  out: ReplyOutput,
  options?: BriefingOptions,
): Promise<void> {
  if (!target) {
    await out.reply(plainReply('⚠️ 채팅 정보를 확인할 수 없습니다.'))
    return
  }

  // 종목 심층 분석: 한국/미국 키워드가 아닌 인자 → 종목으로 판단
  if (args && !SESSION_KEYWORDS.has(args)) {
    // Codex #487 P2: retryOnNoToolUsed 로 최대 ~13분 걸릴 수 있음 (통상 1~2분).
    await out.reply(plainReply(`🔍 ${args.toUpperCase()} 심층 분석 중... (통상 1~2분, 최대 10분 이상 걸릴 수 있어요)`))
    fireTickerAnalysis(out, args.toUpperCase())
    return
  }

  // 전체 모닝 브리핑 — #486 재시도 도입으로 최대 ~13분 (통상 1~2분, 도구 미호출
  // flaky 시 재시도로 지연). 사용자가 프리즈로 오해하지 않도록 상한 안내.
  await out.reply(plainReply('📊 브리핑 생성 중... (통상 1~2분, 최대 10분 이상 걸릴 수 있어요)'))

  let session: 'KR' | 'US'
  if (args === '한국' || args === 'kr' || args === 'KR') {
    session = 'KR'
  } else if (args === '미국' || args === 'us' || args === 'US') {
    session = 'US'
  } else {
    const now = new Date()
    const kstHour = (now.getUTCHours() + 9) % 24
    session = kstHour >= 6 && kstHour < 15 ? 'KR' : 'US'
  }

  // 텔레그램은 지금과 같은 두 인자 · Discord 는 실패 안내의 AI 명령 표기(`!ai`)를 넘긴다(설계 D2 · PR-3)
  const sending = options === undefined ? sendBriefing(session, target) : sendBriefing(session, target, options)
  sending.catch((e) =>
    console.error('[bot] 브리핑 발송 실패:', e)
  )
}

/**
 * 종목 심층 분석 프롬프트. pure — `now` 는 테스트 고정을 위한 주입점.
 * pleiades#279: 질의를 `"<티커> 최신 뉴스"` 로 고정하면 티커 코드 검색(한국 종목 `000660.KS`)이 되고,
 * 게시일 없는 결과에서 옛 기사가 인용됐다 → 회사명 + 연·월 · 게시일 확인 규칙.
 */
export function buildTickerAnalysisPrompt(ticker: string, now: Date = new Date()): string {
  return [
    `${ticker} 종목 심층 분석을 해줘. (오늘: ${formatKstDate(now)} KST 기준)\n`,
    '다음 단계로 진행해:',
    `1. get_holding_strategy(${ticker})로 전략/목표가/손절가 확인`,
    `2. get_technical_analysis(${ticker})로 TA 리포트 확인`,
    `3. get_portfolio(전체)에서 ${ticker} 보유 현황 확인 — 회사명도 여기서 확인`,
    `4. WebSearch로 ${ticker} 의 회사명 + 연·월로 뉴스 검색 (아래 뉴스 규칙 · 티커 코드만으로 검색하지 말 것)`,
    '',
    '분석 내용:',
    '- 현재 보유 현황 (수량, 평단, 수익률)',
    '- 전략 설정 (목표가/손절 대비 현재 위치)',
    '- 기술적 분석 요약 (RSI, MACD, BB, SMA, 지지/저항, 종합 시그널)',
    '- 최신 뉴스/이슈 요약 (2~3건 · 각 기사 게시일 표기)',
    '- 전략별 맞춤 조언 (장기보유→간략, 스윙→타이밍, 감시→점검기준)',
    '- 종합 판단 + 주의사항',
    '',
    ...newsSearchRules('analysis', now),
  ].join('\n')
}

/**
 * 종목 심층 분석 (fire-and-forget)
 */
function fireTickerAnalysis(out: ReplyOutput, ticker: string): void {
  const typingInterval = setInterval(() => {
    out.typing().catch(() => { /* 무시 */ })
  }, out.typingIntervalMs)

  const prompt = buildTickerAnalysisPrompt(ticker)

  askAdvisor(prompt, {
    model: 'sonnet',
    timeout: 300_000,
    maxBudgetUsd: 1.0,
    caller: 'bot:brief_command',
    expectsTools: true,
    // #486: 5회 재시도 (총 6회, 90초 backoff, 최대 ~13분).
    retryOnNoToolUsed: 5,
    // Codex #487 P2: 15분 상한 강제.
    overallTimeoutMs: 900_000,
  })
    .then(async (result) => {
      // 4096 경계·plain 분할은 텔레그램 시절 그대로다(Discord 는 chat 이 2000 으로 다시 나눈다 — 무해 · 설계 D)
      const html = markdownToTelegramHtml(result.response)
      if (html.length <= 4096) {
        try {
          await out.reply(modelReply(html, 'html'))
        } catch {
          await out.reply(modelReply(result.response, 'plain'))
        }
      } else {
        const chunks = splitMessage(result.response)
        for (const chunk of chunks) {
          await out.reply(modelReply(chunk, 'plain'))
        }
      }
    })
    .catch(async (error) => {
      if (error instanceof AdvisorError) {
        // Phase 40-B (#469): code 별 fallback 메시지 (auth_expired 등 원인 힌트).
        if (error.detail) console.error(`[bot] briefing advisor detail (${error.code}): ${error.detail}`)
        await out.reply(plainReply(describeAdvisorError(error)))
      } else {
        console.error(`[bot] ${ticker} 심층 분석 실패:`, error)
        await out.reply(plainReply(`⚠️ ${ticker} 분석에 실패했습니다. 잠시 후 다시 시도해주세요.`))
      }
    })
    .catch((e) => console.error('[bot] 분석 응답 전송 실패:', e))
    .finally(() => clearInterval(typingInterval))
}

/** 요청 chat 의 응답 대상 — chat 이 없으면 undefined(판단이 안내한다 · 지금 `if (!chatId)` 와 같다). */
function telegramBriefingTarget(ctx: Context): BriefingTarget | undefined {
  const chatId = ctx.chat?.id
  return chatId ? (bot) => notifierForChat(bot, chatId) : undefined
}

export function registerBriefingCommands(bot: Bot): void {
  // 등록에 try/catch 가 없다 — 판단 밖으로 던진 오류는 지금처럼 grammY bot.catch 로 간다
  const handle = (ctx: Context) =>
    decideBriefing(briefingArgsFromText(ctx.message?.text ?? ''), telegramBriefingTarget(ctx), telegramOutput(ctx))
  bot.command('briefing', handle)
  bot.hears(BRIEFING_RE, handle)
}
