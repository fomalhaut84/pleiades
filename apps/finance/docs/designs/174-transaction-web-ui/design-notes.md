# 거래 웹 UI + 네비게이션 개편 디자인 노트 — #174

## 디자인 방향

기존 디자인 시스템 100% 유지. CategoryForm/CategoryDeleteModal 패턴 재사용.
신규 디자인 요소 최소화, 기존 패턴과 일관성 유지.

## 네비게이션 개편

### 사이드바 그룹 변경
- 기존 3개 그룹 (포트폴리오, 분석, AI & 전략) → 4개 그룹
- **신규 "가계부" 그룹**: 가계부 + 카테고리 (기존 "분석"에서 분리)
- "분석" 그룹: 세금, 시뮬레이터, 수익률 분석만 유지
- 이후 Phase에서 추가 예정: 예산(16-C), 반복 거래(16-E), 관심종목(17-D), 설정(17-E)

### 용어 변경
- Trade 메뉴: "거래" → **"종목 거래"**
- Transaction UI: "거래 내역" → **"가계부 내역"**, "거래 추가" → **"내역 추가"**

### 모바일 하단 탭 변경
- 기존: 대시보드 | 거래 | 세금 | 더보기
- 변경: 대시보드 | **종목 거래** | **가계부** | 더보기
- 세금은 "더보기"에서 접근 (가계부가 더 자주 사용)

## 가계부 페이지 변경

### "내역 추가" 버튼
- 위치: 페이지 헤더 우측 (CategoryClient와 동일 패턴)
- 스타일: sodam 컬러 (bg-sodam/15 text-sodam border-sodam/25)
- 클릭 → TransactionForm 슬라이드 패널 오픈

### TransactionTable 확장
- 신규 "액션" 컬럼 추가 (우측 끝)
- 수정 아이콘: 연필 SVG, hover 시 surface 배경
- 삭제 아이콘: 휴지통 SVG, hover 시 red-dim 배경 + red 텍스트
- 제목 변경: "최근 거래 내역" → "최근 가계부 내역"

## 신규 컴포넌트

### TransactionForm (슬라이드 패널)
- CategoryForm과 동일한 슬라이드 패널 패턴 (우측 420px)
- 필드: 금액, 내용, 카테고리 (select with optgroup), 날짜
- 카테고리 select: optgroup으로 소비/수입 분리, 이모지 아이콘 포함
- 소비/수입 구분: 카테고리 type에 따라 자동 결정 (별도 토글 없음)
- 수정 모드: 제목 "내역 수정", 버튼 텍스트 "수정", 기존값 prefill

### TransactionDeleteModal (중앙 모달)
- CategoryDeleteModal과 동일한 패턴 (center modal + backdrop blur)
- 삭제 대상 정보 카드: 날짜, 카테고리(아이콘+이름), 내용, 금액
- 경고 문구: "삭제된 내역은 복구할 수 없습니다."
- 삭제 버튼: red 계열

## UI 컴포넌트 결정

| 요소 | 구현 방식 |
|------|----------|
| 내역 추가 버튼 | sodam 컬러 버튼 (CategoryClient 패턴) |
| 내역 폼 | 우측 슬라이드 패널 420px (CategoryForm 패턴) |
| 카테고리 선택 | select + optgroup (소비/수입 분리) |
| 수정 | 같은 슬라이드 패널, 기존값 prefill |
| 삭제 확인 | 중앙 모달 (CategoryDeleteModal 패턴) |
| 테이블 액션 | 연필 + 휴지통 아이콘 버튼 |

## 색상 참조

- 내역 추가 버튼: `bg-sodam/15 text-sodam border-sodam/25`
- 삭제 버튼: `bg-red/15 text-red border-red/25`
- 소비 금액: `#f87171` (red-400)
- 수입 금액: `#34d399` (emerald-400)
- 액션 아이콘 기본: `var(--dim)`, hover: `var(--text)`
- 삭제 아이콘 hover: `bg-red/10 text-red`
