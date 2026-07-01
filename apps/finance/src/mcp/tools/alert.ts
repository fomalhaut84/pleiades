import { prisma } from '@/lib/prisma'
import { toolResult, toolError } from '../utils'

/**
 * list_alert_configs: 알림 설정 현황
 */
export async function listAlertConfigs() {
  try {
    const configs = await prisma.alertConfig.findMany({ orderBy: { key: 'asc' } })
    if (configs.length === 0) return toolResult('알림 설정이 없습니다.')

    const lines = ['## 알림 설정\n']
    for (const c of configs) {
      lines.push(`- ${c.label} (\`${c.key}\`): ${c.value}`)
    }
    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}

/** on/off 문자열만 받는 키 (다른 키는 숫자) */
const ON_OFF_KEYS = new Set(['active_review'])

/**
 * update_alert_config: 기존 키의 값 변경 (신규 키 생성 금지)
 */
export async function updateAlertConfig(args: { key: string; value: string }) {
  try {
    if (!args.key?.trim()) return toolError('key가 필요합니다.')
    if (args.value == null || args.value === '') return toolError('value가 필요합니다.')

    const existing = await prisma.alertConfig.findUnique({ where: { key: args.key } })
    if (!existing) return toolError(`알림 설정 키를 찾을 수 없습니다: ${args.key}`)

    // 값 형식 검증 — 키별 규칙
    const trimmed = args.value.trim()
    let finalValue: string
    if (ON_OFF_KEYS.has(args.key)) {
      const v = trimmed.toLowerCase()
      if (v !== 'on' && v !== 'off') return toolError(`${args.key} 는 on 또는 off 만 허용됩니다.`)
      finalValue = v
    } else {
      // 숫자 값 (기존 키들)
      if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return toolError('value는 숫자여야 합니다.')
      const numValue = Number(trimmed)
      if (!Number.isFinite(numValue)) return toolError('value는 숫자여야 합니다.')
      finalValue = trimmed
    }

    const updated = await prisma.alertConfig.update({
      where: { key: args.key },
      data: { value: finalValue },
    })

    return toolResult(`✅ 알림 설정 변경: ${updated.label} → ${updated.value}`)
  } catch (error) {
    return toolError(error)
  }
}
