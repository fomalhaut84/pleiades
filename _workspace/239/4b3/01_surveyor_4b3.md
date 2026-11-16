# 012 4b-3 (통합 층 서버 배치 · G7) 실측

- 2026-11-13 · `repo-surveyor` · pleiades `dev` HEAD `48ccb68b03e6` · 작업트리 깨끗
- 대상: pleiades 추적 파일 정적 읽기 + 로컬 `claude --help`/`--version`(모델 호출 0) + `python3 -m unittest discover -s deploy`(로컬 · 스텁 서버). 서버 접근 0 · `repos/*`·원본 git 명령 0 · 봇·웹·MCP 기동 0.
- 줄 번호는 이 HEAD 기준. "미측정" 은 이유를 적었다.

---

## A. 배포 경로 현황

### A-1. `deploy/release-inplace.sh` (360 줄)

| 항목 | 실측 | 근거 |
|---|---|---|
| 락 파일 | `$PRIVATE/deploy.lock` · `PRIVATE=${PLEIADES_PRIVATE_DIR:-$HOME/pleiades-private}` · `--dry-run` 은 락을 잡지 않는다 | `:173` · `:181` |
| `take_lock` | flock 있으면 `exec 9>>"$file"` → `flock -n 9` (rc 그대로 반환). 테스트(`PLEIADES_TEST=1` + `PLEIADES_LOCK=mkdir`) 또는 flock 없음이면 `mkdir "$file.d"` + pid 파일 · 넘겨받지 않는다 | `:34-44` |
| `nolock` | **`nolock() { "$@" 9>&-; }`** — 함수 인자로 받은 명령을 fd 9 를 닫고 실행 | `:45` |
| fd 닫기 사용처 | `nolock pm2 jlist`(env_same `:86` · app_procs `:97`) · 프로브 서브셸 `) >> "$probe" 2>&1 9>&- &`(`:303`) · `deploy.sh --dry-run` `>>"$LOG" 2>&1 9>&-`(`:308`) · `deploy.sh` 기본 실행 `>"$run_log" 2>&1 9>&-`(`:314`). **git·curl(`:345`)·cp 는 닫지 않는다**(데몬화하지 않는 명령) | 해당 줄 |
| 해제 | flock = 프로세스 종료 시 커널 · mkdir = `release_lock`(EXIT trap `cleanup`) | `:46-47` · `:179` |
| `env_same` | `pm2 jlist` → `[{` 위치부터 JSON 파싱(앞 WARN 줄 대비 `:82`) → **이름이 `pleiades-` 로 시작하는 모든 프로세스**마다 `pm2_env.PLEIADES_ENV_FILE ?? pm2_env.env.PLEIADES_ENV_FILE` 을 이 셸 값과 비교 → `<이름> same|DIFF|MISSING` 줄 · 파싱 실패 `PARSE_FAIL` | `:85-94` |
| C1 판정 | `n_same = ' same$' 줄 수` · `n_bad = same 도 빈 줄도 아닌 줄 수`(PARSE_FAIL 포함) → **`n_bad == 0 && n_same > 0` 아니면 rc 1** | `:244-248` |
| `app_procs` | `pleiades-<APP>-` 접두만 · 출력 `<전체> <online> <cwd 가 ROOT/ 안>` | `:96-105` |
| C1 프로세스 | `전체 ≥ 1 && 안 == 전체` 아니면 rc 1 · 전체 ≠ 3 이면 (주의) 줄만 | `:252-254` |
| C5 | `online == 3 && mcp /health == 200 && n_bad == 0` 아니면 **rc 4** | `:346-351` |
| 단계별로 보는 것 | **A** HEAD 태그 · 깨끗 · last-ok/pending · 태그 fetch(`--no-tags`) · diff(마이그레이션 · fin `mcp-config.json` · `deploy/`+`.env.example` · lock · 규모) — 마이그레이션·mcp-config ≠ 0 이면 rc 1(`:186-224`) · **B** `~/.pm2/dump.pm2` 사본(`:227-233`) · **C1** `PLEIADES_KEYS` 셸 키 unset → `export PLEIADES_ENV_FILE="$HOME/pleiades-platform.env"` → 남은 키 수 · platform 권한 600 · env_same · app_procs · 포트(`:236-261`) · **C2** checkout V · 깨끗 · 새 포트(`:283-295`) · **C3** 웹 `/` 2초 프로브 백그라운드(`:298-304`) · **C4** `deploy.sh --dry-run` 뒤 기본 실행 · `=== 완료: $APP · $V ===` 줄 확인(`:307-325`) · **C5** 프로브 비2xx/3xx 수·코드별 · 창 안 web/bot/mcp `-error` 줄(경고 수) · mcp `-out` pino 오류 · mcp health · online · env_same(`:328-351`) | 해당 줄 |
| `PLEIADES_ENV_FILE` 기대 문자열 | **`$HOME/pleiades-platform.env`** (리터럴 · 확장 후 절대경로) | `:238` |
| `PLEIADES_KEYS`(C1 unset 목록) | `DATABASE_URL\|PORT\|MCP_PORT\|MCP_TRANSPORT\|TELEGRAM_*\|DISCORD_*\|NOTIFY_*\|GARMIN_*\|OMRON_*\|MFDS_*\|WHOOING_*\|CLAUDE_BIN\|NODE_ENV\|PLEIADES_ENV_FILE\|AUTH_*\|NEXTAUTH_*\|BASE_URL\|FIRECRAWL_*\|MYFINANCE_ROOT\|MCP_CONFIG_PATH` — **`PLEIADES_PRIVATE_DIR` 은 목록 밖**(셸 값을 그대로 쓴다) | `:21` |
| 판정 양식 | `form` 으로 쌓고 끝에 `=== 판정 양식 (이 블록만 세션에 붙인다) ===` → 줄들 → `결과: <통과\|중단 — 이유\|dry-run — 바꾸지 않았다\|통과 — 이미 배포됨>` → `원본: ~/… (세션에 붙이지 않는다)` → `=== 끝 ===` | `:60-70` · `:75` |
| 줄 머리 | `APP fin   V vX` · `   P … → V …` · `A  마이그레이션 …` · `B  …` · `C1 셸 키 …` · `C2 …` · `C4 plan rc …` · `C5 프로브 …` · 이어지는 줄은 공백 3칸(`   online …`) — 단계 머리는 `A ` · `B ` · `C1`~`C5` (앞에 `Z` 같은 접두 없음) | `:165,207,222,232,246,288,319,343,348` |
| 상태 파일 | `$PRIVATE/inplace-<app>-last-ok`(통과 태그) · `-pending`(C2 전 쓰고 C5 통과 때 삭제) · `-window`(C5 창 `t0\tt1` · 통과 때만) · 로그 `inplace-<app>-<시각>.log` · `.run` · `-probe-<시각>.log` · 모두 umask 077 | `:182,190,194,281,298,354-356` |
| 종료 코드 | 0 통과 · 1 바꾸기 전 중단 · 2 사용법 · 3 deploy.sh exit 3 · 4 바꾼 뒤 실패 | `:14-15` |
| 앱 인자 | `fin\|fit` 외는 `usage`(rc 2) | `:152` |
| 체크아웃 확인 | 루트 `package.json` name == `pleiades` | `:172` |

**4b-3 에 걸리는 사실 2개(새로):**
- **`PLEIADES_PRIVATE_DIR` 은 셸 그대로**(`:173` · `:21` 목록 밖). 통합 층 봇의 락 시험 파일(`deploy-lock.ts:11` `lockFileOf(privateRoot)`)과 하루 사용액 파일은 **그 프로세스 env 의** `PLEIADES_PRIVATE_DIR` 로 정해진다(`private-dir.ts:10-12`). 통합 층을 다른 `PLEIADES_PRIVATE_DIR` 로 띄우면 **다른 락 파일을 시험**한다(락 시험이 무력). env 일치 대조(G-R1)는 `PLEIADES_ENV_FILE` 하나만 본다.
- `release-inplace.sh` 의 A 줄 `deploy/·.env.example 변경 $srv`(`:219`)는 `deploy/` 전체 diff 다 — 통합 층 배포 스크립트를 `deploy/` 아래에 두면 그 파일이 바뀐 릴리즈마다 fin·fit 양식의 이 숫자가 늘어난다(정보 줄 · 중단 조건 아님 `:223-224`).

### A-2. `deploy/deploy.sh` (368 줄)

| 항목 | 실측 | 근거 |
|---|---|---|
| 앱 인자 | `fin` · `fit` 만 · 그 밖 `usage`(rc 2) · 모르는 플래그 `die`(rc 1) | `:33-37` · `:45` |
| 1단계 순서 | `npm ci`(루트) → `npm --prefix packages/chat ci` → `npx --no-install tsc -p packages/chat` → 앱 `npm ci` | `:296-302` |
| pm2 기동 | 모두 `cd apps/<dir>` 에서 `$CONFIG`(루트 `deploy/pleiades.config.cjs`) + `--only <이름>` + **`--update-env`**: mcp `startOrRestart`(`:342`) · web `startOrRestart`(포트 바뀌면 delete 먼저 `:349-356`) · bot `delete` 뒤 `start`(`:359-361`) · `pm2 save --force` 2회(`:345` · `:365`) | 해당 줄 |
| env export | **deploy.sh 는 `PLEIADES_ENV_FILE` 을 export 하지 않는다** — 부른 셸 값을 물려준다(절대경로 아니면 die `:76`) · `release-inplace.sh` 가 C1 에서 export 한 뒤 부른다 | `:76-78` · RI `:238` |
| 락 | 0(grep `lock` = `READY` 표지 외 0) · fd 9 를 닫지 않는다 — 닫는 것은 부르는 쪽(`release-inplace.sh:308,314`) | `grep -n -i lock deploy/deploy.sh` |
| 비밀 파일 권한 | 앱 `.env` 와 `PLEIADES_ENV_FILE`(없으면 루트 `.env`) — group/other 비트 0 · 소유자 = 부르는 uid | `:65-78` |
| 로컬 | Darwin 은 `--dry-run` 만 | `:59` |

### A-3. `deploy/pleiades.config.cjs` (133 줄)

| 항목 | 실측 | 근거 |
|---|---|---|
| 앱 선택 | `cwdApp()` — cwd 가 `apps/finance`·`apps/fitness` 가 아니면 **throw**(`DIRS = { fin, fit }`) · cwd 앱 하나만 정의 | `:13` · `:20-25` · `:130-133` |
| 포트 | `PORT`·`MCP_PORT` 셸 > `apps/<dir>/.env` · 없거나 잘못이면 throw | `:42-57` |
| 공통 | `instances 1 · autorestart · log_date_format 'YYYY-MM-DD HH:mm:ss'` | `:62` |
| WEB | `max_memory_restart 1024M` · `node_args --max-old-space-size=1024 --network-family-autoselection-attempt-timeout=2000` | `:61,63` |
| LONG_RUNNING(bot·mcp) | **`kill_timeout: 15000`** · `min_uptime 30000` · `exp_backoff_restart_delay 100` · `max_memory_restart 512M` · `node_args --max-old-space-size=512 <NET_ARGS>` | `:64-71` |
| 로그 경로 | 필드 없음 → pm2 기본(`~/.pm2/logs/<이름>-{out,error}.log`) — `release-inplace.sh:339,342` · `collect.cjs:81` 이 그 이름을 전제 | 해당 줄 |
| 이름 | `pleiades-<fin\|fit>-<web\|bot\|mcp>` | `:3` · `:75-106` |
| env | `PLEIADES_ENV_FILE` 키 0 (셸에서 물려받음) · fit 은 `TZ: 'Asia/Seoul'` · 로컬 `PM2_HOME=<root>/.pm2-local` 일 때만 PATH 앞에 `bin/`(claude shim) | `:73-128` |

**통합 층 정의를 이 파일에 넣으면(G7 은 넣지 않는다 · 참고).** 012 의 "시험 6" 은 `_workspace/239/stage3/01_surveyor_runtime.md:118` 의 열거 — `test_deploy.py` · `test_release_inplace.py` · `test_ops_collect.py` · `test_discord_inbound.py` · `test_advisor_x1.py` · `test_ssh_deploy.py`(G1 계열 전체 대상). 이 파일만 놓고 보면:
- `cwdApp()` 가 `apps/advisor` 를 throw → `DIRS` 에 adv 를 넣어야 하고, `ports()` 가 PORT·MCP_PORT 를 강제하므로 adv(포트 없음)는 분기 필요(`:46-57` · `:133`).
- `test_deploy.py` 의 `Config` 계열은 시험 쪽 `DIRS = {"fin","fit"}`(`:21`) 로 돌므로 **adv 를 더해도 기존 시험은 깨지지 않는다** — 대신 adv 를 검증하는 시험이 0 이다. `PRECHECK_NAME = pleiades-(fin|fit)-[a-z]+`(`:20`)·`test_names_match_precheck_allowlist`(`:141-144`)는 adv 이름을 거부할 꼴이다(adv 를 DIRS 에 넣으면 실패).
- `tools/local/precheck.py:31` 가 이 파일을 I-3 로컬 pm2 예외의 유일한 설정으로 고정 — adv 정의를 넣으면 로컬 pm2 리허설 범위 문제가 생긴다(012 §0-5 S3 precheck 행 · I-3 문언).
- `release-inplace.sh:257-260,291-294` 는 `apps/<DIR>` cwd 에서 이 파일을 require 해 web·mcp 포트를 읽는다 — adv 분기가 fin·fit 경로의 로드를 깨면 **C1 rc 1**.
- `test_notify_deploy.py:190` 은 이 파일 본문에 `NET_ARGS` 문자열이 있는지만 본다.

### A-4. 앱 목록 하드코딩 (4b-5 참고)

| 파일 | 위치 | 내용 |
|---|---|---|
| `deploy/ssh-deploy.sh` | `:38` `for app in fin fit` · `:41` `$base/pleiades-$app/deploy/release-inplace.sh` · `:46` fin 실패 시 fit 건너뜀 · `:67` 알림 문구 | 자기 교체 대비 함수 본문 + 마지막 줄 main(`:10` · `:74`) · forced command 경로는 `~/pleiades-fin/deploy/ssh-deploy.sh`(`:5`) |
| `deploy/notify-deploy.cjs` | `:18` `APPS = { fin: 'finance', fit: 'fitness' }` · `:82-83` 모르는 앱 = `fail`(**exit 0** · `:24-27`) · dotenv 를 `apps/<dir>` 의 node_modules 에서 찾는다(`:29-31` · `:86`) | `apps/advisor` 는 `dotenv` 의존이 없다(`apps/advisor/package.json` dependencies = chat·notify 둘) — 4b-5 에서 알림을 넣으면 해석 경로가 문제(미측정: advisor 의 전이 의존에 dotenv 가 있는지) |
| `deploy/release-inplace.sh` | `:152` case fin/fit | — |
| `deploy/deploy.sh` | `:33-37` | — |

### A-5. 체크아웃 밖 설치 선례 — X1

- 경로: 파일 `deploy/advisor-x1/{x1.cjs 788, judge.cjs 103, run-x1.sh 33}` 줄(`wc -l`) · 런북 `docs/runbooks/advisor-x1.md`(223 줄).
- 설치: `~/pleiades-advisor-x1/` (700) · 파일마다 `curl -fsSL https://raw.githubusercontent.com/fomalhaut84/pleiades/<REF>/deploy/advisor-x1/$n -o …new` → `sha256sum -c` → `mv` · 실패면 `[중단]` 줄(런북 `:34-41`). REF·SHA 는 머지 뒤 Claude 가 준다(`:34`). npm 의존 0(`:9`).
- 실행: `bash ~/pleiades-advisor-x1/run-x1.sh [--preflight …]`(런북 `:75` · `:109`).
- `run-x1.sh` 락: `LOCK=$PRIVATE/deploy.lock`(`:13`) · `$PRIVATE` 없으면 시작 안 함(`:15`) · `exec 9>>"$LOCK"; flock -n 9`(`:25-26`) · 자식 `"$NODE" "$HERE/x1.cjs" "$@" 9>&-`(`:33`) · 출력 `결과: 시작 안 함 — 질문 0`(`:10`) · Darwin 거부(`:9`).
- 시험 고정: `test_advisor_x1.py:394-402` `test_wrapper_contract` — `LOCK=$PRIVATE/deploy.lock` · `flock -n 9` · `"$HERE/x1.cjs" "$@" 9>&-` 문자열 존재 + `x1.cjs` 에 `'pm2'`·`'git'`·`shell: true`·`deploy.lock` 부재.
- **요청의 `_workspace/239/stage3/run-x1.sh` 는 없다**(`ls` · `git ls-files` 0). 선례는 위 `deploy/advisor-x1/run-x1.sh` 다.
- 체크아웃 안에서 도는 통합 층(G7)과 달리 X1 은 체크아웃 밖 고정 설치 · 두 체크아웃 경로를 하드코딩(`x1.cjs:50,60,68`).

### A-6. 수집기 `deploy/ops/collect.cjs` (864 줄)

| 항목 | 실측 | 근거 |
|---|---|---|
| 앱 | `APPS = { fin: ~/pleiades-fin/apps/finance, fit: ~/pleiades-fit/apps/fitness }` | `:57-60` |
| 역할 | `ROLES = ['web','bot','mcp']` · 기대 프로세스 = APPS × ROLES 6개(`judgePm2` `:149`) — 없으면 `missing` 장애 | `:61` · `:148-171` |
| 로그 파일 이름 | `LOG_NAME = /^pleiades-(fin\|fit)-(web\|bot\|mcp)-(out\|error)(?:-\d+)?\.log$/` — 모르는 이름은 버린다 | `:81` · `:409` |
| 생존 표지 | `APPS[app]/logs/alive-<app>.json` **수정 시각만** · `aliveStaleMin: 10`(분) · 넘으면 `<app> · bot · gateway [stale]` 장애 · **파일 없음(ENOENT) = 정상** · 다른 읽기 실패 = collector 관측 · 배포 보류(`held`) 중 판정 안 함 | `:46-48` · `:466-485` |
| 배포 보류 | `$PRIVATE/inplace-<app>-pending` 존재 + `holdMin 20` 분 안 | `:207-221` |
| 그 밖 앱별 | health(`.env` 의 PORT·MCP_PORT · `dotenvFor` 가 fin→fit node_modules 에서 dotenv · `:224-244,278-300`) · 침묵 `silenceHours` 키 5(`:45` · `:456-463`) · glob-empty 키(`:446-450`) · `artifactOf` 경로 `apps/(finance\|fitness)`(`:308`) | 해당 줄 |
| 락 | 배포 락을 열지도 잠그지도 않는다 | `:12` |
| 설치 | `~/pleiades-ops/collect.cjs` · curl + sha256 · REF·SHA 는 Claude 가 준다 · crontab `2-59/5 * * * * $NODE_BIN --network-family-autoselection-attempt-timeout=2000 ~/pleiades-ops/collect.cjs --dry-run --pm2-bin=…` | `docs/runbooks/ops-collector.md:11,22-28,62-68` |

**통합 층(`pleiades-adv-bot` · `alive-adv`)을 넣으려면 바꿀 곳(열거 · 7):**
1. `APPS`(`:57-60`) — adv 경로(셋째 체크아웃 이름 미정 · 아래 C).
2. 역할 집합(`:61` · `:149`) — 앱별(adv = `bot` 만). 지금 그대로 adv 를 APPS 에 넣으면 `pleiades-adv-web`·`-mcp` 가 `missing` 장애.
3. `LOG_NAME`(`:81`) — `adv` 를 넣지 않으면 adv 로그 줄은 감시 밖(오류 줄 0 으로 보임).
4. `collectHealth`(`:278-300`) — adv 는 `.env` 포트가 없어 `env-read:adv` collector 관측이 매 회 난다 → adv 건너뛰기 분기.
5. glob-empty 키(`:446-450`) — `${app}-web-error`·`mcp-out`·`mcp-error` 를 adv 에 요구하면 매 회 관측.
6. `deployWindow`(`:207-221`) — adv 배포 표지 파일 이름(`inplace-adv-pending` 등)을 통합 층 배포 스크립트가 같은 규칙으로 쓸지에 따라.
7. `collectAlive`(`:466-485`) — `APPS[app]/logs/alive-<app>.json` 이라 경로·파일명(`alive-adv.json` · `bot.ts:28`)은 그대로 맞는다. 단 **키 미설정으로 기다리는 동안엔 표지 파일이 없어 정상**으로 본다(ENOENT `:476-478`).
(+ `silenceHours` `:45` 는 넣을지 판단 · `artifactOf` `:308` 는 adv 경로를 못 읽을 뿐 무해)

### A-7. 시험 형식 · 8절 `deploy/` 행

- **금지 명령 정적 검사 선례:** `test_discord_inbound.py:373-379` `test_no_forbidden_commands` — 주석 줄을 뺀 본문에 정규식 목록(`\bssh\b` · `pm2 (delete|stop|kill|resurrect|save|start)\b` · `--update-env` · `\bgit\b` · `\bcurl\b` · `set -x` 등) `re.search` None + 허용 문자열 `pm2 restart "$BOT"` 존재. `test_deploy.py:715-728` `ScriptText` — 같은 방식(`git clean` · `--tags` · `migrate deploy` · `ecosystem.config` · `apps/*/deploy/`).
- **락 fd 정적 검사 선례:** `test_advisor_x1.py:394-402`(문자열 존재). **`release-inplace.sh` 의 "모든 pm2 호출에 nolock/9>&-" 를 보는 시험은 없다**(grep `nolock\|9>&-` in `test_release_inplace.py` = 0). 락 동작 시험은 있다 — 가짜 `flock`(python fcntl)로 동시 배포 거부(`:518-541`) · mkdir 폴백(`:543-556`) · dry-run 락 없음(`:602-`).
- **`--dry-run` 시험 형식:** `test_deploy.py:176-` `DeployDryRun` — `FakeRoot`(deploy/ 사본 + 루트 `package.json` + 앱 `.env` + git init·tag · `:30-55`)에서 `bash deploy/deploy.sh fin --dry-run` 을 PATH 고정 env 로 돌려 rc 와 stdout 단계 문자열을 본다(`:189-200`). `test_release_inplace.py` 는 PATH 스텁(pm2·curl·uname)과 `PLEIADES_DEPLOY_SH` 로 서버 경로를 흉내(`:4` · `:28-32`).
- **8절 `python3 -m unittest discover -s deploy` (로컬 macOS · node v20.18.0):** 결과는 아래 *A-7 실행 결과* 블록.

## B. `apps/advisor` 현황

### B-8. 진입 · 빌드 · env · 경로

| 항목 | 실측 | 근거 |
|---|---|---|
| 진입점 | `src/main.ts` · 명령 `bot` · `probe` · `ask <채널> <사용자>`(질문 stdin) · 0 정상 · 1 거부·실패 · 2 사용법 | `main.ts:18,46-91` |
| 빌드 | `esbuild src/main.ts --bundle --platform=node --target=node20 --outfile=dist/advisor.cjs` (`npm run build`) · 산출물 `dist/advisor.cjs` 있음(로컬) | `package.json` scripts · `ls dist` |
| 실행 | `node dist/advisor.cjs bot` (pm2 이름 `pleiades-adv-bot` 은 4b-3 몫 · `main.ts:3`) | `main.ts:3,57` |
| cwd 전제 | **`appsDir = path.resolve(process.cwd(), "..")`** → cwd 는 `apps/advisor` 여야 한다(`domain.json`·`models.ts` 를 형제 앱에서 읽는다) | `main.ts:25` · `domains.ts:51-52` · `cli.ts:29-31` |
| 의존 | chat·notify `file:` 링크(런타임) — 번들에 인라인 · 빌드 선행은 루트 `npm ci` → chat ci → chat tsc → 앱 `npm ci`(8절 `apps/advisor` 행) | `package.json` · `workflow.md` 8절 |
| 플랫폼 키(`platformEnv` = 프로세스 env > `PLEIADES_ENV_FILE`/루트 `.env`) | **필수(없으면 기다림 · 60초 폴링):** `DISCORD_BOT_TOKEN_ADVISOR` · `DISCORD_CHANNEL_ID_ADVISOR` / **선택:** `DISCORD_ALLOWED_USER_IDS_ADVISOR`(비면 `DISCORD_ALLOWED_USER_IDS`) · `DISCORD_WEBHOOK_ADMIN`(관리자 알림 · 비면 로그만) | `platform.ts:6-9,24-31,44-60` · `bot.ts:111-115,145-156` |
| 프로세스 env | `PLEIADES_ENV_FILE`(플랫폼 파일) · `PLEIADES_PRIVATE_DIR`(선택) · `ADVISOR_MCP_PORT_FINANCE`·`ADVISOR_MCP_PORT_FITNESS`(선택 · 기본 `domain.json` `defaultPort` fin 4210 · fit 4301) · `CLAUDE_CONFIG_DIR`(선택 · 설정 검사 위치) · `PATH`(claude 탐색 — **`~/.local/bin` 폴백 없음**, X1 은 있었다 `x1.cjs:257`) · `HOME` | `domains.ts:44-46` · `apps/*/domain.json` · `main.ts:30` · `cli.ts:84-95` |
| 비공개 디렉터리 | `PLEIADES_PRIVATE_DIR` 또는 `~/pleiades-private` → 그 아래 `advisor/`(700 · git 작업트리 안이면 throw) · `advisor/work/`(CLI cwd) · `advisor/mcp-<키해시8>.json`(600) · `advisor/spend-<KST날짜>.json`(600 · tmp→rename) | `private-dir.ts:10-28` · `advisor.ts:78-80,105-108` · `spend.ts:30-31,61-74` · `main.ts:62` |
| 락 파일 | `<privateRoot>/deploy.lock` — release-inplace 와 같은 파일(같은 `PLEIADES_PRIVATE_DIR` 일 때만) · 파일 없으면 `free`(만들지 않는다) · `flock -n <file> true` 자식 rc 0 free · 1 busy · 그 밖 unknown | `deploy-lock.ts:11,17-24` |
| 로그·상태(cwd 상대) | `logs/identify-adv.json` · `logs/alive-adv.json`(**`path.resolve` — cwd 상대** · `apps/advisor/logs`) · 루트 `.gitignore:34` `/apps/advisor/logs` | `bot.ts:27-28,119,130-132` |
| 로그 출력 | `bot` 은 stdout 한 줄씩(`[advisor] …` K-5 줄 · `[discord-adv] …`) · probe·ask 는 stderr | `main.ts:58,94` · `advisor.ts:199-201` |

### B-9. 넘긴 항목별 현재 코드

**(a) 자식 env** — `cli.ts:44-57` `childEnv`: **상속 + 거부 목록**(`DATABASE_URL` · `DISCORD_*` · `ANTHROPIC_MODEL` · `NOTIFY_*` 정확 일치 정규식으로 뺀다) + 고정 5키(`DISABLE_AUTOUPDATER=1` · 핀 3 · `ENABLE_TOOL_SEARCH=false`). 허용 목록이 아니다 — `PLEIADES_ENV_FILE` · `PLEIADES_PRIVATE_DIR` · pm2 가 주입하는 env · 셸에 있던 그 밖 키가 `claude` 로 간다. X1 도 같은 거부 목록 방식(`x1.cjs:243-248` · `X1_LOCK_*` 추가).

**(b) 도메인 지식 → argv** — `cli.ts:72` `"--system-prompt", i.system` · `i.system = buildSystem(...)`(`advisor.ts:59-66,110`) = `BASE_SYSTEM_PROMPT`(576 B · 측정) + 도메인마다 `## 도메인 지식 — <이름>\n<지식>`. 도메인별 상한 `KNOWLEDGE_MAX_BYTES = 32_000`(`domains.ts:14` · 넘으면 그 도메인 제외 `:89`).
- 로컬 지식 크기(이번 측정): **fin 7,904 B**(`apps/finance` 의 `CLAUDE.md` `## Key Domain Rules` 절 + rules 2파일을 `knowledge-prompt.ts:30-50` 과 같은 규칙으로 조립) · **fit 코드 기본값 12,509 B**(`apps/fitness/src/lib/prompts/defaults/system.ts` 템플릿 리터럴 · `${}` 0 · 역따옴표 이스케이프만 풀어 셈). 012 [N10] 의 7,894 · 12,513 와 각 10 B · 4 B 차이(그 사이 문서 변경 또는 셈법 차 — 원인 미확인). **fit 운영 값은 DB 활성 본문**(`apps/fitness/src/mcp/knowledge-prompt.ts:4,41-49`)이라 로컬에서 못 잰다(서비스 DB 접근 금지 I-7).
- 산술: 지금 두 도메인 ≈ 576 + 7,904 + 12,509 + 머리 줄 ≈ 21 KB. 상한 그대로면 최대 576 + 2×32,000 + 머리 줄 < 65 KB · 도메인 3개(#240)면 < 97 KB · **4개면 Linux 단일 인자 상한 131,072 B(MAX_ARG_STRLEN = 32 페이지 · 커널 상수 — 서버 페이지 크기 미확인)에 닿을 수 있다.** 지금 두 도메인으로는 상한 코드상 넘을 수 없다.

**(c) SIGTERM · 종료** — `main.ts:67-74`: `SIGTERM`/`SIGINT` 한 번 → `handle.stop()`(폴링 타이머 해제 + `chat.stop()`) → `main` 이 0 을 돌려준다(`process.exitCode = 0` · `:96`). **진행 중 `advisor.ask` 를 기다리거나 끊는 코드 없음** · 자식 `claude` 를 죽이는 코드 없음. 사용액 기록은 답이 돌아온 **뒤**에만(`bot.ts:92-97` `deps.spend.add(costOf(r))`). 따라서 종료 신호 뒤 프로세스가 강제 종료되면 그 질문의 비용은 기록되지 않는다. 자식 프로세스 핸들이 남아 있으면 Node 가 바로 끝나지 않을 수 있다(추론 · 미측정). pm2 기본 `kill_timeout`·트리 종료 동작은 로컬에 pm2 패키지가 없어 **미측정** · 두 앱 LONG_RUNNING 은 15,000 ms(`pleiades.config.cjs:66`) · 질문 상한은 10분(`cli.ts:13`).

**(d) 4014** — `packages/chat/src/gateway.ts:65` `FATAL_CLOSE = {4004,4010,4011,4012,4013,4014}` · `:289-309`: `fallbackIntents` 가 있고 아직 안 낮췄으면 낮춰 재접속 + `onIntentsFallback` 콜백(`:175`) · 없으면 `stopped = true` + `logger.error("[<label>] gateway 종료 코드 4014 — 다시 접속하지 않는다 — 포털에서 MESSAGE CONTENT INTENT 를 켠다")` **뿐, 치명 종료 콜백은 없다**(`chat.ts:43-46` 의 옵션은 `fallbackIntents`·`onIntentsFallback` 만). 프로세스는 살아 있다(종료 코드 0 아님 · 재시작 없음).
- 앱 선례: fin `discord-interactions.ts:51-61,83` — `fallbackIntents: 0` + `onIntentsFallback: notifyIntentsFallback` → ADMIN 라우트로 "fin Discord 메시지 수신 꺼짐 … (4014)" 1회. fit `:65-73,88` — 같은 모양 · Route.ALLOWED.
- 통합 층: `bot.ts:123` `intents: MESSAGE_INTENTS` · fallback 없음(주석: 버튼이 없어 낮출 곳이 없다) → 4014 면 로그 `[discord-adv] gateway 종료 코드 4014 …` 한 줄(stdout · `bot.ts:138`)만, 관리자 알림 0. 정지 뒤 생존 표지 갱신이 멈추므로 **수집기가 adv 를 감시하면 10분 뒤 `gateway stale` 장애**로 드러난다(`collect.cjs:483` · 수집기 주석 `:47` 은 "4014 강등"을 못 잡는다고 적었지만 그것은 강등(연결 유지)이고, 통합 층의 치명 4014 는 연결이 끊긴다).

**(e) CLI 세션 기록 위치** — 통합 층은 `CLAUDE_CONFIG_DIR` 을 **설정하지 않는다** — 읽기만(`main.ts:30` 설정 검사 위치) · 자식 env 는 상속(`cli.ts:44-57`)이라 CLI 는 부모 값(없으면 `~/.claude`)을 쓴다. 세션을 남긴다(`--no-session-persistence` 없음 · `cli.ts:2-3,68-81`) · cwd 는 `<private>/advisor/work`(`advisor.ts:80`). 주석이 위치 분리를 4b-3 로 넘겼다(`private-dir.ts:4-5`). 설정 검사(`settings.ts:47-82`)는 `claudeDir/settings.json`·`settings.local.json` 의 **hooks · `mcp__` allow · 와일드카드 allow 가 하나라도 있으면 모든 질문을 거부**한다(user 범위 플러그인만 보고만 · `:79-80`) — `CLAUDE_CONFIG_DIR` 을 바꾸면 검사 대상도 함께 바뀐다(`main.ts:30`).
- 로컬 CLI 2.1.323 `--help`: `--system-prompt-snapshot <on|off>` — 기본 on 에서 **대화 첫 요청의 시스템 프롬프트를 기록하고 이후 요청·resume 은 기록본을 그대로 보낸다(나중 실행이 다른 텍스트를 넘겨도)**. 즉 `--resume` 세션에서는 지식이 세션 기록 파일 쪽에 남는다(서버 2.1.311 에도 있는지 미측정).

**(f) 생존 표지** — 통합 층이 **쓴다**: `bot.ts:28,130` `aliveMarker: fileAliveMarker(path.resolve("logs/alive-adv.json"))` → chat 이 READY·RESUMED 즉시 · heartbeat ACK 는 60초에 한 번(`packages/chat/src/alive-marker.ts:1-7,24-38` · `gateway.ts:237,258,262`). 토큰·채널 미설정으로 기다리는 동안엔 파일이 생기지 않는다.

### B-10. 로컬 CLI

| 항목 | 값 |
|---|---|
| PATH 의 claude | `/Users/sagan/.local/bin/claude` → `~/.local/share/claude/versions/2.1.323` (심링크 · `which -a` 1개 · pleiades `bin/claude` shim 은 PATH 에 없음) |
| `--version` | **2.1.323** |
| `--system-prompt <prompt>` | 있음(help 독립 항목) |
| `--system-prompt-file` · `--append-system-prompt-file` | **help 에 독립 항목 없음** — `--bare` 설명 안에 "Explicitly provide context via: `--system-prompt[-file]`, `--append-system-prompt[-file]`" 로만 언급 · 바이너리 문자열 `--system-prompt-file` 6회 · `--append-system-prompt-file` 12회(`strings | grep -o | uniq -c`). 동작은 미측정(모델 호출 금지) |
| `--settings <file-or-json>` | 있음 |
| `--setting-sources <sources>` | 있음 · "user, project, local" |
| 그 밖 관련 | `--bare`(hooks·플러그인 동기화·CLAUDE.md 자동 발견 끔 · `CLAUDE_CODE_SIMPLE=1` · **OAuth·keychain 을 읽지 않는다 — ANTHROPIC_API_KEY 또는 apiKeyHelper 만**) · `--restricted` · `--system-prompt-snapshot` · `--no-session-persistence` · `--strict-mcp-config` |
| help 의 `CLAUDE_CONFIG_DIR` 언급 | 0 |

## C. 서버 쪽 사실 (저장소 문서만)

| 항목 | 기록 | 근거 |
|---|---|---|
| 체크아웃 | `~/pleiades-fin` · `~/pleiades-fit` — 각각 모노레포 전체 clone · fin 은 `apps/finance`, fit 은 `apps/fitness` 에서 돈다 · 옛 `~/pleiades`(dev)는 배포에 안 씀 | `docs/runbooks/007-t4-build-rehearsal.md:7` |
| 셋째 체크아웃 이름 | **기록 없음**(012 는 "셋째 체크아웃" 으로만 · grep `pleiades-adv` 경로 0) | `grep -n "pleiades-adv" docs/specs/012-…` |
| 플랫폼 env | `~/pleiades-platform.env`(600 · 서비스 계정) · `export PLEIADES_ENV_FILE="$HOME/pleiades-platform.env"`(절대경로 필수 · deploy.sh `#198`) · release-inplace C1 이 같은 값을 export · notify-deploy 는 미설정이면 같은 파일 | `007-t4-build-rehearsal.md:46-47` · `007-t5-fin-cutover.md:85` · RI `:238` · `notify-deploy.cjs:5-6` |
| 배포 락 | `$PLEIADES_PRIVATE_DIR` 또는 `~/pleiades-private` 의 `deploy.lock` | RI `:173,181` · `measured-facts.md:4712` |
| 서버 CLI | **2.1.311**(사용자가 11-12 직접 업데이트 · 2.1.308 → 2.1.311 · X1 본 실행 전후 같음) — 그 뒤 변경 기록 없음 | `docs/handoff/2026-11-12-…:9,61` · `docs/specs/011-…:143` |
| 서버 user settings | 플러그인 켬 있음(사용자가 바꾸지 않음) · X1 S-3 은 user 플러그인 "보고만"으로 바꾼 뒤 통과 · 내장 플러그인 3(CLI 2.1.311 고정) | handoff 11-12 `:9,21` · `apps/advisor/src/judge.ts:72-77` · 012 [N18] |
| 서버 `-file` 옵션 | **미측정** — 서버 2.1.311 의 `--help` 기록 없음 |

## A-7 실행 결과

`python3 -m unittest discover -s deploy` (로컬 macOS · node v20.18.0 · HEAD `48ccb68b03e6`) → **`Ran 508 tests in 628.238s` · `OK (skipped=1)`** · 벽시계 10분 28초. 건너뛴 1건의 이름은 출력 꼬리만 받아 미확인.

## 설계가 정해야 할 것 (측정에서 드러난 선택지)

1. **통합 층 기동 env 고정 범위** — `PLEIADES_ENV_FILE` 뿐 아니라 `PLEIADES_PRIVATE_DIR` 도 release-inplace 와 같게 강제(대조 · 또는 unset)할지. 다르면 락 시험이 다른 파일을 본다. 스크립트 가드 · 되돌리기 **중간**.
2. **셋째 체크아웃 이름**(예: `~/pleiades-adv`) — 수집기 `APPS`·런북·(4b-5)`ssh-deploy` 가 하드코딩한다. 이름 변경은 서버 이동 + 수집기 재설치 · **중간**.
3. **배포 스크립트 위치** — `deploy/` 아래면 fin·fit 양식 A 줄 숫자에 섞인다(정보만) · 다른 곳이면 8절 `deploy/` 행 시험 범위 밖. **즉시**(문서).
4. **자식 env 허용 목록의 내용** — 최소(`HOME`·`PATH`·`LANG`·`TZ` + 고정 5키)로 갈지, `CLAUDE_CONFIG_DIR`·인증 관련 키를 넣을지. 빠뜨리면 CLI 인증 실패 → 질문 실패(서버 인증 방식 미측정). 코드 **중간**.
5. **지식 전달** — `--system-prompt-file`(로컬 2.1.323 바이너리엔 있음 · help 독립 항목 아님 · 서버 2.1.311 미측정) vs 현행 argv 유지 + 도메인 상한 합계 시험(2 도메인은 상한상 128 KiB 를 못 넘는다). 파일이면 비공개 디렉터리 600 파일 하나 더. 코드 **중간**.
6. **`CLAUDE_CONFIG_DIR` 분리 여부** — 통합 층 전용 디렉터리로 두면 세션 기록·스냅샷이 개발용과 갈리고 설정 검사가 빈 디렉터리를 보게 되지만, **인증 정보 위치도 함께 바뀐다**(로그인 상태 미측정). 유지하면 개발용 user settings 에 hooks 가 생기는 순간 모든 질문 거부. 되돌리기 env 한 줄 **즉시** · 기록 이전은 **중간**.
7. **종료 처리** — SIGTERM 때 진행 중 질문을 기다릴지(그러면 `kill_timeout` ≥ 질문 상한 10분) vs 자식 `claude` 에 신호 + 호출당 상한($1.00)을 사용액에 미리 더함. pm2 기본 `kill_timeout`·트리 종료는 미측정. 코드 **중간**.
8. **4014 알림** — chat 에 치명 close 콜백을 더할지(패키지 변경 · 두 앱 무영향이어야) vs 통합 층이 로그 줄을 감지 vs 수집기 `alive-adv` stale(10분)로 갈음. 패키지 **중간** · 수집기 재설치 필요.
9. **수집기 분기 7곳**(A-6) — 역할 집합을 앱별로. 수집기 재설치(REF·SHA). **중간**.
10. **`claude` 탐색** — pm2 PATH 에 `~/.local/bin` 이 없을 때(X1 은 폴백했다) 기동 실패 루프. 스크립트가 PATH 를 고정하거나 경로를 env 로. **즉시~중간**.
