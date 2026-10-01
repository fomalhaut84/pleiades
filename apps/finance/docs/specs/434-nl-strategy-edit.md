# [Phase 35-B] 자연어 전략 편집

- **이슈**: #434
- **마스터**: #432
- **작성일**: 2026-07-10

## 목표

`/strategies` 편집 모달에서 자연어로 조건 수정. 등록 뿐 아니라 편집도 자연어 → UX 통일. **상대 편집** 지원 ("SPY 조건 빼줘", "어닝 5일로 완화", "OR 로 바꿔").

## 현재 상태

- 등록: 자연어 → `parseStrategyText` → ParsedStrategy 저장
- 편집: JSON 손편집 (이름/logic/frequency/isActive 만, 조건 자체 편집 X — 삭제 후 재등록 안내)

## 신규

### `editStrategyByNL(current, instruction)` — parser.ts 확장

- 입력: 기존 전략 (name/ticker/conditions/logic/frequency) + 자연어 지시
- 출력: 갱신된 `ParsedStrategy` (또는 error)
- 프롬프트: 기존 스키마 규칙 + 현재 상태 컨텍스트 + 편집 지시
- 상대 편집 명시: "빼줘 / 완화 / 강화 / OR 로 바꿔" 등 사용자 표현 이해
- 지원 조건 외 지시 → error 응답

### API `POST /api/custom-strategies/[id]/nl-edit`

- 입력: `{ instruction: string }`
- 출력 (미리보기, 저장 X):
  ```json
  {
    "success": true,
    "data": {
      "before": ParsedStrategy,
      "after":  ParsedStrategy,
      "diff": { conditionsAdded: [...], conditionsRemoved: [...], logicChanged?: {from, to}, frequencyChanged?: {from, to} }
    }
  }
  ```
- 실패 → 400 with error message

### PUT 확장

기존 `PUT /api/custom-strategies/[id]` 가 이름/logic/frequency/isActive 만 허용. **conditions 도 허용하도록 확장** — nl-edit 미리보기 결과를 사용자가 승인 시 이 필드로 저장.

### UI (`StrategyEditModal.tsx`)

기존 필드 + 신규 자연어 편집 섹션:
- 텍스트 영역 (자연어 지시 입력)
- "미리보기" 버튼 → API 호출 → diff 표시
- diff: 조건 추가/제거 하이라이트 (기존 conditionToString 재사용)
- "적용" 버튼 → PUT with `conditions` (+ 변경된 logic/frequency)

"조건 자체는 편집 불가" 경고 문구 제거.

## 파일 변경

- `src/lib/custom-strategy/parser.ts` — `editStrategyByNL` + `EDIT_PROMPT_HEADER`
- `src/app/api/custom-strategies/[id]/nl-edit/route.ts` (신규)
- `src/app/api/custom-strategies/[id]/route.ts` — PUT 에 conditions 필드 허용 (검증 재사용)
- `src/components/strategies/StrategyEditModal.tsx` — 자연어 편집 섹션 + preview UI

## 테스트

- `editStrategyByNL` — mock askAdvisor 로 성공/실패 시나리오
- diff 계산 pure 함수 (`computeStrategyDiff`)
- PUT conditions 유효성

## 완료 조건

- [ ] lint / typecheck / test / build 통과
- [ ] self-review P0/P1/P2 = 0
- [ ] verify: 실제 편집 요청 → preview 반환 → 저장 성공

## 제외

- **자연어로 신규 조건 발명** (뉴스/펀더 등) — 지원 밖은 error
- **다중 지시 순차 적용** — 한 번의 편집은 한 개 지시 (여러 변경은 사용자가 개별 입력)
- **음성 편집** — 스코프 밖
