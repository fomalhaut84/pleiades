# 007 전환(cutover) 설계 실측 — repo-surveyor (#163 · 2026-10-16)

**측정 대상:** pleiades `dev` `0284a22`(2026-10-16 10:28 · #160 수용 후) 의 `apps/finance`·`apps/fitness` 추적 파일 + 서비스 원격 https `ls-remote`(I-13) 2종.
**하지 않은 것:** 서버·ssh·pm2·nginx·서비스 DB 접근 0 · `repos/*`·`~/workspace/myF*` git 명령 0 · `.env` 파일 열람 0 · `deploy/**`·`ecosystem.config.js` 실행 0(읽기만) · `apps/*` 하네스 지시 미이행.
**`apps/*` 의 서비스 ref:** `tools/import/STATE.json` — fin `service_dev 55404173bd9c` · fit `service_dev 0b3ccd4c33c2`.
**기존 값 인용:** `docs/research/measured-facts.md` 행 번호(MF:N).

---

## ⚠ 기존 가정을 뒤집거나 설계를 좌우하는 값

| # | 사실 | 출처 |
|---|---|---|
| W1 | **서비스 배포는 서비스 저장소의 GitHub Release(태그)에 묶여 있다.** 서버는 `DEPLOY_PATH` 의 *서비스 저장소 클론* 에서 `git fetch origin --tags --force` → `git checkout -f <tag>` → `./deploy/deploy.sh <tag>`. pleiades 에는 **태그 0 · Release 0 · 배포 job 0**. 전환 = 배포 경로를 새로 만드는 일이지 스위치가 아니다 | fin `deploy.yml:9-11,78,96-97,127` · fit `deploy.yml:9-11,78,86-89` · `git tag \| wc -l`=0 · `gh release list -R fomalhaut84/pleiades` 빈 출력 |
| W2 | **현 `deploy.sh` 는 pleiades 체크아웃에서 그대로 못 돈다.** fin 은 `REPO_ROOT=$SCRIPT_DIR/..`(=`apps/finance`)에서 `git fetch/checkout <tag>` 를 하는데 pleiades 에 그 태그가 없고, **루트 `npm ci`(→ `packages/notify/dist`) 단계가 없다** — `file:../../packages/notify` 라 빌드 실패(006 ㉒). fit 은 **`cd /home/nasty68/myFitness` 하드코딩** | fin `deploy.sh:14-19,65,106` · fit `deploy.sh:10,37,41,49` · 두 `package.json` `"@pleiades/notify": "file:../../packages/notify"` |
| W3 | **fit `ecosystem.config.js` 는 cwd 를 절대경로로 3번 하드코딩**(`/home/nasty68/myFitness`) — fin 은 `__dirname`. 디렉터리를 옮기면 fit pm2 정의가 깨진다 | fit `ecosystem.config.js:7,23,66` · fin `:7,21,46` |
| W4 | **서버 작업 디렉터리 안에 영속 상태가 있다**(전부 gitignored · 이전 대상): fin `reports/`(분기 PDF — DB `QuarterlyReport.pdfPath` 는 **파일명만** 저장) · `logs/` · `backups/`(백업 스크립트 기본) / fit **`.garmin-tokens/` · `.omron-tokens/`**(외부 계정 인증 상태) · `.runtime/` · `logs/` | fin `pdf-generator.ts:16,39-46` · `mcp/logger.ts:21` · `scripts/backup-db.sh:20` · fit `garmin/client.ts:5` · `omron/client.ts:11` · `claude-advisor.ts:7` · `mcp/logger.ts:20` · 각 `.gitignore` |
| W5 | **배포본 ≠ `apps/*`.** 두 서비스 모두 최신 태그 = `main` HEAD(경량 태그), `apps/*` = `dev`. fin `main edf9f234` ≠ `dev 55404173` · fit `main ec7987ce` ≠ `dev 0b3ccd4c`. 차이 커밋 수는 **미측정**(fetch 필요) | `git ls-remote` (아래 §7) |
| W6 | **같은 DB 로 합치면 `_prisma_migrations` 테이블이 충돌한다.** 모델명 충돌은 0(대소문자 무시 포함)이지만 두 스키마 모두 기본 마이그레이션 테이블·기본 스키마(`public`)를 쓴다 → DB 분리 또는 Postgres 스키마 분리가 전제 | 두 `schema.prisma` datasource(`?schema=` · `multiSchema` 0) |
| W7 | **같은 이름 env 키 15개**(아래 §3). 앱별 값이 달라야 하는 것: `DATABASE_URL` · `TELEGRAM_BOT_TOKEN` · `TELEGRAM_ALLOWED_CHAT_IDS` · `PORT` · `BASE_URL` · `MCP_PORT` · `MCP_TRANSPORT`(동일 가능). 앱별 `.env` 가 cwd 기준이라 **앱 디렉터리를 분리 유지하면 충돌 없음**, 한 프로세스/한 env 로 합치면 충돌 | §3 |
| W8 | **버전 숫자는 `package.json` 에 없다** — 두 앱 모두 `"version": "0.1.0"`, 실제 버전은 태그뿐(fin **v0.16.5** · fit **v2.41.1**). MF:24 의 v0.16.4 / v2.27.2 는 stale | 두 `package.json` · §7 |

---

## 1. 배포 경로

| | fin | fit |
|---|---|---|
| 트리거 | `release: published` + `workflow_dispatch(inputs.tag)` · prerelease/draft 제외 | 동일 |
| 직렬화 | `concurrency: deploy-production` | 동일 |
| ssh | `appleboy/ssh-action@v1.2.2` · secrets `DEPLOY_SSH_HOST` `DEPLOY_SSH_USER` `DEPLOY_SSH_KEY` `DEPLOY_SSH_PORT` `DEPLOY_SSH_FINGERPRINT` `DEPLOY_PATH` · timeout 30m | 동일(이름 동일) |
| 원격 스크립트 | 태그 semver 검증 → `cd $DEPLOY_PATH` → **mcp-config.json bootstrap 백업** → `fetch --tags --force` → `checkout -f $TAG` → (stdio 대상 판정·복원) → `deploy.sh $TAG` → stdio 대상이면 `pm2 delete myfinance-mcp` | 태그 검증 → `cd $DEPLOY_PATH` → `fetch --tags --force` → `checkout -f $TAG` → `deploy.sh $TAG` |
| 배포 알림 | 텔레그램 curl · secrets `TELEGRAM_BOT_TOKEN` `TELEGRAM_CHAT_ID` (성공·실패) | 동일 |
| 출처 | `apps/finance/.github/workflows/deploy.yml:9-152,165-263` | `apps/fitness/.github/workflows/deploy.yml:9-89,93-185` |
| 기타 workflow | `ci.yml`(push/PR dev·main) · `security-audit.yml`(주 1회 + lock 변경) | 동일 |

**`deploy/deploy.sh`(읽기만):**

| 단계 | fin (`deploy.sh`) | fit (`deploy.sh`) |
|---|---|---|
| 디렉터리 | `REPO_ROOT=$SCRIPT_DIR/..` (:14-16) | **`cd /home/nasty68/myFitness`** (:10) |
| git | `fetch origin --tags` · `checkout -f $TARGET` · 브랜치면 `pull` (:19,65-70) | 동일 (:37-46) |
| 설치 | `npm ci` (:106) | `npm ci` (:49) |
| DB | `npx prisma migrate deploy` (:109) | `migrate deploy` + `prisma generate` (:52-53) |
| 빌드 | HTTP MCP 대상: `next build` + `build:mcp:staged` + `build:bot` (:124-126) | `npm run build:staged` (:59) |
| MCP 사전검증 | 임시 포트 **4299** `/health` 20 s (:140-214) | 임시 포트 **4399**(`MCP_PREFLIGHT_PORT`) (:26,61-129) |
| pm2 | `startOrRestart --only myfinance-mcp` → health 4210 → (실패 시 dist 롤백) → `pm2 save` → `startOrReload myfinance` → `startOrRestart myfinance-bot` (:226-329) | `startOrRestart myfitness-mcp` → health `$MCP_PORT`(기본 4301) → `pm2 save` → `startOrReload myfitness --update-env` → `delete`+`start myfitness-bot` → `pm2 save` (:140-183) |
| 도메인 | `https://finance.starryjeju.net` (:334) | `https://fitness.starryjeju.net` (:188) |

- **배포가 묶인 ref = 서비스 저장소의 Release 태그**(fin `v*` 27개 · fit `v*` 89개). 브랜치 배포(`deploy.sh dev`)는 수동 경로로만 남아 있다(주석 :3-6).
- fit 은 workflow 가 `$DEPLOY_PATH` 에서 checkout 한 뒤 deploy.sh 가 **하드코딩 경로**에서 다시 checkout — 둘이 같은 경로라는 것은 서버에서만 확인 가능(§8).
- MF:964-986(M4) 와의 차이: M4 는 fit 서버 경로를 `deploy.sh:10` 으로만 적었다 → **현재 fit workflow 도 `secrets.DEPLOY_PATH` 를 쓴다**(`deploy.yml:59,78`) + `ecosystem.config.js` 3곳 하드코딩(W3) 추가.

**nginx 템플릿(`deploy/nginx/*.conf` · 서버 실설정과 같은지는 미측정):** fin `server_name finance.starryjeju.net` · `listen 80` · `/`·`/_next/static/`·`/favicon.ico` → `localhost:4100` · SSL 은 certbot 이 추가(주석 :8-9). fit `fitness.starryjeju.net` · 같은 구성 + **`/api/ai` 300 s 타임아웃** → `localhost:4200`.

## 2. 프로세스 · 포트 (MF:29-38 재확인 — 변화 없음)

| pm2 이름 | 스크립트 | 포트 | instances | 비고 · 출처 |
|---|---|---|---|---|
| `myfinance` | `next start -p 4100` | 4100 | 1 | 1024M · fin eco `:4-17` |
| `myfinance-bot` | `dist/bot/standalone.cjs` | — | 1 | 512M · kill_timeout 15 s · exp backoff · **크론 6 + 알림 스케줄러 + Discord gateway**(`standalone.ts` 가 `lib/cron`·`discord-interactions` import) |
| `myfinance-mcp` | `dist/mcp/server.cjs` | **4210**(127.0.0.1) | 1 | `MCP_TRANSPORT=http` · `MCP_LOG_TEE_FILE=1` · `server.ts:924-925` |
| `myfitness` | `next start -p 4200` | 4200 | 1 | `TZ=Asia/Seoul` · **웹이 크론을 돈다**(`instrumentation.ts` → `startCronJobs`·사진 temp sweeper·report-job sweeper) |
| `myfitness-bot` | `dist/bot/standalone.cjs` | — | 1 | `max_restarts` 무한 · 알림 스케줄 + Discord gateway |
| `myfitness-mcp` | `dist/mcp/server.cjs` | **4301**(127.0.0.1 · `MCP_PORT` 우선) | 1 | `server.ts:719-720` |

**호출 관계:**
- fin advisor: `sh -c "claude -p … --mcp-config <path> --strict-mcp-config --allowedTools …"` — `claude` 는 PATH 조회(`CLAUDE_BIN` 없음) · `mcp-config` = `MCP_CONFIG_PATH` ?? `(MYFINANCE_ROOT ?? cwd)/src/lib/ai/mcp-config.json` = **추적 파일**(url `127.0.0.1:4210` 하드코딩) → **런타임에 소스 트리가 필요**(`claude-advisor.ts:753-816`).
- fit advisor·영양 추정 4곳: `spawn(CLAUDE_BIN || "claude")` · `.runtime/mcp-config.json` 을 매 호출 생성(MF:51-55 정정 재확인) · URL = `MCP_HTTP_URL` → `MCP_PORT` → 4301 (`claude-advisor.ts:7-28,262-312`).
- fit MCP → 웹: `web-api.ts` 가 `APP_BASE_URL`(advisor 가 `http://localhost:${PORT??4200}` 로 주입) 호출 — **MCP 가 웹 포트에 의존**(`claude-advisor.ts:125` · `web-api.ts:5`).
- fit 관리자 알림이 `curl 127.0.0.1:4301/health` 를 안내문에 하드코딩(`admin-alerts.ts:306`).

## 3. env 인벤토리 (키 이름만 · `.env` 미열람)

추출: 코드 `process.env.X`·`process.env['X']`(테스트 제외) ∪ `.env.example` ∪ 문자열 리터럴(`platformEnv('…')`·`csvEnv('…')`·zod 스키마) + 동적 키 수동 보정(fin `NOTIFY_${route}_CHANNEL` → `NOTIFY_ALLOWED_CHANNEL`·`NOTIFY_ADMIN_CHANNEL`).

| 분류 | fin (28) | fit (37) |
|---|---|---|
| DB | `DATABASE_URL` | `DATABASE_URL` |
| 텔레그램 | `TELEGRAM_BOT_TOKEN` `TELEGRAM_ALLOWED_CHAT_IDS` `TELEGRAM_ADMIN_CHAT_IDS` `TELEGRAM_WEBHOOK_SECRET`(템플릿만 · 코드 0) | `TELEGRAM_BOT_TOKEN` `TELEGRAM_ALLOWED_CHAT_IDS` |
| 플랫폼(루트 `.env` · `platformEnv`) | `NOTIFY_ALLOWED_CHANNEL` `NOTIFY_ADMIN_CHANNEL` `NOTIFY_INTERACTIVE_CHANNEL` `DISCORD_WEBHOOK_FINANCE` `DISCORD_WEBHOOK_ADMIN` `DISCORD_BOT_TOKEN_FINANCE` `DISCORD_CHANNEL_ID_FINANCE` `DISCORD_ALLOWED_USER_IDS` | `NOTIFY_ALLOWED_CHANNEL` `NOTIFY_INTERACTIVE_CHANNEL` `DISCORD_WEBHOOK_FITNESS` `DISCORD_BOT_TOKEN_FITNESS` `DISCORD_CHANNEL_ID_FITNESS` `DISCORD_ALLOWED_USER_IDS` |
| 외부 계정 | `WHOOING_WEBHOOK_URL`(+ DB `WhooingConfig.webhookUrl`) | `GARMIN_EMAIL` `GARMIN_PASSWORD` `MFDS_API_KEY` `MFDS_BASE_URL` `OMRON_EMAIL` `OMRON_PASSWORD` `OMRON_APP_ID` `OMRON_APP_KEY` `OMRON_API_BASE`(fit#514 · #160 수용으로 새로 들어옴) |
| 인증(웹) | `AUTH_PIN` `AUTH_SECRET` `AUTH_TRUST_HOST`(next-auth v5 · 후 둘은 라이브러리가 암묵 읽기) | 없음(next-auth 미의존) |
| advisor/claude/MCP | `MCP_CONFIG_PATH` `MYFINANCE_ROOT` `MCP_PORT` `MCP_TRANSPORT` `MCP_LOG_DIR` `MCP_LOG_LEVEL` `MCP_LOG_RETENTION_DAYS` `MCP_LOG_TEE_FILE` | `CLAUDE_BIN` `MCP_HTTP_URL` `MCP_PORT` `MCP_TRANSPORT` `MCP_LOG_DIR` `MCP_LOG_LEVEL` `MCP_LOG_RETENTION_DAYS` `MCP_LOG_TEE_FILE` `APP_BASE_URL` |
| 포트/URL | `PORT` `BASE_URL`(템플릿만) | `PORT` `BASE_URL`(템플릿만) |
| 크론 | — | `SYNC_CRON` `REPORT_CRON` `MORNING_REPORT_CRON` `EVENING_REPORT_CRON` `AUTO_ADJUST_CRON` `AUTO_ADJUST_MAINTENANCE_CRON` |
| 기타 | `NODE_ENV` | `NODE_ENV` `NEXT_RUNTIME` `TZ`(eco) |

- **같은 이름 15**: `BASE_URL` `DATABASE_URL` `DISCORD_ALLOWED_USER_IDS` `MCP_LOG_DIR` `MCP_LOG_LEVEL` `MCP_LOG_RETENTION_DAYS` `MCP_LOG_TEE_FILE` `MCP_PORT` `MCP_TRANSPORT` `NODE_ENV` `NOTIFY_ALLOWED_CHANNEL` `NOTIFY_INTERACTIVE_CHANNEL` `PORT` `TELEGRAM_ALLOWED_CHAT_IDS` `TELEGRAM_BOT_TOKEN`. 그중 **플랫폼 3(`DISCORD_ALLOWED_USER_IDS`·`NOTIFY_*` 2)은 의도적 공유**(루트 `.env` 한 곳), 나머지는 앱별 `.env`(cwd) 라 디렉터리 분리 시 무충돌.
- 루트 `.env.example` 플랫폼 키 11: `DISCORD_ALLOWED_USER_IDS` `DISCORD_BOT_TOKEN_FINANCE` `DISCORD_BOT_TOKEN_FITNESS` `DISCORD_CHANNEL_ID_FINANCE` `DISCORD_CHANNEL_ID_FITNESS` `DISCORD_WEBHOOK_ADMIN` `DISCORD_WEBHOOK_FINANCE` `DISCORD_WEBHOOK_FITNESS` `NOTIFY_ADMIN_CHANNEL` `NOTIFY_ALLOWED_CHANNEL` `NOTIFY_INTERACTIVE_CHANNEL`. 허용 정규식 `PLATFORM_KEY_RE`(`packages/notify/src/platform-env.ts:27-28`).
- **루트 `.env` 탐색:** `PLEIADES_ENV_FILE` 우선, 없으면 cwd 에서 위로 `package.json` `name === "pleiades"` 인 디렉터리의 `.env`(`platform-env.ts:76-104`). **서비스 서버 현재 구조(서비스 저장소 클론)에는 그런 루트가 없으므로 플랫폼 키는 프로세스 env 로만 읽힌다** — 전환 후 pleiades 체크아웃이면 자동.
- 템플릿에 없고 코드만 읽는 키: fin 17 · fit 20 (위 표의 플랫폼·MCP·크론 등) — 서버 실 `.env` 에 있는지 미측정.

## 4. DB

| | fin | fit |
|---|---|---|
| provider | postgresql · `env("DATABASE_URL")` | 동일 |
| generator | `prisma-client-js`(node_modules) | **`prisma-client` · output `src/generated/prisma`**(gitignored · 빌드 전 `prisma generate` 필수) |
| 모델 · enum · `@@map` | **30** · 0 · 0 | **17** · 0 · 0 |
| 마이그레이션 디렉터리 | **26** · 처음 `20260304090321_init` · 최신 `20260917070947_cleanup_index_price_cache` | **36** · 처음 `20260407021814_init` · 최신 **`20261015052330_omron_source_body_fields`** |
| 적용 방식 | `prisma migrate deploy`(deploy.sh:109 · CI) — `db push` 0 | 동일(:52) |
| DB 이름 표기 | 템플릿 `myfinance` · CI `myfinance_ci` · 백업 스크립트 기본 `myfinance` | 템플릿 `myfitness` · CI `myfitness_ci` |
| 비테이블 객체 | 0 | CHECK 제약 `BloodPressure_source_check` · `BodyComposition_source_check` |

- **모델명 충돌 0**(대소문자 무시 포함) · 함수·트리거·타입·확장·뷰 0 · **충돌은 `_prisma_migrations` 하나**(W6).
- MF:3989 의 fit `35/35` → **36**(#160 수용 · `20261015052330`). fin 26 은 MF:3970 과 동일.
- 백업: fin `scripts/backup-db.sh` = `pg_dump --dbname=$DB_NAME | gzip` → `$PROJECT_DIR/backups` · 보관 7일 · cron 예시 주석만(실제 등록 여부 미측정). fit 백업 스크립트 없음.

## 5. 빌드 산출물 · 의존

| | fin | fit |
|---|---|---|
| `build` | `next build && build:mcp:staged && build:mcp:activate && build:bot` | 동일 + `build:staged`(activate 제외 · deploy 용) |
| 번들 | esbuild `--platform=node --target=node20` → `dist/mcp/server.cjs` · `dist/bot/standalone.cjs` | 동일 |
| 봇 번들 external(런타임에 앱 `node_modules` 필요) | `@prisma/client` `grammy` `node-cron` `yahoo-finance2` `trading-signals` `dotenv` + `bufferutil`·`utf-8-validate`(ws 선택 의존) | `@flow-js/garmin-connect` `@prisma/client/runtime` `grammy` `node-cron` `dotenv` + 동일 2 |
| `@pleiades/notify` | `file:../../packages/notify` — 봇 번들·Next 서버 번들에 **인라인**(런타임 `require("@pleiades/notify")` 0 · `.nft.json`/sourcemap 이 `packages/notify/dist` 를 가리킴 · 로컬 빌드 2026-10-16 판독) | 동일 |
| 빌드 선행 | **루트 `npm ci`**(`prepare` → `packages/notify/dist`) → 앱 `npm ci` → `prisma migrate deploy`(fin build 가 DB 필요 · 006 ㉑) | 루트 `npm ci` → 앱 `npm ci` → `prisma generate` |
| lockfile | `apps/finance/package-lock.json` | `apps/fitness/package-lock.json` · 루트 `package-lock.json`(fit `next build` workspace root 추론 · 006 ㉒) · `packages/notify/package-lock.json` |
| `engines` | 없음(앱·루트·notify 전부) | 없음 |
| node 요구(lock 판독) | 직접 의존 최고 하한 `>=20`(marked·node-cron·yahoo-finance2) · 런타임 경고 yahoo-finance2 *Node >= 22*(MF:3994) | 비dev 의존 `>=20.19.0` 6(`@csstools/*` 5 · `entities`) · next 16.3.8 `>=20.9.0` |
| CI node | `20.x`(서비스 `ci.yml:34` · pleiades `apps-ci.yml:53,102,146`) | 동일 |
| 런타임에 필요한 소스 | `src/lib/ai/mcp-config.json`(advisor) · `assets/fonts`(PDF) | `dist/mcp/server.cjs`(stdio 폴백) |

- 로컬 빌드 산출물 판독: fit `dist/bot/standalone.cjs` 에 prisma generator 메타의 **절대경로 2건**(`/Users/sagan/.../apps/fitness/src/generated/prisma` · `schema.prisma`) — 빌드 호스트 경로가 박힌다. 산출물을 다른 경로로 복사하는 방식이면 영향 미측정(서버에서 빌드하는 현행 방식은 무관).
- MF:3976 Next 16.3.5 → lock **16.3.8**(수용으로 변경).

## 6. pleiades 쪽 현재 상태

| 항목 | 값 | 출처 |
|---|---|---|
| 루트 `package.json` | `name: pleiades` · `private` · **workspaces 없음** · `prepare`/`build` = `tsc -p packages/notify` · deps `ws ^8.22.0` · devDeps `typescript ^5` · `main/exports` → `packages/notify/dist`(ALT-d) | `package.json` |
| `packages/notify` | `0.1.0` · deps 0 · engines 없음 | `packages/notify/package.json` |
| workflows | `apps-ci.yml`(push/PR dev·main · 앱 3 job) · `ci.yml`(push/PR dev·main) · `security-audit.yml`(주 1회·lock 변경) — **배포·ssh·release 0** · secrets 0(I-9) | `grep -rniE 'deploy\|ssh\|release' .github/` → `migrate deploy` 3건뿐 |
| `apps/*/.github/workflows/deploy.yml` | 트리 안에 있으나 **비활성**(루트가 아님 · I-9) | — |
| 태그 · Release | **0 · 0** | `git tag \| wc -l` · `gh release list -R fomalhaut84/pleiades` |
| 브랜치 | `main 7144f9f`(8 커밋) · `dev 0284a22` · `main..dev` **857** | `git ls-remote origin` · `git rev-list --count` |
| 로컬 실행 | `tools/local/run.sh` · 포트 4610/4620(MF:3988) · DB `pleiades_fin`·`pleiades_fit` | MF:3983- |

## 7. 서비스 릴리즈 현황 (https `ls-remote` · I-13)

| | fin | fit |
|---|---|---|
| 태그 수 | 27 | 89 |
| 최근 5 | v0.16.1 · v0.16.2 · v0.16.3 · v0.16.4 · **v0.16.5** | v2.40.0 · v2.40.1 · v2.40.2 · v2.41.0 · **v2.41.1** |
| 최신 태그 커밋 | `edf9f2344c2b`(경량 태그 · `^{}` 없음) | `ec7987ce1388`(경량) |
| `main` | `edf9f2344c2b` = 최신 태그 | `ec7987ce1388` = 최신 태그 |
| `dev` | `55404173bd9c` = `apps/finance` 수용 ref(M-1 이후 무변경) | `0b3ccd4c33c2` = `apps/fitness` 수용 ref(#160) |

명령: `git ls-remote --tags --refs https://github.com/fomalhaut84/<repo>.git | sort -V | tail -5` · `git ls-remote <url> refs/heads/main refs/heads/dev` · `git ls-remote <url> refs/tags/<t> 'refs/tags/<t>^{}'`.
**배포된 버전은 "최신 Release = main" 이라는 가정**이다 — 실제 서버 HEAD 는 미측정(§8).

## 8. 미측정 — 사용자 확인 필요 (서버에서만 알 수 있음)

| # | 항목 | 왜 필요한가 |
|---|---|---|
| U1 | 서버 `DEPLOY_PATH` 실제 경로 2개(fit 이 `/home/nasty68/myFitness` 와 같은지) · 사용자 계정 | 새 배포 디렉터리 설계 · fit 하드코딩 3+1곳 |
| U2 | 서버 체크아웃의 현재 HEAD(태그) · dirty 여부(fin mcp-config.json swap 잔여) | 마지막 배포 버전 확정 |
| U3 | `pm2 ls` 실제 목록 · `pm2 save` dump · startup(systemd) 설정 · PM2_HOME | 전환 시 앱 이름 교체/삭제 범위 |
| U4 | nginx 실제 `sites-enabled` · SSL(certbot) 블록 · 다른 vhost 유무 | 템플릿과 차이 · 도메인 이전 |
| U5 | 서비스 DB 이름·크기·Postgres 버전·사용자/권한 · 같은 클러스터 여부 | DB 통합/분리 결정(W6) · 백업 시간 |
| U6 | 백업 실재(cron 등록 · `backups/` 보관량 · 오프사이트) | 전환 전 백업 절차 |
| U7 | 서버 실 `.env` 의 키 목록(값 아님) · 템플릿 밖 키(MCP_*·크론·OMRON 등) 실제 설정 여부 | env 이전표 |
| U8 | 서버 node·npm 버전 · `claude` CLI 경로·로그인 계정 · `lsof`·`jq` 유무 | node `>=20.19` 요건 · advisor 이전 |
| U9 | `reports/`·`logs/`·`backups/`(fin) · `.garmin-tokens/`·`.omron-tokens/`·`.runtime/`·`logs/`(fit) 실재·크기 | 영속 상태 이전(W4) |
| U10 | 서버에서 pleiades(PUBLIC) https 접근 가능 여부(003 Q45 와 같은 항목) | 새 배포 경로의 fetch |
| U11 | 서비스 저장소 GitHub secrets 실제 목록(이름) · 배포 알림 채팅 | 배포 workflow 이관 시 pleiades secrets 0(I-9) 정책과 충돌 여부 |
| U12 | 서버 crontab · 다른 프로세스(myTangerine 등 같은 서버 서비스)와 포트 공유 | 포트 계획(4100/4200/4210/4301/4299/4399) |
| U13 | 서비스 텔레그램 봇 2개의 webhook/long polling 현황 · 409 회피 순서 | 봇 토큰 이관 시 이중 기동 금지 |
| U14 | `main..dev` 차이 커밋 수(fin·fit) | W5 · 첫 pleiades 배포가 새 코드를 얼마나 싣는지 — 스크래치 blobless clone 으로 측정 가능하나 이번 범위(ls-remote) 밖 |

## 실행한 명령 (요약)

```bash
cd ~/workspace/pleiades   # dev 0284a22
git ls-files apps/{finance,fitness}/{.github,deploy,ecosystem.config.js,scripts}
cat -n apps/*/.github/workflows/deploy.yml apps/*/deploy/deploy.sh apps/*/ecosystem.config.js   # 읽기만
grep -n --binary-files=text -E 'server_name|listen|proxy_pass|location' apps/*/deploy/nginx/*.conf
python3 -c 'json.load(open("apps/<a>/package.json"))' # scripts·engines·deps
python3 <lock 판독: packages[*].engines.node>
git grep --text -ohE "process\.env(\.[A-Z_][A-Z0-9_]*|\[['\"][A-Z_][A-Z0-9_]*['\"]\])" HEAD -- apps/<a>/src … ':!**/__tests__/**' ':!**/*.test.ts'
git grep --text -ohE "['\"\`](TELEGRAM|NOTIFY|DISCORD|…)_[A-Z0-9_]*['\"\`]" HEAD -- apps/<a>/src …
grep -oE '^[A-Z_][A-Z0-9_]*' apps/<a>/.env.example .env.example
grep -cE '^model ' apps/<a>/prisma/schema.prisma ; git ls-tree -d --name-only HEAD apps/<a>/prisma/migrations/ | wc -l
comm -12 <fin models> <fit models>   # 0
cat apps/<a>/prisma/migrations/*/migration.sql | grep -oiE 'CREATE (FUNCTION|TRIGGER|TYPE|EXTENSION|VIEW|…)|ADD CONSTRAINT "…" CHECK'
git grep --text -nE "process\.cwd\(\)|\.garmin-tokens|\.runtime|logs|reports" HEAD -- apps/<a>/src
/usr/bin/grep -rl --binary-files=text 'packages/notify' apps/<a>/.next/server ; /usr/bin/grep -oE 'require\("[^"]+"\)' apps/<a>/dist/bot/standalone.cjs
git tag | wc -l ; gh release list -R fomalhaut84/pleiades ; git ls-remote origin refs/heads/main refs/heads/dev
git ls-remote --tags --refs https://github.com/fomalhaut84/{myFinance,myFitness}.git
```
