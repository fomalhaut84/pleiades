/**
 * API 응답 envelope `ApiResponse<T>` 와 헬퍼.
 *
 * 9차 마일스톤 (Phase 27) 의 기반 인프라. 라우트/클라이언트 마이그는 후속 sub-phase
 * (27-B/C/D) 에서 점진 적용. 이 파일 자체는 라우트 변경 0건이라 호환성 100% 보장.
 *
 * 사용 예:
 *   import { ok, fail, paginated } from '@/lib/api-response'
 *
 *   // 단순 성공
 *   return ok({ id: '...', name: '...' })
 *
 *   // 201 Created
 *   return ok(created, { status: 201 })
 *
 *   // 페이지네이션
 *   return paginated(trades, total, limit, offset)
 *
 *   // 실패
 *   return fail('거래를 찾을 수 없습니다.', 404)
 */

import { NextResponse } from 'next/server'

export interface ApiResponseMeta {
  total: number
  limit: number
  offset: number
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: ApiResponseMeta
}

interface OkOptions {
  status?: number
  meta?: ApiResponseMeta
}

/**
 * No-body HTTP status. Response 생성자가 body 동봉을 거부하므로 별도 처리.
 * RFC 9110 §15.4.5 (304), RFC 9110 §15.3.5 (204), §15.3.6 (205).
 */
const NO_BODY_STATUSES = new Set([204, 205, 304])

/**
 * 본문 없는 성공 응답 (HTTP 204 No Content 기본).
 * DELETE / 빈 ack 용. status 옵션으로 205, 304 도 사용 가능.
 */
export function noContent(status = 204): NextResponse {
  if (!NO_BODY_STATUSES.has(status)) {
    throw new Error(`noContent() requires a no-body status (204/205/304), got ${status}`)
  }
  return new NextResponse(null, { status })
}

/**
 * 성공 응답. status 미지정 시 200.
 *
 * status 가 no-body (204/205/304) 면 자동으로 noContent() 와 동일하게 처리.
 * 이때 data 와 meta 는 운반 불가하므로 무시된다 (의도된 동작 — RFC 9110 § 15 가
 * body 자체를 허용하지 않음).
 */
export function ok<T>(data: T, options?: OkOptions): NextResponse {
  const status = options?.status ?? 200
  // no-body status 는 NextResponse.json 이 TypeError 를 던지므로 자동 분기
  if (NO_BODY_STATUSES.has(status)) {
    return noContent(status)
  }
  const body: ApiResponse<T> = { success: true, data }
  if (options?.meta) body.meta = options.meta
  return NextResponse.json(body, { status })
}

/** 실패 응답. status 미지정 시 400. */
export function fail(error: string, status = 400): NextResponse {
  const body: ApiResponse<never> = { success: false, error }
  return NextResponse.json(body, { status })
}

/**
 * 페이지네이션 성공 응답.
 * meta 에 total/limit/offset 포함.
 */
export function paginated<T>(
  data: T[],
  total: number,
  limit: number,
  offset: number,
  status = 200,
): NextResponse {
  return ok(data, { status, meta: { total, limit, offset } })
}
