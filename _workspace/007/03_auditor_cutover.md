# 007 전환 설계 초안 감사 — reversibility-auditor (#163 · 2026-10-16)

**대상:** `_workspace/007/02_writer_cutover.md`(초안 1회차) · 실측 `_workspace/007/01_surveyor_cutover.md`([S]) · measured-facts *2026-10-16 — 전환 설계 실측*.
**감사 트리:** pleiades `dev` `0284a22` 의 `apps/*`·`packages/notify`·루트(읽기). **서비스 현재 상태는** pleiades 밖 스크래치
`/private/tmp/claude-501/-Users-sagan-workspace-pleiades/3b6ddfbd-153c-4782-b595-fc80620ec29d/scratchpad/audit007/{myFinance,myFitness}.git`
(`git clone --bare --no-tags https://…` → `git remote remove origin` · I-13 범위) 로 읽었다 — `apps/*` 수용 ref 와 서비스 `main`(배포본 가정) 을 비교하려면 서비스 이력이 필요하기 때문이다.
**하지 않은 것:** 서버·ssh·pm2·서비스 DB 0 · `repos/*`·`~/workspace/myF*` git 0 · `.env` 열람 0 · `deploy/**`·`ecosystem.config.js` 실행 0 · 리모트 추가·push 0. 심링크 거동 실험은 스크래치의 빈 저장소(`audit007/symtest`)에서만.

**결론: 정정 8 · 미확인 4 · 나머지 확인. 문서는 초안으로 되돌아간다 — 부분 개정(2회차)으로 충분하고 개정본 재발행까지는 아니다.** 뼈대(F-1 · S-a · P-2 · DB-a · 옛 디렉터리 swap back)는 코드로 지지된다. 틀린 것은 그 뼈대의 **전제 문장과 빠진 행**이다.

---

## A. 지목된 주장 1~5

| # | 주장 (초안) | 판정 | 실제 |
|---|---|---|---|
| 1a | F-1 의 전제: `apps/*` 의 `prisma/migrations` = 서비스 dev 의 것 + **pleiades 가 추가한 마이그레이션 0** | **확인** | `apps/{finance,fitness}/prisma` **트리 해시가 수용 ref(fin `55404173` · fit `0b3ccd4c`)의 `prisma` 트리와 동일**(SAME · 아래 명령 A1). schema.prisma 포함. 파일이 바이트 동일하므로 `_prisma_migrations` checksum 불일치도 없다 |
| 1b | M2 — 서비스 `main`(배포본) ↔ `dev` 마이그레이션 차이 **미측정** | **측정함(신규 값)** | **fin:** `main..dev` 2커밋(비머지 1) · 트리 차이 **1파일 `.claude/rules/workflow.md`** · 마이그레이션 차이 **0** · `apps/finance` migrations 트리 = 서비스 `main` 의 것(SAME). **fit:** `apps/fitness`(`0b3ccd4c`) vs `main`: 1커밋 · 문서 1파일 · 마이그레이션 차이 **0**(SAME). **단 서비스 fit `dev` 는 오늘 `13a9c38`(fit#528 건강검진 이력 1/2)로 움직였고 `main..dev` 에 **마이그레이션 `20261016011539_health_checkup` 1개 + schema +41행**이 있다 — 다음 수용이 이것을 `apps/fitness` 로 가져온다. 결론: **지금 시점 첫 배포의 `migrate deploy` 는 두 앱 모두 no-op**(배포본 = `main` 가정 · U2) · fin 의 F-1 ②(서비스 먼저 릴리즈)는 마이그레이션 면에서 불필요 · **fit 은 F-1 이 실제로 필요하다**(다음 수용 이후) |
| 2 | P-2 심링크 — *"`.gitignore` 가 그 경로들을 무시하므로 … `git checkout -f` 에 지워지지 않는지는 T-1 리허설에서 확인"* | **정정**(정정 1) | 전제가 틀렸다 — **심링크는 무시되지 않는다.** 두 앱의 패턴은 전부 끝 `/`(`/reports/` `/logs/` `/backups/` `.garmin-tokens/` `.omron-tokens/` `.runtime/`)이라 **디렉터리에만** 맞고, git 은 심링크를 디렉터리로 보지 않는다 → **untracked(`??`)**. 실측(symtest): `checkout -f <다른 태그>` 뒤 **심링크 생존** · `git clean -nd` 는 **"Would remove"** · 대상 데이터는 `clean -fd` 후에도 남는다(링크만 삭제). 서비스 deploy.yml·deploy.sh 에는 `git clean`/`stash`/`reset` **0건** — 정리 단계는 없다. 위험은 **새 스크립트가 넣을 수 있는 것**: `git clean -fd`·"트리 깨끗해야 배포" 가드(심링크 때문에 항상 dirty)·`git add -A` |
| 3 | 롤백 R-2: 옛 pm2 항목 delete 뒤 옛 ecosystem 으로 `pm2 start` → 복귀. 옛 빌드 산출물 존재 전제 | **확인(논리) · 미확인(서버 실재)** | 현 deploy.sh 는 **제자리 빌드 · 정리 단계 없음**(fin `:106-131` · fit `:49-59`) → `.next`·`dist/{bot,mcp}/*.cjs`·`node_modules`·fit `src/generated/prisma` 는 다음 배포까지 남는다. 옛 디렉터리를 바꾸는 경로는 (a) 서비스 배포 경로 (T-5c ① 에서 차단) (b) F-1 ② 의 서비스 릴리즈(T-5c 이전 → 오히려 최신 빌드를 남긴다) 둘뿐. fin ecosystem `cwd: __dirname`(`:7,21,46`) · fit `'/home/nasty68/myFitness'`(`:7,23,66`) — 초안 서술과 일치. **서버에 실제로 있는지는 측정 불가** → U2 에 "옛 디렉터리 빌드 산출물 실재(`.next/BUILD_ID` · `dist/bot/standalone.cjs` · `dist/mcp/server.cjs` · fit `src/generated/prisma`)" 를 더해 **T-5b 에서 확인**하게 한다 |
| 4 | fin `mcp-config.json` bootstrap·stdio 로직을 옮기지 않아도 된다(Q83) — ⑰ *"stdio 시절 태그로의 롤백을 위한 것"* | **결론 확인 · 근거 정정**(정정 2) | advisor 경로: `MYFINANCE_ROOT ?? process.cwd()` → `MCP_CONFIG_PATH ?? <root>/src/lib/ai/mcp-config.json`(`claude-advisor.ts:753-755`) → `--mcp-config` · `--strict-mcp-config`(`:778-779`) · **매 호출 읽기**. 현재 파일 = `{"type":"http","url":"http://127.0.0.1:4210/mcp"}` · 마지막 변경 fin#412(포트 4210). 그러나 그 로직의 **1차 목적은 롤백이 아니라 "제자리 checkout 이 실행 중 web/bot 이 매번 읽는 이 파일을 바꾸는 순간"의 AI 연속성**이다(deploy.yml `:80-88` *"v0.12.0 MCP HTTP 승격 등"* · deploy.sh `:21-35`). stdio 롤백은 2차 목적(`:94-102`). 생략이 성립하는 진짜 조건은 둘: **(i) 첫 전환은 별도 체크아웃 + 옛 프로세스 정지 상태라 실행 중 독자가 없다 · (ii) 같은 체크아웃의 이후 pleiades 배포에서는 이 파일 내용이 태그 사이에 변하지 않는다.** (ii) 는 pleiades 가 그 파일을 고치는 순간 깨진다 → Q83 은 "생략 + 그 파일 내용 변경 시 재검토" 로 적는다 |
| 5a | 롤백 경로는 pleiades 빌드를 거치지 않는다 → 003 §8-1 *"prepare 실패 = 롤백 실패"* 는 R-2 에 해당 없음 | **확인 · 단 범위 누락 정정**(정정 3) | R-2 는 옛 디렉터리의 기존 산출물로 `pm2 start` 만 한다 — 확인. 그러나 **R 표에 "pleiades 릴리즈 → 직전 pleiades 태그" 롤백 행이 없다.** T-6 중 수정 릴리즈를 같은 체크아웃에 배포하거나 T-8 이후(옛 디렉터리 소멸)에는 **그것이 유일한 즉시 경로**이고, 직전 태그 checkout + 루트 `npm ci`(`prepare`) + 제자리 빌드를 거친다 → **003 §8-1 이월분이 정확히 여기 걸린다.** P4 는 *"이 문서가 그 비용을 받는다"* 고 했는데 받는 행이 없다 |
| 5b | 서비스 배포 경로를 끊지 않으면 옛 Release 하나로 옛 프로세스가 되살아난다(4-6) | **확인 · 피해 과소 서술 정정**(정정 4) | workflow 가 `cd $DEPLOY_PATH` → `checkout -f $TAG` → `deploy.sh`. deploy.sh 는 **`npx prisma migrate deploy`**(fin `:109` · fit `:52`)를 옛 디렉터리 `.env` 의 `DATABASE_URL` = **DB-a 에서 pleiades 와 같은 DB** 에 실행한다 → 서비스 태그에 새 마이그레이션이 있으면 **pleiades 가 쓰는 DB 의 스키마가 바뀐다(편도 원천)**. 이어 `pm2 startOrRestart …-mcp` → 4210 은 이미 새 pleiades MCP 가 잡고 있어 옛 MCP 는 EADDRINUSE 지만 **health curl 4210 은 새 프로세스가 응답해 통과**(fin `:228-236` · fit `:142-150`) → 웹 재기동(4100/4200 충돌 · autorestart 루프) · 봇 기동(409) · **`pm2 save --force` 가 옛 이름을 dump 에 박는다**(재부팅 resurrect 에 옛·새 둘 다). 그리고 `checkout -f` 가 **R-2 의 본체인 옛 디렉터리를 바꾼다.** 4-6 의 "왜" 칸(409 · 크론 · 포트)에 **DB 마이그레이션(편도) · dump 오염 · R-2 기반 파괴** 셋을 더한다 — 차단이 "권고"가 아니라 **T-5c 진입 조건**이어야 하는 이유다 |

## B. 나머지 주장

| 주장 | 판정 | 근거 · 실제 |
|---|---|---|
| T-5c ③ *"`migrate deploy` 는 차이 0 이므로 no-op 이어야 한다 — 0 이 아니면 중단"* (Q84 *"마이그레이션 차이 0 확인 뒤"* 도 같은 구조) | **정정**(정정 5) | `migrate deploy` 는 대기 중 마이그레이션을 **실행하면서** 알린다 — "0 이 아니면 중단" 은 이미 적용된 뒤다. 중단 판정은 **실행 전 읽기 전용 검사**여야 한다: `npx prisma migrate status`(대기 마이그레이션 · DB 에만 있는 마이그레이션 둘 다 보고 · 비0 종료) 또는 `_prisma_migrations` 이름 집합 ↔ `apps/<app>/prisma/migrations` 디렉터리 비교. **첫 전환 실행에서는 `migrate deploy` 자체를 빼고 사전 검사만** 두는 편이 R-2 를 지키는 형태다 |
| §6 표 T-0~T-4 칸 전부 "유지" · *"T-5c 전에 풀리는 칸은 없다"*(:248) · *"T-1~T-4 는 몇 번이든 되풀이해도 서비스 영향이 없다"*(:215) | **정정**(정정 6) | T-4 가 **서버 `.env`(옛 디렉터리 값 기반)** 를 새 체크아웃에 만든다 — 서비스 봇 토큰(I-4) · 실사용 채팅(I-5) · 서비스 DB 접속 정보(I-7) · Whooing 등 실값(I-8)이 **T-4 에서 pleiades 작업트리 안에** 놓인다. `isolation.md` I-4 *"어떤 `.env`·secret·명령줄에도 두지 않는다"* · I-7 *"pleiades 어디에도 두지 않는다"* 와 표가 모순이다. 또 Q84 권고(서비스 DB 로 fin build — prerender 가 Prisma 를 부른다 · 006 ㉑)를 택하면 T-4 는 **서비스 DB 에 접속**한다(읽기 부하·연결 수). 고칠 방향 둘 중 하나: **(a)** T-4 의 `.env` 는 서비스 값 없이(빈 스키마 리허설 DB 또는 build 생략) 만들고 실값 주입을 T-5c ② 직후로 옮긴다 → 표·:215·:248 이 참이 된다 · **(b)** T-4 를 "그 앱 서버 범위에서 I-4·I-5·I-7·I-8 부분 해제(사용자 행위)" 로 표에 적고 :215·:248 을 고친다. 덧붙여 T-4 체크아웃에 실 토큰이 있으면 **실수로 기동 = 409** 이므로 (a) 가 안전하다 |
| T-8 *"상태 P-4 이전 → 옛 디렉터리 삭제"* (편도) | **정정**(정정 7) | 옛 디렉터리에는 상태 말고 **실행 진입점**도 있다. fin `scripts/backup-db.sh` 는 `PROJECT_DIR=$(dirname $SCRIPT_DIR)` · `BACKUP_DIR` 기본 `$PROJECT_DIR/backups`(`:18-20`) · 주석의 cron 예시가 옛 경로를 가리킨다(`:5`). cron 이 등록돼 있으면(U6) **T-8 삭제 순간 DB 백업이 조용히 멈춘다** — 그리고 R-3·R-7 이 기대는 것이 그 백업이다. T-8 에 **"crontab 의 옛 경로 항목 재지정(U6·U12)"** 을 선행 조건으로 넣고, 백업 진입점을 새 체크아웃(또는 P-4 위치)으로 옮긴다 |
| ⑪ *"크론 위치: fin = 봇 · fit = 웹"* (→ 4-4 · T-9 *"크론이 웹에 있다"*) | **정정**(정정 8) | fin: 확인 — `instrumentation.ts` 는 빈 `register()`(주석 *"cron + 알림 스케줄러는 standalone 봇"*) · `standalone.ts:12-13` 이 `lib/cron`·`notifications/scheduler` import. **fit: 웹과 봇 둘 다** — 웹 `instrumentation.ts` → `startCronJobs`(`lib/cron.ts:25`) + 사진 sweeper + report-job orphan sweeper · **봇 `standalone.ts:3` → `startBotScheduler` → `cron.schedule` 5곳**(`bot/notifications/scheduler.ts:66,78,89,101,108` · 자동조정 `:101` 포함). [S] §2 도 fit 봇에 "알림 스케줄"을 적었다. 정지 순서(봇·웹·MCP 전부 정지 후 기동)는 그대로 유효하나 M1 크론 목록·Q78 관찰 조건·T-9 서술은 fit 봇 크론을 포함해야 한다 |
| 4-4 *"전환 창은 크론 시각을 피한다"* | **확인(보강)** | fin 에 `*/10 * * * *`(`lib/cron.ts:77`) · `0 * * * *`(`scheduler.ts:78`) 가 있어 10분 넘는 창은 반드시 걸린다 — "회피"는 일·주·월 단위 작업에만 성립. 주기 작업 1회 누락은 무해 여부를 M1 에서 크론별로 적는다. fin `35 15 * * *`(`scheduler.ts:141`) 실재 확인 |
| 정지·기동 순서 = 현 deploy.sh 기동 순서(MCP → 웹 → 봇) | **확인** | fin deploy.sh `:226 → :325 → :329` · fit `:140 → :169 → :176-177` |
| D-a: I-9 secrets 0 유지 · T-3 태그는 아무것도 트리거하지 않는다 | **확인** | 루트 workflow 3개 트리거 = push/PR(dev·main) · schedule · dispatch — tag/release 트리거 0. `apps/*/.github/workflows/deploy.yml` 은 루트가 아니라 비활성 |
| P-2 *"무손실 — 두 쪽이 같은 파일을 본다"* · fin PDF 파일명만 | **확인** | `pdf-generator.ts:16` `REPORTS_DIR = path.join(process.cwd(),'reports')` · `:46` DB 에 `fileName` 만 · 다운로드 `route.ts:31` basename. 심링크 경유 쓰기·읽기 무관 |
| S-a + `PLEIADES_ENV_FILE` 로 한 파일 공유 | **확인** | `platform-env.ts:76-79` env 값 우선(상대경로면 cwd 기준) · 없으면 cwd 에서 위로 `name==="pleiades"` 탐색. 두 체크아웃이면 설정하지 않을 때 **각자 자기 루트 `.env`** 를 읽는다 — 공유하려면 반드시 설정(절대경로 권장) |
| fin advisor 는 cwd = `apps/finance` 면 새 체크아웃 안에서 config 를 찾는다 | **확인** | A-4 와 같은 근거. `MCP_CONFIG_PATH`·`MYFINANCE_ROOT` override 도 있어 "4210 하드코딩이라 포트 유지가 강제" 는 아니고 **선택**이다(문안 수준 · 정정 미산입) |
| 혼합 상태(fin=pleiades · fit=서비스)는 안정 | **확인** | fit 서비스 디렉터리는 루트 `.env` 를 찾지 못한다([S] §3) · S-a 의 fin 체크아웃 안 `apps/fitness` 는 실행 정의 없음 |
| 4-6 archive = 즉시 · PUBLIC 유지 이유 | **확인** | 수용 출처 https 무인증(이 감사의 스크래치 clone 도 무인증) |
| 숫자 — fit 절대경로 "4곳" | **확인** | measured-facts 새 절 *"서버 절대경로 하드코딩 4곳"* = ecosystem 3 + deploy.sh 1 — 대장에 있다 |
| ⑥ *"차이 커밋 수 미측정(U14)"* · M2 | **갱신 필요(정정 아님)** | A-1b 값으로 대체. 단 fit 서비스 dev 는 오늘도 움직였으므로 **T-5a 직전 재측정**이 정본 |

## C. 미확인

| # | 항목 | 왜 판단 불가 | 무엇이 있으면 |
|---|---|---|---|
| U-a | 옛 디렉터리 빌드 산출물의 서버 실재(R-2 의 전제) | 서버(I-3) | T-5b 에 사용자가 `ls` — U2 에 항목 추가 |
| U-b | 배포본 = 서비스 `main` HEAD(A-1b 결론의 전제) | 서버 HEAD(U2) | T-2 사용자 확인. 아니면 M2 를 서버 HEAD 기준으로 다시 잰다 |
| U-c | **새 루트 ecosystem·health·포트 경로는 T-5c 이전에 한 번도 돌지 않는다** | M3 리허설은 pm2 제외 · T-4 도 pm2 제외 · 로컬은 I-12 로 4100·4200·4210·4301 금지 · fin advisor config 는 4210 고정 | 로컬 리허설에 포트·이름 override 판(ecosystem 이 env 로 포트를 받게)을 두거나, 최소한 pm2 의 상대 `cwd` 해석을 로컬에서 확인(fin 옛 판처럼 `__dirname` 기준 `path.join` 을 쓰면 해석 문제가 사라진다). 초안은 이 공백을 적지 않았다 — §5 T-5c 의 위험 칸에 적는다 |
| U-d | "플랫폼 키 비움 = 서비스와 같은 텔레그램 동작" | M-5 의 동작 동등성은 로컬 검증 봇으로만 확인됐다(006 §4-7). 실사용 수신자·실데이터에서 처음 돈다 | T-5c ⑤ 의 실응답 확인을 알림 경로별(ALLOWED · ADMIN · 키보드 3곳 · 분기 PDF)로 목록화 |

---

## 정정 상세 (고쳐야 할 문장)

1. **§4-2 :128** *"`.gitignore` 가 그 경로들을 무시하므로 심링크가 `git checkout -f` 에 지워지지 않는지는 …"* → *"`.gitignore` 의 해당 패턴은 전부 끝 `/` 라 심링크를 무시하지 **않는다**(untracked `??`). `checkout -f` 에는 살아남고(감사 실측) `git clean -fd` 에는 링크가 지워진다(대상 데이터는 남는다). 새 배포 스크립트는 `git clean -d`·트리-깨끗함 가드를 쓰지 않는다. 또는 **pleiades 루트 `.gitignore`(apps/* 무수정)에 끝 `/` 없는 경로**(`apps/finance/reports` 등)를 더해 심링크를 무시 대상으로 만든다."* P-2 행 되돌리기 "즉시" 는 유지.
2. **§3 ⑰ · §4-1 표 bootstrap 행 · Q83** — ⑰ 을 *"bootstrap·backup/restore 의 1차 목적은 제자리 checkout 중 AI 연속성(deploy.yml :80-88 · deploy.sh :21-35), 2차가 stdio 롤백"* 으로 고치고, 생략 근거를 *"첫 전환은 별도 체크아웃·프로세스 정지 상태 · 이후 배포는 `mcp-config.json` 내용이 태그 간 불변(fin#412 이후)"* 로 바꾼다. Q83 에 *"그 파일 내용을 바꾸는 PR 이 생기면 재검토"* 를 붙인다.
3. **§7** 에 행 추가 — *"R-8 · T-5c 이후 같은 체크아웃의 pleiades 릴리즈 결함 · 직전 pleiades 태그 checkout → 루트 `npm ci`(prepare) → 앱 빌드 → 재기동 · **중간** · 003 §8-1 이월분(prepare 실패 = 롤백 실패)이 여기 적용된다 · T-8 이후 유일한 즉시 경로"*. :264 문장은 *"R-2 에는"* 으로 범위를 한정한다.
4. **§4-6 전환 직전 행 "왜"** 에 *"옛 deploy.sh 의 `prisma migrate deploy` 가 DB-a 의 공유 DB 에 서비스 태그의 마이그레이션을 적용(편도) · health 4210 은 새 MCP 가 응답해 통과 → 웹·봇 기동 · `pm2 save --force` 로 dump 오염 · `checkout -f` 가 R-2 의 옛 디렉터리를 바꾼다"* 를 더하고, 차단을 **T-5c 진입 조건(사용자 확인)** 으로 올린다.
5. **§5 T-5c ③** *"`migrate deploy` 는 … 0 이 아니면 중단"* → *"`migrate deploy` 전에 `npx prisma migrate status` 로 사전 검사 — 대기·DB 전용 마이그레이션이 하나라도 있으면 실행하지 않고 중단. 첫 전환 실행은 `migrate deploy` 를 빼고 검사만"*. Q84 의 *"차이 0 확인"* 도 같은 검사로 정의한다.
6. **§6 표 T-0~T-4 열 · :215 · :248** — 방향 (a)(T-4 `.env` 에 서비스 실값을 넣지 않고 T-5c ② 직후 주입) 를 권고. (b) 를 택하면 표에 T-4 부분 해제를 적고 :215·:248 을 고친다. Q84 권고(서비스 DB 로 build)는 (a) 와 양립하지 않으므로 함께 재결정.
7. **§5 T-8** 진입 조건에 *"crontab 의 옛 경로 항목(백업 등 · U6·U12) 재지정 완료"* 추가 · 되돌리기 칸은 편도 그대로.
8. **§3 ⑪ · §4-4 웹 서술 · T-9** — *"fit = 웹(싱크·리포트 크론 + sweeper 2) + 봇(알림 스케줄 `cron.schedule` 5 · 자동조정 포함)"* 으로 고치고 M1 범위에 fit 봇을 넣는다.

## 근거 명령 (요약)

```bash
# A1 — prisma 트리 동일성 (bash)
a=$(git rev-parse HEAD:apps/<app>/prisma); b=$(GIT_DIR=<scratch>/<Repo>.git git rev-parse <service_dev>:prisma)   # SAME ×2
GIT_DIR=<scratch>/<Repo>.git git rev-parse main:prisma/migrations   # == HEAD:apps/<app>/prisma/migrations  SAME ×2
# M2
git rev-list --count main..dev ; git rev-list --no-merges --count main..dev ; git diff --stat main dev
git diff --name-status main dev -- prisma/migrations   # fin: 없음 · fit: A 20261016011539_health_checkup
git diff --name-status main dev                        # fin: M .claude/rules/workflow.md 뿐
# P-2 심링크 (스크래치 빈 저장소)
printf "/reports/\n/logs/\n.garmin-tokens/\n" > apps/fin/.gitignore ; ln -s <old>/reports apps/fin/reports
git status --porcelain --ignored   # ?? apps/fin/reports
git checkout -qf t1 ; ls -la apps/fin   # 심링크 생존
git clean -nd                           # Would remove apps/fin/reports
git clean -fdq ; ls <old>/reports       # a.pdf 남음
# 서비스 deploy 정리 단계
grep -rn --binary-files=text "git clean\|git stash\|git reset" apps/*/deploy apps/*/.github/workflows   # 0
# 크론 위치
cat apps/{finance,fitness}/src/instrumentation.ts
git grep --text -n "cron.schedule" HEAD -- apps/fitness/src/bot   # scheduler.ts 5곳
# advisor config
grep -n "MCP_CONFIG_PATH\|MYFINANCE_ROOT\|mcp-config" apps/finance/src/lib/ai/claude-advisor.ts   # :753-755,778-779
```

**합계: 정정 8 · 미확인 4 · 신규 측정 1(M2).** 정정 1·5·6 은 단계 표(§5)·§6 표를 바꾸고, 2·3·4·7·8 은 행·문장 추가다. **로드맵 순서를 바꾸는 정정은 없다**(F-1 → S-a → T-5c 의 순서는 유지). 초안 재작성 필요: **예 — 부분 개정(2회차) 후 재감사.**
