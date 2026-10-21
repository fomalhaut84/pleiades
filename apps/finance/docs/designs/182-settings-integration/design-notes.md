# 설정 통합 페이지 디자인 노트 — #182

## 디자인 방향

기존 /settings 페이지의 나머지 탭(알림, 근로소득, 후잉 연동) 구현. 기존 API 활용.

## 탭별 구현

### 알림 탭 (AlertConfigEditor)
- AlertConfig 목록 조회 → 인라인 편집 카드
- 각 설정: label + 현재값 + 수정 버튼
- 수정 → 인라인 input → 저장/취소
- 기존 GET/PUT /api/alerts/config 활용

### 근로소득 탭 (IncomeProfileManager)
- 연도별 프로필 목록 (카드 형태)
- "+ 프로필 추가" 버튼
- 각 카드: 연도, 입력방식(세전총급여/과세표준), 금액, 기납부세액
- 수정/삭제 버튼
- 추가/수정: 슬라이드 패널 폼
- 기존 CRUD /api/income-profiles 활용

### 후잉 연동 탭 (WhooingSettings)
- 웹훅 URL 입력 + on/off 토글
- 기본 결제수단(right 항목) 설정
- 카테고리 → 후잉 항목 매핑 테이블
  - 각 행: 카테고리 아이콘+이름 | 후잉 left 항목 (input) | 후잉 right 항목 (input)
  - 일괄 저장 버튼
- 신규 DB 모델 필요: WhooingConfig, WhooingCategoryMap

## UI 컴포넌트

| 요소 | 구현 방식 |
|------|----------|
| AlertConfigEditor | 인라인 편집 카드 리스트 |
| IncomeProfileManager | 카드 리스트 + 슬라이드 폼 |
| WhooingSettings | URL 입력 + 토글 + 매핑 테이블 |
