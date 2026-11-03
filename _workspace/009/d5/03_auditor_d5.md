# 009 D-5 초안 감사 결과 (1회차)

**대상:** `_workspace/009/d5/02_writer_d5.md` · 측정 `_workspace/009/d5/01_surveyor_d5.md` · 기준 `b1c3e68` · 실행 `reversibility-auditor`
읽기만 했다. 설치·빌드·테스트 실행 0 · 서버·서비스 DB·서비스 저장소 접근 0. 로컬 루트 `.env` 는 스위치 값과 웹훅 채움 여부만 봤고 비밀 값은 출력하지 않았다.

## 결론

| 항목 | 값 |
|---|---|
| **정정** | **15건**(블로커 6 · 일반 9) |
| **미확인** | **7건** |
| **초안 재작성** | **필요 — 2회차 개정.** §3-3 · §5-1 순서표 · §7 · Δ6 · §4-5 · §6 S2 · §8 을 고치고 그 절들만 재감사한다 |

방향은 유지된다. 대체 먼저, 그다음 제거, 릴리즈 2회라는 구조와 태그 혼합·R-8 분석의 뼈대는 코드와 맞았다. 틀린 곳은 **중간 커밋 순서, 잔여 허용 목록, 이중 세션 관측 수단**이다.

## 블로커 정정

### D1. B1 이 `deploy/` 테스트를 B7 까지 깨뜨린다
- `test_templates_cover_app_examples_and_ports`(`deploy/test_deploy.py` · `example_keys` `:825-827`)는 `apps/<d>/.env.example` 의 활성 키가 `deploy/env/<d>.env.template` 에 전부 있어야 통과한다.
- B1 은 템플릿에서 텔레그램 키를 지우고 `.env.example` 은 B7 에서 지운다. `apps/finance/.env.example:19-22` · `apps/fitness/.env.example:24-25` 의 활성 키가 남아 **B1~B6 내내 실패한다.** B1 이 고친다는 `test_deploy.py:832-854` 는 키 이름을 모르는 일반 포함 검사라 고칠 곳이 아니다.
- B2·B3 검증 칸 `test_deploy` 도 실패한다. CI 에 없어 PR 은 초록으로 지나간다(`workflow.md` 8절 "CI 미포함").
- **수정:** 앱 `.env.example` 텔레그램 줄을 B1 로 옮긴다(권고 · 어떤 코드도 읽지 않고 `release-inplace.sh:214` 는 표시만 한다) 또는 템플릿 삭제를 B7 로 미룬다.

### D2. 잔여 고정 테스트가 B7 커밋에서 실패한다
- 테스트는 B7 에 신설하는데, 0 행의 `release-inplace.md`(`:142` 제외)와 `ai-model-upgrade.md` 는 B8 에서 고친다.
- **수정:** 테스트를 B8 로 옮기거나 두 런북 수정을 B7 로 당긴다.

### D3. §7 허용 목록은 달성 불가능하고 §7-1·R11 과 모순된다
"0 이어야 한다 `apps/*/src` · `packages/*/src`" 에 걸리지만 남기기로 한 줄:

| 곳 | 왜 남나 |
|---|---|
| `apps/fitness/src/bot/notifications/auto-adjust-cron.ts:102-103` · `auto-adjust.ts:419-420` | S-8 컬럼 쓰기 — 필드 이름에 `telegram` |
| `apps/fitness/src/bot/notifications/__tests__/notifier.test.ts:17,367,373,377,378,390,396,420,441,463` | 같은 컬럼 고정 테스트 |
| `packages/notify/src/discord-md.ts:2,5,10,161,189` · `apps/finance/src/app/alerts/history/client-utils.ts:23` | §7-1 이 "무변경" 이라 적어 0 행과 충돌 |

- **수정:** DB 행에 컬럼명 패턴 `telegramMessageId|telegramChatId` 를 줄 단위로 넣는다. R11 파일은 문구 정리를 허용하거나("동작 무변경") 허용 목록에 넣는다. `packages/notify/README.md` 를 0 행에 명시한다.

### D4. X2-a 는 설계대로면 놓치고, 제안한 실측으로는 검증되지 않는다
**확인:** `gatewayBot()` 은 `total` 을 돌려준다(`packages/chat/src/rest.ts:276-281`) · IDENTIFY 직전에만 부르고 RESUME 제외(`chat.ts:317-320` · `gateway.ts:45,166`) · 다른 IDENTIFY 경로 없음 · 정상 재시작 오탐은 코드상 없음(예외: 파일 소실 · 두 프로세스 동시 쓰기 유실).

- **① 창이 다르다.** `attempts` 는 이동 24 h(`identify-guard.ts` `a > t - windowMs`) · `session_start_limit` 은 `reset_after` 로 끝나는 고정 창으로 문서상 알려져 있다(실측 전 · U-15). 고정 창 이전의 로컬 시도가 차감돼 외부 세션을 가린다. `attempts` 를 `t − (windowMs − resetAfterMs)` 뒤로 잘라야 하고, 이 정의와 "여유" 값이 초안에 없다.
- **② 실측이 검증하지 못한다.** UQ-2 는 앱 하나를 두 프로세스로 띄운다. `IDENTIFY_RECORD` 는 cwd 상대(`discord-interactions.ts:28`)이고 `run.sh` 는 늘 `apps/<dir>` 에서 띄우므로 같은 기록 파일에 써서 차이 0 이다. **같은 체크아웃의 이중 세션은 원리상 못 잡고**, 잡는 것은 기록 파일이 다른 곳(다른 체크아웃·머신)뿐이다. `tools/local/chat-live-check.cjs` 도 기록이 앱당 하나(`.chat-local/identify-<app>.json`)라 기록 경로를 다르게 한 두 번째 세션이 필요하다. U-15 는 `GET /gateway/bot` 을 IDENTIFY 앞뒤로 읽으면 된다. `standalone` 을 두 번 띄우면 크론·`ensureDefaults` 까지 돌아 쓰기 0 이 되지 않으므로 `chat-live-check` 계열이 맞다.
- **③ 관측 시점.** 비교는 이 프로세스가 IDENTIFY 할 때만 돈다. 양식은 배포 재기동 덕에 작동하지만 평상시 RESUME 으로 며칠 살면 알림이 없다. "못 잡는 것" 에 적는다.
- **구현 비용 누락.** `IdentifyGuard.check(remote)` 시그니처가 `{remaining, resetAfterMs}` 뿐(`identify-guard.ts:51`)이라 공개 타입 변경이 필요하다. `alertedAt` 은 차단 알림 중복 방지 필드(`:56`)라 같은 필드를 쓰면 R5 차단 알림을 삼킨다 — 별도 필드로 명시한다. 줄 번호: `:119` → `:115` · 시도 기록 `:141` → `:131-132`.

### D5. X2-b 는 겨냥한 프로세스를 못 잡고, 첫 실사용이 R2 다
- 패턴 `apps/<dir>/dist/bot/standalone.cjs` 는 옛 서비스 봇을 놓친다(`apps/*/ecosystem.config.js` 는 cwd 가 저장소 루트 · `script: 'dist/bot/standalone.cjs'`). 앱별 구분을 지키며 옛 경로까지 넣거나 한계를 적는다.
- 같은 서버의 다른 pm2 데몬(`PM2_HOME`)과 pm2 밖 `node` 도 안 보인다.
- **순서 위험:** 양식 `봇 프로세스 N ≠ 1 → stop 4` 는 R1 의 `release-inplace.sh` 로 처음 돈다. R1 자신의 배포는 `v1.5.4` 스크립트라 시험되지 않는다. `pm_exec_path` 모양이 어긋나면 N=0 이 되어 **R2 가 fin 에서 rc 4 로 끝나고 fit 은 건너뛴다**(`ssh-deploy.sh` 루프) — fin=R2 · fit=R1 혼합 상태.
- **수정 둘 중 하나:** (a) S0 에 `pm_exec_path` 모양 판정 추가(읽기 전용 · 값 비출력) (b) R2 배포에서는 표시만 하고 게이트는 다음 릴리즈부터. (b) 가 더 안전하다. 코드상 모양이 어긋날 가능성은 낮다(`pleiades.config.cjs:76,97-98` · `:100` `pm_cwd` 대조) — 서버 값은 미측정.

### D6. fin 테스트 삭제의 커버리지 손실이 설계에서 빠졌다
- 초안은 fit `telegram-handlers`(31)만 대조표를 요구한다(§4-5 · W5).
- fin 은 `*-telegram.test` 6 파일 198 케이스(ai 52 · expense 45 · lookup 24 · manage 27 · special 28 · trade 22)를 지운다. `decide*` 를 텔레그램 어댑터로 고정해 온 특성 테스트다. 남는 것은 decide 42(12·9·9·12)와 Discord 38(router 18 · reply 20)이다.
- **수정:** B3 에 같은 대조표를 요구하거나 삭제 전 분기 대응을 9-1 focus 로 고정한다. fit 쪽도 `decide.test.ts` 22 + `discord-router.test.ts` 와 대조한다(케이스별 대응은 미측정).

## 일반 정정

- **D7. Δ6 · R15 · W2 의 전제.** 조건문으로는 맞다(`notifier.ts:72-74,96-100`). 그러나 실측상 **로컬 루트 `.env` 의 텍스트 스위치 2개가 이미 Discord** 이고 웹훅 3개가 채워져 있으며 버튼 스위치만 비어 있다. 뒤집기가 새로 여는 것은 버튼 경로뿐이고 G-1 토큰 가드 안이다. 텍스트 웹훅 직발송은 이미 열린 틈이다. A1 웹훅 허용 목록의 근거를 "지금 이미 있는 틈 · 뒤집기 뒤에는 스위치로도 닫을 수 없다" 로 바꾼다. A1 채택 유지 · 웹훅 정체는 미측정. vitest 는 `PLEIADES_ENV_FILE` 을 없는 경로로 고정해 테스트 발송 위험은 없고 스모크도 `/dev/null` 이다.
- **D8. R1 "기능 무변경 · 11-05 제약 밖".** 제거 릴리즈가 아니므로 #438 은 어기지 않는다. 그러나 A3 는 새 로그·웹훅 알림·배포 판정을 더해 "기능 무변경" 은 A1·A2·A4 까지만 참이다. R1 은 관찰 도중 Discord 경로를 바꾸고 봇을 재시작한다 → **사용자 결정.** `v1.5.4..dev` 에 #441 파일 7개(`deploy/` 만 · 앱 0)가 있어 R1 이 그 첫 릴리즈이기도 하다. 릴리즈 노트 범위에 적는다.
- **D9. 리뷰 등급.** A1 · B6 은 가드(비밀 검사) 변경이라 보안 sensitive 행이다. B1 은 배포 경로 + 200 LOC 이상이라 필수다.
- **D10. `TELEGRAM_MAX_MESSAGE_LENGTH`.** 실제 쓰임은 `apps/fitness/scripts/verify-food-edit-pending.ts:23,271-272,278-279` 의 길이 회귀 단언이고 fit `npm run test` 체인에 있다. 상한을 어떻게 볼지 코드 대조로 확정한다.
- **D11. 앱 옛 배포 파일 수.** `apps/*/ecosystem.config.js` 는 2개라 삭제 표현대로면 6 파일(측정의 5 는 언급 기준). 6 또는 5 를 명시한다. 읽는 곳은 없다.
- **D12. S2 와 토큰 사본.** 삭제 뒤에도 토큰은 도는 프로세스의 `process.env` 에 다음 재시작까지 남는다 → "다음 재시작 뒤 메모리까지 사라진다" 로 고친다. 키가 pm2 env 에 있으면 `.env` 삭제가 소용없다(`telegram-polling.sh:99`) → S2 양식에 pm2 env 의 `TELEGRAM_` 키 개수(값 없이). `telegram-polling.sh:276-277` 이 실행마다 앱 `.env` 를 `~/pleiades-private/<app>-env-*.bak` 으로 복사한다 → 두 앱 모두 `off` 를 실행했으므로 사본이 있다고 본다. S2 에 사본 개수 판정과 처리(사용자 결정). rename 은 `telegram-polling.cjs:97` 선례의 `real` 해석까지 따른다. 바닥 표 "`NOTIFY_*` 를 지웠다 → `v1.5.x`" 는 R1 도 포함이다.
- **D13. R11 테스트.** `alert-dispatcher.test.ts` · `retry/__tests__/route.test.ts` 는 `NOTIFY_` 언급 0 이라 옛 HTML 재발송 → Discord 마크다운 케이스가 없다. B4 **필수 추가.** 이 두 파일 34 케이스 · fit `notifier.test.ts` 30 · fin `notifier.test.ts` 17 이 뒤집기 대상이다. 케이스별 실패 수는 미확인.
- **D14. A4.** "호출 3곳 교체" → 생성 2곳(`rsu.ts:173` · `auto-adjust.ts:64`) · `auto-adjust-cron.ts` 무변경. B5 가 `inline_keyboard` 분기를 지우기 전에 앱 테스트 픽스처(fin `notifier.test.ts:104,118,138` · fit `:199,518,557`)를 B2·B4 가 바꾼다. `deliver.test.ts:121,143` 은 무관.
- **D15. 측정 문서 정정.** `advisor-monitor.ts` → `@/bot` 은 동적 import(`:293`) · importer 15 는 맞다(정적 14 + 동적 1) · B4 에 적는다. `garmin/sync.ts:318` 은 주석 · 필드는 `:321`. B4 추가: `vi.mock('@/bot/index')` 3 파일(`active-review.test.ts:16` · `briefing-target.test.ts:11` · `news-rules.test.ts:9`). `discord-switch` 판정 문자열 유지 이유 "옛 태그 호환" 은 틀렸다(같은 체크아웃) · 남는 이유는 `test_discord_switch.py:346` 고정뿐 · B1 표에 그 테스트를 추가한다.

## 확인

| 주장 | 근거 |
|---|---|
| A1·A2·A4 서비스 동작 불변 · A4 페이로드 동일(`custom_id`·라벨 유지 · 소비처 3 전송 지점 · `rsu.ts` 호출자는 `scheduler.ts` 뿐 · 옛 메시지 클릭 유지 · 웹훅은 `components` 를 원래 거부) | `logger.ts` · `discord-switch.cjs` `WEBHOOKS` · `discord-bot.ts:53-54` · `telegram.ts:37` · `discord.ts:109-112` |
| B1 이 B2 앞이어야 하는 이유 | `test_telegram_polling.py` `app_source` |
| `TELEGRAM_POLLING` 을 읽는 앱 + 스크립트 부재는 무해 | 앱은 `.env` 만 읽음 |
| `test_deploy.py:762,772` 는 fin 고정 · B3 에서 고치면 맞다 | `:738-739` |
| 동결은 기계적 차단이 아니라 "릴리즈 PR 을 안 연다" 는 절차 약속 · 중간 커밋은 main 후보로 안전하지 않으나 서버에 닿지 않는다 · hotfix dev 백포트는 B7 개명 뒤 충돌 가능 | `workflow.md` 릴리즈 절 |
| 태그 혼합 표 뼈대 · 체크아웃 전 스크립트가 지워진 파일을 부르는 경로 없음 | `ssh-deploy.sh:55-60` · `release-inplace.sh:214-215,279` |
| R-8 시 폴링 분석 | `telegram-polling.ts:109,118` |
| 기본값 뒤집기 — 서버 스위치 4 = discord 면 무변화 · CI 는 수신자 0 | `discord-switch.cjs:6,142` |
| R12 일관 — 기동 하한 `v1.2.0` · fit 수신 `v1.3.0` · fin 수신 `v1.5.0` · 읽기 전용 기본값 `v1.5.3` · `NOTIFY_*` 복구 후 즉시 | `git tag --contains` |
| `notifyBot` 15 importer · 웹 조건 변화 없음 | `bot/index.ts:91-93` |
| fit `!bot` 의미 보존 | `admin-alerts.ts:183,189,196,236,271,292,314,337,370` |
| R11 경로 · `TELEGRAM_MAX_LENGTH` 앱 소비 0 · `telegram-fake` 쓰임 표 · `formatter.ts:50` 값 유지 필요 | `git grep` · `ai.ts:94` · `briefing.ts:134` |
| 대장 수치 일치(430 · 3,938 · 6,304 · 1,251 · 5,053 · 110 · 41) | 측정 M1·M12 |
| 버전 minor · 일반 Release(마이그레이션 0) | `workflow.md` #199 |
| `grammy` 전이 8 은 코드 직접 import 0 | `git grep` |

## 미확인

| # | 항목 | 무엇이 있어야 하나 |
|---|---|---|
| U1 | `total − remaining` 이 IDENTIFY 마다 1씩 움직이는지 · 창 의미(U-15) | 검증 봇 + `GET /gateway/bot` 전후 실측 |
| U2 | 같은 토큰 두 세션의 이벤트 분배(U-2) · X2-c 유효성 | 기록 경로를 다르게 한 두 세션 실측 |
| U3 | 서버 `pm_exec_path` 실제 모양 | S0 판정(D5) |
| U4 | 뒤집기의 케이스별 테스트 실패 수 | 실행 |
| U5 | 삭제 테스트 ↔ 잔여 테스트의 분기 대응 | B2·B3 대조표(D6) |
| U6 | 로컬 웹훅 3개의 정체 | 사용자 확인 · A1 착수 전 |
| U7 | 번들의 grammY 포함 · 타입 전용 import 제거 | 빌드 |

## 초안에 없는 사용자 결정 (§8 에 올릴 것)

1. R1 을 관찰 기간 중에 낼지, 11-05 뒤에 낼지(D8).
2. `봇 프로세스 N ≠ 1` 을 R2 부터 게이트로 둘지, 표시만 할지(D5).
3. 수용 기준 5-1 재정의 — "런북 0 · 잔여 = 이력·셸·DB" 를 §7 분류로 바꾸는 것은 009 수용 기준 변경이다.
4. 서버의 토큰 사본 처리(D12).
5. 옛 배포 파일 범위 5 또는 6(D11 · 경미).

## 재감사 범위

D1·D2 순서표 · D3 허용 목록 · D4·D5 §3-3 과 UQ-2 실측 설계 · D6 대조표 범위 · D12 S2 양식. "확인" 항목은 코드가 바뀌지 않는 한 재검증하지 않는다.
