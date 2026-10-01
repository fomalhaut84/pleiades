import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { resolveAccountId, toolResult, toolError, ToolInputError, parseDateStrict } from '../utils'

/**
 * create_rsu_schedule: 신규 RSU 베스팅 일정 등록
 */
export async function createRsuSchedule(args: {
  account_name: string
  vestingDate: string
  shares: number
  basisValue: number
  basisDate?: string
  basisPrice?: number
  sellShares?: number
  keepShares?: number
  note?: string
}) {
  try {
    const accountId = await resolveAccountId(args.account_name)
    if (!accountId) throw new ToolInputError('특정 계좌를 지정해주세요. ("전체"는 허용되지 않습니다)')

    const vestingDate = parseDateStrict(args.vestingDate)
    if (!vestingDate) return toolError('vestingDate는 YYYY-MM-DD 형식이어야 합니다.')

    if (!Number.isInteger(args.shares) || args.shares <= 0) return toolError('수량은 1 이상의 정수여야 합니다.')
    if (!Number.isFinite(args.basisValue) || args.basisValue < 0) return toolError('기준금액은 0 이상이어야 합니다.')

    let basisDate: Date | null = null
    if (args.basisDate !== undefined) {
      basisDate = parseDateStrict(args.basisDate)
      if (!basisDate) return toolError('basisDate는 YYYY-MM-DD 형식이어야 합니다.')
    }

    if (args.basisPrice !== undefined && (!Number.isFinite(args.basisPrice) || args.basisPrice < 0)) {
      return toolError('기준 주가는 0 이상이어야 합니다.')
    }

    if (args.sellShares !== undefined) {
      if (!Number.isInteger(args.sellShares) || args.sellShares < 0 || args.sellShares > args.shares) {
        return toolError('매도 예정 수량은 0 이상, 총 수량 이하의 정수여야 합니다.')
      }
    }
    if (args.keepShares !== undefined) {
      if (!Number.isInteger(args.keepShares) || args.keepShares < 0 || args.keepShares > args.shares) {
        return toolError('보유 예정 수량은 0 이상, 총 수량 이하의 정수여야 합니다.')
      }
    }

    const created = await prisma.rSUSchedule.create({
      data: {
        accountId,
        vestingDate,
        shares: args.shares,
        basisValue: args.basisValue,
        basisDate,
        basisPrice: args.basisPrice ?? null,
        sellShares: args.sellShares ?? null,
        keepShares: args.keepShares ?? null,
        note: args.note?.trim() || null,
      },
      include: { account: { select: { name: true } } },
    })

    return toolResult(
      `✅ RSU 스케줄 생성: ${created.account.name} | ${created.vestingDate.toISOString().slice(0, 10)} | ${created.shares}주\n` +
      `- 기준금액: ${created.basisValue.toLocaleString()}원\n` +
      `- ID: ${created.id}`
    )
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return toolError('존재하지 않는 계좌입니다.')
    }
    return toolError(error)
  }
}

/**
 * update_rsu_schedule: RSU 스케줄 수정 (pending 상태만 허용)
 */
export async function updateRsuSchedule(args: {
  id: string
  vestingDate?: string
  shares?: number
  basisValue?: number
  basisDate?: string | null
  basisPrice?: number | null
  sellShares?: number | null
  keepShares?: number | null
  note?: string | null
}) {
  try {
    const existing = await prisma.rSUSchedule.findUnique({ where: { id: args.id } })
    if (!existing) return toolError(`RSU 스케줄을 찾을 수 없습니다: ${args.id}`)
    if (existing.status !== 'pending') return toolError('베스팅 완료된 스케줄은 수정할 수 없습니다.')

    const data: Record<string, unknown> = {}

    if (args.vestingDate !== undefined) {
      const parsed = parseDateStrict(args.vestingDate)
      if (!parsed) return toolError('vestingDate는 YYYY-MM-DD 형식이어야 합니다.')
      data.vestingDate = parsed
    }
    if (args.shares !== undefined) {
      if (!Number.isInteger(args.shares) || args.shares <= 0) return toolError('수량은 1 이상의 정수여야 합니다.')
      data.shares = args.shares
    }
    if (args.basisValue !== undefined) {
      if (!Number.isFinite(args.basisValue) || args.basisValue < 0) return toolError('기준금액은 0 이상이어야 합니다.')
      data.basisValue = args.basisValue
    }
    if (args.basisDate !== undefined) {
      if (args.basisDate === null) {
        data.basisDate = null
      } else {
        const parsed = parseDateStrict(args.basisDate)
        if (!parsed) return toolError('basisDate는 YYYY-MM-DD 형식이어야 합니다.')
        data.basisDate = parsed
      }
    }
    if (args.basisPrice !== undefined) {
      if (args.basisPrice !== null && (!Number.isFinite(args.basisPrice) || args.basisPrice < 0)) {
        return toolError('기준 주가는 0 이상이어야 합니다.')
      }
      data.basisPrice = args.basisPrice
    }

    // sellShares/keepShares 검증: 병합된 shares 기준
    const effectiveShares = (data.shares as number | undefined) ?? existing.shares
    if (args.sellShares !== undefined) {
      if (args.sellShares !== null) {
        if (!Number.isInteger(args.sellShares) || args.sellShares < 0 || args.sellShares > effectiveShares) {
          return toolError('매도 예정 수량은 0 이상, 총 수량 이하의 정수여야 합니다.')
        }
      }
      data.sellShares = args.sellShares
    }
    if (args.keepShares !== undefined) {
      if (args.keepShares !== null) {
        if (!Number.isInteger(args.keepShares) || args.keepShares < 0 || args.keepShares > effectiveShares) {
          return toolError('보유 예정 수량은 0 이상, 총 수량 이하의 정수여야 합니다.')
        }
      }
      data.keepShares = args.keepShares
    }

    // shares만 줄인 경우, 기존 sellShares/keepShares 값도 새 shares 기준으로 재검증
    if (args.shares !== undefined && args.shares !== existing.shares) {
      const effSell = args.sellShares !== undefined ? args.sellShares : existing.sellShares
      if (effSell !== null && effSell !== undefined && effSell > effectiveShares) {
        return toolError(`매도 예정 수량(${effSell})이 변경된 shares(${effectiveShares})를 초과합니다. sellShares도 함께 수정해주세요.`)
      }
      const effKeep = args.keepShares !== undefined ? args.keepShares : existing.keepShares
      if (effKeep !== null && effKeep !== undefined && effKeep > effectiveShares) {
        return toolError(`보유 예정 수량(${effKeep})이 변경된 shares(${effectiveShares})를 초과합니다. keepShares도 함께 수정해주세요.`)
      }
    }
    if (args.note !== undefined) {
      data.note = args.note === null ? null : args.note.trim() || null
    }

    if (Object.keys(data).length === 0) return toolError('변경할 필드가 없습니다.')

    // Serializable: 상태 + 수량 정합성을 트랜잭션 내부 최신값 기준으로 재검증
    const updated = await prisma.$transaction(async (tx) => {
      const fresh = await tx.rSUSchedule.findUnique({ where: { id: args.id } })
      if (!fresh) throw new ToolInputError(`RSU 스케줄을 찾을 수 없습니다: ${args.id}`)
      if (fresh.status !== 'pending') throw new ToolInputError('베스팅 완료된 스케줄은 수정할 수 없습니다.')

      // fresh 기준 sellShares/keepShares ≤ effectiveShares 재검증
      const freshEffectiveShares = (data.shares as number | undefined) ?? fresh.shares
      const freshEffectiveSell = args.sellShares !== undefined ? args.sellShares : fresh.sellShares
      if (freshEffectiveSell !== null && freshEffectiveSell !== undefined && freshEffectiveSell > freshEffectiveShares) {
        throw new ToolInputError(
          `매도 예정 수량(${freshEffectiveSell})이 shares(${freshEffectiveShares})를 초과합니다. sellShares도 함께 수정해주세요.`
        )
      }
      const freshEffectiveKeep = args.keepShares !== undefined ? args.keepShares : fresh.keepShares
      if (freshEffectiveKeep !== null && freshEffectiveKeep !== undefined && freshEffectiveKeep > freshEffectiveShares) {
        throw new ToolInputError(
          `보유 예정 수량(${freshEffectiveKeep})이 shares(${freshEffectiveShares})를 초과합니다. keepShares도 함께 수정해주세요.`
        )
      }

      return tx.rSUSchedule.update({
        where: { id: args.id },
        data,
        include: { account: { select: { name: true } } },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return toolResult(
      `✅ RSU 스케줄 수정: ${updated.account.name} | ${updated.vestingDate.toISOString().slice(0, 10)} | ${updated.shares}주`
    )
  } catch (error) {
    return toolError(error)
  }
}

/**
 * delete_rsu_schedule: RSU 스케줄 삭제 (pending 상태만 허용)
 */
export async function deleteRsuSchedule(args: { id: string }) {
  try {
    const existing = await prisma.rSUSchedule.findUnique({
      where: { id: args.id },
      include: { account: { select: { name: true } } },
    })
    if (!existing) return toolError(`RSU 스케줄을 찾을 수 없습니다: ${args.id}`)
    if (existing.status !== 'pending') return toolError('베스팅 완료된 스케줄은 삭제할 수 없습니다.')

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.rSUSchedule.findUnique({ where: { id: args.id } })
      if (!fresh) throw new ToolInputError(`RSU 스케줄을 찾을 수 없습니다: ${args.id}`)
      if (fresh.status !== 'pending') throw new ToolInputError('베스팅 완료된 스케줄은 삭제할 수 없습니다.')
      await tx.rSUSchedule.delete({ where: { id: args.id } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return toolResult(
      `🗑️ RSU 스케줄 삭제: ${existing.account.name} | ${existing.vestingDate.toISOString().slice(0, 10)} | ${existing.shares}주`
    )
  } catch (error) {
    return toolError(error)
  }
}
