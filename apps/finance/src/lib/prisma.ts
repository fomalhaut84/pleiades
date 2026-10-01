import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient(): PrismaClient {
  const rawUrl = process.env.DATABASE_URL
  if (!rawUrl) return new PrismaClient()

  try {
    const url = new URL(rawUrl)
    const defaults: Record<string, string> = {
      connection_limit: '10',
      pool_timeout: '5',
      connect_timeout: '5',
    }
    for (const [key, value] of Object.entries(defaults)) {
      if (!url.searchParams.has(key)) {
        url.searchParams.set(key, value)
      }
    }
    return new PrismaClient({ datasourceUrl: url.toString() })
  } catch {
    // URL 파싱 실패 시 원본 그대로 사용
    return new PrismaClient()
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
