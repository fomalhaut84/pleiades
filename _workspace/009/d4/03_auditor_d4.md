# 009 D-4 초안 1회차 감사 — 판정

대상: `_workspace/009/d4/02_writer_d4.md`. 감사 시점 HEAD `fb1ed86`(초안 기준 `40c7ef4` 와의 차이는 `CLAUDE.md`·handoff 뿐). 읽기 전용 · 서버·서비스 DB·`repos/*`·원본 접근 0 · `claude` 실행 0.

**블로커 1 · 정정 9 · 경미 10.** 문서는 초안 상태로 돌아간다. N1~N10 숫자와 fit 판단 표의 골격은 맞다.

## 정정

### 정정 1 (블로커) — fin `CLAUDE.md`·rules 가 AI 입력인데 "D 그대로"로 빠졌다
- 근거: `apps/finance/src/lib/ai/cli-isolation.ts:12-15`(루트 문서만 뺀다 · 앱 자신의 `CLAUDE.md`·rules 는 그대로) · `claude-advisor.ts:825,861`(제외 인자 · `cwd: projectRoot`) · `--setting-sources` 차단 grep 0.
- 빠진 줄: `apps/finance/CLAUDE.md:18,20,54,88,94` · `apps/finance/.claude/rules/workflow.md:87`.
- 직접 충돌: `CLAUDE.md:88` "텔레그램 chat별 `--resume` … (`/reset`로 초기화)" · `:94` "입력/알림은 텔레그램 중심". UQ-2 로 프롬프트를 `!reset` 으로 바꿔도 모델 입력에 `/reset` 이 남는다. §5 회귀 테스트는 `SYSTEM_PROMPT` 만 본다.
- fit 은 해당 없음(`apps/fitness` 에 `CLAUDE.md`·`.claude` 미추적).
- 고칠 곳: 머리말 · §2-1 N2 주석("A 10 + 앱 문서 6줄") · §3 행 추가 · §10 UQ 추가(고칠지 / D-5 로 미룰지 / 컨텍스트에서 뺄지 — 후자는 fin 매매 방법론 rules 입력과 얽힌다).
- 격리 경계: `isolation.md` I-10 은 `apps/*/.claude` 수정을 금지한다("수용으로만 바뀐다"). rules 쪽은 그 행이 막는다고 적어야 한다.
- 미확인: 실제 호출의 컨텍스트 포함 여부는 실행하지 않았다(I-8). 근거는 위 주석과 #247 의 같은 경로 실측.

### 정정 2 — 아웃바운드 알림의 `/ai` 안내가 빠졌다 (N9 · Δ1 과 같은 결함)
- `active-review.ts:194` "웹 AI 분석 페이지 또는 /ai 명령으로…" · `briefing.ts:110` `options.aiCommand ?? '/ai'`(크론 `scheduler.ts:207,220` 은 인자 없음 · Discord 수동만 `!ai` · `discord/router.ts:132`) · `active-review.ts:182` "/ai 에서 직접 질문해주세요"(웹 경로 `/ai` `nav-config.ts:48` 로도 읽힌다).
- 실패 안내가 `notifierFor(...).notify(Route.ALLOWED, htmlContent(fallback))`(`active-review.ts:166-167`)로 나가 `toDiscordCommandText` 를 타지 않는다.
- 고칠 곳: §3 B 행 · §8 PR-2 · N9 재계산 · §2-2 `[W]` "슬래시 명령은 `:162-163` 뿐"의 범위를 프롬프트로 한정 · §9.
- 재현: `git grep -n -E "(^|[\`\"' (>])/(ai|reset)([^a-zA-Z0-9_/-]|$)" -- apps/finance/src/bot/notifications`(macOS `git grep -E` 는 `\b` 가 먹지 않아 0건 오탐).

### 정정 3 — "되돌림이면 배포 뒤 결과로만 분기를 안다"(§7-2 UQ-5)는 틀렸다
`codeHash` 미노출은 맞다(`versions.ts:69-81`). 그러나 `VersionRail.tsx:64-71` 이 버전마다 번호·상태·출처·메모("vN 로 되돌림")를 보여 주므로 사슬을 따라가면 배포 전에 판정할 수 있다. §7-2 · §10 UQ-5 수정.

### 정정 4 — §7-3 "웹 문구·usage·양식: R-8 또는 revert … DB 쓰기 0" 은 fit R-8 에서 거짓
R-8 은 태그 전체를 내려 `system.ts:78` 도 돌아가고 새 행이 생긴다(`sync-plan.ts:37-41`). DB 쓰기 0 은 PR-2/PR-3 만 revert 한 patch 와 fin R-8 에서만 참. 행을 나눈다.

### 정정 5 — §8 "PR-1 만 revert" 는 판정 양식의 "되돌림(fin · fit · 둘 다)" 을 만족하지 못한다
PR-1 은 fin·fit 을 함께 담는다. fin 만 후퇴해도 전체 revert 면 fit 에 새 행 · UQ-3 수정도 사라진다. Release 는 항상 fin→fit 둘 다 배포(`deploy/ssh-deploy.sh:7`). 부분 revert 또는 앱별 되돌리기 경로를 적는다.

### 정정 6 — 런북 대상 누락: `docs/runbooks/release-inplace.md:261`
양식 예시 `현황|/today: 예/아니오` 가 같은 지시. §3·§4 에 `:16,72,198` + `:261` · PR-3.

### 정정 7 — §4 ③ 괄호가 §5 와 모순 · §5 는 축소 서술
S2 에서 텔레그램 사용자에게 `!reset` 안내는 거짓. `commands/ai.ts:548-551` · `expense.ts:107-115` · `utils/ai-trigger.ts:9-13`: `!reset` 은 route none = **무응답** · 초기화 안 됨. `!ai …` 는 `?`·키워드가 있으면 그 글자째 AI 질문, 없으면 무응답. `:338` 은 S2 에서 참(Discord 쪽 확인 지시).

### 정정 8 — J-C Q3 은 `:129`↔`:133` 을 검증하지 못한다
"커스텀 전략" 명령은 `:133-163` 절에 없다. 답의 근거는 `:119`·`:129`. `:133` 절에만 있는 정보를 묻는 질의로 바꾼다. Q2·Q3 모두 `?` 가 있어 question 으로 도달한다.

### 정정 9 — §8 "24 h 안 정기 출력" 은 항상 성립하지 않고 fit 정기 출력이 빠졌다
fin 크론 `scheduler.ts:204,217,230,247,260`: 08:30·23:00·15:40 월~금 · 07:15 화~토 · 주간 리뷰 토 09:00. 토 09:00~일 08:30 발행이면 다음 AI 출력(월 08:30)까지 24 h 초과 · 리뷰는 `active_review` 설정으로 건너뜀(`active-review.ts:174`). 24 h 는 대장 밖 숫자. fit: `system` 은 리포트의 바탕(`daily-report.ts:75` → `claude-advisor.ts:74`) · 모닝 08:00·이브닝 23:00 매일(`bot/notifications/scheduler.ts:65,78`). J-C 양식에 fit 행 추가.

## 주장별 판정

| # | 주장 | 판정 | 근거 |
|---|---|---|---|
| 1a | ③ S1 거짓 0 · ① 12 | 확인 | 1+3+6+1+1=12(`:58` 은 부분 거짓 포함) · N8=1+3+2+6+1+4+1+2=20 |
| 1b | 상태 S0·S1·S2 | 확인 | `discord-switch.cjs:15` · `discord-inbound.sh` · `telegram-polling.sh` · 인계 노트(S0) |
| 1c | ③ N9 괄호 | 정정 7 | |
| 2 | D-5 필수 재수정 0 | 확인(N8·N9 범위) | `discord/router.ts:174-175` · 경미 1 |
| 3a | S1 에서 `!ai`·`!reset` 참 | 확인 | 수신 무관 |
| 3b | S2 텔레그램 | 정정 7 | 무응답 |
| 3c | 웹 `!reset` = 지금의 `/reset` | 확인 | `api/ai/ask/route.ts:39` 세션 없음 |
| 3d | `:136-156` 같은 문제 없음 | 확인 | 슬래시 없는 한글 · `router.ts:194-214` 같은 정규식 |
| 4a | 웹 이체 입력·수정·삭제 | 확인(화면까지) | `TransactionForm.tsx:235-236,366-396` · `TransactionTable.tsx:121-127,187-193` · `ExpensesClient.tsx:272-278,425-426,456,465` · `TransactionDeleteModal.tsx:63` · `[id]/route.ts:62-89,135-137` |
| 4b | 봇에 이체 경로 없음 · `:222` 주석 | 확인 | grep 0 |
| 4c | 같은 거짓 안내 추가 | 없음(grep 범위) | `rsu-vest.ts:33` 은 API 근거상 참 · 화면 소스 미독 |
| 5a | J-C 서버 실행 0 | 확인 | |
| 5b | S-6·런북 관계 | 확인 | 런북 §2 와 달라 S-6 정정 필수 · 경미 2 |
| 5c | 도달·세션 전달 | 확인 | `claude-advisor.ts:813-819` |
| 5d | 정기 출력 시각 | 정정 9 | |
| 5e | Q3 | 정정 8 | |
| 6a | 판단 표 | 확인 + 경미 3 | `sync-plan.ts:23-25,31-42` |
| 6b | `pendingCodeDefault` 꺼짐 | 확인(코드) | `versions.ts:91,137` · 실행 미확인 |
| 6c | 웹 restore 뒤 코드 변경 = draft | 확인 | `versions.ts:204` · `sync-plan.ts:24,40-41` |
| 6d | 되돌림 해시로 뒤에만 안다 | 정정 3 | |
| 6e | `validatePrompt` 가 막는 경우 | 확인(사실상 없음) | `definitions.ts:44` · 경미 4 |
| 7 | 모든 릴리즈가 세션을 비운다 | 확인 | `session-store.ts:5,7,21` · `deploy.sh:356,360-361` |
| 8a | C 고정 21 · 참 43 · 고침 1 | 숫자 확인 · 경미 5 | 65행 파싱 · 1646 재현 |
| 8b | `:338` 새 문구 | 확인 + 경미 6 | 아래 표 |
| 8c | 고정 테스트 신설 | 확인 | |
| 8d | 런북 대상 | `:219` 제외 확인 · 정정 6 | |
| 8e | `409 $conflict` 유지 | 확인 | `:337,339` · 009 §7 D-5 |
| 9 | 숨은 대상 | 정정 1·2·6 | |
| 10a | PR 3 · 파일 비중복 | 확인 | |
| 10b | patch · 서버 조치 0 | 확인 | #199 · `mcp-config.json` 무변경 전제 |
| 10c | 되돌리기 등급 | 대체로 확인 · 정정 4·5 | |
| 10d | 소요 → 등급 | 확인 | |
| 10e | 대장·합계 | 일치 · 경미 7·8 | |

### `release-inplace.sh:338` 새 문구(`Discord 현황` / `!today`)의 상태별 사실

| 상태 | 사실 |
|---|---|
| S0 · S1 · S2 | 참(fin `router.ts:194` · fit `discord/router.ts:44`) |
| Discord 수신 끔(`discord-inbound.sh off`) | 거짓 — S0~S2 밖의 넷째 상태 |
| D-4 릴리즈 자신의 양식 | 옛 문구가 나온다(자기 교체 구조 `release-inplace.sh:17`) · 새 줄은 다음 릴리즈부터 |

### 숨은 대상 — 찾지 못한 것
fin 프롬프트 `:134` "봇 커맨드"(참) · 도움말 `start.ts`(`toDiscordCommandText` 를 탄다) · 웹 `NutritionFoodList.tsx:214` "봇 · 웹"(참) · fit 입력 경로 서술 `system.ts:78` 하나 · fit MCP 0. 단어 grep 이지 의미 전수가 아니다 — 초안 §2-3 "낱말 없는 전제 전수 미측정" 유효.

## 경미
1. `scheduler.ts:36` 새 주석은 S 표 밖 · D-5 때 재작성. "D-5 재수정 0" 의 범위를 §4 에 적는다.
2. §9: 009 D-4 행 **수용 기준 칸**도 S-6 과 함께 정정 후보.
3. §7-2 draft 행: "수정본의 되돌림"(hash null · `versions.ts:204`) → "그 외 되돌림".
4. UQ-7 D-a: `assertToolsAcknowledged`(`versions.ts:186`)도 탄다.
5. N7 "지금도 참" 일반화: `advisor-monitor.ts:284-285` · fit `scheduler.ts:30` · `auto-adjust.ts:405` 는 라우트 Discord + 웹훅 빔일 때 원인을 잘못 가리킨다 → "대체로 참"(처분 D-5 유지).
6. PR-3 테스트는 줄 번호가 아니라 `사람 확인` 줄로 찾는다 · §8 에 "D-4 릴리즈 자체 양식은 옛 문구".
7. N8 출처 "G-a~G-g": 표에 G-f 없음(합계는 맞다).
8. 대장 밖 숫자: "6줄"(§8) · "2 줄"(§5) · "1 + 3"(§3) · "24 h".
9. `tools/local/README.md:32` 새 문구의 `/브리핑` 은 등록 이름이 아니다(런북 `:198`).
10. `ai-model-upgrade.md` 표 "`/ai` 자유 질문"·"봇 `/ai`" 도 낱말 없는 옛 표기 · §9 D-5 제외 목록에 J5 와 함께.

## 재호출 시 확인할 것
정정 1~9 반영 · 정정 1 의 UQ 와 I-10 표기 · 정정 2 반영 뒤 N9·§4·P-a 정합. 나머지 "확인" 은 대상 코드가 바뀌지 않으면 재검증하지 않는다.
