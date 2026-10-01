# Phase 30-B — 커스텀 전략 웹 UI (`/strategies`)

- **작성일**: 2026-07-01
- **참조**: [385-milestone-12-master.md](./385-milestone-12-master.md), [380-custom-strategy.md](./380-custom-strategy.md), 이슈 #230 (5)
- **선행 이슈**: Phase 29-E (#380) 완료 (커스텀 전략 백엔드 + 봇 커맨드 존재)

## 1. 목적

봇 커맨드에만 존재하는 커스텀 전략 관리를 웹에서 시각적으로 제공. 등록 → 미리보기 → 확정 → 편집 → 삭제 전 흐름을 CRUD UI 로.

## 2. 요구사항

### API (envelope 준수)
- [ ] `GET /api/custom-strategies` — 전체 목록 조회 (활성/비활성 포함, isActive DESC → createdAt DESC 정렬)
- [ ] `POST /api/custom-strategies/preview` — 자연어 → 파싱 미리보기 (저장 X)
- [ ] `POST /api/custom-strategies` — 등록 (자연어 → parseStrategyText → 저장)
- [ ] `PUT /api/custom-strategies/[id]` — 부분 수정 (name / isActive / frequency / logic)
- [ ] `DELETE /api/custom-strategies/[id]` — 삭제
- [ ] 활성 상한 50 개 검증 (POST 시 count 확인)

### 페이지 `/strategies`
- [ ] 목록 카드 그리드 (모바일 1열 / 데스크톱 3열)
  - 이름, ticker, 조건 요약 (\`price <= 40 AND rsi <= 30\`), 빈도, 활성 배지, 최근 발동일
- [ ] 등록 폼 (페이지 상단)
  - 자연어 텍스트박스 (max 500자, 실시간 char count)
  - "미리보기" 버튼 → 서버 파싱 → 결과 표시 (이름 / ticker / 조건 목록 / 빈도)
  - 파싱 실패 시 에러 메시지 (표현 재조정 안내)
  - 미리보기 확인 후 "등록" 버튼 활성화
- [ ] 카드 개별 액션
  - 활성/비활성 토글 (즉시 PUT)
  - 빈도 셀렉트 (once/daily/always, 즉시 PUT)
  - 이름 편집 (인라인 or 모달)
  - 삭제 (`DeleteModal` 재활용)
- [ ] 조건 자체 편집 X — "삭제 후 재등록" 안내
- [ ] 빈 상태 (등록된 전략 없음) → 등록 폼만 표시 + 예시 3개

### 데이터 일관성
- [ ] 웹 등록/편집/삭제 후 봇 `/커스텀전략목록` 에서 동일 조회
- [ ] `AlertConfig.custom_strategy_alerts` 상태를 페이지 상단 배너로 표시 (off 시 "알림 꺼짐" 안내)

### 접근 제어
- [ ] 기존 auth 미들웨어 통과 (세션 없으면 접근 불가) — 기존 페이지 패턴 준수

## 3. 기술 설계

### 파일 구조
```
src/app/api/custom-strategies/
├── route.ts              // GET (list) + POST (create)
├── preview/route.ts      // POST (parse preview)
└── [id]/route.ts         // PUT (update) + DELETE

src/app/strategies/
└── page.tsx              // Server component → Client fetch

src/components/strategies/
├── StrategiesClient.tsx  // 상태 관리 (Zustand or useState)
├── StrategyCard.tsx      // 개별 카드
├── StrategyRegisterForm.tsx  // 자연어 입력 + 미리보기
├── StrategyPreview.tsx   // 파싱 결과 표시
└── StrategyEditModal.tsx // 이름/빈도/활성 편집
```

### API 응답 예시
```jsonc
// GET /api/custom-strategies
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "name": "SOXL 저점 매수",
      "ticker": "SOXL",
      "description": "SOXL 40달러 이하 + RSI 30 이하",
      "conditions": [{ "type": "price", "operator": "<=", "value": 40 }, ...],
      "logic": "AND",
      "frequency": "daily",
      "isActive": true,
      "lastTriggeredAt": "2026-06-30T14:20:00.000Z",
      "createdAt": "..."
    }
  ]
}

// POST /api/custom-strategies/preview
// body: { "text": "SOXL 40달러 이하 + RSI 30 이하 시 알림" }
{
  "success": true,
  "data": {
    "name": "SOXL 저점 매수",
    "ticker": "SOXL",
    "conditions": [{"type":"price","operator":"<=","value":40}, ...],
    "logic": "AND",
    "frequency": "daily"
  }
}
```

### 재사용
- `parseStrategyText` (from `@/lib/custom-strategy/parser`)
- `validateParsedStrategy` (from `@/lib/custom-strategy/types`)
- `conditionToString` (표시용)
- `ok`/`fail`/`noContent` (API envelope)
- `DeleteModal`, `Notice`, `Disclaimer` 컴포넌트

## 4. 디자인 단계 (필수)

`frontend-design` 스킬로 프로토타입:
- 카드 그리드 레이아웃 (다크 테마 + 반응형)
- 등록 폼 → 미리보기 → 확정 흐름
- 활성 배지 (초록) / 비활성 배지 (회색)
- 발동 이력 표시 (툴팁 or 카드 하단)

승인 후 `docs/designs/387-custom-strategy-web-ui/` 저장:
- `prototype.jsx` 또는 `prototype.html`
- `design-notes.md`
- 스크린샷 (선택)

## 5. 테스트 계획

- [ ] API 유닛: GET/POST/POST-preview/PUT/DELETE (Zod 검증, envelope 준수)
- [ ] API 유닛: 활성 상한 50 개 초과 시 400 error
- [ ] API 유닛: preview 실패 (invalid 자연어) 시 400 error
- [ ] Client 스모크: 등록 → 목록 확인 → 활성 토글 → 삭제
- [ ] 데이터 일관성: 웹 등록 → 봇 `/커스텀전략목록` 조회 검증
- [ ] lint / typecheck / build

## 6. 제외

- 조건 자체 편집 (v2 후보)
- 조건 그래픽 빌더 (자연어 파싱만)
- 발동 이력 상세 로그 (별도 이슈)
- 웹 알림 (텔레그램만)

## 7. 완료 시

12차 마일스톤 완료 조건 충족 → 마스터 이슈 #385 종료.
