/**
 * 반복 거래 유틸리티: 검증 + nextRunAt 계산
 */

export type Frequency = 'monthly' | 'weekly' | 'yearly'

export interface RecurringValidationError {
  field: string
  message: string
}

export function validateRecurringInput(body: Record<string, unknown>): RecurringValidationError[] {
  const errors: RecurringValidationError[] = []

  if (body.amount === undefined || body.amount === null) {
    errors.push({ field: 'amount', message: '금액을 입력해주세요.' })
  } else if (typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount <= 0) {
    errors.push({ field: 'amount', message: '금액은 1 이상의 정수여야 합니다.' })
  } else if (body.amount > 2_147_483_647) {
    errors.push({ field: 'amount', message: '금액이 허용 범위를 초과했습니다.' })
  }

  if (!body.description || typeof body.description !== 'string' || !body.description.trim()) {
    errors.push({ field: 'description', message: '내용을 입력해주세요.' })
  } else if (body.description.trim().length > 200) {
    errors.push({ field: 'description', message: '내용은 200자 이내로 입력해주세요.' })
  }

  if (!body.categoryId || typeof body.categoryId !== 'string') {
    errors.push({ field: 'categoryId', message: '카테고리를 선택해주세요.' })
  }

  const validFrequencies = ['monthly', 'weekly', 'yearly']
  if (!body.frequency || typeof body.frequency !== 'string' || !validFrequencies.includes(body.frequency)) {
    errors.push({ field: 'frequency', message: '주기를 선택해주세요. (monthly, weekly, yearly)' })
  } else {
    const freq = body.frequency as Frequency
    if (freq === 'monthly') {
      if (typeof body.dayOfMonth !== 'number' || !Number.isInteger(body.dayOfMonth) || body.dayOfMonth < 1 || body.dayOfMonth > 31) {
        errors.push({ field: 'dayOfMonth', message: '실행일을 선택해주세요. (1~31)' })
      }
    } else if (freq === 'weekly') {
      if (typeof body.dayOfWeek !== 'number' || !Number.isInteger(body.dayOfWeek) || body.dayOfWeek < 0 || body.dayOfWeek > 6) {
        errors.push({ field: 'dayOfWeek', message: '요일을 선택해주세요. (0=일~6=토)' })
      }
    } else if (freq === 'yearly') {
      if (typeof body.monthOfYear !== 'number' || !Number.isInteger(body.monthOfYear) || body.monthOfYear < 1 || body.monthOfYear > 12) {
        errors.push({ field: 'monthOfYear', message: '월을 선택해주세요. (1~12)' })
      }
      if (typeof body.dayOfMonth !== 'number' || !Number.isInteger(body.dayOfMonth) || body.dayOfMonth < 1 || body.dayOfMonth > 31) {
        errors.push({ field: 'dayOfMonth', message: '일을 선택해주세요. (1~31)' })
      }
    }
  }

  if (body.nextRunAt !== undefined && body.nextRunAt !== null) {
    if (typeof body.nextRunAt !== 'string' || isNaN(new Date(body.nextRunAt).getTime())) {
      errors.push({ field: 'nextRunAt', message: '유효한 시작일을 입력해주세요.' })
    }
  }

  return errors
}

/** UTC Date를 KST로 변환 (UTC+9) */
function toKST(d: Date): Date {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000)
}

/** 해당 날짜의 UTC 정오(12:00)로 생성 — 어느 타임존에서든 같은 날짜 */
function kstMidnightToUTC(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 0, 0, 0))
}

/**
 * 현재 nextRunAt 기준으로 다음 실행일을 계산한다.
 */
export function calculateNextRunAt(
  frequency: Frequency,
  current: Date,
  dayOfMonth?: number | null,
  dayOfWeek?: number | null,
  monthOfYear?: number | null,
): Date {
  const d = new Date(current)

  switch (frequency) {
    case 'monthly': {
      // KST 기준으로 연/월 결정 후 날짜 보정
      const kst = toKST(current)
      let nextYear = kst.getUTCFullYear()
      let nextMonth = kst.getUTCMonth() + 1
      if (nextMonth > 11) { nextMonth = 0; nextYear++ }
      const day = dayOfMonth ?? kst.getUTCDate()
      const lastDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate()
      return kstMidnightToUTC(nextYear, nextMonth, Math.min(day, lastDay))
    }
    case 'weekly': {
      // 다음 주 같은 요일로 이동 (dayOfWeek 기준)
      if (dayOfWeek !== null && dayOfWeek !== undefined) {
        const currentDay = d.getUTCDay() // 0=일~6=토
        let daysToAdd = dayOfWeek - currentDay
        if (daysToAdd <= 0) daysToAdd += 7
        d.setUTCDate(d.getUTCDate() + daysToAdd)
      } else {
        d.setUTCDate(d.getUTCDate() + 7)
      }
      return d
    }
    case 'yearly': {
      const kst = toKST(current)
      const nextYear = kst.getUTCFullYear() + 1
      const month = monthOfYear ? monthOfYear - 1 : kst.getUTCMonth()
      const day = dayOfMonth ?? kst.getUTCDate()
      const lastDay = new Date(Date.UTC(nextYear, month + 1, 0)).getUTCDate()
      return kstMidnightToUTC(nextYear, month, Math.min(day, lastDay))
    }
  }

  return d
}

/**
 * 주기 표시 텍스트 생성
 */
export function formatFrequency(
  frequency: string,
  dayOfMonth?: number | null,
  dayOfWeek?: number | null,
  monthOfYear?: number | null,
): string {
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']

  switch (frequency) {
    case 'monthly':
      return dayOfMonth ? `매월 ${dayOfMonth}일` : '매월'
    case 'weekly':
      return dayOfWeek !== null && dayOfWeek !== undefined ? `매주 ${dayNames[dayOfWeek]}요일` : '매주'
    case 'yearly':
      return monthOfYear && dayOfMonth ? `매년 ${monthOfYear}월 ${dayOfMonth}일` : '매년'
    default:
      return frequency
  }
}
