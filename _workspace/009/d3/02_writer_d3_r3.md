# 009 D-3 설계 — fin Discord 병행 수신 (초안 3회차 · 최종)

작성 2026-10-29 · 상태 **초안 3회차 · 최종(재감사 정정 0 · 경미 4 문안 반영 — 재감사 없이 사용자 질문으로)** · **사용자 답 2026-10-29: UQ-1~UQ-5 전부 권고안**(정본 §6 D-3 정정 블록)(정본 아님 — 정본은 `docs/specs/009-discord-only.md` §6 D-3 행) · 이슈 #377
**계보:** 측정 `01_surveyor_fin.md` → 1회차 `02_writer_d3.md`(그대로 둔다) → 감사 `03_auditor_d3.md`(**[A]** · 정정 4 · 경미 9 · 확인 10 · 블로커 0) → 2회차 `02_writer_d3_r2.md`(그대로 둔다) → 재감사 `03_auditor_d3_r2.md`(**[A2]** · 정정 0 · 경미 4 · 확인 7) → **이 3회차**(경미 4 문안만 · 권고 무변경). 반영 내역은 끝의 §12 · §12-2 정정 블록.
**[A] 표기:** 판정 번호 `[A]#n` · 확인 `[A]C*` · 재감사 `[A2]#n` · `[A2]C*`. D-2 감사는 아래처럼 **[D2A]** 로 구분한다.
**근거 표기:** **[S]** `_workspace/009/d3/01_surveyor_fin.md`(대장 `M*` · 절 `A`~`J` · 끝의 "D-2(fit) 대비" 표는 `[S]Δ#n`) · **[009]** 정본(대장 `L*` · 요구사항 `2-*`/`3-*` · 위험 `R*` · 확정 `C-*`) · **[D2]** D-2 설계 최종본 `_workspace/009/d2/02_writer_d2_r3.md`(항목 `R3`·`Q3`·`Ka3`·`Kb1`·`F1`·`H2` 등) · **[D2A]** D-2 감사 `03_auditor_d2.md`·`_r2.md`(`[A]#n`·`[A2]#n`) · **[H]** 인계 `docs/handoff/2026-10-28-d2-fit-discord-inbound.md` · **[L]** D-2 로컬 실측 `05_live_chat.md`·`06_live_fit.md` · **[W]** 작성자가 직접 읽은 소스 줄(측정 파일에 없음 — §3-2).
**숫자 규율:** 숫자는 측정·정본·감사 인용만이고 처음 나올 때 §3 대장 번호(`N*`)를 받는다. 본문은 번호로만 참조한다. 소요는 되돌리기 등급으로 갈음한다(시간 기록 없음). 미측정은 §3-3 의 `X-*` 로 두고 추정으로 메우지 않는다.
**D-2 감사에서 지적된 유형을 피하려고 이 초안이 지킨 것:** 라우트 매핑을 코드로 확인한 뒤 알림 라우트를 적는다([D2A] [A]#2 — fin 은 ADMIN 매핑이 있다 N23 · [A]C5 확인) · 코드 옵션의 "즉시"는 "(릴리즈 전)"으로 한정한다([D2A] [A]#8) · 대기열 주장에는 넣는 지점·실패 전파·인터랙션 토큰 시한을 같이 적는다([D2A] [A]#3 · [A2]#1·#2) · 정본의 예상과 다른 해석은 수단이 아니라 UQ 로 올린다([D2A] [A]#4) · 합계 대신 열거를 인용한다([D2A] [A]#9).
**이번 감사가 더한 규율(2회차):** "텔레그램 무변경" 은 **그 PR 이 바꾸는 모든 지점**에 특성 테스트가 있을 때만 쓴다([A]#2) · 같은 파일을 두 PR 이 고치면 "독립" 이라 적지 않는다([A]#1) · 정책 동일 주장은 transport 코드를 읽고 쓴다([A]#3) · UQ 전제에 다른 경로의 현재 동작을 함께 적는다([A]#4).

---

## 0. 한 줄 요약

**D-3 은 D-2 의 판박이가 아니다 — fin 은 chat 확장이 필요 없는 대신, 앱 쪽에서 풀 것이 세 배다.**
fit 과 갈리는 곳(측정 [S]Δ 표): ① 한글 명령 28 이 전부 정규식이고 그중 10 은 정확 일치라 chat `command` 로 옮기면 `현황 어때?` 가 명령이 된다(N3) — **chat `hears` 로 정규식을 그대로 받는다** ② 영어 이름 명령 12 개가 원문에서 `/` 정규식으로 이름을 벗겨 `!` 를 모른다(N19) — **인자를 어댑터가 벗겨 판단 함수에 넘긴다** ③ 버튼이 본문·키보드를 바꾸고 카테고리 키보드가 chat 행 한도를 넘을 수 있다(N17 · N18) — **Discord 어댑터가 행을 다시 채운다** ④ AI·긴 작업 7 이 fire-and-forget 이라 채널 대기열이 AI 를 기다리지 않는다(N10) — **D-2 의 대기열 근거(TTL 경합)는 fin 에 없고, 동시성은 앱의 chat 단위 `chatBusy` 가 그대로 맡는다** ⑤ **운영 DB 에 텔레그램 사용자 ID 를 쓰는 컬럼이 있다**(N9 · 정본 L20 "fin 0" 정정) ⑥ `/브리핑` 세션 응답은 텔레그램 고정 notifier 하나뿐이다(N13).
켜고 끄는 수단은 D-2 와 같은 **선택 키 하나**(`DISCORD_CHANNEL_ID_FINANCE_CHAT` · 대화 채널 = 알림 채널 C-7 정정) — 비면 D-1 동작(intents 0 · 버튼만)이라 릴리즈 자체는 서버 조치가 없다(D-2 정정 블록 승계 · UQ-5).
권고 순서 **(2회차 정정 · [A]#1 — 병행 아님 · 순차)** **PR-1a 판단 분리 — 소비·거래(`expense.ts`·`trade.ts` · 응답 모델·상태 키 함수 신설) → PR-1b 판단 분리 — AI(`ai.ts` 전체) → PR-2 판단 분리 — 나머지 명령·인자·`/브리핑`·`/report` → PR-3 fin Discord 수신 + `discord-inbound.sh` fin 확장 → D-3 릴리즈(minor · 일반 Release) → 켜기(사용자 · 서버)**. PR-1a~PR-2 는 텔레그램 동작 무변경(특성 테스트 먼저). **chat 변경 0 이 권고**다(§4 C · [A]C1 확인).

---

## 1. 무엇이 바뀌었나 (정본 §4-1 · §6 D-3 행 대비 — 측정이 더한 것)

| # | 정본의 전제 | 측정·직접 확인이 보탠 사실 | 그래서 D-3 범위가 |
|---|---|---|---|
| **Δ1** | §4-1 "슬래시만 명령 4 → 같은 텍스트 또는 접두 없는 한글" | Discord 입력창은 `/…` 를 가로챈다([L] X-1) → fit 은 `!` 로 갔다(009 §2 정정 · UQ-3). 슬래시만 4(`start·help·ai·reset`)는 한글 이름이 없어 **접두 없이는 부를 길이 없다**(N2) | 영어 이름 21 = `!` 명령 — 항목 **P** |
| **Δ2** | §4-1 "한글 hears 28 → 기존 정규식 그대로" | 성립한다 — chat `hears` 는 등록 순 첫 일치로 정규식을 그대로 받는다(W1). 단 **정확 일치 10** 을 chat `command(…, {prefix:'optional'})` 로 옮기면 첫 단어 매칭이라 자연어까지 명령이 된다(N3) — D-2 R3 의 `optional` 은 fin 에서 쓰면 안 된다 | 한글 = `hears` 그대로 — 항목 **P** |
| **Δ3** | (없음) | 영어 이름 명령 12 의 핸들러가 원문을 `/^(\/report(?:@\w+)?\|리포트)\s*/` 식으로 벗긴다(N19) — `!report 2026 1` 은 인자가 `!report 2026 1` 이 된다 · 자유 텍스트 두 핸들러도 `/` 시작만 명령으로 본다(N4) | 인자 추출을 어댑터로 — 항목 **A** |
| **Δ4** | §4-1 "콜백 `tx:` → 버튼 + 버튼 교체(L19) · 많으면 select(L17)" | 버튼 교체는 D-0 이 해소(chat `ButtonContext.edit({buttons})` · W3) · **select 는 chat 에 없다**(L17 그대로) · 카테고리 키보드 행 = ⌈n/2⌉+1 로 seed 기준 6 행 > chat 한도 5 → `toComponents` 가 throw(N18 · W4) | 행 재배치 — 항목 **B** |
| **Δ5** | §4-1 "AI typing · 4096 분할 → 채널 메시지 + typing" | fin AI·긴 작업 7 은 fire-and-forget(N10) — **chat 채널 대기열은 진행 안내까지만 기다린다**(W2) · 동시성은 chat 단위 `chatBusy`(N11) — 키가 플랫폼별이 되면 텔레그램·Discord 동시 AI 2 가 가능해진다 | 동시성 — 항목 **Q** · UQ-4 |
| **Δ6** | §4-1 "상태 키 · 본인 확인 number → 문자열(R4)" · **L20 "fin DB 텔레그램 식별자 컬럼 0"** | pending 4 은 **이미 문자열 키**(봇 메시지 id 에 묶임) · number 키 2 · 본인 확인 `requestedByUserId: number` 4(N8) · **`Transaction.userId` 에 `String(from.id)` 를 쓴다**(N9 — L20 정정 대상) | 식별자 — 항목 **S** · UQ-2 |
| **Δ7** | §4-1 "`/브리핑` 세션(L11) → 요청 채널로 응답" | 경로가 `notifierForChat(bot, chatId: number)` = 텔레그램 transport 고정 하나(N13) — Discord 요청 채널로 보낼 경로가 이 함수에 없다 | 응답 대상 주입 — 항목 **D** |
| **Δ8** | §4-1 "`/report` 파일 답장 → 봇 경로 파일 전송(L17 → D-0)" | chat `replyFile` 이 있다(상한 10 MiB · N14) · **PDF 크기 미측정**(X-3) | 크기 초과 처리만 — 항목 **D** |
| **Δ9** | §4-1 "`/start` 의 `first_name` → 표시 이름" | chat 컨텍스트에 표시 이름 필드가 없다(N7 · W3) | chat 확장 또는 생략 — 항목 **C** |
| **Δ10** | §6 D-3 "3-2~3-4 = D-2 와 같다" | fin Discord 배선은 D-1 그대로(intents 0 · 메시지 채널 없음 · 라우터 `action(/^/)` 하나 · N23) · 켜기 스크립트가 fin 을 거부한다(N24) · **fin 은 ADMIN 라우트를 매핑한다**(N23 — fit 과 다름) | 배선·스크립트 확장 — 항목 **K** · **F** |
| **Δ11** | §6 D-3 "콜백 4종 판단 분리" | 판단 테스트가 있는 명령은 `vest-confirm` 하나 · 트리거·파서·카테고리 매처 테스트 0(N25 · N26) — 특성 테스트 지점 T1~T12([S] I) + 판단 분리가 바꾸는 상태·응답 경로 T13~T16([A]#2) · **소비·거래·AI 3 파일이 ctx 참조 159/269**(N6a) | PR 을 셋으로(순차) — §5 |
| **Δ12** | (없음) | 서비스 유래 결함 후보가 판단 분리 대상 경로 안에 있다 — `알림설정` 한글 인자(N21 · 정적 판독) · 커스텀전략 오류 원문 노출 · plain 응답 속 `escapeHtml` 5(`&amp;` 가 그대로 보인다)([S] D1·D3) | 특성 테스트가 결함을 고정할 수 있다 — UQ-3 |
| **Δ13** | (없음) | 로컬 advisor 차단(I-8)과 Whooing 비움 — AI 대화·AI 거래·복수 소비 파싱·브리핑·리포트 ai-review 의 **성공 경로는 로컬에서 못 본다** | 로컬은 오류 경로까지 · 성공은 서버 병행 실사용(C-11) — §8 |

---

## 2. 확정된 것 (이 초안이 바꾸지 않는다)

| | 내용 | 근거 |
|---|---|---|
| 요구사항 | 3-1(fin §4-1 전 행 · 콜백 4종 판단 분리 · 상태 맵 6 키 문자열화 · `/브리핑` 요청 채널 · `/report` 파일) · 3-2~3-4 = D-2 의 2-2~2-4 · DB 쓰기 명령(L8)은 로컬 DB 에서만 | [009] §6 D-3 |
| 수단 결정 권한 | 수단은 설계 PR 이 실측 뒤 정한다 — 요구사항을 바꿀 때만 사용자 | [009] §9-2 |
| 수신 방식 · 채널 | 일반 메시지 · **대화 채널 = 알림 채널(fin 포함)** · 키는 스위치를 겸해 남긴다 · 명령 접두 `!` | C-6 · C-7 정정 · UQ-3([009] §2 정정 블록) |
| 병행 | 수신만 병행 · 아웃바운드 이중 발송 금지 · 텔레그램에서 받은 명령의 답은 텔레그램 | C-4 |
| 종료 | 병행 종료 = 전 기능 1회 + 3일(D-3′ 는 이 설계 밖) · 시계는 켜기 판정 통과 시각부터 | C-11 · [009] §6 D-2 정정 |
| D-2 결과(쓸 수 있는 것) | chat: 접두 옵션 `createRouter({commandPrefix})` · 명령 접두 필수 기본 · `hears` · 채널 대기열(자리 동기 예약 · ack 즉시 · 감시 시한 10 분 · 14 분 넘은 버튼은 봇 토큰 경로) · ⏳ 대기 안내 · `messageChannelIds` · 4014 `fallbackIntents` · `typing`·`sentAt`·`SentMessage.delete` · `splitCommand` 공개 / fit: 판단 분리 형태(`core/reply.ts`·`core/state-key.ts`) · `deploy/discord-inbound.sh` | [H] · W1~W4 · W10~W12 |
| R-8 하한 | `v1.2.0`(그 아래는 텔레그램 없이 뜨지 못한다 — D-1) · fin 에 중요한 사실은 "`v1.3.0` 이하 fin 은 대화 채널 키를 모른다"(§5 끝) | [H] 주의사항 · [A]#12 정정 |
| 버전 기준 | major = 서버와의 약속이 깨짐 · minor = 기능·마이그레이션 · "서버 조치" 칸 필수 · 마이그레이션이면 `--prerelease`(배포 경로 미정 007 Q74) | `workflow.md` #199 · #242 |
| `apps/*` | 서비스 유래 결함은 고치지 않는다(Q57) — **단 pleiades 가 서비스한 뒤 사용자 결정으로 고친 선례가 있다**(`/today` 깨진 문구 · [H]) → 이 설계는 결함마다 UQ-3 으로 묻는다 | isolation 파생 · [H] |

---

## 3. 실측 근거

### 3-1. 대장

| # | 항목 | 값 | 출처 |
|---|---|---|---|
| **N1** | grammY 등록 `command`/`hears`/`on`/`callbackQuery` | 21 / 28 / 5 / 1 | M1 |
| **N2** | 논리 명령 | 32(슬래시만 4 · 한글만 11 · 둘 다 17) | M2 |
| **N3** | 한글 정규식 형태 | 28 = 인자 선택 15 + 부정 전방탐색 1 + **정확 일치 10** + `^계좌(\s+.+)?$` 1 + `^수입\s+.+$` 1 | M3 · [S] A2 |
| **N4** | 자유 텍스트 | 2 핸들러 → 4 분기 + 무응답 · 거름 단어 22 · 두 핸들러 모두 `/` 시작을 명령으로 본다 | M4 · [S] A4 |
| **N5** | 콜백 | 접두 5 · 등록 4 · Discord 판 1(`vest:`) | M6 |
| **N6** | grammY ctx 참조 | 269 | M7 |
| **N6a** | 그중 PR-1 대상 3 파일 | expense 70 + ai 52 + trade 37 = **159** · 나머지 110 | [S] B 파일별 표 · [A]#1 |
| **N7** | fin 이 쓰는데 chat 에 없는 능력 | 표시 이름 1(`start.ts:58`) | M8 |
| **N8** | 상태 맵 | 6(number 키 2 · 문자열 키 4) · `requestedByUserId: number` 4 · 의존 테스트·스크립트 0 · 본인 확인 기본값 `?? 0` 5 곳 | M9 · [S] C |
| **N9** | DB 의 텔레그램 식별자 | `Transaction.userId String?`(`@@index([userId])`) ← `String(requestedByUserId)` 쓰기 2 · 읽기 0(웹·MCP 포함) | M10 · [S] C · W5 |
| **N10** | fire-and-forget | 7(AI 5 · 리포트 PDF 1 · 백테스트 1) · 핸들러가 await 하는 AI 1(커스텀전략 파싱 60 s) | M11 · [S] D1 |
| **N11** | AI 대화 상태 | 세션 `Map<number,…>`(24 h) · 동시 1건 `Set<number>` chat 단위 · 전역 락 없음 | M12 |
| **N12** | 긴 AI | `overallTimeoutMs` 900 s 2(= L25) | M13 |
| **N13** | `/브리핑` 요청 채널 응답 | `notifierForChat(bot, chatId: number)` 텔레그램 고정 · 명령 호출 1 · 크론 2(chatId 없음) · 실패 안내에 `/ai` 표기 | M14 · [S] D2 |
| **N14** | 파일 송신 | `replyWithDocument` 1 · chat `replyFile` 상한 10 MiB | M15 |
| **N15** | HTML · 분할 | `replyHtml(ctx` 38 · `parse_mode` 직접 4 · `splitMessage(…,4096)` 3 + 하드코딩 1 · `markdownToTelegramHtml` 은 `&<>` escape 있음 | M16 · M17 · [S] D3 |
| **N16** | 키보드 | `new InlineKeyboard` 명령 5 · 부착 7 · 버튼 제거 21 | M18 |
| **N17** | 버튼 결과 형태 | **본문 교체 15(그중 키보드 함께 교체 2 — `tx:change`·`tx:allcat`)** · 버튼 제거 21 · `answerCallbackQuery` 42 · `tx:cancel` 은 버튼 제거 → 본문 교체 **두 호출**(`expense.ts:231-233`) | [S]Δ#5 · [S] B · [A]#13 · [A]#2 |
| **N18** | 카테고리 키보드 행 | ⌈n/2⌉+1 · seed 소비 9 → 6 행 · 수입 3 → 3 · 히스토리 ≤4 · chat 한도 행 5(넘으면 throw) | M19 |
| **N19** | 원문 인자 벗기기 | 정규식 12 + `ctx.match` 2 | M20 · [S] F1 |
| **N20** | 안내문 속 `/` 표기 | 명령 파일 11 줄 + 세션 브리핑 실패 안내 1 · 그중 한글 슬래시(`/알림설정` 4 · `/전략` 2)는 텔레그램에서도 명령 아님 | M21 · [S] F2 |
| **N21** | `알림설정` 한글 경로 | 정적 판독상 인자를 못 읽는다 · **실행 미확인** | M22 · [S] F3 |
| **N22** | DB 쓰기 인바운드 | 즉시 9 · 확정 뒤 3 명령 + 자유 텍스트 2 · vest 1 · Whooing 2 · 예산 경보 2(ALLOWED 1 라우트) | M23 · [S] G |
| **N23** | fin Discord 배선 | intents 0 · 버튼 채널 `[알림]` · 메시지 채널·`fallbackIntents`·접두 미사용 · 라우터 `action(/^/)` 1 · IDENTIFY 차단 알림 **`Route.ADMIN`**(fin 은 ADMIN 매핑 있음) | M24 · [S]Δ#10 |
| **N24** | 켜기 스크립트 fit 고정 | `.sh:174` fin 거부 · `:15-17` KEY·BOT·LABEL · `.cjs:13` KEYS · 테스트 `:244-247` | M25 |
| **N25** | fin 봇 테스트 | 13 파일 · 141 · 명령 판단 테스트 = `vest-confirm` 10 | M27 |
| **N26** | 판단 지점 테스트 0 | 트리거 2 · `expense-parser` · `category-matcher` · 콜백 4 · 자유 텍스트 · 인자 파싱 | M28 · [S] I(T1~T12) |
| **N27** | 시간 | 인바운드 시간대 가드 0 · `message.date` 0 · 처리 시각 의존 12 줄/8 파일 | M29 |
| **N28** | chat 테스트 | 6 파일 · 89 | M30 |
| **N29** | lib → `bot` 전달 | 0(lib 가 `notifyBot()` 을 부른다) | M31 |
| **N30** | Discord 한도 | 첫 응답 3 s · 인터랙션 토큰 15 분 · 본문 2000 | [009] L22 |

### 3-2. 측정 파일에 없는 소스 사실 — [W]

| # | 사실 | 위치 | 쓰는 곳 |
|---|---|---|---|
| W1 | 메시지 순서 = 첨부 → **명령(첫 단어 · 접두 필수 기본 · `optional` 만 접두 없이)** → **`hears` 등록 순 `ctx.text.match`** → fallback | `packages/chat/src/router.ts:74-100` · `:81-83` | P · A |
| W2 | 대기열은 핸들러 promise 를 기다린다 — 핸들러가 진행 안내 뒤 돌아가면 그 채널 다음 입력이 곧바로 시작한다 · 사슬은 실패와 무관(`catch`) · 감시 시한 기본 10 분 | `chat.ts:161-190` · `:80` | Q |
| W3 | `ButtonContext.edit(msg)` — `buttons` 를 주면 교체 · 안 주면 제거 · 14 분 넘으면 봇 토큰 경로 · `BaseContext` 에 표시 이름 필드 없음 | `types.ts:63-68,84-94` · `chat.ts:252-259` | B · C |
| W4 | `toComponents` 한도 행 5 · **행당 5** · action 100 · label 80 — 넘으면 throw | `packages/chat/src/buttons.ts:7-10,19,21` | B |
| W5 | `Transaction.userId String?` · `@@index([userId])` · 단건 확정은 `transactedAt: new Date()`(확정 시각) · **복수 확정은 파싱 날짜** `new Date(\`${m.parsed.date}T00:00:00.000Z\`)`([A]#8) | `apps/finance/prisma/schema.prisma`(Transaction 모델) · `apps/finance/src/bot/commands/expense.ts:327-334,583-591` | S |
| W6 | `sendBriefing(session, chatId?: number)` — 성공·실패 안내 모두 같은 `notifier` 의 `Route.ALLOWED` 로 · `askAdvisor` `overallTimeoutMs: 900_000` | `apps/finance/src/bot/notifications/briefing.ts:49-96` | D |
| W7 | fin 은 이미 `createDiscordBotTransport({ token, channels: { [alias]: channelId } })` 로 notifier 를 만든다 | `apps/finance/src/bot/notifications/notifier.ts:25,138` | D |
| W8 | `/report` 는 `.then` 안에서 `replyWithDocument` · 실패는 정적 안내 | `apps/finance/src/bot/commands/report.ts:48-63` | D |
| W9 | `알림설정` 핸들러: `(ctx.match?.toString().trim()) \|\| text.replace(/^(\/alertconfig\|알림설정)\s*/, '')` — hears 경로의 `ctx.match` 는 일치 배열 | `apps/finance/src/bot/commands/alert.ts:31-40` | A · UQ-3 |
| W10 | fit Discord 버튼 출력은 `notice`·`removeButtons`·`reply` 뿐 — **버튼과 함께 본문을 바꾸는 `edit` 이 없다** · `toDiscordCommandText` 는 영어 이름 11 만 `!` 로 | `apps/fitness/src/bot/discord/reply.ts:10-25,45-57` | H · A |
| W11 | fit 상태 키 `telegram:<chatId>` / `discord:<channelId>:<userId>` | `apps/fitness/src/bot/core/state-key.ts:5-14` | S |
| W12 | fit 켜짐/꺼짐 로그 상수 · 4014 강등 알림 `Route.ALLOWED` · 메시지 채널 = [대화] · 버튼 채널 = [알림, 대화] 중복 제거 | `apps/fitness/src/bot/notifications/discord-interactions.ts:47-48,51-70,86-96` | K · F |
| W13 | fin pm2 봇 이름 `pleiades-fin-bot` | `deploy/pleiades.config.cjs:76` | K |
| W14 | `splitCommand` 가 chat 공개 API 로 나가 있다 | `packages/chat/src/index.ts`(`export { createRouter, splitCommand }`) | A |
| W15 | **(2회차 · [A]#3 감사 근거 인용)** notify 텔레그램 transport = 코어 소유(`maxLength: 4096` · 코어가 분할·청크별 재시도·HTML 실패 → plain 폴백) · Discord 봇 transport = 어댑터 소유(`maxLength: Infinity` · 코어는 한 번 부르고 재시도·폴백 없음 · 변환·2000 분할·재시도·429 는 `requestDiscord`) · chat `ctx.reply({format:'html'})` 도 같은 변환·분할·`requestDiscord` | `packages/notify/src/telegram.ts:33,36` · `deliver.ts:33-49,65-83` · `discord-bot.ts:114,124-143` · `packages/chat/src/rest.ts:98-100,142-143` | D |
| W16 | **실패 표면:** notifier 는 실패를 `BroadcastResult`(`sent=0`)로 돌려주고 던지지 않는다 · `ctx.reply` 는 던진다 · `sendBriefing` 은 성공 발송 실패를 `catch`(실패 안내 재발송)로 받는다 | `packages/notify/src/notifier.ts:68,85-87` · `apps/finance/src/bot/notifications/briefing.ts:79,83-96` | D |
| W17 | fin `notifier.ts:13` 주석 "`/브리핑` 응답(`notifierForChat`)은 항상 텔레그램" — 정본 `009:337` 이 D-3/D-4 정정 대상으로 잡아 둠 | `apps/finance/src/bot/notifications/notifier.ts:13` · `docs/specs/009-discord-only.md:337` | D · PR-2 |
| W18 | 텔레그램 typing 은 fire-and-forget 작업 안 `setInterval` 로 돌고 `.finally` 에서 해제 | `apps/finance/src/bot/commands/ai.ts:51-54,89` | Q([A]#5) |
| W19 | chat 은 "텍스트 빔 **그리고** 첨부 0" 만 버린다 — 첨부 경로가 없으면 첨부만 있는 메시지가 빈 텍스트로 fallback 에 간다 | `packages/chat/src/chat.ts:216` · `router.ts:75-99` | H([A]#6) |

### 3-3. 착수 직전 측정 (미측정을 추정으로 메우지 않는다)

| # | 무엇 | 누가 · 어디서 | 걸린 곳 |
|---|---|---|---|
| **X-1** | **(2회차 · [A]#9 — 정적으로 거의 닫힘)** `Category.id @default(cuid())`(`schema.prisma:229`) · 웹·MCP 생성도 `@default` · txId = 20 → 최장 `tx:cat:` 7 + 20 + 1 + cuid 25 = 53 < 100. **남은 것 = 로컬 행 1 개로 cuid 길이 확인 1 줄** | Claude · 로컬 `pleiades_fin`(읽기) | B(action 100 한도 W4) |
| **X-2** | **운영 카테고리 수**(소비·수입) | **사용자 · 웹 카테고리 화면의 개수만**(서비스 DB 직접 접근 0 · I-7) | B — 행 재배치로 충분한지 |
| **X-3** | 분기 리포트 PDF 크기 | 사용자 · 서버의 최근 리포트 파일 크기 숫자만(경로 비공개) | D(10 MiB N14) |
| **X-4** | `알림설정 급락 -3` 의 실제 텔레그램 동작(N21) | 로컬 특성 테스트(PR-2 · 실행) | UQ-3 |
| **X-5** | 로컬 `pleiades_fin` 의 `WhooingConfig` 행과 `WHOOING_WEBHOOK_URL` 이 비어 있는지 | Claude · 로컬 DB·env(값 비출력) | §8 L-0 · I-8 |
| **X-6** | 검증 fin 봇 포털 MESSAGE CONTENT 토글 상태 · 검증 서버의 fin 알림 채널에 봇 권한 | 사용자 | §8 |

---

## 4. 설계 항목 — 옵션 사다리

등급: **즉시**(파일·설정 되돌림) / **중간**(재배포·서버 수동 1회) / **높음** / **편도**.
**코드 옵션의 "즉시" 는 릴리즈 전에만이다** — `dev` 머지 뒤 어느 릴리즈든 실려 가면 revert + 재배포 = R-8 **중간**. 표에는 "(릴리즈 전)" 으로 적는다. 실행 중 끄는 스위치는 Kb 하나다. **운영 DB 에 쓴 값은 되돌리지 않는다(전진 전용 · [009] §6 머리)** — S 에서 따로 적는다.

### P. 명령 접두 정책 (Δ1 · Δ2 · 상위 차이 1)

**문제:** 영어 이름 21(N1 `command`)은 Discord 에서 `/` 로 칠 수 없다(Δ1). 한글 28(N3)은 접두가 원래 없다. 정확 일치 10 을 첫 단어 매칭으로 옮기면 텔레그램에서 자유 텍스트(AI·소비)였던 `현황 어때?` · `소비 패턴 분석해줘` 가 명령이 된다.

| | 안 | 얻는 것 | 잃는 것 · 위험 | 되돌리기 |
|---|---|---|---|---|
| P1 | 영어·한글 모두 `command(…, {prefix:'optional'})` | 등록 형태 하나 | 정확 일치 10 의 의미가 바뀐다(N3) · `수입`(인자 유무로 핸들러 둘)을 표현 못 한다 · `관심` 부정 전방탐색 · 2-1 위반 | — (기각) |
| ★ **P2 · 권고** | **영어 이름 21 = `command(name, h)`(라우터 `commandPrefix: '!'` · 접두 필수 기본) · 한글 28 = `hears(<텔레그램과 같은 정규식 객체>, h)`** — 정규식은 각 명령 모듈에서 **상수로 한 번 정의해 grammY `bot.hears` 와 chat `hears` 가 같은 객체를 쓴다**(갈라지지 않게) · 등록 순서는 텔레그램과 같게(W1 — 명령 단계가 앞이라 영어·한글이 같은 입력을 두고 겨루지 않는다) | 한글 명령의 의미가 텔레그램과 같다(같은 정규식 · 같은 텍스트) · chat 무변경 · D-2 결정(`!`)과 같다 | 한글 이름에 `!` 를 붙이면(`!현황`) 명령이 아니다 — 텔레그램 `/현황` 도 명령이 아니었다(N20 각주) | **즉시**(릴리즈 전) |
| P3 | P2 + 한글 이름을 `!` 필수 명령으로도 등록(`!현황` 별칭) | 습관상 `!` 를 붙여도 동작 | 등록 두 벌 · 정확 일치 10 은 `!현황 어때` 를 명령으로 — 접두가 있으니 의도로 볼 수 있다 · 2-1 "같은 텍스트" 밖의 추가 | **즉시**(릴리즈 전) |

**자유 텍스트의 접두 인식(N4):** 텔레그램 두 fallback 은 `/` 시작을 명령으로 보고 건너뛴다(소비·AI 로 가지 않는다 · 무응답). Discord fallback 은 **`!` 시작도 같은 대우**를 한다 — 등록되지 않은 `!foo 3` 이 숫자 때문에 소비 기록으로 가지 않게([S] A4 마지막 · fit `handleDiscordText` 의 `!` 처리와 같다 W-참고 `apps/fitness/src/bot/discord/router.ts:32-36`). 판단 함수는 "명령 모양인가"를 인자로 받는다(어댑터가 `/` 또는 `!` 로 판정).
**안내문 표기(N20):** Discord 어댑터가 영어 이름 21 의 `/name` 을 `!name` 으로 바꾸고(fit `toDiscordCommandText` 와 같은 경계 규칙 · W10), **한글 슬래시 표기(`/알림설정` · `/전략`)는 슬래시를 뗀다**(Discord 에서 `/` 는 입력창이 가로챈다 · 한글 명령은 접두가 없다). 긴 본문(AI 답 · 브리핑)은 바꾸지 않는다(fit 과 같다). 세션 브리핑 실패 안내의 `/ai`(N13)도 같은 변환을 탄다(D).
**권고 P2.** 판정: 라우팅 표 단위 테스트(정확 일치 10 각각의 "이름 + 다른 말" → fallback · `!analysis X` · `분석 X` → 같은 판단 · `!현황` → 무응답 · 등록 안 된 `!foo 3` → 소비 아님) · **정규식 상수 동일성**(grammY 등록과 chat 등록이 같은 객체 — 텔레그램 경로 무변경 테스트로).

### A. 인자 추출 (Δ3 · 상위 차이 1)

**문제:** 영어 이름 12 개 핸들러가 원문에서 이름을 벗긴다(N19) · `ctx.match` 2 · 한글 전용 정규식 파싱 5([S] F1 끝).

| | 안 | 얻는 것 | 잃는 것 · 위험 | 되돌리기 |
|---|---|---|---|---|
| A1 | 벗기기 정규식에 `!` 대안 추가(`/^([!/]report…\|리포트)\s*/`) | 수정 12 줄 | 텔레그램 정규식이 Discord 를 알게 된다 · 판단과 원문이 계속 섞인다 · 테스트를 걸 경계가 없다 | **즉시**(릴리즈 전) |
| ★ **A2 · 권고** | **판단 함수는 `args: string` 을 받는다(원문이 아니라).** 텔레그램 어댑터는 **지금의 벗기기 식을 그대로** 써서 `args` 를 만든다(동작 무변경 — 결함 포함 · UQ-3) · Discord 어댑터: 영어 이름 = 라우터 `args`(W1) · 한글 `hears` = `splitCommand(ctx.text).args`(W14 — 한글 정규식 28 은 전부 이름이 첫 단어다 · N3) · 원문 전체를 쓰는 파싱(`수입 …` · 매수/매도 · 계좌 · 주가 · 예산설정)은 원문을 그대로 넘긴다(지금과 같다) | fit D-2 의 `decide*(args)` 형태와 같다 · 인자 파싱을 판단에서 테스트할 수 있다(T11) | 텔레그램 어댑터의 벗기기 식 12 는 남는다(D-5 에 지운다) | **즉시**(릴리즈 전) |

**권고 A2.** 판정: 명령 12 각각 텔레그램 원문 → `args` 가 지금과 같다(특성 테스트) · Discord `!report 2026 1` · `리포트 2026 1` → 같은 `args` · `ctx.match` 2 경로.

### B. 버튼 (Δ4 · 상위 차이 2)

| 소항목 | ★ 권고 | 대안 · 기각 이유 | 되돌리기 |
|---|---|---|---|
| **응답 모델 · 텔레그램 매핑 (2회차 정정 · [A]#2)** | 버튼 출력 = **`toast(text?)` · `removeButtons()` · `edit(reply)` · `reply(reply)`** 의 **단계 열**이다 — 판단 함수는 **지금 핸들러가 부르는 순서 그대로** 단계를 부르고, **텔레그램 어댑터는 단계마다 지금과 같은 grammY 호출 하나**로 옮긴다: `toast` = `answerCallbackQuery({text})`(무텍스트 = `answerCallbackQuery()`) · `removeButtons` = `editMessageReplyMarkup({reply_markup: undefined})` · `edit(버튼 없음)` = `editMessageText(text[, {parse_mode}])` · `edit(버튼 있음)` = `editMessageText(text, {reply_markup})`(`tx:change`·`allcat` 의 지금 호출). 그래서 `tx:cancel` 은 **두 호출 · 같은 순서**가 남는다(`expense.ts:231-233` · N17) — **정본 = "지금 호출열 그대로"**, T 의 보장도 호출열이다(아래 T) · Discord 어댑터: `removeButtons` = `setButtons([])` · `edit` = `ButtonContext.edit`(버튼 안 주면 제거 · W3) — `removeButtons` 뒤 `edit` 이 오면 PATCH 둘(무해 · 합치기는 어댑터 최적화로 남긴다) | ① 1회차 안 "텔레그램 = `editMessageText(…, {reply_markup})` 하나로 합친다" — 두 번째 호출 실패 시 키보드 잔존 여부가 바뀌어 "무변경" 이 깨진다(기각 · [A]#2) ② fit `ButtonOutput`(W10) 그대로 — 교체가 없어 새 메시지로 바뀐다 | **즉시**(릴리즈 전) |
| **ack 텍스트(토스트) (2회차 · [A]#11)** | 텔레그램 토스트(42 · N17)는 잠깐 뜨는 표시이고 chat `notice` 는 본인 전용 **후속 메시지**로 쌓인다(`chat.ts:266-269`). **Discord 어댑터는 `toast` 를 모았다가 그 결정에서 `edit`·`reply` 가 한 번도 없었을 때만 `notice` 로 보낸다**(만료 · 본인 아님 · 중복 클릭처럼 본문을 안 바꾸는 결과는 안내가 보이고, "취소되었습니다" + 본문 교체 같은 경우는 본문만) | ① `toast` → 매번 `notice` — 클릭마다 ephemeral 이 쌓인다 ② 판단 함수가 플랫폼별로 고른다 — 판단에 플랫폼이 샌다 | **즉시**(릴리즈 전) |
| **카테고리 키보드 행(N18)** | **Discord 어댑터가 행을 다시 채운다:** 판단은 텔레그램과 같은 논리 행(2열 + 마지막 행 `취소`/`전체 카테고리`)을 돌려주고, 비지 않은 행이 5 를 넘으면 **마지막 행을 따로 두고 나머지 버튼을 행당 5 로 다시 묶는다**(W4 — 용량 = 4 행 × 5 = 카테고리 20) · 그래도 넘으면 throw 대신 **정적 안내 + 이 기록 취소**(무표시 0) — 운영 카테고리 수(X-2)가 20 이하면 이 분기는 죽은 경로다 | ① select 메뉴 — chat 에 없다(L17) · chat 확장 + 공개 계약 + 버튼과 다른 인터랙션 유형(component_type 3)이라 chat PR 이 새로 생긴다 ② 페이지 버튼(`tx:page:`) — 새 콜백 동작 · 상태 · 텔레그램과 흐름이 갈린다 ③ chat 이 자동으로 다시 묶기 — "자르지 않고 던진다"(W4 머리) 원칙과 별개지만 행 모양을 계층이 바꾸는 것은 공개 계약 변경 | **즉시**(릴리즈 전) · X-2 가 20 초과면 §11 재오픈(②) |
| **action 길이** | 텔레그램 callback data 그대로(`tx:` · `multi:` · `trade:` · `aitrade:` · `vest:`) — 최장은 `tx:cat:…`(X-1 로 100 이하 확인 · 넘으면 이 설계 재오픈) | — | — |
| **판단 분리 콜백 4 종** | `trade:` · `aitrade:` · `tx:` · `multi:` 를 `decideVest` 형으로 — 입력(action · 누른 사람 ID 문자열 · 상태 키) → 결과(알림 텍스트 · 원본 편집 · 상태 변경 · DB 쓰기) · 본인 확인·만료·중복 클릭 판정 포함(T4 · T5 · T7 · T9) | — | **즉시**(릴리즈 전) |
| **라우터** | `action('trade:')` · `action('aitrade:')` · `action('tx:')` · `action('multi:')` · 기존 `vest:` → 마지막 `action(/^/)` 알 수 없는 접두 안내(D-1 결과 유지 · fit [D2A] C6 와 같은 형태) | — | **즉시**(릴리즈 전) |

**권고: 위 표.** 판정: 행 재배치 단위(9 → 5+4+취소 = 3 행 · 히스토리 경로 마지막 행 2 버튼 유지 · 21 → 안내 · [A]C1 산수 확인) · 콜백 4 종 판단 테스트 · 텔레그램 키보드 모양 무변경(2열) · **텔레그램 호출열 무변경**(`tx:cancel` 두 호출 순서 포함) · Discord 토스트 규칙(본문 교체 결과 → `notice` 0 · 만료 결과 → `notice` 1).
**각주 — 확정 뒤 원본 수정 실패(3회차 · [A2]#3 · 서비스 유래):** 텔레그램 콜백 4 종은 DB 쓰기와 그 뒤의 ack·버튼 제거·본문 교체를 한 `try` 에 두어(`trade.ts:318-360` · `ai.ts:400-434` · `expense.ts:321-372,581-626`) 편집이 실패하면 기록된 거래에 "⚠️ 거래 실패" 를 띄운다. 단계 열을 지금 순서대로 부르면 Discord PATCH 실패(429 대기 10 s 초과 `rest.ts:118` 등)도 같은 거짓 안내를 만든다. **권고(단계 열 · 토스트 규칙)는 그대로** 두고 처리는 UQ-3 답을 따른다 — 특성 테스트는 "현재 동작" 이름으로 고정(D3-R2) · 대안 = Discord 어댑터가 확정 뒤 단계 실패를 삼키고 경고 줄(fin 기존 Discord 판 `discord-interactions.ts:36-45` 과 같은 방식).

### Q. 동시성 · 대기열 (Δ5 · 상위 차이 3)

**사실(W2 · N10):** fin 의 긴 작업 7 은 진행 안내를 보낸 뒤 핸들러가 돌아간다 → chat 대기열은 그 순간 풀린다 → **같은 채널의 다음 메시지·버튼은 AI 를 기다리지 않는다.** 답은 나중에 `ctx.reply`(봇 토큰 · `chat.ts:212`)로 가므로 **15 분 인터랙션 토큰과 무관**하다([S] D1). 이것은 텔레그램과 같은 의미다 — grammY 순차 루프도 이 7 개를 직렬화하지 않았다([S] D1). 대기열이 실제로 막히는 것은 핸들러가 await 하는 커스텀전략 파싱(N10 · 60 s) 하나 — 그 동안 같은 채널 버튼에는 ⏳ 안내가 나간다(D-2 기능).
**D-2 근거와의 차이:** D-2 가 버튼까지 대기열에 넣은 이유는 "다음 텍스트를 붙잡는 편집 pending 의 TTL 경합"이었다([A]#3). fin 에는 텍스트를 붙잡는 상태가 0 이고 pending 4 은 봇 메시지 id 키다(N8) — 그 근거는 fin 에 없다. 그래도 **기본값(직렬)을 그대로 쓴다** — 순서 보장은 무해하고(같은 채널 확정 버튼 → 다음 소비 입력의 순서가 텔레그램과 같다) chat 옵션을 앱마다 다르게 두면 설정이 갈린다.

| 소항목 | ★ 권고 | 대안 | 되돌리기 |
|---|---|---|---|
| 대기열 | chat 기본(`serializeByChannel` 미지정 = 직렬) · 감시 시한 기본 10 분(커스텀전략 60 s · N10) | `false` — 이득 없음 | **즉시**(릴리즈 전) |
| fire-and-forget 오류 | 지금처럼 각 작업이 스스로 `catch` 해 정적 안내(chat 의 실패 안내는 핸들러 동기 부분만 잡는다 · W2) — **판단 분리 때 `.catch` 가 빠지지 않게 테스트** | — | — |
| typing **(2회차 정정 · [A]#5)** | **응답 모델의 `typing` 을 fire-and-forget 작업 안에서 주기 호출하고 작업이 끝나면 해제한다**(지금 텔레그램과 같은 자리 — W18 `setInterval` + `.finally`) · 주기만 어댑터 값(텔레그램 5 s 그대로 · Discord 9 s — typing 약 10 s `types.ts:76`) · **핸들러를 fit `withTyping` 으로 감싸지 않는다** — fin 핸들러는 진행 안내 뒤 곧 돌아가므로(N10) 감싸면 typing 이 바로 끝난다 · 레이트 리밋은 fit 운영 병행에서 경고 줄로 본다 | ① fit `withTyping` 형태(1회차 안) — 위 이유로 기각 ② 생략 — 최장 900 s(N12) 동안 무표시 | **즉시**(릴리즈 전) |
| **AI 대화 동시 1건 키(`chatBusy`)** | 키 = 상태 키(S) — **텔레그램 chat · Discord 채널+사용자 각각 1건**(지금 "chat 단위"의 직역) → 병행 중 **AI 대화**가 두 플랫폼에서 동시에 1건씩(최대 2) 돌 수 있다 — **UQ-4** · `chatBusy` 는 AI **대화**(`fireAiQuestion`)만 막는다 — AI 거래 파싱·복수 소비·종목 분석·세션 브리핑·리포트 ai-review 는 **지금도 제한 없이 동시**다(N10 의 나머지 · [A]#4) | 프로세스 전역 1건(fit 처럼 · 정본 §4-2 의 "락 공유" 는 fit 행) — 플랫폼을 넘는 질문 하나가 "처리 중"으로 버려진다 | **즉시**(릴리즈 전) |
| AI 세션(`chatSessions`) | 키 = 상태 키 — 플랫폼별 세션(R10 · fit 과 같은 방향) · `!reset` 은 자기 키만 | 공유 — 대화 맥락이 플랫폼 사이로 샌다 | **즉시**(릴리즈 전) |

### S. 식별자 · 상태 키 · DB (Δ6 · 상위 차이 4)

| 대상 | ★ 권고 | 대안 | 되돌리기 |
|---|---|---|---|
| **number 키 2**(`chatSessions` · `chatBusy`) | `Map<string,…>`/`Set<string>` · 키 = **fit 과 같은 모양** `telegram:<chatId>` / `discord:<channelId>:<userId>`(W11 · fin 쪽에 같은 두 함수를 둔다 — 앱 사이 import 는 하지 않는다) | 채널 단위 — 허용 사용자가 여럿이면(두 앱 공용 허용 목록) 남의 세션을 잇는다 | **즉시**(릴리즈 전) |
| **pending 키 4**(이미 문자열) | 앞에 플랫폼을 붙인다 — `telegram:<chat.id>:<message_id>:<id>` / `discord:<channelId>:<messageId>:<id>`(Discord 는 `SentMessage{channelId,id}` ↔ `ButtonContext{channelId,messageId}` 같은 짝 · [S] B2) — 충돌이 "확률상 0 에 가깝다"([S] C)가 아니라 **구조상 0** 이 되게(2-2) | 그대로 — 2-2 를 확률로 지킨다 | **즉시**(릴리즈 전) · 프로세스 메모리라 재시작 때 비워진다 |
| **본인 확인 `requestedByUserId`**(4 인터페이스) **(2회차 정정 · [A]#2)** | `string` · **생성 쪽만** 기본값 유지 — 텔레그램 `String(ctx.from?.id ?? 0)`(N8 5 곳 · `Transaction.userId` 값도 그대로 `"<id>"`) · Discord `ctx.userId` · **비교 쪽은 누른 사람 ID 가 없으면 거부**(지금 `ctx.from?.id !== pending.requestedByUserId` 가 `undefined !== 0` 으로 거부하는 것과 같다 — `expense.ts:217,552` · `trade.ts:296` · `ai.ts:378`) · 비교 = `clicker !== undefined && String(clicker) === requestedByUserId` | ① 비교 쪽에도 `String(from?.id ?? 0)` — `"0" === "0"` 로 **허용**으로 바뀐다(1회차 문안 · 기각) ② number 유지 + Discord 별도 필드 — 두 벌 | **즉시**(릴리즈 전) |
| **`Transaction.userId`**(N9 · DB) | **UQ-2** — 권고: **Discord 확정 행은 `discord:<userId>` · 텔레그램 행은 지금 값 그대로(`"<from.id>"`)** — 스키마 무변경 · 마이그레이션 0 · 한 컬럼에서 출처가 구분된다 · 읽는 곳 0 이라 기존 동작 영향 0 | ① snowflake 그대로 — 텔레그램 ID 와 같은 숫자 문자열이라 구분 불가 ② `null` — 정보 손실 · 의미가 "사용자 없음"과 섞인다 ③ `platform` 컬럼 추가 — 마이그레이션(minor · `--prerelease` · 배포 경로 미정 007 Q74) · 읽는 곳 0 인 컬럼을 위해 배포 경로를 연다 | 코드는 **즉시**(릴리즈 전) · **쓴 행은 남는다**(운영 DB 전진 전용 · 읽는 곳 0 이라 무해 · 고치려면 운영 DB 쓰기 = 사용자) |

판정: 키 격리 단위(같은 숫자의 telegram/discord 키가 서로를 소비하지 않는다 · 본인 확인이 문자열 비교) · **경계 1건: 텔레그램 콜백에 `from` 없음 → pending 이 `"0"` 이어도 거부**([A]#2) · `Transaction.userId` 값 단위(텔레그램 경로 무변경 · Discord 경로 접두 · [A]C2 — 컬럼 `TEXT` · 읽는 곳 0 · 웹·MCP·크론 생성 행은 `null`).

### D. `/브리핑` 요청 채널 · `/report` 파일 (Δ7 · Δ8 · 상위 차이 5)

**`/브리핑` 세션(N13 · W6)**

| | 안 | 얻는 것 | 잃는 것 · 위험 | 되돌리기 |
|---|---|---|---|---|
| D1 | Discord 요청은 `sendBriefing(session)`(chatId 없음 = 크론 경로 `Route.ALLOWED`) | 변경 0 — 대화 채널 = 알림 채널(C-7 정정)이라 지금은 같은 채널에 보인다 | **라우트 스위치를 탄다** — 미설정이면 텔레그램 전체로(L31) = C-4 위반 경로 · 채널을 나누면(C-7 "값만 바꾼다") 답이 알림 채널로 간다 · "요청 chat 에만" 의미 상실 | — (기각) |
| ★ **D2 · 권고** | **`sendBriefing(session, target?: Notifier)` — 호출부가 응답 대상 notifier 를 넘긴다.** 텔레그램 명령 = `notifierForChat(bot, chatId)`(지금 그대로) · Discord 명령 = 새 `notifierForDiscordChannel(channelId)` — 이미 쓰는 `createDiscordBotTransport({token, channels:{req: channelId}})`(W7) + `targets.ALLOWED = ['req']` · 크론 = 미지정(지금 그대로) · **Discord 판에서 `sent=0` 이면 경고 줄 1**(IDENTIFY 알림 `discord-interactions.ts:80` 형태 — notifier 는 던지지 않으므로 · W16) · **`notifier.ts:13` 주석 갱신을 PR-2 에 포함**(W17 · 정본 `009:337`) | **(2회차 정정 · [A]#3)** 요청 채널 의미 보존 · 스위치 무관 · 크론과 같은 `sendBriefing` 한 함수 · **실패 표면이 텔레그램 명령·크론과 같다**(notifier → `sent=0` · 던지지 않음 · W16) | notifier 함수 1 추가 · 전달 정책은 transport 마다 원래 다르다 — 텔레그램 = 코어 분할·재시도·plain 폴백 · Discord = 어댑터 변환·2000 분할·재시도(W15) · 실패 안내 `/ai`(N13) → Discord 판 `!ai`(P 표기 규칙을 notifier 경로에서는 못 탄다 — **문구를 판단에서 인자로**) | **즉시**(릴리즈 전) |
| D3 | `sendBriefing(session, deliver: (html) => Promise<void>)` — Discord 는 `ctx.reply({format:'html'})` | notifier 를 안 만든다 · 변환·분할·재시도는 D2 의 Discord transport 와 **같은 파이프**(W15) | **(2회차 정정 · [A]#3)** **실패가 throw 로 바뀐다** — 성공 발송(`briefing.ts:79`)이 실패하면 `catch`(`:83-96`)로 가서 같은 경로로 실패 안내를 다시 보내려 한다 · 한 함수 안에서 크론·텔레그램(notifier · `sent=0`)과 Discord(throw)가 다른 실패 의미를 갖는다 | **즉시**(릴리즈 전) |

`/브리핑 <종목>`(N10 #4 · N12 900 s): 지금 `ctx` 로 바로 답한다 — Discord 는 `ctx.reply({format:'html'})`(2000 분할은 chat · 4096 plain 분기는 옮기지 않는다 — fit `long` 과 같은 처리).
**`/report` PDF(N14 · W8):** Discord 어댑터는 `replyFile({ name, data, contentType: 'application/pdf', caption })` · **10 MiB 초과(chat 이 던진다)면 정적 안내**("파일이 커서 보낼 수 없습니다") — X-3 이 상한 안이면 죽은 경로. 판정: 단위(크기 초과 → 안내 · 정상 → `replyFile` 인자) · 로컬은 ai-review 가 advisor 를 부르므로(I-8) **실패 경로까지**(Δ13).

### C. chat 확장 필요 여부 (Δ9 · PR 분할의 전제)

| fin 필요(N7 · 위 항목) | ★ 권고 | 대안 | 되돌리기 |
|---|---|---|---|
| `/start` 표시 이름 | **Discord 판은 이름 없이 인사**(판단 함수가 `name?: string` 을 받고 없으면 생략) — chat 무변경 | chat `MessageContext.displayName`(payload 의 사용자 표시 이름) — 공개 계약 1 필드 · 계약 테스트 · PR 하나 추가 | **즉시**(릴리즈 전) |
| select 메뉴 | 쓰지 않는다(B 행 재배치) | B 표 ① | — |
| 버튼 컨텍스트 typing | 불필요 — fin 버튼 경로에 AI 없음([S] G 확정 뒤 쓰기만) | — | — |

**결론: chat 변경 0**(N28 그대로) — D-2 의 PR-1 에 해당하는 PR 이 없다.

### H. 핸들러 구조 — 판단 분리 (Δ11 · 1-7 · C-4)

| | 안 | 얻는 것 | 잃는 것 | 되돌리기 |
|---|---|---|---|---|
| H1 | Discord 핸들러 복사 | 텔레그램 무변경 | 판단 두 벌(R10 코드판) — fin 은 269(N6)라 갈라질 표면이 크다 | **즉시**(릴리즈 전) |
| ★ **H2 · 권고** | **D-2 와 같은 판단 분리** — `decide*` 가 중립 응답 모델을 낸다 · 텔레그램 어댑터(grammY · `replyHtml` 4096 분할·plain 재시도 · `InlineKeyboard`)와 Discord 어댑터(chat)가 감싼다 · **응답 모델은 fin 안에 둔다**(fit `core/reply.ts` 를 본뜨고 버튼 출력에 `edit` 추가 — 앱 사이 import 금지) | 판단 한 벌 · 테스트를 판단에 건다 · D-5 는 텔레그램 어댑터만 지운다 | 범위가 크다(N6 · N6a · T1~T16) → PR 을 셋으로 순차(§5) · 모델이 앱마다 한 벌(fit · fin) — 공통화는 D-5 뒤 재검토(§11) | 함수 단위 revert(**즉시**(릴리즈 전) · 배포 뒤 R-8 **중간**) |
| H3 | 앱 안 grammY 모양 shim(`ctx.reply(text,{parse_mode})` · `message.text` 를 chat 위에) | 읽기 전용 명령 20 여 개를 거의 무수정으로 | 텔레그램 어휘가 Discord 경로에 남는다(C-2 의 정신 · S-1 이 계층에서 기각한 형태를 앱에서) · `editMessageReplyMarkup` 21 등 의미가 다른 호출을 흉내 · D-5 에서 다시 걷어 낸다 | **즉시**(릴리즈 전) |

**권고 H2.** Discord 쪽 배선(PR-3):
- 라우터: `createRouter({ commandPrefix: '!' })` · 영어 `command` 21 → 한글 `hears` 28(텔레그램 등록 순) → `fallback` 하나가 N4 의 두 핸들러 순서(소비 거름 → 소비 → AI 거래 → AI 질문 → 무응답) · 첨부 경로 없음(미디어 수신 0 · N1 `on` 에 사진 없음) — **(2회차 정정 · [A]#6)** chat 은 "텍스트 빔 그리고 첨부 0" 만 버리므로(W19) **첨부만 있는 메시지는 빈 텍스트로 fallback 에 온다** → **fin fallback 이 빈 텍스트를 무응답으로 끝낸다**(소비: 숫자 없음 → 다음 · AI: 3자 미만 무시 — N4 순서) · 텍스트+첨부는 텍스트로 · 버튼 = B 표.
- 응답 형식: `replyHtml` 38 · `parse_mode` 직접 4(N15) → `reply({ text, format: 'html' })`(변환·2000 분할 = chat) · `markdownToTelegramHtml` 은 escape 가 있어(N15) Discord html 변환과 맞는다([S] D3).
- **`bot` 인자:** lib 로 넘기는 경로 0(N29) — D-2 Δ7 문제 없음.
- **C-4:** Discord 에서 받은 명령의 답은 받은 채널로만 · 인바운드가 부르는 아웃바운드(예산 경보 · advisor 실패 ADMIN · 세션 브리핑)는 각각 한 라우트 또는 D2 의 요청 notifier([S] G 마지막 — 두 플랫폼 직접 발송 경로 0).
- 서비스 유래 결함을 새 경로에 옮길지는 UQ-3.

### K. 켜기/끄기 스위치 · 채널 (3-3 = 2-3 · 3-4 = 2-4)

D-2 Ka3 + Kb1 을 그대로 쓴다 — 결정할 것은 이름과 fin 차이뿐이다.

| 소항목 | ★ 권고 | 근거 | 되돌리기 |
|---|---|---|---|
| 키 | **`DISCORD_CHANNEL_ID_FINANCE_CHAT`**(선택 · 루트 플랫폼 env) — `PLATFORM_KEY_RE` 안 · `check_env.py` 텔레그램 chat 대조 불일치 · 셸 정리 접두 `DISCORD_` 안([S] H "키 이름 기계 규칙") · 값 = 알림 채널과 같다(C-7 정정) | [S] H | 줄 비움(**즉시** · 실행 중 · 단 pm2 env 에 키가 없을 때 — [D2] N30) |
| 기동 | 비면 지금(D-1) 그대로 intents 0 · 채우면 `MESSAGE_INTENTS` + `fallbackIntents: 0` · 메시지 채널 = [대화] · 버튼 채널 = [알림, 대화] 중복 제거(W12 형태) · 기동 로그 `[discord-fin] 메시지 수신 켜짐(대화 채널)` / `… 꺼짐(버튼만)` | W12 · 판정 문자열 | **즉시**(릴리즈 전) |
| 판정 문자열 | 새 2 줄이 `gateway 종료 코드` 와 미설정 2 문구(`discord-interactions.ts:58,62`)를 포함하지 않는다 — `discord-switch.sh` 의 fin 판정을 깨지 않게([S] H · [D2A] C2) | [S] H | — |
| `.env.example` | 주석 선택 키 1 줄(fit 줄 옆) | [S] H | **즉시** |

### F. 4014 방어 (3-3)

D-2 F1 을 그대로 쓴다(chat 이 이미 한다 · `[discord-fin] MESSAGE CONTENT 미허용(4014) …` 은 label 로 자동 · [S] H). 앱이 정하는 것은 **강등 알림 라우트**뿐이다.
- ★ **`Route.ADMIN`** — fin 은 ADMIN 을 매핑하고 같은 성격의 IDENTIFY 차단 알림이 이미 ADMIN 이다(N23). fit 이 ALLOWED 를 쓴 이유([A]#2 — fit 은 ADMIN 미매핑)는 fin 에 없다. `sent=0` 이면 경고 줄(fit W12 와 같은 형태).
- 대안: `Route.ALLOWED`(fit 과 같게) — 사용자에게 바로 보이지만 운영 알림과 섞인다. 되돌리기: 라우트 상수(**즉시**(릴리즈 전)).
- 판정: 단위(강등 콜백 → ADMIN 1 회 · `sent=0` 경고) · 로컬 L-1(검증 봇 토글 끔 · **로컬 ADMIN 수신자가 검증 채팅/검증 웹훅인지 L-0 에서 확인**).

### T. 테스트 범위 (Δ11)

| 대상 | 보장 | 위치 |
|---|---|---|
| **특성 테스트(판단 분리 전 커밋에서 먼저 통과)** | T1~T12([S] I) — 자유 텍스트 거름 7 조건 순서 · 금액 토큰 분기 · 카테고리 경로 4 + 키보드 모양 · `tx:` 5 동작+만료·본인·중복 · `multi:`(**확정 행의 `transactedAt` = 파싱 날짜 단언** · [A]#8) · 매수·매도 파싱·검증 · `trade:` · AI 거래 JSON 해석 · `aitrade:` · AI fallback 분기 · 인자 벗기기 12 + `알림설정` · `/브리핑` 인자·시각 기본값 — **advisor·DB 는 `vi.mock` 모듈 대체**(판단 분리 전 코드에는 주입할 자리가 없다 — 대상 함수 비공개 · 모듈 import 직접 호출 `expense.ts:1-11` · `trade.ts:1-6` · 선례 `vest-confirm.test.ts:9-21` · `bot/notifications/__tests__/scheduler.test.ts:9` · `lib/ai/__tests__/news-rules.test.ts:9-11`) + **가짜 Bot 으로 `register*` 의 등록 핸들러를 잡는다**(`vest-confirm.test.ts:120-136`) · **테스트마다 모듈 전역 pending 리셋**(`vi.resetModules` 또는 가짜 시계 — txId 가 `Date.now()` · `expense.ts:24,93`) · fire-and-forget 경로는 promise flush 뒤 단언 · `../notifications/budget-alert` 는 통째로 대체(grammY 봇 모듈 로드 방지) · advisor 호출 0 · [A2]#2 | `apps/finance/src/bot/**/__tests__/` |
| **특성 테스트 추가 (2회차 · [A]#2 — 판단 분리 PR 자신의 변경)** | **T13** `chatBusy`·세션·`/reset` — 같은 chat 2연속 → 바쁨 안내(`ai.ts:41-46`) · 세션 id 재사용(`:58,64`) · 24 h 지연 청소(`:26-31`) · `/reset` 뒤 새 세션(`:465`) · **T14** AI 대화 응답 — `splitMessage` → 조각별 `markdownToTelegramHtml` → HTML 실패 시 원문(`ai.ts:65-73`) · **T15** `fireMultiExpenseParse` — AI 결과(스텁) → `multi:` 키보드·pending 생성 · **T16** `수입 …` hears(`expense.ts:633`) — 단건/복수 분기 · **T17** 본인 확인 경계 — 콜백 `from` 없음 → 거부(S) · **T18** fire-and-forget 작업의 `.catch` 정적 안내 유지(Q) | 같음 |
| PR 귀속 | **PR-1a** = T1~T7 · T15 · T16 · T17(`trade:`·`tx:`·`multi:` 경계) · **PR-1b** = T8~T10 · T13 · T14 · T17(`aitrade:` 경계) · T18(AI 경로) · **PR-2** = T11 · T12 · T18(브리핑·리포트·백테스트) | — |
| 판단 함수 | 위 + 명령 32(N2) 각각 1 건 이상 | 같음 |
| 텔레그램 무변경 | **어댑터가 단계마다 지금과 같은 grammY 호출을 같은 순서로 낸다**(B 응답 모델 · `tx:cancel` = 두 호출) — 결과 상태 동등이 아니라 **호출열 동등**이 기준 · 정규식 상수 동일성(P) | 단위 |
| Discord 라우팅 표 | P 판정 · `!` fallback · 버튼 접두 5 + 알 수 없는 접두 · **첨부만 있는 메시지 → 무응답 · DB 0**([A]#6) | 단위(가짜 컨텍스트) |
| 버튼 | B 판정(행 재배치 · `edit` 교체 · Discord 토스트 규칙) | 단위 |
| 상태·DB | S 판정 | 단위 |
| `/브리핑`·`/report` | D 판정(요청 notifier · 크기 초과 안내) | 단위 |
| 스위치·4014 | 키 비움 → intents 0 · 채움 → `MESSAGE_INTENTS` · 기동 로그 · 강등 → ADMIN 1 회 | `discord-interactions.test.ts` 확장(`:112` intents 0 단언 갱신 · N25) |
| 켜기 스크립트 | fin on/off 정적 · 값 비출력 · fin 거부 테스트(`:244-247`)를 fin 통과 테스트로 교체 · fit 회귀 | `deploy/test_discord_inbound.py` |
| 판정 문자열 교차 | 새 fin 로그 2 줄이 스위치 판정 문자열과 겹치지 않는다 | `deploy/test_discord_switch.py` |

---

## 5. PR 분할 · 릴리즈 · 켜기

| PR | 내용 | 릴리즈 | 순서 의존 | 9-1 | 되돌리기 |
|---|---|---|---|---|---|
**(2회차 정정 · [A]#1)** 1회차는 PR-1 ∥ PR-2 "독립" 이라 적었다 — PR-2 의 `decide*` 는 PR-1 이 만드는 응답 모델을 돌려주고, `ai.ts`·`expense.ts` 를 두 PR 이 함께 고쳤다. 2회차는 **파일 귀속을 겹치지 않게 다시 나누고 순차**로 둔다. PR-1 대상 3 파일이 ctx 159/269(N6a)라 PR-1 을 둘로 쪼개는 안을 권고로 올린다(아래 옵션).

**PR-1 을 쪼갤지 — 옵션**

| | 안 | 리뷰 표면(ctx · N6a) | 얻는 것 | 잃는 것 | 되돌리기 |
|---|---|---|---|---|---|
| ★ **PS2 · 권고** | **PR-1a**(`expense.ts`·`trade.ts` + 응답 모델·상태 키 함수 신설) → **PR-1b**(`ai.ts` 전체 — fallback · `aitrade:` · `chatBusy`·`chatSessions` · `/ai` 인자(`:445`) · `/reset`(`:462-466`)) | 107 → 52 | 한 PR 에 하나의 상태 계열 · `ai.ts` 를 한 PR 이 끝낸다 · 9-1 리뷰가 감당할 크기 | PR 하나 늘어남 · 1b 는 1a 의 모델에 의존(순차) | 각 revert(**즉시**(릴리즈 전)) |
| PS1 | PR-1 하나(소비·거래·AI) | 159 | PR 수 최소 | fit 의 grammY ctx 참조 **전체** 91([D2] N5 — D-2 PR-2 의 diff 크기가 아니라 크기 비교용 · [A2]#4)보다 큰 리뷰 한 번 · 회귀 원인 구분이 어렵다 | 같음 |
| PS3 | 콜백 4 종을 하나씩(4 PR) | 더 작다 | 리뷰 가장 쉽다 | `expense.ts` 를 여러 PR 이 고친다(카테고리 경로가 `tx:`·자유 텍스트에 걸친다) — [A]#1 과 같은 의존이 생긴다 | 같음 |

| PR | 내용 | 릴리즈 | 순서 의존 | 9-1 | 되돌리기 |
|---|---|---|---|---|---|
| **PR-1a 판단 분리 — 소비·거래** | `expense.ts`(콜백 `tx:`·`multi:` · 자유 텍스트 소비 fallback · 카테고리 경로 · `fireMultiExpenseParse` · **`수입 …` hears `:633`**) · `trade.ts`(매수·매도 · `trade:`) · **응답 모델 신설**(H2 · B 의 단계 열 `toast`·`removeButtons`·`edit`·`reply` · `typing`) · **상태 키 함수 신설**(S) · pending 키 플랫폼 접두 · **pending 값에도 플랫폼(또는 DB 표기 ID)** — `createTransaction` 은 키를 모르므로 PR-3 이 `discord:` 접두를 붙일 자리([A2]C6) · `requestedByUserId: string`(생성 쪽 기본값 · 비교 쪽 거부 유지) · **자기 파일의 한글 정규식 3 상수화**(`^매수`·`^매도` `trade.ts:365,374` · `^수입\s+.+$` `expense.ts:633` · P · [A2]#1) · 특성 테스트(T 표 PR 귀속) **먼저** — **텔레그램 동작 무변경(호출열) · Discord 수신 0** | 불필요(실려 가면 노트에 적는다 · [D2A] [A]#8) | — | **필수**(`apps/**`) | revert(**즉시**(릴리즈 전) · 배포 뒤 R-8 **중간**) |
| **PR-1b 판단 분리 — AI** | `ai.ts` 전체 — AI fallback 분기 · `aitrade:` · AI 대화 응답(분할·HTML 폴백 T14) · `chatBusy`·`chatSessions` 키(Q · S) · `/ai` 인자 · `/reset` · typing 자리(Q) | 불필요 | **PR-1a 머지 뒤**(응답 모델 · 상태 키 함수 · 본인 확인 형) | **필수** | 같음 |
| **PR-2 판단 분리 — 나머지 명령** | 나머지 명령 판단·인자(A2 · T11 · T12 — `ai.ts`·`expense.ts`·`trade.ts` 는 건드리지 않는다) · `/브리핑` 응답 대상 주입(D2 · 텔레그램 경로 무변경 · `sent=0` 경고) · **`notifier.ts:13` 주석 갱신**(W17 · 정본 `009:337`) · `/report` · `/start` 이름 인자 · 정규식 상수화(P — **나머지 25** · 1a 의 3 은 제외 · [A2]#1) · `/report` 를 위해 **응답 모델에 파일 단계 추가**(chat `replyFile` · 텔레그램 `replyWithDocument`) · UQ-3 에서 고치기로 한 결함은 **특성 테스트 커밋 뒤 별도 커밋**(의도된 변경을 diff 로 분리) | 불필요 | **PR-1b 머지 뒤 순차**(3회차 정정 · [A2]#1 — PR-2 는 `/report` 파일 단계 때문에 응답 모델을 **반드시** 바꾸므로 2회차의 "모델을 안 바꾸면 1b 와 병행" 조건은 늘 거짓이었다 · 대안 (가) PR-1a 모델에 파일 단계를 미리 넣으면 1b·2 병행이 참이 된다 — 1a 에 쓰지 않는 단계를 넣는 대가 · 권고는 순차) | **필수** | 같음 |
| **PR-3 fin Discord 수신** | Discord 라우터(P · A · B · D · H) · K 키·기동 로그 · F 강등 ADMIN 알림 · `.env.example` · **`deploy/discord-inbound.sh`·`.cjs` 의 앱 인자화**(앱별 표: KEY · BOT · LABEL · **사용법 `:4-7` · 되돌리기 `:241` · 통과 안내 `:242`**([A]#10) — fit 값은 지금 문구 그대로(`test_discord_inbound.py` 가 고정) · fin = `DISCORD_CHANNEL_ID_FINANCE_CHAT` · `pleiades-fin-bot`(W13) · `discord-fin` · 통과 안내 "`!help` · 한글 명령 1 개 · 소비 1 건" · `.cjs` KEYS 에 fin 키) + 테스트 | **D-3 릴리즈(minor)** | PR-1a · PR-1b · PR-2 · X-1 · X-2 · L-* | **필수**(`apps/**` · `deploy/` · 허용 경계) | revert(**즉시**(릴리즈 전)) · 서버 키 비움(**즉시**) |
| D-3 릴리즈 | 일반 Release · **서버 조치 "없음"**(키 미설정 = D-1 동작) — UQ-5 | Claude 발행 · 크론 시각 회피 | — | 릴리즈 봇 게이트 | R-8 → 직전 태그(**중간** · 하한 `v1.2.0`) |
| **켜기(사용자 · 서버)** | ① 운영 fin 봇 포털 MESSAGE CONTENT 토글 켬 ② `deploy/discord-inbound.sh fin on <알림 채널 ID>` — 판정 양식은 fit 과 같은 줄(준비 · 켜짐 1 · 꺼짐 0 · 4014 강등 0 · 종료 코드 0 · `PLEIADES_ENV_FILE` 대조 · pm2 env 에 키 없음 · 키 줄 "설정됨") · 실패면 스크립트가 되돌린다 | 릴리즈 없음 | D-3 릴리즈 | — | `discord-inbound.sh fin off`(**즉시** · 다음 메시지부터 + 재시작) |

**chat 확장 PR 은 없다**(§4 C). **어느 지점에서 멈춰도:** PR-1a·PR-1b·PR-2 뒤 = 텔레그램 동작 같고 판단이 함수로(일부만 옮겨진 상태도 텔레그램에는 같다 — 남은 핸들러는 지금 코드) · PR-3/릴리즈 뒤 = 키 미설정이면 D-1 과 같다 · 켜기 뒤 = 병행(fin 이 두 플랫폼에서 받는다 — 텔레그램 무손실).
**D-3′ 와의 관계:** D-3′(fin 텔레그램 수신 끔)는 D-2′ 스크립트(#376 진행 중 · 이 설계는 그 내용을 읽지 않았다)를 fin 에 적용하는 것으로 본다 — C-11(켜기 판정 통과 시각부터 1회 + 3일) 뒤.
**R-8 이 키를 모르는 태그로 내려갈 때:** `v1.3.0` 이하 fin 은 `DISCORD_CHANNEL_ID_FINANCE_CHAT` 를 읽지 않는다 → intents 0 · 버튼만(안전 쪽 · [H] 의 fit 판단과 같다).

---

## 6. 요구사항 추적

| 요구 | 설계 항목 | 수용 기준 | 어디서 |
|---|---|---|---|
| **3-1** | P · A · B · Q · S · D · C · H · T | **§4-1 대응표 판정 양식**(행 = 명령 32 각각 · 자유 텍스트 4 분기 · 콜백 5 · `/브리핑` 세션·종목 · `/report` · 인가) — 로컬은 오류 경로까지(Δ13) · AI·Whooing·PDF 성공은 서버 병행 실사용 | 단위 · 로컬(UQ-1) · 서버(C-11) |
| **3-2**(= 2-2) | S · Q | 키 격리 · 플랫폼별 세션 · `chatBusy` 키(UQ-4 답대로) | 단위 |
| **3-3**(= 2-3) | K · F | 실행 중 키 비움 → 다음 메시지 무시 · 재시작 → 꺼짐 줄 · 4014 → 버튼 유지 · 켜기/끄기 판정 양식 | 단위 · 로컬 · `deploy` 테스트 |
| **3-4**(= 2-4) | §5 | 릴리즈 서버 조치 "없음" · 켜기는 별도 단계(UQ-5) | 릴리즈 기록 |
| DB 쓰기는 로컬만 | §8 | DB 쓰기 명령(N22)은 `pleiades_fin` 에서만 · Whooing 비움(X-5) | 로컬 |
| C-4 | H(C-4) · D2 | Discord 명령 → Discord 답 · 이중 발송 경로 0 | 코드 · 로컬 |
| 공통 | — | 8절 4종(`apps/finance` · `deploy/` · pleiades 루트는 chat 무변경이라 영향 없음) · 9-1 필수 · **머지 전 CI 전부(비필수 `apps-fin-test` 포함)** | 로컬 · CI |

---

## 7. 위험

| # | 위험 | 근거 | 대응 |
|---|---|---|---|
| **D3-R1** | 판단 분리가 텔레그램 동작을 바꾼다 — fin 은 판단 테스트가 거의 없다 · **특성 테스트가 그 PR 이 바꾸는 지점을 다 덮지 않으면 "무변경" 이 확인되지 않은 채 남는다**([A]#2) | N25 · N26 · N6 · N6a | 특성 테스트(T1~T18 · PR 귀속)를 **리팩터 전 커밋에서 먼저 통과**시키고 PR 안에서 그대로 유지([H] "서브에이전트 산출은 그대로 믿지 않는다" 선례) · 기준은 **호출열 동등**(B) · PR 셋 순차 |
| **D3-R2** | 특성 테스트가 서비스 유래 결함을 정답으로 고정한다(확정 뒤 원본 수정 실패의 거짓 "실패" 안내 포함 · [A2]#3) | N21 · Δ12 · B 각주 | UQ-3 · 결함 테스트는 "현재 동작" 이름으로 표시하고 고칠 때 별도 커밋 |
| **D3-R3** | 운영 DB 에 Discord 경로가 새 값 형태를 쓴다(전진 전용) | N9 · N22 | UQ-2 · 쓰기 형태는 단위 테스트로 고정 · 로컬 실측은 `pleiades_fin` 만 |
| **D3-R4** | 카테고리 수가 재배치 용량을 넘는다 | N18 · X-2 | 정적 안내(무표시 0) · X-2 결과로 §11 재오픈 |
| **D3-R5** | 대화 채널 = 알림 채널이라 알림에 단 답글·잡담이 소비·AI 로 처리된다 | C-7 정정 · N4 | 텔레그램도 한 chat 이었다(같은 의미) · 숫자 없는 2자 이하·질문 아님은 무응답(N4) · 실사용에서 불편하면 키 값만 바꿔 채널을 나눈다(**즉시**) |
| **D3-R6** | Discord 확정 소비가 Whooing·예산 경보를 낸다 — 병행 중 같은 소비를 두 플랫폼에서 입력하면 이중 기록 | N22 | 텔레그램과 같은 성질(사람이 두 번 친 것) · 병행 안내 문구는 켜기 런북에 1 줄 |
| R9 | 같은 토큰 두 세션 | [009] R9 | 로컬 토큰 가드(I-4′) · 검증 봇만 · L-0 "검증 fin 봇은 운영 서버 멤버가 아니다" |

---

## 8. 로컬 실측 계획 — **착수 전 사용자 승인 필요(UQ-1)**

**승인 요청 범위:** 검증 fin Discord 봇 포털 MESSAGE CONTENT 토글 켬/끔 · 검증 서버의 fin 알림 채널을 대화 채널로(로컬 루트 `.env` 에 `DISCORD_CHANNEL_ID_FINANCE_CHAT` = 그 값 · 사용자 기입) · fin 봇 프로세스 로컬 기동(`run.sh fin` · 검증 텔레그램 봇 포함) · **로컬 `pleiades_fin` 쓰기**(소비·거래·자산·전략·관심·알림설정 시험 행 — I-14) · 사용자가 Discord·텔레그램에 직접 입력.
**전제:** advisor 차단(I-8 · fin PATH shim) · Whooing 비움(X-5) · 서비스 DB 접근 0(I-7) · chat 은 봇·웹훅 메시지를 무시하므로 입력은 사용자가 한다 · Claude 는 로그·로컬 DB 를 읽어 판정한다.

| # | 시험 | 누가 | 판정 |
|---|---|---|---|
| L-0 | 착수 전 확인 | 사용자 · Claude | 검증 fin 봇은 운영 Discord 서버 멤버가 아니다 · `run.sh fin` 가드 통과 · X-5(Whooing 0) · 로컬 ADMIN·ALLOWED 수신자 = 검증 채팅/웹훅 |
| L-1 | 토글 꺼짐 + 키 채움 → 기동 | 사용자 토글 · Claude 기동 | 강등 줄 1 · `vest:` 버튼 동작(시험 RSU 없으면 "없는 RSU" 안내 — M-6b-4 선례) · ADMIN 알림 1 · 종료 코드 줄 0 |
| L-2 | 토글 켬 → 재기동 | 같음 | 켜짐 줄 1 · 준비 1 |
| L-3 | `!start` · `!help` · `!ai 질문`(오류 경로) · `!reset` · 영어 이름 17 중 읽기 명령 · `!report`(오류 경로) · `!backtest` | 사용자 입력 | 명령별 응답 · `!` 표기 안내 · 2000 넘는 응답 분할 |
| L-4 | 한글 28 대표 — 정확 일치 10 각각 + "이름 + 다른 말"(`현황 어때?`) · `분석 X` · `관심` / `관심삭제` / `관심목록` · `수입` / `수입 월급 300만` | 사용자 | 텔레그램과 같은 분기 · 자연어는 AI(오류 경로)·소비로 |
| L-5 | 소비 텍스트 → 카테고리 버튼(단일 · 다중 · 히스토리 · 전체 · `tx:change` · `allcat`) → 확정 · 취소 · **사진만 올리기** | 사용자 | 본문·키보드 교체 · 행 재배치(소비 카테고리 수만큼) · 취소 결과에 본인 안내가 쌓이지 않음(토스트 규칙) · 사진만 → 무응답 · 로컬 DB 행(`userId` 형태 UQ-2 답대로) |
| L-6 | 매수·매도 → `trade:` 확정/취소 · 만료 · 다른 사용자(있으면) | 사용자 | 본인 확인 · 만료 안내 · DB 행 |
| L-7 | 쓰기 명령 9(알림설정 · 예산설정 · 커스텀전략 삭제 · 자산추가·수정 · 전략 · 관심 · 관심삭제) | 사용자 | 로컬 DB 행 · 커스텀전략 등록은 AI(오류 경로) |
| L-8 | **`브리핑` · `브리핑 한국` · `!briefing` · `브리핑 <종목>`**(오류 경로 · 2회차 정정 [A]#7 — `!브리핑` 은 P2 상 명령이 아니다) | 사용자 | 실패 안내가 **요청 채널**로(텔레그램 아님 · D2) · `!ai` 표기 |
| L-9 | 같은 채널 연달아 2 건 · 커스텀전략 등록(60 s 대기) 중 버튼 | 사용자 | 순서 · ⏳ 안내 |
| L-10 | 실행 중 키 비움 → 메시지 → 재시작 | Claude(로컬 루트 `.env`) · 사용자 입력 | 비움 뒤 무시 · 재시작 뒤 꺼짐 줄 |
| L-11 | 텔레그램 병행 — 같은 명령·소비를 텔레그램에서 | 사용자 | 텔레그램 답은 텔레그램 · 세션·pending·`chatBusy` 섞이지 않음 · 텔레그램 `Transaction.userId` 값 무변경 |

**서버 병행에서만 확인(로컬 불가 · C-11 판정 행):** AI 대화·AI 거래·복수 소비 파싱·브리핑 성공 · 리포트 PDF 송신 · Whooing 전송 · 예산 경보 · 운영 카테고리 키보드.

---

## 9. 사용자 결정 질문 (UQ)

| # | 질문 | 권고안 | 무엇을 가르는가 | 되돌리기 | 우선순위 |
|---|---|---|---|---|---|
| **UQ-1** | §8 로컬 실측 범위 승인(검증 fin 봇 토글 · 로컬 키 기입 · fin 봇 기동 · `pleiades_fin` 쓰기 · 직접 입력) | **승인**(D-2 UQ-1 의 fin 판) | 3-1 의 로컬 판정 가능 여부 · 미승인이면 단위 테스트 + 서버 병행만으로 판정(C-11 부담 증가) | 로컬 자원 정리(**즉시**) | **높음 — PR-3 착수 전** |
| **UQ-2** | `Transaction.userId` 에 Discord 확정 행을 어떻게 쓰나 | **`discord:<userId>` 접두 문자열 · 텔레그램 행은 지금 그대로 · 스키마 무변경**([A]C2 확인) | 운영 DB 에 남는 값의 형태(전진 전용) · 마이그레이션 여부(③ 이면 `--prerelease` + 미정 배포 경로 007 Q74) | 코드 **즉시**(릴리즈 전) · 쓴 행은 남는다(읽는 곳 0) | **높음 — PR-3 전**(값을 쓰는 것은 Discord 경로 · PR-1a 는 텔레그램 값을 바꾸지 않는다) |
| **UQ-3** | 판단 분리 경로 안의 서비스 유래 결함 **4**(`알림설정` 한글 인자 N21 · 커스텀전략 오류 원문 노출 · plain `&amp;` 5 · **DB 쓰기 뒤 원본 수정 실패 → "실패" 거짓 안내 — 콜백 4 종**([A2]#3 · 아래 B 각주))을 어떻게 하나 | **Discord 판에는 옮기지 않는다**(올바른 인자 · 정적 안내 · escape 없는 plain) — **`알림설정` 은 A2 를 따르는 순간 Discord 판에서 저절로 고쳐진다**(`splitCommand` · [A]C10) · **텔레그램도 같이 고친다**(`/today` 선례 — pleiades 가 서비스한다) · **"X-4 로 실측된 뒤에만" 은 텔레그램 쪽 고침에만 걸린다** · 거짓 실패 안내는 Discord 어댑터가 확정 뒤 단계 실패를 삼키고 경고 줄(기존 fin `handleDiscordButton` 방식 `discord-interactions.ts:36-45`) · 고침은 특성 테스트 커밋 뒤 별도 커밋 | Q57("고치지 않는다")을 서비스 뒤에도 문자 그대로 둘지 · 병행 중 두 플랫폼 동작 차이(텔레그램만 고장)를 허용할지 | 커밋 revert(**즉시**(릴리즈 전)) | 중간 — PR-2 전 |
| **UQ-4** | 병행 중 텔레그램·Discord 에서 **AI 대화**(`/ai` · 질문 자유 텍스트)를 동시에 허용하나 | **허용**(키 = 상태 키 · 지금의 "chat 단위 1건"을 그대로 옮긴 것 · 텔레그램 안에서도 chat 이 다르면 이미 동시) | **(2회차 정정 · [A]#4)** AI **대화** 동시 실행이 플랫폼마다 1(병행 기간 최대 2 · D-3′ 뒤 1) · **다른 AI 경로(AI 거래 파싱 · 복수 소비 · 종목 분석 · 세션 브리핑 · 리포트 ai-review — N10 의 나머지)는 지금도 동시 실행 제한이 없다 — 이 질문은 그 경계를 바꾸지 않는다** · fit(전역 락 공유)과 정책이 다르다 | 키 함수(**즉시**(릴리즈 전)) | 낮음 — 답 없으면 권고안 |
| **UQ-5** | D-3 릴리즈·켜기를 D-2 정정 블록과 같게 하나(일반 Release · 서버 조치 "없음" · 켜기는 릴리즈 뒤 스크립트 · 대화 채널 키 = 알림 채널 값) | **같다**(정본 D-3 행 "3-2~3-4 = D-2 와 같다" 를 D-2 정정까지 승계로 읽는다) | 정본 D-3 행의 원래 2-4 괄호("서버 조치면 draft") 대신 D-2 정정을 따르는지 — 요구사항 해석이라 확인한다([A]#4 유형) | 문구(**즉시**) | 중간 — PR-3 전 |

**사용자가 하는 일(결정 아님 · 알림):** X-2(운영 카테고리 수) · X-3(PDF 크기) · X-6 · 로컬 실측 입력 · 운영 fin 봇 포털 토글 · 켜기 스크립트 실행과 판정 양식 · 릴리즈 PR 머지 · 병행 실사용(C-11).
**권고 확정(설계 PR 이 정한다 · [009] §9-2):** P2 · A2 · B 표(단계 열 · 호출열 보존 · 토스트 규칙) · Q(기본 직렬 · 배경 작업 안 typing) · S(키 3 종 · 비교 쪽 거부 유지) · D2 · C(chat 변경 0 · 이름 생략) · H2 · K · F(ADMIN) · T(T1~T18) · PR 분할 PS2(1a → 1b · 2 순차) · minor.

---

## 10. 정본 발행 때 고칠 것

| # | 정본 위치 | 정정 내용 | 형식 |
|---|---|---|---|
| **E-1** | `docs/specs/009-discord-only.md` §3 **L20**(fin "0") | 정정 블록: fin = **`Transaction.userId` 1**(쓰기 2 · 읽기 0 · 측정 [S] M10 — 이전 검색어가 `userId` 를 못 잡았다) · D-3 처리 = UQ-2 답 | 정정 블록 |
| **E-2** | §4-1 행 "슬래시만 명령 4" · "콜백 `tx:` … 많으면 select(L17)" | 정정 블록: 영어 이름 21 = `!` 명령(X-1) · 한글 28 = 정규식 그대로 · `tx:` 키보드 = Discord 어댑터 행 재배치(select 안 씀 · 운영 카테고리 수 X-2) | 정정 블록 |
| **E-3** | §6 D-3 정정 블록(신설) | 계보(`01_surveyor_fin.md` → 이 초안 → 감사 …) · 수단 정본 = 최종 회차 · chat 변경 0 · PR 분할 · UQ-5 답(릴리즈·켜기 형태) · 키 이름 · 되돌리기 바닥(키 비움 **즉시** · 코드 R-8 **중간** · 쓴 DB 행은 전진 전용) | 정정 블록 |
| E-4 | `docs/research/measured-facts.md` 009 절 | [S] M10 · M19 · M11 · M20 을 측정 명령과 함께 | 추가 |
| E-5 | `CLAUDE.md` 상태 · 문서 지도 | D-3 설계 확정 줄 | 갱신 |

---

## 11. 유효기간 — 이 초안을 다시 열 때

- X-2 가 카테고리 20 초과 → B 를 페이지 버튼(②) 또는 chat select 확장으로 다시 쓴다(그때 chat PR 이 생긴다)
- X-1 이 action 100 초과 → `tx:cat` 형식을 다시 본다(Discord 판만 짧은 키로 바꾸는 안 등)
- X-3 이 10 MiB 초과 → `/report` 를 정적 안내 대신 분할·링크로
- PR-1a(ctx 107) 특성 테스트가 판단 분리 범위를 감당하지 못한다(`vi.mock` 모듈 대체 + 가짜 Bot 캡처로도 지점을 다 잡지 못한다 · N6a · [A2]#2) → PS3 쪽으로 더 쪼개되, `expense.ts` 카테고리 경로를 둘 이상의 PR 이 고치지 않게 경계를 다시 긋는다([A]#1 유형)
- 감사가 P2(정규식 공유) · Q(대기열 근거 차이) · S(키 접두) · D2(notifier 주입)를 뒤집는다 → 해당 항목 재작성
- 응답 모델이 fit·fin 두 벌로 굳는다 → D-5(텔레그램 어댑터 제거) 때 chat 중립 타입으로 합칠지 재검토

---

## 12. 정정 블록 (1회차 → 2회차 · 감사 `03_auditor_d3.md`)

| [A]# | 1회차 기술(지우지 않는다 — `02_writer_d3.md` 에 그대로) | 왜 틀렸나 | 2회차 |
|---|---|---|---|
| **1 (정정)** | §0 · §5 "PR-1 ∥ PR-2 · PR-2 는 PR-1 과 독립(병행 가능 · 응답 모델 파일 충돌만 조정)" | PR-2 의 `decide*` 는 PR-1 이 만드는 응답 모델을 돌려준다(의존) · `ai.ts`(`/ai` 인자 `:445` · `/reset` `:462-466` 이 PR-1 의 세션 키를 쓴다)·`expense.ts`(`수입 …` `:633` 귀속 없음)를 두 PR 이 고친다 · 리뷰 부담은 PR-1 에 ctx 159/269 로 몰려 있었다 | 파일 귀속을 겹치지 않게 다시 나눔 · **PR-1a(소비·거래 + 모델·키 신설) → PR-1b(`ai.ts` 전체 · `/ai`·`/reset` 포함) · PR-2(나머지 · 1a 뒤 · 1b 와는 모델을 바꾸지 않을 때만 병행 — **3회차에서 1b 뒤 순차로 정정 · §12-2**)** · `수입 …` = PR-1a · 쪼개기 옵션 PS1~PS3 표 · N6a 신설 · §11 재오픈 조건에 ctx 근거 |
| **2 (정정)** | T "T1~T12" 만 · T "같은 grammY 호출열" ↔ B "텔레그램 = `editMessageText(…, {reply_markup})`" · S "텔레그램 `String(ctx.from?.id ?? 0)` · 비교도 문자열" | 판단 분리 PR 자신의 변경(`chatBusy`·세션·`/reset` · AI 응답 분할·HTML 폴백 `ai.ts:65-73` · 복수 소비 파싱 · `수입 …`)에 특성 테스트가 없었다 · `tx:cancel` 은 두 호출(`expense.ts:231-233`)이라 B 의 합치기와 T 의 호출열 보장이 모순 · 비교 쪽 기본값 `?? 0` 은 `from` 없는 콜백을 거부 → 허용으로 바꾼다 | **T13~T18 추가 + PR 귀속 표** · B 응답 모델 = **단계 열**(`toast`·`removeButtons`·`edit`·`reply`) · 텔레그램 어댑터는 단계마다 지금 호출 하나 → **호출열 동등이 정본**(1회차 합치기 안은 기각 칸으로) · S = 생성 쪽만 기본값 · 비교 쪽 `from` 없음 = 거부 · 경계 테스트 T17 · D3-R1 보강 · N17 에 두 호출 사실 |
| **3 (정정 · 근거)** | D2 얻는 것 "재시도·분할·라벨 정책이 notifier 하나로 같다" · D3 잃는 것 "크론·텔레그램 경로와 전달 정책(재시도 · `label`)이 갈린다" · "PR 에서 확인" | 텔레그램 transport 는 코어 분할·재시도·plain 폴백, Discord 봇 transport 는 어댑터 변환·분할·재시도 — 원래 다르다 · chat `ctx.reply` 는 Discord transport 와 **같은 파이프**라 D3 의 "재시도가 갈린다" 는 틀림 · 실제 차이는 실패 표면(notifier `sent=0` vs `ctx.reply` throw) · 정본 `009:337` 이 잡아 둔 `notifier.ts:13` 주석이 범위에 없었다 | W15·W16·W17 신설 · D2 얻는 것 = 요청 채널 의미 · 스위치 무관 · 한 함수 · **실패 표면이 텔레그램·크론과 같다** · D3 잃는 것 = **throw 로 바뀌어 `sendBriefing` catch 경로가 달라진다** · Discord 판 `sent=0` 경고 줄 · `notifier.ts:13` 주석 갱신 = PR-2 |
| **4 (정정)** | UQ-4 "advisor 동시 실행 최대 2(병행 기간만 · D-3′ 뒤 1)" | `chatBusy` 는 AI 대화만 막는다 — 나머지 AI 경로는 지금도 제한 없이 동시 | UQ-4 질문·가르는 것을 "AI **대화**" 로 한정 · 다른 경로는 지금도 제한 없음을 명시 · Q 표 같은 정정 · 권고(허용) 유지 |
| 5 (경미) | Q typing "fit `withTyping`(9 s) 형태를 fin 어댑터에" | `withTyping` 은 await 하는 작업을 감싼다 — fin 핸들러는 곧 돌아가 typing 이 바로 끝난다 | **반영** — 배경 작업 안 주기 호출 · 끝나면 해제(W18) · `withTyping` 은 기각 칸으로 |
| 6 (경미) | H "첨부만 있는 메시지는 텍스트가 비어 무시되고" | chat 은 텍스트·첨부 둘 다 빌 때만 버린다 — 첨부만이면 빈 텍스트로 fallback 에 온다(W19) | **반영** — "fin fallback 이 빈 텍스트를 무응답으로" · 라우팅 표 테스트 1 · L-5 에 사진만 |
| 7 (경미) | L-8 "`!브리핑` 세션·종목" | P2 상 `!브리핑` 은 명령이 아니다 — 시험이 설계대로 실패한다 | **반영** — `브리핑` · `브리핑 한국` · `!briefing` · `브리핑 <종목>` |
| 8 (경미) | W5 "쓰기는 확정 시각(`transactedAt: new Date()`)과 함께" | 복수 확정은 파싱 날짜(`expense.ts:589`) | **반영** — W5 단건/복수 구분 · T5 에 날짜 단언 |
| 9 (경미) | X-1 "착수 직전 측정" | `@default(cuid())` · txId 20 → 최장 53 < 100 을 정적으로 계산할 수 있다 | **반영** — X-1 을 "로컬 행 1 개로 cuid 길이 확인 1 줄" 로 낮춤 |
| 10 (경미) | PR-3 "사용법·되돌리기 안내 문구" 만 앱별 | 통과 안내 `:242`("`!today` · 자유 텍스트 · 사진")도 fit 전용 | **반영** — 앱별 표에 `:4-7` · `:241` · `:242` · fit 값은 지금 문구 그대로 · fin 통과 안내 문구 제안 |
| 11 (경미) | B "`answerCallbackQuery({text})` → `notice(text)`" | 텔레그램 토스트는 잠깐 뜨지만 chat `notice` 는 쌓이는 후속 메시지다 | **반영(대안 칸이 아니라 권고로)** — Discord 어댑터가 `toast` 를 모아 그 결정에 `edit`·`reply` 가 없을 때만 `notice` · 감사는 대안 칸을 제안했으나, 그대로 두면 `tx:` 결과마다 ephemeral 이 쌓여 C-11 실사용 판정에서 드러날 것이라 권고로 올렸다 — 재감사 대상 |
| 12 (경미) | §2 "R-8 하한 `v1.2.0`(그 아래는 chat 대기열·접두 없음)" | chat 대기열·접두는 `v1.3.0` 에 들어왔다 — `v1.2.0` 에도 없다 | **반영** — 괄호를 "그 아래는 텔레그램 없이 뜨지 못한다(D-1)" 로 · fin 에 중요한 사실은 §5 끝 문장 |
| 13 (경미) | N17 "본문 교체 15 · 키보드 교체 2" | 키보드 교체 2 는 15 안에 있다 | **반영** — "본문 교체 15(그중 키보드 함께 교체 2)" |
| C10 (보강) | UQ-3 "단 `알림설정` 은 X-4 로 결함이 실측된 뒤에만" | Discord 경로는 A2 를 따르는 순간 고쳐진다 — 조건이 어느 플랫폼에 걸리는지 모호 | UQ-3 에 "Discord 판은 A2 로 저절로 · X-4 조건은 텔레그램 고침에만" |
| (부수) | UQ-2 우선순위 "PR-1 전" | PR-1a 는 텔레그램 값을 바꾸지 않는다 — 값을 처음 쓰는 것은 PR-3 의 Discord 경로 | "PR-3 전" 으로 |

**정정 개수(감사 판정 기준):** 정정 4 · 경미 9 전부 반영(#11 은 감사 제안보다 한 단계 강하게 — 권고로) · 확인 보강 1(C10).
**재감사 범위(2회차 · 감사 지정):** §5 PR 표(PS 옵션 · 귀속 · 순서) · §4 T 표(T13~T18 · PR 귀속) · §4 B 응답 모델의 텔레그램 매핑(단계 열 · 토스트 규칙) · §4 S 비교 문안 · §4 D(D2/D3 근거) · UQ-4. 확인 C1~C10 은 대상 코드가 바뀌지 않았으므로 다시 보지 않는다.

---

## 12-2. 정정 블록 (2회차 → 3회차 · 재감사 `03_auditor_d3_r2.md`)

| [A2]# | 2회차 기술(지우지 않는다 — `02_writer_d3_r2.md` 에 그대로) | 왜 틀렸나 | 3회차 |
|---|---|---|---|
| 1 (경미) | PR-2 "`ai.ts`·`expense.ts`·`trade.ts` 는 건드리지 않는다" · 정규식 상수화(P)를 PR-2 에 · "둘 다 응답 모델을 import 만 하면 1b 와 병행 가능" | 한글 정규식 28 중 3 이 PR-1a 파일에 있다(`trade.ts:365,374` · `expense.ts:633`) · `/report` 가 응답 모델에 파일 단계를 **반드시** 더하므로 병행 조건이 늘 거짓 | 정규식 3 상수화 = PR-1a · PR-2 = 나머지 25 · PR-2 에 파일 단계 추가 명시 · **PR-2 = PR-1b 뒤 순차**(대안 (가) "1a 모델에 파일 단계 선반영" 은 PR-2 행에 남김) |
| 2 (경미) | T "advisor·DB 는 주입/스텁" · §11 "주입 없이는 못 선다" | 판단 분리 전 코드에는 주입할 자리가 없다(비공개 함수 · 모듈 import 직접 호출) — 특성 테스트는 모듈 대체로 선다 | `vi.mock` 모듈 대체 + 가짜 Bot 캡처 · 선례 줄 번호 · 모듈 전역 pending 리셋 · promise flush · `budget-alert` 통째 대체 · §11 문안 |
| 3 (경미) | B 단계 열 · UQ-3 결함 3 | DB 쓰기 뒤 원본 수정 실패가 "거래 실패" 로 보이는 서비스 결함(콜백 4 종 한 `try`)이 단계 열을 지금 순서대로 부르면 Discord 로 옮겨 간다 | B 각주 · UQ-3 결함 **4** · D3-R2 · 대안(Discord 어댑터가 확정 뒤 단계 실패를 삼킴) — **권고(단계 열 · 토스트 규칙)는 무변경** |
| 4 (경미) | PS1 "D-2 PR-2(fit 전체 91 · [D2] N5)" | 91 은 fit grammY ctx 참조 전체다 — diff 크기가 아니다 | "fit 의 grammY ctx 참조 전체 91(크기 비교용)" |
| C6 (참고) | PR-1a 의 pending 형태에 플랫폼 = 키에만 | `createTransaction` 은 키를 몰라 PR-3 이 `discord:` 접두를 붙일 자리가 없다 | PR-1a 행에 "pending 값에도 플랫폼(또는 DB 표기 ID)" 1 구 |

**정정 개수:** 정정 0 · 경미 4 + 참고 1 반영. **권고 무변경** — PS2(1a → 1b) · B 단계 열 · 토스트 규칙 · S · D2 그대로. 바뀐 것은 PR-2 의 순서 칸(1b 와 병행 가능 → 1b 뒤 순차)과 문안뿐이다. 재감사 지정에 따라 재감사 없이 UQ-1~UQ-5 를 사용자 질문으로 넘긴다.
