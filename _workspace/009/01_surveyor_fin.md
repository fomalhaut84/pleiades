# 009 실측 — `apps/finance` 텔레그램 접점 전수 (#326)

- 측정일: 2026-10-27 · 대상: pleiades `dev` HEAD `8192b0c1aa6d` 의 `apps/finance/src` (작업트리 clean · 테스트 `__tests__/` 제외)
- 왜 이 대상인가: 006 이후 측정 대상은 `apps/*`(서비스 `dev` 사본 · 전환 뒤 pleiades 가 서비스하는 코드). `repos/*`·원본·서버·서비스 DB 는 보지 않았다(isolation I-3·I-7·I-11).
- `apps/finance/CLAUDE.md`·`.claude/` 는 열지 않았다(I-10). `.env` 는 읽지 않았고 `.env.example` 만 읽었다.
- grep 은 전부 `/usr/bin/grep --binary-files=text`(ugrep 래퍼 회피). 아래 명령의 cwd 는 `apps/finance/src`(따로 적은 곳 제외).
- 옛 값과의 관계: measured-facts "전송 호출 분포"(2026-09-03 · 원본 측정) 는 fin 전체 전송 호출 **149** 였다. 지금 측정한 것은 종류가 다르다(아래 §5 · `ctx.*` 멤버 전수 270). 옛 149 는 `api.sendMessage|ctx.reply|.reply(` 패턴이라 이번 표와 바로 비교하지 않는다.

---

## 1. 인바운드 명령 (grammY 등록 전수)

```bash
/usr/bin/grep -rn --binary-files=text -E "\b(bot|instance)\.(command|hears|on|callbackQuery|use|catch)\(" --include='*.ts' . | /usr/bin/grep -v __tests__
for k in command hears on callbackQuery use catch; do /usr/bin/grep -rnE --binary-files=text "\b(bot|instance)\.$k\(" --include='*.ts' bot | /usr/bin/grep -v __tests__ | wc -l; done
/usr/bin/grep -rnE --binary-files=text "\.(command|hears|callbackQuery|on)\(['\"/]" --include='*.ts' . | /usr/bin/grep -v __tests__ | /usr/bin/grep -vE "\b(bot|instance)\."   # 다른 변수명 등록 — 0 (process/child/httpServer 만)
```

등록 수: `bot.command` **21** · `bot.hears` **28** · `bot.on` **5** · `bot.callbackQuery` **1** · `instance.use` **1**(auth) · `bot.catch` **1**(standalone). 등록 순서는 `bot/index.ts:47-72`(auth → 명령 17 모듈 → fallback 2: expense → ai).

**논리 명령 32** = 슬래시만 4(start·help·ai·reset) + 한글 텍스트만 11 + 둘 다(같은 핸들러) 17. 검산: command 4+17=21 · hears 11+17=28.

| # | 명령 (슬래시 / 한글) | 위치 | 하는 일 | 인자 | 응답 | AI | 상태 |
|---|---|---|---|---|---|---|---|
| 1 | `/start` | `commands/start.ts:57` | 인사 + 도움말 | 없음 (`ctx.from.first_name` 사용) | replyHtml | 없음 | 없음 |
| 2 | `/help` | `start.ts:67` | 도움말 | 없음 | replyHtml | 없음 | 없음 |
| 3 | — / `현황` | `portfolio.ts:150` | 전체 포트폴리오 요약 | 없음 | replyHtml | 없음 | 없음 |
| 4 | — / `계좌 [이름]` | `portfolio.ts:159` | 계좌 상세 | 계좌명 | replyHtml | 없음 | 없음 |
| 5 | — / `주가 [종목]` | `price.ts:222` | 현재가(캐시 → KRX → yahoo 검색 · 후보 여러 개면 목록) | 종목명/티커 | replyHtml·reply | 없음 (외부 yahoo) | 없음 |
| 6 | — / `환율` | `price.ts:231` | USD/KRW | 없음 | replyHtml | 없음 | 없음 |
| 7 | — / `매수 …` | `trade.ts:365` | 매수 미리보기 → 확인 키보드 | `[계좌] [종목] [수량] [가격]` | reply + **키보드** `trade:` (HTML) | 없음 | **메모리 pending 5분**(`trade.ts:24,27`) |
| 8 | — / `매도 …` | `trade.ts:374` | 매도 미리보기 → 확인 키보드 | 같음 | 같음 | 없음 | 같음 |
| 9 | — / `수입 <설명> <금액>` | `expense.ts:633` | 수입 기록(카테고리 키보드) | 자연어 | reply + **키보드** `tx:` | 복수 건이면 있음(`expense_parse`) | 메모리 pending 5분 |
| 10 | — / `소비` | `budget.ts:205` | 이번 달 소비 요약 | 없음 | replyHtml | 없음 | 없음 |
| 11 | — / `수입` | `budget.ts:214` | 이번 달 수입 요약 | 없음 | replyHtml | 없음 | 없음 |
| 12 | — / `예산` | `budget.ts:223` | 예산 현황 | 없음 | replyHtml | 없음 | 없음 |
| 13 | — / `예산설정 [금액]` | `budget.ts:232` | 월 예산 설정 — **DB 쓰기**(`budget.update/create` `:188,193`) | 금액 | reply/replyHtml | 없음 | 없음 |
| 14 | `/ai [질문]` | `ai.ts:444` | AI 질문 | 자유 텍스트(`ctx.match`) | reply(HTML 시도→plain) + typing | **있음** `bot:ai_chat` | **세션 맵(chatId) · 진행 중 플래그** |
| 15 | `/reset` | `ai.ts:462` | AI 세션 초기화 | 없음 | reply | 없음 | 세션 맵 삭제 |
| 16 | `/alertconfig` / `알림설정 [항목] [값]` | `alert.ts:32-33` | 알림 설정 조회·변경 — DB 쓰기(`alertConfig.update` `:104`) | 항목·값 | replyHtml·reply | 없음 | 없음 |
| 17 | `/strategy` / `전략 [종목] [전략]` | `strategy.ts:285-286` | 종목 전략 조회·변경 — DB upsert 6곳(`:142~234`) | 종목·전략·메모 | reply 15 · replyHtml 1 | 없음 | 없음 |
| 18 | `/strategylist` / `전략목록` | `strategy.ts:288-289` | 전략 현황 | 없음 | reply/replyHtml | 없음 | 없음 |
| 19 | `/customstrategy` / `커스텀전략등록 <자연어>` | `custom-strategy.ts:141-142` | 자연어 전략 → DB create | 자연어 | reply | **있음** (`parseStrategyText` → `strategy:parse` · `lib/custom-strategy/parser.ts:146-150`) | 없음 |
| 20 | `/customstrategylist` / `커스텀전략목록` | `:144-145` | 목록 | 없음 | reply/replyHtml | 없음 | 없음 |
| 21 | `/customstrategydelete` / `커스텀전략삭제` | `:147-148` | 삭제 — DB delete(`:136`) | 번호/ID | reply | 없음 | 없음 |
| 22 | `/watch` / `관심 [종목] …` | `watchlist.ts:242-243` | 관심종목 추가 — DB upsert(`:106,122,135`) | 종목·목표가·매수구간·메모 | replyHtml·reply | 없음 (yahoo) | 없음 |
| 23 | `/unwatch` / `관심삭제` | `:245-246` | 삭제 — DB delete(`:176`) | 종목 | reply | 없음 | 없음 |
| 24 | `/watchlist` / `관심목록` | `:248-249` | 현황 + 현재가 | 없음 | replyHtml | 없음 | 없음 |
| 25 | `/analysis` / `분석 [종목]` | `analysis.ts:114-115` | TA 리포트(`generateTAReport`) | 종목 | replyHtml | 없음 | 없음 |
| 26 | `/briefing` / `브리핑 [한국\|미국\|종목]` | `briefing.ts:139-140` | 세션 브리핑(→ `sendBriefing(session, chatId)`) 또는 종목 심층 분석 | 한국/미국/티커 | 세션: **notifierForChat**(§4) · 종목: ctx.reply(4096 이하 HTML, 초과 plain 분할 `:111-120`) + typing | **있음** (세션 `cron:briefing` — 수동인데 caller 라벨이 cron · 종목 `bot:brief_command`) | 없음 |
| 27 | `/networth` / `순자산` | `networth.ts:289-290` | 순자산 요약 | 없음 | replyHtml | 없음 | 없음 |
| 28 | `/assetlist` / `자산목록` | `:292-293` | 자산/부채 목록 | 없음 | replyHtml | 없음 | 없음 |
| 29 | `/assetadd` / `자산추가` | `:295-296` | 자산 등록 — DB create(`:210`) | 이름·카테고리·금액 | replyHtml·reply | 없음 | 없음 |
| 30 | `/assetupdate` / `자산수정` | `:298-299` | 금액 수정 — DB update(`:276`) | 이름·금액 | replyHtml·reply | 없음 | 없음 |
| 31 | `/report` / `리포트 [년] [분기]` | `report.ts:66-67` | 분기 PDF 생성 → **파일 답장** `ctx.replyWithDocument`(`:55`) | 년·분기 | replyHtml + **문서** | **있음** (`generateReportPDF` → `generateQuarterlyReview` `report:ai_review` · `lib/report/pdf-generator.ts:29`) | 없음 (fire-and-forget) |
| 32 | `/backtest` / `백테스트 [종목] [전략] [기간]` | `backtest.ts:119-120` | 백테스트 시뮬레이션 | 종목·전략·기간 | replyHtml | 없음 | 없음 |

- 슬래시 인자 파싱은 대부분 `ctx.message.text` 를 정규식으로 벗긴다(`/^(\/report(?:@\w+)?|리포트)\s*/` 형 — 텔레그램 `@봇이름` 접미 처리 포함). `ctx.match` 를 쓰는 곳은 3(§5).
- **대화 상태 라이브러리(`@grammyjs/conversations`·`session`) 사용 0** — `package.json` 의 grammY 계열 의존은 `grammy ^1.41.1` 하나(`apps/finance/package.json:29`). 다단계는 전부 **프로세스 메모리 맵 + 인라인 키보드**다(§3).

## 2. 자유 텍스트 / AI 대화

```bash
sed -n 489,507p bot/commands/ai.ts ; sed -n 669,698p bot/commands/expense.ts
```

`bot.on('message:text')` 2개가 순서대로 받는다(`index.ts:70-71`):

1. **expense fallback** (`expense.ts:670`) — `/` 시작 · 명령어 단어 21종(`:678` 정규식) · `소비`/`예산` 단독 · 숫자 없음 · 질문형(`isAiQuestion`) · 거래형(`isTradeMessage`) 이면 `next()`. 나머지(숫자 포함 자연어)는 **소비 기록**: 금액 토큰 2개 이상이면 **AI 복수 파싱**(`fireMultiExpenseParse` `:423` · `bot:expense_parse` · 확인 키보드 `multi:`), 아니면 규칙 파서(`parseExpenseInput`) → 카테고리 매칭 → 확인 키보드 `tx:`. 확정 시 DB 거래 생성 + **Whooing 웹훅**(`sendToWhooing` `:339,598`) + `checkBudgetUsage()`(예산 알림 A18).
2. **AI fallback** (`ai.ts:489`) — `/` 시작·3자 미만 무시. `isTradeMessage` → **AI 거래 파싱**(`fireTradeParseQuestion` `:146` · `bot:trade_parse` · 확인 키보드 `aitrade:`). `isAiQuestion`(`?` 또는 질문 키워드 12개 · `utils/ai-trigger.ts:9-13`) → **AI 대화**(`fireAiQuestion` `:37`). 둘 다 아니면 **무응답**.

AI 대화 상태(`ai.ts:21-31`): `chatSessions: Map<chatId(number), {sessionId, lastUsed}>`(24h TTL · `askAdvisor(..., { sessionId, persist: true })`) · `chatBusy: Set<chatId>`(동시 1건). 응답은 `splitMessage`(4096) 후 청크마다 `markdownToTelegramHtml` → HTML 실패 시 plain(`:65-73`). 진행 표시 `replyWithChatAction('typing')` 5초 주기.

## 3. 인라인 키보드 · 콜백

```bash
/usr/bin/grep -nE --binary-files=text "\`(tx|multi|trade|aitrade|vest):[a-z]+|action === '[a-z]+'" bot/commands/*.ts bot/notifications/*.ts
/usr/bin/grep -nE --binary-files=text "sent\.(chat|message_id)|message\.(chat\.id|message_id)|requestedByUserId:" bot/commands/*.ts
```

| 접두 | callback_data 형식 | 만드는 곳 | 처리기 | 동작 | 상태 저장 | Discord 판 |
|---|---|---|---|---|---|---|
| `trade:` | `trade:{confirm\|cancel}:{tradeId}` | `commands/trade.ts:247-249`(인바운드 답장) | `trade.ts:383` → `handleTradeCallback :268` | confirm = `createTrade`(DB) · cancel = 편집 | `pendingTrades` 키 `${chat.id}:${message_id}:${tradeId}` · 본인 확인 `ctx.from.id` · 5분 | **없음** |
| `aitrade:` | `aitrade:{confirm\|cancel}:{tradeId}` | `ai.ts:338-342` | `ai.ts:470` → `:356` | 같음 | `pendingAiTrades` 같은 키 형식 | **없음** |
| `tx:` | `tx:{confirm\|change\|cancel\|allcat}:{txId}` · `tx:cat:{txId}:{categoryId}` | `expense.ts:46-58,109-113,171` | `expense.ts:643` → `handleExpenseCallback :194` (action 5종 `:229,237,261,282,303`) | 카테고리 선택·변경(메시지 편집 + 키보드 교체 `:272-298`) · confirm = DB + Whooing | `pendingTransactions` 같은 키 형식 | **없음** |
| `multi:` | `multi:{confirm\|cancel}:{txId}` | `expense.ts:515-519` | `expense.ts:643` → `:529` | 복수 건 일괄 기록 | `pendingMultiExpenses` | **없음** |
| `vest:` | `vest:{confirm\|cancel}:{rsuId}` | **아웃바운드** `notifications/rsu.ts:173-179`(`interactiveNotifierFor`) | 텔레그램 `vest-confirm.ts:92`(`bot.callbackQuery`) · Discord `discord-interactions.ts:17`(gateway) — 둘 다 `decideVest` | confirm = RSU 베스팅 반영(DB) | **없음(DB rsuId 만 · 무상태)** | **있음 (M-6b-4)** |

- `new InlineKeyboard` 출현 = ai `:338` · trade `:247` · expense `:46,109,515`(`:46` 은 `buildCategoryKeyboard` 안 — `:171` 이 그 결과에 버튼을 덧붙인다) · rsu `:173` = **6**. 키보드를 붙여 보내는 `reply_markup` 은 ai 1 · trade 1 · expense 5(`:121,179,277,298,519`) = 7 + rsu 아웃바운드 1.
- **Discord 판이 있는 것 1(vest) / 없는 것 4(trade·aitrade·tx·multi).** 없는 4개는 전부 **인바운드 명령의 답장 키보드**이고, 상태가 **텔레그램 `chat.id`·`message_id`·`from.id`(number)** 를 키로 프로세스 메모리에 있다 → Discord 판은 판단 분리(`decideVest` 같은 채널 중립 함수)가 아직 없다. 이 넷의 판단은 핸들러 안에 `ctx` 와 섞여 있다(`answerCallbackQuery`·`editMessageText`·`editMessageReplyMarkup` 직접 호출).
- 패키지 gateway 가 받는 것은 **버튼(type 3 · component_type 2)뿐**(`packages/notify/src/discord-gateway.ts:220`) · IDENTIFY `intents: 0`(`:197`) · 응답 본문 2000자 넘으면 **첫 조각만**(`:209-212`) · 안내는 ephemeral(`EPHEMERAL=64` `:44`).

## 4. 텔레그램 고정 아웃바운드 (스위치를 타지 않는 경로)

```bash
/usr/bin/grep -rn --binary-files=text -E "notifierFor\(|interactiveNotifierFor\(|notifierForChat\(|telegramRecipients\(|sendFileIfDiscord\(|sendDocument\(|getBot\(|\.api\.|replyWithDocument|InputFile" --include='*.ts' --include='*.tsx' . | /usr/bin/grep -v __tests__
```

notifier 경유 아웃바운드는 `notifierFor` **20**(`bot/notifications/` 14파일 19 + `lib/ai/advisor-monitor.ts` 1) + `interactiveNotifierFor` 1 + `notifierForChat` 1 = **22**. 이 중 **스위치를 타지 않는 것**:

| # | 경로 | 위치 | 왜 텔레그램 고정인가 (코드·주석) |
|---|---|---|---|
| F1 | `/브리핑`(세션) 응답 | `notifications/briefing.ts:54` → `notifier.ts:179-185` `notifierForChat` | `createTelegramTransport` 고정 · 대상 = 요청 chat. 주석 `notifier.ts:13` "`/브리핑` 응답(`notifierForChat`)은 항상 텔레그램" · `:174-178` "봇 명령의 on-demand 발송 … 구 `sendBriefing([chatId], …)` 보존" — 요청 chat 에 답한다는 의미라 채널 = 요청이 온 곳 |
| F2 | 인바운드 답장 전부 | `ctx.reply` 137 · `replyHtml(ctx` 38 · `replyWithDocument` 1 등(§5) | grammY `Context` 직접 — notifier 를 거치지 않는다 |
| F3 | 인가 거부 안내 | `middleware/auth.ts:29` | `ctx.reply("⛔ 접근 권한이 없습니다…")` |

**스위치를 타지만 텔레그램 API 를 직접 부르는 곳 1:** 분기 PDF `quarterly-report.ts:82-84` `bot.api.sendDocument` — ALLOWED 가 discord 가 **아닐 때만**(`sendFileIfDiscord` 가 `'not-discord'` 일 때 · `:65`). 즉 고정 아님.
**키보드 1곳(RSU)** 은 별도 스위치 `NOTIFY_INTERACTIVE_CHANNEL`(`notifier.ts:100-115`) — 고정 아님.

> **주석–코드 불일치 1 (서비스 유래 아님 · pleiades M-6 이 쓴 주석).** `scheduler.ts:38` "Discord 를 골라도 키보드(RSU 확정)·분기 PDF 는 텔레그램으로 간다" — M-6b-1(PDF)·M-6b-4(RSU) 이후 둘 다 Discord 로 갈 수 있다. 가드 `hasAllowedRecipients()`(`:22-24`)가 `telegramRecipients` 를 OR 로 보는 이유로 남은 문장이다.

## 5. grammY `Context` 의존 호출 (종류별 열거)

```bash
bash -c 'F=$(/usr/bin/grep -rl --binary-files=text "from .grammy." --include="*.ts" bot | /usr/bin/grep -v __tests__)
/usr/bin/grep -ohE --binary-files=text "\bctx\.[A-Za-z]+" $F | sort | uniq -c | sort -rn'
/usr/bin/grep -rnE --binary-files=text "\bctx\.reply([^(A-Za-z]|$)" bot --include='*.ts'   # 주석 1건(telegram.ts:34) 확인
```

대상 = grammy 를 import 하는 비테스트 파일 **24**(그중 `ctx` 사용 19). `discord-interactions.ts` 의 `ctx.`(Discord 컨텍스트)는 grammy import 가 없어 제외됐다.

| 멤버 | 개수 | 비고 |
|---|---|---|
| `ctx.reply` | 138 → **137** | 1건은 주석(`utils/telegram.ts:34`). 137 중 2는 `replyHtml` 구현 안(`telegram.ts:40,44`) · 1은 auth |
| `ctx.answerCallbackQuery` | 42 | 콜백 4종 + vest |
| `ctx.editMessageReplyMarkup` | 21 | |
| `ctx.message` | 19 | 텍스트 인자 파싱 |
| `ctx.editMessageText` | 15 | |
| `ctx.callbackQuery` | 11 | |
| `ctx.from` | 10 | 본인 확인 `from.id` · `/start` first_name |
| `ctx.replyWithChatAction` | 6 | typing |
| `ctx.chat` | 4 | auth · AI 세션 · 브리핑 |
| `ctx.match` | 3 | `/ai` · alert · vest |
| `ctx.replyWithDocument` | 1 | `/report` |
| `ctx.api` | **0** | |
| **합 (주석 제외)** | **269** | 열거 합: 137+42+21+19+15+11+10+6+4+3+1 |

추가: `replyHtml(ctx, …)` 호출 **38**(정의 1 제외 — 출현 39) · 파일별 `ctx.*` 최다 `expense.ts` 70 · `ai.ts` 52 · `trade.ts` 37 · `strategy.ts` 16(전체 표는 측정 원본 출력 — 대화 기록).
`bot.api.*` 직접 호출(Context 밖) 2: `standalone.ts:26` `deleteWebhook` · `quarterly-report.ts:84` `sendDocument`. 그 밖에 `notifierFor(bot)` 류가 `bot.api` 를 transport 에 넘긴다(`notifier.ts:86,103,181`).

## 6. 인가 · 미들웨어

| 항목 | 위치 | 내용 |
|---|---|---|
| 허용 chat 검사 | `middleware/auth.ts` (전역 `instance.use` `index.ts:47`) | `TELEGRAM_ALLOWED_CHAT_IDS` 를 **모듈 로드 시 1회** Set 으로(`:3-10` · 재시작해야 반영) · 비어 있으면 전부 무응답(`:22-25`) · 비허용 chat 은 chat id 를 담아 거부 답장(`:27-34`) · **`ctx.chat` 없는 업데이트는 통과**(`:17-20`) |
| 관리자 검사 | **없음** (인바운드) | `TELEGRAM_ADMIN_CHAT_IDS` 는 아웃바운드 ADMIN 라우트(advisor 실패 alert)에만 쓰인다 |
| 본인 확인 | 콜백 4종 | `ctx.from.id !== pending.requestedByUserId`(ai `:378` · trade · expense `:217,552`). vest 는 없음(텔레그램) / Discord 는 gateway 의 사용자·채널 허용 목록 |
| rate limit | **봇에 없음** | AI 는 chat 당 동시 1건(`chatBusy`)뿐. (웹 `alerts/history/[id]/retry` 는 5분 쿨다운 · 메모리) |
| 오류 처리 | `standalone.ts:43` `bot.catch` → `sanitizeError` 로그 | 핸들러별 try/catch + 한국어 정적 메시지 · 전송 재시도는 `replyHtml` 의 `withRetry`(2s/8s/30s · `telegram.ts:75-97`)만 — 직접 `ctx.reply` 137 중 replyHtml 밖 134 는 재시도 없음 |
| 네트워크 | `index.ts:25,30,40-45` | IPv4 강제 `https.Agent` · client timeout 60 s |

## 7. 텔레그램 전용 서식 · 제약

| 항목 | 개수 · 위치 |
|---|---|
| HTML parse_mode 직접 지정 | 5 (`telegram.ts:40` · `briefing.ts:113` · `ai.ts:69` · `trade.ts:259,345`) + replyHtml 38 + notifier `htmlContent(` 사용 15파일 |
| HTML 헬퍼 `h.b/i/code/pre` | **91 회 / 20 파일** · `utils/telegram` import 25 파일(전부 `bot/` 안) |
| 마크다운 → 텔레그램 HTML | `markdownToTelegramHtml` 사용 6 파일(ai · briefing 명령 · ta-signal · briefing · active-review · monthly-report) + 정의 `utils/markdown.ts` |
| 4096 분할 | `utils/formatter.ts:50-52` `splitMessage`(호출 3: replyHtml · ai `:65` · briefing `:118`) · `briefing.ts:111` 하드코딩 4096 |
| 파일 전송 | 인바운드 `ctx.replyWithDocument` 1(`report.ts:55`) · 아웃바운드 `bot.api.sendDocument` 1(`quarterly-report.ts:84`) · `sendPhoto` 0 |
| **미디어 수신** | **0** — `message:photo`·`message:document`·`location` 등록 없음. 인바운드는 `message:text` 와 `callback_query:data` 뿐 |
| 그 밖 | `/명령@봇이름` 접미 처리 정규식(report·backtest·assetadd 등) · `replyWithChatAction('typing')` 6 · AI 시스템 프롬프트가 "응답은 텔레그램과 웹 모두에서 표시"(`lib/ai/system-prompt.ts:58`) · **"텔레그램 봇 커맨드 (사용자 안내용)" 절**(`:133~`)로 AI 가 한글 텍스트 명령을 안내한다 |

## 8. 텔레그램 밖의 의존

```bash
/usr/bin/grep -rnoE --binary-files=text "TELEGRAM_[A-Z_]+" src --include='*.ts' --include='*.tsx' | /usr/bin/grep -v __tests__     # cwd apps/finance
/usr/bin/grep -rnE --binary-files=text "from ['\"](@/bot|\.\./.*bot)/" --include='*.ts' --include='*.tsx' app lib mcp components middleware.ts instrumentation.ts
/usr/bin/grep -rn --binary-files=text "텔레그램\|Telegram" app components lib mcp --include='*.ts' --include='*.tsx' | /usr/bin/grep -v __tests__ | wc -l    # 28
```

**env 키 (코드에서 읽는 것 3):** `TELEGRAM_BOT_TOKEN`(`bot/index.ts:36` · `scheduler.ts:31` · MCP 로그 redact 목록 `mcp/logger.ts:198`) · `TELEGRAM_ALLOWED_CHAT_IDS`(auth · notifier ALLOWED) · `TELEGRAM_ADMIN_CHAT_IDS`(notifier ADMIN · advisor-monitor 안내 로그). `.env.example:22` 의 `TELEGRAM_WEBHOOK_SECRET` 은 **src 에서 읽는 곳 0**(웹훅 라우트 없음 · long polling 전용).

**웹(Next) 프로세스가 봇 모듈을 import 하는 곳 4 파일:**

| 웹/lib | 무엇 | 텔레그램 의존 |
|---|---|---|
| `app/api/deposits/route.ts:5,126` | 증여 입금 → `checkGiftTaxLimit` | `budget-alert.ts:96` 이 **`getBot()`** → 토큰 없으면 throw(호출부 `.catch` 로그) |
| `app/api/alerts/history/[id]/retry/route.ts:21-22` | 실패 알림 재발송 | `redispatchAlert(bot = getBot())` `alert-dispatcher.ts:105` |
| `lib/ai/advisor-monitor.ts:20,293-295` | advisor 연속 실패 ADMIN alert(웹·봇 양쪽) | 지연 import 후 `notifierFor(getBot())` |
| `lib/cron.ts:7-10` | 시세 갱신 뒤 가격·TA·커스텀 알림 | 봇 프로세스에서만 돈다 |

→ **Discord 로 라우팅해도 `notifierFor(bot)` 의 인자가 grammY `Bot` 이고 `getBot()` 은 `TELEGRAM_BOT_TOKEN` 이 없으면 throw 한다**(`index.ts:36-39`). 웹 경로 3개 포함 notifier 호출 22곳 전부가 토큰에 묶여 있다(봇은 생성만 · 네트워크는 텔레그램 transport 를 고를 때만).

**MCP:** 텔레그램 의존 코드 0 — 로그 redact 키 1 · 도구 설명·오류 문구에 "텔레그램" 단어(`mcp/tools/spending.ts:223,224,262,315` · `alert-history.ts` · `custom-strategy.ts` · `server.ts:451`).
**웹 UI 문구:** "텔레그램" 단어 — `app/strategies/page.tsx:11` · `app/alerts/history/page.tsx:11` · `components/category/*.tsx` 2 · `lib/alert-config/categories.ts:98,99,107`(설정 설명). 합계 28 줄(위 명령 · lib/mcp 주석 포함).

**DB 스키마 (`prisma/schema.prisma` · 모델 30):** `chat|telegram|message_id|recipient|channel|delivery` 검색 결과는 `AlertHistory.deliveryStatus`·`recipientCount`(`:343-344`)뿐 — **텔레그램 chat id·message id 를 저장하는 컬럼 0.** `AlertHistory.message` 는 "per-event HTML 본문"(텔레그램 HTML · `:342`) · 주석 "한 번의 텔레그램 배치 발송"(`:332`). 대화 상태(§2·§3)는 전부 메모리라 DB 에 없다.

**프로세스 구조:** pm2 `pleiades-fin-bot` = `dist/bot/standalone.cjs`(루트 `deploy/pleiades.config.cjs:76`) · 웹 `pleiades-fin-web`(next) · MCP `pleiades-fin-mcp`. 웹 `instrumentation.ts` `register()` 는 비어 있다("cron + 알림 스케줄러는 standalone 봇 프로세스에서 실행"). grammY long polling 은 `standalone.ts:61` `bot.start()`.

## 9. 봇 프로세스에서 텔레그램을 끄면 같이 꺼지는 것

```bash
cat bot/standalone.ts ; /usr/bin/grep -cE "^\s+cron\.schedule\(" lib/cron.ts ; /usr/bin/grep -nE "^\s+(schedule|scheduleInteractive)\(" bot/notifications/scheduler.ts
```

`standalone.ts:21-26` 순서: `getBot()`(토큰 없으면 throw) → `await bot.init()`(텔레그램 `getMe` 네트워크) → `deleteWebhook()` → 그 **뒤에** 크론·스케줄러 등록(`:30-37`) → Discord gateway(`:41`) → `bot.start()`. 실패는 `main().catch` → `process.exit(1)`(`:63-65`).

| 같이 꺼지는 것 | 개수 | 출처 |
|---|---|---|
| `lib/cron.ts` 크론 | **7** — 시세 갱신(→ 가격·TA·커스텀 알림) · 스냅샷 · 실적 스캔 · KRX 동기화 · **벤치마크(#261)** · 반복 거래 · 베스팅 상태 | `lib/cron.ts:77,124,149,186,217,244,324` |
| 알림 스케줄러 | **13** (`schedule` 12 + `scheduleInteractive` 1) | `scheduler.ts:77~261` |
| Discord 버튼 gateway | 1 | `standalone.ts:41` (getBot 성공 뒤에만) |
| 인바운드 명령 32 · 자유 텍스트 2 경로 · 콜백 5종 | — | §1~3 |

- 토큰을 비우면 프로세스가 **시작 단계에서 exit 1** — 크론 20 개(7+13)가 등록되기 전이다. 프로세스가 살아도 `scheduleNotifications()` 는 토큰이 없으면 **13개 전부 등록을 건너뛴다**(`scheduler.ts:31-34`).
- 토큰은 있고 텔레그램 API 에 닿지 못하면 `bot.init()` 이 실패해 같은 결과(재시도 없음 · pm2 재시작 루프 — 재시작 정책은 `deploy/pleiades.config.cjs` · 미측정).
- 이전 기록 "봇 19 = lib/cron 6 + 알림 13"(measured-facts §6 · 2026-10-20)은 **#261 이후 20(7+13)** 이다.

---

## 대장 — 요약 표

| 항목 | 개수 | 출처 |
|---|---|---|
| grammY 등록 `command` / `hears` / `on` / `callbackQuery` | 21 / 28 / 5 / 1 | §1 명령 |
| 논리 명령 (슬래시만 / 한글만 / 둘 다) | **32** (4 / 11 / 17) | §1 표 #1~32 |
| 그중 AI 호출 명령 | 5 (`/ai` · 커스텀전략등록 · 브리핑 · 리포트 · `수입 …` 복수 건) | §1 표 #14·19·26·31·9 |
| 그중 DB 쓰기 명령 | **12** (즉시 9 + 키보드 확정 뒤 3 · 아래 열거) | §1 표 |
| 자유 텍스트 경로 | 2 핸들러 → 4 분기(규칙 소비 · AI 복수 소비 · AI 거래 파싱 · AI 대화) | §2 |
| 콜백 접두 | 5 (trade · aitrade · tx · multi · vest) — Discord 판 1(vest) / 없음 4 | §3 표 |
| 메모리 상태 맵 | 6 (`chatSessions` · `chatBusy` · `pendingAiTrades` · `pendingTrades` · `pendingTransactions` · `pendingMultiExpenses`) | §2·§3 |
| notifier 아웃바운드 호출 (`notifierFor` 20 · interactive 1 · forChat 1) | **22** — 전부 grammY `Bot` 인자 | §4 · §8 |
| 텔레그램 고정 아웃바운드 (notifier 경로) | **1** (`notifierForChat` = `/브리핑` 세션) | §4 F1 |
| `ctx.*` 멤버 호출 (주석 제외) | **269** · `replyHtml(ctx` 38 · `ctx.api` 0 | §5 |
| HTML 헬퍼 `h.*` | 91 / 20 파일 | §7 |
| 미디어 수신 핸들러 | 0 | §7 |
| 텔레그램 env 키 (코드가 읽는 것) | 3 (+ 미사용 `TELEGRAM_WEBHOOK_SECRET` 1) | §8 |
| 웹·lib 에서 봇 모듈 import | 4 파일 (그중 `getBot()` 경로 3) | §8 |
| DB 의 텔레그램 식별자 컬럼 | 0 | §8 |
| 봇 프로세스 크론 | **20** (lib 7 + 알림 13) | §9 |

DB 쓰기 명령 열거: 즉시 쓰기 = 예산설정 · 알림설정 · 전략 · 커스텀전략등록 · 커스텀전략삭제 · 관심 · 관심삭제 · 자산추가 · 자산수정 = **9** · 키보드 확정 뒤 쓰기 = 매수 · 매도 · `수입 …`(+ 자유 텍스트 소비·AI 거래) = **3** 명령. 합 **12 / 32**.

## 가정을 뒤집는 발견

1. **"텔레그램을 끈다" = 토큰을 빼는 것이면 fin 은 Discord 알림까지 전부 멈춘다.** `getBot()` 이 `TELEGRAM_BOT_TOKEN` 없으면 throw(`index.ts:36-39`)하고 notifier 22곳이 전부 `getBot()` 의 `Bot` 을 인자로 받는 형태라, Discord 로 라우팅된 알림도 토큰에 묶여 있다. 봇 프로세스는 `bot.init()` 실패 시 **크론 20개를 등록하기 전에 exit 1** 하고, Discord gateway 도 그 뒤에 뜬다. → 009 는 "스위치 전부 discord" 와 "텔레그램 제거" 를 다른 단계로 둬야 하고, 후자는 **프로세스 진입점·`notifierFor` 시그니처 변경**(코드 작업)이다.
2. **패키지 gateway 는 버튼만 받는다**(`intents: 0` · `type 3/component_type 2` 만). 인바운드 32 명령 · 자유 텍스트 2 경로를 Discord 로 옮기려면 **새 수신 기능**(슬래시 명령 = `INTERACTION_CREATE type 2` 또는 메시지 수신 = `MESSAGE_CREATE`)이 필요하다. 어느 쪽에 privileged intent(Message Content)가 필요한지는 Discord 정책 사항이라 이 저장소에서는 **미측정**.
3. **한글 텍스트 명령 28 hears + 자유 텍스트 판별이 fin 사용 방식의 대부분이다.** 슬래시만 있는 명령은 4. 슬래시 명령으로 옮기면 "점심 12000" 같은 자연어 소비 기록·질문형 AI 대화 경로가 사라진다 — 메시지 수신(2번) 여부가 기능 범위를 정한다. AI 시스템 프롬프트(`system-prompt.ts:133~`)도 텔레그램 한글 명령을 안내하므로 같이 바뀐다.
4. **콜백 4종(trade·aitrade·tx·multi)은 Discord 판이 없고, 상태 키가 텔레그램 `chat.id:message_id` + `from.id`(number) 다.** vest 처럼 판단 함수 분리(`decideVest`)부터 해야 하고, Discord 버튼 응답은 2000자 첫 조각만 · 메시지 편집 후 키보드 교체(`tx:change`·`allcat`)는 현재 `DiscordButtonContext.edit` 가 `keepButtons` 만 지원해 **버튼 교체 API 가 없다**(`discord-gateway.ts:53-58`).
5. **"텔레그램 고정 아웃바운드"는 notifier 경로로는 1곳(`/브리핑` 세션)뿐**이다. 분기 PDF·RSU 키보드는 이미 스위치를 탄다. `scheduler.ts:38` 주석은 그 반대를 말해 낡았다.
6. **DB 에 텔레그램 식별자가 없다** — 전환에 스키마 변경은 필요 없어 보인다(`AlertHistory.message` 가 텔레그램 HTML 이라는 점만 남는다 · 웹 이력 화면이 그 HTML 을 렌더). 반면 `TELEGRAM_ALLOWED_CHAT_IDS` 하나가 **인바운드 화이트리스트와 아웃바운드 수신자**를 겸하고, auth 는 그 값을 **모듈 로드 때 1회**만 읽는다.
7. 측정 대장 정정: 봇 프로세스 크론은 **20**(measured-facts §6 의 19 는 #261 이전).

**못 잰 것:** Discord 슬래시/메시지 수신의 intent·권한 요건 · 서버 `.env` 의 실제 텔레그램 키 값 · pm2 재시작 정책 아래 init 실패 반복의 실제 거동 · 웹 이력 화면이 `AlertHistory.message` HTML 을 어떻게 렌더하는지(코드 미열람).
