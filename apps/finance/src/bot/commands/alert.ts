import type { Bot, Context } from 'grammy'
import { prisma } from '@/lib/prisma'
import { isToggleKey } from '@/lib/alert-config/categories'
import { escapeHtml, h } from '../utils/telegram'
import { plainReply, type ReplyOutput } from '../core/reply'
import { telegramOutput } from '../utils/telegram-reply'

/*
 * pleiades 009 D-3 PR-2b (pleiades#394 · 설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 A2 · H2): 알림설정.
 * 판단(decideAlertConfig)은 인자와 중립 응답 모델만 안다 · 텔레그램 인자 추출은 `alertArgsFromTelegram`(지금 식 그대로).
 * 특성 테스트 `__tests__/special-telegram.test.ts` 가 텔레그램 호출열을 고정한다.
 */

export const ALERT_CONFIG_RE = /^알림설정(?:\s+.*)?$/

/**
 * 텔레그램 → 인자 — `/alertconfig` 명령의 `ctx.match`(명령 뒤 문자열)를 쓰고, 그 밖에는 원문에서 벗긴다.
 * pleiades 009 D-3 PR-2c (pleiades#396 · UQ-3): `hears` 의 `ctx.match` 는 정규식 매치 배열이라 예전에는 `"알림설정 급락 -3"`
 * 원문 전체가 인자가 됐다(항목 = "알림설정" · `알림설정` 만 치면 현황 대신 인자 부족 — 로컬 실측 `measured-facts.md` 2026-10-30).
 */
export function alertArgsFromTelegram(match: string | RegExpMatchArray | null | undefined, text: string): string {
  if (typeof match === 'string' && match.trim()) return match.trim()
  return text.replace(/^(\/alertconfig|알림설정)\s*/, '').trim()
}

/** 키 → 사용자 친화적 별칭 매핑 */
const KEY_ALIASES: Record<string, string> = {
  '급락': 'price_drop_pct',
  '급등': 'price_surge_pct',
  '환율': 'fx_change_krw',
  '예산': 'budget_warn_pct',
  '요약시각': 'daily_summary_hour',
  '리포트일': 'monthly_report_day',
  '모니터링주기': 'ta_check_interval_min',
  '능동리뷰': 'active_review',
  'TA가이드': 'ta_ai_guide',
  '전략알림': 'custom_strategy_alerts',
  '관심종목시간대': 'watchlist_market_hours_only',
}

/** 값 형식 검증 — 키별로 허용 값 규칙이 다름 */
function isValidValue(key: string, value: string): boolean {
  if (isToggleKey(key)) {
    const v = value.toLowerCase()
    return v === 'on' || v === 'off'
  }
  return /^-?\d+(\.\d+)?$/.test(value)
}

export function registerAlertCommands(bot: Bot): void {
  // 텔레그램 커맨드는 영문만 지원하므로 /alertconfig + 한글 "알림설정" 모두 매칭
  bot.command('alertconfig', handler)
  bot.hears(ALERT_CONFIG_RE, handler)
}

async function handler(ctx: Context) {
  try {
    await decideAlertConfig(alertArgsFromTelegram(ctx.match, ctx.message?.text ?? ''), telegramOutput(ctx))
  } catch (error) {
    console.error('[bot] 알림설정 실패:', error)
    await ctx.reply('⚠️ 알림 설정에 실패했습니다.')
  }
}

/** `알림설정` 판단 — 인자 없음 = 현황 · `[항목] [값]` = 변경. */
export async function decideAlertConfig(args: string, out: ReplyOutput): Promise<void> {
  // 인자 없음 → 현재 설정 조회
  if (!args) {
    const configs = await prisma.alertConfig.findMany({
      orderBy: { key: 'asc' },
    })

    if (configs.length === 0) {
      await out.reply(plainReply('⚠️ 알림 설정이 없습니다. 시드를 실행해주세요.'))
      return
    }

    const lines = [`⚙️ ${h.b('알림 설정 현황')}\n`]
    for (const cfg of configs) {
      const alias = Object.entries(KEY_ALIASES)
        .find(([, v]) => v === cfg.key)?.[0] ?? cfg.key
      lines.push(`- ${escapeHtml(cfg.label)}: ${h.b(escapeHtml(cfg.value))} (/${escapeHtml(alias)})`)
    }
    lines.push('\n변경: /알림설정 [항목] [값]')
    lines.push('예: /알림설정 급락 -3')
    lines.push(`사용 가능: ${Object.keys(KEY_ALIASES).join(', ')}`)

    await out.replyLong(lines.join('\n'))
    return
  }

  // 인자 파싱: /알림설정 급락 -3
  const parts = args.split(/\s+/)
  if (parts.length < 2) {
    await out.reply(plainReply(
      '⚠️ 사용법: /알림설정 [항목] [값]\n' +
      '예: /알림설정 급락 -3\n' +
      `사용 가능: ${Object.keys(KEY_ALIASES).join(', ')}`
    ))
    return
  }

  const alias = parts[0]
  const value = parts[1]
  const key = KEY_ALIASES[alias]

  if (!key) {
    await out.reply(plainReply(
      `⚠️ 알 수 없는 항목: ${alias}\n` +
      `사용 가능: ${Object.keys(KEY_ALIASES).join(', ')}`
    ))
    return
  }

  if (!isValidValue(key, value)) {
    const hint = isToggleKey(key) ? 'on / off' : '숫자'
    await out.reply(plainReply(`⚠️ 값 형식 오류 — ${hint} 만 허용됩니다: ${value}`))
    return
  }
  // 토글은 소문자 정규화
  const normalizedValue = isToggleKey(key) ? value.toLowerCase() : value

  const existing = await prisma.alertConfig.findUnique({ where: { key } })
  if (!existing) {
    await out.reply(plainReply(`⚠️ 설정이 존재하지 않습니다: ${key}`))
    return
  }

  const updated = await prisma.alertConfig.update({
    where: { key },
    data: { value: normalizedValue },
  })

  await out.replyLong(
    `✅ ${h.b(escapeHtml(updated.label))} 변경 완료\n` +
    `이전: ${escapeHtml(existing.value)} → 변경: ${h.b(escapeHtml(updated.value))}`
  )
}
