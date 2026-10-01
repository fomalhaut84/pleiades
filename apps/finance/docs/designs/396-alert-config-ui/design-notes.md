# AlertConfig 통합 설정 UI 디자인 노트

## 목적
`/settings` 페이지의 알림 탭을 카테고리별로 그루핑해 사용자가 무슨 기능이 어떤 스위치인지 빠르게 파악.

## 카테고리 매핑 (초안)
| 카테고리 | 색상 (icon) | 키 | 관련 페이지 |
|---|---|---|---|
| 가격/환율 | `--sejin` 📉 | price_drop_pct, price_surge_pct, fx_change_krw | - |
| 가계부 | `--dasom` 💸 | budget_warn_pct | `/budgets` |
| 스케줄 | `--sodam` 🕰️ | daily_summary_hour, monthly_report_day | - |
| AI & 전략 | `--amber` 🧠 | ta_check_interval_min, ta_ai_guide, active_review, custom_strategy_alerts | `/strategies` |

## 레이아웃
1. **기존 탭 유지** (계좌 / 알림 / 근로소득 / 후잉 연동)
2. **알림 탭 진입 시**:
   - Summary strip: 전체 / 활성 / 비활성 / 카테고리 (4 카드)
   - 카테고리 섹션 반복 (모두 기본 펼침)

## 섹션 구조
- 헤더: icon (원형 배경) + 카테고리명 + 설명 + 키 개수 + 관련 페이지 링크 + ▾ 토글
- 바디: 키 행 반복
  - 행 좌: label + code (모노스페이스) + description (선택)
  - 행 우: 값 배지 (숫자+단위) 또는 toggle 스위치 + 수정 버튼

## 입력 타입 매핑
- **on/off 문자열** (ta_ai_guide, active_review, custom_strategy_alerts) → toggle 스위치
- **숫자 %** (price_drop_pct, price_surge_pct, budget_warn_pct) → number input + `%` 단위
- **정수** (fx_change_krw 원, ta_check_interval_min 분, daily_summary_hour 시, monthly_report_day 일) → number input + 단위

## 인터랙션
- 섹션 헤더 클릭: 접힘/펼침 (로컬 저장 선택)
- 수정 버튼: 인라인 편집 → 저장/취소
- toggle: 즉시 PUT (낙관적 UI + 실패 롤백)

## 반응형
- 데스크톱: max-w-4xl, 여유롭게
- 모바일: summary strip 2x2, 섹션은 동일

## 색상 근거
- 가격/환율은 `--sejin` (녹색 = 시세 관련, 세진 컬러 재사용)
- 가계부는 `--dasom` (주황 = 지출 신중)
- 스케줄은 `--sodam` (파랑 = 시간/체계)
- AI & 전략은 `--amber` (황금색 = 지능/자동)

## 접근성
- 각 toggle 에 `role="switch"` + `aria-checked`
- 색상만이 아니라 텍스트 상태 표기 (예: 값 배지 자체)
- 키보드로 편집 가능 (Tab 순서, Enter 저장, Esc 취소)

## 확장성
- 신규 키 추가 시 서버 코드 상수 매핑에 카테고리 지정만 하면 UI 자동 반영
- 카테고리 자체를 추가하려면 CATEGORIES 배열 갱신 + section 렌더링 자동 확장

## 마이그레이션
- AlertConfig 스키마에 `category` 컬럼 추가 vs 서버 코드 상수 매핑 유지 → **후자 (스키마 변경 최소화)**
- 이유: category 는 개발자가 정의, 사용자 수정 불필요. 코드 상수 map (`ALERT_KEY_CATEGORY` 등) 으로 관리하는 편이 안전.
- 알 수 없는 키는 "일반" 카테고리로 자동 분류 (fallback).
