# 009 D-4 측정 — 사용자·AI 에게 보이는 "텔레그램" 문구

**가정을 뒤집는 발견 3줄**
1. **fin 프롬프트는 "텔레그램" 글자만 바꾸면 끝나지 않는다.** HTML·길이 지시는 없지만(형식 지시 L59-64 는 플랫폼 무관) `/ai`·`/reset`(L162-163)이 Discord 에서 거짓이고, AI 답은 `verbatim` 이라 `!` 변환(`toDiscordCommandText`)을 타지 않는다.
2. **fit usage 4행은 새 버전 행을 만들지 않는다** — `codeHash` 는 본문만 해시하고 usage 는 DB 에 없다. `system.ts:78` 한 줄만 `system` 키에 행을 하나 쓴다. active 가 웹 수정본이면 draft 로만 들어가 AI 입력은 그대로다(운영 DB 현재 값은 미측정).
3. **그물에 없던 대상:** 배포 양식의 사람 확인 줄(`release-inplace.sh:338`)은 텔레그램 폴링이 꺼진 지금 거짓인 지시인데 테스트 고정 0 · MCP 오류 4행(`spending.ts`)은 봇에 없는 경로(이체·거래 수정)를 안내한다 — 텔레그램이 켜져 있을 때도 거짓이었다.

- 측정 기준: 브랜치 `chore/418-1` · HEAD `40c7ef40cd2f` · 추적 파일만(`git grep`). 서버·운영 DB 무접촉.
- 원격 상태(앱 `.env` `TELEGRAM_POLLING=off` · 라우트 4 = Discord)는 호출자 배경이고 **이 측정이 확인한 것이 아니다.**

## M1. 분류 전수

```bash
git grep --text -n -i -E '텔레그램|telegram' -- apps/finance apps/fitness packages deploy tools   # 1646 줄 — 아래 표의 합과 일치
```

| 영역 | A AI 입력 | B 사용자 | C 운영자 | D 주석·문서 | E 동작 코드 | 소계(테스트 제외) | 테스트(별도) | 합계 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| fin | 9 | 7 | 18 | 459 | 184 | 677 | 196 | 873 |
| fit | 1 | 7 | 18 | 240 | 102 | 368 | 136 | 504 |
| packages | 0 | 0 | 2 | 37 | 15 | 54 | 32 | 86 |
| deploy | 0 | 0 | 25 | 23 | 25 | 73 | 77 | 150 |
| tools | 0 | 0 | 2 | 3 | 12 | 17 | 16 | 33 |
| **합** | **10** | **14** | **65** | **762** | **338** | **1189** | **457** | **1646** |

**집계 규칙(판정에 영향이 있는 것):**
- 테스트 = 경로에 `__tests__` · `.test.` · `/test_` + `apps/fitness/scripts/verify-food-edit-pending.ts`(`npm run test` 체인 · 009 L26). lock 파일 hit 0.
- A·B·C = 아래 표의 손 열거. 나머지는 스크립트 판정: 문서 경로(`apps/*/docs`·`.claude`·`.github`·`deploy`·`ecosystem`·`*.md`·`*.html`) 또는 주석으로 시작 = D · 코드 줄인데 낱말이 뒤 주석에만 있으면 D · 그 외 E.
- 서비스 사본 `apps/*/.github`(39 · 비활성) · `apps/*/deploy`·`ecosystem`(4 · I-19 실행 금지)은 D 에 들어 있다.
- A·B·C 를 위해 **문자열로 쓰인 비주석 줄 전부를 따로 뽑아 대조**했다. 낱말 없이 텔레그램을 뜻하는 문구(`/ai` · "봇" 등)는 grep 에 안 잡힌다 — `/ai`·`/reset` 은 M3 에서 찾았고, 그 밖의 전수는 **미측정**.

### A. AI 입력 — 10행

| 앱 | file:line | 원문 | 테스트 고정 |
|---|---|---|---|
| fin | `apps/finance/src/lib/ai/system-prompt.ts:58` | 응답은 텔레그램과 웹 모두에서 표시된다. 아래 포맷을 반드시 지켜야 한다: | 없음 |
| fin | `apps/finance/src/lib/ai/system-prompt.ts:119` | - create_custom_strategy: 자연어로 커스텀 매매 전략 등록. AI가 조건(price/rsi/macd_signal/sma_cross/bb_position/change_pct) 파싱 후 저장, cron 이 감시 → 텔레그램 알림. 예: "SOXL 40달 … | 없음 |
| fin | `apps/finance/src/lib/ai/system-prompt.ts:129` | - 오직 이 시스템 프롬프트의 "사용 가능한 도구", "텔레그램 봇 커맨드", "알림 시스템 현황" 섹션과 MCP 도구 목록만 신뢰하라 | 테스트 없음 · **같은 파일 :133 제목을 이름으로 가리킨다**(둘을 같이 바꿔야 문장이 맞다) |
| fin | `apps/finance/src/lib/ai/system-prompt.ts:133` | ## 텔레그램 봇 커맨드 (사용자 안내용) | 테스트 없음 · :129 가 이 제목을 인용 |
| fin | `apps/finance/src/mcp/server.ts:451` | '자연어로 커스텀 매매 전략 등록. 예: "SOXL이 40달러 이하 + RSI 30 이하 시 알림". AI가 자동으로 조건(price/rsi/macd_signal/sma_cross/bb_position/change_pct)으로 파싱. cron이 조건 만족 여부 감시 → … | 없음 |
| fin | `apps/finance/src/mcp/tools/spending.ts:223` | if (args.type) return toolError('이체 거래는 텔레그램 봇 또는 웹에서 입력해주세요. (자산 잔액 연동 필요)') | 없음 |
| fin | `apps/finance/src/mcp/tools/spending.ts:224` | if (category.type === 'transfer') return toolError('이체 카테고리는 텔레그램 봇 또는 웹에서 입력해주세요.') | 없음 |
| fin | `apps/finance/src/mcp/tools/spending.ts:262` | if (existing.type) return toolError('이체 거래는 웹 또는 텔레그램에서 수정해주세요. (자산 잔액 연동 필요)') | 없음 |
| fin | `apps/finance/src/mcp/tools/spending.ts:315` | if (existing.type) return toolError('이체 거래는 웹 또는 텔레그램에서 삭제해주세요. (자산 잔액 역보정 필요)') | 없음 |
| fit | `apps/fitness/src/lib/prompts/defaults/system.ts:78` | - estimatedIntakeCalories 는 사용자가 텔레그램/웹에 자유 텍스트로 입력한 음식을 AI 가 추정한 값 (M14 Phase 1). ±30% 오차 가능. 절대값보다 하루/주간 추세, 결손 방향으로 판단. 사용자가 웹에서 수동 정정한 값은 상대적으로 더  … | 없음 |

`server.ts:451` = MCP 도구 설명 · `spending.ts` 4 = 도구 오류 결과(둘 다 모델이 읽는다). fit AI 입력은 `system.ts:78` 하나 · `reports.ts`·`activity-eval.ts` 0건.

### B. 사용자에게 보이는 문구 — 14행

| 앱 | file:line | 원문 | 테스트 고정 |
|---|---|---|---|
| fin | `apps/finance/src/app/alerts/history/page.tsx:11` | sub="텔레그램으로 발송된 알림 히스토리 (기간·종류·티커 필터)" | 없음 |
| fin | `apps/finance/src/app/strategies/page.tsx:11` | sub="자연어로 등록한 조건을 시스템이 감시 → 텔레그램 알림" | 없음 |
| fin | `apps/finance/src/components/category/CategoryEditPanel.tsx:179` | <p className="text-[11px] text-dim mt-1">텔레그램 자연어 입력 시 자동 분류에 사용됩니다.</p> | 없음 |
| fin | `apps/finance/src/components/category/CategoryForm.tsx:153` | <p className="text-[11px] text-dim mt-1">텔레그램 자연어 입력 시 자동 분류에 사용됩니다.</p> | 없음 |
| fin | `apps/finance/src/lib/alert-config/categories.ts:98` | price_drop_pct: '일일 변동률이 이 값 이하이면 텔레그램 급락 알림', | 없음 |
| fin | `apps/finance/src/lib/alert-config/categories.ts:99` | price_surge_pct: '일일 변동률이 이 값 이상이면 텔레그램 급등 알림', | 없음 |
| fin | `apps/finance/src/lib/alert-config/categories.ts:107` | custom_strategy_alerts: '/strategies 에 등록한 조건 발동 시 텔레그램 알림', | 없음 |
| fit | `apps/fitness/src/app/lifestyle/lifestyle-client.tsx:153` | 텔레그램에서 &quot;점심 김치찌개 밥&quot; 입력 or 위 <b>📷 사진 등록</b> 버튼으로 자동 기록. | 없음 |
| fit | `apps/fitness/src/app/settings/profile/profile-client.tsx:443` | hint="아침 06:30 부상 위험/readiness 저하 시 조정 제안 Telegram push. Phase 2 부터 Accept/Reject flow." | 없음 |
| fit | `apps/fitness/src/components/prompts/PromptDetailClient.tsx:199` | 저장하고 활성화하면 웹 채팅 · 텔레그램 · 리포트 · 운동 평가에 바로 적용됩니다. 이어지던 대화는 다음 질문부터 새로 시작합니다. 사용자 프로필 · HR 존 · 현재 시각 · 개인 목표는 이 프롬프트 뒤에 자동으로 붙습니다. | 없음 |
| fit | `apps/fitness/src/lib/prompts/definitions.ts:41` | usage: "모든 AI 응답의 바탕 — 웹 채팅 · 텔레그램 · 리포트 · 운동 평가", | 없음 |
| fit | `apps/fitness/src/lib/prompts/definitions.ts:50` | usage: "매일 아침 텔레그램 · 리포트 화면", | 없음 |
| fit | `apps/fitness/src/lib/prompts/definitions.ts:59` | usage: "매일 저녁 텔레그램 · 리포트 화면", | 없음 |
| fit | `apps/fitness/src/lib/prompts/definitions.ts:68` | usage: "매주 월요일 텔레그램 · 리포트 화면", | 없음 |

노출 경로: `categories.ts` → `api/alerts/config/route.ts:25` → `AlertConfigEditor.tsx:310-311` · `definitions.ts` usage → `settings/prompts/page.tsx:24` · `[key]/page.tsx:55` · `GET /api/prompts`. **봇 답장 본문 hit 0**(봇 답장에는 "텔레그램" 낱말이 없다 · 줄 분류 결과).

### C. 운영자에게 보이는 문구 — 65행

| 앱 | file:line | 원문 | 테스트 고정 |
|---|---|---|---|
| fin | `apps/finance/src/bot/index.ts:37` | throw new Error('TELEGRAM_BOT_TOKEN 환경변수가 설정되지 않았습니다') | 없음 |
| fin | `apps/finance/src/bot/middleware/auth.ts:23` | console.error('[bot] TELEGRAM_ALLOWED_CHAT_IDS 미설정') | 없음 |
| fin | `apps/finance/src/bot/notifications/discord-interactions.ts:69` | console.log('[discord-fin] 봇 토큰·채널 미설정 — Discord 버튼 수신 안 함(텔레그램 버튼은 그대로)') | 없음 |
| fin | `apps/finance/src/bot/notifications/notifier.ts:65` | if (bot.api === undefined) throw new Error('텔레그램 토큰 없이 텔레그램 transport 를 만들 수 없다') | 없음 |
| fin | `apps/finance/src/bot/notifications/rsu.ts:182` | console.warn(`[notification] D-day RSU 확정 알림 수신자 0 — TELEGRAM_ALLOWED_CHAT_IDS 또는 Discord 봇 설정 미비 (${rsu.id})`) | 없음 |
| fin | `apps/finance/src/bot/notifications/scheduler.ts:38` | console.log('[notification] ALLOWED 수신자 0 (TELEGRAM_ALLOWED_CHAT_IDS · Discord 웹훅 모두 비어 있음) — 스케줄은 등록하고 실행 때마다 건너뜀') | 없음 |
| fin | `apps/finance/src/bot/standalone.ts:69` | htmlContent(`⚠️ <b>fin 텔레그램 수신 중단</b>\n${reason} — 크론·Discord 는 계속 돈다.`), | 없음 |
| fin | `apps/finance/src/bot/standalone.ts:72` | if (r.sent === 0) console.warn(`[bot] 텔레그램 중지 알림 미전송 (sent=0/total=${r.total} — Discord 라우트가 아니면 수신자 0)`) | 없음 |
| fin | `apps/finance/src/bot/telegram-polling.ts:37` | console.warn(`[bot] 텔레그램 폴링 상태 기록 실패: ${sanitizeError(err)}`) | 없음 |
| fin | `apps/finance/src/bot/telegram-polling.ts:44` | console.error(`[bot] 텔레그램 폴링 상태 파일 삭제도 실패 — 다음 기동 전에 손으로 지운다: ${sanitizeError(rmErr)}`) | 없음 |
| fin | `apps/finance/src/bot/telegram-polling.ts:99` | ? '[bot] 텔레그램 토큰 없음 — 폴링 안 함(크론·Discord 는 그대로)' | **고정** deploy/test_telegram_polling.py:68,447 — 판정 문자열 |
| fin | `apps/finance/src/bot/telegram-polling.ts:100` | : '[bot] 텔레그램 폴링 꺼짐(TELEGRAM_POLLING=off)', | **고정** deploy/test_telegram_polling.py:50,446 · apps/finance/src/bot/__tests__/telegram-polling.test.ts:86 — 판정 문자열(바꾸면 안 된다) |
| fin | `apps/finance/src/bot/telegram-polling.ts:134` | console.error(`[bot] 텔레그램 토큰 무효(401) — 폴링을 멈춘다(크론·Discord 는 그대로): ${sanitizeError(err)}`) | **고정** deploy/test_telegram_polling.py:72,449 — 판정 문자열 |
| fin | `apps/finance/src/bot/telegram-polling.ts:138` | await Promise.resolve(opts.onFatal?.('텔레그램 토큰 무효(401)')).catch((e: unknown) => | **고정** apps/finance/src/bot/__tests__/telegram-polling.test.ts:122 |
| fin | `apps/finance/src/bot/telegram-polling.ts:139` | console.error(`[bot] 텔레그램 중지 알림 실패: ${sanitizeError(e)}`), | **고정** apps/finance/src/bot/__tests__/telegram-polling.test.ts:173 |
| fin | `apps/finance/src/bot/telegram-polling.ts:152` | void loop().catch((err) => console.error(`[bot] 텔레그램 폴링 루프 오류: ${sanitizeError(err)}`)) | 없음 |
| fin | `apps/finance/src/lib/ai/advisor-monitor.ts:284` | '[advisor-monitor] TELEGRAM_ADMIN_CHAT_IDS 미설정 → 관리자 alert 발송 스킵. ' + | 없음 |
| fin | `apps/finance/src/lib/ai/advisor-monitor.ts:285` | '이 env 는 봇 사용자 화이트리스트 (TELEGRAM_ALLOWED_CHAT_IDS) 와 분리 관리해야 함 ' + | 없음 |
| fit | `apps/fitness/src/bot/commands/food-photo.ts:36` | reject(new Error(`텔레그램 파일 다운로드 실패 (${res.statusCode ?? "?"})`)); | 없음 |
| fit | `apps/fitness/src/bot/commands/food-photo.ts:47` | req.destroy(new Error(`텔레그램 다운로드 timeout (${DOWNLOAD_TIMEOUT_MS}ms)`)); | 없음 |
| fit | `apps/fitness/src/bot/commands/food-photo.ts:106` | throw new Error("텔레그램 파일 경로 없음"); | 없음 |
| fit | `apps/fitness/src/bot/index.ts:32` | if (!token) throw new Error("TELEGRAM_BOT_TOKEN 환경변수가 필요합니다."); | 없음 |
| fit | `apps/fitness/src/bot/notifications/auto-adjust.ts:405` | "[auto-adjust] 전송 대상 없음 (TELEGRAM_ALLOWED_CHAT_IDS 미설정?)", | 없음 |
| fit | `apps/fitness/src/bot/notifications/discord-interactions.ts:79` | console.log("[discord-fit] 봇 토큰·채널 미설정 — Discord 버튼 수신 안 함(텔레그램 버튼은 그대로)"); | 없음 |
| fit | `apps/fitness/src/bot/notifications/notifier.ts:69` | if (bot.api === undefined) throw new Error("텔레그램 토큰 없이 텔레그램 transport 를 만들 수 없다"); | 없음 |
| fit | `apps/fitness/src/bot/notifications/scheduler.ts:30` | `[bot-cron] ${label} 전송 대상 없음 (TELEGRAM_ALLOWED_CHAT_IDS 미설정?)` | 없음 |
| fit | `apps/fitness/src/bot/standalone.ts:59` | html(`⚠️ <b>fit 텔레그램 수신 중단</b>\n${reason} — 크론·Discord 는 계속 돈다.`), | 없음 |
| fit | `apps/fitness/src/bot/standalone.ts:62` | if (r.sent === 0) console.warn(`[bot] 텔레그램 중지 알림 미전송 (sent=0/total=${r.total} — Discord 라우트가 아니면 수신자 0)`); | 없음 |
| fit | `apps/fitness/src/bot/telegram-polling.ts:37` | console.warn(`[bot] 텔레그램 폴링 상태 기록 실패: ${sanitizeError(err)}`); | 없음 |
| fit | `apps/fitness/src/bot/telegram-polling.ts:44` | console.error(`[bot] 텔레그램 폴링 상태 파일 삭제도 실패 — 다음 기동 전에 손으로 지운다: ${sanitizeError(rmErr)}`); | 없음 |
| fit | `apps/fitness/src/bot/telegram-polling.ts:99` | ? "[bot] 텔레그램 토큰 없음 — 폴링 안 함(크론·Discord 는 그대로)" | **고정** deploy/test_telegram_polling.py:68,447 — 판정 문자열 |
| fit | `apps/fitness/src/bot/telegram-polling.ts:100` | : "[bot] 텔레그램 폴링 꺼짐(TELEGRAM_POLLING=off)", | **고정** deploy/test_telegram_polling.py:50,446 · apps/fitness/src/bot/__tests__/telegram-polling.test.ts:86 — 판정 문자열(바꾸면 안 된다) |
| fit | `apps/fitness/src/bot/telegram-polling.ts:134` | console.error(`[bot] 텔레그램 토큰 무효(401) — 폴링을 멈춘다(크론·Discord 는 그대로): ${sanitizeError(err)}`); | **고정** deploy/test_telegram_polling.py:72,449 — 판정 문자열 |
| fit | `apps/fitness/src/bot/telegram-polling.ts:138` | await Promise.resolve(opts.onFatal?.("텔레그램 토큰 무효(401)")).catch((e: unknown) => | **고정** apps/fitness/src/bot/__tests__/telegram-polling.test.ts:122 |
| fit | `apps/fitness/src/bot/telegram-polling.ts:139` | console.error(`[bot] 텔레그램 중지 알림 실패: ${sanitizeError(e)}`), | **고정** apps/fitness/src/bot/__tests__/telegram-polling.test.ts:173 |
| fit | `apps/fitness/src/bot/telegram-polling.ts:152` | void loop().catch((err) => console.error(`[bot] 텔레그램 폴링 루프 오류: ${sanitizeError(err)}`)); | 없음 |
| deploy | `deploy/discord-switch.cjs:142` | return SWITCHES.map((k) => `${k.replace(/^NOTIFY_\|_CHANNEL$/g, '')}=${values[k] === 'discord' ? 'discord' : 'telegram'}`).join(' ') | 없음 |
| deploy | `deploy/discord-switch.cjs:148` | out('사용법: set <파일> <discord\|telegram>') | 없음 |
| deploy | `deploy/discord-switch.sh:6` | #        deploy/discord-switch.sh off                 백업 → 스위치 4줄 비움 → 두 앱 봇 재시작 (되돌리기 · 텔레그램) | 없음 |
| deploy | `deploy/discord-switch.sh:142` | stop 3 "$1 — 텔레그램으로 되돌렸다" | **고정** deploy/test_discord_switch.py:203,249,269 |
| deploy | `deploy/discord-switch.sh:145` | stop 3 "$1 · 스위치는 텔레그램이지만 봇 재시작 실패 — 앞서 뜬 봇은 discord 설정일 수 있다 · pm2 확인 후 off" | 없음 |
| deploy | `deploy/discord-switch.sh:216` | [[ "$cmd" == on ]] \|\| stop 3 "봇 재시작 실패 · pm2 상태 확인(스위치는 이미 텔레그램)" | 없음 |
| deploy | `deploy/discord-switch.sh:222` | emit_form "통과 — 텔레그램으로 돌아왔다" | **고정** deploy/test_discord_switch.py:285 |
| deploy | `deploy/notify-deploy.cjs:138` | const via = discordError ? ` (Discord 실패 ${discordError} — 텔레그램으로 대신)` : '' | **고정** deploy/test_notify_deploy.py:116 |
| deploy | `deploy/release-inplace.sh:338` | form "   사람 확인: 웹 화면 · 텔레그램 $([[ $APP == fin ]] && echo '현황' \|\| echo '/today') — 예/아니오 를 덧붙인다" | **미고정** — `git grep -F "사람 확인"` 은 이 줄 + 문서뿐 · deploy/test_release_inplace.py 0건 |
| deploy | `deploy/t2-check.sh:255` | if (!token) { console.log(dir, "TELEGRAM_BOT_TOKEN 없음"); process.exit(0) } | 없음 |
| deploy | `deploy/telegram-polling.sh:2` | # telegram-polling.sh — 앱 텔레그램 수신(롱폴링) 끄기·켜기 (009 D-2′ · #376 · fin D-3′ · #411). 서버에서 사용자가 실행한다(Claude 는 서버에 닿지 않는다 · I-3). | 없음 |
| deploy | `deploy/telegram-polling.sh:4` | # 사용:  deploy/telegram-polling.sh <fit\|fin> off [--dry-run]   백업 → 앱 .env TELEGRAM_POLLING=off → pleiades-<앱>-bot 재시작 → 판정 | 없음 |
| deploy | `deploy/telegram-polling.sh:5` | #        deploy/telegram-polling.sh <fit\|fin> on [--dry-run]    백업 → 키 비움 → pleiades-<앱>-bot 재시작 → 판정 (되돌리기 · 밀린 업데이트는 버린다) | 없음 |
| deploy | `deploy/telegram-polling.sh:8` | # 토큰·아웃바운드 텔레그램은 그대로다(폴링만). 출력: 판정 양식만 — 값·경로는 내지 않는다. 백업은 ~/pleiades-private/(700). | 없음 |
| deploy | `deploy/telegram-polling.sh:18` | POLL_OFF_LINE="[bot] 텔레그램 폴링 꺼짐(TELEGRAM_POLLING=off)" | **고정** deploy/test_telegram_polling.py:50,450 |
| deploy | `deploy/telegram-polling.sh:21` | NO_TOKEN_LINE="[bot] 텔레그램 토큰 없음" | **고정** deploy/test_telegram_polling.py:447 짝(앱 문자열) |
| deploy | `deploy/telegram-polling.sh:22` | UNAUTHORIZED_LINE="[bot] 텔레그램 토큰 무효(401)" | **고정** deploy/test_telegram_polling.py:449~450 |
| deploy | `deploy/telegram-polling.sh:28` | PASS_HINT="텔레그램 /today 무응답 · Discord !today 응답을 1회 확인" ;; | 없음 |
| deploy | `deploy/telegram-polling.sh:30` | PASS_HINT="텔레그램 /help 무응답 · Discord !help 응답을 1회 확인" ;; | 없음 |
| deploy | `deploy/telegram-polling.sh:153` | form "   [$phase] 재시작 뒤 텔레그램 폴링 꺼짐 $poll_off · 폴링 시작 $poll_start (밀린 업데이트 버림 $drop) (대기 ${waited}s · 상한 ${READY_WAIT}s)" | **고정** deploy/test_telegram_polling.py:178,309 |
| deploy | `deploy/telegram-polling.sh:154` | form "   [$phase] 텔레그램 토큰 없음 $no_token · 토큰 무효(401) $unauth" | **고정** deploy/test_telegram_polling.py:179,299 |
| deploy | `deploy/telegram-polling.sh:184` | stop 3 "$1 — 키를 비우고 텔레그램 폴링을 다시 켰다(병행 상태 · 위 줄 확인 후 다시 off)" | **고정** deploy/test_telegram_polling.py:308 |
| deploy | `deploy/telegram-polling.sh:282` | apply "" on on \|\| stop 3 "켜기 판정 실패 — 위 줄 확인(폴링 시작 0 이면 텔레그램 왕복을 상한 안에 못 봤다 · 로그를 더 본다)" | 없음 |
| deploy | `deploy/telegram-polling.sh:283` | emit_form "통과 — 텔레그램 폴링 켜짐(병행)$(discord_note)" | **고정** deploy/test_telegram_polling.py:205,232 |
| deploy | `deploy/telegram-polling.sh:290` | emit_form "통과 — 텔레그램 폴링 꺼짐($app 은 Discord 만 받는다 · $PASS_HINT)" | **고정** deploy/test_telegram_polling.py:185,424 — 단 `$PASS_HINT` 앞까지만 |
| packages | `packages/notify/src/discord-bot.ts:54` | if (!Array.isArray(rows)) throw new Error('@pleiades/notify: 알 수 없는 components 형태 — 텔레그램 inline_keyboard 만 지원'); | 없음 |
| packages | `packages/notify/src/platform-env.ts:138` | console.warn('[notify] 루트 .env 를 읽을 수 없다 — 플랫폼 설정 없이 진행(알림은 텔레그램)'); | 없음 |
| tools | `tools/local/check_env.py:201` | out.append(Problem("TELEGRAM_BOT_TOKEN", "검증 봇 id 허용 목록에 없다 — 서비스 봇이면 409 로 서비스 수신이 끊긴다 (I-4)")) | 키만 고정(tools/local/test_check_env.py:86) · 문구 미고정 |
| tools | `tools/local/check_env.py:203` | out.append(Problem("TELEGRAM_BOT_TOKEN", "다른 앱과 같은 봇이다 — 로컬끼리 409 (L-4)")) | 키만 고정(tools/local/test_check_env.py:81) · 문구 미고정 |

- `food-photo.ts:36,47,106` 은 사용자에게 안 간다 — 잡아서 `console.error` 뒤 정적 안내(`food-photo.ts:57-60`). 텔레그램 수신 경로에서만 돈다.
- `standalone.ts` `:69`(fin · ADMIN) · `:59`(fit · ALLOWED)는 알림 본문이지만 "텔레그램 수신 중단"을 알리는 운영 경고라 C 로 뒀다. fit 은 ALLOWED 라 일반 채널로 간다.
- `telegram-polling.sh:2,4,5,8` · `discord-switch.sh:6` 은 주석이지만 `usage()` 가 출력한다(`:39` · `:18`).
- 로그 속 env 키 이름(`TELEGRAM_ALLOWED_CHAT_IDS` 등)은 그 키가 D-5 까지 있으므로 키 이름 자체는 사실이다.

### D. 주석·문서 — 건수만

합계는 위 표. `apps/finance/docs` 222 · `apps/fitness/docs` 111 이 대부분이다(서비스 유래 이력 문서).

### E. 동작 코드 — 파일별 건수 (D-5 대상)

- **fin:** src/bot/notifications/notifier.ts 19 · src/bot/utils/telegram-reply.ts 15 · src/bot/commands/ai.ts 13 · src/bot/commands/expense.ts 9 · src/bot/commands/trade.ts 9 · src/bot/standalone.ts 8 · src/bot/telegram-polling.ts 8 · src/bot/commands/budget.ts 6 · src/bot/commands/networth.ts 6 · src/bot/commands/briefing.ts 5 · src/bot/commands/custom-strategy.ts 5 · src/bot/commands/watchlist.ts 5 · src/bot/index.ts 5 · .env.example 4 · src/bot/commands/alert.ts 4 · src/bot/commands/portfolio.ts 4 · src/bot/commands/price.ts 4 · src/bot/commands/start.ts 4 · src/bot/commands/strategy.ts 4 · src/bot/core/state-key.ts 4 · src/bot/commands/analysis.ts 3 · src/bot/commands/backtest.ts 3 · src/bot/commands/report.ts 3 · src/bot/notifications/quarterly-report.ts 3 · src/bot/notifications/ta-signal-alert.ts 3 · src/lib/ai/advisor-monitor.ts 3 · src/bot/discord/router.ts 2 · src/bot/notifications/active-review.ts 2 · src/bot/notifications/briefing.ts 2 · src/bot/notifications/monthly-report.ts 2 · src/bot/notifications/scheduler.ts 2 · src/bot/utils/formatter.ts 2 · scripts/smoke-bot-bundle.mjs 1 · src/bot/commands/price-format.ts 1 · src/bot/middleware/auth.ts 1 · src/bot/notifications/alert-dispatcher.ts 1 · src/bot/notifications/budget-alert.ts 1 · src/bot/notifications/custom-strategy-alert.ts 1 · src/bot/notifications/monthly.ts 1 · src/bot/notifications/networth-snapshot.ts 1 · src/bot/notifications/price-alert.ts 1 · src/bot/notifications/quarterly.ts 1 · src/bot/notifications/rsu.ts 1 · src/bot/utils/markdown.ts 1 · src/mcp/logger.ts 1
- **fit:** src/bot/notifications/notifier.ts 10 · src/bot/utils/telegram-reply.ts 10 · src/bot/commands/food-photo.ts 9 · src/bot/index.ts 9 · src/bot/standalone.ts 8 · src/bot/telegram-polling.ts 8 · src/bot/commands/ai.ts 6 · prisma/migrations/20260716054043_workout_adjustment/migration.sql 4 · src/bot/commands/food-edit-callback.ts 4 · src/bot/core/state-key.ts 4 · prisma/schema.prisma 3 · src/bot/commands/report.ts 3 · .env.example 2 · src/bot/commands/run.ts 2 · src/bot/commands/sleep.ts 2 · src/bot/commands/start.ts 2 · src/bot/commands/sync.ts 2 · src/bot/commands/today.ts 2 · src/bot/commands/weight.ts 2 · src/bot/notifications/auto-adjust-cron.ts 2 · src/bot/notifications/auto-adjust.ts 2 · src/bot/notifications/discord-interactions.ts 2 · src/bot/commands/food-edit-format.ts 1 · src/bot/middleware/auth.ts 1 · src/bot/notifications/scheduler.ts 1 · src/mcp/logger.ts 1
- **deploy:** deploy/telegram-polling.sh 9 · deploy/env/finance.env.template 4 · deploy/notify-deploy.cjs 3 · deploy/discord-switch.sh 2 · deploy/env/fitness.env.template 2 · deploy/t2-check.sh 2 · deploy/discord-switch.cjs 1 · deploy/release-inplace.sh 1 · deploy/telegram-polling.cjs 1
- **packages:** packages/notify/src/telegram.ts 8 · packages/notify/src/index.ts 3 · packages/notify/src/discord-bot.ts 2 · packages/notify/src/split.ts 2
- **tools:** tools/local/check_env.py 4 · tools/local/env/fin.env 4 · tools/local/env/fit.env 2 · tools/local/run.sh 2

### 테스트 — 파일별 건수

- **deploy:** test_telegram_polling.py 44 · test_notify_deploy.py 19 · test_discord_switch.py 7 · test_deploy.py 4 · test_t2_check.py 3
- **fit:** notifier.test.ts 43 · telegram-polling.test.ts 25 · verify-food-edit-pending.ts 20 · telegram-reply.test.ts 12 · state-key.test.ts 9 · decide.test.ts 8 · telegram-handlers.test.ts 7 · discord-interactions.test.ts 7 · session-store.test.ts 2 · discord-router.test.ts 1 · error.test.ts 1 · telegram.test.ts 1
- **fin:** notifier.test.ts 36 · telegram-polling.test.ts 25 · reply.test.ts 16 · alert-dispatcher.test.ts 16 · special-decide.test.ts 13 · ai-decide.test.ts 12 · route.test.ts 10 · expense-trade-decide.test.ts 10 · scheduler.test.ts 10 · ai-telegram.test.ts 7 · special-telegram.test.ts 6 · router.test.ts 6 · discord-interactions.test.ts 6 · expense-telegram.test.ts 4 · trade-telegram.test.ts 4 · lookup-manage-decide.test.ts 3 · manage-telegram.test.ts 3 · lookup-telegram.test.ts 2 · telegram-fake.ts 2 · vest-confirm.test.ts 2 · briefing-target.test.ts 1 · advisor-monitor.test.ts 1 · categories.test.ts 1
- **tools:** test_check_env.py 15 · test_write_env.py 1
- **packages:** telegram.test.ts 13 · platform-env.test.ts 5 · discord.test.ts 3 · error.test.ts 2 · escape.test.ts 2 · index.test.ts 2 · split.test.ts 2 · contract.test.ts 1 · deliver.test.ts 1 · discord-bot.test.ts 1

## M2. 판정 문자열 위험

```bash
git grep -l -F -- "<문구>" -- 'deploy/test_*' 'tools/local/test_*' 'apps/*/src/**/__tests__/**' 'apps/*/src/**/*.test.*' 'packages/*/src/*.test.ts' 'apps/fitness/scripts/verify-*'   # 문구 51개 · 결과는 위 A·B·C 표 "테스트 고정" 칸
```

**바꾸면 깨지는 것(전부 C):**

| 문자열 | 고정하는 곳 | 깨지는 것 |
|---|---|---|
| `[bot] 텔레그램 폴링 꺼짐(TELEGRAM_POLLING=off)` | `deploy/test_telegram_polling.py:50,446` · 두 앱 `telegram-polling.test.ts:86` | `telegram-polling.sh:18` 이 로그에서 찾는 **off 판정** — 앱·스크립트 같이 바뀌어도 **이미 서버에 있는 태그 로그와 어긋난다** |
| `[bot] 텔레그램 토큰 없음` · `[bot] 텔레그램 토큰 무효(401)` | `test_telegram_polling.py:68,72,447,449-450` | `telegram-polling.sh:21,22` 판정 |
| `텔레그램 토큰 무효(401)`(onFatal 인자) · `텔레그램 중지 알림 실패` | 두 앱 `telegram-polling.test.ts:122,173` | 앱 테스트 |
| 양식 `[off] 재시작 뒤 텔레그램 폴링 꺼짐 …` · `텔레그램 토큰 없음 …` · `결과: 통과 — 텔레그램 폴링 꺼짐/켜짐` · `텔레그램 폴링을 다시 켰다` | `test_telegram_polling.py:178-179,185,205,232,299,308-309,424` | deploy 테스트 |
| `텔레그램으로 되돌렸다` · `텔레그램으로 돌아왔다` | `test_discord_switch.py:203,249,269,285` | deploy 테스트 |
| `(Discord 실패 … — 텔레그램으로 대신)` | `test_notify_deploy.py:116` | deploy 테스트 |

**A·B 는 문구를 고정하는 테스트가 0 이다.** 간접 제약만 있다:

| 대상 | 제약 | 위치 |
|---|---|---|
| fin `SYSTEM_PROMPT` | 뉴스 절 포함 · `${` 없음 | `news-rules.test.ts:97-99` |
| fit 모든 기본 본문 | `validatePrompt(key, defaultBody)` 오류·경고 0 · `system` 의 `requiredSnippets` 는 빈 배열 | `validate.test.ts:8` · `definitions.ts:44` |
| fin `:129` ↔ `:133` | 문장이 제목을 이름으로 인용한다 — **테스트 없음** · 한쪽만 바꾸면 모델에 없는 절을 가리킨다 | `system-prompt.ts` |

grep 오탐으로 뺀 것: `점심 김치찌개`(테스트 입력값) · `봇 커맨드`(`categories.test.ts:109` 주석) · `무응답`(다른 뜻) · `TELEGRAM_ALLOWED_CHAT_IDS 미설정`(`advisor-monitor.test.ts:141` 주석).

**낡았지만 단언이 아닌 테스트 제목:** fin `notifier.test.ts:3,102` · fit `notifier.test.ts:378,516` "키보드·PDF 는 항상 텔레그램".

## M3. fin 프롬프트

**위치·전달.** 코드 상수 `SYSTEM_PROMPT`(`apps/finance/src/lib/ai/system-prompt.ts:13-183`) · DB·웹 편집 없음. `claude-advisor.ts:818` `--system-prompt` 로 **세션이 없을 때만** 넘긴다(`:813-815` — 있으면 `--resume` · 옛 프롬프트가 세션에 남는다). 호출 12곳이 전부 이 경로다:

`api/ai/ask/route.ts:39` · `commands/ai.ts:84,178` · `commands/briefing.ts:113` · `commands/expense.ts:488` · `notifications/active-review.ts:141` · `briefing.ts:74` · `monthly-report.ts:39` · `ta-signal-alert.ts:312` · `custom-strategy/parser.ts:146,235` · `report/ai-review.ts:59`

세션을 이어 쓰는 곳은 봇 대화뿐이다(`ai.ts:85` · 메모리 Map `:45` · TTL 24 h `:49`) → 봇 재시작(`deploy.sh:360-361` delete → start)에 지워지므로 **배포 뒤 옛 프롬프트 세션은 코드상 남지 않는다.**

**"텔레그램" 문장과 형식 지시.**

| 줄 | 원문 | 형식 지시인가 |
|---|---|---|
| `:58` | 응답은 텔레그램과 웹 모두에서 표시된다. 아래 포맷을 반드시 지켜야 한다: | **아래 6줄의 근거 문장** |
| `:119` | … cron 이 감시 → 텔레그램 알림 … | 아니다 |
| `:129` | … "텔레그램 봇 커맨드", "알림 시스템 현황" 섹션과 MCP 도구 목록만 신뢰하라 | 아니다(`:133` 인용) |
| `:133` | ## 텔레그램 봇 커맨드 (사용자 안내용) | 절 제목 |

`:59-64` 지시 전문: 표 금지 · 리스트+들여쓰기 · 이모지 · 제목은 볼드(`##` 대신) · 구분선은 빈 줄 · 코드블록 최소. **HTML 태그 지시 0 · 길이 제한 지시 0**(`:1-183` 전문 읽음). 작업 프롬프트 쪽도 형식 지시 grep 0(`HTML|<b>|4096|자 이내|글자|마크다운|표를` — briefing·active-review·monthly-report·quarterly-report·ta-signal-alert·news-rules · `ta-signal-alert.ts:320,323` 의 `<b>` 는 모델 입력이 아니라 알림 본문).

**출력 변환(코드 확인).** 모델은 마크다운을 낸다.

| 경로 | 변환 |
|---|---|
| 공통 | `markdownToTelegramHtml`(`utils/markdown.ts:51`) — 표 → 리스트(`:14,55`) · 헤더 → `<b>`(`:70`) · `---` 제거(`:85`) |
| Discord 봇 답 | `modelReply(html,'html')`(`core/reply.ts:128`) → `toOutgoing`(`discord/reply.ts:76`) → `packages/chat/src/rest.ts:99` `htmlToDiscordMarkdown` → 2000 분할 |
| Discord 알림 | `Notifier` → `packages/notify/src/discord.ts:86` `htmlToDiscordMarkdown` |
| 텔레그램 | `telegramOutput`(`utils/telegram-reply.ts:40`) `parse_mode: 'HTML'` |

표·헤더·구분선은 프롬프트를 어겨도 변환이 막는다 — **`:59-64` 는 Discord 에서도 거짓이 아니다.** 모델 문체(J3·J5)에 대한 영향은 코드로 알 수 없다(판정 대상 · 미측정). Discord 가 표·헤더를 어떻게 그리는지는 이 경로에 영향이 없어 재지 않았다.

**문구만 바꾸면 끝인가 — 아니다, 낱말 없는 곳에 하나 더 있다.**

| 줄 | 원문 | Discord 에서의 사실 |
|---|---|---|
| `:162` | `/ai [질문]`, 자연어 질문 — 대화 컨텍스트 유지 (`--resume`) | Discord 입력창은 `/…` 를 가로챈다(`discord/reply.ts:21` · 009 X-1) · 등록은 `!ai`(`:26`) |
| `:163` | `/reset` — AI 대화 세션 초기화 | 등록은 `!reset`(`:26`) |
| `:155` | (한글 명령은 슬래시 없이 입력) | 참 |

그리고 **이 안내는 변환을 타지 않는다** — `toOutgoing:77` 은 `verbatim` 이면 `toDiscordCommandText` 를 건너뛰고(`discord/reply.ts:14` "모델 출력은 바꾸지 않는다"), AI 답은 `modelReply` 라 항상 `verbatim` 이다. 모델이 `/reset` 을 말하면 그대로 나간다. 고치는 곳은 프롬프트 본문뿐이다. 그 프롬프트는 웹(`api/ai/ask`)·크론과 공유된다 — 웹 경로의 명령 안내는 사용자가 어디 입력하든 봇 쪽이다.

`:136-156` 의 나머지 명령은 전부 한글 텍스트다(라우터 한글 28 · `discord/router.ts:193`). 줄별 등록 대조는 D-3 측정 범위이며 여기서 다시 재지 않았다.

**판정 절차와의 관계.** `ai-model-upgrade.md` 는 모델 ID 교체 절차다 — §2 는 "현행 ID 와 후보 ID" 비교이고 서버 실행은 사용자 · 자동화 없음(#256). 프롬프트만 바뀌는 경우의 비교 축(현행 본문 ↔ 새 본문)은 그 문서에 없다(S-6 "준용" 이 메울 자리). fin 은 코드 상수라 **본문을 바꿔 돌리는 기존 수단이 없다**(fit 은 있다 — M4 시험 실행).

## M4. fit 프롬프트

**줄 번호 재확인:** `defaults/system.ts:78` · `definitions.ts:41,50,59,68` — 009 L29 와 같다. `system.ts:78` 은 데이터 출처 설명이고 형식 지시가 아니다(형식은 `:139` "마크다운 형식" · 플랫폼 언급 없음).

**언제 돈다 — 4곳.** 설정 저장 API 는 부르지 않는다.

| 시점 | 위치 | 방식 |
|---|---|---|
| 웹 부팅 | `instrumentation.ts:39-40` | `void` — 기다리지 않음 |
| 봇 부팅 | `bot/standalone.ts:39` | `await` — gateway 전 |
| `GET /api/prompts` | `app/api/prompts/route.ts:10` | 요청마다 |
| `/settings/prompts` 목록 | `app/settings/prompts/page.tsx:40` | 요청마다 |

상세 화면·`GET /api/prompts/[key]` 는 부르지 않는다. 배포 순서는 mcp → web → bot(`deploy/deploy.sh:342,356,361`)이라 **새 본문을 처음 쓰는 쪽은 보통 웹 부팅이고** 봇 쪽은 해시가 같아 아무것도 안 한다. 동시면 unique 위반을 삼킨다(`resolve.ts:107` · `PromptVersion_active_unique`).

**판단 표**(`sync-plan.ts:31-42` · 키별 · `hash` = 코드 본문 sha256):

| 조건 | 결과 |
|---|---|
| 그 키 행 0 | v1 `active` |
| 최신 `code_default` 행의 `codeHash` = hash(상태 무관 · 초안 포함) | **아무것도 안 함** |
| active 없음 | 새 행 `active` |
| active 의 source = `code_default`, 또는 `restore` 이고 `codeHash` = 최신 코드 기본값 | 새 행 **`active`** · 옛 active `archived` |
| 그 외(`manual`·`ai_suggestion`·더 옛 기본값 `restore`) | 새 행 **`draft`** · active 그대로 · 경고 로그 |

새 행은 `source: code_default` · 번호 = 기존 최대 + 1 · note `업데이트로 바뀐 기본 프롬프트`(`resolve.ts:78-89`).

**usage 만 바꾸면 — 새 행 없음.** `codeHash(defaultBody)` 만 비교하고(`resolve.ts:64-65`) `PromptVersion` 에 usage 컬럼이 없다(`schema.prisma:495`). usage 는 요청 때 코드에서 읽는다(`page.tsx:24` · `[key]/page.tsx:55` · `route.ts:14`). 배포만으로 바뀌고 DB 쓰기 0.

**D-4 로 바뀌는 행 수:** `system.ts:78` 을 고치면 `system` 키 **1행**. 리포트 3키·평가 2키는 본문 무변경이라 0.

**버전이 바뀌면 함께 일어나는 것:** `SessionStore.getSession(channel, versionId)` 가 버전이 다르면 세션을 버린다(`session-store.ts:27-31` · `claude-advisor.ts:273`) — active 로 들어간 경우만. `AIAdvice` 가 시스템 버전을 기록한다(`claude-advisor.ts:436`).

**되돌리면:** 옛 코드가 부팅하면 최신 `code_default` 해시와 달라 **새 행(번호 +1 · 옛 본문)** 을 만든다 — 009 "되돌림도 새 행" 그대로다. draft 경로였다면 되돌림도 draft 가 하나 더 쌓인다.

**draft 로 들어간 경우 AI 입력은 안 바뀐다** — `resolvePromptTemplate` 은 `status: "active"` 만 읽는다(`resolve.ts:37`). 반영은 사람이 웹에서 활성화(`POST /api/prompts/versions/[id]/activate` · `validatePrompt` 재통과 · 도구 언급이 빠지면 확인 요구 `versions.ts:45-53`).

**운영자 확인 수단**(Claude 는 닿을 수 없다):

| 수단 | 보이는 것 |
|---|---|
| 웹 `/settings/prompts` | 카드마다 `v<N>` · 출처 pill · 활성화 시각 · 초안 수 · **`코드 기본값 갱신`** pill + 상단 경고 띠(`page.tsx:23-33,51-56`) |
| 웹 `/settings/prompts/system` | "지금 v<N> 사용 중"(`[key]/page.tsx:55`) · 버전 계보 · 본문 · 차이 · `?tab=results` 버전별 결과 |
| `GET /api/prompts` | `active{version,source,activatedAt}` · `draftCount` · `pendingCodeDefault`(`versions.ts:22-25,91`) — **`codeHash` 는 주지 않는다** |
| `GET /api/prompts/system` | 버전 전체 본문·status(`[key]/route.ts:16` · `toDTO` 에 `codeHash` 없음) — 본문에서 낱말을 직접 볼 수 있다 |
| pm2 로그 | 이긴 프로세스 쪽(web 또는 bot) `[prompts] system: 코드 기본값 v<N> 사용` 또는 `… 초안으로 추가 (화면에서 반영 필요)`(`resolve.ts:91-95`) |

판정 근거: **active.source = `code_default` + `pendingCodeDefault` false + 그 본문에 새 문구** 면 의도대로다. `pendingCodeDefault` 는 active 보다 번호가 큰 code_default 초안이 있을 때만 true(`versions.ts:91`).

- `deploy/` 에 이 확인은 없다 — `git grep -E 'api/prompts|prompts\]|PromptVersion' -- deploy` 0건. `release-inplace.sh` 는 로컬 `curl` 을 이미 쓴다(`:333`).
- 코드상 앱 수준 인증 없음(`git ls-files apps/fitness | grep -E '(^|/)(middleware|proxy)\.(ts|js)$'` 0건). 바깥에서의 접근(nginx)은 **미측정**.
- `GET /api/prompts` 는 조회 전에 `ensureDefaults` 를 돈다 — 멱등이지만 쓰기 경로다.
- **운영 DB 의 현재 active 출처: 미측정**(웹 편집 이력 유무 모름 — 사용자만 볼 수 있다). draft 분기를 탈지는 이 값이 정한다.
- **시험 실행:** fit 은 시스템 초안을 저장해 활성화 없이 돌릴 수 있다(`lib/prompts/trial.ts:37-44` `systemOverride` · `POST /api/prompts/versions/[id]/trial`). fin 에는 없다.

## M5. D-5 와의 경계 — 사실

**코드가 남아 있는 동안 플랫폼을 가르는 스위치:**

| 스위치 | 값에 따른 경로 | 근거 |
|---|---|---|
| 앱 `.env` `TELEGRAM_POLLING` | off = 텔레그램 수신 0 · 비움 = 수신(`telegram-polling.sh on` 되돌림) | `telegram-polling.ts:54,96-100` · `telegram-polling.sh:5` |
| Discord 대화 채널 키 | 없으면 Discord 수신 0 | `deploy/discord-inbound.sh:4` |
| `NOTIFY_ALLOWED`·`ADMIN_CHANNEL` | **미설정 = 텔레그램** · discord = 웹훅 | fin `notifier.ts:9,47-54,97` · fit `notifier.ts:7,75` |
| `NOTIFY_INTERACTIVE_CHANNEL` | 미설정 = 텔레그램 · discord = 앱 봇 | fin `notifier.ts:16,125-126` · fit `notifier.ts:91-92` |
| `discord-switch.sh off` | 스위치 4줄 비움 → 위 "미설정" = 텔레그램 | `discord-switch.sh:6` |
| 배포 알림 | Discord 실패 → 텔레그램 대신 | `notify-deploy.cjs:138` |
| 분기 PDF | ALLOWED 가 Discord 면 웹훅 · 아니면 `sendDocument` | `quarterly-report.ts:62,81-85` |
| 봇 명령 `/브리핑` | 응답 = 요청한 곳(텔레그램 chat · Discord 채널) · 라우트 스위치 안 탄다 | `notifier.ts:13-14,185` · `briefing.ts:49` |

**문구별 — 무엇이 참인가:**

| 문구 | "텔레그램" 이 참인 조건 | "Discord" 가 참인 조건 | 사실 근거 |
|---|---|---|---|
| fin `system-prompt.ts:58` · fit usage 4 · `PromptDetailClient:199` | 라우트 미설정·폴링 켬 | 라우트 discord·수신 켬 | 위 스위치 · 한 값으로 고정되지 않는다 |
| fin 알림 문구(`:119` · `server.ts:451` · `categories.ts:98,99,107` · `strategies/page.tsx:11`) | 라우트 미설정 / `discord-switch off` | 라우트 discord | 전부 `Route.ALLOWED` 경유 |
| fin `alerts/history/page.tsx:11` | 옛 행 | 전환 뒤 행 | **`AlertHistory` 에 채널 컬럼 없음**(`schema.prisma`) · 같은 화면에 두 플랫폼 행이 섞인다 |
| fin `Category*:179,153` · fit `lifestyle-client:153` · fit `system.ts:78` | 폴링 켬 | Discord 수신 켬 | 두 경로가 같은 `decide*` · 입력 채널을 저장하는 컬럼 없음(스키마 `telegram` hit = `WorkoutAdjustment` 2컬럼뿐) |
| fit `profile-client:443` | INTERACTIVE 미설정 | discord | `interactiveNotifierFor` · 문구 "Phase 2 부터" 도 옛 표현 |
| fin `spending.ts:223,224,262,315` | **어느 쪽도 거짓** | **어느 쪽도 거짓** | `git grep -E '이체\|transfer' -- apps/finance/src/bot`(테스트 제외) 0건 · 봇에 `transaction.update\|delete` 0건 · 봇 입력 타입은 `expense`\|`income` 뿐(`expense.ts:43,438`) · 웹 API 에는 있다(`api/transactions/route.ts`·`[id]/route.ts`) |
| `release-inplace.sh:338` | 폴링 켬 | 수신 켬 — fit 명령은 `!today`(`/today` 아님) · fin `현황` | `telegram-polling.sh:28,30`(폴링 끔 판정 안내가 이미 "텔레그램 /today 무응답") |
| `system-prompt.ts:162-163` `/ai`·`/reset` | 텔레그램 | 거짓(`!ai`·`!reset`) | M3 |

**D-5 전까지 그대로 참이어서 바꾸면 거짓이 되는 것(C):** `telegram-polling.ts` 전체 로그 · `standalone.ts` "텔레그램 수신 중단" · `discord-switch.sh` "텔레그램으로 되돌렸다" · `notify-deploy.cjs:138` · 양 `notifier.ts` 주석의 "미설정 = 텔레그램" · `platform-env.ts:138` "알림은 텔레그램"(플랫폼 설정을 못 읽으면 실제로 텔레그램) · env 키 이름이 든 로그.

## M6. 낡은 문서 표기

```bash
git log -5 --date=short -L13,14:apps/finance/src/bot/notifications/notifier.ts -s
git grep -n -F '사람 확인' -- . ':(exclude)_workspace'
```

| 009 §10 표기 | 지금 | 상태 |
|---|---|---|
| fin `notifier.ts:13-14` | "`/브리핑` 응답은 요청한 곳으로 … 분기 PDF 는 `sendFileIfDiscord`" — `23419da`(2026-10-30 · D-3 PR-2b)가 고쳤다 | **이미 해결** |
| fin `scheduler.ts:38` | 줄이 밀렸다 — 문구는 **`:36`** "Discord 를 골라도 키보드(RSU 확정)·분기 PDF 는 텔레그램으로 간다" · `:38` 은 지금 로그 줄 | **아직 낡음** — 키보드는 INTERACTIVE 스위치, PDF 는 ALLOWED 가 Discord 면 웹훅. 코드 `:23` `\|\| telegramRecipients` 는 동작이라 D-5 |
| `tools/local/README.md:32` | "`/브리핑` 응답은 항상 텔레그램." | **아직 낡음**(같은 줄 앞부분은 참) |

**`deploy/release-inplace.sh` 사람 확인 줄:** `:338` `form "   사람 확인: 웹 화면 · 텔레그램 $([[ $APP == fin ]] && echo '현황' || echo '/today') — 예/아니오 를 덧붙인다"`.
**고정 테스트 0**(`deploy/test_release_inplace.py` 포함 `deploy/test_*` hit 없음). 같은 지시가 남은 문서: `docs/runbooks/release-inplace.md:16,72,198,219`. 이력 기록 `measured-facts.md:4459` 는 그때 값이다. 같은 줄의 `409 $conflict`(`:337`)는 텔레그램 getUpdates 충돌만 센다(`:110-114`) — 폴링을 끄면 항상 0 이고 C5 조건이다(`:339`).

## 미측정

| 항목 | 이유 |
|---|---|
| 운영 DB `PromptVersion` 현재 active 출처·번호 | 서비스 DB 접근 금지 — 사용자가 웹에서 본다 |
| 서버 실제 스위치 값 | 서버 접근 금지(I-3) |
| 프롬프트 문구 변경이 모델 출력에 주는 영향 | 코드로 알 수 없다 · 판정 대상 |
| 낱말 없이 텔레그램을 전제한 문구 전수("봇" 등) | 이번 grep 범위 밖 · `/ai`·`/reset` 만 읽어서 찾았다 |
| fit 웹 바깥 접근 경로(nginx 인증) | 서버 설정 |

## measured-facts.md 후보 (반영은 호출자)

```markdown
## 2026-11-02 — 009 D-4 "텔레그램" 문구 (HEAD 40c7ef40cd2f · _workspace/009/d4/01_surveyor_d4.md)
`git grep --text -n -i -E '텔레그램|telegram' -- apps/finance apps/fitness packages deploy tools` = 1646 줄.
분류(A AI 입력 / B 사용자 / C 운영자 / D 주석·문서 / E 동작 / 테스트): 10 / 14 / 65 / 762 / 338 / 457.
- fin 프롬프트: 코드 상수 · 호출 12곳 · 세션 없을 때만 전달 · HTML·길이 지시 0 · `/ai`·`/reset`(L162-163)은 verbatim 이라 `!` 변환을 타지 않는다.
- fit: usage 변경 = 새 행 0(codeHash 는 본문만) · `system.ts:78` 변경 = `system` 키 1행 · active 가 code_default 또는 최신 해시 restore 면 자동 전환 · 그 외 draft. ensureDefaults 는 웹 부팅·봇 부팅·GET /api/prompts·/settings/prompts 4곳.
- fin `spending.ts` 4행의 "텔레그램에서 입력·수정·삭제" 경로는 봇에 없다(이체·transfer 0건 · transaction.update/delete 0건).
- `release-inplace.sh:338` 사람 확인 줄 고정 테스트 0 · 판정 문자열 고정은 C 에만 있다(A·B 0).
```
