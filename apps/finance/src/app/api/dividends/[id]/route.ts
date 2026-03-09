import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calcAmountKRW } from '@/lib/dividend-utils'

interface RouteParams {
  params: { id: string }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const existing = await prisma.dividend.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: '배당 기록을 찾을 수 없습니다.' }, { status: 404 })
    }

    const body = await request.json()
    const { exDate, payDate, amountGross, amountNet, taxAmount, fxRate, reinvested } = body

    if (amountGross !== undefined && (typeof amountGross !== 'number' || !Number.isFinite(amountGross) || amountGross <= 0)) {
      return NextResponse.json({ error: '세전 금액은 0보다 커야 합니다.' }, { status: 400 })
    }
    if (amountNet !== undefined && (typeof amountNet !== 'number' || !Number.isFinite(amountNet) || amountNet < 0)) {
      return NextResponse.json({ error: '세후 금액은 0 이상이어야 합니다.' }, { status: 400 })
    }
    if (payDate !== undefined && (typeof payDate !== 'string' || isNaN(Date.parse(payDate)))) {
      return NextResponse.json({ error: '유효한 지급일을 입력해주세요.' }, { status: 400 })
    }
    if (exDate !== undefined && exDate !== null && (typeof exDate !== 'string' || isNaN(Date.parse(exDate)))) {
      return NextResponse.json({ error: '유효한 기준일을 입력해주세요.' }, { status: 400 })
    }
    if (taxAmount !== undefined && taxAmount !== null && (typeof taxAmount !== 'number' || !Number.isFinite(taxAmount) || taxAmount < 0)) {
      return NextResponse.json({ error: '세금은 0 이상이어야 합니다.' }, { status: 400 })
    }
    if (fxRate !== undefined && fxRate !== null && existing.currency === 'USD' && (typeof fxRate !== 'number' || !Number.isFinite(fxRate) || fxRate <= 0)) {
      return NextResponse.json({ error: 'USD 배당은 유효한 환율이 필요합니다.' }, { status: 400 })
    }
    if (reinvested !== undefined && typeof reinvested !== 'boolean') {
      return NextResponse.json({ error: '재투자 여부는 true/false여야 합니다.' }, { status: 400 })
    }

    // 최종 적용값 결정
    const nextGross = amountGross ?? existing.amountGross
    const nextNet = amountNet ?? existing.amountNet
    const nextTax = taxAmount !== undefined ? taxAmount : existing.taxAmount
    const nextFxRate = existing.currency === 'USD'
      ? (fxRate !== undefined ? fxRate : existing.fxRate)
      : null  // KRW는 항상 null

    // 교차 검증: amountNet <= amountGross, taxAmount <= amountGross
    if (nextNet > nextGross) {
      return NextResponse.json({ error: '세후 금액이 세전 금액을 초과할 수 없습니다.' }, { status: 400 })
    }
    if (nextTax != null && nextTax > nextGross) {
      return NextResponse.json({ error: '세금이 세전 금액을 초과할 수 없습니다.' }, { status: 400 })
    }

    // USD는 반드시 유효한 fxRate가 있어야 함
    if (existing.currency === 'USD' && (!nextFxRate || !Number.isFinite(nextFxRate) || nextFxRate <= 0)) {
      return NextResponse.json({ error: 'USD 배당은 유효한 환율이 필요합니다.' }, { status: 400 })
    }

    // 서버 측 amountKRW 재계산
    const serverAmountKRW = calcAmountKRW(nextNet, existing.currency, nextFxRate)

    const updated = await prisma.dividend.update({
      where: { id: params.id },
      data: {
        exDate: exDate !== undefined ? (exDate ? new Date(exDate) : null) : undefined,
        payDate: payDate ? new Date(payDate) : undefined,
        amountGross: amountGross ?? undefined,
        amountNet: amountNet ?? undefined,
        taxAmount: taxAmount !== undefined ? taxAmount : undefined,
        fxRate: nextFxRate,
        amountKRW: serverAmountKRW,
        reinvested: reinvested !== undefined ? reinvested : undefined,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('PUT /api/dividends/[id] error:', error)
    return NextResponse.json({ error: '배당 수정에 실패했습니다.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const existing = await prisma.dividend.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: '배당 기록을 찾을 수 없습니다.' }, { status: 404 })
    }

    await prisma.dividend.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/dividends/[id] error:', error)
    return NextResponse.json({ error: '배당 삭제에 실패했습니다.' }, { status: 500 })
  }
}
