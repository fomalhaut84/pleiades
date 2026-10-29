# 009 D-3 설계 초안 1회차 — 반증 감사

감사 2026-10-29 · 대상 `_workspace/009/d3/02_writer_d3.md`(초안 1회차) · 근거 = 저장소 코드 직접 읽기(dev `3a4d28d` · 실행·빌드·테스트·네트워크·DB·git 쓰기 0 · `repos/*`·원본 미접근 · `apps/*` 하네스 지시 미실행)
**요약: 정정 4 · 경미 9 · 확인 10 · 블로커 0** — 정정 4건은 전부 문안·PR 순서·테스트 범위 수정으로 풀린다(구조 재설계 불필요 · 권고 P2·A2·B·Q·S·D2·C·H2·K·F 의 방향은 유지). 규칙상 정정이 있으므로 문서는 **초안으로 돌아간다(2회차 필요)**.
**가장 무거운 것:** [A]#1(PR-1 ∥ PR-2 "독립" 은 성립하지 않는다) · [A]#2(T1~T10 이 PR-1 자신의 변경 — 상태 키·`chatBusy`·세션·본인 확인 비교 — 을 덮지 않고, T 표와 B 표가 텔레그램 호출열을 서로 다르게 적었다).
**질문별 결론(호출자 1~7):** ① chat 변경 0 — **확인**(C1) ② PR 범위·등급 — **정정**([A]#1·#2) ③ `/브리핑` notifier 주입 — 선택은 유지, **근거 정정**([A]#3) ④ UQ-2 — **확인**(C2) ⑤ 대기열 직렬 기본 — **확인**(C3) · 단 UQ-4 전제 **정정**([A]#4) ⑥ 시간 가드·ADMIN·스크립트 — **확인**(C4~C6) · 경미 1 ⑦ 숫자 — **확인**(C8) · 경미 1.

---

## 정정

### [A]#1 §5 PR-2 "PR-1 과 독립(병행 가능 · 응답 모델 파일 충돌만 조정)" — 성립하지 않는다
- **주장(§5 PR-2 행 · 순서 의존 칸):** PR-2 는 PR-1 과 독립 · 병행 가능.
- **근거:**
  1. PR-2 의 판단 함수(명령 32 · `/브리핑` · `/report` · `/start`)는 **PR-1 이 만드는 응답 모델**(H2 · `edit` 포함)을 돌려준다 — 모델 없이는 PR-2 의 `decide*` 시그니처가 서지 않는다. "충돌 조정" 이 아니라 **의존**이다.
  2. 같은 파일을 둘이 고친다: `apps/finance/src/bot/commands/ai.ts` — PR-1 은 fallback(`:489-506`)·`aitrade:`(`:470`)·`chatSessions`/`chatBusy`(`:21-23,41-46,89`)를, PR-2 는 `/ai` 인자(`ctx.match` `:445`)·`/reset`(`:462-466` · `chatSessions.delete(chatId)` — PR-1 이 바꾸는 키를 그대로 쓴다)를 고친다. `expense.ts` 도 PR-1(콜백·자유 텍스트)과 PR-2(`수입 …` hears `:633` — §5 어느 PR 에도 명시 없음) 가 갈린다.
  3. 규모(사실): PR-1 대상 3 파일의 grammY ctx 참조 = expense 70 + ai 52 + trade 37 = **159 / 269**([S] B 파일별 표). 병행으로 갈라 줄이려던 리뷰 부담은 PR-1 에 이미 몰려 있다.
- **판정: 정정.**
- **고칠 문안:** PR-2 순서 의존 = "**PR-1 머지 뒤**(응답 모델 · 상태 키 함수 · `ai.ts` 공유)". `수입 …`(`expense.ts:633`)·`/reset` 의 PR 귀속을 표에 적는다. §11 의 "PR-1 을 더 쪼갠다" 조건에 "ctx 참조 159(대상 3 파일)" 를 근거로 붙인다. 되돌리기 칸은 그대로(**즉시**(릴리즈 전) · 배포 뒤 R-8 **중간**).

### [A]#2 "텔레그램 동작 무변경" — T1~T10 이 PR-1 의 변경을 덮지 않고, T 표와 B 표가 모순된다
- **주장(§5 PR-1 · §4 T "텔레그램 무변경: 어댑터가 같은 grammY 호출열" · §4 B "텔레그램 = `editMessageText(…, {reply_markup})`" · §4 S "텔레그램 `String(ctx.from?.id ?? 0)` · 비교도 문자열").**
- **근거:**
  1. **T1~T10 밖에 있는 PR-1 변경:** ① `chatBusy`·`chatSessions` 키 변경(Q·S) — 바쁨 안내(`ai.ts:41-46`)·세션 재사용(`:58,64`)·24 h 청소(`:26-31`)·`/reset` 삭제(`:465`)를 거는 특성 테스트가 T 목록에 없다(T10 은 fallback 분기만) ② AI 대화 응답 경로 — `splitMessage` → 조각별 `markdownToTelegramHtml` → HTML 실패 시 원문(`ai.ts:65-73`)이 응답 모델로 옮겨지는데 T 없음 ③ `fireMultiExpenseParse`(AI 복수 파싱 → `multi:` 키보드 생성) — T2 는 분기 선택만, T5 는 콜백만 ④ `수입 …` hears(`expense.ts:633`).
  2. **호출열 모순:** 지금 텔레그램 `tx:cancel` 은 `editMessageReplyMarkup({reply_markup: undefined})` → `editMessageText('❌ …')` **두 호출**이다(`expense.ts:231-233` · 만료 경로 `:211-212,224-225` 는 ack + 버튼 제거 · 전체 `editMessageReplyMarkup` 21 · `editMessageText` 15). B 의 "텔레그램 = `editMessageText(…, {reply_markup})`" 로 합치면 두 번째 호출이 실패할 때 키보드가 남는/사라지는 결과가 달라진다. T 표는 "같은 grammY 호출열" 을 보장한다고 적어 B 와 정면으로 어긋난다 — 어느 쪽이 정본인지 정해야 특성 테스트를 쓸 수 있다.
  3. **본인 확인 비교의 기본값:** 지금 비교는 `ctx.from?.id !== pending.requestedByUserId`(`expense.ts:217,552` · `trade.ts:296` · `ai.ts:378`) — `from` 이 없으면 `undefined !== 0` → **거부**. S 문안대로 비교 쪽에도 `String(ctx.from?.id ?? 0)` 를 쓰면 `"0" === "0"` → **허용**으로 바뀐다(생성 쪽 기본값 `?? 0` 5 곳 · N8). 텔레그램 콜백에 `from` 이 빠지는 일은 드물지만 "무변경" 주장은 이 경계에서 깨진다.
- **판정: 정정.**
- **고칠 문안:** T 에 **T13 `chatBusy`/세션/`/reset`(같은 chat 2연속 → 바쁨 안내 · 세션 id 재사용 · reset 뒤 새 세션) · T14 AI 대화 응답 분할·HTML 폴백 · T15 `fireMultiExpenseParse` 결과 → 키보드 · T16 `수입 …`** 를 더하고 PR-1/PR-2 귀속을 적는다. B 응답 모델의 텔레그램 매핑을 "**지금 호출열 그대로**(버튼 제거 + 본문 교체 = 두 호출 · 순서 보존)" 로 고치거나, T 의 보장을 "결과 상태 동등" 으로 낮추고 그 차이를 위험(D3-R1)에 적는다 — 둘 중 하나. S 비교 문안 = "생성 쪽만 `?? 0` · 비교 쪽은 `from` 없으면 거부(지금과 같다)" + 경계 테스트 1건.

### [A]#3 D2 근거 — "재시도·분할·라벨 정책이 notifier 하나로 같다" 는 transport 마다 다르다 (선택은 유지 가능)
- **주장(§4 D · D2 얻는 것 / D3 잃는 것):** D2 는 "재시도·분할·라벨 정책이 notifier 하나로 같다" · D3(`ctx.reply`)는 "크론·텔레그램 경로와 전달 정책(재시도 · `label`)이 갈린다" · "Discord bot transport 의 html 변환·분할이 텔레그램 notifier 와 같은 정책인지 PR 에서 확인".
- **근거(호출자 질문 ③에 대한 답):**
  1. **텔레그램 notifier** = 코어 소유 모드 — `maxLength: 4096`(`packages/notify/src/telegram.ts:33`) → 코어가 분할·청크별 재시도 `[2000,8000,30000]`·HTML 파싱 실패 → plain 폴백(`deliver.ts:38-49,65-83`) · `parse_mode:'HTML'`(`telegram.ts:36`).
  2. **Discord 봇 transport** = 어댑터 소유 모드 — `maxLength: Infinity`(`discord-bot.ts:114`) → 코어는 `send` 한 번만 부르고 재시도·폴백을 하지 않는다(`deliver.ts:33-36`) · 변환 `htmlToDiscordMarkdown` · 2000 분할 · 재시도·429 는 `requestDiscord`(`discord-bot.ts:124-143`). **plain 폴백은 없다**(Discord 는 HTML 파싱 오류가 없어 필요도 없다).
  3. **chat `ctx.reply({format:'html'})` 은 2 와 같은 파이프다** — `htmlToDiscordMarkdown` → `splitDiscordMarkdown(…, 2000)`(`packages/chat/src/rest.ts:98-100`) · 같은 `requestDiscord`(`:142-143`). 그러므로 D3 의 "재시도가 갈린다" 는 틀렸다.
  4. 실제 차이는 **실패 표면**이다: notifier 는 실패를 `BroadcastResult`(`sent=0`)로 삼키고 던지지 않는다(`notifier.ts:68,85-87`) · `ctx.reply` 는 던진다. `sendBriefing` 의 성공 발송(`briefing.ts:79`)이 실패하면 D2 는 조용히 끝나고(로그는 notify 경고뿐), D3 는 `catch`(`:83-96`)로 가서 실패 안내를 다시 보내려 한다.
  5. 같은 파일 주석 `notifier.ts:13`("`/브리핑` 응답(`notifierForChat`)은 항상 텔레그램")은 정본 §8 표(`009:337` — fin `notifier.ts:13-14` · "D-3 / D-4")가 D-3 고칠 대상으로 잡아 두었다 — 초안에 없다.
- **판정: 정정(근거 문안).** D2 선택(요청 채널 고정 · 스위치를 안 탄다 · 크론 경로 무변경)은 그대로 성립한다.
- **고칠 문안:** D2 얻는 것 = "요청 채널 의미 보존 · 스위치 무관 · 크론과 같은 `sendBriefing` 한 함수"(정책 동일 주장 삭제). D3 잃는 것 = "실패가 throw 로 바뀐다(`sendBriefing` catch 경로가 달라진다)" 로 교체 · "PR 에서 확인" 문장을 위 1~3 의 확인 결과로 대체 · D2 에서 `sent=0` 이면 경고 줄 1(IDENTIFY 알림 `discord-interactions.ts:80` 형태) · `notifier.ts:13` 주석 갱신을 PR-2 범위에 넣는다.

### [A]#4 UQ-4 전제 — "advisor 동시 실행 최대 2" 는 틀렸다
- **주장(§9 UQ-4 무엇을 가르는가):** "advisor 동시 실행 최대 2(병행 기간만 · D-3′ 뒤 1)".
- **근거:** `chatBusy` 는 AI **대화** 경로(`fireAiQuestion` `ai.ts:37-89`)만 막는다. AI 거래 파싱 · AI 복수 소비 · 종목 심층 분석(900 s) · 세션 브리핑(900 s) · 리포트 ai-review 는 지금도 제한 없이 동시에 돈다([S] D1 마지막 "2~7 은 제한 없음" · N10). 텔레그램만으로도 advisor 동시 실행은 이미 1 을 넘을 수 있다.
- **판정: 정정.** 사용자 결정 질문의 전제가 틀리면 답이 틀린 근거 위에 선다.
- **고칠 문안:** "AI **대화** 동시 실행이 플랫폼마다 1(병행 기간 최대 2) · 다른 AI 경로(N10 의 나머지 6)는 지금도 제한 없음 — 이 질문은 그 경계를 바꾸지 않는다". 권고(허용)는 유지 가능.

---

## 경미

### [A]#5 Q typing — fit `withTyping` 형태는 fin 의 fire-and-forget 에 그대로 맞지 않는다
- `withTyping`(`apps/fitness/src/bot/discord/reply.ts:66-` · `router.ts:30`)은 **await 하는 작업**을 감싼다. fin 핸들러는 진행 안내 뒤 돌아가므로(N10) 핸들러를 감싸면 typing 이 곧바로 끝난다. 텔레그램처럼 **배경 promise 안에서** 주기 호출해야 한다(`ai.ts:51-54` `setInterval` · `.finally` 해제 `:89`). **문안:** "typing 은 응답 모델의 `typing` 을 fire-and-forget 작업 안에서 9 s 주기로(끝나면 해제) — 핸들러를 `withTyping` 으로 감싸지 않는다".

### [A]#6 H 배선 — 첨부만 있는 메시지는 chat 이 무시하지 않는다
- `chat.ts:216` 은 "텍스트 빔 **그리고** 첨부 0" 만 버린다. 첨부 경로가 없으면 라우터는 명령·hears 를 지나 **fallback 을 빈 텍스트로 부른다**(`router.ts:75-99`). fin fallback 순서(expense: 숫자 없음 → 다음 · ai: 3자 미만 무시)상 결과는 무응답이지만 "chat 이 무시" 가 아니라 "**fin fallback 이 빈 텍스트를 무응답으로**" 다. **문안** 교체 + 라우팅 표 테스트 1건(첨부만 → 무응답 · DB 0).

### [A]#7 §8 L-8 `!브리핑` — P2 와 모순
- P2 에서 한글 이름에 `!` 를 붙이면 명령이 아니다(초안 스스로 `!현황` → 무응답). L-8 의 `!브리핑` 은 설계대로면 무응답이라 시험이 실패한다. **문안:** "`브리핑` · `브리핑 한국` · `!briefing` · `브리핑 <종목>`".

### [A]#8 W5 · [S] J — 복수 소비 확정의 `transactedAt` 은 확정 시각이 아니다
- 단건 확정은 `transactedAt: new Date()`(`expense.ts:333`), **복수 확정은 파싱 날짜** `new Date(\`${m.parsed.date}T00:00:00.000Z\`)`(`:589`). W5 의 "쓰기는 확정 시각과 함께" 를 단건으로 한정한다(특성 테스트 T5 에 날짜 단언 포함).

### [A]#9 X-1 — 정적으로 닫을 수 있다
- `Category.id @default(cuid())`(`schema.prisma:229`) · seed 는 id 를 주지 않는다(`prisma/seed.ts` `createMany` · slug 만) · txId = `Date.now()`(13) + `_` + 6 = 20(`expense.ts:93`). 최장 `tx:cat:` 7 + 20 + `:` 1 + cuid v1 25 = **53 < 100**. 로컬 행 1 개로 cuid 길이만 확인하면 된다(웹·MCP 생성도 `@default` · `api/categories/route.ts:67` · `mcp/tools/category.ts:32`). X-1 을 "착수 직전 측정" 에서 "확인 1 줄" 로 낮춘다.

### [A]#10 PR-3 `discord-inbound.sh` 앱 인자화 — fit 고정 문구가 하나 더 있다
- 통과 문구 `:242`("대화 채널에서 **!today · 자유 텍스트 · 사진** 1회씩 확인")·사용법 `:4-7`·되돌리기 `:241` 은 fit 전용이다. 초안은 "사용법·되돌리기 안내 문구" 만 적었다 — **`:242` 통과 안내도 앱별 표에**(fin = "`!help` · 한글 명령 · 소비 1건" 등). fit 출력 문자열은 `test_discord_inbound.py` 가 고정하므로 표의 fit 값은 지금 문구 그대로.

### [A]#11 B ack 텍스트 — `notice` 는 토스트가 아니라 메시지다
- 텔레그램 `answerCallbackQuery({text})` 는 잠깐 뜨는 토스트(42 곳 · N17)인데 chat `notice` 는 본인 전용 **후속 메시지**(`chat.ts:266-269` · `followupEphemeral`)다. 본문 교체와 함께 오는 확인 토스트("취소되었습니다." `expense.ts:231` 등)를 그대로 옮기면 클릭마다 ephemeral 메시지가 하나씩 쌓인다. **문안:** "본문을 바꾸는 결과에서는 ack 텍스트를 생략할 수 있다(판단 출력에 `toast` 와 `edit` 을 함께 두고 Discord 어댑터가 고른다)" 를 B 대안 칸에.

### [A]#12 §2 R-8 하한 근거 문구 — 인계에서 그대로 옮겨 와 부정확
- "`v1.2.0`(그 아래는 chat 대기열·접두 없음)" — chat 대기열·접두는 `v1.3.0` 에 들어왔다(`1d79f28` · #363 · `v1.2.0..v1.3.0`). `v1.2.0` 에도 없다. 하한 값(v1.2.0 · 텔레그램 토큰·폴링 기준)은 그대로 두고 괄호를 "그 아래는 텔레그램 없이 뜨지 못한다(D-1)" 로 · fin 에 실제로 중요한 사실은 §5 끝 문장("`v1.3.0` 이하 fin 은 키를 모른다")이다.

### [A]#13 N17 표기 — "본문 교체 15 · 키보드 교체 2" 는 합이 아니다
- `ctx.editMessageText` 는 **15**(재계수 — 비테스트 봇 파일) 이고 키보드 교체 2(`tx:change`·`tx:allcat` `expense.ts:271-278,292-299`)는 그 15 **안**에 있다. N17 = "본문 교체 15(그중 키보드 함께 교체 2)".

---

## 확인

| # | 주장 | 근거 | 판정 |
|---|---|---|---|
| **C1** | **chat 변경 0**(질문 ①) — 한글 hears 28 · `!` 접두 · 버튼 교체 · 본문 교체 · 파일 · typing 이 현재 API 로 된다 · 행 한도는 앱(Discord 어댑터)에서 다시 채운다 | `hears` = `ctx.text.match(re)` 등록 순 첫 일치(`packages/chat/src/router.ts:89-95`) · 명령 단계가 앞이고 접두 필수 기본(`:79-88` · `prefixed \|\| prefixOptional` `:83`) — 한글 정규식은 `!` 로 시작하지 않아 겨루지 않는다 · `!현황` → 이름 `현황` 명령 없음 → `^현황$` 불일치 → fallback(초안 서술과 같다) · `ButtonContext.edit` 은 `buttons` 를 주면 교체 · 안 주면 `[]` 로 제거(`chat.ts:252-259` · `types.ts:26,87`) · `setButtons`(`:260-264`) · `replyFile`·10 MiB throw(`rest.ts:227-230`) · `typing`(`chat.ts:214`) · `splitCommand` 공개(`index.ts`). **행 한도:** `toComponents` 가 비지 않은 행 > 5 에서 throw(`buttons.ts:19`) · 행당 > 5 throw(`:21`) — `send` 는 첫 조각을 보내기 **전에** 계산하므로(`rest.ts:161`) 메시지 0 건 + chat 일반 실패 안내(`chat.ts:220-223`) · 편집도 PATCH 전(`rest.ts:188`). 앱이 다시 묶으면 chat 은 손댈 것이 없다 · 용량 4 행×5 = 20 · 9 → 5+4+취소 3 행 · 21 → 6 행 → 안내(산수 맞다). `custom_id` 메시지 안 중복 없음(`tx:cat:<txId>:<catId>` 카테고리마다 다름 · `expense.ts:51`) | 확인 |
| **C2** | **UQ-2 스키마 변경 0 · 읽는 곳 0**(질문 ④) | 컬럼 `userId String?` · `@@index([userId])`(`apps/finance/prisma/schema.prisma:253,262`) · 마이그레이션 `"userId" TEXT`(길이 제한 없음 · `migrations/20260312080147_…/migration.sql:21,53`) — `discord:` 8 + snowflake ≤20 무해 · `git grep --text -n userId HEAD -- apps/finance` 결과 = 스키마·마이그레이션·`docs/specs`·봇 쓰기 2(`expense.ts:332,588`)·테스트 1 뿐 · 암묵 노출도 없다 — 웹 목록은 필드를 골라 직렬화(`app/api/transactions/route.ts:93-` · `app/expenses/page.tsx:87`) · MCP `get` 은 줄 문자열만(`mcp/tools/spending.ts:128-160`) · 수정 API·MCP 수정은 `userId` 를 안 건드린다(`api/transactions/[id]/route.ts:71-84` · `spending.ts:290`) · 웹·MCP·크론 생성은 `userId` 를 안 쓴다(`api/transactions/route.ts:262` · `spending.ts:226` · `lib/cron.ts:271`) → 그 행은 `null` | 확인 |
| **C3** | **채널 대기열 직렬 기본값이 fin 에 무해**(질문 ⑤) | `enqueue` 는 핸들러 promise 만 기다리고 실패와 무관(`chat.ts:175-190`) · fire-and-forget 핸들러는 진행 안내 뒤 끝나 자리가 곧 풀린다(`ai.ts:37-89` · `report.ts:48-63`) · 뒤늦은 답은 봇 토큰 `rest.send`(`chat.ts:212`) · ⏳ 안내는 `tails.has` 일 때만(`:289`) — 걸리는 것은 await AI 1(커스텀전략 60 s < 감시 10 분 `:80`) · 대화 채널 = 알림 채널이라 `vest:` 버튼(`decideVest` · 시세·트랜잭션 수 초)과 같은 대기열을 공유하지만 텔레그램 grammY 순차 처리와 같은 의미 · 버튼 ack 는 대기열 밖 즉시(`:290`) · 웹훅·봇 메시지(알림)는 대기열에 들어오지 않는다(`:193`) | 확인 |
| **C4** | **인바운드 시간대 가드 0** · 15:35 는 발송 가드 | `scheduleInteractive`(`notifications/scheduler.ts:51`)는 수신자 유무 가드 · 15:35 작업(`:138-147`)은 발송만 · 버튼은 `decideVest` 가 언제든 다시 읽는다 · 명령의 KST 계산은 처리 시각 기본값(`report.ts:37` · `budget.ts:9` · `expense.ts:403`) — Discord 경로도 같은 함수 | 확인 |
| **C5** | **4014 강등 알림 `Route.ADMIN`**(F) | fin 은 ADMIN 을 매핑한다(`notifier.ts:51-54,68,101` · 텔레그램 ADMIN chat 또는 `DISCORD_WEBHOOK_ADMIN`) · 같은 성격의 IDENTIFY 차단 알림이 이미 ADMIN(`discord-interactions.ts:78`) + `sent=0` 경고(`:80`) · 로컬 ADMIN 수신자 = 검증 채팅(isolation I-5) — D-2 [A]#2 유형(미매핑 라우트)은 fin 에 없다 | 확인 |
| **C6** | **`discord-inbound.sh` 앱 인자화가 fit 을 바꾸지 않는다**(질문 ⑥) | 판정 문자열·로그·pm2 대조·재시작이 전부 `KEY`·`BOT`·`LABEL` 세 상수에서 나온다(`deploy/discord-inbound.sh:15-24`) · `.cjs` 는 `KEYS` 집합 안의 키만 쓰고 넘겨받은 KEY 한 줄만 고친다(`discord-inbound.cjs:4,13`) → fin 키 추가는 fit 키 줄을 건드리지 않는다 · fin 봇 이름 `pleiades-fin-bot`(`deploy/pleiades.config.cjs:76`) · 배포 락 공유(`:225`)는 그대로. fit 값이 같은 한 fit 동작 무변경 — 단 [A]#10 | 확인 |
| **C7** | **키 이름 · 스위치 판정 문자열** | `DISCORD_CHANNEL_ID_FINANCE_CHAT` — `PLATFORM_KEY_RE`·`check_env.py`·셸 정리 규칙은 D-2 C4 와 같은 판정([S] H · `platform-env.ts:27` · `check_env.py:37,43-46`) · 새 기동 로그 2 줄은 `discord-switch.sh` 의 미설정 2 문구(`discord-interactions.ts:58,62`)·`gateway 종료 코드` 를 포함하지 않으면 된다(fit 상수 `apps/fitness/…/discord-interactions.ts:47-48` 형태) | 확인 |
| **C8** | **숫자 규율**(질문 ⑦) | N1~N29 는 측정 대장 M1~M31 과 값이 같다(N13 · N23 · N24 줄 번호 포함). 재계수: 본인 확인 기본값 `?? 0` **5**(`ai.ts:346` · `trade.ts:232` · `expense.ts:100,153,523`) · `ctx.editMessageText` **15** · seed 소비 **9** · 수입 **3**(`prisma/seed.ts` 카테고리 시드) → 행 ⌈n/2⌉+1 = 6 · 3 · 히스토리 ≤5 → ≤4(`allcat` 은 취소 행 `expense.ts:169-173`). 예외는 [A]#13(N17 표기)뿐 | 확인 |
| **C9** | **P2 등록 순서 · 한글 정규식 사이 겹침 없음** | chat 은 명령을 hears 보다 먼저 본다(`router.ts:79-95`) — 등록 순서는 hears 28 끼리만 의미 · 겹칠 만한 쌍이 서로 배타: `^전략(?:\s+.*)?$` 는 `전략목록` 불일치(뒤가 공백·끝이어야) · `^관심(?!삭제\|목록)` · `^수입\s*$` ↔ `^수입\s+.+$` · `^예산\s*$` ↔ `^예산설정` · 정규식에 `g` 플래그 없음 → 같은 객체 공유(P2)에 `lastIndex` 상태 문제 없음 | 확인 |
| **C10** | **A2 인자 · `알림설정` 정적 판독** | hears 경로의 `ctx.match` 는 일치 배열 → `toString()` = 원문 전체 → `\|\|` 오른쪽이 안 돈다(`alert.ts:33,40`) → `parts[0]='알림설정'` → "알 수 없는 항목"(`:82-86`) · 단독 `알림설정` 은 조회(`:43`) 대신 사용법(`:69-75`). A2 의 Discord 경로(`splitCommand(ctx.text).args`)는 이 결함을 **자동으로 고친다** — 두 플랫폼 동작이 갈리는 것은 UQ-3 이 이미 묻는 범위(초안 서술과 일치). 단 UQ-3 의 "X-4 로 결함 실측된 뒤에만" 은 Discord 판에도 걸리는지 문안을 분명히 한다(Discord 는 A2 를 따르는 순간 고쳐진다) | 확인 |

---

## 2회차에 반영할 것 (작성자용 체크리스트)

1. [A]#1 PR-2 = PR-1 뒤 · `수입 …`·`/reset` 귀속 · ctx 159 근거
2. [A]#2 T13~T16 · 텔레그램 호출열 정본 선택(B ↔ T) · 본인 확인 비교 기본값 문안 + 경계 테스트
3. [A]#3 D2/D3 근거 교체 · `sent=0` 경고 · `notifier.ts:13` 주석(정본 `009:337`)
4. [A]#4 UQ-4 전제 문안
5. 경미 [A]#5~#13 문안
6. §12 정정 블록에 위 정정 4건을 1회차 문안과 함께 기록

재감사 범위(2회차): §5 PR 표 · §4 T 표 · §4 B 응답 모델의 텔레그램 매핑 · §4 S 비교 문안 · §4 D · UQ-4 — "확인" C1~C10 은 대상 코드(`packages/chat` · `apps/finance/src/bot` · `deploy/discord-inbound.*`)가 바뀌지 않으면 다시 보지 않는다.
