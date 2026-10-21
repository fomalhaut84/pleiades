# 대시보드 갱신 + 일일 요약 D-1 변동 + 기타 개선

## 목적

1. 대시보드 갱신 버튼 클릭 후 데이터가 반영되지 않는 버그 수정
2. 일일 포트폴리오 요약에 전일 대비 변동액/변동률 추가
3. 로드맵 완료 항목 정리

## 요구사항

- [ ] 대시보드 페이지 `force-dynamic` 추가 (캐싱 방지)
- [ ] prices/refresh API `force-dynamic` 추가 (일관성)
- [ ] 일일 요약: 전일 대비 변동액/변동률 표시 (계좌별 + 총합)
- [ ] 스냅샷 없을 때 graceful fallback
- [ ] roadmap.md 완료 항목 체크

## 변경 파일

1. `src/app/page.tsx` — force-dynamic 1줄
2. `src/app/api/prices/refresh/route.ts` — force-dynamic 1줄
3. `src/bot/notifications/daily.ts` — D-1 변동 로직
4. `docs/roadmap.md` — 완료 체크

## 테스트 계획

- [ ] 대시보드 갱신 버튼 → 데이터 즉시 반영
- [ ] 일일 요약 → D-1 변동 표시
- [ ] lint + typecheck + build 통과
