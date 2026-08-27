# 17차 마일스톤 — 알림/MCP 심화 · 크로스-티커 TA · 모바일 UX (마스터)

- **작성일**: 2026-07-14
- **타입**: 마일스톤 (마스터 스펙, sub-phase 분할)
- **참조**: 16차 마스터 #432, `memory/project_next_milestone_17.md`, `memory/project_milestone16_complete.md`
- **명시적 제외**: Phase 36 뉴스 조건 (Alpha Vantage / newsapi.org / benzinga 등) — 사용자 결정으로 완전 기각. 다음 마일스톤 후보에서도 제거. 기존 조사 문서 `docs/specs/435-news-api-decision.md` 는 아카이브 상태 유지 (참고용).

## 1. 배경

16차 완료로 `/ai` sonnet 승격과 자연어 전략 편집이 배포되었다. 15차 (#414) 에서 도입된 관측 인프라 (`/alerts/history` #417, `/admin/mcp-logs` #418, `AlertHistory` 모델, pino MCP 구조화 로그) 는 v1 상태로 **주간 운영을 하면서 명시된 잔업**이 쌓였다.

이번 마일스톤은 세 축의 **잔업/확장**을 정리한다:

1. **알림·MCP 관측 심화 (v2 잔업)** — 15차의 `/alerts/history` + `/admin/mcp-logs` 는 조회만 가능한 v1. 상세 컨텍스트/재발송/실시간 tail/다운로드 등 실사용 시 요구되는 조작 기능 부재.
2. **크로스-티커 확장 (TA 지표)** — 16차 (실제 배포된 34-B) 의 `cross_ticker` 조건은 change_pct / price 만 지원. 벤치마크의 RSI/MACD/BB 를 조건에 넣지 못해 반복 발생하는 "SPY 과매수 시 QQQ 회피" 류 시나리오 표현 불가.
3. **모바일 웹 UX 재점검** — 14차 이후 미착수. 알림·MCP v2 UI 도 마찬가지로 모바일 미검증. 배포 후 사용자가 모바일에서 자주 접하는 페이지 우선 개선.

## 2. 목표

17차 종료 시:

- ✅ `/alerts/history` 에서 알림 상세 컨텍스트 (시세·TA·전략 스냅샷) 조회 가능
- ✅ 알림 이력 CSV export + 실패한 알림 재발송 가능
- ✅ `/admin/mcp-logs` 에서 실시간 tail (SSE) + 원본 로그 파일 다운로드 가능
- ✅ 커스텀 전략 `cross_ticker` 조건이 RSI / MACD signal / SMA cross / BB position 을 지원
- ✅ 모바일 반응형 감사 리포트 확보 + 우선순위 상위 페이지 (대시보드/거래/가계부) + v2 신규 페이지 (알림 이력·MCP 로그) 모바일 UX 개선

## 3. Sub-Phase 분할

**이슈 매핑**:
- Phase 37 (알림/MCP 심화): #444 (37-A), #445 (37-B), #446 (37-C), #447 (37-D)
- Phase 38 (크로스-티커 TA): #448 (38-A), #449 (38-B)
- Phase 39 (모바일 UX): #450 (39-A), #451 (39-B), #452 (39-C)

### Phase 37 — 알림 이력·MCP 로그 심화 (v2 잔업)

#### 37-A (#444): 알림 상세 모달 + kind 별 컨텍스트

**목적**: 리스트에서 발동 시각·티커·메시지만 보여주는 v1 → 실제 판단 근거 (당시 시세 / TA 상태 / 관련 전략) 를 함께 노출해 사후 진단 시간 단축.

- [ ] `AlertHistory` 확장: `contextJson: Json?` 필드 (nullable — 하위호환). Migration.
- [ ] 발동 hook 이 저장 시 kind 별 최소 스냅샷 채움:
  - `surge` / `drop` / `watch_buy` / `watch_zone` / `target_hit` / `stop_loss` → `{ price, prevPrice, changePercent, marketOpen }`
  - `ta_signal` → `{ rsi, macdSignal, bbPosition, indicator, direction }`
  - `custom_strategy` → `{ strategyId, strategyName, conditions, matchedSnapshot }` (evaluator 가 이미 만든 스냅샷 재활용)
  - `fx` → `{ rate, prevRate, changePercent }`
- [ ] `/alerts/history` 행 클릭 → 상세 모달 (kind 별 렌더러 분기).
- [ ] MCP tool `list_alert_history` 응답에도 `context` 포함 (텔레그램 AI 조회 시).
- [ ] 회귀 테스트: 각 kind × contextJson null / present 렌더링.

**의존성**: 없음 (v1 위에서 확장)
**노력**: S (1일)

#### 37-B (#445): CSV export + 실패 알림 재발송

**목적**: 이력 데이터 자기소유권 확보 + 배포 오류로 발송 실패한 알림 복구 경로 제공.

- [ ] `GET /api/alerts/history/export?...` — 현재 필터 (기간·kind·ticker) 그대로 CSV 스트리밍. `csvResponse()` 헬퍼 (api-routes 규칙 준수).
- [ ] `POST /api/alerts/history/[id]/retry` — `deliveryStatus === 'failed'` 인 행만 재전송. 성공 시 상태 갱신 + 재발송 이력을 새 row 로 append (원본 유지). 실패 hook 은 원본 재사용 (동일 chatId / message).
- [ ] `/alerts/history` UI: 실패 뱃지 옆 "재발송" 버튼 + 확인 다이얼로그. 상단 툴바에 "CSV 다운로드" 버튼 (현재 필터 반영).
- [ ] Rate limit: 동일 id 5분내 재발송 금지 (스팸 방지).
- [ ] 테스트: retry 성공 / 이미 성공한 행 / rate limit / CSV escape (comma·quote 포함 message).

**의존성**: 37-A (컨텍스트 필드 CSV 열에 포함)
**노력**: S (1일)

#### 37-C (#446): MCP 로그 실시간 tail (SSE)

**목적**: `/admin/mcp-logs` 는 현재 파일 로드 후 스냅샷. 배포 직후 tool 호출 실시간 확인 pain → SSE tail.

- [ ] `GET /api/admin/mcp-logs/stream?level=...&tool=...` — SSE endpoint. 서버는 `logs/mcp-YYYY-MM-DD.log` 를 fs.watch + tail 방식으로 신규 라인만 push.
- [ ] 클라이언트 (`/admin/mcp-logs`): "실시간 tail" 토글 → EventSource 연결. 필터 조합은 서버측 필터로 전달. 새 라인은 리스트 최상단에 append + 자동 스크롤 (사용자가 위로 스크롤한 상태이면 pause).
- [ ] 종료 조건: 페이지 unmount / 토글 off / 서버 disconnect 시 자동 close.
- [ ] SSE 선택 이유 (WebSocket 대비): 단방향 (서버→클라이언트) 만 필요, 프록시 호환성, EventSource 표준 재접속. 스펙 상단에 트레이드오프 명시.
- [ ] 테스트: SSE 응답 헤더 / 필터 매칭 라인만 방출 / disconnect 정리.

**의존성**: 없음
**노력**: S (1일)

#### 37-D (#447): MCP 로그 파일 다운로드 + retention 문서화

**목적**: 원본 파일 자기소유권 + retention 정책 명문화 (감사 대응).

- [ ] `GET /api/admin/mcp-logs/download?date=YYYY-MM-DD[&kind=crash]` — 해당 일자 파일 원본 다운로드 (Content-Disposition attachment). 존재 안 하면 404.
- [ ] `/admin/mcp-logs` 상단에 "일자별 다운로드" 드롭다운 (최근 14일).
- [ ] `docs/mcp-log-schema.md` 갱신: retention (14일 rolling, 15차 33-C 도입) + 삭제 스케줄 + 다운로드 endpoint 명시.
- [ ] 경로 traversal 방어: date 정규식 (`^\d{4}-\d{2}-\d{2}$`) + kind 화이트리스트 (`main` | `crash`).
- [ ] 테스트: 존재 파일 stream / 없는 날짜 404 / 잘못된 date 400 / traversal 시도 400.

**의존성**: 없음 (37-C 와 병행 가능)
**노력**: XS (반나절)

### Phase 38 — 크로스-티커 TA 확장

#### 38-A (#448): `cross_ticker` TA 스키마 + evaluator + snapshot 주입

**목적**: 16차 34-B 의 change_pct/price 만 되던 크로스-티커 조건을 TA 지표까지 확장. 백엔드 완결.

- [ ] `types.ts` 스키마 확장:
  ```
  cross_ticker: {
    ticker: string
    metric: 'change_pct' | 'price' | 'rsi' | 'macd_signal' | 'sma_cross' | 'bb_position'
    operator: '>=' | '<=' | '>' | '<' | '=='
    threshold: number
    // sma_cross / bb_position 은 추가 파라미터 (period, band) 필요 — 세부는 구현 시 확정
  }
  ```
- [ ] `conditionsEqual` canonical key 확장: 새 metric 도 정규화 대상 (16차 diff.ts 원칙 준수 — evaluator semantics 와 정합).
- [ ] Evaluator 확장:
  - `requiresTA` 판정 시 `cross_ticker` 의 metric 이 TA 계열이면 크로스 티커의 TA 리포트 요구.
  - `custom-strategy-alert` 가 조건 순회 → 크로스 티커의 TA 스냅샷 수집 (동일 티커 중복 fetch 방지 — set dedupe).
  - snapshot 에 `crossTickers: Record<ticker, { price, rsi, macdSignal, bbPosition, ... }>` 주입.
- [ ] 회귀 테스트: 각 metric × operator 조합, snapshot 재사용 dedupe, TA 리포트 없는 티커 (KOSPI ETF 등) 시 graceful skip.

**의존성**: 없음 (34-B/35-B 위에서 확장)
**노력**: S (1~2일)

#### 38-B (#449): Parser 프롬프트 v3 + `/strategies` UI

**목적**: 자연어로 크로스 TA 조건을 등록·편집. UI 폼에서도 metric 선택 가능.

- [ ] Parser 프롬프트 v3 에 예시 추가:
  - "SPY RSI 70 이상일 때 QQQ 매수 회피"
  - "VIX 이 20 넘고 SPY 가격이 SMA20 하회 시 알림"
- [ ] `editStrategyByNL` 도 동일 프롬프트 사용 (프롬프트 공통).
- [ ] `/strategies` 편집 폼: cross_ticker 조건 UI 에 metric 드롭다운 (change_pct / price / rsi / macd_signal / sma_cross / bb_position). period 등 부가 파라미터는 metric 선택 시 조건부 노출.
- [ ] 미리보기 (diff) 는 16차 `computeStrategyDiff` 재사용 — canonical key 확장으로 자동 정합.
- [ ] 파서 스펙 테스트 (프롬프트 spec + evaluator 통과) + UI 폼 렌더링 테스트.

**의존성**: 38-A
**노력**: S (1일)

### Phase 39 — 모바일 웹 UX 재점검

#### 39-A (#450): 반응형 감사 리포트 (Discovery)

**목적**: 어느 페이지가 모바일에서 얼마나 깨졌는지 데이터 확보. 구현 스코프 확정 근거.

- [ ] 감사 대상: 전체 페이지 (대시보드 / 거래 / 가계부 / 관심종목 / 자산 / 세금 / RSU / 스톡옵션 / /alerts / /alerts/history / /admin/mcp-logs / /strategies / /settings 등).
- [ ] 뷰포트 3종 (iPhone SE 375px / iPhone Pro Max 430px / iPad 768px) 스크린샷 + 문제 목록 (좌우 스크롤 / 텍스트 겹침 / 터치 타깃 <44px / 모달 컷오프 등).
- [ ] 우선순위 매트릭스: 사용 빈도 × 심각도.
- [ ] 산출물: `docs/designs/443-mobile-audit/audit.md` + 스크린샷 폴더.
- [ ] 사용자 승인 후 39-B/39-C 스코프 확정 (필요 시 하위 이슈 추가 발행).

**의존성**: 없음 (병행 가능한 리서치)
**노력**: S (1일)

#### 39-B (#451): 우선순위 상위 페이지 개선 (대시보드 / 거래 / 가계부)

**목적**: 39-A 감사 결과 상위 3개 페이지 (사용 빈도 압도적) 모바일 UX 리팩터.

- [ ] 각 페이지의 좌우 스크롤 제거, 카드/테이블 → 모바일에서 세로 스택 or horizontal-scroll 컨테이너.
- [ ] 터치 타깃 최소 44×44px.
- [ ] 차트 컨테이너 반응형 (Recharts `ResponsiveContainer` 활용).
- [ ] 다크 모드 + 세로 방향 우선 검증.
- [ ] 회귀 테스트: 뷰포트 3종 스냅샷 (playwright 또는 수동 캡처 첨부).

**의존성**: 39-A
**노력**: M (2~3일)

#### 39-C (#452): v2 신규 페이지 재감사 및 개선 (/alerts/history · /admin/mcp-logs)

**목적**: 37-A/B/D 완료 후 신규 UI 요소 (상세 모달·CSV 버튼·실시간 tail 토글·다운로드 드롭다운) 를 모바일에서 재감사.

- [ ] 39-A 감사와 동일 방식으로 신규 요소 캡처.
- [ ] 모달 크기 (풀스크린 vs bottom sheet) 결정.
- [ ] 툴바 (CSV / 재발송 / 다운로드) 모바일 배치 (상단 sticky vs FAB).
- [ ] 실시간 tail SSE 상태 표시 모바일 최적화.
- [ ] 회귀 테스트.

**의존성**: 37-A, 37-B, 37-C, 37-D, 39-A
**노력**: S (1~2일)

## 4. 착수 순서

Phase 별 진행:

```
[워밍업]
  37-A #444 (알림 상세 모달)          — 사용자 즉시 체감, v2 데이터 필드 확장
  ↓
[알림/MCP 심화]
  37-B #445 (CSV + 재발송)            — 37-A 컨텍스트 컬럼 활용
  37-C #446 (SSE tail) ─────────┐    — 병행 가능 (독립)
  37-D #447 (다운로드)          ┤    — 병행 가능 (독립)
  ↓ (병렬 3건 완료 후)
[크로스-티커 TA]
  38-A #448 (백엔드) → 38-B #449 (parser + UI)
  ↓
[모바일 UX]
  39-A #450 (감사) ── 결과 승인 ─→ 39-B #451 (우선 페이지) → 39-C #452 (v2 페이지)
```

39-A 는 리서치 성격이라 37/38 진행과 병행 시작 가능. 39-C 는 37-A/B/D 완료 이후 착수 (신규 UI 요소가 감사 대상).

## 5. 완료 조건 (모든 서브이슈 공통)

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run test:run` (신규 코드 회귀 테스트 포함)
- [ ] `npm run build`
- [ ] pr-review-toolkit code-reviewer self-review 통과 (P1/P2 = 0)
- [ ] Codex bot 리뷰 P1/P2 = 0 (P0 는 후속 이슈로만 트래킹)
- [ ] Prisma 마이그레이션 존재 시 `npx prisma migrate deploy` 시나리오 점검
- [ ] UI 변경 시 `docs/designs/` 스크린샷 / 프로토타입 반영

## 6. 제외 사항

- **뉴스 조건 (Phase 36 계열)** — 사용자 결정으로 완전 기각. 재발행하지 않음.
- **알림 발동 규칙 자체 변경** (급등락 임계값·감쇠 로직 등) — 별도 이슈.
- **MCP 서버 다중 인스턴스 / 원격 관측 스택 (Grafana/Loki)** — 사용량 낮아 불필요 (14차 결정 유지).
- **재발송 자동 재시도 (exponential backoff)** — 37-B 는 사용자 수동 트리거만. 자동은 후속 이슈.
- **모바일 네이티브 앱** — 웹 반응형만 대상.
- **크로스-티커에서 KOSPI ETF (KODEX/TIGER) TA 지원** — TA 엔진이 미국 티커 우선 최적화. 국내는 별도 이슈.

## 7. 산출물

- `docs/specs/*` (서브이슈 별)
- `docs/designs/443-mobile-audit/` (39-A) + `docs/designs/443-mobile-priority/` (39-B) + `docs/designs/443-mobile-v2/` (39-C)
- `docs/mcp-log-schema.md` 갱신 (37-D)
- Prisma migration: `AlertHistory.contextJson` (37-A)
- 신규 API 엔드포인트:
  - `GET /api/alerts/history/export`
  - `POST /api/alerts/history/[id]/retry`
  - `GET /api/admin/mcp-logs/stream` (SSE)
  - `GET /api/admin/mcp-logs/download`

## 8. 참고 (재사용 유틸)

- 15차 도입 `src/lib/kst-date.ts` — 알림 이력 기간 필터·CSV 날짜 포맷에 재사용
- 15차 도입 `AlertHistory` 모델 — 37-A 는 필드 확장만
- 16차 도입 `src/lib/ai/claude-advisor.ts` `AdvisorIntent` — 38-B 파서/편집 프롬프트는 `intent: 'parse'` 유지
- 16차 도입 `src/lib/custom-strategy/diff.ts` `conditionsEqual` / `condKey` — 38-A 새 metric 도 canonical key 규칙 준수
- 14차 도입 pino 구조화 로그 (`logs/mcp-*.log`) — 37-C/D 는 파일 스트림만 새로 붙임
- API envelope 헬퍼 `@/lib/api-response` (`ok` / `fail` / `noContent` / `paginated`) — 37-B/D 신규 라우트 필수
