# [Refactor] 모바일 하단 더보기를 nav-config 에서 자동 파생

- **작성일**: 2026-07-02
- **참조**: #391 (2026-07-02 fix — 6개 페이지 누락), `src/components/layout/BottomTab.tsx`, `src/components/layout/nav-config.ts`

## 1. 배경

`nav-config.ts` 는 데스크톱 사이드바를 그루핑해 보여주고, `BottomTab.tsx` 의 `MORE_ITEMS` 는 모바일 더보기를 하드코딩. 두 소스가 분리되어 있어 Phase 16 이후 사이드바에 새 페이지가 추가될 때마다 모바일 쪽이 뒤처지는 drift 반복 (#391 에서 6개 페이지 누락 발견 → 사용자 리포트).

근본 해결: 단일 소스 (`nav-config.ts`) 에서 모바일 더보기를 자동 파생.

## 2. 목표

- [ ] `MORE_ITEMS` 하드코딩 제거
- [ ] `nav-config.ts` 의 `NAV_GROUPS` 에서 "메인 탭 (BottomTab 고정)" 을 제외한 나머지를 flat map 하여 파생
- [ ] 순서는 사이드바와 일치
- [ ] 하위 표시할 아이템 (예: 설정) 예외 처리 지원 (필요 시 `mobileOnly: false` 플래그)
- [ ] 기존 활성 상태 (`isMoreActive`) 계산도 파생된 리스트 사용

## 3. 설계

### `nav-config.ts` 확장
```ts
export interface NavItem {
  href: string
  icon: string
  label: string
  hiddenOnMobile?: boolean  // true 시 모바일 더보기 제외
}
```

### `BottomTab.tsx`
```ts
import { NAV_GROUPS } from './nav-config'

const FIXED_MOBILE_HREFS = new Set(['/', '/trades', '/expenses'])
const MOBILE_MORE_ITEMS = NAV_GROUPS
  .flatMap((g) => g.items)
  .filter((i) => !FIXED_MOBILE_HREFS.has(i.href))
  .filter((i) => !i.hiddenOnMobile)
```

### 예외
- `/settings` 는 기존 MORE_ITEMS 에 없었음 (테마 토글로 접근?). 현재 위치 유지 검토.

## 4. 테스트

- [ ] 유닛: `MOBILE_MORE_ITEMS` 파생 로직 (NAV_GROUPS mock)
- [ ] 시각 확인: nav-config 에 페이지 추가 → 모바일에도 자동 반영
- [ ] 정합성: 사이드바 순서 == 모바일 더보기 순서

## 5. 제외
- 아이콘/라벨 변경 (nav-config 값 그대로 사용)
- 접힘/그룹 표시 (v1 은 flat)

## 6. 완료 시
`BottomTab.tsx` 에서 `MORE_ITEMS` 하드코딩 완전 제거. 향후 신규 페이지 추가 시 nav-config 만 갱신하면 됨.
