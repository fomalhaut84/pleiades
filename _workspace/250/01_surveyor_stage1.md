# 008 단계 1 실측 — 수동 수집기 + Discord #ops (#564)

- 대상: pleiades `dev` HEAD `c25f21a9b400` (로컬 파일만 · 서버·ssh·pm2 실행 0 · `repos/*`·원본 git 0)
- pm2 소스: 로컬 npx 캐시 `~/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2` = **7.0.4**. **서버는 6.0.8**(`measured-facts.md:4290` U8) — 6.0.8 소스는 로컬에 없다. 아래 pm2 판독은 7.0.4 기준이고 6.0.8 과 같은지는 **미확인**.
- 기호: `P/` = 위 pm2 디렉터리.

## 경고 (008 단계 1 가정을 바꾸는 사실)

| # | 사실 | 바뀌는 가정 | 근거 |
|---|---|---|---|
| W1 | **pm2 RPC 에 권한 구분·인증이 없다.** 데몬이 `rpc.sock`·`pub.sock` 을 `chmod 775` 로 만들고(그룹 쓰기 포함), RPC 서버는 `getMonitorData` 와 `stopProcessId`·`deleteProcessId`·`killMe`·`sendSignalToProcessName` 을 **같은 목록으로 노출**한다. vendored axon-rpc 에 auth·token 처리 0건 | §4-6 "pm2 상태 읽기" 행의 가정(소켓에 닿으면 stop·delete 도 된다)이 **참으로 확인됨**(7.0.4). **`$PM2_HOME` 에 그룹 접근을 열면 = 그룹이 전 RPC(정지·삭제·데몬 종료)를 얻는다.** "그룹 읽기 권한으로 pm2 상태만" 은 성립하지 않는다 → 우선 검토안(서비스 사용자가 허용 목록 파일을 떨군다)만 남는다 | `P/lib/Daemon.js:110`·`:139` (chmod 775) · `:215-252` (expose) · `P/modules/pm2-axon-rpc/lib/server.js:72-85` (onmessage → methods[meth], 검사 없음) |
| W2 | **`getMonitorData`(= `pm2 jlist`)는 프로세스 전체를 돌려준다** — `getFormatedProcesses()` 그대로 + monit. env 가 실린 `pm2_env` 포함 | §4-6 허용 목록 필요성 재확인. 읽기 RPC 하나만 열어도 env 비밀이 나간다 | `P/lib/God/ActionMethods.js:40-57` |
| W3 | **MCP 의 pino 로그(error·fatal 포함)는 stdout 으로만 간다**(HTTP 모드) → pm2 **`-out`** 로그. `release-inplace.sh` C5 는 **`-error` 로그만** 센다 → MCP 의 pino 오류 줄은 C5 "창 안 오류 줄" 에 **안 잡힌다** | "C5 판정 로직을 그대로 재사용" 하면 MCP 오류를 놓친다. MCP 는 tee 파일(JSON · `level` 필드) 또는 `-out` 로그의 JSON `level` 로 따로 세야 한다 | fin `apps/finance/src/mcp/logger.ts:26-27`(stdout) · fit `apps/fitness/src/mcp/logger.ts:136`(LOG_OUT_STREAM) · `deploy/release-inplace.sh:327`(`-error` 만) |
| W4 | **두 앱 MCP 로거는 "같은 형식" 이 아니다** — fin 만 `logs/mcp-crash-<KST날짜>.log`(fatal 전용 tee)가 있다. fit 에는 `mcp-crash` 문자열 0건 | 008 §4-2 (a) 행 *"같은 형식"* 정정 필요 — 일반 tee(`mcp-<날짜>.log` · pino JSON)는 같고 crash 파일은 fin 만 | `apps/finance/src/mcp/logger.ts:100` · `git grep -n mcp-crash HEAD -- apps/fitness` 0건 |
| W5 | **pm2 로그 파일 이름에 pm_id 가 붙고, 그 id 는 배포 때 바뀐다.** 6 프로세스는 cluster 모드(설정에 `exec_mode` 없음 + `instances: 1` + node) → `merge_logs` 미설정 → `<name>-error-<pm_id>.log`. `deploy.sh` 는 배포마다 bot 을 `pm2 delete` 후 `start` 한다(web 은 args 가 다를 때) → 새 id · 새 파일 · 옛 파일은 남는다 | 수집기는 고정 파일 이름을 tail 하면 안 된다 — **glob + 줄 시각 창**으로 읽어야 한다(C5 가 이미 `-error*.log` glob · 시각 창 방식) | `P/lib/Common.js:347-353`(cluster 기본) · `:864-869`(merge_logs 는 cluster 아닐 때만) · `P/lib/God.js:207-213`(`-<pm_id>.log`) · `deploy/pleiades.config.cjs:62`(exec_mode 없음) · `deploy/deploy.sh:359-361`(bot delete→start) · `:349-353`(web 조건부 delete) · `measured-facts.md:4285` U3(서버 cluster 관측) |
| W6 | **배포 체크아웃은 "깨끗해야" 배포된다** — `release-inplace.sh` 가 A 와 C2 에서 `git status --porcelain` 이 비어 있지 않으면 멈춘다. 수집기가 체크아웃 안에 추적되지 않는(ignore 아닌) 파일을 쓰면 **다음 자동 배포가 멈춘다** | 수집기 출력·상태 파일은 체크아웃 밖(또는 ignore 된 `apps/<dir>/logs/`)이어야 한다 | `deploy/release-inplace.sh:176` · `:275` · `apps/finance/.gitignore:43` · `apps/fitness/.gitignore:54` (`/logs/`) |
| W7 | **체크아웃 안 스크립트를 주기 작업으로 부르면 R-8(옛 태그 checkout) 때 사라진다** — 이미 db-backup 이 그래서 체크아웃 밖 `~/pleiades-ops/` 에 커밋 고정 + SHA-256 검증으로 설치했다 | M7 후보 위치의 선례가 이미 있다(아래 M7) | `deploy/db-backup.cjs:9` · `docs/runbooks/db-backup.md:9`·`:22-26`·`:60` |

## M1. pm2 데몬 RPC 권한 구분

| 항목 | 값 | 측정 명령 · 근거 | 미측정 |
|---|---|---|---|
| 서버 pm2 버전 | 6.0.8 (전역 `pm2` · 저장소 lock 에 pm2 없음) | `measured-facts.md:4290` U8 인용(재측정 안 함) · `/usr/bin/grep -n '"node_modules/pm2"' package-lock.json apps/*/package-lock.json packages/*/package-lock.json` → 0 · `deploy/deploy.sh:342-365` 는 bare `pm2` | 서버 설치 경로(nvm 등) — 서버 측정 필요 |
| 로컬 pm2 소스 | 7.0.4 (npx 캐시 1개) | `for f in ~/.npm/_npx/*/node_modules/pm2/package.json; do grep -m1 '"version"' $f; done` | 6.0.8 소스 없음 |
| 소켓 경로 | `$PM2_HOME/rpc.sock` · `pub.sock` · `interactor.sock` · PM2_HOME 기본 `~/.pm2` | `P/paths.js:12-13`(env 우선) · `:57-59` · 서버 기본값은 U3 "`PM2_HOME` 기본" (`measured-facts.md:4285`) | — |
| 소켓 권한 | 바인드 직후 `chmod 775` · `PM2_SOCKET_USER`+`PM2_SOCKET_GROUP` env 가 있으면 chown | `P/lib/Daemon.js:110-123`(pub) · `:139-152`(rpc) | 서버 실제 mode·`$PM2_HOME` 디렉터리 mode — 서버 측정 필요 |
| RPC 메서드 | 한 목록에 읽기(`getMonitorData` `getSystemData` `ping` `getVersion` `getReport`)와 쓰기(`stop/restart/delete/startProcessId` `killMe` `sendSignalToProcessName` `sendLineToStdin` `reloadLogs` 등) 혼재 | `grep -n 'server.expose' P/lib/Daemon.js` → `:215-252` | — |
| 인증·권한 검사 | 없음 — `onmessage` 가 `this.methods[meth]` 를 바로 부른다 · axon/axon-rpc 에 auth·token 0 | `/usr/bin/grep -n -E 'auth\|token' P/modules/pm2-axon-rpc/lib/server.js` 0 · `/usr/bin/grep -rn -E 'auth\|token\|password' P/modules/pm2-axon/lib/` → package.json `author` 1건뿐 | — |
| 로그 위치 | 기본 `$PM2_HOME/logs/` = 소켓과 **같은 트리**(`logs` 는 PM2_HOME 하위) | `P/paths.js:50` | — |
| 결론 | 소켓 연결 = 전 권한. 읽기 전용 경로는 pm2 자체에 없다 | — | 6.0.8 동일성 |

## M2. 로그 경로·형식

| 항목 | 값 | 근거 |
|---|---|---|
| `out_file`·`error_file`·`merge_logs` | **설정에 없음** → pm2 기본 `$PM2_HOME/logs/<name>-{out,error}-<pm_id>.log` (cluster → W5) | `deploy/pleiades.config.cjs:62-108` · `P/lib/Common.js:201-207` · `P/lib/God.js:207-213` |
| `log_date_format` | `'YYYY-MM-DD HH:mm:ss'` (6 프로세스 공통 `COMMON`) → 줄 접두 `<시각>: ` · **쓰기 덩어리마다** 붙어 여러 줄 스택 뒷줄엔 없음 · 시각은 pm2 데몬 TZ | `deploy/pleiades.config.cjs:62` · `P/lib/ProcessContainer.js:170-171` · `deploy/release-inplace.sh:16` |
| `MCP_LOG_TEE_FILE` | `'1'` — fin·fit mcp 만 | `deploy/pleiades.config.cjs:82` · `:106` |
| MCP tee 파일 | `MCP_LOG_DIR ?? cwd/logs` = `apps/<dir>/logs/mcp-<KST날짜>.log` · 보존 `MCP_LOG_RETENTION_DAYS ?? 14` · pino JSON(`level` 문자열 · `time` ISO · `base {pid, service:'mcp'}` · redact 목록) | fin `logger.ts:21-22`·`:39`·`:78`·`:183-210` / fit `logger.ts:20-21`·`:189-200` |
| MCP crash 파일 | **fin 만** `logs/mcp-crash-<날짜>.log` (W4) | fin `logger.ts:46`·`:100` |
| fin 기존 MCP 로그 열람 화면 | fin 웹 `/admin/mcp-logs`(파일 경로 `logFilePath(date, crash)`) — 앱 안 선례 | `apps/finance/src/app/admin/mcp-logs/` · `apps/finance/src/app/api/admin/mcp-logs/__tests__/shared.test.ts:53-54` |
| web·bot 오류 형식 | 공통 로거 없음 · `console.error('[<태그>] …')` 자유 형식 · JSON 아님. 호출 수(테스트 pathspec 제외): fin `console.error` 229 · `console.warn` 24 · fit 93 · 115 · `logger.error/warn` fin 9 · fit 9 | `git grep --text -cE "console\.error\(" HEAD -- apps/<a>/src ':!**/__tests__/**' ':!**/*.test.ts'` 합 · 접두 상위: `[bot]` 26 · `[notification]` 22 · `[cron]` 12 … (`git grep -hoE "console\.error\(['\"\`]\[[^]]{1,30}\]"`) — 태그 집합은 고정 계약이 아니다 |
| 정상인데 오류 로그에 가는 줄 | chat gateway 기동 warn — `\] gateway (준비 완료\|세션 이어받음)$` 를 C5 가 뺀다(판정 계약 · #373) | `deploy/release-inplace.sh:104-105` |
| C5 "창 안 오류 줄" | `cat <prefix>*.log` → 줄 앞 19자(시각) 문자열 비교로 `[T0,T1]` 창 → 정상 gateway 줄 제외 → 줄 수 · 그중 `⚠\|[Ww]arning` 수. 대상 = `$HOME/.pm2/logs/pleiades-<app>-<web\|bot\|mcp>-error` | `deploy/release-inplace.sh:106-110`·`:325-329` |
| C5 프로브 | 배포 중 `GET http://127.0.0.1:<web_port>/` 를 `PROBE_INTERVAL` 마다 → 2xx·3xx 외 줄 수 + 코드별 개수(`000` = 연결 거부) | `:286-292` · `:319-323` |
| C5 MCP·프로세스 | `/health` 200 · `pm2 jlist` → 이름 접두 `pleiades-<app>-` 의 수·online 수·cwd 가 체크아웃 안인지 · `PLEIADES_ENV_FILE` 일치(값 안 냄) | `:84-103` · `:331-337` |
| 409 | **C5 에 없다** — 009 D-5 B1(#502)에서 칸·게이트 삭제 · 대체 없음 · "같은 봇 이중 실행이 실제로 생기면 #250" | `docs/runbooks/release-inplace.md:70` · `grep -n 409 deploy/*.sh deploy/*.cjs` 0 |
| 재사용성 | `count_window` 는 함수로 분리돼 있어 로직은 재사용 가능. 단 ① `-error` 만 봄(W3) ② 창은 배포 시각 고정 — 상시 수집은 "직전 수집 시각" 을 상태로 가져야 함 ③ 시각 문자열 비교는 데몬 TZ 와 수집기 TZ 가 같아야 함 ④ jlist JSON 해석이 **3벌**이고 서로 다름: `release-inplace.sh:81`(`[{` 또는 `[]`) · `t2-check.sh:108`(줄 머리 `[{`/`[]` 정규식) · `deploy.sh:115`(**첫 `[`** — `[PM2][WARN]` 줄이 앞에 오면 해석 실패 · #278 에서 release-inplace 만 고침) | 위 줄 |

## M3. health 엔드포인트

| 항목 | 값 | 근거 |
|---|---|---|
| MCP `/health` | 두 앱 동일 응답 `{ok, uptime, sessions, version:'1.0.0'}` · 바인드 `127.0.0.1` 고정 | fin `src/mcp/server.ts:950`·`:986-994`·`:1093` / fit `:750`·`:785-796`·`:933` |
| web health 라우트 | **없음** (두 앱). `src/app` 경로에 health·ping·ready·live 0 · `/health` 문자열은 MCP 2곳뿐. 배포는 `GET /` 를 프로브로 쓴다 | `git ls-tree -r --name-only HEAD -- apps/*/src/app \| grep -iE 'health\|ping\|status\|ready\|live'` → 무관 3건(fit `api/sync/status` 는 싱크 상태 API · 인증 여부 미확인) · `deploy/release-inplace.sh:289` |
| bot health | 없음(HTTP 리스너 없음). 상태 파일 `apps/<dir>/logs/identify-<fin\|fit>.json`(Discord IDENTIFY 기록)만 | fin `src/bot/notifications/discord-interactions.ts:27` · fit `:38` |
| 포트 출처 | `PORT`·`MCP_PORT` = 셸 env > `apps/<dir>/.env` · 설정 파일이 단일 출처 · 기본값 없음(누락이면 로드 거부) | `deploy/pleiades.config.cjs:6-7`·`:46-57` · `deploy/deploy.sh:86` · 실값은 서버 `.env`(서버 측정 필요 · U12 는 4210·4301 = 127.0.0.1 `measured-facts.md:4294` — 전환 뒤 포트는 미기록) |
| `deploy.sh` 의 판정 함수 | `healthy()` = `curl -sS -f --max-time 3 127.0.0.1:<p>/health` · `listening()` = curl rc ≠ 7 | `deploy/deploy.sh:107-109` |

## M4. Discord 알람 경로 재사용

| 항목 | 값 | 근거 |
|---|---|---|
| 배포 알림 경로 | **앱 봇 경유가 아니다.** `ssh-deploy.sh` 가 앱마다 `node --network-family-autoselection-attempt-timeout=2000 <체크아웃>/deploy/notify-deploy.cjs <app> <ok\|fail> <tag> <요약>` → 웹훅 직접 POST(`allowed_mentions.parse=[]` · 10 s 타임아웃 · 실패해도 rc 0) | `deploy/ssh-deploy.sh:44`·`:55-72` · `deploy/notify-deploy.cjs:3-9`·`:59-96` |
| env 키 | `DISCORD_WEBHOOK_DEPLOY` 하나 · 스위치 `NOTIFY_DEPLOY_CHANNEL` 은 읽지 않음 | `notify-deploy.cjs:5-7`·`:44` · `.env.example:33-37` |
| 플랫폼 설정 위치(코드가 정한 것) | `PLEIADES_ENV_FILE` 또는 `~/pleiades-platform.env` | `notify-deploy.cjs:38` · `db-backup.cjs:208` |
| 둘째 선례 | `db-backup.cjs` 도 같은 웹훅·같은 방식(체크아웃 밖에서 crontab) | `deploy/db-backup.cjs:204-244` |
| 숨은 의존 | 두 스크립트 모두 **앱 체크아웃의 `node_modules/dotenv`** 로 설정을 해석한다(`require.resolve('dotenv', {paths:[appDir]})`) — 앱 체크아웃이 없거나 `node_modules` 가 없으면 웹훅을 못 읽는다(알림 0 · 사유 한 줄) | `notify-deploy.cjs:28-31` · `db-backup.cjs:48`·`:210-217` |
| 네트워크 플래그 | `notify-deploy` 는 `ssh-deploy.sh:71` 이 플래그를 붙인다 · **`db-backup` 은 스크립트·crontab 줄 모두 플래그 없음** — 서버에서 외부 연결이 실패할 수 있다고 기록된 조건(#191) | `grep -n network-family deploy/db-backup.cjs` 0 · `docs/runbooks/db-backup.md:60` · `measured-facts.md:4297` |
| 플랫폼 키 집합 | `NOTIFY_*` · `DISCORD_WEBHOOK_*` · `DISCORD_BOT_TOKEN_*` · `DISCORD_CHANNEL_ID_*` · `DISCORD_ALLOWED_USER_IDS` — 새 `DISCORD_WEBHOOK_OPS` 는 정규식에 이미 들어간다(앱 `.env` 에 두지 못함) | `packages/notify/src/platform-env.ts:30` |
| 템플릿의 웹훅 | `FINANCE` · `FITNESS` · `ADMIN` · `DEPLOY` (4) | `.env.example:11-13`·`:37` |
| notify Route | `ALLOWED`·`ADMIN` 2개 · ADMIN = fin `#admin` 웹훅 · **fit 은 ADMIN 미매핑**(targetCount 0) | `packages/notify/src/types.ts:64-71` |
| 가장 작은 경로 | `notify-deploy.cjs` 모양의 독립 node 스크립트 + 플랫폼 설정의 웹훅 키 1개(새 `DISCORD_WEBHOOK_OPS` 또는 기존 `DEPLOY`·`ADMIN` 재사용) · `packages/notify` 무변경 · 앱 코드 무변경. 남는 의존은 dotenv(위) · 네트워크 플래그 | 위 줄들의 조합(측정 아님 — 판단) |

## M5. 자동 기동·주기 작업

| 항목 | 값 | 근거 |
|---|---|---|
| 저장소의 systemd 유닛·타이머 | **0** — `deploy/` 에 `.service`·`.timer`·`ExecStart` 없음. pm2 자동 기동은 `pm2 startup systemd` 를 사용자가 1회(T-5) 실행한 것 | `/usr/bin/grep -rn -E 'systemd\|\.timer\|\.service\|ExecStart' deploy/*.sh deploy/*.cjs deploy/pleiades.config.cjs` → `backup-check.sh` 의 점검 출력뿐 · `docs/runbooks/007-t5-fin-cutover.md:163` · 007 §T-5c |
| crontab 정의 | 저장소 파일엔 없음 · **런북이 설치 명령으로** db-backup 1줄을 넣는다(`… $HOME/pleiades-ops/db-backup.cjs >> $HOME/pleiades-private/db-backup.log 2>&1`) · 라즈베리파이 쪽은 `db-offsite-pull.sh`(파이 crontab) | `docs/runbooks/db-backup.md:54-64` · `deploy/db-offsite-pull.sh:4` · 서버 실재는 `backup-check.sh` 출력으로만 확인(이번 측정 범위 밖) |
| 전환 전 crontab | 계정 crontab 없음(T-2 U6) | `measured-facts.md:4288` 인용 |
| `cron_restart` | 0 | `git grep -n cron_restart HEAD` → 0 |
| 앱 내부 크론 | node-cron 등 앱 프로세스 안(전수 기록 있음) | `measured-facts.md:4033-4118` 인용 |
| `.server-scripts/` | gitignore(`/.server-scripts/`) · 이름 규칙 `<번호>[<접미>]-<server\|pi\|mac>-<주제>.sh` · 현재 17개(1~16 · 4e) | `.gitignore:21` · `ls .server-scripts/` (이름만 · 내용 안 읽음) |

## M6. pm2 상태 허용 목록 선례 (`deploy/t2-check.sh:100-120`)

| 항목 | 값 |
|---|---|
| 하는 일 | `pm2 jlist` stdin → 줄 머리 `[{`/`[]` 부터 JSON 해석(실패하면 출력 안 싣고 exit 1) → 이름이 `myfinance\|myfitness\|pleiades-` 면 `name · status · pm_cwd · pm_exec_path · port=<-p 값만> · restarts=<restart_time>`, 그 밖은 `name · status` 만. env·args 원문은 안 냄 |
| 재사용 | **방식은 재사용 가능 · 필드는 그대로 못 쓴다.** `pm_cwd`·`pm_exec_path` 는 절대 경로(§5-2 P-2 금지 · Discord 게시 불가) · `pm_uptime`(uptime) 없음 · 이름 정규식에 옛 서비스 이름 포함(전환 뒤 불필요). 008 §4-6 허용 목록(이름·status·재시작 수·uptime)으로 바꾸면 된다 |
| 같은 일을 하는 다른 판 | `release-inplace.sh:84-103`(`env_same` · `app_procs` — 값·경로 안 냄) · `deploy.sh:111-121`(`pm2_state` — 첫 `[` 해석 · M2 ④) |

## M7. 수집기 위치 후보

| 항목 | 값 | 근거 |
|---|---|---|
| 배포 체크아웃 | 앱별 2개 `$HOME/pleiades-fin` · `$HOME/pleiades-fit`(코드에 박힌 이름) · 같은 저장소 · 같은 태그를 앱별로 checkout | `deploy/ssh-deploy.sh:41`·`:56` · `deploy/db-backup.cjs:27-30` |
| `deploy/` 에 두면 | 두 체크아웃에 **같은 파일이 2벌**(앱별 태그가 다를 수 있음). 어느 쪽에서 부를지는 정해진 바 없음 — 선례: forced command 는 **fin 체크아웃** 판(`ssh-deploy.sh:5`) | `ssh-deploy.sh:5` |
| 배포 갱신과의 관계 | `release-inplace.sh` C2 가 `git checkout <태그>` → 도는 스크립트가 바뀐다. 자기 교체 보호 선례 = 본문 전체를 함수에 두고 마지막 줄에서 `main; exit` | `release-inplace.sh:17`·`:344` · `ssh-deploy.sh:10`·`:74` |
| R-8 | 옛 태그로 checkout 하면 그 태그에 없는 파일은 사라진다 → 크론이 조용히 멈춘다 | `db-backup.cjs:9` |
| 선례 위치 | **체크아웃 밖 `~/pleiades-ops/`**(mode 700) — 커밋 고정 raw URL → `.new` → `sha256sum -c` → `mv`, 로그·비공개 산출물은 `~/pleiades-private/`(700) | `docs/runbooks/db-backup.md:9`·`:22-26` · `release-inplace.sh:161`(`PLEIADES_PRIVATE_DIR:-$HOME/pleiades-private`) |
| 체크아웃 안 쓰기 | 금지에 가깝다 — 비추적 파일이 생기면 다음 배포 A·C2 가 멈춘다(W6). 예외는 ignore 된 `apps/<dir>/logs/` | W6 |
| 남는 의존 | `~/pleiades-ops/` 판도 dotenv 를 앱 체크아웃 `node_modules` 에서 빌린다(M4) | `db-backup.cjs:48` |

## 서버 측정 필요 (추정하지 않음)

`$PM2_HOME`·`logs/`·소켓의 실제 mode·소유 · 서버 6.0.8 의 Daemon/RPC 소스 동일성 · pm2-logrotate 설치 여부 · 로그 파일 크기·증가량 · 실제 `PORT`·`MCP_PORT` · 서버 crontab 현재 줄 · 디스크 여유 · `~/pleiades-ops/` 실재(런북 실행 결과).
