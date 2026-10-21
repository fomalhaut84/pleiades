#!/usr/bin/env bash
# deploy.sh — pleiades 체크아웃에서 앱 하나를 빌드·기동한다 (007 §4-1 D-a · T-1b · #176).
#
# 사용:  deploy/deploy.sh <fin|fit> [--build-only | --activate] [--allow-untagged] [--dry-run]
#   서버에서 사용자가 먼저 fetch · checkout <vX.Y.Z> 를 하고 이 스크립트를 부른다 — 스크립트는 git 을 바꾸지 않는다.
#   (기본)            의존성 → 마이그레이션 검사 → 빌드 → MCP pre-flight → 점유 검사 → 활성화. 옛 서비스가 online 이면 점유 검사에서 exit 3
#   --activate        exit 3 뒤 옛 프로세스를 멈추고 부른다(007 T-5c ⑤) — 산출물 확인 → 마이그레이션 재검사 → 점유 검사 → 활성화
#   --build-only      T-4 서버 리허설(서비스 DB 없음) — 의존성 · 빌드만. 마이그레이션 검사·pm2 없음 · fin next build 없음
#   --allow-untagged  HEAD 가 vX.Y.Z 태그가 아니어도 진행(리허설)
#   --dry-run         가드만 돌리고 실행할 단계를 출력한다 — 로컬(Darwin)에서 허용되는 유일한 모드(I-3)
# 포트: apps/<dir>/.env(또는 셸)의 PORT · MCP_PORT — deploy/pleiades.config.cjs 가 읽고 없으면 거부한다.
#       pre-flight 임시 포트는 PLEIADES_PREFLIGHT_PORT(기본 fin 4299 · fit 4399 — 서비스와 같다).
#
# 서비스 deploy.sh 와 다른 점(007 §4-1 표):
#   - git 조작·작업트리 정리 없음 — 정리 명령은 P-2 상태 심링크를 지운다(4-2 정정 1)
#   - 루트 npm ci 가 첫 단계 — prepare 가 packages/notify/dist 를 만든다(⑭). 실패 = 배포 실패
#   - 마이그레이션은 적용하지 않고 검사만 한다 — status(대기) + psql 이름 대조(DB 전용 · status 가 놓친다 · #180). 차이가 있으면 중단(정정 5 · Q74)
#   - 활성화 직전 점유 검사 — 옛 서비스 pm2 가 online 이면 빌드·pre-flight 뒤 exit 3(→ 옛 프로세스 정지 → --activate),
#     다른 프로세스가 포트를 잡고 있으면 중단. 같은 포트라 옛 프로세스가 health 에 대신 응답한다(정정 4 의 거울상 · #176 사전 리뷰).
#     빌드 전이 아닌 이유: 빌드는 S-a 새 체크아웃이라 옛 서비스와 무관하고, T-5c ③ 은 옛 서비스가 도는 동안 빌드한다 —
#     빌드 전에 멈추면 설치·빌드 내내 서비스가 내려가고 빌드 실패 시 내려간 채로 남는다(PR #203 Codex P1 · #206)
#   - 웹도 restart — reload 겹침 구간의 고아 prompt_run(#170)을 없앤다. 봇은 delete + start(409 · 옵션 반영)
#     startOrRestart 는 이미 등록된 앱의 args(포트)·script 를 바꾸지 않는다 — 포트를 바꾸면 그 앱을 먼저 delete
#   - fin mcp-config bootstrap 은 이식하지 않는다(4-1 조건 (i)·(ii)) — 대신 MCP_PORT 와 그 파일의 url 포트를 대조한다
set -euo pipefail

die() { echo "deploy.sh: 중단 — $*" >&2; exit 1; }
usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

[[ $# -ge 1 ]] || usage
APP=$1; shift
case "$APP" in
  fin) DIR=finance; DEFAULT_PREFLIGHT=4299; SERVICE_NAMES="myfinance myfinance-bot myfinance-mcp" ;;
  fit) DIR=fitness; DEFAULT_PREFLIGHT=4399; SERVICE_NAMES="myfitness myfitness-bot myfitness-mcp" ;;
  *) usage ;;
esac
BUILD_ONLY=0; ACTIVATE=0; ALLOW_UNTAGGED=0; DRY=0
for arg in "$@"; do
  case "$arg" in
    --build-only) BUILD_ONLY=1 ;;
    --activate) ACTIVATE=1 ;;
    --allow-untagged) ALLOW_UNTAGGED=1 ;;
    --dry-run) DRY=1 ;;
    *) die "모르는 인자 $arg" ;;
  esac
done

[[ $BUILD_ONLY -eq 0 || $ACTIVATE -eq 0 ]] || die "--build-only 와 --activate 는 같이 쓸 수 없다"

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
APP_DIR="$ROOT/apps/$DIR"
CONFIG="$ROOT/deploy/pleiades.config.cjs"
# 준비 표지 — 기본 실행이 pre-flight 를 통과하면 HEAD 를 적고 --activate 가 대조·소비한다.
# 파일만 보면 다른 태그 산출물·build-only 산출물(pre-flight 없음 · 빈 .env)을 활성화한다(#206 사전 리뷰 major)
READY="$ROOT/.deploy-ready-$APP"

# ── 가드 ──────────────────────────────────────────────────────────────
[[ "$(uname -s)" != Darwin || $DRY -eq 1 ]] || die "로컬에서는 --dry-run 만 — 로컬 pm2·빌드는 tools/local/run.sh 경유(I-3 · #171)"
[[ "$(node -p "require('$ROOT/package.json').name" 2>/dev/null)" == pleiades ]] || die "$ROOT 는 pleiades 체크아웃이 아니다"
[[ -d "$APP_DIR" ]] || die "apps/$DIR 가 없다"

# 비밀이 든 .env 는 서비스 계정만 읽어야 한다 — 옛 서비스 .env 는 664 였고 같은 서버에 다른 계정·서비스가 돈다(007 T-2 U3·U7 · #193).
# 심링크는 대상 권한을 본다(-L). 앱 .env 와 플랫폼 설정(PLEIADES_ENV_FILE · 없으면 루트 .env · #143) 둘 다
env_private() {
  local f=$1 mode uid
  [[ -e "$f" ]] || return 0
  mode=$(stat -L -c %a "$f" 2>/dev/null || stat -L -f %Lp "$f")
  uid=$(stat -L -c %u "$f" 2>/dev/null || stat -L -f %u "$f")
  # 결과를 검증한다 — 빈 값은 산술에서 0 이 돼 통과하고, GNU 에서 BSD 꼴로 넘어가면 파일시스템 정보가 나온다 (#193 사전 리뷰)
  [[ "$mode" =~ ^[0-7]{3,4}$ && "$uid" =~ ^[0-9]+$ ]] || die "$f 의 권한·소유자를 읽지 못했다"
  (( (8#$mode & 8#077) == 0 )) || die "$f 권한이 $mode — 다른 계정이 읽거나 쓸 수 있다. chmod 600 \"$f\" 후 다시 부른다"
  [[ "$uid" == "$(id -u)" ]] || die "$f 소유자 uid $uid — 이 스크립트를 부르는 계정(uid $(id -u))이어야 한다"
}
# 앱(cwd = apps/<dir>)은 상대 PLEIADES_ENV_FILE 을 자기 cwd 기준으로 푼다 — 여기서 같은 파일을 보장할 수 없으니 절대경로만 받는다 (#193 사전 리뷰 major)
[[ -z "${PLEIADES_ENV_FILE:-}" || "$PLEIADES_ENV_FILE" == /* ]] || die "PLEIADES_ENV_FILE 는 절대경로여야 한다(현재 '$PLEIADES_ENV_FILE')"
env_private "$APP_DIR/.env"
env_private "${PLEIADES_ENV_FILE:-$ROOT/.env}"

TAG=$(git -C "$ROOT" tag --points-at HEAD | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)
if [[ -z "$TAG" ]]; then
  [[ $ALLOW_UNTAGGED -eq 1 ]] || die "HEAD 가 vX.Y.Z 태그가 아니다 — 서버에서 checkout <태그> 후 부른다(리허설은 --allow-untagged)"
  TAG="(태그 없음 $(git -C "$ROOT" rev-parse --short HEAD))"
fi

# 포트는 pm2 가 읽을 설정 파일에서 꺼낸다 — 단일 출처 · 누락이면 설정 파일이 거부한다
PORTS=$(cd "$APP_DIR" && node -e "
  const apps = require('$CONFIG').apps
  const by = (r) => apps.find((a) => a.name === 'pleiades-$APP-' + r).env
  process.stdout.write(by('web').PORT + ' ' + by('mcp').MCP_PORT)
") || die "포트를 읽지 못했다(위 메시지)"
read -r WEB_PORT MCP_PORT <<<"$PORTS"
PREFLIGHT_PORT=${PLEIADES_PREFLIGHT_PORT:-$DEFAULT_PREFLIGHT}
[[ "$PREFLIGHT_PORT" =~ ^[1-9][0-9]{0,4}$ && "$PREFLIGHT_PORT" != "$MCP_PORT" && "$PREFLIGHT_PORT" != "$WEB_PORT" ]] \
  || die "pre-flight 포트 $PREFLIGHT_PORT 가 잘못됐거나 PORT·MCP_PORT 와 겹친다"

if [[ "$APP" == fin ]]; then
  # fin advisor 는 런타임에 이 파일의 url 로 MCP 를 찾는다(007 ⑫) — 다르면 배포 뒤 AI 가 조용히 끊긴다
  CFG_PORT=$(node -p "new URL(require('$APP_DIR/src/lib/ai/mcp-config.json').mcpServers.myfinance.url).port" 2>/dev/null || true)
  [[ "$CFG_PORT" == "$MCP_PORT" ]] || die "MCP_PORT $MCP_PORT ≠ src/lib/ai/mcp-config.json 의 url 포트 ${CFG_PORT:-?}"
fi

# ── 실행 도우미 ───────────────────────────────────────────────────────
step() { echo; echo "=== $* ==="; }
at_root() { echo "+ $*"; [[ $DRY -eq 1 ]] || (cd "$ROOT" && "$@"); }
at_app() { echo "+ (apps/$DIR) $*"; [[ $DRY -eq 1 ]] || (cd "$APP_DIR" && "$@"); }
healthy() { curl -sS -f -o /dev/null --max-time 3 "http://127.0.0.1:$1/health" 2>/dev/null; }
# 연결이 거부되지 않으면 누군가 듣는다 — curl 7(연결 실패)만 "비었다". HTTP 가 아닌 리스너·빈 응답(52)·타임아웃(28)도 점유다(PR #177 Codex P2)
listening() { local rc=0; curl -s -o /dev/null --max-time 3 "http://127.0.0.1:$1/" 2>/dev/null || rc=$?; [[ $rc -ne 7 ]]; }

# pm2 jlist 에서 이름별 "<status> <restart_time> <args…>" — 없으면 빈 줄
pm2_state() {
  (cd "$APP_DIR" && pm2 jlist 2>/dev/null) | node -e "
    let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => {
      const i = s.indexOf('[')
      const list = i < 0 ? [] : JSON.parse(s.slice(i))
      const p = list.find((x) => x.name === process.argv[1])
      const args = p ? [].concat(p.pm2_env.args || []).join(' ') : ''
      process.stdout.write(p ? p.pm2_env.status + ' ' + p.pm2_env.restart_time + ' ' + args : '')
    })" "$1"
}

# 옛 서비스가 online 이면 기본 실행은 여기서 exit 3 으로 멈춘다(빌드·pre-flight 는 끝났다) · --activate 에서는 오류다
check_occupancy() {
  echo "+ 점유 검사 — 옛 서비스 pm2($SERVICE_NAMES) online 0 · 포트 $WEB_PORT·$MCP_PORT 는 비었거나 pleiades-$APP-* 가 잡고 있다"
  [[ $DRY -eq 1 ]] && return 0
  local name state online=""
  for name in $SERVICE_NAMES; do
    state=$(pm2_state "$name")
    [[ "${state%% *}" != online ]] || online="$online $name"
  done
  if [[ -n "$online" ]]; then
    [[ $ACTIVATE -eq 0 ]] || die "옛 서비스(${online# }) 가 아직 online 이다 — 007 T-5c ④(옛 봇 → 웹 → MCP 정지 · delete)가 먼저"
    echo
    echo "=== 빌드·pre-flight 완료 · 활성화 전 정지 (exit 3) ==="
    echo "옛 서비스(${online# }) 가 online 이다 — 새 빌드는 준비됐고 옛 서비스는 그대로 돌고 있다."
    echo "다음: 007 T-5c ④ 옛 봇 → 웹 → MCP 정지 · delete → deploy/deploy.sh $APP --activate"
    exit 3
  fi
  for pair in "web:$WEB_PORT" "mcp:$MCP_PORT"; do
    state=$(pm2_state "pleiades-$APP-${pair%%:*}")
    if [[ "${state%% *}" != online ]] && listening "${pair#*:}"; then
      die "포트 ${pair#*:} 를 pleiades-$APP-${pair%%:*} 가 아닌 프로세스가 잡고 있다 — lsof -i tcp:${pair#*:}"
    fi
  done
}

# 기동 직후 crash-loop 감지 — online 이고 몇 초 동안 restart_time 이 늘지 않아야 한다
confirm_stable() {
  local name=$1 before after
  echo "+ pm2 상태 확인 $name  # online · 5s 재시작 0"
  [[ $DRY -eq 1 ]] && return 0
  before=$(pm2_state "$name"); sleep 5; after=$(pm2_state "$name")
  [[ "${after%% *}" == online && "$before" == "$after" ]] && return 0
  (cd "$APP_DIR" && pm2 logs "$name" --lines 50 --nostream) || true
  (cd "$APP_DIR" && pm2 stop "$name") || true
  die "$name 가 안정적으로 뜨지 않았다($before → $after) — 정지했다 · $BUILT_IN_PLACE"
}

check_migrations() {
  echo "+ (apps/$DIR) npx prisma migrate status"
  if [[ $DRY -eq 1 ]]; then echo "+ (apps/$DIR) psql: public._prisma_migrations ↔ prisma/migrations 이름 대조  # 읽기 전용"; return 0; fi
  local out rc=0
  out=$(cd "$APP_DIR" && npx prisma migrate status 2>&1) || rc=$?
  echo "$out"
  # 종료 코드만 믿지 않는다 — 비0 종료 여부는 미확인(007 G-e)
  [[ $rc -eq 0 && "$out" == *"Database schema is up to date"* ]] \
    || die "마이그레이션 차이가 있다 — 이 스크립트는 적용하지 않는다(007 정정 5 · Q74). 사용자 판단"
  check_migration_names
}

# migrate status 는 DB 에만 있는 마이그레이션을 보고하지 않는다 — prisma 6.19.3 실측: DB 29 · 디렉터리 28 에서
# "up to date" · rc 0 (#180 리허설 · 007 G-e). 그래서 _prisma_migrations 이름 집합을 디렉터리와 직접 대조한다(읽기 전용).
check_migration_names() {
  echo "+ (apps/$DIR) psql: public._prisma_migrations ↔ prisma/migrations 이름 대조  # 읽기 전용"
  local db local_names only_db only_local js
  # node 가 DATABASE_URL(셸 > apps/<dir>/.env)을 libpq env 로 풀어 psql 을 직접 부른다 — 비밀번호를 명령줄에 두지 않는다(ps 노출 · #180 사전 리뷰).
  # prisma 전용 파라미터(schema 등)는 버리고 libpq 파라미터(sslmode·host 소켓 등)는 env 로 옮긴다. PGOPTIONS 는 지운다(search_path 우회 방지).
  # heredoc 을 $( ) 안에 두지 않는다 — bash 3.2 는 그 안의 괄호 섞인 본문을 잘못 파싱한다
  IFS= read -r -d '' js <<'NODE' || true
const fs = require('fs'), { spawnSync } = require('child_process')
const fail = (m, code = 1) => { console.error(m); process.exit(code) }
let v = process.env.DATABASE_URL
if (!v && fs.existsSync('.env')) v = require('dotenv').parse(fs.readFileSync('.env')).DATABASE_URL
if (!v) fail('DATABASE_URL 이 없다')
let u
try { u = new URL(v) } catch { fail('DATABASE_URL 을 URL 로 읽지 못했다 — 소켓 경로는 host= 파라미터로 둔다') }
const schema = u.searchParams.get('schema')
if (schema && schema !== 'public') fail('schema=' + schema + ' 는 지원하지 않는다')
// 상속된 libpq 변수(PGHOST·PGPORT·PGUSER·PGPASSWORD·PGSSL*·PGSERVICE·PGOPTIONS …)를 전부 지운다 — URL 에 없는 요소가
// 셸 값으로 채워지면 migrate status 와 다른 클러스터를 읽는다 (PR #181 Codex P1). 접속 정보는 URL 에서만 온다.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('PG')))
const dec = decodeURIComponent
if (u.hostname) env.PGHOST = u.hostname.replace(/^\[|\]$/g, '')
env.PGPORT = u.port || '5432' // prisma 기본값과 같게 — 비워 두면 libpq 기본(소켓 경로 포트)과 어긋날 수 있다
if (u.username) env.PGUSER = dec(u.username)
if (u.password) env.PGPASSWORD = dec(u.password)
env.PGDATABASE = dec(u.pathname.replace(/^\//, ''))
// prisma 의 URL 파라미터를 libpq env 로 옮긴다. 같은 이름이라도 뜻이 다른 것에 주의 — prisma `sslcert` 는 서버(루트) CA 이고
// 경로는 스키마 파일(prisma/) 기준이다 → PGSSLROOTCERT (PR #181 Codex P2). prisma 의 클라이언트 인증서는 PKCS12(`sslidentity`)라
// libpq 로 옮길 수 없다 → 판정 불가로 멈춘다.
const LIBPQ = { sslmode: 'PGSSLMODE', host: 'PGHOST', port: 'PGPORT', connect_timeout: 'PGCONNECT_TIMEOUT', application_name: 'PGAPPNAME' }
for (const [k, val] of u.searchParams) if (LIBPQ[k]) env[LIBPQ[k]] = val
if (u.searchParams.has('sslidentity')) fail('DATABASE_URL 의 sslidentity(PKCS12 클라이언트 인증서)는 psql 로 옮길 수 없다 — 사용자 판단')
if (u.searchParams.has('sslcert')) env.PGSSLROOTCERT = require('path').resolve('prisma', u.searchParams.get('sslcert'))
if (!env.PGHOST) fail('DATABASE_URL 에 호스트가 없다 — psql 이 어느 서버를 볼지 정할 수 없다')
if (!env.PGDATABASE) fail('DATABASE_URL 에 DB 이름이 없다')
const sql = "select migration_name || case when finished_at is null then ' (unfinished)' else '' end " +
  'from public._prisma_migrations where rolled_back_at is null order by 1'
const r = spawnSync('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env, encoding: 'utf8' })
if (r.error && r.error.code === 'ENOENT') fail('psql 이 없다 — DB 전용 마이그레이션을 판정할 수 없다(migrate status 는 그것을 보지 못한다 · #180)')
if (r.error || r.status !== 0) fail('public._prisma_migrations 를 읽지 못했다: ' + ((r.stderr || String(r.error)).trim()))
process.stdout.write(r.stdout)
NODE
  db=$(cd "$APP_DIR" && node -e "$js") || die "마이그레이션 이름을 읽지 못했다(위 메시지)"
  local_names=$(cd "$APP_DIR/prisma/migrations" && find . -mindepth 1 -maxdepth 1 -type d | sed 's#^\./##' | LC_ALL=C sort)
  db=$(printf '%s\n' "$db" | sed '/^$/d' | LC_ALL=C sort -u)
  only_db=$(LC_ALL=C comm -23 <(printf '%s\n' "$db") <(printf '%s\n' "$local_names") | sed '/^$/d')
  only_local=$(LC_ALL=C comm -13 <(printf '%s\n' "$db") <(printf '%s\n' "$local_names") | sed '/^$/d')
  if [[ -n "$only_db" || -n "$only_local" ]]; then
    [[ -z "$only_db" ]] || printf 'DB 에만:\n%s\n' "$only_db" >&2
    [[ -z "$only_local" ]] || printf '디렉터리에만:\n%s\n' "$only_local" >&2
    die "마이그레이션 이름 집합이 다르다 — 이 스크립트는 적용하지 않는다(007 정정 5 · Q74). 사용자 판단"
  fi
  echo "  마이그레이션 $(printf '%s\n' "$local_names" | sed '/^$/d' | wc -l | tr -d ' ')개 일치"
}

# 3단계는 .next · dist/bot 을 제자리에 덮는다 — 이후 중단은 MCP dist 만 옛 것이다
BUILT_IN_PLACE="웹 .next · 봇 번들은 이미 새 빌드다 — 도는 옛 웹·봇이 재기동되면 새 빌드로 뜬다. 007 §7(R-2 · R-8)로 되돌린다"

preflight_mcp() {
  echo "+ (apps/$DIR) MCP_TRANSPORT=http MCP_PORT=$PREFLIGHT_PORT node dist/mcp/server.staged.cjs  # health 20s"
  [[ $DRY -eq 1 ]] && return 0
  # 이미 응답하면 좀비다 — 정리하지 않고 멈춘다(그 응답을 새 빌드로 오인하면 안 된다)
  healthy "$PREFLIGHT_PORT" && die "pre-flight 포트 $PREFLIGHT_PORT 가 이미 응답한다 — lsof -i tcp:$PREFLIGHT_PORT 로 확인 · $BUILT_IN_PLACE"
  local log pid ok=0
  log=$(mktemp -t pleiades-preflight.XXXXXX)
  (cd "$APP_DIR" && MCP_TRANSPORT=http MCP_PORT="$PREFLIGHT_PORT" exec node dist/mcp/server.staged.cjs) >"$log" 2>&1 &
  pid=$!
  for _ in $(seq 1 20); do
    if healthy "$PREFLIGHT_PORT" && kill -0 "$pid" 2>/dev/null; then ok=1; break; fi
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  kill -TERM "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  if [[ $ok -ne 1 ]]; then
    cat "$log" >&2 || true
    rm -f "$log" "$APP_DIR/dist/mcp/server.staged.cjs"
    die "새 MCP 빌드가 pre-flight 를 통과하지 못했다 — dist/mcp/server.cjs 는 옛 것 · $BUILT_IN_PLACE"
  fi
  rm -f "$log"
}

wait_mcp() {
  echo "+ curl 127.0.0.1:$MCP_PORT/health  # 20s"
  [[ $DRY -eq 1 ]] && return 0
  for _ in $(seq 1 20); do healthy "$MCP_PORT" && return 0; sleep 1; done
  (cd "$APP_DIR" && pm2 logs "pleiades-$APP-mcp" --lines 50 --nostream) || true
  (cd "$APP_DIR" && pm2 stop "pleiades-$APP-mcp") || true  # crash-loop 차단
  die "MCP 가 $MCP_PORT 에서 응답하지 않는다 — pleiades-$APP-mcp 정지 · $BUILT_IN_PLACE"
}

# pm2 online 만으로는 어느 포트에서 듣는지 모른다 — 설정한 포트가 실제로 열렸는지 본다
wait_web() {
  echo "+ 포트 $WEB_PORT 응답 확인  # 20s"
  [[ $DRY -eq 1 ]] && return 0
  for _ in $(seq 1 20); do listening "$WEB_PORT" && return 0; sleep 1; done
  (cd "$APP_DIR" && pm2 stop "pleiades-$APP-web") || true
  die "pleiades-$APP-web 가 $WEB_PORT 에서 듣지 않는다 — 정지했다 · $BUILT_IN_PLACE"
}

# --activate 는 기본 실행이 남긴 산출물에서만 돈다 — 빌드하지 않는다
check_built() {
  local f missing=""
  echo "+ 산출물 확인 — .next/BUILD_ID · dist/bot/standalone.cjs · dist/mcp/server.staged.cjs"
  [[ $DRY -eq 1 ]] && return 0
  for f in .next/BUILD_ID dist/bot/standalone.cjs dist/mcp/server.staged.cjs; do
    [[ -s "$APP_DIR/$f" ]] || missing="$missing $f"
  done
  [[ -z "$missing" ]] || die "산출물이 없다:$missing — 같은 태그에서 deploy/deploy.sh $APP 를 먼저 끝까지(exit 3) 돌린다. 활성화 도중 실패한 뒤라면(옛 서비스는 이미 정지) 기본 실행이 exit 3 없이 활성화까지 간다"
  [[ -s "$READY" ]] || die "pre-flight 를 통과한 기본 실행의 표지($READY)가 없다 — --build-only 산출물이거나 준비 전이다. deploy/deploy.sh $APP 를 먼저 돌린다"
  [[ "$(tr -d '[:space:]' < "$READY")" == "$(git -C "$ROOT" rev-parse HEAD)" ]] \
    || die "산출물이 지금 HEAD 의 것이 아니다(표지 $(tr -d '[:space:]' < "$READY" | cut -c1-12) · HEAD $(git -C "$ROOT" rev-parse --short=12 HEAD)) — 이 태그에서 deploy/deploy.sh $APP 를 다시 돌린다"
}

# ── 단계 ──────────────────────────────────────────────────────────────
echo "pleiades deploy: $APP · $TAG · web $WEB_PORT · mcp $MCP_PORT · pre-flight $PREFLIGHT_PORT$([[ $DRY -eq 1 ]] && echo ' · DRY-RUN')$([[ $BUILD_ONLY -eq 1 ]] && echo ' · BUILD-ONLY')$([[ $ACTIVATE -eq 1 ]] && echo ' · ACTIVATE')"

if [[ $ACTIVATE -eq 1 ]]; then
  step "0. 산출물 확인 (--activate)"
  check_built
else
  echo "+ rm -f $READY  # 옛 준비 표지 — 이 실행이 pre-flight 를 통과해야 다시 생긴다"
  [[ $DRY -eq 1 ]] || rm -f "$READY"
  step "1. 의존성 (루트 → 앱)"
  at_root npm ci
  at_app npm ci
fi

if [[ $BUILD_ONLY -eq 0 ]]; then
  step "2. 마이그레이션 검사 (적용하지 않는다)"
  check_migrations
fi

if [[ $ACTIVATE -eq 0 ]]; then
step "3. 빌드"
if [[ "$APP" == fin ]]; then
  if [[ $BUILD_ONLY -eq 1 ]]; then
    echo "  (fin next build 생략 — prerender 가 서비스 DB 를 읽는다 · T-5c ③ 에서 · 007 Q84 ①)"
  else
    at_app npx --no-install next build
  fi
  at_app npm run build:mcp:staged
  at_app npm run build:bot
else
  at_app npx prisma generate
  at_app npm run build:staged
fi

if [[ $BUILD_ONLY -eq 1 ]]; then
  echo; echo "=== 빌드까지 완료 (--build-only) ==="
  exit 0
fi

step "4a. MCP pre-flight (임시 포트 — 옛 서비스와 무관)"
preflight_mcp
echo "+ git rev-parse HEAD > $READY  # 준비 표지 — exit 3 은 이 표지와 '빌드·pre-flight 완료' 안내가 함께일 때만 준비 완료다"
[[ $DRY -eq 1 ]] || git -C "$ROOT" rev-parse HEAD > "$READY"
fi

step "4b. 점유 검사 (활성화 직전)"
check_occupancy

step "4c. MCP — 활성화 → 재기동 → health"
at_app npm run build:mcp:activate
[[ $DRY -eq 1 ]] || rm -f "$READY"  # staged 를 소비했다 — 표지도 소비
at_app pm2 startOrRestart "$CONFIG" --only "pleiades-$APP-mcp" --update-env
wait_mcp
confirm_stable "pleiades-$APP-mcp"
at_app pm2 save --force  # 이후 단계가 멈춰도 새 MCP 는 resurrect 대상이다

step "5. 웹 · 봇"
# startOrRestart 는 등록된 args(-p 포트)를 유지한다 — 포트가 바뀌었으면 지우고 새로 등록한다(PR #177 Codex P2)
echo "+ (apps/$DIR) pm2 delete pleiades-$APP-web  # 등록된 args 가 'start -p $WEB_PORT' 가 아닐 때만"
if [[ $DRY -eq 0 ]]; then
  WEB_STATE=$(pm2_state "pleiades-$APP-web")
  if [[ -n "$WEB_STATE" && "${WEB_STATE#* * }" != "start -p $WEB_PORT" ]]; then
    (cd "$APP_DIR" && pm2 delete "pleiades-$APP-web")
  fi
fi
at_app pm2 startOrRestart "$CONFIG" --only "pleiades-$APP-web" --update-env
confirm_stable "pleiades-$APP-web"
wait_web
echo "+ (apps/$DIR) pm2 delete pleiades-$APP-bot  # 없으면 무시"
[[ $DRY -eq 1 ]] || (cd "$APP_DIR" && pm2 delete "pleiades-$APP-bot") || true
at_app pm2 start "$CONFIG" --only "pleiades-$APP-bot" --update-env
confirm_stable "pleiades-$APP-bot"

step "6. pm2 save (재부팅 resurrect 대비)"
at_app pm2 save --force

echo; echo "=== 완료: $APP · $TAG ==="
[[ $DRY -eq 1 ]] || (cd "$APP_DIR" && pm2 status)
