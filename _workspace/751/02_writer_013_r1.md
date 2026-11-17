# 013 — Discord·웹 메시지 가독성 (초안 r1 · 감사 전)

작성 2026-11-17 · 상태 **기획(초안)** · 이슈 #751 · 정본이 되면 `docs/specs/013-message-format.md`

> 이 파일은 감사(`reversibility-audit`) 전 초안이다. 정본 아님.

## 1. 무엇이 바뀌었나

009(텔레그램 종료 · Discord 전면 전환)는 **수신·발신 경로**를 옮겼고 **본문 형식**은 옮기지 않았다. 두 앱은 여전히 텔레그램 HTML 로 본문을 만들고 `@pleiades/notify` 가 그것을 Discord 마크다운으로 바꾼다(003 §4-2 정정 · M-6a #141). 그 변환은 "외부 텍스트가 Discord 서식이 되지 않게" 를 우선해 모든 텍스트를 escape 한다(`discord-md.ts` §7-1 정정 6-A).

사용자(2026-11-17): *"메시지 포맷들이 텔레그램때 썼던거라 그런지 디스코드에서 보는게 어색한 부분이 좀 많아. (특히 표 구현) 리포트 같은 내용들은 웹에서도 보기 힘들정도의 가독성인데 이거 개선할 방안도 같이 고민해줘."*

전제가 바뀐 곳: 텔레그램 HTML 은 더 이상 어떤 채널의 원형도 아니다(009 D-5 · 텔레그램 코드 0). 따라서 **본문의 원형을 Discord 마크다운으로 옮길 수 있다.**

## 2. 확정된 답

| | 질문 | 답 | 근거 |
|---|---|---|---|
| F1 | AI 장문의 표를 Discord 에서 어떻게 | **행마다 목록** — `• **첫 열** — 헤더: 값 · 헤더: 값` (코드 블록 고정폭 표 · 혼합은 택하지 않음) | 사용자 2026-11-17 |
| F2 | 범위 | **P1 지금 + P2·P3 설계** (P4 리포트 웹 보관은 범위 밖 · 나중 결정) | 사용자 2026-11-17 |

## 3. 실측 근거 (2026-11-17 · 읽기 전용 조사 · file:line)

**변환 경로(notify):**
- 모든 Discord 발신(웹훅 `discord.ts:85-86` · 봇 transport `discord-bot.ts:120-121` · chat 답장 `packages/chat/src/rest.ts:99-100` · 인터랙션 `discord-gateway.ts:208-213`)이 `toDiscordContent` → `htmlToDiscordMarkdown` → `splitDiscordMarkdown(md, 2000)` 한 길이다.
- `Content.format` 은 `'html' | 'plain'` 둘뿐(`packages/notify/src/types.ts:37`) — 마크다운을 그대로 보내는 길이 없다.
- 텍스트 노드는 전부 escape(`discord-md.ts:79-89`): 인라인 `\ * _ ~ \` | [ ] <` · **줄머리 `> # + - 1.`(`LINE_HEAD_RE` :81)** → 목록 · 제목 · 번호 목록이 글자 그대로 보인다.
- `ul`/`li`/`table` 처리기 없음(:155-156 · 태그를 벗겨 텍스트만).
- embed 사용 0(notify · chat src grep 0) · 버튼(components)만.
- chat 편집 · 인터랙션은 2000자 넘으면 첫 조각만(`rest.ts:148` · `discord-gateway.ts:212`).

**AI 장문(모델 출력 = 마크다운):**
- fin 호출 6: `bot/commands/briefing.ts:124` · `commands/ai.ts:88` · `notifications/ta-signal-alert.ts:328` · `notifications/briefing.ts:107` · `notifications/monthly-report.ts:49` · `notifications/active-review.ts:156` — `markdownToHtml`(`bot/utils/markdown.ts:51-91`)이 **MD → HTML** 로 바꾸고 notify 가 다시 **HTML → MD**. 표는 `- 키 / 헤더: 값 / 헤더: 값` 한 줄로 평탄화(:14-46) → 그 `- ` 가 escape 돼 목록이 아니다. `## 제목` → `<b>`(:70) · `---` 삭제(:85). `/ai` 는 텔레그램 한도 4096 으로 먼저 자른다(`formatter.ts:50` · `ai.ts:86`) → 2000 분할이 또 한 번.
- fit 호출 5(3 파일): `bot/commands/report.ts:34,66` · `notifications/scheduler.ts:26` · `commands/ai.ts:131,138` — `mdToHtml`(`bot/utils/html.ts:2-11`)은 표 변환 · HTML escape · `---` 처리 없음 → 표가 escape 된 `|` 원문.
- 프롬프트: fin `lib/ai/system-prompt.ts:57-74` "응답은 메신저와 웹 모두에서 표시된다 · 마크다운 표 절대 사용하지 않음 · 리스트(-)와 들여쓰기 · 제목은 **볼드** (## 헤더 대신)". fit `prompts/defaults/system.ts:139` · `reports.ts:19,36,65` "간결한 마크다운"(표 금지 없음) — **운영 본문은 DB 의 활성 버전**(`reports.ts:1`)이라 기본값과 다를 수 있다.

**코드 템플릿 표:** 13곳 · 6 파일 · **전부 fin**(fit 0) — `notifications/daily.ts:89` · `commands/portfolio.ts:85,89,90,138,147,151` · `notifications/rsu.ts:77,105,171` · `commands/expense.ts:560` · `commands/backtest.ts:62` · `commands/analysis.ts:71`. 공백 2~4칸 · `｜` · `─` 로 열을 흉내 — 비례폭이라 맞지 않는다. `padEnd` 열 정렬 0 · `<pre>` 생성 0.

**웹:**
- fit 5곳이 `prose` 를 쓰지만 typography 없음 → 스타일 0 → **P1 #753 으로 고침**(`md-body`).
- fin `/ai` 는 `.ai-markdown` CSS(표 포함 · `globals.css:79-185`)로 정상. 브리핑 · 리뷰 · 월간은 DB 모델이 없어 웹에 없다. 분기 PDF `aiComment` 는 마크다운 원문(`lib/report/pdf-template.tsx:154`).

## 4. 경로

### 4-0. 원칙

- **본문의 원형 = Discord 마크다운.** AI 장문은 모델이 쓴 마크다운을 한 번만 다듬어 보낸다(이중 변환 제거).
- **escape 는 "외부 텍스트" 에만.** 코드 템플릿이 끼워 넣는 값(종목명 · 사용자 입력 · 뉴스 제목)은 지금처럼 escape 하고, 템플릿 자신의 서식(제목 · 목록 · 굵게)은 살린다.
- AI 장문은 외부 글을 담을 수 있다(뉴스 · 공시 요약). 서식이 되는 것 자체는 해가 작다 — **해가 되는 것만 막는다**: 가짜 링크(`[보이는 글](다른 주소)`) · 멘션 · 타임스탬프/채널 표기(`<@…>` `<#…>` `<t:…>`). 멘션은 이미 `allowed_mentions: { parse: [] }`.

### 4-1. 단계

| 단계 | 내용 | 여기서 멈추면 남는 것 | 되돌리기 |
|---|---|---|---|
| **P1** (#753 · PR 진행) | fit 웹 `md-body` — 제목 · 목록 · 표 스타일 | 웹 리포트가 읽힌다 | revert + 릴리즈 **즉시~중간**(웹 표시만) |
| **P2-a** notify | `Content.format: 'markdown'` 추가 · `discordMarkdown(md)` 정리기: ① GFM 표 → 행 목록(F1) ② 가짜 링크 → `글 (주소)` · 주소 그대로는 유지 ③ `<` 로 시작하는 Discord 표기 escape ④ `####` 이하 제목 → 굵은 줄(Discord 는 `#`~`###` 만) ⑤ `---` → 빈 줄 ⑥ 2000 분할은 기존 `splitDiscordMarkdown`(코드 펜스 재개). html · plain 경로는 무변경 | 패키지에 새 형식(소비자 0) · 기존 메시지 무변경 | revert **즉시**(소비자 0) |
| **P2-b** fin AI 장문 6 | `markdownToHtml` 대신 `markdown` 형식으로 · `/ai` 의 4096 선분할 제거 · 시스템 프롬프트 포맷 규칙을 Discord 기준으로(제목 `##` 허용 · 목록 허용 · 표는 써도 행 목록으로 바뀐다 — Q-1) | fin AI 답이 Discord 에서 목록·제목으로 보인다 | revert + 릴리즈 **중간** |
| **P2-c** fit AI 장문 5 | 같다 · 기본 프롬프트 갱신 · **DB 활성 버전은 사용자가 프롬프트 페이지에서**(Q-2) | fit 리포트 · `/ai` 가 같다 | revert + 릴리즈 **중간** · DB 프롬프트 버전 되돌리기 **즉시**(페이지) |
| **P3-a** notify embed | `Content.embeds?` → Discord embed(title · description · fields inline · color · footer) · 웹훅 · 봇 · chat 답장 세 경로 · 한도 검사(필드 25 · 값 1024 · 합 6000) · 넘으면 텍스트로 대체 | 패키지 기능(소비자 0) | revert **즉시** |
| **P3-b** fin 코드 표 13곳 | 포트폴리오 · 계좌 상세 · 일일 요약 · RSU · 가계부 미리보기 · 백테스트 · 분석 사유 → embed 필드(숫자 열) 또는 행 목록(긴 글) · **푸시 미리보기용 한 줄 요약을 `content` 에 함께**(embed 는 알림 미리보기에 안 보인다 — Q-4) | 숫자 표가 열로 보인다 | revert + 릴리즈 **중간** |
| (P4 · 범위 밖) | 리포트 웹 보관 + Discord 요약 · 링크 | — | fin DB 모델 = 마이그레이션 **편도 성분** |

**PR 순서:** P1 → P2-a → P2-b · P2-c(독립 · 병행 가능) → 릴리즈 → 실사용 확인 → P3-a → P3-b → 릴리즈. P2 와 P3 는 서로 막지 않는다.

**시험:** P2-a 는 정리기 단위 시험(표 · 가짜 링크 · 표기 · 긴 제목 · 분할 경계에 걸린 표) · P2-b/c 는 호출부가 `markdown` 형식으로 보내는지 · 프롬프트 규칙 문자열 · fin `/ai` 분할 1회. P3 는 한도 · 대체 경로.

### 4-2. 위험

| # | 위험 | 막는 것 |
|---|---|---|
| R1 | AI 답 안의 외부 글이 서식이 된다(뉴스 제목의 `# ` 등) | 해 작음 · 가짜 링크 · 표기만 막는다 — 정리기 시험 |
| R2 | 가짜 링크로 다른 주소 유도 | ② 링크 펼침 — 주소가 늘 보인다 |
| R3 | 분할 경계에 걸린 표 · 목록 | 표 → 행 목록을 **분할 전에** · 행 단위 분할 |
| R4 | fit DB 활성 프롬프트가 기본값과 다르다 | 기본값만 바꾸고 활성 버전은 사용자 판단(Q-2) · 표가 와도 행 목록으로 바뀐다 |
| R5 | embed 는 모바일 푸시 미리보기에 안 보인다 | content 한 줄 요약(Q-4) |
| R6 | 2000 넘는 chat 편집 · 인터랙션이 첫 조각만 | P2-a 에서 함께(편집 대상이 아닌 이어지는 메시지로) — Q-3 |

## 6. 남은 미결 질문

| | 질문 | 무엇을 가르는가 | 우선 |
|---|---|---|---|
| Q-1 | fin 시스템 프롬프트의 "마크다운 표 절대 사용하지 않음" 을 유지할까 · 풀까 | 유지 = 모델이 처음부터 목록으로 쓴다(변환 의존 0) · 풀면 표 → 행 목록 변환에 기댄다(웹 `/ai` 는 진짜 표로 보인다) | P2-b 전 |
| Q-2 | fit DB 활성 프롬프트(리포트 · 시스템)를 누가 갱신하나 | 사용자가 프롬프트 페이지에서 / Claude 가 기본값만 | P2-c 전 |
| Q-3 | 2000 넘는 편집·인터랙션 응답을 이어지는 메시지로 보낼까 | chat 패키지 변경 범위 | P2-a 설계 때 |
| Q-4 | embed 메시지의 content 요약 한 줄 형식 | 푸시 미리보기 | P3-b 전 |
| Q-5 | embed 색 · 앱별 구분 | 통일감(취향) | P3-a 전 |

## 7. 유효기간

- 새 채널(Slack · 웹 푸시 등)을 붙일 때 — 본문의 원형(Discord 마크다운)을 다시 정한다.
- 도메인 #3(#240)이 Discord 로 리포트를 보낼 때 — 같은 형식을 쓰는지 확인.
- P4(리포트 웹 보관)를 결정할 때 다시 연다.
