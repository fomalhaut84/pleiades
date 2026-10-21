# 카테고리 추천 칩 디자인

## 위치

TransactionForm에서 "내용" 입력 필드와 "카테고리" select 사이.
카테고리 label 바로 아래, select 바로 위에 추천 칩 영역 배치.

## 칩 스타일

기존 프로젝트 뱃지 패턴 (`rounded-full`, `text-[11px]~[12px]`, `font-semibold`, `border`) 준수.

### 기본 상태 (미선택)
```
bg-surface border-border text-sub hover:text-bright hover:border-border-hover
rounded-full px-2.5 py-1 text-[12px] font-medium
```

### 선택 상태
```
bg-sodam/15 border-sodam/30 text-sodam
```

## 칩 내용

- 아이콘 + 카테고리명: `🍽️ 외식`
- 히스토리 소스는 건수 표시: `🥬 식료품 (15건)` — 건수는 `text-dim text-[11px]`

## 동작

- 추천이 없으면 칩 영역 자체를 숨김 (공간 차지 안 함)
- 칩 클릭 시 카테고리 자동 선택 + 칩 영역 사라짐
- `flex flex-wrap gap-1.5 mb-2`로 여러 줄 대응

## 참고

- 다크 테마 기본 (기존 TransactionForm과 동일)
- 모바일 반응형: flex-wrap으로 자연스럽게 줄바꿈
