# Phase 39-B — 모바일 상위 페이지 개선 시각 증거

**대상 이슈**: #451 (17차 마일스톤 서브)
**기반 감사**: `docs/designs/443-mobile-audit/audit.md`

## 스코프 요약

| 항목 | 조치 |
|---|---|
| **H1** — 대시보드 · 관심종목 · 가계부 테이블 수평 스크롤 pain | mobile 카드 뷰(`<lg`) + desktop 테이블(`lg:`) 분기 |
| **M1** — 44×44 미만 아이콘 버튼 다수 | 공용 `IconButton` (44×44 고정 hitbox) 도입 + 대상 파일 일괄 교체 |
| **M2** — `BudgetManager` grid 트랙 폭 초과 + `RecurringForm` 고정 input 폭 | grid template mobile 3col/desktop 5col 분기 + 사용·잔액 mobile 요약, input `flex-1 min-w-0` |
| **M3** — 3-col form grids | 실제 각 grid 는 3개의 짧은 항목(계좌명 2글자, 통계 숫자)만 담으므로 375px 에서 셀 폭 ≥ 100px 확보. 보수적으로 스킵 (audit 원문 "시간 남으면") |

## 스크린샷

시각 캡처는 사용자가 브라우저에서 확인 후 이 폴더 하위 `screenshots/` 에 추가할 예정. 정적 코드 감사 + `IconButton` 44×44 강제 사양으로 hitbox 회귀는 unit-테스트 없이 CSS 레벨에서 잠금 상태.

## 검증

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build` (4-check) 필수 통과
- `rg -n --type ts -B2 'p-1\.5|p-0\.5|w-\[26px\] h-\[26px\]|w-7 h-7' src/components/` 로 남은 sub-44 아이콘 잔여물 확인. 이번 sweep 후 잔여물은 (a) 아이콘 버튼이 아닌 다른 style hint (`p-1.5` on wrapper etc.) 만 남음.
