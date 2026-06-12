# 구현 계획: 텔레그램 봇 standalone 분리 (#214)

## 변경 파일 (5개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/bot/standalone.ts` (신규) | 봇 진입점: long polling + cron + scheduler + graceful shutdown |
| 2 | `package.json` | `build:bot` 스크립트 추가, `build`에 포함 |
| 3 | `src/instrumentation.ts` | cron/scheduler 호출 제거 |
| 4 | `ecosystem.config.js` | `myfinance-bot` 프로세스 추가 |
| 5 | `src/app/api/bot/webhook/route.ts` (삭제) | webhook route 제거 |

## 구현 순서

1. `standalone.ts` 작성 (봇 + cron + scheduler)
2. `package.json`에 `build:bot` 추가
3. `instrumentation.ts` 정리
4. `ecosystem.config.js` 업데이트
5. webhook route 삭제
6. 빌드 검증

## esbuild 번들 설정

```
esbuild src/bot/standalone.ts --bundle --platform=node --target=node20
  --outfile=dist/bot/standalone.cjs
  --alias:@=./src
  --external:@prisma/client
  --external:grammy
  --external:node-cron
  --external:yahoo-finance2
  --external:trading-signals
```

네이티브 모듈/대형 패키지는 external 처리, node_modules에서 직접 resolve.

## 패키지 추가: 없음
## DB 마이그레이션: 없음
