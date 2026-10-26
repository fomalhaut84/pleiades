#!/usr/bin/env bash
# release-inplace.sh — 도는 체크아웃에 새 태그를 제자리 배포하고 판정 양식만 출력한다 (#278 · 런북 docs/runbooks/release-inplace.md A~C5).
#
# 사용:  deploy/release-inplace.sh <fin|fit> <vX.Y.Z> [--yes] [--dry-run] [--retry] [--checkout DIR]
#   그 앱의 체크아웃(~/pleiades-<app>) 안의 이 스크립트를 서비스 계정으로 부른다 — 로컬(Darwin)은 --dry-run 만(I-3).
#   --yes       checkout·배포 전 확인을 묻지 않는다(Actions · #242)
#   --retry     HEAD 가 이미 <vX.Y.Z> 일 때 같은 태그로 다시 배포한다(C4·C5 실패 뒤 · 실패한 R-8 뒤)
#   --checkout  체크아웃 위치(기본 = 이 스크립트의 상위) — 체크아웃에 아직 이 스크립트가 없는 첫 배포용(런북 부트스트랩)
#   --dry-run   A(태그 대조)·C1 검사까지만 — 서비스·체크아웃은 그대로(원본 로그 파일을 만들고 새 태그를 fetch 할 뿐 · 백업 없음)
#   되돌리기(R-8)는 직전 태그로 같은 명령 — 마이그레이션 0 이면 같은 경로다.
#
# 출력: 마지막의 "판정 양식" 블록만 세션에 붙인다. 원본 로그는 저장소 밖 600 파일($PLEIADES_PRIVATE_DIR · 기본 ~/pleiades-private).
#   계정·경로·pid·로그 원문은 화면에 내지 않는다($HOME 은 ~ 로) — 실수 방지이지 비밀 차단 보증은 아니다.
# 종료 코드: 0 통과 · 1 서비스·체크아웃 그대로 중단(A·B·C1 · 빌드 전 실패는 직전 태그로 되돌린 뒤) · 2 사용법
#   · 3 deploy.sh exit 3(옛 서비스 online) · 4 빌드·재기동 뒤 실패 또는 되돌리기 실패(판정 양식의 R-8 줄)
# 창 안 오류 줄의 한계: pm2 는 쓰기 덩어리마다 시각을 붙여 여러 줄 스택의 뒷줄은 세지 않는다 · 시각은 pm2 데몬 TZ 기준
# 자기 교체: C2 의 checkout 이 이 파일을 바꾼다 — 본문을 전부 함수에 두고 마지막 줄에서 main 을 부른 뒤 곧바로 exit 한다
#   (bash 는 함수 정의를 끝까지 읽은 뒤 실행한다).

PLEIADES_KEYS='DATABASE_URL|PORT|MCP_PORT|MCP_TRANSPORT|TELEGRAM_[A-Z_]*|DISCORD_[A-Z_]*|NOTIFY_[A-Z_]*|GARMIN_[A-Z_]*|OMRON_[A-Z_]*|MFDS_[A-Z_]*|WHOOING_[A-Z_]*|CLAUDE_BIN|NODE_ENV|PLEIADES_ENV_FILE|AUTH_[A-Z_]*|NEXTAUTH_[A-Z_]*|BASE_URL|FIRECRAWL_[A-Z_]*|MYFINANCE_ROOT|MCP_CONFIG_PATH'
TAG_RE='^v[0-9]+\.[0-9]+\.[0-9]+$'
PROBE_INTERVAL=2

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
# 프로브 정리 — 정상 끝 · stop · 신호(Ctrl-C · ssh 끊김 · SIGTERM) 어디서든(#278 사전 리뷰 M1 — 비대화형 bash 의 백그라운드는 SIGINT 를 무시한다)
kill_probe() { [[ -z "${PROBE_PID:-}" ]] || kill "$PROBE_PID" 2>/dev/null || true; PROBE_PID=; }
# A 의 diff — 실패를 0 으로 세지 않는다(M3 · 편도 게이트가 열린 채 통과)
# $(…) 안에서 stop 을 부르면 양식이 변수로 빨려 든다 — 실패는 부르는 쪽에서 stop
diff_list() { git -C "$ROOT" diff --name-only "$P" "$V" -- "$@" 2>>"$LOG"; }
# 실패 뒤 복구 안내 — 같은 태그 재시도가 먼저(일시 실패) · 직전 정상 태그로 R-8 이 다음
recovery() { printf '재시도: release-inplace.sh %s %s --retry · 또는 R-8: release-inplace.sh %s %s%s' "$APP" "$V" "$APP" "$BACK" "$(r8_flag)"; }
# R-8 대상이 지금 HEAD 와 같으면(재시도 중) 그 명령에도 --retry 가 필요하다
r8_flag() { [[ "$BACK" == "$(git -C "$ROOT" describe --tags --exact-match HEAD 2>/dev/null)" ]] && printf ' --retry'; }
count_lines() { [[ -z "$1" ]] && echo 0 || printf '%s\n' "$1" | wc -l | tr -d ' '; }
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
  kill_probe
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
# 봇 409 — 재기동 뒤(T0~) 줄만 · 텔레그램 getUpdates 충돌 문구만(M4 — 아무 숫자 409·옛 줄이 R-8 을 부르지 않게)
count_409() {  # <app> <T0>
  cat "$HOME/.pm2/logs/pleiades-$1-bot-"*.log 2>/dev/null | awk -v s="$2" '
    substr($0,1,19)>=s && /409[^0-9].*([Cc]onflict|getUpdates)|terminated by other getUpdates/ { n++ }
    END { printf "%d", n }'
}
# 빌드 전 실패 — 직전 태그로 checkout 만 되돌린다(재기동 없음 · M6). 못 되돌리면 4
revert_checkout() {  # <이유>
  kill_probe
  # 재시도면 되돌릴 checkout 이 없다(이미 V) — 서비스는 앞 실패 상태 그대로다
  [[ $RETRY -eq 0 ]] || stop 4 "$1 (재시도 · 빌드 전 — 서비스는 앞 실패 상태 그대로) → $(recovery)"
  if git -C "$ROOT" checkout -q "$P" >>"$LOG" 2>&1 && [[ "$(git -C "$ROOT" describe --tags --exact-match HEAD 2>/dev/null)" == "$P" ]]; then
    stop 1 "$1 → $P 로 checkout 되돌림(빌드 전 · 재기동 없음)"
  fi
  stop 4 "$1 → 되돌리기 실패: git -C ~/pleiades-$APP checkout -q $P (빌드 전 · 재기동 불필요)"
}

main() {
  set -uo pipefail
  [[ $# -ge 2 ]] || usage
  APP=$1; V=$2; shift 2
  YES=0; DRY=0; RETRY=0; CHECKOUT=
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes) YES=1 ;;
      --dry-run) DRY=1 ;;
      --retry) RETRY=1 ;;
      --checkout) [[ $# -ge 2 ]] || usage; CHECKOUT=$2; shift ;;
      *) usage ;;
    esac
    shift
  done
  case "$APP" in fin) DIR=finance ;; fit) DIR=fitness ;; *) usage ;; esac
  [[ "$V" =~ $TAG_RE ]] || usage

  # PR #283 Codex P2: 첫 배포는 체크아웃에 이 스크립트가 없다 — 새 태그에서 꺼낸 판을 밖에서 부르고 --checkout 으로 가리킨다
  if [[ -n "$CHECKOUT" ]]; then
    ROOT=$(cd "$CHECKOUT" 2>/dev/null && pwd -P) || { echo "release-inplace.sh: --checkout $CHECKOUT 가 없다" >&2; exit 2; }
  else
    ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
  fi
  CONFIG="$ROOT/deploy/pleiades.config.cjs"
  DEPLOY_SH=$ROOT/deploy/deploy.sh
  # 테스트만 스텁으로 바꾼다 — 운영 env 에 남은 값이 배포 명령을 바꾸지 않게(#278 사전 리뷰 I7)
  [[ "${PLEIADES_TEST:-}" != 1 || -z "${PLEIADES_DEPLOY_SH:-}" ]] || DEPLOY_SH=$PLEIADES_DEPLOY_SH
  form "APP $APP   V $V"

  # ── 가드 ────────────────────────────────────────────────────────────
  [[ "$(uname -s)" != Darwin || $DRY -eq 1 ]] || stop 1 "로컬에서는 --dry-run 만(I-3)"
  # 비대화형 ssh(Actions)는 nvm PATH 를 안 읽을 수 있다 — 엉뚱한 메시지 대신 여기서(I6)
  local bin
  for bin in node pm2 curl git; do command -v "$bin" >/dev/null || stop 1 "$bin 이 PATH 에 없다(비대화형 셸이면 프로필·nvm)"; done
  [[ "$(node -p "require('$ROOT/package.json').name" 2>/dev/null)" == pleiades ]] || stop 1 "pleiades 체크아웃이 아니다"
  PRIVATE=${PLEIADES_PRIVATE_DIR:-$HOME/pleiades-private}
  # 체크아웃 안이면 만들기 전에 거부한다 — 만들고 거부하면 체크아웃이 dirty 가 되어 다음 실행이 A 에서 막힌다(I5)
  local parent
  parent=$(cd "$(dirname "$PRIVATE")" 2>/dev/null && pwd -P) || stop 1 "원본 위치의 상위 디렉터리가 없다"
  case "$parent/$(basename "$PRIVATE")/" in "$ROOT"/*) stop 1 "원본 위치가 체크아웃 안이다(git 에 섞인다)" ;; esac
  (umask 077; mkdir -p "$PRIVATE" 2>/dev/null && chmod 700 "$PRIVATE") || stop 1 "원본 위치를 만들 수 없다"
  LOG="$PRIVATE/inplace-$APP-$(date +%Y%m%d-%H%M%S).log"
  (umask 077; : > "$LOG") || stop 1 "원본 파일을 만들 수 없다"

  # ── A. 태그 대조 ────────────────────────────────────────────────────
  P=$(git -C "$ROOT" describe --tags --exact-match HEAD 2>/dev/null) || stop 1 "A — HEAD 가 태그가 아니다(직전 배포 상태가 아니다)"
  [[ "$P" =~ $TAG_RE ]] || stop 1 "A — HEAD 태그 $P 가 vX.Y.Z 가 아니다"
  [[ -z "$(git -C "$ROOT" status --porcelain)" ]] || stop 1 "A — 체크아웃이 깨끗하지 않다(git status)"
  # PR #283 Codex P2: C4·C5 실패 뒤 HEAD 는 이미 V 다 — 배포 완료와 checkout 만 된 상태를 가른다(--retry)
  LAST_OK_FILE="$PRIVATE/inplace-$APP-last-ok"
  LAST_OK=$(cat "$LAST_OK_FILE" 2>/dev/null || true)
  if [[ "$P" == "$V" ]]; then
    [[ $RETRY -eq 1 ]] || stop 1 "A — HEAD 가 이미 $V 다(앞 배포가 실패했으면 --retry · 마지막 통과 ${LAST_OK:-기록 없음})"
    form "   재시도 — HEAD 이미 $V · 마지막 통과 ${LAST_OK:-기록 없음}"
  else
    [[ $RETRY -eq 0 ]] || stop 1 "A — --retry 는 HEAD 가 이미 $V 일 때만"
    form "   P $P → V $V"
  fi
  # R-8 은 "직전에 정상이던 태그" — 재시도면 P 가 곧 V 라 마지막 통과 기록을 쓴다
  if [[ $RETRY -eq 1 ]]; then BACK=${LAST_OK:-<마지막 정상 태그>}; else BACK=$P; fi
  if ! git -C "$ROOT" rev-parse -q --verify "refs/tags/$V" >/dev/null; then
    git -C "$ROOT" fetch -q --no-tags origin tag "$V" >>"$LOG" 2>&1 || stop 1 "A — 태그 $V 를 받지 못했다"
  fi
  local mig mcp srv lock files out
  # 경로는 앱마다 직접 쓴다 — 'apps/*/prisma/migrations' 같은 와일드카드 pathspec 은 디렉터리 접두로 맞지 않아
  # 늘 0 이었다(런북 A 의 명령 · #278 테스트가 잡았다 · 실측 0 ↔ 68). diff 실패는 0 이 아니라 중단(M3)
  out=$(diff_list apps/finance/prisma/migrations apps/fitness/prisma/migrations) || stop 1 "A — git diff 실패"; mig=$(count_lines "$out")
  out=$(diff_list apps/finance/src/lib/ai/mcp-config.json) || stop 1 "A — git diff 실패"; mcp=$(count_lines "$out")
  out=$(diff_list deploy/ apps/finance/.env.example apps/fitness/.env.example) || stop 1 "A — git diff 실패"; srv=$(count_lines "$out")
  out=$(diff_list package-lock.json apps/finance/package-lock.json apps/fitness/package-lock.json) || stop 1 "A — git diff 실패"; lock=$(printf '%s' "$out" | tr '\n' ' ')
  out=$(diff_list apps packages deploy package.json) || stop 1 "A — git diff 실패"; files=$(count_lines "$out")
  form "A  마이그레이션 $mig · mcp-config 변경 $mcp · deploy/·.env.example 변경 $srv · lock ${lock:-없음}· 규모 ${files}파일"
  [[ "$mig" == 0 ]] || stop 1 "A — 마이그레이션이 든 태그다(Q74 · 편도 · 이 경로 아님)"
  [[ "$mcp" == 0 ]] || stop 1 "A — mcp-config.json 이 바뀌었다(007 Q83 (ii))"

  # ── B. 기록 ──────────────────────────────────────────────────────────
  local backup=${PLEIADES_BACKUP_DIR:-/backup/pleiades-cutover}/inplace-$APP-$(date +%Y%m%d-%H%M%S)
  if [[ $DRY -eq 1 ]]; then
    form "B  (dry-run) dump.pm2 사본 생략"
  else
    (umask 077; mkdir -p "$backup" && cp "$HOME/.pm2/dump.pm2" "$backup/dump.pm2") 2>>"$LOG" || stop 1 "B — dump.pm2 사본 실패"
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
  # 있는 것은 전부 이 체크아웃 안이어야 한다 — 3 개를 요구하면 deploy.sh 가 봇을 delete 한 뒤 실패한 상태에서 R-8 이 막힌다(M5)
  [[ "${procs[0]:-0}" -ge 1 && "${procs[2]:-0}" == "${procs[0]:-0}" ]] \
    || stop 1 "C1 — pleiades-$APP 프로세스가 이 체크아웃에서 돌고 있지 않다(다른 체크아웃? · 있음 ${procs[0]:-0} · 이 안 ${procs[2]:-0})"
  [[ "${procs[0]}" == 3 ]] || form "   (주의) pleiades-$APP 프로세스 ${procs[0]}/3 — 직전 배포가 중간에 멈춘 상태로 보인다(R-8 이면 정상)"

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

  # 첫 배포(기록 없음)면 checkout 전에 직전 태그를 R-8 대상으로 남긴다 — C1 이 P 가 이 체크아웃에서 돌고 있음을 확인했다.
  # 없으면 첫 배포가 실패하고 --retry 도 실패할 때 R-8 안내가 "<마지막 정상 태그>" 가 된다(PR #286 Codex P2)
  if [[ $RETRY -eq 0 && -z "$LAST_OK" ]]; then
    (umask 077; printf '%s\n' "$P" > "$LAST_OK_FILE") 2>>"$LOG" || stop 1 "C2 전 — R-8 대상 기록 실패"
    LAST_OK=$P
  fi

  # ── C2. checkout ────────────────────────────────────────────────────
  [[ $RETRY -eq 1 ]] || git -C "$ROOT" checkout -q "$V" >>"$LOG" 2>&1 || revert_checkout "C2 — checkout 실패"
  local now_tag
  now_tag=$(git -C "$ROOT" describe --tags --exact-match HEAD 2>/dev/null)
  [[ "$now_tag" == "$V" && -z "$(git -C "$ROOT" status --porcelain)" ]] || revert_checkout "C2 — checkout 뒤 $V · 깨끗이 아니다"
  form "C2 $V · 깨끗: 예"
  # C5 는 새 태그의 포트로 본다 — 포트를 바꾼 릴리즈면 프로브(옛 포트)와 다르다(사전 리뷰 I11)
  local new_ports new_mcp_port
  new_ports=$(cd "$ROOT/apps/$DIR" && node -e "
    const apps = require('$CONFIG').apps
    const by = (r) => apps.find((a) => a.name === 'pleiades-$APP-' + r).env
    process.stdout.write(by('web').PORT + ' ' + by('mcp').MCP_PORT)" 2>>"$LOG") || revert_checkout "C2 — 새 태그의 포트를 읽지 못했다"
  read -r _ new_mcp_port <<<"$new_ports"

  # ── C3. 프로브 ──────────────────────────────────────────────────────
  local probe="$PRIVATE/inplace-$APP-probe-$(date +%Y%m%d-%H%M%S).log"
  (umask 077; : > "$probe")   # 리다이렉션은 subshell 의 umask 보다 먼저라 파일을 먼저 만든다(I2)
  trap kill_probe EXIT
  trap 'exit 130' INT TERM HUP
  ( while :; do
      printf '%s %s\n' "$(date +%T)" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$web_port/")"
      sleep "$PROBE_INTERVAL"
    done ) >> "$probe" 2>&1 &
  PROBE_PID=$!

  # ── C4. 기본 실행 ───────────────────────────────────────────────────
  local plan_rc rc t0 t1 secs
  (cd "$ROOT" && bash "$DEPLOY_SH" "$APP" --dry-run) >>"$LOG" 2>&1; plan_rc=$?
  [[ $plan_rc -eq 0 ]] || revert_checkout "C4 — deploy.sh --dry-run rc $plan_rc"
  # 기본 실행의 출력만 본다 — deploy.sh --dry-run 도 완료 줄을 찍어 같은 로그에서 찾으면 늘 참이다(M2)
  local run_log="$LOG.run"
  (umask 077; : > "$run_log")
  t0=$(date '+%F %T'); SECONDS=0
  (cd "$ROOT" && bash "$DEPLOY_SH" "$APP") >"$run_log" 2>&1; rc=$?
  secs=$SECONDS; t1=$(date '+%F %T')
  cat "$run_log" >> "$LOG"
  local done_line=예
  grep -q "=== 완료: $APP · $V ===" "$run_log" || done_line=아니오
  form "C4 plan rc $plan_rc · 기본 실행 rc $rc · ${secs}s · 완료 안내: $done_line"
  if [[ $rc -ne 0 ]]; then
    local why
    why=$(grep -E '^deploy\.sh: 중단 — ' "$run_log" | tail -1)   # 한 줄 — 자르지 않는다(바이트 자르기는 한글을 깬다 · I8)
    [[ $rc -eq 3 ]] && stop 3 "C4 — exit 3: 옛 서비스가 online 이다(있으면 안 된다)"
    stop 4 "C4 — ${why:-deploy.sh rc $rc} → $(recovery)"
  fi

  # ── C5. 확인 ────────────────────────────────────────────────────────
  local probe_pid=$PROBE_PID
  kill_probe; wait "$probe_pid" 2>/dev/null
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
  mcp_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${new_mcp_port:-$mcp_port}/health")
  conflict=$(count_409 "$APP" "$t0")
  read -r -a procs <<<"$(app_procs)"
  same=$(env_same); n_same=$(grep -c ' same$' <<<"$same"); n_bad=$(grep -cvE ' same$|^$' <<<"$same")
  form "   online ${procs[1]:-0}/3 · mcp $mcp_code · 409 $conflict · 재기동 same $n_same · DIFF/MISSING $n_bad"
  form "   사람 확인: 웹 화면 · 텔레그램 $([[ $APP == fin ]] && echo '현황' || echo '/today') — 예/아니오 를 덧붙인다"
  [[ "${procs[1]:-0}" == 3 && "$mcp_code" == 200 && "$conflict" == 0 && "$n_bad" == 0 ]] \
    || stop 4 "C5 — 확인 실패(위 줄) → $(recovery)"
  (umask 077; printf '%s\n' "$V" > "$LAST_OK_FILE") 2>>"$LOG" || true
  emit_form "통과"
}

[[ "${BASH_SOURCE[0]}" != "$0" ]] || { main "$@"; exit $?; }
