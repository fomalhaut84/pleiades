import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: { id: string }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const existing = await prisma.deposit.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: '입금 기록을 찾을 수 없습니다.' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
    }
    const { amount, source, note, depositedAt } = body as Record<string, unknown>

    if (amount !== undefined && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)) {
      return NextResponse.json({ error: '금액은 0보다 커야 합니다.' }, { status: 400 })
    }
    if (source !== undefined && (typeof source !== 'string' || !source.trim())) {
      return NextResponse.json({ error: '출처를 입력해주세요.' }, { status: 400 })
    }
    if (depositedAt !== undefined && (typeof depositedAt !== 'string' || isNaN(Date.parse(depositedAt)))) {
      return NextResponse.json({ error: '유효한 입금일을 입력해주세요.' }, { status: 400 })
    }
    if (note !== undefined && note !== null && typeof note !== 'string') {
      return NextResponse.json({ error: '메모는 문자열이어야 합니다.' }, { status: 400 })
    }

    if (typeof amount === 'number') {
      const roundedAmount = Math.round(amount)
      if (roundedAmount <= 0) {
        return NextResponse.json({ error: '금액은 1원 이상이어야 합니다.' }, { status: 400 })
      }
    }

    const updated = await prisma.deposit.update({
      where: { id: params.id },
      data: {
        amount: typeof amount === 'number' ? Math.round(amount) : undefined,
        source: typeof source === 'string' ? source.trim() : undefined,
        note: note !== undefined ? (typeof note === 'string' ? (note.trim() || null) : null) : undefined,
        depositedAt: typeof depositedAt === 'string' ? new Date(depositedAt) : undefined,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('PUT /api/deposits/[id] error:', error)
    return NextResponse.json({ error: '입금 수정에 실패했습니다.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const existing = await prisma.deposit.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: '입금 기록을 찾을 수 없습니다.' }, { status: 404 })
    }

    await prisma.deposit.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/deposits/[id] error:', error)
    return NextResponse.json({ error: '입금 삭제에 실패했습니다.' }, { status: 500 })
  }
}
