#!/usr/bin/env bash
# deploy.sh — pleiades 체크아웃에서 앱 하나를 빌드·기동한다 (007 §4-1 D-a · T-1b · #176).
#
# 사용:  deploy/deploy.sh <fin|fit> [--build-only] [--allow-untagged] [--dry-run]
#   서버에서 사용자가 먼저 fetch · checkout <vX.Y.Z> 를 하고 이 스크립트를 부른다 — 스크립트는 git 을 바꾸지 않는다.
#   --build-only      T-4 서버 리허설(서비스 DB 없음) — 의존성 · 빌드만. 마이그레이션 검사·pm2 없음 · fin next build 없음
#   --allow-untagged  HEAD 가 vX.Y.Z 태그가 아니어도 진행(리허설)
#   --dry-run         가드만 돌리고 실행할 단계를 출력한다 — 로컬(Darwin)에서 허용되는 유일한 모드(I-3)
# 포트: apps/<dir>/.env(또는 셸)의 PORT · MCP_PORT — deploy/pleiades.config.cjs 가 읽고 없으면 거부한다.
#       pre-flight 임시 포트는 PLEIADES_PREFLIGHT_PORT(기본 fin 4299 · fit 4399 — 서비스와 같다).
#
# 서비스 deploy.sh 와 다른 점(007 §4-1 표):
#   - git 조작·작업트리 정리 없음 — 정리 명령은 P-2 상태 심링크를 지운다(4-2 정정 1)
#   - 루트 npm ci 가 첫 단계 — prepare 가 packages/notify/dist 를 만든다(⑭). 실패 = 배포 실패
#   - 마이그레이션은 적용하지 않고 status 로 검사만 한다 — 대기·DB 전용 마이그레이션이 있으면 중단(정정 5 · Q74)
#   - 기동 전 점유 검사 — 옛 서비스 pm2 가 online 이거나 포트를 다른 프로세스가 잡고 있으면 빌드 전에 멈춘다.
#     같은 포트라 옛 프로세스가 health 에 대신 응답한다(정정 4 의 거울상 · #176 사전 리뷰)
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
BUILD_ONLY=0; ALLOW_UNTAGGED=0; DRY=0
for arg in "$@"; do
  case "$arg" in
    --build-only) BUILD_ONLY=1 ;;
    --allow-untagged) ALLOW_UNTAGGED=1 ;;
    --dry-run) DRY=1 ;;
    *) die "모르는 인자 $arg" ;;
  esac
done

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
APP_DIR="$ROOT/apps/$DIR"
CONFIG="$ROOT/deploy/pleiades.config.cjs"

# ── 가드 ──────────────────────────────────────────────────────────────
[[ "$(uname -s)" != Darwin || $DRY -eq 1 ]] || die "로컬에서는 --dry-run 만 — 로컬 pm2·빌드는 tools/local/run.sh 경유(I-3 · #171)"
[[ "$(node -p "require('$ROOT/package.json').name" 2>/dev/null)" == pleiades ]] || die "$ROOT 는 pleiades 체크아웃이 아니다"
[[ -d "$APP_DIR" ]] || die "apps/$DIR 가 없다"

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
listening() { curl -s -o /dev/null --max-time 3 "http://127.0.0.1:$1/" 2>/dev/null; }  # 연결만 되면 0 (응답 코드 무관)

# pm2 jlist 에서 이름별 "<status> <restart_time>" — 없으면 빈 줄
pm2_state() {
  (cd "$APP_DIR" && pm2 jlist 2>/dev/null) | node -e "
    let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => {
      const i = s.indexOf('[')
      const list = i < 0 ? [] : JSON.parse(s.slice(i))
      const p = list.find((x) => x.name === process.argv[1])
      process.stdout.write(p ? p.pm2_env.status + ' ' + p.pm2_env.restart_time : '')
    })" "$1"
}

check_occupancy() {
  echo "+ 점유 검사 — 옛 서비스 pm2($SERVICE_NAMES) online 0 · 포트 $WEB_PORT·$MCP_PORT 는 비었거나 pleiades-$APP-* 가 잡고 있다"
  [[ $DRY -eq 1 ]] && return 0
  local name state
  for name in $SERVICE_NAMES; do
    state=$(pm2_state "$name")
    [[ "${state%% *}" != online ]] || die "옛 서비스 $name 가 online 이다 — 007 T-5c ④(옛 봇 → 웹 → MCP 정지 · delete)가 먼저"
  done
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
  [[ $DRY -eq 1 ]] && return 0
  local out rc=0
  out=$(cd "$APP_DIR" && npx prisma migrate status 2>&1) || rc=$?
  echo "$out"
  # 종료 코드만 믿지 않는다 — 비0 종료 여부는 미확인(007 G-e)
  [[ $rc -eq 0 && "$out" == *"Database schema is up to date"* ]] \
    || die "마이그레이션 차이가 있다 — 이 스크립트는 적용하지 않는다(007 정정 5 · Q74). 사용자 판단"
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

# ── 단계 ──────────────────────────────────────────────────────────────
echo "pleiades deploy: $APP · $TAG · web $WEB_PORT · mcp $MCP_PORT · pre-flight $PREFLIGHT_PORT$([[ $DRY -eq 1 ]] && echo ' · DRY-RUN')$([[ $BUILD_ONLY -eq 1 ]] && echo ' · BUILD-ONLY')"

if [[ $BUILD_ONLY -eq 0 ]]; then
  step "0. 점유 검사 (빌드 전)"
  check_occupancy
fi

step "1. 의존성 (루트 → 앱)"
at_root npm ci
at_app npm ci

if [[ $BUILD_ONLY -eq 0 ]]; then
  step "2. 마이그레이션 검사 (적용하지 않는다)"
  check_migrations
fi

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

step "4. MCP — pre-flight → 활성화 → 재기동 → health"
preflight_mcp
at_app npm run build:mcp:activate
at_app pm2 startOrRestart "$CONFIG" --only "pleiades-$APP-mcp" --update-env
wait_mcp
confirm_stable "pleiades-$APP-mcp"
at_app pm2 save --force  # 이후 단계가 멈춰도 새 MCP 는 resurrect 대상이다

step "5. 웹 · 봇"
at_app pm2 startOrRestart "$CONFIG" --only "pleiades-$APP-web" --update-env
confirm_stable "pleiades-$APP-web"
echo "+ (apps/$DIR) pm2 delete pleiades-$APP-bot  # 없으면 무시"
[[ $DRY -eq 1 ]] || (cd "$APP_DIR" && pm2 delete "pleiades-$APP-bot") || true
at_app pm2 start "$CONFIG" --only "pleiades-$APP-bot" --update-env
confirm_stable "pleiades-$APP-bot"

step "6. pm2 save (재부팅 resurrect 대비)"
at_app pm2 save --force

echo; echo "=== 완료: $APP · $TAG ==="
[[ $DRY -eq 1 ]] || (cd "$APP_DIR" && pm2 status)
