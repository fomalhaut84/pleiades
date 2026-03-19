# Phase 12: 순자산 대시보드 (Net Worth Tracker)

## 목적

주식 포트폴리오 + 비주식 자산(예적금, 보험, 부동산, 연금) + 부채를 통합 관리.
월별 순자산 추이를 추적하여 가족 전체 재무 건전성을 파악.

## 서브 이슈

- [x] **12-A**: Asset + NetWorthSnapshot DB 모델 + CRUD API
- [ ] **12-B**: 텔레그램 /순자산, /자산 커맨드
- [ ] **12-C**: 순자산 스냅샷 자동화 (월별 cron)
- [ ] **12-D**: 웹 순자산 대시보드 페이지

## 상세 설계

`docs/milestone-3.md` Phase 12 섹션 참조

---

## 12-A: Asset + NetWorthSnapshot DB 모델 + CRUD API

### 요구사항

- [ ] Asset Prisma 모델 (name, category, owner, value, isLiability 등)
- [ ] NetWorthSnapshot Prisma 모델 (월별 스냅샷, breakdown JSON)
- [ ] GET/POST/PUT/DELETE /api/assets API
- [ ] GET /api/networth API (현재 순자산 계산)

### 파일

```
prisma/schema.prisma
src/app/api/assets/route.ts
src/app/api/assets/[id]/route.ts
src/app/api/networth/route.ts
```

---

## 12-B: 텔레그램 /순자산, /자산 커맨드

### 요구사항

- [ ] /순자산 — 현재 순자산 요약 (주식 + 비주식 - 부채)
- [ ] /자산목록 — 전체 자산/부채 현황
- [ ] /자산추가 [이름] [카테고리] [금액] — 비주식 자산 등록
- [ ] /자산수정 [이름] [금액] — 금액 업데이트

### 파일

```
src/bot/commands/networth.ts
```

---

## 12-C: 순자산 스냅샷 자동화

### 요구사항

- [ ] 매월 1일 자동 스냅샷 (cron)
- [ ] 주식은 PriceCache에서 실시간 계산
- [ ] 비주식 자산은 마지막 수동 업데이트 값 사용
- [ ] MCP 도구 추가 (get_networth)

### 파일

```
src/bot/notifications/networth-snapshot.ts
src/bot/notifications/scheduler.ts
src/mcp/tools/networth.ts
```

---

## 12-D: 웹 순자산 대시보드 페이지

### 요구사항

- [ ] /networth 페이지 (사이드바 메뉴 추가)
- [ ] 순자산 총액 카드 + 자산 카테고리별 파이차트
- [ ] 순자산 추이 라인차트 (월별)
- [ ] 전월/전년 대비 변화율
- [ ] 자산/부채 목록 + 편집 기능

### 파일

```
src/app/networth/page.tsx
src/app/networth/NetWorthClient.tsx
```

---

## 제외 사항

- 적금 이율 기반 현재가 자동 추정 (향후)
- 목표 순자산 게이지 (향후)

## 테스트 계획

```bash
npm run lint && npx tsc --noEmit && npm run build
```
