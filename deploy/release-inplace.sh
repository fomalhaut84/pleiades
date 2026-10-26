#!/usr/bin/env bash
# release-inplace.sh — 도는 체크아웃에 새 태그를 제자리 배포하고 판정 양식만 출력한다 (#278 · 런북 docs/runbooks/release-inplace.md A~C5).
#
# 사용:  deploy/release-inplace.sh <fin|fit> <vX.Y.Z> [--yes] [--dry-run]
#   그 앱의 체크아웃(~/pleiades-<app>) 안의 이 스크립트를 서비스 계정으로 부른다 — 로컬(Darwin)은 --dry-run 만(I-3).
#   --yes       checkout·배포 전 확인을 묻지 않는다(Actions · #242)
#   --dry-run   A(태그 대조)·B·C1 검사까지만 돌리고 바꾸지 않는다 — 배포 단계는 계획만 출력
#   되돌리기(R-8)는 직전 태그로 같은 명령 — 마이그레이션 0 이면 같은 경로다.
#
# 출력: 마지막의 "판정 양식" 블록만 세션에 붙인다. 원본 로그는 저장소 밖 600 파일($PLEIADES_PRIVATE_DIR · 기본 ~/pleiades-private).
#   계정·경로·pid·로그 원문은 화면에 내지 않는다($HOME 은 ~ 로) — 실수 방지이지 비밀 차단 보증은 아니다.
# 종료 코드: 0 통과 · 1 바꾸기 전 중단(A·B·C1 — 아무것도 바뀌지 않았다) · 2 사용법 · 3 deploy.sh exit 3(옛 서비스 online)
#   · 4 checkout 뒤 실패(C2~C5 — 판정 양식의 단계를 보고 R-8)
# 자기 교체: C2 의 checkout 이 이 파일을 바꾼다 — 본문을 전부 함수에 두고 마지막 줄에서 main 을 부른 뒤 곧바로 exit 한다
#   (bash 는 함수 정의를 끝까지 읽은 뒤 실행한다).

PLEIADES_KEYS='DATABASE_URL|PORT|MCP_PORT|MCP_TRANSPORT|TELEGRAM_[A-Z_]*|DISCORD_[A-Z_]*|NOTIFY_[A-Z_]*|GARMIN_[A-Z_]*|OMRON_[A-Z_]*|MFDS_[A-Z_]*|WHOOING_[A-Z_]*|CLAUDE_BIN|NODE_ENV|PLEIADES_ENV_FILE|AUTH_[A-Z_]*|NEXTAUTH_[A-Z_]*|BASE_URL|FIRECRAWL_[A-Z_]*|MYFINANCE_ROOT|MCP_CONFIG_PATH'
TAG_RE='^v[0-9]+\.[0-9]+\.[0-9]+$'
PROBE_INTERVAL=2

usage() { sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
# $HOME 과 다른 계정 홈(/home/<계정> · /Users/<계정>)을 ~ 로 — deploy.sh 중단 문구에 경로가 실린다
redact() { sed -E "s#$HOME#~#g; s#/(home|Users)/[^/[:space:]]+#~#g"; }

# 판정 양식 줄 — 단계마다 쌓고 끝(또는 중단)에 한 번에 낸다
FORM=()
form() { FORM+=("$*"); }
emit_form() {
  local result=$1
  echo
  echo "=== 판정 양식 (이 블록만 세션에 붙인다) ==="
  printf '%s\n' "${FORM[@]}"
  echo "결과: $result"
  [[ -z "${LOG:-}" ]] || echo "원본: $(printf '%s' "$LOG" | redact) (세션에 붙이지 않는다)"
  echo "=== 끝 ==="
}
# 중단 — 이유 한 줄을 양식에 싣고 코드로 끝낸다
stop() {
  local code=$1; shift
  [[ -z "${PROBE_PID:-}" ]] || kill "$PROBE_PID" 2>/dev/null || true
  emit_form "중단 — $(printf '%s' "$*" | redact)"
  exit "$code"
}
log() { [[ -z "${LOG:-}" ]] || printf '%s\n' "$*" >> "$LOG"; }
say() { echo "· $*"; log "· $*"; }

# pm2 jlist 앞에는 "[PM2][WARN] …" 줄이 붙을 수 있다 — 첫 "[" 가 아니라 "[{" 또는 빈 목록에서 JSON 을 연다(#278)
JSON_OF='const jsonOf = (s) => { const i = s.indexOf("[{"); return i >= 0 ? s.slice(i) : s.slice(s.lastIndexOf("[]")) }'

# 도는 pleiades-* 프로세스마다 PLEIADES_ENV_FILE 이 이 셸 값과 같은지 — 값은 내지 않는다(런북 C1 · C5)
env_same() {
  pm2 jlist 2>/dev/null | node -e "$JSON_OF"'
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let list; try { list = JSON.parse(jsonOf(s)) } catch { console.log("PARSE_FAIL"); return }
      for (const p of list.filter((x) => x.name.startsWith("pleiades-"))) {
        const v = p.pm2_env.PLEIADES_ENV_FILE ?? (p.pm2_env.env || {}).PLEIADES_ENV_FILE
        console.log(p.name, v === undefined ? "MISSING" : v === process.env.PLEIADES_ENV_FILE ? "same" : "DIFF")
      }
    })'
}
# 앱 프로세스 3개의 상태 · 그 cwd 가 이 체크아웃 안인지 — pid·경로는 내지 않는다
app_procs() {
  pm2 jlist 2>/dev/null | ROOT="$ROOT" APP="$APP" node -e "$JSON_OF"'
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let list; try { list = JSON.parse(jsonOf(s)) } catch { console.log("PARSE_FAIL"); return }
      const mine = list.filter((x) => x.name.startsWith(`pleiades-${process.env.APP}-`))
      const online = mine.filter((p) => p.pm2_env.status === "online").length
      const inside = mine.filter((p) => String(p.pm2_env.pm_cwd || "").startsWith(process.env.ROOT + "/")).length
      console.log(mine.length, online, inside)
    })'
}
count_window() {  # <glob 접두> <T0> <T1> — 창 안 줄 수 · 그중 경고(⚠ · Warning) 수
  cat "$1"*.log 2>/dev/null | awk -v s="$2" -v e="$3" '
    substr($0,1,19)>=s && substr($0,1,19)<=e { n++; if ($0 ~ /⚠|[Ww]arning/) w++ }
    END { printf "%d %d", n, w }'
}

main() {
  set -uo pipefail
  [[ $# -ge 2 ]] || usage
  APP=$1; V=$2; shift 2
  YES=0; DRY=0
  for arg in "$@"; do
    case "$arg" in
      --yes) YES=1 ;;
      --dry-run) DRY=1 ;;
      *) usage ;;
    esac
  done
  case "$APP" in fin) DIR=finance ;; fit) DIR=fitness ;; *) usage ;; esac
  [[ "$V" =~ $TAG_RE ]] || usage

  ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
  CONFIG="$ROOT/deploy/pleiades.config.cjs"
  DEPLOY_SH=${PLEIADES_DEPLOY_SH:-$ROOT/deploy/deploy.sh}   # 테스트가 스텁으로 바꾼다
  form "APP $APP   V $V"

  # ── 가드 ────────────────────────────────────────────────────────────
  [[ "$(uname -s)" != Darwin || $DRY -eq 1 ]] || stop 1 "로컬에서는 --dry-run 만(I-3)"
  [[ "$(node -p "require('$ROOT/package.json').name" 2>/dev/null)" == pleiades ]] || stop 1 "pleiades 체크아웃이 아니다"
  PRIVATE=${PLEIADES_PRIVATE_DIR:-$HOME/pleiades-private}
  (umask 077; mkdir -p "$PRIVATE") || stop 1 "원본 위치를 만들 수 없다"
  case "$(cd "$PRIVATE" && pwd -P)/" in "$ROOT"/*) stop 1 "원본 위치가 체크아웃 안이다(git 에 섞인다)" ;; esac
  LOG="$PRIVATE/inplace-$APP-$(date +%Y%m%d-%H%M%S).log"
  (umask 077; : > "$LOG") || stop 1 "원본 파일을 만들 수 없다"

  # ── A. 태그 대조 ────────────────────────────────────────────────────
  P=$(git -C "$ROOT" describe --tags --exact-match HEAD 2>/dev/null) || stop 1 "A — HEAD 가 태그가 아니다(직전 배포 상태가 아니다)"
  [[ "$P" =~ $TAG_RE ]] || stop 1 "A — HEAD 태그 $P 가 vX.Y.Z 가 아니다"
  [[ -z "$(git -C "$ROOT" status --porcelain)" ]] || stop 1 "A — 체크아웃이 깨끗하지 않다(git status)"
  [[ "$P" != "$V" ]] || stop 1 "A — 이미 $V 다"
  form "   P $P → V $V"
  if ! git -C "$ROOT" rev-parse -q --verify "refs/tags/$V" >/dev/null; then
    git -C "$ROOT" fetch -q --no-tags origin tag "$V" >>"$LOG" 2>&1 || stop 1 "A — 태그 $V 를 받지 못했다"
  fi
  local mig mcp srv lock files
  # 경로는 앱마다 직접 쓴다 — 'apps/*/prisma/migrations' 같은 와일드카드 pathspec 은 디렉터리 접두로 맞지 않아
  # 늘 0 이었다(런북 A 의 명령 · #278 테스트가 잡았다 · 실측 0 ↔ 68)
  mig=$(git -C "$ROOT" diff --name-only "$P" "$V" -- apps/finance/prisma/migrations apps/fitness/prisma/migrations | wc -l | tr -d ' ')
  mcp=$(git -C "$ROOT" diff --name-only "$P" "$V" -- apps/finance/src/lib/ai/mcp-config.json | wc -l | tr -d ' ')
  srv=$(git -C "$ROOT" diff --name-only "$P" "$V" -- deploy/ apps/finance/.env.example apps/fitness/.env.example | wc -l | tr -d ' ')
  lock=$(git -C "$ROOT" diff --name-only "$P" "$V" -- package-lock.json apps/finance/package-lock.json apps/fitness/package-lock.json | tr '\n' ' ')
  files=$(git -C "$ROOT" diff --name-only "$P" "$V" -- apps packages deploy package.json | wc -l | tr -d ' ')
  form "A  마이그레이션 $mig · mcp-config 변경 $mcp · deploy/·.env.example 변경 $srv · lock ${lock:-없음}· 규모 ${files}파일"
  [[ "$mig" == 0 ]] || stop 1 "A — 마이그레이션이 든 태그다(Q74 · 편도 · 이 경로 아님)"
  [[ "$mcp" == 0 ]] || stop 1 "A — mcp-config.json 이 바뀌었다(007 Q83 (ii))"

  # ── B. 기록 ──────────────────────────────────────────────────────────
  local backup=${PLEIADES_BACKUP_DIR:-/backup/pleiades-cutover}/inplace-$APP-$(date +%Y%m%d-%H%M%S)
  if [[ $DRY -eq 1 ]]; then
    form "B  (dry-run) dump.pm2 사본 생략"
  else
    (umask 077; mkdir -p "$backup" && cp "$HOME/.pm2/dump.pm2" "$backup/dump.pm2") || stop 1 "B — dump.pm2 사본 실패"
    form "B  직전 태그 · 깨끗 · dump 사본: 예"
  fi

  # ── C1. 셸 env ──────────────────────────────────────────────────────
  local k
  for k in $(env | grep -oE "^($PLEIADES_KEYS)=" | tr -d =); do unset "$k"; done
  export PLEIADES_ENV_FILE="$HOME/pleiades-platform.env"
  local left perm same
  left=$(env | grep -E "^($PLEIADES_KEYS)=" | grep -vc '^PLEIADES_ENV_FILE=')
  perm=$(stat -c '%a' "$PLEIADES_ENV_FILE" 2>/dev/null || stat -f '%Lp' "$PLEIADES_ENV_FILE" 2>/dev/null || echo 없음)
  same=$(env_same)
  local n_same n_bad
  n_same=$(grep -c ' same$' <<<"$same")
  n_bad=$(grep -cvE ' same$|^$' <<<"$same")
  form "C1 셸 키 $left · platform $perm · 도는 pleiades-* same $n_same · DIFF/MISSING $n_bad"
  [[ "$perm" == 600 ]] || stop 1 "C1 — 플랫폼 설정 권한이 600 이 아니다"
  [[ "$n_bad" == 0 && "$n_same" -gt 0 ]] || stop 1 "C1 — 도는 프로세스의 PLEIADES_ENV_FILE 이 이 셸과 다르다"
  local procs
  read -r -a procs <<<"$(app_procs)"
  [[ "${procs[0]:-0}" == 3 && "${procs[2]:-0}" == 3 ]] || stop 1 "C1 — pleiades-$APP 3 개가 이 체크아웃에서 돌고 있지 않다(다른 체크아웃?)"

  local ports web_port mcp_port
  ports=$(cd "$ROOT/apps/$DIR" && node -e "
    const apps = require('$CONFIG').apps
    const by = (r) => apps.find((a) => a.name === 'pleiades-$APP-' + r).env
    process.stdout.write(by('web').PORT + ' ' + by('mcp').MCP_PORT)" 2>>"$LOG") || stop 1 "C1 — 포트를 읽지 못했다"
  read -r web_port mcp_port <<<"$ports"

  if [[ $DRY -eq 1 ]]; then
    form "C2~C5 (dry-run) checkout $V → deploy.sh $APP → 확인 — 하지 않았다"
    emit_form "dry-run — 바꾸지 않았다"
    return 0
  fi
  if [[ $YES -eq 0 ]]; then
    printf '%s' "$APP 를 $P → $V 로 배포한다. 계속? [y/N] " >&2
    local ans; read -r ans
    [[ "$ans" == y || "$ans" == Y ]] || stop 1 "사용자 취소 — 바꾸지 않았다"
  fi

  # ── C2. checkout ────────────────────────────────────────────────────
  git -C "$ROOT" checkout -q "$V" >>"$LOG" 2>&1 || stop 4 "C2 — checkout 실패"
  local now_tag
  now_tag=$(git -C "$ROOT" describe --tags --exact-match HEAD 2>/dev/null)
  [[ "$now_tag" == "$V" && -z "$(git -C "$ROOT" status --porcelain)" ]] || stop 4 "C2 — checkout 뒤 $V · 깨끗이 아니다"
  form "C2 $V · 깨끗: 예"

  # ── C3. 프로브 ──────────────────────────────────────────────────────
  local probe="$PRIVATE/inplace-$APP-probe-$(date +%Y%m%d-%H%M%S).log"
  ( umask 077; while :; do
      printf '%s %s\n' "$(date +%T)" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$web_port/")"
      sleep "$PROBE_INTERVAL"
    done ) > "$probe" 2>&1 &
  PROBE_PID=$!

  # ── C4. 기본 실행 ───────────────────────────────────────────────────
  local plan_rc rc t0 t1 secs
  (cd "$ROOT" && bash "$DEPLOY_SH" "$APP" --dry-run) >>"$LOG" 2>&1; plan_rc=$?
  [[ $plan_rc -eq 0 ]] || stop 4 "C4 — deploy.sh --dry-run rc $plan_rc"
  t0=$(date '+%F %T'); SECONDS=0
  (cd "$ROOT" && bash "$DEPLOY_SH" "$APP") >>"$LOG" 2>&1; rc=$?
  secs=$SECONDS; t1=$(date '+%F %T')
  local done_line=예
  grep -q "=== 완료: $APP · $V ===" "$LOG" || done_line=아니오
  form "C4 plan rc $plan_rc · 기본 실행 rc $rc · ${secs}s · 완료 안내: $done_line"
  if [[ $rc -ne 0 ]]; then
    local why
    why=$(grep -E '^deploy\.sh: 중단 — ' "$LOG" | tail -1 | cut -c1-160)
    [[ $rc -eq 3 ]] && stop 3 "C4 — exit 3: 옛 서비스가 online 이다(있으면 안 된다)"
    stop 4 "C4 — ${why:-deploy.sh rc $rc} → R-8: deploy/release-inplace.sh $APP $P"
  fi

  # ── C5. 확인 ────────────────────────────────────────────────────────
  kill "$PROBE_PID" 2>/dev/null; wait "$PROBE_PID" 2>/dev/null; PROBE_PID=
  local bad first last
  bad=$(awk '$2 !~ /^[23]/' "$probe" | wc -l | tr -d ' ')
  first=$(awk '$2 !~ /^[23]/ {print $1; exit}' "$probe"); last=$(awk '$2 !~ /^[23]/ {l=$1} END {print l}' "$probe")
  local r lines=""
  for r in web bot mcp; do
    local nw
    read -r -a nw <<<"$(count_window "$HOME/.pm2/logs/pleiades-$APP-$r-error" "$t0" "$t1")"
    lines+=" $r ${nw[0]}(경고 ${nw[1]})"
  done
  form "C5 프로브 오류 응답 $bad${first:+ ($first~$last)} · 창 안 오류 줄$lines"
  local mcp_code conflict
  mcp_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$mcp_port/health")
  conflict=$(pm2 logs "pleiades-$APP-bot" --lines 60 --nostream 2>&1 | grep -ciE '409|conflict')
  read -r -a procs <<<"$(app_procs)"
  same=$(env_same); n_same=$(grep -c ' same$' <<<"$same"); n_bad=$(grep -cvE ' same$|^$' <<<"$same")
  form "   online ${procs[1]:-0}/3 · mcp $mcp_code · 409 $conflict · 재기동 same $n_same · DIFF/MISSING $n_bad"
  form "   사람 확인: 웹 화면 · 텔레그램 $([[ $APP == fin ]] && echo '현황' || echo '/today') — 예/아니오 를 덧붙인다"
  [[ "${procs[1]:-0}" == 3 && "$mcp_code" == 200 && "$conflict" == 0 && "$n_bad" == 0 ]] \
    || stop 4 "C5 — 확인 실패(위 줄) → R-8: deploy/release-inplace.sh $APP $P"
  emit_form "통과"
}

[[ "${BASH_SOURCE[0]}" != "$0" ]] || { main "$@"; exit $?; }
