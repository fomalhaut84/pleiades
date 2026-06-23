import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ok, fail, noContent } from '@/lib/api-response'

function parseStrictDate(str: string): Date | null {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const [, y, m, d] = match.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null
  }
  return date
}

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params

    const existing = await prisma.asset.findUnique({ where: { id } })
    if (!existing) {
      return fail('자산을 찾을 수 없습니다.', 404)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return fail('잘못된 요청 형식입니다.', 400)
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return fail('잘못된 요청 형식입니다.', 400)
    }

    const { name, value, note, interestRate, maturityDate, owner, category, isLiability } =
      body as Record<string, unknown>

    const VALID_CATEGORIES = ['savings', 'insurance', 'real_estate', 'pension', 'loan', 'cash', 'other']

    const data: Record<string, unknown> = {}
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return fail('유효한 자산명을 입력해주세요.', 400)
      }
      data.name = name.trim()
    }
    if (owner !== undefined) {
      if (typeof owner !== 'string' || !owner.trim()) {
        return fail('유효한 소유자를 입력해주세요.', 400)
      }
      data.owner = owner.trim()
    }
    if (category !== undefined && typeof category === 'string') {
      if (!VALID_CATEGORIES.includes(category)) {
        return fail(`유효한 카테고리: ${VALID_CATEGORIES.join(', ')}`, 400)
      }
      data.category = category
    }
    if (isLiability !== undefined) {
      if (typeof isLiability !== 'boolean') {
        return fail('isLiability는 boolean이어야 합니다.', 400)
      }
      data.isLiability = isLiability
    }
    if (value !== undefined) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return fail('유효한 금액을 입력해주세요.', 400)
      }
      data.value = Math.round(value)
    }
    if (note !== undefined) data.note = typeof note === 'string' ? note.trim() || null : null
    if (interestRate !== undefined) {
      if (interestRate === null) {
        data.interestRate = null
      } else if (typeof interestRate === 'number' && Number.isFinite(interestRate)) {
        data.interestRate = interestRate
      } else {
        return fail('이율은 숫자여야 합니다.', 400)
      }
    }
    if (maturityDate !== undefined) {
      if (maturityDate === null) {
        data.maturityDate = null
      } else if (typeof maturityDate === 'string') {
        const d = parseStrictDate(maturityDate)
        if (!d) {
          return fail('유효한 만기일을 입력해주세요. (YYYY-MM-DD)', 400)
        }
        data.maturityDate = d
      }
    }

    if (Object.keys(data).length === 0) {
      return fail('변경할 항목이 없습니다.', 400)
    }

    const updated = await prisma.asset.update({ where: { id }, data })
    return ok(updated)
  } catch (error) {
    console.error('PUT /api/assets/[id] error:', error)
    return fail('자산 수정에 실패했습니다.', 500)
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params

    const existing = await prisma.asset.findUnique({ where: { id } })
    if (!existing) {
      return fail('자산을 찾을 수 없습니다.', 404)
    }

    await prisma.asset.delete({ where: { id } })
    return noContent()
  } catch (error) {
    console.error('DELETE /api/assets/[id] error:', error)
    return fail('자산 삭제에 실패했습니다.', 500)
  }
}
