# 009 D-1 설계 초안 감사 1회차 — `02_writer_d1.md` (#339)

감사일 2026-10-28 · `dev` `7d6248f` · reversibility-auditor(읽기 전용) · 오케스트레이터가 응답을 옮겨 적음.
블로커(1번)는 오케스트레이터가 재확인했다: `git show v1.0.8:.gitignore` → `packages/notify/dist/` 만(`:8`) · `git merge-base --is-ancestor 28f6b3e v1.0.8` → 포함 안 됨 · `release-inplace.sh:279` 깨끗함 검사.

## 판정 표

| # | 초안 주장 | 판정 | 근거 | 정정안 |
|---|---|---|---|---|
| 1 | §7·§5 "R-8 이 서버 수동 조치를 부르지 않는다" · PR-1 "다음 릴리즈에 실려 가도 무해" · "R-8 즉시~중간" | **정정 (블로커)** | A3 첫 릴리즈가 서버에 `packages/chat/dist/` 를 만든다. R-8 대상 `v1.0.8` 에는 `packages/chat` 도 무시 줄도 없다 → checkout 뒤 `?? packages/chat/` → `release-inplace.sh:279` → `revert_checkout`. R-8 이 막히고 `rm -rf packages/chat/dist` 손 조치 필요. `node_modules/` 는 모든 태그에서 무시라 무관 | (a) **PR-1 전에 `28f6b3e` 이상 · A3 없는 패치 릴리즈 1회**(코드 0 · 권고) 또는 (b) 새 `release-inplace.sh` 에 대상 태그에 chat 이 없으면 `packages/chat/dist` 를 지우는 분기 + `test_release_inplace.py` |
| 2 | A3 "chat 단계 실패 시 checkout 만 되돌린다(재기동 없음 · `:116-126`)" | **정정** | `revert_checkout` 은 C2 checkout 실패·C4 `--dry-run` 실패에서만(`:116-126,278-279,299`). 기본 실행 rc≠0 → `:315-318` `stop 4` — checkout 은 새 태그에 남고 판정 양식에 `--retry`/R-8 줄(`:51`). 서비스는 무영향 | "서비스 무영향 · rc 4 · checkout 새 태그 · 사용자가 R-8/--retry" |
| 3 | A3 "`--activate` 가 건너뛰는 블록 `:288-290`" · 명령 `tsc -p packages/chat` | **정정 (경미)** | 의존성 블록은 `deploy.sh:292-298`(`:296` 루트 · `:297` 앱) · `at_root` 는 PATH 그대로(`:104`) → 맨 `tsc` 없음 | `:292-298` · `npx --no-install tsc -p packages/chat` 또는 루트 npm 스크립트 |
| 4 | UQ-2·M-4 "서버 `npm -v` 를 받아야 한다" · M-3 "`ci.yml` node 는 착수 때 확인" | **정정** | 서버 npm 11.6.2 기측정(`measured-facts.md:3725` · `:4290` U8) · `ci.yml:29` `[20.x, 24.x]` · `:55` chat ci · HEAD 실행 success | UQ-2 삭제 · M-3 = "apps-ci 20.x 뿐 · `ci.yml` 24.x 가 chat 단독 설치 대리 증거 · 앱 `npm ci` 가 chat 링크를 받는 경로는 미증거(M-1)" |
| 5 | E3 "크론은 이미 `guarded`" · E2 "토큰 없으면 텔레그램 수신자 0" | **정정 (부분)** | `hasAllowedRecipients()` = `telegramRecipients(Route.ALLOWED).length`(`scheduler.ts:22-24,43-52`) — 토큰이 아니라 `TELEGRAM_ALLOWED_CHAT_IDS`. 토큰 없음 + chat ID 남음 + 라우트 텔레그램 → AI 생성 뒤 폐기(비용). 토큰 있으면 1-1 무변경은 확인 | E2 에 "토큰 없으면 텔레그램 수신자 몫 = 0"(실행 판정·전송 판정 같은 출처) · 테스트 1건 |
| 6 | A1 "루트 prepare 확장만으로는 chat dist 의 notify require 가 안 풀린다" | 확인 | 루트 `node_modules/@pleiades` 없음 · chat 의존 `file:../notify` | — |
| 7 | A3 "서버 npm 이 `.npmrc` 우회와 같이 동작하는지가 위험" | **미확인 + 범위 보강** | `.npmrc` 는 `packages/chat/` 에만 · npm 은 링크 대상 `.npmrc` 를 안 읽는다 → 앱 `npm ci` 가 `file:../../packages/chat` 을 풀 때 `null.edgesOut` 재발 가능 | M-1 에 "앱 cwd `.npmrc` 우회 부재" · 재현되면 `apps/<dir>/.npmrc` 도 D-1 범위 |
| 8 | 번들러(fin esbuild · fit Turbopack Q73)가 chat 을 푼다 | 미확인 (위험 낮음) | 링크 둘 다 루트 안 · Q73 은 루트 밖만 거부 · 실측 없음 | M-2 에 "fit 웹 번들에 chat import 0" |
| 9 | C2 "`--smoke` 는 운영으로 새지 않는다" | **확인 + 새 위험** | `pleiades.config.cjs:76`·`:93-100` args 없음. 반대 방향: 스모크가 인자를 잃으면 마커 뒤 `SIGKILL` 경쟁(`smoke-bot-bundle.mjs:35,49`)뿐 · 서버 빌드 셸에 `PLEIADES_ENV_FILE=~/pleiades-platform.env`(`release-inplace.sh:221`) → 운영 Discord 토큰으로 IDENTIFY·크론 가능 | ① 스모크가 `--smoke` 를 넘기는지 정적 테스트 ② 무효 텔레그램 토큰 주입 유지 ③ 스모크 자식 env 에서 `DISCORD_*`·`PLEIADES_ENV_FILE`·`DATABASE_URL` 제거(지우는 것이라 누수 불가) · 서버 체크아웃 루트 `.env` 부재 확인 |
| 10 | B1 `TELEGRAM_POLLING=off` · 셸 정리 와일드카드 · minor | 확인 (조건 2) | `release-inplace.sh:20` `TELEGRAM_[A-Z_]*` · `:229` · `check_env.py:37` 모르는 키 거부 안 함 · `test_deploy.py:773-778` 은 `.env.example` 키가 템플릿에도 있어야 → 주석 선택 키 · `platformEnv` 는 `NOTIFY_*`·`DISCORD_*` 만 → 루트 `.env` 값은 무시 | 런북 "앱 `.env` 에만" 한 줄 |
| 11 | D3 IDENTIFY 기록 `apps/<dir>/logs/` | 확인 | 루트 `.gitignore:24,29` — `v1.0.0`·`v1.0.8` 에도 · 앱 `/logs/` · P-2′ 에서 `logs` 는 체크아웃 안 실제 디렉터리 → 재배포·R-8 을 넘어 유지 · MCP 정리는 `mcp-*.log` 만 · `identify-guard.ts:160-182` 0700/600 | 외부 logrotate 여부 미확인(사용자) — 런북 한 줄 |
| 12 | W2 `release-inplace.sh:180` | 확인 | `:180` · `:279` | Δ9 에 `:279` 추가 |
| 13 | E1 순서 · E4 exit 제거 · fit `ensureDefaults` 를 gateway 앞에 | 확인 | fin `standalone.ts:18-37` · fit `:22-67` | — |
| 14 | E5 "직전 꺼짐 → 지금 켬" 상태 파일 | 확인 + 새 위험 | 위치는 11번과 같음. D-2′ 뒤 D-1 이전 태그로 R-8 → 옛 코드가 drop 없이 폴링 → R14 | §7 "폴링을 끈 뒤 R-8 하한 = D-1 태그" |
| 15 | E6 fit `!bot` 보존 | 미확인 | `admin-alerts.ts:196-201,236` · 웹 무전달 경로 `lib/cron.ts:43`·`api/sync/route.ts:90` | M-6 |
| 16 | G chat intents 고정 → 4014 | 확인(사실) · 미확인(운영 포털) | `chat.ts:174` · `gateway.ts:29` `(1<<9)\|(1<<15)` · `:54` 4014 FATAL · `:257-261` | G1(D-1 은 intents 0) 유지 · D-2 포털 조치 → `--draft` |
| 17 | 1-9 로컬 실측 "기록 선채움" | 확인 (수단 차이 기록) | 정본 `009:217` "임계를 낮춰" | 1-9 행에 대체 사유(운영 누수 손잡이 0) |
| 18 | PR 분할 · 중간 상태 릴리즈 | **정정 (1번 연동)** | A3 를 처음 싣는 어떤 릴리즈든 R-8 대상 `v1.0.8` → 1번 | §5 "어느 PR 에서 멈춰도 무해" 에 1번 조건 |
| 19 | 숫자 N1~N13 · W1·W3·W5·W9 | 확인 | 대장 밖 숫자·중복 없음 | N13 출처에 `:4290` |

## 정정 개수

**6** — 블로커 1(1) · 실질 3(2·4·5) · 경미 1(3) · 연동 1(18). 확인 10 · 미확인 3(7·8·15) · 16 은 혼합. → **초안으로 반려.**

## 새 위험

- R-new1 (1): 첫 chat 빌드 릴리즈의 R-8 이 `packages/chat/dist` untracked 로 막힌다.
- R-new2 (9): 스모크가 `--smoke` 를 잃으면 운영 Discord 토큰으로 IDENTIFY·크론·upsert.
- R-new3 (5): 토큰 없음 + chat ID 남음 + 라우트 텔레그램 → AI 생성 뒤 폐기.
- R-new4 (7): 앱 `npm ci` 가 chat `.npmrc` 우회를 상속하지 않는다.
- R-new5 (14): 폴링을 끈 뒤 D-1 이전 태그로 R-8 → 밀린 텔레그램 명령 실행.
