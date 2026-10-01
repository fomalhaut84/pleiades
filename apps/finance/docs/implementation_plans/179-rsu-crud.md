# 17-B: RSU 스케줄 CRUD — 구현 계획

## 변경 파일 목록

### 신규
- `src/app/api/rsu/[id]/route.ts` — PUT, DELETE
- `src/components/rsu/RSUForm.tsx` — 추가/수정 슬라이드 패널
- `src/components/rsu/RSUDeleteModal.tsx` — 삭제 확인 모달

### 수정
- `src/app/api/rsu/route.ts` — POST 추가
- `src/components/rsu/RSUDashboard.tsx` — 추가 버튼, 수정/삭제 아이콘, 폼/모달 통합
- `src/app/rsu/page.tsx` — 계좌 목록 전달 (폼 select용)

## 패키지 추가
없음

## DB 마이그레이션
없음

## 구현 순서

### Step 1: POST /api/rsu + PUT/DELETE /api/rsu/[id]
- POST: 스케줄 생성 (accountId, vestingDate, shares, basisValue 등)
- PUT: pending 상태만 수정 가능
- DELETE: pending 상태만 삭제 가능

### Step 2: RSUForm (슬라이드 패널)
- 기존 슬라이드 패널 패턴
- 필드: 계좌, 베스팅일, 수량, 기준금액, 기준일, 매도/보유 예정, 메모

### Step 3: RSUDeleteModal
- 기존 삭제 모달 패턴

### Step 4: RSUDashboard 확장
- "+ RSU 추가" 버튼
- 카드별 수정/삭제 아이콘 (pending만)
- 폼/모달 상태 관리 + refetch
