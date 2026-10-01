import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { fail, noContent } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

interface ReorderItem {
  id: string
  sortOrder: number
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return fail('잘못된 요청 형식입니다.', 400)
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return fail('잘못된 요청 형식입니다.', 400)
    }

    const { items } = body as { items?: unknown }

    if (!Array.isArray(items) || items.length === 0) {
      return fail('items 배열이 필요합니다.', 400)
    }

    const validItems: ReorderItem[] = []
    for (const item of items) {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof (item as ReorderItem).id !== 'string' ||
        typeof (item as ReorderItem).sortOrder !== 'number' ||
        (item as ReorderItem).sortOrder < 0 ||
        (item as ReorderItem).sortOrder > 999 ||
        !Number.isInteger((item as ReorderItem).sortOrder)
      ) {
        return fail('각 항목은 id(string)와 sortOrder(0-999 정수)가 필요합니다.', 400)
      }
      validItems.push({ id: (item as ReorderItem).id, sortOrder: (item as ReorderItem).sortOrder })
    }

    // id 유니크 검증
    const uniqueIds = new Set(validItems.map((item) => item.id))
    if (uniqueIds.size !== validItems.length) {
      return fail('중복된 카테고리 ID가 있습니다.', 400)
    }

    await prisma.$transaction(
      validItems.map((item) =>
        prisma.category.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        })
      )
    )

    return noContent()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail('존재하지 않는 카테고리가 포함되어 있습니다.', 404)
    }
    console.error('POST /api/categories/reorder error:', error)
    return fail('정렬 순서 변경에 실패했습니다.', 500)
  }
}
