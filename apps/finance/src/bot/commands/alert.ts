import { Bot, Context } from 'grammy'
import { prisma } from '@/lib/prisma'

/** 키 → 사용자 친화적 별칭 매핑 */
const KEY_ALIASES: Record<string, string> = {
  '급락': 'price_drop_pct',
  '급등': 'price_surge_pct',
  '환율': 'fx_change_krw',
  '예산': 'budget_warn_pct',
  '요약시각': 'daily_summary_hour',
  '리포트일': 'monthly_report_day',
}

/** 값 형식 검증 (숫자만 허용) */
function isValidValue(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value)
}

export function registerAlertCommands(bot: Bot): void {
  // 텔레그램 커맨드는 영문만 지원하므로 /alertconfig + 한글 "알림설정" 모두 매칭
  bot.command('alertconfig', handler)
  bot.hears(/^알림설정(?:\s+.*)?$/, handler)
}

async function handler(ctx: Context) {
  try {
    const text = ctx.message?.text ?? ''
    // /alertconfig args 또는 알림설정 args
    const args = (ctx.match?.toString().trim()) || text.replace(/^(\/alertconfig|알림설정)\s*/, '').trim()

      // 인자 없음 → 현재 설정 조회
      if (!args) {
        const configs = await prisma.alertConfig.findMany({
          orderBy: { key: 'asc' },
        })

        if (configs.length === 0) {
          await ctx.reply('⚠️ 알림 설정이 없습니다. 시드를 실행해주세요.')
          return
        }

        const lines = ['⚙️ 알림 설정 현황\n']
        for (const cfg of configs) {
          const alias = Object.entries(KEY_ALIASES)
            .find(([, v]) => v === cfg.key)?.[0] ?? cfg.key
          lines.push(`- ${cfg.label}: ${cfg.value} (/${alias})`)
        }
        lines.push('\n변경: /알림설정 [항목] [값]')
        lines.push('예: /알림설정 급락 -3')
        lines.push(`사용 가능: ${Object.keys(KEY_ALIASES).join(', ')}`)

        await ctx.reply(lines.join('\n'))
        return
      }

      // 인자 파싱: /알림설정 급락 -3
      const parts = args.split(/\s+/)
      if (parts.length < 2) {
        await ctx.reply(
          '⚠️ 사용법: /알림설정 [항목] [값]\n' +
          '예: /알림설정 급락 -3\n' +
          `사용 가능: ${Object.keys(KEY_ALIASES).join(', ')}`
        )
        return
      }

      const alias = parts[0]
      const value = parts[1]
      const key = KEY_ALIASES[alias]

      if (!key) {
        await ctx.reply(
          `⚠️ 알 수 없는 항목: ${alias}\n` +
          `사용 가능: ${Object.keys(KEY_ALIASES).join(', ')}`
        )
        return
      }

      if (!isValidValue(value)) {
        await ctx.reply(`⚠️ 값은 숫자여야 합니다: ${value}`)
        return
      }

      const existing = await prisma.alertConfig.findUnique({ where: { key } })
      if (!existing) {
        await ctx.reply(`⚠️ 설정이 존재하지 않습니다: ${key}`)
        return
      }

      const updated = await prisma.alertConfig.update({
        where: { key },
        data: { value },
      })

      await ctx.reply(
        `✅ ${updated.label} 변경 완료\n` +
        `이전: ${existing.value} → 변경: ${updated.value}`
      )
    } catch (error) {
      console.error('[bot] 알림설정 실패:', error)
      await ctx.reply('⚠️ 알림 설정에 실패했습니다.')
    }
}
