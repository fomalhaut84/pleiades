# Phase 39-A: 모바일 반응형 감사 리포트 (Discovery)

**대상**: 17차 마일스톤 (#443) 서브이슈 #450
**작성일**: 2026-07-14
**방식**: 정적 코드 감사 (grep 기반 anti-pattern 스캔). 브라우저 시각 검증은 39-B 수정 시 spot-check 로 병행.
**뷰포트 기준**: iPhone SE 375 · iPhone Pro Max 430 · iPad 768

---

## Executive Summary

**총평:** 모바일 기반 인프라는 대체로 잘 갖춰짐. 골격 (responsive padding, 테이블 overflow wrapper, Sidebar↔BottomTab 분기, `ResponsiveContainer` 차트, **모든 모달 overlay `px-4`**) 은 모두 정상 동작. 실제 UX pain 은 **밀집한 데이터 테이블의 수평 스크롤 pain** 이 유일한 상위 이슈.

**H(High) 1개 / M(Medium) 4개 / L(Low) 3개** 로 분류. H 는 39-B 필수, M 은 39-B/C 병행, L 은 follow-up 이슈 후보.

**[Codex #459 P2 반영]** 초기 audit 은 `w-full max-w-lg` 모달 두 개 (Strategy Edit, Alert Detail) 를 H1 로 flag 했으나 오탐이었다. 두 모달 모두 overlay 에 `px-4` (`fixed ... justify-center px-4`) 가 있어 375 viewport 에서 `w-full` 이 padded content (343px) 로 resolve → `max-w-lg` (512px) 는 wider screen 만 cap. 실제 clipping 없음. 전체 모달 overlay 12개 조사 결과 모두 `px-4` 있음.

---

## 감사 통과 항목 (✓ 문제 없음)

| 검사 항목 | 결과 |
|---|---|
| 모든 페이지 responsive padding (`px-4 sm:px-6 lg:px-8`) | ✓ 13개 페이지 모두 통과 |
| 모든 `<table>` 상단 wrapper 에 `overflow-x-auto` | ✓ 15개 테이블 모두 통과 |
| `Sidebar` (hidden lg:flex) ↔ `BottomTab` (lg:hidden) 분기 | ✓ 정상 |
| 차트 `ResponsiveContainer` 사용 | ✓ dashboard/expense/performance 모두 통과 |
| Toast: `w-[calc(100vw-2rem)] max-w-[360px]` | ✓ viewport 좁을 때 auto-fit |
| Side panel form modals: `max-w-[420px]` | ✓ 430 viewport 까지 여유, 375 도 clipping 없음 (`h-full` + slide-in) |
| Delete confirm modals: `max-w-[380px]` | ✓ 375 viewport 여유 |
| **Center-align modals (Strategy Edit, Alert Detail, 그 외 12개)**: overlay `px-4` 안에 `w-full max-w-lg` | ✓ 375 viewport 에서 `w-full` → 343px (padded), `max-w-lg` (512px) 는 wider screen 만 cap → clipping 없음 |

---

## H (High) — 39-B 반드시 수정

### ~~H1. 대형 모달이 375px 뷰포트 초과 → clipping~~ (오탐, Codex #459 P2)

**철회 사유**: overlay 가 `fixed ... justify-center px-4` 로 padding → `w-full` 이 padded content (343px @ 375 viewport) 로 resolve. `max-w-lg` (512px) 는 wider screen 만 cap → 실제 clipping 없음. 전체 12개 center-align modal 조사 결과 모두 동일 패턴. **39-B 스코프에서 제거.**

---

### H1. 데이터 테이블 8+ 컬럼 → 수평 스크롤 pain (기존 H2)

**증상**: `overflow-x-auto` 는 있어서 body horizontal overflow 는 방지되지만, 사용자가 좌우 반복 스크롤 필요. 375 viewport 에서 8컬럼 = 셀당 ~50px → 종목명·수치가 잘려서 보임 (`truncate` 도 어색).

**대상**:
- `src/components/dashboard/HoldingsTable.tsx` — 8 컬럼 (종목/평단/현재가/평가금액/손익률/전략 등)
- `src/components/watchlist/WatchlistTable.tsx` — 8 컬럼
- `src/components/expense/TransactionTable.tsx` — 6 컬럼 (그중 카테고리·설명 긴 문자열)

**Fix 방향 (선택지):**
- (a) 카드 UI 전환 — mobile 에서 `lg:table` 스타일 유지, `<lg` 은 카드 스택 (한 row = 한 카드).
- (b) 컬럼 우선순위화 — mobile 은 top-3 컬럼만 (종목·손익률·평가금액), 나머지는 접힘/detail modal.
- (c) 그대로 두고 hint 표시 ("← 좌우로 스크롤") — 최소 개입, UX 는 여전히 나쁨.

**권장:** (a) or (b). 대시보드 HoldingsTable / WatchlistTable 은 접근 빈도 최상위.

**심각도 근거:** 사용자가 매일 여러 번 대시보드 확인. 손익 한눈에 파악이 목표인데 좌우 스크롤이 강요됨 → 방문 만족도 저하.

---

## M (Medium) — 39-B/C 병행 가능

### M1. 아이콘-only 액션 버튼이 44px 미만 (코드베이스 sweep)

**증상**: 두 패턴 모두 sub-44 hitbox → 손가락 큰 사용자 mis-tap.
- 패턴 A (form 헤더 닫기): `p-1.5` + 16px svg = **28px**
- 패턴 B (테이블 액션): `inline-flex ... w-[26px] h-[26px]` = **26px** explicit
- 패턴 C (CategoryTable): `p-1.5` + 13~14px svg = **26~28px**

**대상 (코드베이스 sweep — Codex #459 P2×3 반영, 실제 className 별 분류):**

_form 헤더 닫기 (`p-1.5` + 16px svg — 28px 실효):_
- `src/components/expense/TransactionForm.tsx:218` · `RecurringForm.tsx:114`
- `src/components/asset/AssetForm.tsx:120`
- `src/components/rsu/RSUForm.tsx:105`
- `src/components/deposit/DepositEditPanel.tsx:100`
- `src/components/category/CategoryForm.tsx:86` · `CategoryEditPanel.tsx:102`
- `src/components/settings/IncomeProfileManager.tsx:162`
- `src/components/stock-option/StockOptionForm.tsx:107`
- `src/components/watchlist/WatchlistForm.tsx:97`
- `src/components/dividend/DividendEditPanel.tsx:129`
- **`src/components/trade/EditPanel.tsx:131`** (Codex #459 P2 — 초기 누락)

_테이블 액션 (`w-[26px] h-[26px]` explicit — 26px):_
- `src/components/expense/BudgetManager.tsx:214,223` (edit / delete)
- `src/components/expense/RecurringTable.tsx:93,102` (edit / delete)
- `src/components/watchlist/WatchlistTable.tsx:91,94` (edit / delete)

_테이블 액션 (`p-1.5` + 소형 svg — 28px, w-[26px] 패턴이 아니라 grep 놓쳤던 케이스):_
- `src/components/deposit/DepositTable.tsx:120,129,157,165` (edit / delete)
- `src/components/dividend/DividendTable.tsx:143,152,184` (edit / delete)
- `src/components/trade/TradeTable.tsx:149,158,194` (edit / delete)
- `src/components/expense/TransactionTable.tsx:106,117,128` (edit / delete / recurring)

_테이블 액션 (`w-7 h-7` explicit — 28px):_
- `src/components/asset/AssetTable.tsx:110,119` (edit / delete)
- `src/components/rsu/RSUDashboard.tsx:188` (편집)

_초소형 (`p-0.5` — Codex #459 P2 추가 확인, 실효 ~20px):_
- `src/components/stock-option/StockOptionCRUD.tsx` (edit / delete)

_CategoryTable (`p-1.5` + 13~14px svg — 26~28px):_
- `src/components/category/CategoryTable.tsx:100,103`

**39-B sweep 명령 (Codex #459 P2 반영 — multiline 안전):**
```bash
# 4개 패턴 union. `| grep -E 'button|Button'` 필터는 className 이 <button 과 별개 줄에
# 있으면 놓치므로 사용 금지 — 대신 rg -B2 로 상단 <button 확인.
# ripgrep 은 `tsx` 를 별도 type 으로 안 잡음 (`rg --type-list` → ts: *.cts,*.mts,*.ts,*.tsx).
# `--type ts` (tsx 포함) 또는 `-g '*.tsx'` glob 사용:
rg -n --type ts -B2 'p-1\.5|p-0\.5|w-\[26px\] h-\[26px\]|w-7 h-7' src/components/

# 또는 grep 만 사용해 raw 리스팅 (수동 필터):
grep -rn 'p-1\.5\|p-0\.5\|w-\[26px\] h-\[26px\]\|w-7 h-7' src/components/
```
4개 패턴 union 이 코드베이스 실체. `p-0.5` 는 StockOptionCRUD 만 사용 (최소 hitbox ~20px).

**Fix 방향** (Codex #459 P2×2 반영):
아이콘 크기가 소형 (13~16px) 이라 padding 만으로는 44px 달성 안 됨 — 초기 audit 은 `p-2.5` (36px) 로 계산 실수. **hitbox 를 padding 이 아닌 explicit 치수로 잠금**:
- 공통 `IconButton` 컴포넌트: `w-11 h-11 flex items-center justify-center` (44×44 확정) + 아이콘 시각 크기 유지
- 개별 사용처에 `min-w-11 min-h-11` 유틸리티
- accessibility 는 모든 뷰포트 원칙 (sm 분기 지양)
- 39-B 는 **테이블 액션 버튼 (`w-[26px] h-[26px]`) 전체를 IconButton 로 일괄 교체** — 파일 수 많음 (10+)

---

### M2. `BudgetManager` / `RecurringForm` 하드코드 fixed width + **grid track 폭 초과 (Codex #459 P2)**

**증상 (기본 조회 row — 가장 자주 노출):** `src/components/expense/BudgetManager.tsx:190` 이 `grid-cols-[140px_1fr_100px_100px_40px]` 로 fixed track 합 **380px** + `gap-3` (4 gap × 12 = 48px) + `px-5` (좌우 20 = 40px) = **최소 468px** 필요. 375 viewport 에서 상위 카드 `overflow-hidden` (line 147) 이 오른쪽 컬럼 (40px 액션 버튼) 을 잘라냄.

**증상 (미설정 카테고리 row):** line 168 `grid-cols-[140px_1fr_40px]` → 최소 ~ 240 + gaps + padding ≈ 320px. 375 viewport 여유 있음.

**증상 (편집/추가 branch):** `w-[120px]` + `w-[140px]` fixed input 이 여유 공간 압축 — 초기 audit 이 언급한 케이스.

**대상 (완전 목록):**
- `src/components/expense/BudgetManager.tsx:190` — 기본 row grid track (**High priority**, 조회 상시 노출)
- `src/components/expense/BudgetManager.tsx:160` — 편집 branch w-[120px]
- `src/components/expense/BudgetManager.tsx:257` — 추가 form w-[140px]
- `src/components/expense/RecurringForm.tsx:160` (w-[120px]), `:186` (w-[100px])

**Fix 방향** (Codex #459 P2 반영 — grid template 만 바꾸면 자식 수 불일치로 새 layout break):

BudgetManager row 는 5개의 direct grid children (카테고리명 · progress bar · 예산 · 사용 · 액션) 을 렌더. **grid template 변경 시 반드시 마크업 변경도 동반**:

- **옵션 (a) — Numeric 컬럼 두 개 (사용·잔액) 를 mobile 에서 progress bar 셀 안으로 흡수:**

  **컬럼 정정 (Codex #459 P2 반영):** 실제 5개 셀은 순서대로 **[카테고리명 · progress+예산라벨+% · spent (사용) · remaining (잔액) · 액션]**. 초기 audit 은 컬럼 3/4 를 "예산·사용" 으로 잘못 라벨. 실제는:
  - 컬럼 2 (progress cell) 안에 이미 "예산 {formatKRW}" + "N% 초과" 라벨 존재
  - 컬럼 3 = **spent (사용)** — 빨강 강조, mobile 에서 놓치면 사용자가 소비 크기 인지 불가
  - 컬럼 4 = **remaining (잔액)** — 색상 코드 (초록/노랑/빨강) 로 상태 표현. 가장 actionable 한 값

  **주의 (Codex #459 P2):** 액션 셀 (`w-[26px] × 2 + gap ≈ 60px`) 은 M1 fix 로 `w-11 × 2 + gap ≈ 96px` 가 됨. 40px 트랙은 두 44px 버튼을 담을 수 없으니 mobile 트랙 폭을 **`auto` 로 자연 fit** 필수.

  **Mobile 통합안:** 예산은 progress cell 안 라벨로 유지, 사용·잔액을 mobile 전용 요약 라인 (`sm:hidden`) 으로 progress cell 안에 append. numeric 컬럼 두 개는 `hidden sm:inline` 처리.
  ```
  <div className="grid grid-cols-[minmax(80px,1fr)_1.5fr_auto] sm:grid-cols-[140px_1fr_100px_100px_auto] gap-2 sm:gap-3 ...">
    <span>{카테고리명}</span>
    <div>
      <ProgressBar />
      <div className="flex justify-between text-[11px] text-sub">
        <span>예산 {formatKRW(amount)}</span>
        <span>{pct}%{pct >= 100 ? ' 초과' : ''}</span>
      </div>
      {/* Mobile 전용 요약 — 사용·잔액 (Codex #459 P2: 실 컬럼명 정정).
          잔액 색상은 원본 (line 208) 의 3-state 를 그대로 (Codex #459 P2 재검):
          remaining >= 0 ? (pct >= 70 ? yellow : emerald) : red */}
      <div className="flex justify-between text-[11px] sm:hidden">
        <span className="text-red-400">사용 {formatKRW(spent)}</span>
        <span className={remaining >= 0 ? (pct >= 70 ? 'text-yellow-400' : 'text-emerald-400') : 'text-red-400'}>
          잔액 {formatKRW(remaining)}
        </span>
      </div>
    </div>
    <span className="hidden sm:inline">{formatKRW(spent)}</span>       {/* 사용 */}
    <span className="hidden sm:inline">{formatKRW(remaining)}</span>   {/* 잔액 */}
    <span>{액션 (44×2 + gap ≈ 96px)}</span>
  </div>
  ```
  → mobile 3col (`minmax(80,1fr) + 1.5fr + auto`), 데스크톱 5col. 자식 수 5 유지. 사용·잔액 정보가 mobile 에서도 progress cell 안에서 보존 (색상 코드 유지) — Codex #459 P2 지적한 "잔액 실종" 방지.

- **옵션 (b) — mobile 전용 카드 뷰 스택 (`<lg` block):** 완전한 mobile-only 렌더 트리 분리. 유지보수 부담 증가 대신 layout 자유도 최대.

- **옵션 (c) — 잔액/사용 중 하나만 노출:** 예산/사용/잔액 중 mobile 에서 사용률(%) 로 이미 표현되므로 하나 제거 가능.

**39-B 권장:** (a). 마크업 최소 변경 + 자식 수 유지 + `hidden sm:inline` 으로 안전.

**추가 fixed input 폭 fix (input branch):**
- `w-[120px] sm:w-[140px]` 또는 `flex-1 min-w-0`
- RecurringForm 도 동일

---

### M3. 3-column form grids on 375px

**증상**: `grid grid-cols-3 gap-2` — 375 viewport 에서 셀당 ~110px 이하 → 숫자 input 은 OK, 텍스트 label + select 는 답답.

**대상**:
- `src/components/deposit/DepositForm.tsx:86`
- `src/components/dividend/DividendForm.tsx:166`
- `src/components/trade/TradeForm.tsx:199`
- `src/components/trade/import/StepUpload.tsx:86` / `StepValidation.tsx:113` / `StepResult.tsx:37`
- `src/components/tax/DividendTaxCard.tsx:30`

**Fix 방향**: `grid-cols-1 sm:grid-cols-3` 또는 `grid-cols-2 sm:grid-cols-3`. 특히 form 은 `grid-cols-1` 이 가장 안전.

---

### M4. Filter bar 밀도 — `/admin/mcp-logs`

**증상**: `flex flex-wrap gap-2` 로 대응은 됐지만, 필터 6~10개 (Level x 6 + Msg x 15+) 가 nav bar 스크롤로 이어져 감사 UI 가 세로로 길어짐. `LiveTailPanel` toggle 도 같은 라인.

**대상**:
- `src/app/admin/mcp-logs/McpLogsClient.tsx:231, 250` (level/msg 필터 그리드)

**Fix 방향**: 필터를 `<details>` 로 접기 (mobile), 활성 필터 chip 만 상단 노출. 데스크톱은 그대로.

---

## L (Low) — Follow-up 이슈 후보

### L1. Vesting Calendar `grid-cols-7`

**증상**: 375 viewport 에서 셀당 ~53px, 날짜 라벨 + 뱃지 겹칠 여지. 사용자가 vesting 캘린더를 자주 보지 않으니 우선순위 낮음.

**대상**: `src/components/vesting/VestingCalendar.tsx:81, 89`

**Fix 방향**: 상세 페이지에서만 열리므로 유지 가능. 심각하면 mobile 은 리스트 뷰로 전환.

**해결 (Phase 41-A, #470, 2026-07-21):** `/vesting` 페이지에서 `<VestingCalendar>` 를 `hidden lg:block` 로 감싸 mobile 에서 아예 감춤. 기존 `<VestingList>` 가 이미 다가오는 UPCOMING_DAYS 일 리스트를 링크·계좌·행사가 포함한 상세 카드로 렌더하므로 mobile 은 그것 하나로 완결. 캘린더 그리드 `grid-cols-7` 375px 셀 겹침 회피 + 중복 리스트 방지 (Codex #477 P2 지적 반영).

---

### L2. AI chat 페이지 message max-width

`max-w-[85%] sm:max-w-[75%]` — 375 viewport 에서 85% = 320px, 코드블록·리스트 있으면 좌우 스크롤 유발. 하지만 이미 responsive → sm 이상만 조정. Low.

---

### L3. FamilyTotalCard 3열 고정

3인 가족 카드가 375 viewport 에서 셀당 ~110px → 카드 이름 (세진/소담/다솜) + 총액이 겹치지 않고 표시 확인 완료. 이슈 없음. 필요 시 세로 스택 옵션.

**~~해결 (Phase 41-C, #472, 2026-07-21):~~** 재검증 결과 이름 (2글자) 는 여유 있으나 세진 1억+ 원화 (8자리 `123,456,789원`) 는 `text-[16px]` + p-3 조합에서 tight (요구 ~114px vs 실제 ~110px). 3-col 유지 + mobile 폰트/padding 축소 (`text-[13px] sm:text-[16px]`, `p-2 sm:p-3`) 로 여유 확보. 세로 스택 옵션은 시각 임팩트 큼 → 채택 안 함.

---

## 우선순위 매트릭스 (사용 빈도 × 심각도)

| 항목 | 빈도 | 심각도 | 액션 |
|---|---|---|---|
| ~~H1 모달 clipping~~ | — | — | **철회 (Codex #459 P2 오탐)** |
| H1 HoldingsTable / WatchlistTable 수평 스크롤 | **최상** | H | **39-B 필수** |
| M1 아이콘 닫기 버튼 <44px | 상 | M | 39-B (공용 IconButton 도입) |
| M2 BudgetManager fixed w-[120/140] | 중 | M | 39-B |
| M3 3-col form grids | 중 | M | 39-B 또는 39-C |
| M4 mcp-logs 필터 밀도 | 하 | M | **39-C** (admin/mcp-logs 는 v2 페이지 재감사 대상) |
| L1 Vesting calendar | 하 | L | Follow-up |
| L2 AI chat max-w | 하 | L | Follow-up |
| L3 FamilyTotalCard | 하 | L | 이슈 없음 |

---

## 39-B / 39-C 스코프 제안

### 39-B (모바일 상위 페이지 개선 — #451)
**포함 (Codex #459 P2 반영 — H1/M1/M2 파일 완전 목록):**
- **H1**: HoldingsTable, WatchlistTable, **TransactionTable** 카드 뷰 or 컬럼 우선순위화 (3 파일 — TransactionTable 은 6컬럼이지만 카테고리·설명 긴 문자열로 실 pain 큼)
- **M1**: 공용 `IconButton` (`w-11 h-11`) 도입 + 아래 세 카테고리 sweep:
  - form 헤더 닫기 (10 파일)
  - 테이블 액션 (`w-[26px] h-[26px]` explicit — BudgetManager · RecurringTable · WatchlistTable · DepositTable · DividendTable · TradeTable · TransactionTable · AssetTable · RSU · StockOption 10+ 파일)
  - CategoryTable edit/delete (1 파일)
- **M2**: BudgetManager row (line 190) grid + 마크업 조정 + 편집/추가 branch fixed width, RecurringForm fixed input (총 2 파일)
- **M3**: form 3-col grids (7 파일) — 시간 남으면

**노력**: M (2~2.5일 — TransactionTable + IconButton sweep 반영으로 소폭 증가)

### 39-C (모바일 v2 신규 페이지 재감사 — #452)
**포함:**
- **AlertHistoryClient (33-B), LiveTailPanel (37-C), McpLogsClient (33-C/37-C/37-D)** — 실기기 뷰포트 3종 spot-check
- M4 mcp-logs 필터 밀도 fix
- 39-B fix 후 재확인 (regression 감지)

**노력**: S (1일)

### Follow-up 이슈 (17차 밖)
- L1 Vesting calendar 리스트 뷰 옵션
- L2 AI chat 코드블록 mobile 처리
- IconButton 도입 시 발견될 accessibility 개선 (`aria-label` 통일)

---

## Screenshots

이번 discovery 는 정적 코드 감사로 진행 — 시각 검증은 39-B 구현 후 spot-check 로 병행. 실기기 캡처가 필요한 이슈는 M4 (McpLogs 필터 밀도 체감) 정도로 39-C 에서 별도 수행.

`screenshots/` 폴더는 39-B 구현 시 before/after 시각 증거로 활용.
