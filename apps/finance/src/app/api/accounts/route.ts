import { prisma } from '@/lib/prisma'
import { ok, fail } from '@/lib/api-response'

export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      include: {
        holdings: {
          orderBy: { avgPrice: 'desc' },
        },
        _count: { select: { holdings: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return ok(accounts)
  } catch (error) {
    console.error('GET /api/accounts error:', error)
    return fail('계좌 목록을 불러올 수 없습니다.', 500)
  }
}
