# 베스팅 캘린더 light/dark 토글 + 컬러 contrast 보강

- **작성일**: 2026-06-30
- **타입**: enhancement (P2)
- **참조**: `docs/designs/307-vesting-calendar/design-notes.md` 의 "light/dark 토글" 항목

## 1. 배경

design-notes 명시:
- 다크 기본 + light 토글 즉시 반영
- 헤더에 테마 토글
- Tailwind utility (amber-50 등) 도 `dark:` prefix 또는 CSS 변수 mix

진단:
- next-themes + ThemeProvider + ThemeToggle 인프라는 **이미 존재** (사이드바 + 모바일 BottomTab 등록)
- 베스팅 캘린더 페이지의 일부 색상은 **다크 고정 가정** — light 모드에서 contrast 약함:
  - `text-red-400/80` (일요일 헤더) — light 에서 옅음
  - `text-red-400` (일요일 셀) — light 에서 옅음
  - `bg-amber-500/10 ring-amber-500/40` (오늘 셀) — light bg 위에서 살짝 약함
  - `text-amber-400` (만료 임박 카드) — light 에서 옅음

## 2. 요구사항

- [ ] **R1**: 베스팅 캘린더 Header 에도 `ThemeToggle` 추가 (design-notes "헤더 토글" 의도, 이미 사이드바에 있지만 페이지에서도 한 번 더)
- [ ] **R2**: 다크 고정 색상 4 곳에 `dark:` variant 추가 — light 모드에서 진한 shade 사용

## 3. 변경

### `src/app/vesting/page.tsx`
- `ThemeToggle` import + Header children 에 추가 (캘린더 내보내기 버튼 옆)
- 만료 임박 카드 컬러: `text-amber-400` → `text-amber-600 dark:text-amber-400`

### `src/components/vesting/VestingCalendar.tsx`
- 일요일 헤더: `text-red-400/80` → `text-red-500/80 dark:text-red-400/80`
- 일요일 셀: `text-red-400` → `text-red-500 dark:text-red-400`
- 오늘 셀: `bg-amber-500/10 ring-amber-500/40` → `bg-amber-500/10 dark:bg-amber-500/15 ring-amber-500/50 dark:ring-amber-500/40`

## 4. 검증

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 수동: `/vesting` 페이지 다크/라이트 토글 → 색상 contrast 자연스러운지

## 5. 제외 사항

- 다른 페이지 light 색상 검수 — 별도 phase
- next-themes 인프라 자체 (이미 존재)
