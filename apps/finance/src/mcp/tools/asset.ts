import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { toolResult, toolError, formatMoney } from '../utils'

const VALID_CATEGORIES = ['savings', 'insurance', 'real_estate', 'pension', 'loan', 'cash', 'other']

const CATEGORY_LABELS: Record<string, string> = {
  savings: '적금/예금',
  cash: '입출금',
  insurance: '보험',
  real_estate: '부동산',
  pension: '연금',
  loan: '대출',
  other: '기타',
}

/** YYYY-MM-DD 엄격 파싱 */
function parseDateStrict(str: string): Date | null {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, y, m, d] = match.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date
}

/** 자산명으로 단일 자산 식별 (대소문자 무시, 다중 매칭 시 exact case fallback) */
async function resolveAssetByName(name: string) {
  const candidates = await prisma.asset.findMany({
    where: { name: { equals: name, mode: 'insensitive' } },
    include: { _count: { select: { transactions: true, deposits: true } } },
  })
  if (candidates.length === 0) return { error: `자산을 찾을 수 없습니다: ${name}` }
  if (candidates.length === 1) return { asset: candidates[0] }
  const exactMatches = candidates.filter((a) => a.name === name)
  if (exactMatches.length === 0) {
    const names = candidates.map((a) => `"${a.name}"`).join(', ')
    return { error: `여러 자산이 매칭됩니다: ${names}. 정확한 이름을 지정해주세요.` }
  }
  if (exactMatches.length > 1) {
    return { error: `동일 이름의 자산이 여러 개 있습니다. 관리자가 자산 이름을 정리한 후 다시 시도해주세요.` }
  }
  return { asset: exactMatches[0] }
}

/**
 * list_assets: 자산 목록 (간략)
 */
export async function listAssets() {
  try {
    const assets = await prisma.asset.findMany({
      orderBy: [{ isLiability: 'asc' }, { owner: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    })

    if (assets.length === 0) return toolResult('등록된 자산이 없습니다.')

    const lines = [`## 자산 목록 (${assets.length}개)\n`]
    for (const a of assets) {
      const catLabel = CATEGORY_LABELS[a.category] ?? a.category
      const liab = a.isLiability ? ' [부채]' : ''
      lines.push(`- ${a.name} (${a.owner}, ${catLabel})${liab}: ${formatMoney(a.value, 'KRW')}`)
    }
    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}

/**
 * create_asset: 자산 생성
 */
export async function createAsset(args: {
  name: string
  category: string
  owner: string
  value: number
  isLiability?: boolean
  interestRate?: number
  maturityDate?: string
  note?: string
}) {
  try {
    const name = args.name?.trim()
    if (!name) return toolError('자산명을 입력해주세요.')
    if (!VALID_CATEGORIES.includes(args.category)) return toolError(`유효한 카테고리: ${VALID_CATEGORIES.join(', ')}`)
    const owner = args.owner?.trim()
    if (!owner) return toolError('소유자를 입력해주세요.')
    if (!Number.isFinite(args.value) || args.value < 0) return toolError('금액은 0 이상이어야 합니다.')

    // 이름 중복 방지 (대소문자 무시)
    const duplicate = await prisma.asset.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    })
    if (duplicate) return toolError(`동일 이름의 자산이 이미 존재합니다: ${duplicate.name}`)

    let maturityDate: Date | null = null
    if (args.maturityDate) {
      const parsed = parseDateStrict(args.maturityDate)
      if (!parsed) return toolError('만기일은 YYYY-MM-DD 형식이어야 합니다.')
      maturityDate = parsed
    }

    const asset = await prisma.asset.create({
      data: {
        name,
        category: args.category,
        owner,
        value: Math.round(args.value),
        isLiability: args.isLiability === true,
        interestRate: args.interestRate ?? null,
        maturityDate,
        note: args.note?.trim() || null,
      },
    })

    const catLabel = CATEGORY_LABELS[asset.category] ?? asset.category
    return toolResult(
      `✅ 자산 생성: ${asset.name} (${asset.owner}, ${catLabel}${asset.isLiability ? ', 부채' : ''})\n` +
      `- 금액: ${formatMoney(asset.value, 'KRW')}`
    )
  } catch (error) {
    return toolError(error)
  }
}

/**
 * update_asset: 자산 부분 수정 (name으로 식별)
 */
export async function updateAsset(args: {
  name: string
  newName?: string
  category?: string
  owner?: string
  value?: number
  isLiability?: boolean
  interestRate?: number | null
  maturityDate?: string | null
  note?: string | null
}) {
  try {
    if (!args.name?.trim()) return toolError('대상 자산 이름이 필요합니다.')

    const result = await resolveAssetByName(args.name.trim())
    if ('error' in result) return toolError(result.error)
    const existing = result.asset

    if (args.category !== undefined && !VALID_CATEGORIES.includes(args.category)) {
      return toolError(`유효한 카테고리: ${VALID_CATEGORIES.join(', ')}`)
    }
    if (args.value !== undefined && (!Number.isFinite(args.value) || args.value < 0)) {
      return toolError('금액은 0 이상이어야 합니다.')
    }

    let maturityDate: Date | null | undefined
    if (args.maturityDate === null) maturityDate = null
    else if (args.maturityDate !== undefined) {
      const parsed = parseDateStrict(args.maturityDate)
      if (!parsed) return toolError('만기일은 YYYY-MM-DD 형식이어야 합니다.')
      maturityDate = parsed
    }

    const data: Record<string, unknown> = {}
    if (args.newName !== undefined) {
      const trimmed = args.newName.trim()
      if (!trimmed) return toolError('새 이름이 비어있습니다.')
      // 다른 자산과 이름 중복 방지 (대소문자 무시)
      const duplicate = await prisma.asset.findFirst({
        where: { name: { equals: trimmed, mode: 'insensitive' }, NOT: { id: existing.id } },
      })
      if (duplicate) return toolError(`동일 이름의 자산이 이미 존재합니다: ${duplicate.name}`)
      data.name = trimmed
    }
    if (args.category !== undefined) data.category = args.category
    if (args.owner !== undefined) {
      const ownerTrimmed = args.owner.trim()
      if (!ownerTrimmed) return toolError('소유자가 비어있습니다.')
      data.owner = ownerTrimmed
    }
    if (args.value !== undefined) data.value = Math.round(args.value)
    if (args.isLiability !== undefined) data.isLiability = args.isLiability
    if (args.interestRate !== undefined) data.interestRate = args.interestRate
    if (maturityDate !== undefined) data.maturityDate = maturityDate
    if (args.note !== undefined) data.note = args.note === null ? null : args.note.trim() || null

    if (Object.keys(data).length === 0) return toolError('변경할 필드가 없습니다.')

    const updated = await prisma.asset.update({ where: { id: existing.id }, data })
    const catLabel = CATEGORY_LABELS[updated.category] ?? updated.category
    return toolResult(
      `✅ 자산 수정: ${updated.name} (${updated.owner}, ${catLabel})\n` +
      `- 금액: ${formatMoney(updated.value, 'KRW')}`
    )
  } catch (error) {
    return toolError(error)
  }
}

/**
 * delete_asset: 자산 삭제 (연결 데이터 있으면 거부)
 */
export async function deleteAsset(args: { name: string }) {
  try {
    if (!args.name?.trim()) return toolError('자산 이름이 필요합니다.')

    const result = await resolveAssetByName(args.name.trim())
    if ('error' in result) return toolError(result.error)
    const existing = result.asset

    if (existing._count.transactions > 0) {
      return toolError(`${existing._count.transactions}건의 거래가 연결되어 삭제할 수 없습니다.`)
    }
    if (existing._count.deposits > 0) {
      return toolError(`${existing._count.deposits}건의 입금 내역이 연결되어 삭제할 수 없습니다.`)
    }

    await prisma.asset.delete({ where: { id: existing.id } })
    return toolResult(`🗑️ 자산 삭제: ${existing.name}`)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return toolError('연결된 데이터가 있어 삭제할 수 없습니다.')
    }
    return toolError(error)
  }
}

/**
 * create_asset_deposit: 자산 입금 기록 (증여 추적) + Asset.value 트랜잭션 업데이트
 */
export async function createAssetDeposit(args: {
  assetName: string
  amount: number
  source: string
  depositedAt?: string
  note?: string
}) {
  try {
    if (!args.assetName?.trim()) return toolError('자산 이름이 필요합니다.')
    if (!Number.isFinite(args.amount) || args.amount <= 0) return toolError('금액은 0보다 커야 합니다.')
    if (!args.source?.trim()) return toolError('출처(source)를 입력해주세요. 예: 증여, 이체, 급여')

    const result = await resolveAssetByName(args.assetName.trim())
    if ('error' in result) return toolError(result.error)
    const asset = result.asset

    let depositedAt: Date
    if (args.depositedAt) {
      const parsed = parseDateStrict(args.depositedAt)
      if (!parsed) return toolError('입금일은 YYYY-MM-DD 형식이어야 합니다.')
      depositedAt = parsed
    } else {
      depositedAt = new Date()
    }

    const roundedAmount = Math.round(args.amount)
    if (roundedAmount <= 0) return toolError('금액은 1원 이상이어야 합니다.')

    const deposit = await prisma.$transaction(async (tx) => {
      const created = await tx.deposit.create({
        data: {
          assetId: asset.id,
          amount: roundedAmount,
          source: args.source.trim(),
          note: args.note?.trim() || null,
          depositedAt,
        },
      })
      await tx.asset.update({
        where: { id: asset.id },
        data: { value: { increment: roundedAmount } },
      })
      return created
    })

    return toolResult(
      `✅ 자산 입금: ${asset.name}\n` +
      `- 금액: ${formatMoney(roundedAmount, 'KRW')} (${deposit.source})\n` +
      `- 날짜: ${depositedAt.toISOString().slice(0, 10)}\n` +
      `- ID: ${deposit.id}`
    )
  } catch (error) {
    return toolError(error)
  }
}
