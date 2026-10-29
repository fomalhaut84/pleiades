# 009 D-3 설계 초안 2회차 — 재감사

감사 2026-10-29 · 대상 `_workspace/009/d3/02_writer_d3_r2.md`(초안 2회차) · 이전 감사 `03_auditor_d3.md`([A]) · 근거 = 저장소 코드·정본 직접 읽기(실행·빌드·테스트·네트워크·DB·git 쓰기 0 · `repos/*`·원본 미접근 · `apps/*` 하네스 지시 미실행)
**요약: 정정 0 · 경미 4 · 블로커 0** — [A]#1~#4 정정과 [A]#5~#13 경미는 **전부 반영됐다**(아래 표). 새 정정은 없다. 경미 4건은 문안 수준이라 최종본에서 직접 고치면 되고, 다시 재감사할 필요는 없다(D-1·D-2 마지막 회차와 같은 처리). **권고와 UQ-1~UQ-5 는 사용자 질문으로 넘겨도 된다.**
**호출자 중점 3곳 결론:** ① 토스트를 권고로 올린 것 — **타당**(C3) ② `removeButtons` 뒤 `edit` 의 PATCH 2회 — **무해**(순서 보존 · 레이트 한도 여유 · C4) · 단서 1 = [A2]#3 ③ PR-1a 특성 테스트 — **선다**(기존 fin 테스트 방식으로) · 다만 "주입" 이 아니라 모듈 대체다 = [A2]#2.

대상 코드는 1회차 이후 바뀌지 않았다(`git log -1 -- packages/chat apps/finance/src deploy/discord-inbound.* packages/notify/src` = `66dca16` · 1회차 기준 `3a4d28d` 이전). 그래서 1회차 확인 C1~C10 은 다시 보지 않았다.

---

## 1회차 판정 반영 확인

| [A]# | 반영 위치 (초안 2회차) | 판정 |
|---|---|---|
| 1 PR 순서 | §0 · §5 머리 문단 · PS1~PS3 표 · PR-1a/1b/2 행 · N6a · §11 · §12 | 반영 — 파일 겹침은 C1 에서 다시 확인 |
| 2 무변경 보장 | T 표(T13~T18 · PR 귀속) · B 응답 모델 = 단계 열 · S 비교 문안 · N17 · D3-R1 | 반영 — 내용은 C2·C4·C5 |
| 3 D2 근거 | W15·W16·W17 · D2/D3 행 · PR-2 행(`notifier.ts:13`) | 반영 — 인용 줄 번호 전부 맞다(`telegram.ts:33,36` · `deliver.ts:33-49,65-83` · `discord-bot.ts:114,124-143` · `rest.ts:98-100,142-143` · `notifier.ts:68,85-87` · `briefing.ts:79,83-96`) |
| 4 UQ-4 전제 | UQ-4 · Q 표 `chatBusy` 행 | 반영 |
| 5 typing | Q typing 행 · W18(`ai.ts:51-54,89` 맞다) | 반영 |
| 6 첨부만 | H 배선 · W19 · T Discord 라우팅 표 · L-5 | 반영 |
| 7 L-8 | L-8 | 반영 |
| 8 복수 `transactedAt` | W5 · T(T5 날짜 단언) | 반영 |
| 9 X-1 | X-1 | 반영 |
| 10 스크립트 문구 | PR-3 행(`:4-7` · `:241` · `:242`) | 반영 |
| 11 토스트 | B ack 행(권고로 격상) · T 버튼 · L-5 | 반영 — 격상의 타당성은 C3 |
| 12 R-8 근거 | §2 R-8 행 | 반영 |
| 13 N17 표기 | N17 | 반영 |
| C10 보강 | UQ-3 | 반영 |
| (부수) UQ-2 우선순위 | UQ-2 "PR-3 전" | 반영 — 단서는 C6 |

---

## 정정

없음.

---

## 경미

### [A2]#1 PR-2 "`ai.ts`·`expense.ts`·`trade.ts` 는 건드리지 않는다" ↔ P "정규식 상수화" 와 `/report` 파일 단계
- 정규식 상수화(P)는 한글 hears 28 전부가 대상인데, 그중 3 개가 PR-1a 파일에 있다 — `^매수` · `^매도`(`trade.ts:365,374`) · `^수입\s+.+$`(`expense.ts:633`). PR-2 가 상수화를 맡으면 PR-1a 파일을 다시 고친다(순서상 1a 뒤라 충돌은 없지만 표의 "건드리지 않는다" 와 어긋난다). `ai.ts` 에는 hears 가 없어 PR-1b 와는 겹치지 않는다.
- PR-2 의 `/report` 는 파일 출력(`replyWithDocument` `report.ts:55-57` ↔ chat `replyFile`)이 필요하다. 그래서 응답 모델에 파일 단계를 **반드시** 더한다 — 초안이 예로 든 조건("모델 파일을 바꿔야 하면 순차")이 **늘 참**이 되어, 지금 문안으로는 "1b·2 병행" 이 실제로는 성립하지 않는다.
- **문안:** 1a 가 자기 파일의 정규식 3 개를 상수화하고, PR-2 는 나머지 25 개만 맡는다. 그리고 다음 둘 중 하나로 고친다. (가) PR-1a 의 응답 모델에 파일 단계(`replyFile` 형)를 미리 넣어 두면 "1b·2 병행 가능" 이 그대로 참이 된다. (나) 아니면 "PR-2 는 1b 뒤 순차" 로 적는다.

### [A2]#2 T 표 "advisor·DB 는 주입/스텁" — 판단 분리 전 코드에는 주입할 자리가 없다
- PR-1a 대상 함수는 export 되지 않는다. `handleExpenseInput`·`handleExpenseCallback`·`fireMultiExpenseParse`(`expense.ts:67,194,423`)와 `handleTrade`·`handleTradeCallback`(`trade.ts:73,268`)이 그렇고, `prisma`·`askAdvisor`·`createTrade`·`sendToWhooing`·`checkBudgetUsage` 는 모듈 import 로 직접 부른다(`expense.ts:1-11` · `trade.ts:1-6`).
- 그래도 특성 테스트는 **선다**. fin 의 기존 방식 두 가지를 그대로 쓰면 된다.
  - **모듈 대체** `vi.mock`: `@/lib/prisma`(`bot/notifications/__tests__/scheduler.test.ts:9` 외 다수) · `@/lib/ai/claude-advisor`(`lib/ai/__tests__/news-rules.test.ts:11`) · 서비스 모듈(`vest-confirm.test.ts:9-21`).
  - **가짜 Bot 으로 등록 핸들러를 잡기**: `vest-confirm.test.ts:120-136`(`registerVestConfirmHandler(bot)` 의 `callbackQuery` 를 가로챈다). `register*` 만 export 돼 있어도 된다.
- 주의할 것 세 가지:
  - pending `Map` 이 모듈 전역이고 txId 가 `Date.now()` 를 쓴다(`expense.ts:24,93`). 테스트마다 `vi.resetModules` 또는 가짜 시계가 필요하다.
  - fire-and-forget 경로(T13~T15 · T18)는 promise 를 비워 줘야(flush) 단언할 수 있다.
  - `checkBudgetUsage` 는 `notifyBot`(`@/bot/index`) 으로 이어진다. `../notifications/budget-alert` 를 통째로 대체해야 grammY 봇 모듈이 로드되지 않는다.
- **문안:** "advisor·DB 는 `vi.mock` 모듈 대체(선례 `vest-confirm.test.ts:9-21` · `scheduler.test.ts:9` · `news-rules.test.ts:9-11`) + 가짜 Bot 으로 등록 핸들러 캡처(`vest-confirm.test.ts:120-136`) · 모듈 전역 pending 은 테스트마다 리셋". §11 의 재오픈 조건("주입 없이는 못 선다")도 이 문안에 맞춰 고친다.

### [A2]#3 B 단계 열 — 확정 뒤 원본 수정 실패가 "거래 실패" 로 보이는 서비스 결함이 Discord 로 옮겨 간다
- 텔레그램 `trade:confirm` 은 `createTrade` 와 그 뒤의 ack·버튼 제거·본문 교체를 **한 `try`** 안에 둔다(`trade.ts:318-346`). 그래서 DB 쓰기가 끝난 뒤 편집이 실패하면 `catch` 가 "⚠️ 거래 실패" 로 본문을 바꾼다(`:347-360`) — 실제로는 기록됐다. `aitrade:`(`ai.ts:400-434`)·`tx:`(`expense.ts:321-372` · Whooing 은 따로 `try` `:338-345`)·`multi:`(`:581-626`)도 같은 모양이다.
- 판단 함수가 "지금 순서 그대로 단계를 부른다" 면, Discord 의 `setButtons`/`edit`(PATCH 실패 · 429 대기 10 s 초과 `rest.ts:118`)가 같은 거짓 실패 안내를 만든다. fin 의 기존 Discord 판 `handleDiscordButton` 은 이것을 피했다(`discord-interactions.ts:36-45` "확정이면 이미 DB 반영 — 원본 수정 실패는 throw 하지 않는다").
- **문안:** 위험 표 또는 UQ-3 결함 목록에 한 줄 추가 — "DB 쓰기 뒤 원본 수정 실패 → '실패' 안내(서비스 유래 · 4 콜백)". 처리는 UQ-3 답을 따른다. 특성 테스트는 "현재 동작" 이름으로 고정하고(D3-R2), Discord 어댑터에서는 단계 실패를 삼키는 안을 대안 칸에 둔다.

### [A2]#4 N6a 비교 문구 — 리뷰 표면 수치의 출처를 적는다
- PS1 행 "D-2 PR-2(fit 전체 91 · [D2] N5)" 의 91 은 fit 의 grammY ctx 참조 **전체**다(`02_writer_d2_r3.md:61`). D-2 PR-2 의 diff 크기가 아니다. 크기 비교로는 쓸 수 있지만 "fit 전체 ctx 91" 로 정확히 적는다. 1a 107 = expense 70 + trade 37 · 1b 52 는 측정 [S] B 파일별 표와 맞는다.

---

## 확인

| # | 주장 | 근거 | 판정 |
|---|---|---|---|
| **C1** | **PR-1a → PR-1b → PR-2 의 파일 귀속이 겹치지 않는다**(중점 1) | 명령 파일끼리는 서로 import 하지 않는다. `ai.ts`·`expense.ts`·`trade.ts` 의 상대 import 는 `../utils/*`·`../notifications/budget-alert` 뿐이다(`ai.ts:10-15` · `expense.ts:6-9` · `trade.ts:4-6`). `commands/{ai,expense,trade}` 를 import 하는 곳은 `bot/index.ts:7-10` 하나다(등록만 · 판단 분리가 고칠 필요 없음). 인자 벗기기 12 · `ctx.match` 2 중 PR-2 몫(F1 · `alert.ts:40`)은 세 파일 밖에 있고, `ai.ts:445` 는 1b 몫이다. 1b 가 1a 에 의존하는 것(응답 모델 · 상태 키 · 본인 확인 형)은 순차로 적혀 있다. 단서 = [A2]#1(P 상수 3 · `/report` 파일 단계) | 확인 |
| **C2** | **S 비교 문안**(`clicker !== undefined && String(clicker) === requestedByUserId`)이 지금의 거부를 지킨다 | 지금 `ctx.from?.id !== pending.requestedByUserId`(`expense.ts:217,552` · `trade.ts:296` · `ai.ts:378`)는 `from` 이 없으면 `undefined !== <number>` 로 거부한다 → 문안도 거부. Discord 는 `ctx.userId` 가 빈 문자열이면 chat 허용 검사에서 먼저 막힌다(`chat.ts:277,280`) | 확인 |
| **C3** | **토스트를 권고로 올린 것은 타당하다**(중점 2-①) | 콜백 4 종에서 텍스트 토스트 **뒤에 본문 교체가 오는** 경로를 전부 보면, 본문이 토스트와 같은 정보를 담는다. 확정 "기록 완료" → 결과 본문(`expense.ts:353-355,612-614` · `trade.ts:337-346` · `ai.ts:418-420`) · 실패 토스트 → "⚠️ … 실패: <같은 문구>"(`trade.ts:357-359` · `ai.ts:432-434` · `expense.ts:370-372,624-626`) · 취소 → "❌ … 취소"(`expense.ts:231-233,565-567` · `trade.ts:310-312` · `ai.ts:391-393`). 그래서 "본문 교체가 있으면 notice 생략" 은 **정보 손실 0** 이다. 본문을 바꾸지 않는 결과는 notice 1 이 남는다 — 만료·본인 아님·카테고리 없음·유효 거래 없음(`expense.ts:210-212,218-219,305,576-577` · `trade.ts:290-305` · `ai.ts:373-386`). 대안 ①(매번 notice)은 확정마다 ephemeral 이 쌓인다(`chat.ts:266-269`). 판단에 플랫폼이 새지 않는다(규칙은 Discord 어댑터 안). 남는 점은 결정 도중 예외가 나면 모은 토스트를 버리고 chat 일반 실패 안내(`chat.ts:310-313`)만 나간다는 것인데, 텔레그램도 그 경우 등록 쪽 `catch` 안내(`ai.ts:473-477` 형 · trade·expense 등록부도 같은 형)로 끝나므로 같은 등급이다 | 확인 |
| **C4** | **`removeButtons` 뒤 `edit` 의 PATCH 2회는 무해하다**(중점 2-②) | 순서: 판단 함수가 단계를 `await` 로 차례로 부르고, chat 은 같은 클릭의 핸들러를 하나의 대기열 작업 안에서 돌린다(`chat.ts:299-314`) → `setOriginalButtons`(PATCH `components:[]` · `rest.ts:255-257`) 다음 `editOriginal`(PATCH 본문 + `components:[]` · `chat.ts:252-255` · `rest.ts:246-253`)로 뒤바뀌지 않는다. 14 분 넘은 경로도 둘 다 봇 토큰 PATCH 순서다(`chat.ts:258,263`). 레이트 리밋: 클릭당 PATCH 2 + 본인 안내 0~1 이다. 429 는 `requestDiscord` 가 `retry_after` 를 최대 10 s 기다린다(`rest.ts:118,142-143`). 대기열이 같은 채널 입력을 하나씩만 돌리므로 한 채널에서 몰려도 동시 PATCH 가 생기지 않는다. 두 번째 PATCH 의 `components:[]` 는 첫 번째와 같은 값이라 결과 상태가 같다. 합치기를 "어댑터 최적화로 남긴다" 는 판단도 맞다. 단서 = [A2]#3(어느 PATCH 든 실패하면 지금 `try` 구조가 거짓 실패 안내를 낸다) | 확인 |
| **C5** | **텔레그램 "호출열 동등" 기준이 단계 열로 표현된다** | 단계 하나 = 지금 grammY 호출 하나로 대응한다 — `answerCallbackQuery` 42 · `editMessageReplyMarkup` 21 · `editMessageText` 15(키보드 함께 교체 2 = `expense.ts:272,293`). `tx:cancel` 은 ack + 버튼 제거 + 본문 교체 세 호출(`expense.ts:231-233`)이고, 단계 열로 순서까지 보존된다. 1회차 모순(B 합치기 ↔ T 호출열)이 풀렸다 | 확인 |
| **C6** | **UQ-2 우선순위 "PR-3 전"** | PR-1a 의 텔레그램 쓰기 값은 그대로 `String(requestedByUserId)`(`expense.ts:332,588`)다. Discord 값을 처음 쓰는 것은 PR-3 이다. 단, PR-1a 가 pending 형태를 정할 때 `createTransaction` 이 받는 **값 쪽에 플랫폼을 남겨야** PR-3 이 `discord:` 접두를 붙일 수 있다(지금 플랫폼은 pending **키** 에만 들어간다 — `createTransaction(ctx, pending)` `expense.ts:315-334` 는 키를 모른다). PR-1a 문안에 "pending 값에 플랫폼(또는 DB 표기 ID)" 1 구를 더하면 충분하다(경미 미만 · 참고) | 확인 |
| **C7** | **2회차가 새로 만든 숫자** | N6a 159 · 107 · 52 · 나머지 110 = [S] B 파일별 표(expense 70 · ai 52 · trade 37 · 원 276 − chat 6 − 주석 1 = 269 → 269 − 159 = 110). N17 의 두 호출 `expense.ts:231-233` · X-1 의 53(7 + 20 + 1 + 25) · W15~W19 줄 번호 · T13 줄 번호(`ai.ts:41-46,58,64,26-31,465`) · T14 `:65-73` · PR-1b `/ai` `:445` · `/reset` `:462-466` 전부 코드와 맞다. 예외는 [A2]#4(91 의 의미) | 확인 |

---

## 최종본(3회차 · 정본 발행용)에 반영할 것

1. [A2]#1 — 정규식 상수 3 은 1a 에 · "1b·2 병행" 조건을 (가) 1a 모델에 파일 단계 또는 (나) 순차로 고친다
2. [A2]#2 — T 표 "주입" → `vi.mock` + 가짜 Bot 캡처 · 리셋 주의 · §11 문안
3. [A2]#3 — DB 쓰기 뒤 원본 수정 실패의 거짓 "실패" 안내를 UQ-3 결함 목록 또는 위험에 추가
4. [A2]#4 — PS1 "fit 전체 ctx 91"
5. (참고) C6 — PR-1a pending 값에 플랫폼

정정이 0 이므로 위 문안을 고친 뒤 재감사 없이 사용자 질문(UQ-1~UQ-5)으로 넘겨도 된다. 단 문안을 고치면서 권고(PS2 · B 단계 열 · 토스트 규칙 · S · D2)를 바꾸면 그 항목만 다시 감사한다.
