/**
 * pleiades 009 D-3 PR-3 (pleiades#398 · 설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 P · A · B · D · H): fin Discord 라우터.
 *
 * 판단은 텔레그램과 같은 decide* 를 쓴다(PR-1a~2c). 등록은 텔레그램 등록 순서(`bot/index.ts`) 그대로:
 *   영어 이름 21 = `!` 접두 명령(접두 필수 — `report 2026` 같은 자연어는 명령이 아니다) · 인자 = 라우터 args
 *   한글 28 = 텔레그램과 **같은 정규식 상수**(같은 텍스트 = 같은 의미) · 인자 = 텔레그램과 같은 원문 벗기기 식(이름이 첫 단어라 결과가 같다)
 *   나머지 = 자유 텍스트 fallback 하나(소비 → AI 거래 → AI 질문 → 무응답) — `!` 로 시작하면 명령 모양이라 소비·AI 로 보내지 않는다
 *            첨부만 있는 메시지는 빈 텍스트로 여기 온다 → 무응답(첨부 경로 없음 · 설계 H [A]#6)
 *   버튼 = `tx:` · `multi:` · `trade:` · `aitrade:` · `vest:` → 마지막에 알 수 없는 접두 안내
 * 답은 받은 채널로만(C-4) · 상태 키 `discord:<채널>:<사용자>` · DB `Transaction.userId` = `discord:<사용자>`(UQ-2).
 * 텔레그램 등록부가 정적 안내로 감싼 명령은 같은 안내로 감싼다 — 그 밖의 예외는 chat 의 실패 안내(본인 전용)로 간다.
 */

import { createRouter, type ButtonContext, type MessageContext, type Router } from '@pleiades/chat'
import {
  aiFallbackRoute,
  decideAiCommand,
  decideAiQuestion,
  decideAiTradeButton,
  decideReset,
  decideTradeParse,
} from '../commands/ai'
import { ALERT_CONFIG_RE, alertArgsFromTelegram, decideAlertConfig } from '../commands/alert'
import { ANALYSIS_RE, analysisArgsFromText, decideAnalysis } from '../commands/analysis'
import { BACKTEST_RE, backtestArgsFromText, decideBacktest } from '../commands/backtest'
import { BRIEFING_RE, briefingArgsFromText, decideBriefing } from '../commands/briefing'
import {
  BUDGET_SET_RE,
  BUDGET_STATUS_RE,
  EXPENSE_SUMMARY_RE,
  INCOME_SUMMARY_RE,
  decideBudgetSet,
  decideBudgetStatus,
  decideTransactionSummary,
} from '../commands/budget'
import {
  CUSTOM_STRATEGY_DELETE_RE,
  CUSTOM_STRATEGY_LIST_RE,
  CUSTOM_STRATEGY_REGISTER_RE,
  customStrategyDeleteArgsFromText,
  customStrategyRegisterArgsFromText,
  decideCustomStrategyDelete,
  decideCustomStrategyList,
  decideCustomStrategyRegister,
} from '../commands/custom-strategy'
import {
  INCOME_RE,
  decideExpenseButton,
  decideExpenseInput,
  decideMultiExpenseButton,
  expenseFallbackRoute,
} from '../commands/expense'
import {
  ASSET_ADD_RE,
  ASSET_LIST_RE,
  ASSET_UPDATE_RE,
  NET_WORTH_RE,
  assetAddArgsFromText,
  assetUpdateArgsFromText,
  decideAssetAdd,
  decideAssetList,
  decideAssetUpdate,
  decideNetWorth,
} from '../commands/networth'
import { ACCOUNT_DETAIL_RE, PORTFOLIO_SUMMARY_RE, decideAccountDetail, decidePortfolioSummary } from '../commands/portfolio'
import { FX_RATE_RE, PRICE_RE, decideFxRate, decidePrice } from '../commands/price'
import { REPORT_RE, decideReport, reportArgsFromText } from '../commands/report'
import { decideHelp, decideStart } from '../commands/start'
import { STRATEGY_LIST_RE, STRATEGY_RE, decideStrategy, decideStrategyList, strategyArgsFromText } from '../commands/strategy'
import { BUY_RE, SELL_RE, decideTrade, decideTradeButton, tradeArgsFromText } from '../commands/trade'
import {
  UNWATCH_RE,
  WATCHLIST_RE,
  WATCH_RE,
  decideUnwatch,
  decideWatch,
  decideWatchlist,
  unwatchArgsFromText,
  watchArgsFromText,
} from '../commands/watchlist'
import type { ButtonOutput, ButtonPress, ReplyOutput } from '../core/reply'
import { discordStateKey, type StateKey } from '../core/state-key'
import { notifierForDiscordChannel } from '../notifications/notifier'
import {
  DISCORD_COMMAND_PREFIX,
  discordButtonPress,
  discordButtonSession,
  discordOutput,
  discordRequester,
} from './reply'
import { UNKNOWN_BUTTON_TEXT, handleDiscordButton } from './vest-button'

/** 실패 안내의 AI 명령 표기 — 세션 브리핑 실패 안내(설계 D2 · N13). */
export const DISCORD_AI_COMMAND = `${DISCORD_COMMAND_PREFIX}ai`

const out = (ctx: MessageContext): ReplyOutput => discordOutput(ctx)
const stateKey = (ctx: MessageContext): StateKey => discordStateKey(ctx.channelId, ctx.userId)

/** 텔레그램 등록부와 같은 정적 안내 — 판단이 던지면 로그 1줄 + 안내(원문 노출 없음). */
function guarded(label: string, failText: string, task: (ctx: MessageContext) => Promise<void>) {
  return async (ctx: MessageContext): Promise<void> => {
    try {
      await task(ctx)
    } catch (error) {
      console.error(`[bot] ${label} 실패:`, error)
      await ctx.reply(failText)
    }
  }
}

const portfolioSummary = guarded('현황 조회', '⚠️ 포트폴리오 조회에 실패했습니다.', (c) => decidePortfolioSummary(out(c)))
const accountDetail = guarded('계좌 조회', '⚠️ 계좌 조회에 실패했습니다.', (c) => decideAccountDetail(c.text, out(c)))
const price = guarded('주가 조회', '⚠️ 주가 조회에 실패했습니다.', (c) => decidePrice(c.text, out(c)))
const fxRate = guarded('환율 조회', '⚠️ 환율 조회에 실패했습니다.', (c) => decideFxRate(out(c)))
const buy = guarded('매수', '⚠️ 매수 기록에 실패했습니다.', (c) =>
  decideTrade('BUY', tradeArgsFromText('BUY', c.text), out(c), discordRequester(c)),
)
const sell = guarded('매도', '⚠️ 매도 기록에 실패했습니다.', (c) =>
  decideTrade('SELL', tradeArgsFromText('SELL', c.text), out(c), discordRequester(c)),
)
const income = guarded('수입 입력', '⚠️ 수입 기록에 실패했습니다.', (c) => decideExpenseInput(c.text, out(c), discordRequester(c)))
const expenseSummary = guarded('소비 조회', '⚠️ 소비 조회에 실패했습니다.', (c) => decideTransactionSummary('expense', out(c)))
const incomeSummary = guarded('수입 조회', '⚠️ 수입 조회에 실패했습니다.', (c) => decideTransactionSummary('income', out(c)))
const budgetStatus = guarded('예산 조회', '⚠️ 예산 조회에 실패했습니다.', (c) => decideBudgetStatus(out(c)))
const budgetSet = guarded('예산 설정', '⚠️ 예산 설정에 실패했습니다.', (c) => decideBudgetSet(c.text, out(c)))
const alertConfig = (args: string) =>
  guarded('알림설정', '⚠️ 알림 설정에 실패했습니다.', (c) => decideAlertConfig(args, out(c)))
const expenseInput = guarded('소비 입력', '⚠️ 소비 기록에 실패했습니다.', (c) => decideExpenseInput(c.text, out(c), discordRequester(c)))

/** `/브리핑` 응답 대상 = 요청 채널(라우트 스위치를 타지 않는다 · 설계 D2). */
function briefing(ctx: MessageContext, args: string): Promise<void> {
  return decideBriefing(args, () => notifierForDiscordChannel(ctx.channelId), out(ctx), { aiCommand: DISCORD_AI_COMMAND })
}

/**
 * 자유 텍스트 — 텔레그램 두 fallback(소비 → AI)을 한 핸들러로, 같은 순서로.
 * 명령 모양(`!` · `/` 시작)은 소비·AI 로 보내지 않는다 — 등록되지 않은 `!foo 3` 이 숫자 때문에 소비 기록이 되지 않게.
 * AI 거래 파싱·AI 질문은 텔레그램처럼 기다리지 않는다(진행 안내 뒤 백그라운드 · 채널 대기열이 AI 를 기다리지 않는다 · 설계 Q).
 */
export async function handleDiscordText(ctx: MessageContext): Promise<void> {
  const text = ctx.text
  const isCommand = text.startsWith(DISCORD_COMMAND_PREFIX) || text.startsWith('/')
  if (expenseFallbackRoute(text, isCommand) === 'expense') {
    await expenseInput(ctx)
    return
  }
  const route = aiFallbackRoute(text, isCommand)
  if (route === 'trade') decideTradeParse(text, discordRequester(ctx), out(ctx))
  else if (route === 'question') decideAiQuestion(text, stateKey(ctx), out(ctx))
}

/** 버튼 판단 하나 — 판단이 끝나면 모아 둔 토스트를 처리한다(본문을 바꾸지 않은 결정만 본인 안내). 예외는 chat 의 실패 안내로. */
function button(decide: (data: string, press: ButtonPress, out: ButtonOutput) => Promise<void>) {
  return async (ctx: ButtonContext): Promise<void> => {
    const session = discordButtonSession(ctx)
    await decide(ctx.action, discordButtonPress(ctx), session.out)
    await session.finish()
  }
}

/** fin Discord 라우터 — 메시지(영어 명령 · 한글 명령 · 자유 텍스트)와 버튼. */
export function createDiscordRouter(): Router {
  return (
    createRouter({ commandPrefix: DISCORD_COMMAND_PREFIX })
      // 영어 이름 21 — 텔레그램 등록 순
      .command('start', (c) => decideStart(undefined, out(c)))
      .command('help', (c) => decideHelp(out(c)))
      .command('ai', (c, args) => decideAiCommand(args, stateKey(c), out(c)))
      .command('reset', (c) => decideReset(stateKey(c), out(c)))
      .command('alertconfig', (c, args) => alertConfig(args)(c))
      .command('strategy', (c, args) => decideStrategy(args, out(c)))
      .command('strategylist', (c) => decideStrategyList(out(c)))
      .command('customstrategy', (c, args) => decideCustomStrategyRegister(args, out(c)))
      .command('customstrategylist', (c) => decideCustomStrategyList(out(c)))
      .command('customstrategydelete', (c, args) => decideCustomStrategyDelete(args, out(c)))
      .command('watch', (c, args) => decideWatch(args, out(c)))
      .command('unwatch', (c, args) => decideUnwatch(args, out(c)))
      .command('watchlist', (c) => decideWatchlist(out(c)))
      .command('analysis', (c, args) => decideAnalysis(args, out(c)))
      .command('briefing', (c, args) => briefing(c, args))
      .command('networth', (c) => decideNetWorth(out(c)))
      .command('assetlist', (c) => decideAssetList(out(c)))
      .command('assetadd', (c, args) => decideAssetAdd(args, out(c)))
      .command('assetupdate', (c, args) => decideAssetUpdate(args, out(c)))
      .command('report', (c, args) => decideReport(args, out(c)))
      .command('backtest', (c, args) => decideBacktest(args, out(c)))
      // 한글 28 — 텔레그램 등록 순(`bot/index.ts` 모듈 순서)
      .hears(PORTFOLIO_SUMMARY_RE, portfolioSummary)
      .hears(ACCOUNT_DETAIL_RE, accountDetail)
      .hears(PRICE_RE, price)
      .hears(FX_RATE_RE, fxRate)
      .hears(BUY_RE, buy)
      .hears(SELL_RE, sell)
      .hears(INCOME_RE, income)
      .hears(EXPENSE_SUMMARY_RE, expenseSummary)
      .hears(INCOME_SUMMARY_RE, incomeSummary)
      .hears(BUDGET_STATUS_RE, budgetStatus)
      .hears(BUDGET_SET_RE, budgetSet)
      .hears(ALERT_CONFIG_RE, (c) => alertConfig(alertArgsFromTelegram(undefined, c.text))(c))
      .hears(STRATEGY_RE, (c) => decideStrategy(strategyArgsFromText(c.text), out(c)))
      .hears(STRATEGY_LIST_RE, (c) => decideStrategyList(out(c)))
      .hears(CUSTOM_STRATEGY_REGISTER_RE, (c) => decideCustomStrategyRegister(customStrategyRegisterArgsFromText(c.text), out(c)))
      .hears(CUSTOM_STRATEGY_LIST_RE, (c) => decideCustomStrategyList(out(c)))
      .hears(CUSTOM_STRATEGY_DELETE_RE, (c) => decideCustomStrategyDelete(customStrategyDeleteArgsFromText(c.text), out(c)))
      .hears(WATCH_RE, (c) => decideWatch(watchArgsFromText(c.text), out(c)))
      .hears(UNWATCH_RE, (c) => decideUnwatch(unwatchArgsFromText(c.text), out(c)))
      .hears(WATCHLIST_RE, (c) => decideWatchlist(out(c)))
      .hears(ANALYSIS_RE, (c) => decideAnalysis(analysisArgsFromText(c.text), out(c)))
      .hears(BRIEFING_RE, (c) => briefing(c, briefingArgsFromText(c.text)))
      .hears(NET_WORTH_RE, (c) => decideNetWorth(out(c)))
      .hears(ASSET_LIST_RE, (c) => decideAssetList(out(c)))
      .hears(ASSET_ADD_RE, (c) => decideAssetAdd(assetAddArgsFromText(c.text), out(c)))
      .hears(ASSET_UPDATE_RE, (c) => decideAssetUpdate(assetUpdateArgsFromText(c.text), out(c)))
      .hears(REPORT_RE, (c) => decideReport(reportArgsFromText(c.text), out(c)))
      .hears(BACKTEST_RE, (c) => decideBacktest(backtestArgsFromText(c.text), out(c)))
      .fallback(handleDiscordText)
      // 버튼 — 텔레그램 콜백 접두 그대로
      .action('trade:', button(decideTradeButton))
      .action('tx:', button(decideExpenseButton))
      .action('multi:', button(decideMultiExpenseButton))
      .action('aitrade:', button(decideAiTradeButton))
      .action('vest:', (c) => handleDiscordButton(c))
      // 마지막 — 알 수 없는 접두도 처리됨으로(chat 의 실패 안내가 나가지 않게 · D-1 과 같은 결과)
      .action(/^/, (c) => c.notice(UNKNOWN_BUTTON_TEXT))
  )
}
