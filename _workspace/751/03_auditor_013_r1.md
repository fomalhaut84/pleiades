# 013 r1 감사 (reversibility-auditor · 2026-11-17) — 요약 기록

집계: **정정 13 · 확인 6 · 미확인 2**. 결론: 초안으로 되돌린다. 가장 큰 것은 P2-a 를 "notify 만 · 소비자 0" 으로 본 것 — AI 답장 대부분은 chat `TextFormat` 으로 나가고 발신 4곳의 3항식이 새 형식을 조용히 escape 한다.

| # | 판정 | 요지 |
|---|---|---|
| 1 | 정정 | `toDiscordContent` 는 웹훅만 — 나머지 3곳은 같은 3항식을 따로(`discord-bot.ts:120` · `chat/src/rest.ts:99` · `discord-gateway.ts:209`) · 모든 경우를 따지지 않아 새 형식이 escape 로 빠진다 |
| 2 | 정정 | notify gateway 는 앱 소비자 0 — 인터랙션은 chat(`chat.ts:298` · `rest.ts:246-253`) |
| 3 | 정정 | chat 편집은 이미 2000 넘으면 이어 보낸다(`editWith` :181-196) — 첫 조각만은 파일 설명 · 본인 안내뿐 |
| 4 | 정정 | chat `TextFormat`(`chat/src/types.ts:11`) · 앱 `ReplyFormat` · 어댑터 `discord/reply.ts:77-83` 도 범위 |
| 5 | 확인 | notify 코어 plain 폴백은 Discord(`maxLength` Infinity)에서 타지 않는다 |
| 6 | 정정 | fin 6곳 = notify 3 · chat 2 · 틀 안 조각 1(ta-signal) |
| 7 | 정정 | `/브리핑` 4096 초과 시 원문 plain 분기 · html 실패 plain 재전송 |
| 8 | 정정 | fin `SYSTEM_PROMPT` 는 모든 askAdvisor — 분기 PDF 원문 · 웹 `/ai` 영향 |
| 9 | 정정 | fit 기본값은 `ensureDefaults()` 로 시작 때 자동 활성(`sync-plan.ts:40`) — 웹에서 고친 경우만 초안 |
| 10 | 정정 | 통합 층 `answerToHtml`(`apps/advisor/src/format.ts:14`) |
| 11 | 정정 | 특성 테스트(`ai-flow.test.ts` · `special-flow.test.ts` · fit `html.test.ts`)가 html · plain 재시도를 고정 |
| 12 | 확인 | fit `mdToHtml` — `- ` → `• ` · 제목 정규식 줄머리 미고정 · escape 없음 |
| 13 | 확인 | 13곳 줄 번호 일치 · fit 0 · `expense.ts:560` escape 결함 |
| 14 | 정정 | embed 는 빌더마다(편집 · 인터랙션 편집 · 응답 모델 · 빈 본문 검사) · PATCH `embeds: []` |
| 15 | 확인 · 미확인 | 한도 25 · 1024 · 6000 맞음 + 빠진 한도 · 모바일 inline 필드 미확인 |
| 16 | 정정 | 버전: P1 patch · P2 · P3 minor · 서버 조치 없음 · chat 은 재빌드 동반 |
| 17 | 정정 | 위험 추가: `>>>` · `-#` · `||` · 코드 안 무변경 · `<` 전부 escape · `@everyone` 글자 |
| 18 | 확인 | 나머지 인용 |
| 19 | 확인(단서) | 한 줄이 예산 초과면 `sliceLine` 이 중간을 자른다 |
| 20 | 미확인 | fit 운영 DB `promptVersion.source` — 사용자 확인 |
