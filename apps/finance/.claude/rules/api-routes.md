# API Routes 규칙

이 규칙은 src/app/api/**/*.ts 파일에 적용.

- 모든 route handler는 try-catch로 감싸고, 에러 시 `{ error: string }` 형태로 응답
- DB 접근은 반드시 `@/lib/prisma`의 singleton client 사용
- Trade 생성 시 Holding 업데이트를 Prisma transaction으로 묶을 것
- 금액 관련 응답은 항상 currency 필드 포함
- 날짜는 ISO 8601 형식으로 반환
