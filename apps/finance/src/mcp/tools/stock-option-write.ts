import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { resolveAccountId, toolResult, toolError, ToolInputError, parseDateStrict } from '../utils'

/**
 * create_stock_option: 신규 스톡옵션 등록
 */
export async function createStockOption(args: {
  account_name: string
  ticker: string
  displayName: string
  grantDate: string
  expiryDate: string
  strikePrice: number
  totalShares: number
  note?: string
}) {
  try {
    const accountId = await resolveAccountId(args.account_name)
    if (!accountId) throw new ToolInputError('특정 계좌를 지정해주세요. ("전체"는 허용되지 않습니다)')

    if (!args.ticker.trim()) return toolError('ticker는 필수입니다.')
    if (!args.displayName.trim()) return toolError('displayName은 필수입니다.')

    const grantDate = parseDateStrict(args.grantDate)
    if (!grantDate) return toolError('grantDate는 YYYY-MM-DD 형식이어야 합니다.')
    const expiryDate = parseDateStrict(args.expiryDate)
    if (!expiryDate) return toolError('expiryDate는 YYYY-MM-DD 형식이어야 합니다.')
    if (expiryDate <= grantDate) return toolError('만료일은 부여일 이후여야 합니다.')

    if (!Number.isFinite(args.strikePrice) || args.strikePrice < 0) return toolError('strikePrice는 0 이상이어야 합니다.')
    if (!Number.isInteger(args.totalShares) || args.totalShares <= 0) return toolError('totalShares는 1 이상의 정수여야 합니다.')

    const created = await prisma.stockOption.create({
      data: {
        accountId,
        ticker: args.ticker.trim(),
        displayName: args.displayName.trim(),
        grantDate,
        expiryDate,
        strikePrice: args.strikePrice,
        totalShares: args.totalShares,
        remainingShares: args.totalShares,
        note: args.note?.trim() || null,
      },
      include: { account: { select: { name: true } } },
    })

    return toolResult(
      `✅ 스톡옵션 생성: ${created.account.name} | ${created.displayName} (${created.ticker})\n` +
      `- 부여: ${created.grantDate.toISOString().slice(0, 10)} / 만료: ${created.expiryDate.toISOString().slice(0, 10)}\n` +
      `- 행사가: ${created.strikePrice.toLocaleString()}원 / 총 ${created.totalShares}주\n` +
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
 * update_stock_option: 수정 (remainingShares 자동 재계산)
 */
export async function updateStockOption(args: {
  id: string
  ticker?: string
  displayName?: string
  grantDate?: string
  expiryDate?: string
  strikePrice?: number
  totalShares?: number
  cancelledShares?: number
  adjustedShares?: number
  note?: string | null
}) {
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.stockOption.findUnique({ where: { id: args.id } })
      if (!existing) throw new ToolInputError(`스톡옵션을 찾을 수 없습니다: ${args.id}`)

      const data: Record<string, unknown> = {}

      if (args.ticker !== undefined) {
        if (!args.ticker.trim()) throw new ToolInputError('ticker가 비어있습니다.')
        data.ticker = args.ticker.trim()
      }
      if (args.displayName !== undefined) {
        if (!args.displayName.trim()) throw new ToolInputError('displayName이 비어있습니다.')
        data.displayName = args.displayName.trim()
      }
      if (args.grantDate !== undefined) {
        const parsed = parseDateStrict(args.grantDate)
        if (!parsed) throw new ToolInputError('grantDate는 YYYY-MM-DD 형식이어야 합니다.')
        data.grantDate = parsed
      }
      if (args.expiryDate !== undefined) {
        const parsed = parseDateStrict(args.expiryDate)
        if (!parsed) throw new ToolInputError('expiryDate는 YYYY-MM-DD 형식이어야 합니다.')
        data.expiryDate = parsed
      }
      if (args.strikePrice !== undefined) {
        if (!Number.isFinite(args.strikePrice) || args.strikePrice < 0) throw new ToolInputError('strikePrice는 0 이상이어야 합니다.')
        data.strikePrice = args.strikePrice
      }
      if (args.totalShares !== undefined) {
        if (!Number.isInteger(args.totalShares) || args.totalShares <= 0) throw new ToolInputError('totalShares는 1 이상의 정수여야 합니다.')
        data.totalShares = args.totalShares
      }
      if (args.cancelledShares !== undefined) {
        if (!Number.isInteger(args.cancelledShares) || args.cancelledShares < 0) throw new ToolInputError('cancelledShares는 0 이상의 정수여야 합니다.')
        data.cancelledShares = args.cancelledShares
      }
      if (args.adjustedShares !== undefined) {
        if (!Number.isInteger(args.adjustedShares)) throw new ToolInputError('adjustedShares는 정수여야 합니다.')
        data.adjustedShares = args.adjustedShares
      }
      if (args.note !== undefined) {
        data.note = args.note === null ? null : args.note.trim() || null
      }

      // 날짜 정합성 재검증
      const effectiveGrantDate = (data.grantDate as Date | undefined) ?? existing.grantDate
      const effectiveExpiryDate = (data.expiryDate as Date | undefined) ?? existing.expiryDate
      if (effectiveExpiryDate <= effectiveGrantDate) throw new ToolInputError('만료일은 부여일 이후여야 합니다.')

      // remainingShares 재계산
      if (data.totalShares !== undefined || data.cancelledShares !== undefined || data.adjustedShares !== undefined) {
        const total = (data.totalShares as number | undefined) ?? existing.totalShares
        const cancelled = (data.cancelledShares as number | undefined) ?? existing.cancelledShares
        const exercised = existing.exercisedShares
        const adjusted = (data.adjustedShares as number | undefined) ?? existing.adjustedShares
        const remaining = total - cancelled - exercised - adjusted
        if (remaining < 0) throw new ToolInputError(`remainingShares가 음수가 됩니다. (total=${total}, cancelled=${cancelled}, exercised=${exercised}, adjusted=${adjusted})`)
        data.remainingShares = remaining
      }

      if (Object.keys(data).length === 0) throw new ToolInputError('변경할 필드가 없습니다.')

      return tx.stockOption.update({
        where: { id: args.id },
        data,
        include: { account: { select: { name: true } } },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return toolResult(
      `✅ 스톡옵션 수정: ${updated.account.name} | ${updated.displayName} (${updated.ticker})\n` +
      `- 총 ${updated.totalShares}주 / 취소 ${updated.cancelledShares} / 행사 ${updated.exercisedShares} / 조정 ${updated.adjustedShares} / 잔여 ${updated.remainingShares}`
    )
  } catch (error) {
    return toolError(error)
  }
}

/**
 * delete_stock_option: 스톡옵션 삭제 (vestings cascade)
 */
export async function deleteStockOption(args: { id: string }) {
  try {
    const existing = await prisma.stockOption.findUnique({
      where: { id: args.id },
      include: { account: { select: { name: true } } },
    })
    if (!existing) return toolError(`스톡옵션을 찾을 수 없습니다: ${args.id}`)

    await prisma.$transaction(async (tx) => {
      await tx.stockOptionVesting.deleteMany({ where: { stockOptionId: args.id } })
      await tx.stockOption.delete({ where: { id: args.id } })
    })

    return toolResult(`🗑️ 스톡옵션 삭제: ${existing.account.name} | ${existing.displayName}`)
  } catch (error) {
    return toolError(error)
  }
}

/**
 * create_stock_option_vesting: 스톡옵션 행사 스케줄 추가
 */
export async function createStockOptionVesting(args: {
  stockOptionId: string
  vestingDate: string
  shares: number
  note?: string
}) {
  try {
    const parent = await prisma.stockOption.findUnique({ where: { id: args.stockOptionId } })
    if (!parent) return toolError(`스톡옵션을 찾을 수 없습니다: ${args.stockOptionId}`)

    const vestingDate = parseDateStrict(args.vestingDate)
    if (!vestingDate) return toolError('vestingDate는 YYYY-MM-DD 형식이어야 합니다.')

    if (!Number.isInteger(args.shares) || args.shares <= 0) return toolError('shares는 1 이상의 정수여야 합니다.')

    const created = await prisma.stockOptionVesting.create({
      data: {
        stockOptionId: args.stockOptionId,
        vestingDate,
        shares: args.shares,
        note: args.note?.trim() || null,
      },
    })

    return toolResult(
      `✅ 행사 스케줄 생성: ${parent.displayName} | ${created.vestingDate.toISOString().slice(0, 10)} | ${created.shares}주\n` +
      `- ID: ${created.id}`
    )
  } catch (error) {
    return toolError(error)
  }
}

/**
 * update_stock_option_vesting: 행사 스케줄 수정
 */
export async function updateStockOptionVesting(args: {
  id: string
  vestingDate?: string
  shares?: number
  note?: string | null
}) {
  try {
    const existing = await prisma.stockOptionVesting.findUnique({ where: { id: args.id } })
    if (!existing) return toolError(`행사 스케줄을 찾을 수 없습니다: ${args.id}`)
    if (existing.status !== 'pending') return toolError('이미 행사 가능 이상 상태인 스케줄은 수정할 수 없습니다.')

    const data: Record<string, unknown> = {}
    if (args.vestingDate !== undefined) {
      const parsed = parseDateStrict(args.vestingDate)
      if (!parsed) return toolError('vestingDate는 YYYY-MM-DD 형식이어야 합니다.')
      data.vestingDate = parsed
    }
    if (args.shares !== undefined) {
      if (!Number.isInteger(args.shares) || args.shares <= 0) return toolError('shares는 1 이상의 정수여야 합니다.')
      data.shares = args.shares
    }
    if (args.note !== undefined) {
      data.note = args.note === null ? null : args.note.trim() || null
    }

    if (Object.keys(data).length === 0) return toolError('변경할 필드가 없습니다.')

    const updated = await prisma.$transaction(async (tx) => {
      const fresh = await tx.stockOptionVesting.findUnique({ where: { id: args.id } })
      if (!fresh) throw new ToolInputError(`행사 스케줄을 찾을 수 없습니다: ${args.id}`)
      if (fresh.status !== 'pending') throw new ToolInputError('이미 행사 가능 이상 상태인 스케줄은 수정할 수 없습니다.')
      return tx.stockOptionVesting.update({ where: { id: args.id }, data })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return toolResult(
      `✅ 행사 스케줄 수정: ${updated.vestingDate.toISOString().slice(0, 10)} | ${updated.shares}주`
    )
  } catch (error) {
    return toolError(error)
  }
}

/**
 * delete_stock_option_vesting: 행사 스케줄 삭제 (exercised 제외)
 * Serializable + 조건부 deleteMany로 TOCTOU race 방지
 */
export async function deleteStockOptionVesting(args: { id: string }) {
  try {
    const existing = await prisma.stockOptionVesting.findUnique({ where: { id: args.id } })
    if (!existing) return toolError(`행사 스케줄을 찾을 수 없습니다: ${args.id}`)
    if (existing.status === 'exercised') return toolError('이미 행사된 스케줄은 삭제할 수 없습니다.')

    const result = await prisma.$transaction(async (tx) => {
      return tx.stockOptionVesting.deleteMany({
        where: { id: args.id, status: { not: 'exercised' } },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (result.count === 0) {
      return toolError('이미 행사된 스케줄은 삭제할 수 없습니다.')
    }

    return toolResult(`🗑️ 행사 스케줄 삭제: ${existing.vestingDate.toISOString().slice(0, 10)} | ${existing.shares}주`)
  } catch (error) {
    return toolError(error)
  }
}

const ALLOWED_TRANSITIONS: Record<string, Record<string, string>> = {
  activate: { pending: 'exercisable' },
  exercise: { exercisable: 'exercised' },
  expire: { exercisable: 'expired' },
}

type VestingAction = 'activate' | 'exercise' | 'expire'

/**
 * exercise_vesting: 베스팅 상태 전환
 * - activate: pending → exercisable (KST 기준 베스팅일 도래 필요)
 * - exercise: exercisable → exercised (StockOption.exercisedShares 증가, remainingShares 감소)
 * - expire: exercisable → expired
 */
export async function exerciseVesting(args: { vestingId: string; action: VestingAction }) {
  try {
    if (!['activate', 'exercise', 'expire'].includes(args.action)) {
      return toolError('action은 activate / exercise / expire 중 하나여야 합니다.')
    }

    const result = await prisma.$transaction(async (tx) => {
      const vesting = await tx.stockOptionVesting.findUnique({ where: { id: args.vestingId } })
      if (!vesting) throw new ToolInputError(`베스팅을 찾을 수 없습니다: ${args.vestingId}`)

      const allowedMap = ALLOWED_TRANSITIONS[args.action]
      const newStatus = allowedMap[vesting.status]
      if (!newStatus) {
        throw new ToolInputError(`'${vesting.status}' 상태에서 '${args.action}' 액션은 허용되지 않습니다.`)
      }

      // activate: 베스팅일 도래 검증 (KST 일 단위)
      if (args.action === 'activate') {
        const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
        const todayEnd = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1))
        if (vesting.vestingDate >= todayEnd) {
          throw new ToolInputError('베스팅일이 아직 도래하지 않았습니다.')
        }
      }

      if (args.action === 'exercise') {
        // 부모 StockOption의 만료일 검증 (만료 cron 지연/수동 재활성화 대비)
        // expiryDate는 UTC 자정에 저장되므로 KST 일 경계 기준으로 비교
        // (KST 만료일 당일 23:59까지 행사 가능)
        const parent = await tx.stockOption.findUnique({ where: { id: vesting.stockOptionId } })
        if (!parent) throw new ToolInputError(`스톡옵션을 찾을 수 없습니다: ${vesting.stockOptionId}`)

        const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
        const todayStart = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()))
        if (parent.expiryDate < todayStart) {
          throw new ToolInputError(`만료된 스톡옵션은 행사할 수 없습니다. (만료일: ${parent.expiryDate.toISOString().slice(0, 10)})`)
        }

        // remainingShares 조건부 감소: 부족하면 updateMany가 0건 반환
        const parentResult = await tx.stockOption.updateMany({
          where: {
            id: vesting.stockOptionId,
            remainingShares: { gte: vesting.shares },
            expiryDate: { gte: todayStart },
          },
          data: {
            exercisedShares: { increment: vesting.shares },
            remainingShares: { decrement: vesting.shares },
          },
        })
        if (parentResult.count === 0) {
          throw new ToolInputError('잔여 수량이 부족하거나 옵션이 만료되어 행사할 수 없습니다.')
        }
        return tx.stockOptionVesting.update({
          where: { id: args.vestingId },
          data: { status: 'exercised', exercisedAt: new Date() },
        })
      }

      return tx.stockOptionVesting.update({
        where: { id: args.vestingId },
        data: { status: newStatus },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    const actionLabel = args.action === 'activate' ? '활성화' : args.action === 'exercise' ? '행사' : '만료'
    return toolResult(
      `✅ 베스팅 ${actionLabel}: ${result.vestingDate.toISOString().slice(0, 10)} | ${result.shares}주 → ${result.status}`
    )
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return toolError('동시 요청이 감지되었습니다. 다시 시도해주세요.')
    }
    return toolError(error)
  }
}
