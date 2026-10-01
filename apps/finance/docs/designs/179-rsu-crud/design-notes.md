# RSU 스케줄 CRUD 디자인 노트 — #179

## 디자인 방향

기존 RSUDashboard에 추가/수정/삭제 기능을 확장. 기존 CRUD 패턴(슬라이드 폼 + 삭제 모달) 재사용.

## 변경 영역

### RSUDashboard 확장
- 헤더에 "+ RSU 추가" 버튼 (sodam 색상)
- 각 스케줄 카드에 수정(연필) / 삭제(휴지통) 아이콘 추가
- vested 상태: 수정/삭제 비활성화 (opacity 0.3)
- pending 상태만 수정/삭제 가능

### RSUForm (슬라이드 패널)
- 기존 CategoryForm 패턴 (420px 우측 슬라이드)
- 필드:
  - 계좌: select (세진/소담/다솜)
  - 베스팅일: date input
  - 수량: number
  - 기준금액: number (원)
  - 기준일: date (optional)
  - 매도 예정 수량: number (optional)
  - 보유 예정 수량: number (optional)
  - 메모: text (optional)
- 수정 모드: 기존값 prefill

### RSUDeleteModal
- 기존 CategoryDeleteModal 패턴 (중앙 모달)
- 정보 카드: 베스팅일, 수량, 기준금액
- pending 상태만 삭제 가능
- "삭제된 RSU 스케줄은 복구할 수 없습니다."

## UI 컴포넌트

| 요소 | 구현 방식 |
|------|----------|
| 추가 버튼 | sodam 색상, 헤더 우측 |
| 폼 | 우측 슬라이드 패널 420px |
| 삭제 확인 | 중앙 모달 |
| 액션 버튼 | 연필 + 휴지통 아이콘 (vested 비활성) |
