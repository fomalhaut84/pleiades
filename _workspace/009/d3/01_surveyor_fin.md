# 009 D-3 착수 직전 측정 — fin 텔레그램 인바운드 전수 · chat 대응 · 설정·배포 (#377)

- 측정일 2026-10-29 · 대상 pleiades `dev` HEAD `3a4d28d71b7733623fe4dd8eff545dd2b6dd8570`(D-2 `v1.3.0` 이후) · 작업트리: 추적 파일 clean · 추적 안 된 파일 3(`deploy/telegram-polling.cjs` · `deploy/telegram-polling.sh` · `deploy/test_telegram_polling.py` — 이 측정 대상 아님 · 읽지 않음)
- 읽기 전용. 쓴 파일은 이 파일 하나. `repos/*`·원본·서버·pm2·DB·네트워크 접근 0 · 앱·테스트·스크립트·빌드 실행 0 · `apps/*` 하네스 지시 미실행(I-10). 비교용으로 `apps/fitness` 의 D-2 결과 파일 몇 개를 읽었다(경로 표기)
- 명령: `/usr/bin/grep -n --binary-files=text` · `git grep --text` · `sed -n` · `cat -n`. 다중 파일 집계는 `bash -c` 안에서. 경로는 저장소 루트 기준 — 앱 내부는 `apps/finance/` 생략(표에 명시)
- **`measured-facts.md` 는 갱신하지 않았다**(호출자 지시). 테스트 건수는 정적 grep 개수다(실행 0)
- 이전 측정 `_workspace/009/01_surveyor_fin.md`(**[F]** · HEAD `8192b0c` · 009 기획) · `_workspace/009/d1/01_surveyor_fin.md`(**[F1]** · HEAD `7d6248f` · D-1 전)과 같은 명령으로 다시 쟀다 — 바뀐 값은 맨 끝 표

공통 정의(cwd `apps/finance`):
```bash
bash -c 'F=$(find src/bot -name "*.ts" -not -path "*__tests__*" | sort); <명령> $F'     # 봇 비테스트 47 파일
```

## 요약

1. **인바운드 등록은 [F] 와 같다** — `command` 21 · `hears` 28 · `on` 5 · `callbackQuery` 1 (+ `use` 1 · `catch` 1) · 논리 명령 32(슬래시만 4 · 한글만 11 · 둘 다 17) · 콜백 접두 5(Discord 판 1 = `vest:`) · 미디어 수신 0 · grammY ctx 참조 269(M1~M7).
2. **한글 명령 28 은 전부 `hears` 정규식이고 그중 10 은 정확 일치(`^현황$` · `^소비\s*$` …)** — chat `command(…, { prefix: 'optional' })` 로 옮기면 첫 단어 매칭이라 `현황 어때?` 같은 자연어까지 명령으로 간다. chat `hears` 는 텔레그램과 같은 의미(등록 순 첫 일치)로 그대로 받는다(M3 · C4).
3. **영어 이름 명령 12 개의 인자를 핸들러가 원문에서 정규식으로 벗긴다**(`/^(\/report(?:@\w+)?|리포트)\s*/` 등 12 + `ctx.match` 2) — `!report 2026 1` 은 벗겨지지 않아 인자가 `!report 2026 1` 이 된다. 슬래시만 있는 4 명령(`start·help·ai·reset`)은 Discord 에서 접두 없이는 부를 길이 없다(M20 · M2).
4. **fin AI·긴 작업은 전부 fire-and-forget 이다**(7 곳) — 핸들러는 진행 안내 뒤 바로 돌아가고 답은 나중에 같은 ctx 로 간다. fit(D-2)은 AI 를 await 해 chat 채널 대기열·감시 시한(10 분)이 그 길이를 받았다 — fin 은 대기열이 AI 를 직렬화하지 않고, 동시성은 앱의 chat 별 `chatBusy` 가 맡는다(M11 · M12).
5. **상태 맵 6 중 4 는 이미 문자열 키**(`${chat.id}:${message_id}:${id}` — 봇이 보낸 메시지에 묶임 · 텍스트 입력을 붙잡는 상태 0) · number 키 2(`chatSessions` · `chatBusy`) · 본인 확인 `requestedByUserId: number` 4 인터페이스 · 이 맵에 의존하는 테스트·스크립트 **0**(M9). fit 의 편집 pending(다음 텍스트를 먹는 상태)이 fin 에는 없다.
6. **DB 에 텔레그램 사용자 ID 가 쓰인다** — `Transaction.userId = String(ctx.from.id)`(`expense.ts:332,588` · 컬럼 `String?` · 인덱스 있음 · `src` 읽기 0). [F] §8 "텔레그램 식별자 컬럼 0" 은 이 컬럼을 놓쳤다(M10).
7. **카테고리 키보드가 chat 버튼 한도(행 5)를 넘을 수 있다** — 2열 + 취소 행이라 행 = ⌈n/2⌉+1 · seed 소비 카테고리 9 → 6 행 → chat `toComponents` 가 throw(`buttons.ts:19`). 운영 카테고리 수는 미측정(서비스 DB · I-7)(M19).
8. **`/브리핑`(세션) 응답은 텔레그램 전용 `notifierForChat(bot, chatId: number)` 하나뿐**(호출 1 · `briefing.ts:54`) · `/report` 는 `replyWithDocument` 1 → chat `replyFile` 로 대응 가능(상한 10 MiB · PDF 크기 미측정)(M14 · M15).
9. **fin 의 현재 Discord 배선은 D-1 그대로** — intents 0 · 허용 채널 `[DISCORD_CHANNEL_ID_FINANCE]` · 라우터 `action(/^/)` 하나 · 대화 채널 키 0 · 메시지 채널 옵션 미사용. 켜기 스크립트는 fin 을 `stop 2 "fin 은 아직이다"` 로 거부(`discord-inbound.sh:174`)(M24 · M25).
10. 테스트: fin 봇 **13 파일 · 141 건** — 명령 핸들러 판단 테스트는 `vest-confirm` 10 뿐(`ai`·`expense`·`trade` 콜백 4종 · 자유 텍스트 분기 · 인자 파싱 0) · 트리거 유틸·`expense-parser`·`category-matcher` 테스트 0 · chat 6 파일 89 건(M27 · M30).

---

## 대장

| # | 항목 | 값 | 출처 file:line(앱 기준) | 측정 명령 |
|---|---|---|---|---|
| **M1** | grammY 등록 `command`/`hears`/`on`/`callbackQuery` | **21 / 28 / 5 / 1** (+ `use` 1 · `catch` 1) | A1 표 | `for k in command hears on callbackQuery use catch; do /usr/bin/grep -h --binary-files=text -E "(bot\|instance\|b)\.$k\(" $F \| wc -l; done` |
| **M2** | 논리 명령 | **32**(슬래시만 4 · 한글만 11 · 둘 다 17) | A1 | M1 목록 읽기 |
| **M3** | 한글 `hears` 정규식 형태 | 28 = 인자 선택 `(?:\s+.*)?$` **15** + `관심` 부정 전방탐색 1 + **정확 일치 10** + `^계좌(\s+.+)?$` 1 + `^수입\s+.+$` 1 | A2 표 | M1 출력 |
| **M4** | 자유 텍스트 | `on('message:text')` 2 핸들러 → **4 분기 + 무응답** · expense 거름 단어 **22** | `expense.ts:670-697` · `ai.ts:489-506` | `cat -n` |
| **M5** | 미디어 수신 | **0**(`message:photo`·`document` 등록 0) | M1 | M1 명령 |
| **M6** | 콜백 접두 · 등록 · Discord 판 | 접두 **5** · 등록 4(`on('callback_query:data')` 3 + `callbackQuery` 1) · Discord 판 **1**(`vest:`) | A3 표 | M1 + 읽기 |
| **M7** | grammY ctx 참조 | **269**(원 276 − chat `ButtonContext` 6 − 주석 1) | B 표 | `/usr/bin/grep -ho -E "ctx\??\.[A-Za-z_]+(\??\.[A-Za-z_]+)?" $F \| sort \| uniq -c` |
| **M8** | fin 이 쓰는데 chat 에 없는 능력 | **표시 이름 1**(`ctx.from.first_name` · `start.ts:58`) — typing·삭제·편집·파일·버튼 교체는 있다 | B2 표 | B2 |
| **M9** | 상태 맵 | **6**(number 키 2 · 문자열 키 4) · 본인 확인 `requestedByUserId: number` **4** 인터페이스 · 의존 테스트·스크립트 **0** | C 표 | `/usr/bin/grep -rln -E "chatSessions\|chatBusy\|pending…\|requestedByUserId" src scripts` |
| **M10** | DB 에 쓰는 텔레그램 식별자 | **`Transaction.userId`**(`String?` · `@@index([userId])`) ← `String(requestedByUserId)` 쓰기 **2** · `src` 읽기 **0** | `prisma/schema.prisma:253,262` · `expense.ts:332,588` | `git grep --text -n userId HEAD -- apps/finance` |
| **M11** | fire-and-forget 인바운드 작업 | **7**(AI 5 · 리포트 PDF 1 · 백테스트 1) · 핸들러가 await 하는 AI 1(커스텀전략 파싱 60 s) | D1 표 | `/usr/bin/grep -n -E "function fire\|\)\.then\(\|askAdvisor\(\|sendBriefing\(\|generateReportPDF" commands/*.ts` |
| **M12** | AI 대화 상태 | 세션 `Map<number, {sessionId,lastUsed}>`(24 h · CLI `--resume`) · 동시 1건 `Set<number>` **chat 단위**(전역 락 없음) | `ai.ts:21-31,41-46,57-64` · `lib/ai/claude-advisor.ts:813-815` | `cat -n` |
| **M13** | 긴 AI 작업 | `overallTimeoutMs: 900_000` **2**(`/브리핑 <종목>` · `/브리핑` 세션) | `briefing.ts:107`(명령) · `notifications/briefing.ts:74` | `grep -n overallTimeoutMs` |
| **M14** | `/브리핑` 요청 채널 응답 | `sendBriefing(session, chatId?: number)` → `notifierForChat(bot, chatId: number)` = **텔레그램 transport 고정** · 명령 호출 1 · 크론 호출 2(chatId 없음) | `notifications/briefing.ts:49-54` · `notifier.ts:207-212` · `commands/briefing.ts:57` · `scheduler.ts:207,220` | `git grep -n -E "sendBriefing\(\|notifierForChat\("` |
| **M15** | 파일 전송(인바운드) | `ctx.replyWithDocument(new InputFile(buf, name), {caption})` **1** · chat `replyFile({name, data, contentType?, caption?})` 있음 · 상한 기본 **10 MiB** | `report.ts:55-57` · `packages/chat/src/types.ts:32-38,80` · `rest.ts:114,227-230` | `grep -n -E "replyWithDocument\|InputFile"` |
| **M16** | 인바운드 HTML 지점 | `replyHtml(ctx` **38** · `parse_mode:'HTML'` 직접 **4**(+`replyHtml` 정의 안 1) · `h.*` 91 / 20 파일(`src` 전체) · `markdownToTelegramHtml` 사용 6 파일(**`&`·`<`·`>` escape 있음**) | E | `grep -o "replyHtml(ctx"` · `grep -n parse_mode` |
| **M17** | 분할 | `splitMessage(text, 4096)` 호출 3(`replyHtml` · `ai.ts:65` · `briefing.ts:118`) + 하드코딩 4096 1(`briefing.ts:111`) | `utils/formatter.ts:50-52` | `grep -n splitMessage` |
| **M18** | 인라인 키보드 | `new InlineKeyboard` 명령 **5** + 아웃바운드 1(`rsu.ts:173`) · 키보드 부착 `reply_markup: keyboard` 7(`reply` 5 + `editMessageText` 2) · 버튼 제거 `editMessageReplyMarkup` 21 | A3 · E | `grep -n -E "new InlineKeyboard\|reply_markup"` |
| **M19** | 카테고리 키보드 행 수 | 행 = ⌈n/2⌉ + 1(취소 행 · `allcat` 은 취소 행에 붙는다) · seed 소비 **9** → **6 행** · 수입 3 → 3 행 · 히스토리 추천 ≤5 → ≤4 행 · chat 한도 **행 5**(넘으면 throw) | `expense.ts:42-61,169-173` · `prisma/seed.ts:293-313` · `lib/category-matcher.ts:51` · `packages/chat/src/buttons.ts:7,19` | `sed -n` · `grep -c "type: 'expense'" prisma/seed.ts` |
| **M20** | 원문 인자 벗기기 정규식 | **12**(alert · analysis · backtest · briefing · customstrategy · customstrategydelete · assetadd · assetupdate · report · strategy · watch · unwatch) + `ctx.match` 2(`/ai` · alert) — `!` 접두를 모른다 | F 표 | `grep -n -E "ctx\.message\|ctx\.match"` |
| **M21** | 사용자 안내문 속 `/` 명령 표기 | 명령 파일 **11 줄**(`ai.ts:450` · `alert.ts:57,59,60,71,72` · `start.ts:6,7,25` · `watchlist.ts:59,91`) + 세션 브리핑 실패 안내 1(`notifications/briefing.ts:94`) | F2 | F2 명령 |
| **M22** | `알림설정` 인자 판독(정적) | hears 경로의 `ctx.match` = 전체 일치 배열 → `toString()` 이 원문 전체 → `||` 뒤 벗기기가 돌지 않는다 · **실행 미확인** | `alert.ts:33,40,67-80` | 읽기 |
| **M23** | DB 쓰기 인바운드 | 즉시 쓰기 명령 9 · 버튼 확정 뒤 쓰기 3 명령(매수·매도·`수입 …`)+자유 텍스트 2 경로(소비·AI 거래) · vest 1 · 외부 부수효과 Whooing 2 · 예산 경보(아웃바운드 ALLOWED) 2 | G 표 | `grep -n -E "prisma\.[a-zA-Z]+\.(create\|update\|upsert\|delete)…\|createTrade\|sendToWhooing\|checkBudgetUsage"` |
| **M24** | fin Discord 현재 배선 | intents **0** · 버튼 채널 `[DISCORD_CHANNEL_ID_FINANCE]` · `messageChannelIds`·`fallbackIntents`·`commandPrefix` 미사용 · 라우터 `action(/^/)` 1 · label `discord-fin` · IDENTIFY 차단 알림 **`Route.ADMIN`** | `notifications/discord-interactions.ts:20,49,55-85` | `cat -n` |
| **M25** | 켜기 스크립트의 fin 거부·fit 고정 지점 | `discord-inbound.sh` **:174**(fin → `stop 2`) · `:15-17`(KEY·BOT·LABEL 상수) · `:4-7`(사용법 주석) · `:241`(되돌리기 안내) · `discord-inbound.cjs:13`(`KEYS`) · `test_discord_inbound.py:244-247`(fin 거부 테스트) · `:25,37-39`(fit 키·문자열) | H | `grep -n -E "\bfit\b\|FITNESS\|fin"` |
| **M26** | 판정 문자열 출처 | 준비·종료 코드·4014 강등 = **chat**(`[${label}]` · 앱 무관) · 미설정 2문구 = 앱 `discord-interactions.ts:58,62` · 켜짐/꺼짐 2문구 = fit 앱에만(`apps/fitness/…/discord-interactions.ts:47-48`) | H | `grep -rn "MESSAGE CONTENT 미허용" packages/chat/src` |
| **M27** | fin 봇 테스트 | **13 파일 · 141 건** · 명령 판단 테스트 = `vest-confirm` 10 · `price-format` 14(순수 서식) · `discord-interactions` 8(그중 `intents` 0 단언 1 · `:112`) | I 표 | `/usr/bin/grep -cE '^\s*(it\|test)(\.each\([^)]*\))?\('` |
| **M28** | 인바운드 판단 지점 테스트 | `ai-trigger`·`trade-trigger`·`expense-parser`·`category-matcher` **0** · 콜백 4종·자유 텍스트 분기·인자 파싱 **0** | I | `find src -path '*__tests__*' \| grep -iE "expense\|category\|trigger\|…"` |
| **M29** | 시간 의존 | 인바운드 **시간대 가드 0** · 메시지 시각(`message.date`) 사용 0 · 처리 시각(`new Date()`) 의존 12 줄 / 8 파일 | J | `grep -n -E "new Date\(\)\|Date\.now\(\)"` |
| **M30** | chat 테스트(D-2 후) | **6 파일 · 89 건**(chat-d2 22 · chat 18 · contract 4 · identify-guard 11 · rest 16 · units 18) | I | M27 과 같음 |
| **M31** | 인바운드 → lib 의 `bot` 전달 | **0** — lib 알림은 `notifyBot()` 싱글턴(D-1)을 스스로 부른다 · fit 의 "핸들러가 `bot` 을 넘긴다"(D-2 Δ7) 문제 없음 | `bot/index.ts:91-93` · `budget-alert.ts:64` · `briefing.ts:53` · `advisor-monitor.ts:293-295` | `git grep -n -E "getBot\(\|notifyBot\(\)"` |

---

## A. fin 텔레그램 인바운드 전수

### A1. 등록 순서와 명령 (M1 · `src/bot/index.ts:48-71`)

순서: `use(authMiddleware)` → start → portfolio → price → trade → expense(명령·콜백) → budget → ai(명령·콜백) → alert → strategy → custom-strategy → watchlist → analysis → briefing → networth → report → backtest → vest → **fallback 2**(expense → ai). grammY 는 등록 순 미들웨어 — `hears` 가 일치하면 다음으로 넘기지 않는다(chat 라우터의 "등록 순 첫 일치"와 같은 의미).

| 영어(슬래시) | 한글 정규식 | 위치 | 인자 | AI | DB 쓰기 |
|---|---|---|---|---|---|
| `start` | — | `start.ts:57` | — (`from.first_name`) | — | — |
| `help` | — | `start.ts:67` | — | — | — |
| `ai` | — | `ai.ts:444` | `ctx.match` | 있음 | 확정 시(aitrade) |
| `reset` | — | `ai.ts:462` | — | — | — |
| `alertconfig` | `/^알림설정(?:\s+.*)?$/` | `alert.ts:32-33` | M22 | — | 있음 |
| `analysis` | `/^분석(?:\s+.*)?$/` | `analysis.ts:114-115` | 정규식 | — | — |
| `backtest` | `/^백테스트(?:\s+.*)?$/` | `backtest.ts:119-120` | 정규식 | — | — |
| `briefing` | `/^브리핑(?:\s+.*)?$/` | `briefing.ts:139-140` | 정규식 | 있음 | — |
| `customstrategy` | `/^커스텀전략등록(?:\s+.*)?$/` | `custom-strategy.ts:141-142` | 정규식 | 있음(await) | 있음 |
| `customstrategylist` | `/^커스텀전략목록\s*$/` | `:144-145` | — | — | — |
| `customstrategydelete` | `/^커스텀전략삭제(?:\s+.*)?$/` | `:147-148` | 정규식 | — | 있음 |
| `networth` | `/^순자산\s*$/` | `networth.ts:289-290` | — | — | — |
| `assetlist` | `/^자산목록\s*$/` | `:292-293` | — | — | — |
| `assetadd` | `/^자산추가(?:\s+.*)?$/` | `:295-296` | 정규식 | — | 있음 |
| `assetupdate` | `/^자산수정(?:\s+.*)?$/` | `:298-299` | 정규식 | — | 있음 |
| `report` | `/^리포트(?:\s+.*)?$/` | `report.ts:66-67` | 정규식 | 있음(PDF) | — |
| `strategy` | `/^전략(?:\s+.*)?$/` | `strategy.ts:285-286` | 정규식 | — | 있음 |
| `strategylist` | `/^전략목록\s*$/` | `:288-289` | — | — | — |
| `watch` | `/^관심(?!삭제\|목록)(?:\s+.*)?$/` | `watchlist.ts:242-243` | 정규식 | — | 있음 |
| `unwatch` | `/^관심삭제(?:\s+.*)?$/` | `:245-246` | 정규식 | — | 있음 |
| `watchlist` | `/^관심목록\s*$/` | `:248-249` | — | — | — |
| — | `/^현황$/` | `portfolio.ts:150` | — | — | — |
| — | `/^계좌(\s+.+)?$/` | `portfolio.ts:159` | 한글 정규식 | — | — |
| — | `/^주가(?:\s+.*)?$/` | `price.ts:222` | 한글 정규식 | — | — |
| — | `/^환율\s*$/` | `price.ts:231` | — | — | — |
| — | `/^매수(?:\s+.*)?$/` · `/^매도(?:\s+.*)?$/` | `trade.ts:365,374` | 한글 정규식 | — | 확정 시 |
| — | `/^수입\s+.+$/` | `expense.ts:633` | 원문 전체 | 복수 건이면 | 확정 시 |
| — | `/^소비\s*$/` · `/^수입\s*$/` · `/^예산\s*$/` | `budget.ts:205,214,223` | — | — | — |
| — | `/^예산설정(?:\s+.*)?$/` | `budget.ts:232` | 한글 정규식 | — | 있음 |

- 검산: `command` 21 = 슬래시만 4 + 둘 다 17 · `hears` 28 = 둘 다 17 + 한글만 11. [F] §1 과 같다.
- `ctx.from` 사용 10(본인 확인 9 + `first_name` 1) — fit 은 0 이었다.

### A2. 한글 정규식의 형태 (M3 · 접두 정책 판단 재료)

| 형태 | 수 | 예 | chat `command(…, {prefix:'optional'})` 로 옮기면 |
|---|---|---|---|
| 정확 일치(인자 없음) | **10** | `^현황$` · `^소비\s*$` · `^수입\s*$` · `^예산\s*$` · `^환율\s*$` · `^순자산\s*$` · `^자산목록\s*$` · `^전략목록\s*$` · `^커스텀전략목록\s*$` · `^관심목록\s*$` | 첫 단어만 보므로 `현황 어때?` · `소비 패턴 분석해줘` 가 명령으로 간다 — 지금은 자유 텍스트(AI) |
| 인자 선택 `(?:\s+.*)?$` | 15 | `^분석(?:\s+.*)?$` | 같은 의미(첫 단어 + 나머지) — 단 `.` 이 줄바꿈을 못 넘는 차이(여러 줄 메시지는 지금 불일치) |
| 부정 전방탐색 | 1 | `^관심(?!삭제\|목록)(?:\s+.*)?$` | chat 첫 단어 비교는 `관심삭제`·`관심목록` 을 다른 이름으로 보므로 같다 |
| 인자 필수 | 2 | `^계좌(\s+.+)?$`(사실상 선택) · `^수입\s+.+$`(단독 `수입` 은 budget) | `수입` 은 인자 유무로 두 핸들러가 갈린다 — 이름 하나로는 표현 못 한다 |

- chat `hears(re, h)` 는 `ctx.text.match(re)` 등록 순 첫 일치(`packages/chat/src/router.ts:89-95`) — 위 28 정규식을 **그대로** 받는다. 명령(첫 단어) 단계가 `hears` 보다 앞이므로(`:79-88`) 영어 이름과 한글 정규식이 같은 입력을 두고 겨루지 않는다(영어 이름은 접두 필수 기본).
- Discord 입력창은 `/` 로 시작하는 글을 가로챈다(X-1 실측 · `router.ts:7`) — 한글 명령은 원래 접두가 없어 영향 없다.

### A3. 콜백 (M6)

| 접두 | 형식 | 만드는 곳 | 처리 | 상태 | 본인 확인 | 편집 동작 | Discord 판 |
|---|---|---|---|---|---|---|---|
| `trade:` | `trade:{confirm\|cancel}:{tradeId}` | `trade.ts:247-249` | `trade.ts:383` → `:268` | `pendingTrades` | `:296` | 버튼 제거 + 본문 교체(confirm 은 HTML `:339-346`) | 없음 |
| `aitrade:` | 같은 꼴 | `ai.ts:338-340` | `ai.ts:470` → `:355` | `pendingAiTrades` | `:378` | 버튼 제거 + 본문 교체 | 없음 |
| `tx:` | `tx:{confirm\|change\|cancel\|allcat}:{txId}` · `tx:cat:{txId}:{categoryId}` | `expense.ts:51,58,109-113,171` | `expense.ts:643` → `:194` | `pendingTransactions` | `:217` | **본문 교체 + 키보드 교체**(`change`·`allcat` `:271-278,292-299`) · `answerCallbackQuery()` 무텍스트 2 | 없음 |
| `multi:` | `multi:{confirm\|cancel}:{txId}` | `expense.ts:515-517` | `expense.ts:652` → `:529` | `pendingMultiExpenses` | `:552` | 버튼 제거 + 본문 교체 | 없음 |
| `vest:` | `vest:{confirm\|cancel}:{rsuId}` | **아웃바운드** `rsu.ts:173` | 텔레그램 `vest-confirm.ts:92` · Discord `discord-interactions.ts:25-46` — 둘 다 `decideVest` | 없음(DB rsuId) | 없음 | `show_alert` / 본문 교체 | **있음** |

- 콜백 핸들러 3 개(`on('callback_query:data')`)는 접두가 아니면 `next()` — 등록 순 trade → expense(tx·multi) → ai(aitrade) → vest(`callbackQuery` 정규식).
- `custom_id` 길이: 가장 긴 `tx:cat:<txId>:<categoryId>` = `tx:cat:` + `Date.now()_6자`(20) + `:` + cuid — Discord 한도 100 안(cuid 길이는 Prisma 기본 · 이번 재지 않음).
- 판단은 전부 핸들러 안에서 `ctx` 와 섞여 있다(`answerCallbackQuery` · `editMessageReplyMarkup` · `editMessageText` 직접 호출) — 분리돼 있는 것은 `decideVest` 하나.

### A4. 자유 텍스트 (M4 · `on('message:text')` 2 개 · 등록 `index.ts:70-71`)

| 순서 | 조건 | 처리 | file:line |
|---|---|---|---|
| expense-1 | `text.startsWith('/')` | `next()` | `expense.ts:673` |
| expense-2 | 첫 단어가 거름 단어 22(`현황·계좌·주가·환율·매수·매도·수입·예산설정·알림설정·전략·전략목록·관심·관심삭제·관심목록·분석·브리핑·순자산·자산목록·자산추가·자산수정·리포트·백테스트`) + 공백/끝 | `next()` | `:677` |
| expense-3 | `^(소비\|예산)\s*$` | `next()` | `:678` |
| expense-4 | 숫자 없음 · `isAiQuestion` · `isTradeMessage` | `next()` | `:681,685,689` |
| **분기 1·2** | 그 밖 | `handleExpenseInput` — 금액 토큰 ≥2 → **AI 복수 파싱**(`multi:` 키보드) · 아니면 **규칙 파서 → 카테고리 → `tx:` 키보드** | `:691-692` · `:72-77` |
| ai-1 | `/` 시작 · 3자 미만 | 무시 | `ai.ts:492-493` |
| **분기 3** | `isTradeMessage` | **AI 거래 파싱**(`aitrade:` 키보드) | `:496-498` |
| **분기 4** | `isAiQuestion`(`?` 또는 질문 키워드 12 · `utils/ai-trigger.ts:9-13`) | **AI 대화** | `:502-504` |
| — | 그 밖 | **무응답** | `:506` |

- 두 핸들러 모두 `/` 시작을 명령으로 보고 건너뛴다 — Discord 의 `!` 접두를 모른다(등록되지 않은 `!foo 3` 은 숫자가 있으면 소비 기록으로 간다 · 정적 판독).
- 다음 텍스트를 붙잡는 대기 상태(fit 편집 pending 같은 것)는 **0** — 다단계는 전부 버튼이 단다.

---

## B. grammY ctx 참조 (M7)

원 결과 19 종 276 건 중 chat `ButtonContext` 6 건(`ctx.notice` 3 · `ctx.edit` 1 · `ctx.action.startsWith` 1 · `ctx.action` 1 — 전부 `discord-interactions.ts`)과 주석 1 건(`utils/telegram.ts:34` "ctx.reply를")을 뺀 grammY 분:

| 종류 | 수 |
|---|---|
| `ctx.reply` | 137(그중 `replyHtml` 안 2 · auth 1) |
| `ctx.answerCallbackQuery` | 42 |
| `ctx.editMessageReplyMarkup` | 21 |
| `ctx.message?.text` · `ctx.message.text` | 17 · 2 |
| `ctx.editMessageText` | 15 |
| `ctx.from?.id` · `ctx.from?.first_name` | 9 · 1 |
| `ctx.callbackQuery?.data` · `ctx.callbackQuery?.message` | 7 · 4 |
| `ctx.replyWithChatAction` | 6 |
| `ctx.chat?.id` | 4 |
| `ctx.match?.toString` · `ctx.match` | 2 · 1 |
| `ctx.replyWithDocument` | 1 |
| **합** | 137+42+21+17+2+15+9+1+7+4+6+4+2+1+1 = **269** |

파일별(원 결과 · Discord 판 포함): expense 70 · ai 52 · trade 37 · strategy 16 · briefing 11 · custom-strategy 11 · price 10 · watchlist 10 · budget 9 · networth 9 · alert 8 · discord-interactions 6 · backtest 5 · report 5 · portfolio 4 · vest-confirm 4 · analysis 3 · utils/telegram 3 · auth 2 · start 1 = 276.
`from "grammy"` import 비테스트 파일 **24**(`src` 전체 · 봇 안 24).

### B2. fin 이 쓰는 텔레그램 능력 ↔ chat (D-2 후 chat `types.ts`)

| fin 능력 | 쓰는 곳 | chat 대응 | 근거 |
|---|---|---|---|
| `reply` plain / `replyHtml`(4096 분할 + HTML 실패 → plain + 네트워크 재시도 2/8/30 s) | 다수 · `utils/telegram.ts:36-50,73-97` | `ctx.reply(string \| {text, format:'html'})` — 2000 분할 · 재시도는 notify 요청 루프 | `types.ts:79` · `rest.ts:142-144` |
| 키보드 붙여 보내기 + 그 메시지 id 로 상태 키 | `trade.ts:258-265` 등 7 | `reply({…, buttons})` → `SentMessage{id, channelId}` — **id = 버튼이 붙은 마지막 조각** | `types.ts:41-50` · `rest.ts:159-175` |
| `answerCallbackQuery({text})` / 무텍스트 · `show_alert` | 42 | `ButtonContext.notice(text)`(본인 전용 · 14 분 넘으면 채널 메시지로) · 무텍스트 ack 는 chat 이 type 6 자동 | `types.ts:91` · `chat.ts:290` |
| `editMessageReplyMarkup(undefined)` | 21 | `ButtonContext.setButtons([])` 또는 `edit` 기본(버튼 제거) | `types.ts:87-89` |
| `editMessageText(text[, {reply_markup}])` · HTML 1 | 15 | `ButtonContext.edit({text, format, buttons})` — **버튼 교체 포함**(L19 의 "교체 없음"은 D-0 가 해소) | `types.ts:87` · `chat.ts:252-259` |
| `callbackQuery.message.{chat.id, message_id}` | 4 | `ButtonContext.channelId` · `messageId` | `types.ts:63-68` |
| `from.id`(number) | 9 | `userId: string` | `types.ts:65` |
| `from.first_name` | `start.ts:58` | **없음**(표시 이름 필드 0) | `types.ts:63-68` |
| `chat.id`(number) | 4 | `channelId: string` | — |
| `replyWithChatAction('typing')` 5 s 주기 | 6 | `MessageContext.typing()`(약 10 s · 버튼 컨텍스트엔 없음) | `types.ts:77` |
| `replyWithDocument(InputFile)` | 1 | `replyFile({name, data: Uint8Array, contentType?, caption?})` | `types.ts:32-38,80` |
| `message.date` | **0** | (`sentAt` 있음 · fin 은 안 씀) | M29 |
| 미디어 수신 | 0 | — | M5 |

---

## C. 상태 맵 (M9)

| # | 상태 | 위치 | 키 | 값의 숫자 필드 | TTL · 청소 | 읽기·쓰기 |
|---|---|---|---|---|---|---|
| 1 | `chatSessions` | `ai.ts:21` | **`number`**(chat id) | — | 24 h(`:25`) · `fireAiQuestion` 때만 지연 청소(`:26-31,56`) | 읽기 `:58` · 쓰기 `:64` · 삭제 `/reset` `:465` |
| 2 | `chatBusy` | `ai.ts:23` | **`number`** | — | `finally` 해제(`:89`) | `:41,46,89` |
| 3 | `pendingAiTrades` | `ai.ts:115` | `string` = `${sent.chat.id}:${sent.message_id}:${tradeId}` | `requestedByUserId: number`(`:107`) | 5 분(`:116`) · 새 pending 때 지연 청소 | 쓰기 `:344-352` · 읽기 `:368-379` |
| 4 | `pendingTrades` | `trade.ts:24` | 같은 꼴(`:264`) | `:9` | 5 분(`:27`) | `:265` · `:281-298` |
| 5 | `pendingTransactions` | `expense.ts:24` | 같은 꼴(`:124,182`) | `:14` | 5 분(`:27`) | `:125,183` · `:207-309` |
| 6 | `pendingMultiExpenses` | `expense.ts:393` | 같은 꼴(`:521`) | `:388` | 5 분(`PENDING_TTL_MS` 공유) | `:522` · `:542-553` |

- 3~6 의 키는 **봇이 보낸 메시지**(chat id + message id)에 묶인다 — 버튼을 누르면 그 메시지 id 로 찾는다. Discord 에서는 `SentMessage.channelId:id` ↔ `ButtonContext.channelId:messageId` 가 같은 짝이다(B2). 텔레그램 chat id 와 Discord 채널 id 가 같은 숫자일 확률은 0 이 아니지만 message id 까지 같아야 충돌한다(판단 아님 · 사실만).
- **본인 확인 값의 기본값이 `0`**(`ctx.from?.id ?? 0` · `ai.ts:346` · `trade.ts:232` · `expense.ts:100,153,523`) — `userId` 가 문자열이 되면 그 기본값도 바뀐다.
- 이 6 개에 의존하는 테스트·스크립트 **0**(`scripts/` = `backup-db.sh` · `restore-db.sh` · `smoke-bot-bundle.mjs`) — fit 의 `verify-food-edit-pending.ts`(68 참조)에 해당하는 것이 없다.
- 상태 맵이 아닌 사용자 식별의 영속: **`Transaction.userId`**(M10) — 소비·수입 확정이 텔레그램 `from.id` 를 문자열로 쓴다. Discord 판이 같은 칸에 snowflake 를 쓰면 한 컬럼에 두 플랫폼 ID 가 섞인다(`src` 에 이 컬럼을 읽는 곳 0 · 웹·MCP 포함).

---

## D. AI · 긴 작업 경로

### D1. fire-and-forget (M11)

| # | 경로 | 진입 | 진행 표시 | 최장 | 끝난 뒤 답 | 상태 |
|---|---|---|---|---|---|---|
| 1 | AI 대화 `fireAiQuestion` | `/ai` · 자유 텍스트 분기 4 | `🤔 생각 중...` + typing 5 s | 기본 timeout 180 s(`claude-advisor.ts:656`) | `splitMessage` → 조각마다 `markdownToTelegramHtml` → HTML 실패 시 원문(`ai.ts:65-73`) | `chatBusy`·`chatSessions` |
| 2 | AI 거래 파싱 `fireTradeParseQuestion` | 자유 텍스트 분기 3 | 안내 + typing | 180 s | `aitrade:` 키보드 | `pendingAiTrades` |
| 3 | AI 복수 소비 `fireMultiExpenseParse` | 분기 1 · `수입 …` | 안내 + typing | 60 s(`expense.ts:431`) | `multi:` 키보드 | `pendingMultiExpenses` |
| 4 | 종목 심층 분석 `fireTickerAnalysis` | `/브리핑 <종목>` | 안내 + typing | **900 s**(`briefing.ts:107`) | 4096 이하면 HTML 1 개 · 넘으면 **plain 분할**(`:111-121`) | — |
| 5 | 세션 브리핑 `sendBriefing(session, chatId)` | `/브리핑`·`한국`·`미국` | 안내 1 줄(typing 없음) | **900 s**(`notifications/briefing.ts:74`) | `notifierForChat` → 텔레그램 transport(M14) | — |
| 6 | 분기 리포트 `generateReportPDF` | `/report` | `replyHtml` 안내 | ai-review 300 s(`lib/report/ai-review.ts:61`) + PDF · 전체 미측정 | `replyWithDocument`(M15) | — |
| 7 | 백테스트 `runBacktest` | `/backtest` | 안내 + typing | 미측정(AI 없음) | `replyHtml` | — |

- 핸들러가 await 하는 AI 는 `커스텀전략등록` 하나(`parseStrategyText` · 60 s · `lib/custom-strategy/parser.ts:146-150`) — 실패 시 **오류 원문 노출**(`custom-strategy.ts:58-61` `${msg}`) · 서비스 유래.
- **chat 대기열과의 관계(사실):** chat 은 같은 채널의 핸들러를 순서대로 await 하고 10 분 감시 시한을 둔다(`chat.ts:158-188` · 기본 `:80`). fin 핸들러는 1~7 에서 진행 안내 뒤 돌아가므로 **대기열은 AI 를 기다리지 않는다** — 뒤 메시지·버튼이 곧바로 처리된다. 답은 `ctx.reply`(= 봇 토큰 `rest.send` · `chat.ts:212`)라 **15 분 인터랙션 토큰과 무관**하다.
- 동시성: 텔레그램에서도 grammY 순차 루프는 이 7 개를 직렬화하지 않았다(핸들러가 먼저 끝난다). AI 대화만 `chatBusy` 로 chat 당 1 건 · 2~7 은 제한 없음.
- fit 과 다른 점: fit AI 는 모듈 전역 락(`apps/fitness/src/bot/commands/ai.ts:18,129-169`)을 await 안에서 잡았다. fin 은 **chat 단위 Set** — 키가 플랫폼별 문자열이 되면 텔레그램·Discord 동시 AI 2 건이 가능해진다(판단 아님).

### D2. `/브리핑` 요청 채널 (M14)

- 텔레그램 의미: "요청한 chat 에만 답한다"(`notifier.ts:203-206` 주석) · 크론 경로(chatId 없음)는 ALLOWED 라우트(스위치 · Discord 웹훅 가능).
- 경로: `commands/briefing.ts:28`(`ctx.chat.id` number) → `:57 sendBriefing(session, chatId)` → `notifications/briefing.ts:54` 삼항 → `notifierForChat(bot, chatId: number)`(`notifier.ts:207-212` · `createTelegramTransport` 고정 · 토큰 없으면 수신자 0).
- 실패 안내도 같은 notifier(`notifications/briefing.ts:90-95` · 본문에 `/ai` 표기).
- 같은 파일의 알림 경로는 `notifyBot()` 싱글턴(`:53`) — 요청 채널로 보낼 Discord 경로는 지금 이 함수에 없다. notify 패키지에는 채널 지정 Discord 봇 transport `createDiscordBotTransport({token, channels})` 가 있고 fin 이 키보드 메시지에 이미 쓴다(`notifier.ts:138`).

### D3. 응답 형식 (M16 · M17 · M18)

- `markdownToTelegramHtml`(`utils/markdown.ts:52-`)은 **`&`·`<`·`>` 를 먼저 escape** 한다 — fit `mdToHtml`(escape 없음)과 다르다. chat `format:'html'` 은 notify `htmlToDiscordMarkdown` 으로 엔티티를 디코드한다(D-2 측정 [S] G).
- plain `ctx.reply` 안에 `escapeHtml(...)` 을 넣은 곳 5(`trade.ts:130,193` · `watchlist.ts:59,91,172`) — 텔레그램에서도 plain 이라 `&amp;` 가 그대로 보인다(서비스 유래 · 사실만).
- `parse_mode:'HTML'` 직접 4: `ai.ts:69` · `briefing.ts:113` · `trade.ts:259`(키보드 메시지) · `trade.ts:345`(버튼 뒤 `editMessageText`).
- 키보드 생성 5: `ai.ts:338` · `expense.ts:46`(카테고리 그리드) · `:109` · `:515` · `trade.ts:247`.

### D4. 카테고리 키보드 행 수 (M19)

`buildCategoryKeyboard`(`expense.ts:42-61`): 2 개마다 `row()` · 홀수면 닫기 · 마지막에 `❌ 취소`(새 행) · 히스토리 추천이면 같은 행에 `📋 전체 카테고리`(`:170-173`).

| 경로 | 카테고리 수 출처 | seed 기준 행 수 |
|---|---|---|
| 단일 매칭 | 고정 버튼 3(2 행) | 2 |
| 키워드 다중 매칭 | `matchCategory` 결과(상한 없음) | 입력에 따라 |
| 히스토리 추천 | ≤ `MAX_HISTORY_SUGGESTIONS` 5(`category-matcher.ts:51`) | ≤ 4 |
| 전체 목록 · `tx:change` · `tx:allcat` | `getAllCategories(type)`(상한 없음 · `:106-116`) | 소비 9 → **6** · 수입 3 → 3 |

chat `toComponents` 는 비지 않은 행 5 를 넘으면 throw(`packages/chat/src/buttons.ts:7,19` — "자르지 않고 던진다"). 운영 DB 의 카테고리 수는 서비스 DB 라 미측정(I-7) — seed(`prisma/seed.ts:293-313` · 소비 9 · 수입 3 · 이체 4)만 확인.

---

## E. HTML · 분할 · 키보드 수 (M16~M18 근거 명령)

```bash
bash -c 'F=$(find src/bot -name "*.ts" -not -path "*__tests__*" | sort)
/usr/bin/grep -o --binary-files=text "replyHtml(ctx" $F | wc -l          # 39 (정의 1 포함 → 호출 38)
/usr/bin/grep -n --binary-files=text "parse_mode" $F                     # 코드 5 줄 (replyHtml 정의 안 1)
/usr/bin/grep -n --binary-files=text -E "new InlineKeyboard|reply_markup" $F'
bash -c 'F=$(find src -name "*.ts" -not -path "*__tests__*" | sort); /usr/bin/grep -o -E "\bh\.(b|i|code|pre)\(" $F | wc -l; /usr/bin/grep -l -E "\bh\.(b|i|code|pre)\(" $F | wc -l'   # 91 · 20
```

---

## F. 인자 파싱 · 명령 표기 (M20 · M21 · M22)

### F1. 원문에서 명령 이름을 벗기는 정규식 (`!` 접두를 모른다)

| 핸들러 | 정규식 | file:line |
|---|---|---|
| alert | `ctx.match?.toString()` ‖ `/^(\/alertconfig\|알림설정)\s*/` | `alert.ts:40` |
| analysis | `/^(\/analysis(?:@\w+)?\|\/분석\|분석)\s*/i` | `analysis.ts:31` |
| backtest | `/^(\/backtest(?:@\w+)?\|백테스트)\s*/i` | `backtest.ts:17` |
| briefing | `/^(\/briefing(?:@\w+)?\|브리핑)\s*/i` | `briefing.ts:26` |
| customstrategy | `/^(\/customstrategy\|커스텀전략등록)\s*/i` | `custom-strategy.ts:33` |
| customstrategydelete | `/^(\/customstrategydelete\|커스텀전략삭제)\s*/i` | `custom-strategy.ts:111` |
| assetadd | `/^(\/assetadd(?:@\w+)?\|자산추가)\s*/i` | `networth.ts:172` |
| assetupdate | `/^(\/assetupdate(?:@\w+)?\|자산수정)\s*/i` | `networth.ts:235` |
| report | `/^(\/report(?:@\w+)?\|리포트)\s*/i` | `report.ts:16` |
| strategy | `/^(\/strategy\|전략)\s*/` | `strategy.ts:46` |
| watch | `/^(\/watch(?:@\w+)?\|관심)(\s\|$)/i` | `watchlist.ts:36` |
| unwatch | `/^(\/unwatch(?:@\w+)?\|관심삭제)\s*/i` | `watchlist.ts:163` |

+ `ctx.match` 2(`ai.ts:445` · `alert.ts:40`) · 한글 전용 정규식 파싱 5(`budget.ts:167` · `portfolio.ts:92` · `price.ts:10` · `trade.ts:76` · `expense.ts:68` 원문 전체). chat `CommandHandler(ctx, args)` 는 인자를 따로 준다(`router.ts:13,85`) · `HearsHandler(ctx, match)`(`:14,92`).

### F2. 사용자 안내문 속 `/` 명령 표기 (M21)

```bash
bash -c 'F=$(find src/bot/commands -name "*.ts" -not -path "*__tests__*" | sort); /usr/bin/grep -n --binary-files=text -E "([\`'"'"'\"( ]|\\\\n)/[a-z가-힣$]" $F | /usr/bin/grep -v -E "replace\(/\^|match\(/|\.test\(|^\S+:[0-9]+:\s*(//|\*|/\*\*)|bot\.(command|hears)|split\(/|new RegExp"'
```
→ 11 줄(M21 열거). 한글 슬래시 표기(`/알림설정` 4 · `/전략` 2)는 텔레그램에서도 봇 명령이 아니다(grammY `command` 는 영어 이름만 · `alert.ts:31` 주석). fit 의 `toDiscordCommandText`(`apps/fitness/src/bot/discord/reply.ts:14-23`)는 영어 이름 11 개만 `!` 로 바꾼다.

### F3. `알림설정` 인자 (M22 · 정적 판독 · 실행 미확인)

hears 경로(`alert.ts:33`)에서 `ctx.match` 는 정규식 일치 배열(캡처 그룹 없음) → `toString()` = 원문 전체(`알림설정 급락 -3`) → `||` 오른쪽 벗기기(`:40`)가 돌지 않는다 → `parts[0] = '알림설정'` → "알 수 없는 항목"(`:79-85`) · `알림설정` 단독은 조회 대신 사용법(`:69-75`). 슬래시 `/alertconfig 급락 -3` 은 grammY command 의 `ctx.match` = 인자 문자열이라 정상. **서비스 유래 결함 후보**(Q57 — 고치지 않는다) · 특성 테스트가 이 경로를 고정하면 결함을 고정한다.

---

## G. DB 쓰기 · 외부 부수효과 (M23 · 로컬 `pleiades_fin` 에서만 실측할 것)

| 경로 | 쓰기 | file:line | 부수효과 |
|---|---|---|---|
| 알림설정 | `alertConfig.update` | `alert.ts:104` | — |
| 예산설정 | `budget.update`/`create` | `budget.ts:188,193` | — |
| 커스텀전략등록 · 삭제 | `customStrategy.create` · `delete` | `custom-strategy.ts:65,136` | 등록은 AI(60 s) |
| 자산추가 · 자산수정 | `asset.create` · `update` | `networth.ts:210,276` | — |
| 전략 | `holdingStrategy.upsert` 6 | `strategy.ts:142,173,189,206,218,234` | — |
| 관심 · 관심삭제 | `watchlist.upsert` 3 · `delete` | `watchlist.ts:106,122,135,176` | 시세 조회(yahoo · `:145`) |
| 매수·매도 확정 · AI 거래 확정 | `createTrade` | `trade.ts:319` · `ai.ts:400` | — |
| 소비·수입 확정 · 복수 확정 | `transaction.create` · `$transaction` | `expense.ts:327,581-593` | **Whooing 웹훅**(`:339,598` — DB `WhooingConfig` 또는 env `WHOOING_WEBHOOK_URL` 이 있을 때만 · `lib/whooing-webhook.ts:27-32`) · **예산 경보**(`checkBudgetUsage` `:364,618` → 아웃바운드 ALLOWED 라우트 1 개) |
| RSU 확정 | `processRsuVest` | `vest-confirm.ts:71` | (이미 Discord 판 있음) |

- 즉시 쓰기 명령 9 · 확정 뒤 쓰기 명령 3(매수 · 매도 · `수입 …`) + 자유 텍스트 2(소비 · AI 거래) — [F] L8 "12 / 32" 와 같다.
- C-4(아웃바운드 이중 발송 금지) 관점: 인바운드가 부르는 아웃바운드는 `checkBudgetUsage` 2 곳(라우트 하나) · `sendBriefing`(D2) · advisor 실패 ADMIN 알림(`advisor-monitor.ts:293-295`) — 인바운드 핸들러가 직접 두 플랫폼으로 보내는 경로 0.

---

## H. fin Discord 현재 배선 · 설정 · 배포 (M24~M26)

| 항목 | 값 | file:line |
|---|---|---|
| 진입 | `startDiscordInteractions(notifyBot)` — 크론·스케줄러 뒤 · 텔레그램 폴링 앞 | `standalone.ts:48` |
| 설정 | `discordBotConfig()` — `DISCORD_BOT_TOKEN_FINANCE` · `DISCORD_CHANNEL_ID_FINANCE` · `DISCORD_ALLOWED_USER_IDS`(platformEnv · 부를 때마다) · `ready = 토큰 && 채널 ID 형식` | `notifier.ts:160-168` |
| chat 옵션 | `intents: 0` · `router: discordRouter` · `allowedUserIds` 함수 · `allowedChannelIds: () => [channelId]` · `identifyGuard`(`logs/identify-fin.json`) — **`messageChannelIds`·`fallbackIntents`·`onIntentsFallback` 없음** | `discord-interactions.ts:64-83` |
| 라우터 | `createRouter().action(/^/, handleDiscordButton)` — 메시지 라우트 0 · `commandPrefix` 미지정 | `:49` |
| 미설정 로그(스위치 판정 문자열) | `[discord-fin] 봇 토큰·채널 미설정 — …` · `[discord-fin] DISCORD_ALLOWED_USER_IDS 비어 있음 — …` | `:58,62` |
| IDENTIFY 차단 알림 | `notifierFor(notifyBot).notify(Route.ADMIN, …)` — fin 은 ADMIN 을 매핑한다(fit 은 ALLOWED 만) | `:78` |
| 대화 채널 키 | **없음** — fit 은 `DISCORD_CHAT_CHANNEL_KEY = "DISCORD_CHANNEL_ID_FITNESS_CHAT"`(`apps/fitness/src/bot/notifications/notifier.ts:127`) | `git grep -n -E "FINANCE_CHAT\|FITNESS_CHAT" HEAD -- deploy tools packages apps .env.example` → fit·deploy 만 |
| 루트 `.env.example` | fit 대화 채널 주석 키 1(`:31-33` · "알림 채널과 같은 값이어도 된다") · fin 키 0 | `.env.example:24-33` |
| 키 이름 기계 규칙 | `DISCORD_CHANNEL_ID_FINANCE_CHAT` 는 `PLATFORM_KEY_RE`(`DISCORD_CHANNEL_ID_*`) 안 · `check_env.py:37` `CHAT_IDS?$\|CHAT_ID_` 불일치 · 셸 정리 접두 `DISCORD_` 안 | `packages/notify/src/platform-env.ts:27` · `tools/local/check_env.py:37,43-46` |
| 4014 강등 로그 | chat 이 `[${label}] MESSAGE CONTENT 미허용(4014) — intents ${n} 로 낮춰 …` 을 찍는다 — fin 도 `fallbackIntents` 를 주면 `[discord-fin] …` 로 자동 | `packages/chat/src/gateway.ts:278` |
| 켜짐/꺼짐 로그 | fit 앱 상수만(`INBOUND_ON_LOG`·`INBOUND_OFF_LOG`) — fin 판 없음 | `apps/fitness/src/bot/notifications/discord-interactions.ts:47-48` |

**`deploy/discord-inbound.sh`·`.cjs` 의 fit 고정 · fin 거부(M25):**

| 파일:줄 | 내용 |
|---|---|
| `discord-inbound.sh:4-7` | 사용법 주석 — `fit on/off` · "fin 은 아직이다(D-3)" · 키 이름 FITNESS |
| `:15-17` | `KEY=DISCORD_CHANNEL_ID_FITNESS_CHAT` · `BOT=pleiades-fit-bot` · `LABEL=discord-fit` — 판정 문자열(`:20-24`)·로그 파일(`:70,74`)·pm2 env 대조(`:94`)·재시작(`:104`)이 이 셋을 쓴다 |
| `:174` | `[[ "$app" == fit ]] \|\| { [[ "$app" == fin ]] && stop 2 "fin 은 아직이다(009 D-3)"; usage; }` |
| `:241` | 되돌리기 안내 `deploy/discord-inbound.sh fit off` |
| `discord-inbound.cjs:13` | `KEYS = new Set(['DISCORD_CHANNEL_ID_FITNESS_CHAT'])` — 이 밖의 키는 쓰지 않는다 |
| `test_discord_inbound.py:244-247` | `test_fin_and_usage_are_refused` |
| `test_discord_inbound.py:25,37-39,50-68` | 키 · 판정 문자열 · 스텁 pm2 목록이 fit 고정 |

`deploy/discord-switch.sh` 는 이미 두 봇을 재시작·판정한다(`test_discord_switch.py:185,193` "fin 봇 gateway 준비 1 · 종료 코드 0 · 미설정 0") — fin 미설정 2 문구(`discord-interactions.ts:58,62`)가 그 판정 문자열이다.

---

## I. 테스트 표면 (M27 · M28 · M30)

명령: 파일마다 `/usr/bin/grep -cE --binary-files=text '^\s*(it|test)(\.each\([^)]*\))?\('`(정적 · 실행 0 · `it.each` 는 1).

| 파일(`apps/finance/src/bot/`) | 건수 | 무엇 |
|---|---|---|
| `__tests__/telegram-polling.test.ts` | 12 | D-1 폴링 |
| `commands/__tests__/price-format.test.ts` | 14 | 시세 서식(순수) |
| `commands/__tests__/vest-confirm.test.ts` | 10 | `decideVest` 7 + 텔레그램 핸들러 보존 3 |
| `notifications/__tests__/active-review.test.ts` | 6 | |
| `notifications/__tests__/alert-dispatcher.test.ts` | 27 | |
| `notifications/__tests__/alert-history.test.ts` | 15 | |
| `notifications/__tests__/custom-strategy-alert-format.test.ts` | 4 | |
| `notifications/__tests__/discord-interactions.test.ts` | 8 | 버튼 6 + 기동 2(`:112` `intents` 0 단언) |
| `notifications/__tests__/notifier.test.ts` | 17 | (`:230` `notifierForChat` 토큰 없음 = 0) |
| `notifications/__tests__/price-alert-watchlist.test.ts` | 5 | |
| `notifications/__tests__/scheduler.test.ts` | 7 | |
| `notifications/__tests__/ta-signal-alert.test.ts` | 7 | |
| `utils/__tests__/trade-price-check.test.ts` | 9 | |
| **fin 봇 소계** | **13 파일 · 12+14+10+6+27+15+4+8+17+5+7+7+9 = 141** | |
| `packages/chat/src/*.test.ts` | chat-d2 22 · chat 18 · contract 4 · identify-guard 11 · rest 16 · units 18 = **89** | |

- fin `src` 전체 `__tests__` 파일 65(`find src -path '*__tests__*' -name '*.ts' \| wc -l`) 중 봇 13.
- **명령 핸들러(`commands/*.ts` 17 중) 판단 테스트가 있는 것: `vest-confirm` 하나.** `ai`·`expense`·`trade` 의 콜백 4 종 · 자유 텍스트 2 핸들러 · 인자 파싱 12 · `handleExpenseInput` 카테고리 분기 · `briefing` 세션 선택(`:47-55`) · `report` 기본 분기(`:34-44`) 테스트 **0**. 트리거 유틸(`utils/ai-trigger.ts` · `trade-trigger.ts`) · `lib/expense-parser` · `lib/category-matcher` 테스트 **0**(`lib/custom-strategy/__tests__/parser.test.ts` 는 있다).

**특성 테스트가 필요한 판단 지점(열거 · 위치만):**

| # | 지점 | file:line |
|---|---|---|
| T1 | expense fallback 거름 7 조건 순서 | `expense.ts:670-690` |
| T2 | 금액 토큰 수 → 복수 AI / 규칙 파서 | `expense.ts:70-83` |
| T3 | 카테고리 경로 4(단일 · 다중 · 히스토리 · 전체) + 키보드 모양 | `expense.ts:89-183` |
| T4 | `tx:` 5 동작 + 만료 · 본인 확인 · 중복 클릭 | `expense.ts:194-313` |
| T5 | `multi:` 확정·취소 · 카테고리 없는 항목 제외 | `expense.ts:529-629` |
| T6 | 매수·매도 인자 파싱 · 검증 6 · 종목 해석 3 단계 | `trade.ts:73-266` |
| T7 | `trade:` 콜백(본인 · 만료 · 비즈니스 오류 노출 3 종) | `trade.ts:268-362` |
| T8 | AI 거래 응답 JSON 해석 · 검증 · 종목 해석 | `ai.ts:165-353` |
| T9 | `aitrade:` 콜백 | `ai.ts:355-437` |
| T10 | AI fallback 분기(길이 · 거래 · 질문 · 무응답) | `ai.ts:489-506` |
| T11 | 인자 벗기기 12(F1) · `알림설정`(F3) | F1 |
| T12 | `/브리핑` 인자 → 세션/종목 · 시각 기본값 | `briefing.ts:25-59` |

---

## J. 시간 (M29)

- 인바운드 **시간대 가드 0** — `scheduler.ts:140` 15:35 RSU 확정은 아웃바운드 크론의 수신자 가드(`scheduleInteractive` `:51`)이고 시각 조건이 아니다. RSU 버튼은 언제 눌러도 `decideVest` 가 최신 미리보기를 다시 읽는다(`vest-confirm.ts:57`).
- 메시지 시각(`message.date`) 사용 **0**(`/usr/bin/grep -rn -E "ctx\.message\.date|message\?\.date" src/bot` → 0).
- 처리 시각 의존 12 줄 / 8 파일: `ai.ts:410` · `backtest.ts:60,61` · `briefing.ts:52`(KST 6~15 시 → KR) · `:67` · `budget.ts:8` · `expense.ts:333,403,466` · `networth.ts:76` · `report.ts:36` · `trade.ts:329`. 거래 시각(`tradedAt`·`transactedAt`)은 **버튼 확정 시각**이다(메시지 시각 아님 · 텔레그램과 같다).

---

## D-2(fit) 대비 fin 이 다른 곳 — 사실만

| # | fit(D-2) | fin | 근거 |
|---|---|---|---|
| 1 | 명령 11 · 전부 영어 이름 → `!` 접두로 해결 | 영어 21(그중 슬래시만 4) + **한글 `hears` 28**(정확 일치 10) | A1 · A2 |
| 2 | 핸들러가 `args` 를 받게 판단 분리 | 영어 이름 12 핸들러가 원문을 `/` 정규식으로 벗긴다 | F1 |
| 3 | AI await · 전역 락 → chat 대기열·감시 시한이 의미 있음 | AI·긴 작업 7 이 fire-and-forget · chat 단위 `chatBusy` | D1 |
| 4 | 다음 텍스트를 먹는 편집 pending(TTL 경합) | 텍스트 대기 상태 0 · pending 4 은 봇 메시지 id 키(이미 문자열) | C |
| 5 | 버튼 결과 = 버튼 제거 + 새 메시지 | **본문 교체 15 · 키보드 교체 2**(`tx:change`·`allcat`) · 카테고리 키보드가 행 5 를 넘을 수 있다 | A3 · D4 |
| 6 | 사진 수신(첨부 정책) | 미디어 수신 0 · **파일 송신** 1(`/report` PDF) | M5 · M15 |
| 7 | lib 에 `bot` 을 넘겨야 alert 가 산다 | lib 가 `notifyBot()` 을 스스로 부른다 | M31 |
| 8 | 상태 키 의존 검증 스크립트(68 참조) | 의존 테스트·스크립트 0 · 대신 **DB 컬럼 `Transaction.userId`** 에 사용자 ID 를 쓴다 | C · M10 |
| 9 | 텔레그램 고정 아웃바운드 0 | `/브리핑` 세션 = `notifierForChat` 텔레그램 고정 1 | D2 |
| 10 | IDENTIFY·강등 알림 `Route.ALLOWED`(fit 은 ADMIN 미매핑) | `Route.ADMIN` 매핑 있음(`discord-interactions.ts:78`) | H |

---

## 이전 측정과 바뀐 값

| 항목 | 이전 | 이번 | 판정 |
|---|---|---|---|
| [F] §1 등록 21/28/5/1 · 논리 32 · 콜백 5 · Discord 판 1 | 같음 | M1·M2·M6 | **같다** |
| [F] §5 ctx 269 · `replyHtml(ctx` 38 · parse_mode 5 · `h.*` 91/20 · grammy import 24 | 같음 | M7 · M16 | **같다**(원 결과 276 = 269 + chat 6 + 주석 1 · [F] 의 `ctx.api` 0 도 같다) |
| [F] §7 `utils/telegram` import 25 파일 | 25 | **24**(`grep -l -E "utils/telegram" $F` · `src` 전체 비테스트) | 다르다 — [F] 명령이 남아 있지 않아 차이 원인 미확인 |
| [F] §2 expense 거름 "명령어 단어 21종" | 21 | **22**(A4 열거) | 열거로 정정 |
| [F] §8 · 정본 L20 "DB 텔레그램 식별자 컬럼 0" | 0 | **`Transaction.userId` 1**(쓰기 2 · 읽기 0) | [F] 검색어(`chat\|telegram\|message_id\|…`)가 `userId` 를 못 잡았다 — 정정 |
| [F] §6 `bot.catch` 위치 | `standalone.ts:43` | `telegram-polling.ts:116` `b.catch` | D-1 이 옮겼다 |
| [F] §8 · [F1] §2 `getBot()` 알림 경로 | `getBot()` 17 줄 | `notifyBot()` 16 줄 + advisor 1 · `getBot` 은 `standalone.ts:45,58,60` · `index.ts:92` 만 | D-1 이 바꿨다 |
| [F] §3 "패키지 gateway 버튼만 · 버튼 교체 없음(L19)" | notify gateway | **chat**(D-1) · `edit({buttons})` 로 교체 가능 · 메시지 수신·`messageChannelIds`·`fallbackIntents`·`commandPrefix`·채널 대기열 있음(D-2 PR-1) — fin 은 아직 하나도 안 쓴다 | D-0·D-1·D-2 가 바꿨다 |
| [F1] §5 `discord-interactions.ts` 줄 | `:17-38` 버튼 · `:44,48` 미설정 · `:50-57` gateway | `:25-46` · `:58,62` · `:64-84` | 줄 번호 갱신(D-1) |
| fin 봇 테스트 | 미측정 | 13 파일 · 141 | 새 값 |
| chat 테스트 | 5 파일 · 64(D-2 측정 M30) | 6 파일 · 89 | D-2 가 늘렸다 |

---

## 측정 못 한 것

- **운영 카테고리 수**(소비·수입) — 서비스 DB(I-7). seed 만 확인(D4).
- **분기 리포트 PDF 크기** — 생성 실행 금지. chat 송신 상한 10 MiB 와의 관계 미측정.
- **`알림설정` 한글 경로의 실제 동작**(F3) — 정적 판독만 · 실행 금지.
- **Discord `typing` 엔드포인트를 5 s 주기로 부를 때의 레이트 리밋** — 네트워크 금지.
- **cuid 길이 · `custom_id` 최장 실측** — Prisma 기본값 확인 안 함(100 자 안이라는 추정을 쓰지 않는다 — 계산 근거는 A3 의 구성뿐).
- **gateway 끊김 동안 온 메시지의 재전달 여부**(재시작·RESUME 경계) — 외부 플랫폼 동작.
- 테스트 건수의 실행 확인 — 정적 grep 개수.
- 추적 안 된 `deploy/telegram-polling.*` 3 파일 — 이 측정 범위 밖이라 읽지 않았다.
