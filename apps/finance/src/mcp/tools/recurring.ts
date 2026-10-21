import { prisma } from '@/lib/prisma'
import { toolResult, toolError, formatMoney } from '../utils'

const VALID_FREQUENCIES = ['monthly', 'weekly', 'yearly'] as const
type Frequency = typeof VALID_FREQUENCIES[number]

function parseDateStrict(str: string): Date | null {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, y, m, d] = match.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date
}

async function resolveCategory(name: string) {
  const candidates = await prisma.category.findMany({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true, type: true },
  })
  if (candidates.length === 0) return { error: `'${name}' 카테고리를 찾을 수 없습니다.` }
  if (candidates.length === 1) return { category: candidates[0] }
  const exact = candidates.filter((c) => c.name === name)
  if (exact.length !== 1) {
    return { error: `여러 카테고리가 매칭됩니다. 정확한 이름을 지정해주세요.` }
  }
  return { category: exact[0] }
}

/** 주기별 필수 필드 검증 */
function validateFrequencyFields(
  frequency: Frequency,
  dayOfMonth: number | null | undefined,
  dayOfWeek: number | null | undefined,
  monthOfYear: number | null | undefined,
): string | null {
  if (frequency === 'monthly') {
    if (dayOfMonth == null || dayOfMonth < 1 || dayOfMonth > 31) {
      return '매월 주기는 dayOfMonth(1~31)가 필요합니다.'
    }
  } else if (frequency === 'weekly') {
    if (dayOfWeek == null || dayOfWeek < 0 || dayOfWeek > 6) {
      return '매주 주기는 dayOfWeek(0=일~6=토)가 필요합니다.'
    }
  } else if (frequency === 'yearly') {
    if (monthOfYear == null || monthOfYear < 1 || monthOfYear > 12) {
      return '매년 주기는 monthOfYear(1~12)가 필요합니다.'
    }
    if (dayOfMonth == null || dayOfMonth < 1 || dayOfMonth > 31) {
      return '매년 주기는 dayOfMonth(1~31)가 필요합니다.'
    }
  }
  return null
}

/**
 * nextRunAt이 주기/실행일 필드와 정합적인지 검증.
 * - monthly: nextRunAt.day === dayOfMonth (또는 해당 월 말일로 clamp된 경우 허용)
 * - weekly: nextRunAt.dayOfWeek === dayOfWeek
 * - yearly: nextRunAt.month === monthOfYear && day === dayOfMonth (말일 clamp 허용)
 */
function validateNextRunAtConsistency(
  frequency: Frequency,
  nextRunAt: Date,
  dayOfMonth: number | null | undefined,
  dayOfWeek: number | null | undefined,
  monthOfYear: number | null | undefined,
): string | null {
  const nextYear = nextRunAt.getUTCFullYear()
  const nextMonth = nextRunAt.getUTCMonth() + 1
  const nextDay = nextRunAt.getUTCDate()
  const nextDayOfWeek = nextRunAt.getUTCDay()

  if (frequency === 'monthly' && dayOfMonth != null) {
    const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate()
    const expected = Math.min(dayOfMonth, lastDay)
    if (nextDay !== expected) {
      return `nextRunAt(${nextDay}일)이 dayOfMonth(${dayOfMonth})와 일치하지 않습니다.`
    }
  }
  if (frequency === 'weekly' && dayOfWeek != null) {
    if (nextDayOfWeek !== dayOfWeek) {
      return `nextRunAt의 요일(${nextDayOfWeek})이 dayOfWeek(${dayOfWeek})와 일치하지 않습니다.`
    }
  }
  if (frequency === 'yearly' && monthOfYear != null && dayOfMonth != null) {
    if (nextMonth !== monthOfYear) {
      return `nextRunAt의 월(${nextMonth})이 monthOfYear(${monthOfYear})와 일치하지 않습니다.`
    }
    const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate()
    const expected = Math.min(dayOfMonth, lastDay)
    if (nextDay !== expected) {
      return `nextRunAt의 일(${nextDay})이 dayOfMonth(${dayOfMonth})와 일치하지 않습니다.`
    }
  }
  return null
}

/**
 * list_recurring_transactions: 반복 거래 목록
 */
export async function listRecurringTransactions() {
  try {
    const items = await prisma.recurringTransaction.findMany({
      include: { category: { select: { name: true, icon: true } } },
      orderBy: { createdAt: 'desc' },
    })

    if (items.length === 0) return toolResult('반복 거래가 없습니다.')

    const lines = [`## 반복 거래 목록 (${items.length}개)\n`]
    for (const r of items) {
      const icon = r.category.icon ? `${r.category.icon} ` : ''
      const freqLabel = r.frequency === 'monthly' ? '매월' : r.frequency === 'weekly' ? '매주' : '매년'
      const status = r.isActive ? '✅' : '⏸'
      lines.push(`${status} ${icon}${r.category.name} | ${r.description} | ${formatMoney(r.amount, 'KRW')} (${freqLabel}, 다음: ${r.nextRunAt.toISOString().slice(0, 10)}) [id: ${r.id}]`)
    }
    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}

/**
 * create_recurring_transaction: 반복 거래 신규
 */
export async function createRecurringTransaction(args: {
  amount: number
  description: string
  categoryName: string
  frequency: string
  dayOfMonth?: number
  dayOfWeek?: number
  monthOfYear?: number
  nextRunAt: string
}) {
  try {
    if (!args.description?.trim()) return toolError('내용을 입력해주세요.')
    if (!Number.isFinite(args.amount) || args.amount <= 0) return toolError('금액은 0보다 커야 합니다.')
    if (!VALID_FREQUENCIES.includes(args.frequency as Frequency)) {
      return toolError(`주기: ${VALID_FREQUENCIES.join(', ')}`)
    }
    const frequency = args.frequency as Frequency

    const nextRunAt = parseDateStrict(args.nextRunAt)
    if (!nextRunAt) return toolError('nextRunAt은 YYYY-MM-DD 형식이어야 합니다.')

    const fieldError = validateFrequencyFields(frequency, args.dayOfMonth, args.dayOfWeek, args.monthOfYear)
    if (fieldError) return toolError(fieldError)

    const consistencyError = validateNextRunAtConsistency(
      frequency, nextRunAt, args.dayOfMonth, args.dayOfWeek, args.monthOfYear,
    )
    if (consistencyError) return toolError(consistencyError)

    const result = await resolveCategory(args.categoryName)
    if ('error' in result) return toolError(result.error)

    const created = await prisma.recurringTransaction.create({
      data: {
        amount: Math.round(args.amount),
        description: args.description.trim(),
        categoryId: result.category.id,
        frequency,
        dayOfMonth: args.dayOfMonth ?? null,
        dayOfWeek: args.dayOfWeek ?? null,
        monthOfYear: args.monthOfYear ?? null,
        nextRunAt,
      },
    })

    return toolResult(
      `✅ 반복 거래 생성: ${result.category.name} | ${created.description} | ${formatMoney(created.amount, 'KRW')}\n` +
      `- 주기: ${created.frequency} / 다음 실행: ${created.nextRunAt.toISOString().slice(0, 10)}\n` +
      `- ID: ${created.id}`
    )
  } catch (error) {
    return toolError(error)
  }
}

/**
 * update_recurring_transaction: ID 기반 부분 수정
 * frequency / 실행일 필드 변경 시 주기별 필수 필드와 nextRunAt 정합성 재검증
 */
export async function updateRecurringTransaction(args: {
  id: string
  amount?: number
  description?: string
  categoryName?: string
  isActive?: boolean
  frequency?: string
  dayOfMonth?: number | null
  dayOfWeek?: number | null
  monthOfYear?: number | null
  nextRunAt?: string
}) {
  try {
    const existing = await prisma.recurringTransaction.findUnique({ where: { id: args.id } })
    if (!existing) return toolError(`반복 거래를 찾을 수 없습니다: ${args.id}`)

    const data: Record<string, unknown> = {}
    if (args.amount !== undefined) {
      if (!Number.isFinite(args.amount) || args.amount <= 0) return toolError('금액은 0보다 커야 합니다.')
      data.amount = Math.round(args.amount)
    }
    if (args.description !== undefined) {
      if (!args.description.trim()) return toolError('내용이 비어있습니다.')
      data.description = args.description.trim()
    }
    if (args.categoryName !== undefined) {
      const result = await resolveCategory(args.categoryName)
      if ('error' in result) return toolError(result.error)
      data.categoryId = result.category.id
    }
    if (args.isActive !== undefined) data.isActive = args.isActive

    // 주기/실행일 필드 병합 (요청값 우선, 미지정 시 기존값)
    const touchedFrequencyFields =
      args.frequency !== undefined ||
      args.dayOfMonth !== undefined ||
      args.dayOfWeek !== undefined ||
      args.monthOfYear !== undefined ||
      args.nextRunAt !== undefined

    if (args.frequency !== undefined) {
      if (!VALID_FREQUENCIES.includes(args.frequency as Frequency)) {
        return toolError(`주기: ${VALID_FREQUENCIES.join(', ')}`)
      }
      data.frequency = args.frequency
    }
    if (args.dayOfMonth !== undefined) data.dayOfMonth = args.dayOfMonth
    if (args.dayOfWeek !== undefined) data.dayOfWeek = args.dayOfWeek
    if (args.monthOfYear !== undefined) data.monthOfYear = args.monthOfYear

    let nextRunAtDate: Date | null = null
    if (args.nextRunAt !== undefined) {
      const parsed = parseDateStrict(args.nextRunAt)
      if (!parsed) return toolError('nextRunAt은 YYYY-MM-DD 형식이어야 합니다.')
      nextRunAtDate = parsed
      data.nextRunAt = parsed
    }

    if (touchedFrequencyFields) {
      const mergedFrequency = (data.frequency ?? existing.frequency) as Frequency
      const mergedDayOfMonth = args.dayOfMonth !== undefined ? args.dayOfMonth : existing.dayOfMonth
      const mergedDayOfWeek = args.dayOfWeek !== undefined ? args.dayOfWeek : existing.dayOfWeek
      const mergedMonthOfYear = args.monthOfYear !== undefined ? args.monthOfYear : existing.monthOfYear
      const mergedNextRunAt = nextRunAtDate ?? existing.nextRunAt

      // frequency 전환 시 불필요 필드는 입력값과 무관하게 강제 null (데이터 일관성)
      if (args.frequency !== undefined && args.frequency !== existing.frequency) {
        if (mergedFrequency === 'monthly') {
          data.dayOfWeek = null
          data.monthOfYear = null
        } else if (mergedFrequency === 'weekly') {
          data.dayOfMonth = null
          data.monthOfYear = null
        } else if (mergedFrequency === 'yearly') {
          data.dayOfWeek = null
        }
      }

      const effectiveDayOfMonth = data.dayOfMonth !== undefined ? (data.dayOfMonth as number | null) : mergedDayOfMonth
      const effectiveDayOfWeek = data.dayOfWeek !== undefined ? (data.dayOfWeek as number | null) : mergedDayOfWeek
      const effectiveMonthOfYear = data.monthOfYear !== undefined ? (data.monthOfYear as number | null) : mergedMonthOfYear

      const fieldError = validateFrequencyFields(
        mergedFrequency, effectiveDayOfMonth, effectiveDayOfWeek, effectiveMonthOfYear,
      )
      if (fieldError) return toolError(fieldError)

      const consistencyError = validateNextRunAtConsistency(
        mergedFrequency, mergedNextRunAt, effectiveDayOfMonth, effectiveDayOfWeek, effectiveMonthOfYear,
      )
      if (consistencyError) return toolError(consistencyError)
    }

    if (Object.keys(data).length === 0) return toolError('변경할 필드가 없습니다.')

    const updated = await prisma.recurringTransaction.update({
      where: { id: args.id },
      data,
      include: { category: { select: { name: true } } },
    })

    return toolResult(
      `✅ 반복 거래 수정: ${updated.category.name} | ${updated.description} | ${formatMoney(updated.amount, 'KRW')}\n` +
      `- ${updated.isActive ? '활성' : '비활성'} / 주기: ${updated.frequency} / 다음 실행: ${updated.nextRunAt.toISOString().slice(0, 10)}`
    )
  } catch (error) {
    return toolError(error)
  }
}

/**
 * delete_recurring_transaction: 삭제
 */
export async function deleteRecurringTransaction(args: { id: string }) {
  try {
    const existing = await prisma.recurringTransaction.findUnique({
      where: { id: args.id },
      include: { category: { select: { name: true } } },
    })
    if (!existing) return toolError(`반복 거래를 찾을 수 없습니다: ${args.id}`)

    await prisma.recurringTransaction.delete({ where: { id: args.id } })
    return toolResult(`🗑️ 반복 거래 삭제: ${existing.category.name} | ${existing.description}`)
  } catch (error) {
    return toolError(error)
  }
}
