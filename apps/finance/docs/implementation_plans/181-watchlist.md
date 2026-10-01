# 17-D: 관심종목 웹 관리 — 구현 계획

## 변경 파일

### 신규
- `src/app/api/watchlist/route.ts` — GET, POST
- `src/app/api/watchlist/[id]/route.ts` — PUT, DELETE
- `src/app/watchlist/page.tsx`
- `src/app/watchlist/WatchlistClient.tsx`
- `src/components/watchlist/WatchlistTable.tsx`
- `src/components/watchlist/WatchlistForm.tsx`

### 수정
- `src/components/layout/nav-config.ts` — 포트폴리오 그룹에 관심종목 추가

## 구현 순서
1. Watchlist CRUD API (GET+POST, PUT+DELETE)
2. WatchlistTable + WatchlistForm
3. /watchlist 페이지 + WatchlistClient
4. nav-config 메뉴 추가
