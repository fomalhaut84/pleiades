# 013 — Discord·웹 메시지 가독성 (텔레그램 형식 걷어내기)

작성 2026-11-17 · 상태 **방향 확정 · P1 진행**(F1~F5 확정 · Q-4 · Q-5 미결) · 이슈 #751
근거: 초안 `_workspace/751/02_writer_013_r1.md` → 감사 `03_auditor_013_r1.md`(정정 13) → r2 → 재감사 `03_auditor_013_r2.md`(정정 3 · 문구) → r3 = 이 문서.
**정본은 이 파일이다.**

## 1. 무엇이 바뀌었나

009(텔레그램 종료)는 **수신·발신 경로**를 옮겼고 **본문 형식**은 옮기지 않았다. 두 앱 · 통합 층은 여전히 텔레그램 HTML 로 본문을 만들고, 발신 4곳이 그것을 Discord 마크다운으로 바꾸며 **모든 텍스트를 escape** 한다(외부 텍스트의 서식 주입 방지 · `discord-md.ts` §7-1 정정 6-A).

사용자(2026-11-17): *"메시지 포맷들이 텔레그램때 썼던거라 그런지 디스코드에서 보는게 어색한 부분이 좀 많아. (특히 표 구현) 리포트 같은 내용들은 웹에서도 보기 힘들정도의 가독성인데 이거 개선할 방안도 같이 고민해줘."*

바뀐 전제: 텔레그램 HTML 은 더 이상 어떤 채널의 원형도 아니다(009 D-5). **본문의 원형을 Discord 마크다운으로 옮길 수 있다.**

## 2. 확정된 답

| | 질문 | 답 | 근거 |
|---|---|---|---|
| F1 | AI 장문의 표를 Discord 에서 어떻게 | **행마다 목록** — `• **첫 열** — 헤더: 값 · 헤더: 값` | 사용자 2026-11-17 |
| F2 | 범위 | **P1 지금 + P2·P3 설계** (P4 리포트 웹 보관은 범위 밖) | 사용자 2026-11-17 |
| F3 (Q-1) | fin `SYSTEM_PROMPT` 의 "마크다운 표 절대 사용하지 않음" | **유지** + 제목 `##` 만 허용 — 분기 PDF(마크다운 렌더 없음)에 `\|` 가 글자로 나오지 않게 | 사용자 2026-11-17 |
| F4 (Q-2) | fit 리포트·시스템 프롬프트를 웹에서 고친 적 | **없다** — P2-c 배포 때 새 기본값이 자동 활성(`sync-plan.ts:40`) · 따로 할 일 없음 | 사용자 2026-11-17 |
| F5 (Q-3) | TA 가이드(ta-signal 틀 안 AI 조각)를 P2 에 | **빼고 후속** — 그 알림만 잠시 옛 형식 | 사용자 2026-11-17 |

## 3. 실측 근거 (2026-11-17 · 읽기 전용 · 감사 대조 끝)

**발신 4곳 · 같은 3항식** — `format === 'html' ? htmlToDiscordMarkdown : escapeDiscordMarkdown`:
| 경로 | 위치 | 쓰는 곳 |
|---|---|---|
| notify 웹훅 | `packages/notify/src/discord.ts:85-86`(`toDiscordContent`) | 앱 알림 |
| notify 봇 transport | `discord-bot.ts:120` | 버튼 알림 |
| chat 답장 · 편집 | `packages/chat/src/rest.ts:99`(`toChunks`) · `editWith` :181-196 | 앱 봇 대화 · 통합 층 · 인터랙션 편집(`chat.ts:298` type 6 → `editOriginal` :246-253) |
| notify gateway | `discord-gateway.ts:209` | **앱 소비자 0**(export 만 · `index.ts:54`) |

- 3항식은 모든 경우를 따지지 않는다 → **새 형식을 넣으면 컴파일 오류 없이 escape 쪽으로 빠진다.**
- 형식 타입이 둘: notify `Content.format: 'html' | 'plain'`(`types.ts:37`) · chat `TextFormat = 'plain' | 'html'`(`chat/src/types.ts:11`). 앱 쪽 `ReplyFormat` → 어댑터: fin `bot/core/reply.ts:12` → `bot/discord/reply.ts:77-83` · fit `bot/core/reply.ts:7` → `bot/discord/reply.ts:27`.
- 줄머리 escape `LINE_HEAD_RE`(`discord-md.ts:81`) — `> # + - 1.` 이 목록·제목이 되지 않는다 · `ul`/`li`/`table` 처리기 없음(:155-156).
- notify 코어의 plain 폴백(`deliver.ts:76-80`)은 html + maxLength 유한일 때만 — Discord transport 는 `Infinity`(:35) → **Discord 에서는 타지 않는다.**
- chat 편집은 이미 2000 넘으면 원본을 첫 조각으로 바꾸고 나머지를 이어 보낸다(`editWith`). 첫 조각만 쓰는 곳은 파일 설명(:235) · 본인 안내(:263) 뿐.
- 멘션 무력화 `allowed_mentions: { parse: [] }` — 살아 있는 경로 전부(`discord.ts:102` · `discord-bot.ts:127` · `rest.ts:169,192`).
- embed 0 · 요청 본문은 빌더마다 직접 조립(키 허용 목록 없음).

**AI 장문(모델 출력 = 마크다운) — 변환기 셋:**
| 앱 | 변환기 | 호출 | 나가는 길 |
|---|---|---|---|
| fin | `markdownToHtml`(`bot/utils/markdown.ts:51-91`) — 표 → `- 키 / 헤더: 값` 한 줄(:14-46) · `##` → `<b>`(:70) · `---` 삭제(:85) | notify 3: `notifications/briefing.ts:109` · `monthly-report.ts:51` · `active-review.ts:158` / chat 2: `commands/ai.ts:88-91` · `commands/briefing.ts:124-135` / **틀 안 조각 1**: `ta-signal-alert.ts:328`(300자 AI 조각을 escapeHtml · `<b>` 로 만든 HTML 틀에 넣는다 · :318-336) | |
| fit | `mdToHtml`(`bot/utils/html.ts:2-11`) — `- ` → `• `(:10 · 목록은 이미 글머리) · 제목 정규식이 줄머리에 고정 안 됨(:4-6) · 표 · `---` · HTML escape 없음 | `commands/report.ts:34,66` · `notifications/scheduler.ts:26` · `commands/ai.ts:131,138` | |
| 통합 층 | `answerToHtml`(`apps/advisor/src/format.ts:14`) | `bot.ts:157` | chat html |

- fin 텔레그램 시절 분할: `/ai` 4096 선분할(`formatter.ts:50` · `ai.ts:86`) · `/브리핑` 은 HTML 이 4096 넘으면 **원문 마크다운을 plain 으로** 조각내 보낸다(`briefing.ts:125-135` — 긴 심층 분석은 지금도 escape 된 원문) · html 실패 시 plain 재전송(`ai.ts:89-91` · `briefing.ts:128-129`).
- **특성 테스트가 지금 동작을 고정한다:** `ai-flow.test.ts:223,350,363-374` · `special-flow.test.ts:143-162` · fit `bot/utils/__tests__/html.test.ts` — P2 는 이 테스트를 다시 쓴다(D-3 의 "특성 테스트 무수정" 보증은 여기서 끝난다).
- 프롬프트: fin `SYSTEM_PROMPT`(`lib/ai/system-prompt.ts:57-74` "마크다운 표 절대 사용하지 않음 · 리스트(-) · 제목은 **볼드**")는 **모든 `askAdvisor` 호출**에 들어간다(`claude-advisor.ts:3`) — 분기 PDF `aiComment`(`lib/report/ai-review.ts:59` → `pdf-template.tsx:154` 원문 그대로) · 웹 `/ai` 포함. fit 리포트·시스템 프롬프트 기본값(`prompts/defaults/system.ts:139` · `reports.ts:19,36,65` — 표 금지 없음).
- **fit 프롬프트 기본값은 배포 때 자동 활성화될 수 있다:** 봇·웹 시작 때 `ensureDefaults()`(`resolve.ts:102` · `bot/standalone.ts:34` · `instrumentation.ts:40`) — 기본값의 해시가 바뀐 키마다 **행이 자동으로 생긴다**(`sync-plan.ts:35-41`): 손대지 않은 키는 그 행이 **바로 활성**(:40) · 웹에서 고친 키는 **초안 행**으로(:41). 대상 키 system · morning · evening · weekly. 어느 쪽인지는 운영 DB(미확인 · Q-2).

**코드 템플릿 표:** 13곳 · 6 파일 · **전부 fin**(fit 0) — `notifications/daily.ts:89` · `commands/portfolio.ts:85,89,90,138,147,151` · `notifications/rsu.ts:77,105,171` · `commands/expense.ts:560` · `commands/backtest.ts:62` · `commands/analysis.ts:71`. 공백 · `｜` · `─` 로 열 흉내. (기존 결함: `expense.ts:560` description · categoryName 이 escape 없이 HTML 에 — P3-b 때 함께.)

**웹:** fit 5곳 `prose` 무효 → **P1 #753**. fin `/ai` 는 `.ai-markdown` 정상 · 브리핑 · 리뷰 · 월간은 웹에 없다 · 분기 PDF 는 마크다운 원문.

## 4. 경로

### 4-0. 원칙

- **본문의 원형 = Discord 마크다운.** AI 장문은 모델의 마크다운을 한 번만 다듬어 보낸다(이중 변환 제거).
- **escape 는 외부 값에만.** 템플릿이 끼워 넣는 값(종목명 · 사용자 입력 · 뉴스 제목)은 escape · 템플릿 서식은 살린다.
- AI 장문의 외부 글(뉴스 · 공시)이 서식이 되는 것은 해가 작다 — **해가 되는 것만 막는다**(4-2).

### 4-1. 단계

| 단계 | 내용 | 여기서 멈추면 남는 것 | 되돌리기 |
|---|---|---|---|
| **P1** (#753 · PR) | fit 웹 `md-body` | 웹 리포트가 읽힌다 | revert + 릴리즈 **즉시~중간** · patch |
| **P2-a** 형식 계층 | notify `Content.format` · chat `TextFormat` 에 `'markdown'` · **발신 3곳의 3항식을 모든 경우를 따지는 switch 로**(새 형식이 조용히 escape 로 빠지지 않게 · gateway 는 죽은 경로라 같은 함수만 쓰게) · 정리기 `discordMarkdown(md)`(4-2 규칙 · 코드 스팬·펜스 안은 건드리지 않는다) · 분할은 기존 `splitDiscordMarkdown` | 새 형식(앱 소비자 0) · 기존 html · plain 무변경 | revert **즉시** — 단 chat 은 앱 빌드에 인라인되므로 **두 앱 · 통합 층 재빌드 릴리즈와 함께** 나간다 · **P2-a 만으로도 통합 층이 자동 재배포된다**(`packages/` 가 입력 경로) |
| **P2-b** fin AI 장문 5 | notify 3 + chat 2 를 `markdown` 으로 · 앱 `ReplyFormat` 넓히기 · `/ai` 4096 선분할 · `/브리핑` 4096 plain 분기 · html 실패 plain 재전송 제거 · 특성 테스트 다시 쓰기 · 시스템 프롬프트 포맷 규칙(Q-1). **ta-signal TA 가이드(틀 안 300자 조각)는 범위 밖**(틀 재작성 · 따로) | fin AI 답이 목록·제목으로 | revert + 릴리즈 **중간** · minor |
| **P2-c** fit AI 장문 5 | 같다(`mdToHtml` 제거 · `html.test.ts` 다시) · 리포트·시스템 프롬프트 기본값의 포맷 규칙 | fit 리포트 · `/ai` | revert + 릴리즈 **중간** — 기본값을 바꾸면 **배포 때 바뀐 키마다 운영 DB 에 행이 자동으로 생긴다** — 손대지 않은 키는 바로 활성 · 웹에서 고친 키는 초안 · revert 해도 행이 하나 더 생긴다(해는 없다) · minor |
| **P2-d** 통합 층 | `answerToHtml` 제거 → `markdown` · `apps/advisor/src/__tests__/bot.test.ts` 다시 | 통합 채널 답이 같다 | **Release 자동 배포**(4b-5 — `apps/advisor/` · `packages/` 는 입력 경로) · revert + 릴리즈 **중간** · 판정은 `## adv` 줄 · 배포 알림 |
| **P3-a** embed | notify 웹훅 · 봇 transport · chat 답장 · **chat 편집(`editWith`) · 인터랙션 편집** · 앱 응답 모델(`BotReply` · `toOutgoing`) · 빈 본문 검사(`discord.ts:115` · `discord-bot.ts:122` · `rest.ts:101` — embed 만 있는 메시지 허용) · 한도(4-2) 넘으면 텍스트 대체 · **PATCH 는 `embeds: []` 를 명시**(빼면 옛 embed 가 남는다 — 버튼 뒤 "기록됨" 류) | 패키지 기능(소비자 0) | revert **즉시**(재빌드 릴리즈와 함께) |
| **P3-b** fin 코드 표 13곳 | embed 필드(숫자 열) 또는 행 목록 · content 한 줄 요약(푸시 미리보기 · Q-4) · `expense.ts:560` escape 결함 함께 | 숫자 표가 열로 | revert + 릴리즈 **중간** · minor |
| (P4 · 범위 밖) | 리포트 웹 보관 + 요약 · 링크 | — | fin DB 모델 = 마이그레이션 **편도 성분** |

**PR 순서:** P1 → P2-a → P2-b · P2-c · P2-d(독립) → 릴리즈(minor · 서버 조치 없음 · 릴리즈 노트에 "fit 프롬프트 기본값이 시작 때 새 버전으로 들어갈 수 있다") → 실사용 → P3-a → P3-b → 릴리즈.

**P3 전 확인:** embed inline 필드가 **모바일에서 나란히 보이는지 미확인** — P3-a 뒤 검증 Discord 서버에서 실기기로 본 뒤 P3-b 의 표현(필드 vs 행 목록)을 정한다.

**시험:** P2-a = 정리기 단위 시험(표 · 가짜 링크 · `<` · 긴 제목 · `>>>` · `-#` · `||` · 코드 안 무변경 · 분할 경계 표) + **"markdown 형식은 escape 되지 않는다" 를 발신 3곳 각각**(chat 은 `toChunks` 한 곳이 답장 · 편집 · 인터랙션을 덮는다 — `rest.ts:185` · :246-253) · P2-b/c/d = 호출부 형식 · 특성 테스트 재작성 · 프롬프트 규칙 문자열 · P3 = 한도 · 대체 · PATCH `embeds: []`.

### 4-2. 정리기 규칙 · 위험

| # | 위험 | 막는 것 |
|---|---|---|
| R1 | 외부 글이 서식이 된다(뉴스 제목의 `#` 등) | 해 작음 — 아래 해로운 것만 |
| R2 | 가짜 링크 `[보이는 글](다른 주소)` | `글 (주소)` 로 펼친다 — 주소가 늘 보인다 |
| R3 | Discord 표기 `<@…>` `<#…>` `<t:…>` `</cmd:id>` `<:e:id>` `<a:…>` | **`<` 를 모두 escape**(단순 · 전부 막는다) — 지금 `escapeDiscordMarkdown` 과 같다(`a < b` · `<5%` 는 글자 그대로 보인다) · **R8(코드 영역 제외)이 먼저**(코드 안에서는 `\` 가 보인다) · `<https://…>` 는 글자로 보여도 링크는 산다 |
| R4 | `>>> ` 가 그 조각 나머지 전체를 인용으로 삼킨다 | `>>> ` 를 다음 빈 줄까지 **각 줄 `> `** 로 바꾼다(인용 범위 보존) |
| R5 | `-# `(작은 글씨) · `\|\|스포일러\|\|` | 그대로 둔다(해 없음) — 단 시험으로 동작 고정 |
| R6 | `@everyone` 글자 | 핑은 없다(`parse: []`) — 글자는 남는다 · 허용 |
| R7 | 분할 경계에 걸린 표 · 목록 | 표 → 행 목록을 **분할 전에** · 줄 단위 분할 — 단 한 줄이 예산을 넘으면 `sliceLine`(:244-257)이 중간을 자른다(행 목록 한 줄이 아주 길 때) |
| R8 | 정리기가 코드 스팬 · 펜스 안을 바꾼다 | 코드 영역을 먼저 떼어 두고 바깥만 |
| R9 | embed 한도 | 필드 25 · 필드 이름 256 · 값 1024 · title 256 · description 4096 · footer 2048 · author 256 · 메시지당 embed 10 · **embed 전체 합 6000** — 넘으면 텍스트 대체 |
| R10 | fin 프롬프트 표 금지를 풀면 분기 PDF · 웹 `/ai` 에도 표가 간다 | Q-1 |

> **정정 (2026-11-17 · P2-a #756 · 9-1 critical 3회) — R2 · R3 는 코드 판정과 무관하게 글 전체에.** 위 R3 *"`<` 를 모두 escape"* 와 R8 *"코드 영역을 먼저 떼어 두고 바깥만"* 의 조합은 코드 영역 판정이 Discord 와 어긋날 때마다 차단이 꺼졌다 — 한 줄 펜스 · 닫는 줄 꼬리 · 줄 중간 펜스 · 인라인 코드가 먹은 펜스 · escape 된 백틱 · 인용 경계(리뷰 3회 연속 같은 계열). 파서를 더 흉내 내지 않고 **차단을 판정에서 떼었다:** 모든 `<` 뒤 · 모든 `](` 사이에 폭 없는 공백(U+200B)을 넣는다(`neutralize` · 코드 안 포함 — 보이지 않는다 · 백슬래시는 코드 안에서 글자로 보였다). 코드 판정(전역 ```` ``` ```` 첫 짝 · 인라인 코드)은 이제 **겉모양 규칙(표 · 제목 · 링크 펼침)에만** 쓰이고, 틀려도 안전에는 영향이 없다. 맨 주소 안의 `<`(autolink 가 `\` 까지 먹는 경우)도 함께 끊긴다. 대가: 코드 · 주소를 복사하면 폭 없는 공백이 따라온다. 되돌리기: 문구 (**즉시**).

## 6. 남은 미결 질문

| | 질문 | 무엇을 가르는가 | 우선 |
|---|---|---|---|
| ~~Q-1~~ | **답함 → §2 F3**  fin `SYSTEM_PROMPT` 의 "마크다운 표 절대 사용하지 않음" 유지 / 해제 | 유지 = 모델이 처음부터 목록(분기 PDF 원문 · 웹 `/ai` 무영향) · 해제 = Discord 는 행 목록 변환 · 웹 `/ai` 는 진짜 표 · **분기 PDF 에 `\|` 가 글자로**(PDF 마크다운 렌더 없음). 권고: **유지** + "제목 `##` 허용"만 | P2-b 전 |
| ~~Q-2~~ | **답함 → §2 F4**  fit 운영 DB 의 리포트·시스템 프롬프트 "사용 중" 버전이 코드 기본값인가 · 웹에서 고친 것인가(키마다) | 기본값이면 배포로 자동 갱신 · 고친 것이면 사용자가 새 초안을 활성화 | P2-c 전 · **사용자 확인**(프롬프트 페이지) |
| ~~Q-3~~ | **답함 → §2 F5**  TA 가이드(ta-signal · 틀 안 AI 조각)를 P2 에 넣을까 | 넣으면 틀 재작성 · 빼면 그 알림만 옛 형식 | P2-b 전 · 권고: 빼고 후속 |
| Q-4 | embed 메시지의 content 요약 한 줄 형식 | 푸시 미리보기 | P3-b 전 |
| Q-5 | embed 색 · 앱별 구분 | 통일감(취향) | P3-a 전 |

## 7. 유효기간

- 새 채널(Slack · 웹 푸시 등)을 붙일 때 — 본문 원형을 다시 정한다.
- 도메인 #3(#240)이 리포트를 보낼 때 — 같은 형식인지.
- P4(리포트 웹 보관)를 결정할 때.

---

### 반영 대장 (감사 1회 · 정정 13)

| 감사 # | 반영 |
|---|---|
| 1 · 2 | §3 발신 4곳 표 · 3항식 · gateway 죽은 경로 |
| 3 | r1 R6 · Q-3(2000 첫 조각) 삭제 — chat 편집은 이미 이어 보낸다 |
| 4 | P2-a 에 chat `TextFormat` · 앱 `ReplyFormat` |
| 6 · 7 | fin 호출을 notify 3 · chat 2 · 틀 1 로 · `/브리핑` 4096 plain 분기 · plain 재전송 |
| 8 | Q-1 에 분기 PDF · 웹 `/ai` |
| 9 | fit 기본값 자동 활성화 · P2-c 되돌리기 · Q-2 |
| 10 | 통합 층 변환기 → P2-d |
| 11 | 특성 테스트 재작성 비용 |
| 14 | P3-a 범위(편집 · 인터랙션 · 응답 모델 · 빈 본문) · PATCH `embeds: []` |
| 16 | 단계별 patch / minor · 서버 조치 없음 · 재빌드 동반 |
| 17 | 4-2 R3~R8 |
| 확인 보충 5 · 12 · 13 · 15 · 19 | 코어 폴백 · fit `•` · expense escape · 한도 전체 · `sliceLine` |
| 미확인 15 · 20 | P3 전 실기기 확인 · Q-2 사용자 확인 |

### 반영 대장 (재감사 · 정정 3)

| 재감사 # | 반영 |
|---|---|
| 2 | 앱별 `ReplyFormat` → 어댑터 줄 번호 |
| 3 | fit 기본값: 바뀐 키마다 행 · 손대지 않은 키 활성 / 고친 키 초안 · 대상 키 |
| 6 | P2-d = Release 자동 배포(4b-5) · P2-a 만으로도 통합 층 재배포 · advisor `bot.test.ts` |
| 확인 보충 5 · 7 · 8 · 9 | `toChunks` 한 곳 · R3 은 R8 먼저 · R4 인용 범위 보존 |
