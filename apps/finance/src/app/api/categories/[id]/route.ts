import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { CATEGORY_TYPES } from '@/lib/category-utils'

interface RouteParams {
  params: { id: string }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const existing = await prisma.category.findUnique({
      where: { id: params.id },
    })
    if (!existing) {
      return NextResponse.json({ error: '카테고리를 찾을 수 없습니다.' }, { status: 404 })
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

    const { name, type, icon, keywords, sortOrder } = body as Record<string, unknown>
    const isTypeChange = type !== undefined && type !== existing.type

    // type 검증 (트랜잭션 전에)
    if (isTypeChange) {
      if (typeof type !== 'string' || !(CATEGORY_TYPES as readonly string[]).includes(type)) {
        return NextResponse.json({ error: '유효한 유형을 선택해주세요.' }, { status: 400 })
      }
    }

    // name 검증
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: '카테고리 이름을 입력해주세요.' }, { status: 400 })
      }
      if (name.trim().length > 50) {
        return NextResponse.json({ error: '이름은 50자 이내로 입력해주세요.' }, { status: 400 })
      }
    }

    if (icon !== undefined && icon !== null && typeof icon !== 'string') {
      return NextResponse.json({ error: '아이콘은 문자열이어야 합니다.' }, { status: 400 })
    }

    if (keywords !== undefined && keywords !== null) {
      if (!Array.isArray(keywords)) {
        return NextResponse.json({ error: '키워드는 배열이어야 합니다.' }, { status: 400 })
      }
      if (keywords.some((k: unknown) => typeof k !== 'string')) {
        return NextResponse.json({ error: '키워드는 문자열 배열이어야 합니다.' }, { status: 400 })
      }
    }

    if (sortOrder !== undefined && sortOrder !== null) {
      if (typeof sortOrder !== 'number' || !Number.isInteger(sortOrder)) {
        return NextResponse.json({ error: '정렬 순서는 정수여야 합니다.' }, { status: 400 })
      }
      if (sortOrder < 0 || sortOrder > 999) {
        return NextResponse.json({ error: '정렬 순서는 0~999 범위여야 합니다.' }, { status: 400 })
      }
    }

    const cleanedKeywords = Array.isArray(keywords)
      ? Array.from(new Set((keywords as string[]).map((k) => k.trim()).filter(Boolean)))
      : undefined

    // type은 변경 시에만 트랜잭션 경로에서 설정 (stale 덮어쓰기 방지)
    const baseUpdateData = {
      name: typeof name === 'string' ? name.trim() : undefined,
      icon: icon !== undefined ? (typeof icon === 'string' ? (icon.trim() || null) : null) : undefined,
      keywords: cleanedKeywords,
      sortOrder: typeof sortOrder === 'number' ? Math.round(sortOrder) : undefined,
    }

    // type 변경 시 트랜잭션으로 체크+업데이트 원자 실행
    if (isTypeChange) {
      const updateDataWithType = { ...baseUpdateData, type: type as string }
      const updated = await prisma.$transaction(async (tx) => {
        const fresh = await tx.category.findUnique({
          where: { id: params.id },
          include: { _count: { select: { transactions: true, budgets: true } } },
        })
        if (!fresh) {
          throw new Error('NOT_FOUND')
        }
        if (fresh._count.transactions > 0 || fresh._count.budgets > 0) {
          throw new Error('HAS_LINKED_DATA')
        }
        return tx.category.update({ where: { id: params.id }, data: updateDataWithType })
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      return NextResponse.json(updated)
    }

    const updated = await prisma.category.update({
      where: { id: params.id },
      data: baseUpdateData,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NOT_FOUND') {
        return NextResponse.json({ error: '카테고리를 찾을 수 없습니다.' }, { status: 404 })
      }
      if (error.message === 'HAS_LINKED_DATA') {
        return NextResponse.json(
          { error: '거래 또는 예산이 연결된 카테고리의 유형은 변경할 수 없습니다.' },
          { status: 400 }
        )
      }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return NextResponse.json({ error: '이미 존재하는 카테고리 이름입니다.' }, { status: 409 })
      }
      if (error.code === 'P2025') {
        return NextResponse.json({ error: '카테고리를 찾을 수 없습니다.' }, { status: 404 })
      }
    }
    console.error('PUT /api/categories/[id] error:', error)
    return NextResponse.json({ error: '카테고리 수정에 실패했습니다.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const existing = await prisma.category.findUnique({
      where: { id: params.id },
      include: { _count: { select: { transactions: true, budgets: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: '카테고리를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (existing._count.transactions > 0) {
      return NextResponse.json(
        { error: `${existing._count.transactions}건의 거래가 연결되어 삭제할 수 없습니다.` },
        { status: 400 }
      )
    }

    if (existing._count.budgets > 0) {
      return NextResponse.json(
        { error: `${existing._count.budgets}건의 예산이 연결되어 삭제할 수 없습니다.` },
        { status: 400 }
      )
    }

    await prisma.category.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        return NextResponse.json({ error: '연결된 데이터가 있어 삭제할 수 없습니다.' }, { status: 400 })
      }
      if (error.code === 'P2025') {
        return NextResponse.json({ error: '카테고리를 찾을 수 없습니다.' }, { status: 404 })
      }
    }
    console.error('DELETE /api/categories/[id] error:', error)
    return NextResponse.json({ error: '카테고리 삭제에 실패했습니다.' }, { status: 500 })
  }
}
