# Phase 12: 순자산 대시보드 — 구현 계획 (사후 기록)

## 서브 이슈
- #138: 12-A Asset + NetWorthSnapshot DB 모델 + CRUD API
- #140: 12-B 텔레그램 /순자산, /자산 커맨드
- #142: 12-C 순자산 스냅샷 자동화 (월별 cron)
- #144: 12-D 웹 순자산 대시보드 페이지

## 주요 변경 파일
```
신규:
  prisma/migrations/ — Asset, NetWorthSnapshot 모델
  src/app/api/assets/ — CRUD API
  src/app/api/networth/ — 순자산 계산 API
  src/app/networth/ — 순자산 대시보드 페이지
  src/bot/commands/networth.ts — /순자산, /자산
  src/cron/networth-snapshot.ts — 월별 스냅샷
  src/components/networth/ — 파이차트, 추이 라인차트, 자산/부채 목록
```

## DB 마이그레이션
- Asset, NetWorthSnapshot 모델 추가

## 구현 순서
1. Asset + NetWorthSnapshot 모델 + 마이그레이션
2. Asset CRUD API + 순자산 계산 API
3. 텔레그램 /순자산, /자산 커맨드
4. 월별 스냅샷 cron (MCP 도구 포함)
5. 웹 대시보드 (파이차트 + 추이 + 자산/부채)
