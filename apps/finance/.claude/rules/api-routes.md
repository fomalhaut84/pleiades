# API Routes 규칙

이 규칙은 src/app/api/**/*.ts 파일에 적용.

- 모든 route handler는 try-catch로 감싸고, 에러 시 `{ error: string }` 형태로 응답
- DB 접근은 반드시 `@/lib/prisma`의 singleton client 사용
- Trade 생성 시 Holding 업데이트를 Prisma transaction으로 묶을 것
- 금액 관련 응답은 항상 currency 필드 포함
- 날짜는 ISO 8601 형식으로 반환
- DELETE 핸들러는 본문 없이 `new NextResponse(null, { status: 204 })` 로 응답. `{ success: true }` 등 wrapper 금지
- catch 블록에서 `error.message` 를 그대로 노출하지 않는다. 사용자에게 보여도 안전한 비즈니스 예외는 `@/lib/api-errors` 의 `businessErrorResponse(err)` 로 통과시키고, 그 외는 한국어 정적 메시지(`'서버 오류가 발생했습니다.'` 등)로 응답
