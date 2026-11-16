#!/usr/bin/env bash
# adv-inplace.sh — 통합 층(pleiades-adv-bot)을 셋째 체크아웃 ~/pleiades-adv 에서 띄우고 내린다 (012 4b-3b · #699 · 런북 docs/runbooks/advisor-inplace.md).
#
# 사용:  deploy/advisor/adv-inplace.sh <vX.Y.Z> [--dry-run] [--yes]
#        deploy/advisor/adv-inplace.sh stop [--yes]
#   서버의 ~/pleiades-adv 안의 이 스크립트를 서비스 계정으로 사용자가 직접 부른다 — 자동 배포 없음(4b-5) · 로컬(Darwin)은 --dry-run 만(I-3).
#   --yes       확인을 묻지 않는다
#   --dry-run   A(태그 대조)까지만 · 락을 잡지 않는다 · 바꾸지 않는다
#   되돌리기 = 직전 태그(양식의 "마지막 통과")로 같은 명령 · 첫 실행이 실패했으면 stop.
#   정지 = stop(락이 비어 있을 때 즉시 · 두 앱 배포 기록·env 를 보지 않는다).
#
# 종료 코드: 0 통과 · 1 바꾸기 전 중단 · 2 사용법 · 4 바꾼 뒤 실패(판정 양식의 복구 줄)
# 출력: 마지막 "판정 양식" 블록만 세션에 붙인다. 원본 로그는 ~/pleiades-private/inplace-adv-<시각>.log(600).
# 가드(012 §3-4): G-R1 셸 env 를 두 앱 배포와 같은 값으로 고정 · PLEIADES_PRIVATE_DIR 설정 거부 · 두 앱 기록으로 같은 락 위치 확인 ·
#   락 뒤 fin·fit 의 PLEIADES_ENV_FILE 대조 · G-R2 pm2 이름 pleiades-adv-bot 하나 · G-R3 락을 잡은 뒤 본문 전체가 fd 9 를 닫은
#   서브셸에서 돈다(pm2 데몬이 새로 뜨며 fd 를 물려받으면 두 앱 배포 락이 영영 안 풀린다).
# 자기 교체: C2 의 checkout 이 이 파일을 바꾼다 — 본문을 전부 함수에 두고 마지막 줄에서 main 을 부른 뒤 곧바로 exit 한다.

# deploy/release-inplace.sh 와 문자열이 같아야 한다(deploy/test_adv_inplace.py 가 대조)
PLEIADES_KEYS='DATABASE_URL|PORT|MCP_PORT|MCP_TRANSPORT|TELEGRAM_[A-Z_]*|DISCORD_[A-Z_]*|NOTIFY_[A-Z_]*|GARMIN_[A-Z_]*|OMRON_[A-Z_]*|MFDS_[A-Z_]*|WHOOING_[A-Z_]*|CLAUDE_BIN|NODE_ENV|PLEIADES_ENV_FILE|AUTH_[A-Z_]*|NEXTAUTH_[A-Z_]*|BASE_URL|FIRECRAWL_[A-Z_]*|MYFINANCE_ROOT|MCP_CONFIG_PATH'
TAG_RE='^v[0-9]+\.[0-9]+\.[0-9]+$'
ADV_NAME=pleiades-adv-bot
BOT_KEY=DISCORD_BOT_TOKEN_ADVISOR   # apps/advisor/src/platform.ts BOT_TOKEN_KEY — 있는지만 본다(값은 읽지 않는다)

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

# 배포 락 — deploy/release-inplace.sh take_lock 과 같은 파일 · 같은 방식(flock · 테스트만 mkdir 폴백)
LOCK_DIR=
take_lock() {
  local file=$1
  if [[ "${PLEIADES_TEST:-}" != 1 || "${PLEIADES_LOCK:-}" != mkdir ]] && command -v flock >/dev/null; then
    exec 9>>"$file"
    flock -n 9
    return
  fi
  mkdir "$file.d" 2>/dev/null || return 1
  echo $$ > "$file.d/pid"; LOCK_DIR="$file.d"
}
release_lock() { [[ -z "$LOCK_DIR" ]] || rm -rf "$LOCK_DIR"; LOCK_DIR=; }
redact() { sed -E "s#$HOME#~#g; s#/(home|Users)/[^/[:space:]]+#~#g"; }

# 판정 양식 — 한 실행에 한 번(서브셸이 돌았으면 서브셸 안에서만)
FORM=()
form() { FORM+=("$*"); }
emit_form() {
  echo
  echo "=== 판정 양식 (이 블록만 세션에 붙인다) ==="
  printf '%s\n' "${FORM[@]}" | redact
  echo "결과: $1"
  [[ -z "${LOG:-}" ]] || echo "원본: $(printf '%s' "$LOG" | redact) (세션에 붙이지 않는다)"
  echo "=== 끝 ==="
}
stop() { local code=$1; shift; emit_form "중단 — $(printf '%s' "$*" | redact)"; exit "$code"; }

# 체크아웃 HEAD 의 vX.Y.Z 태그(없으면 빈 값)
head_tag() { git -C "$1" tag --points-at HEAD 2>/dev/null | grep -E "$TAG_RE" | head -1; }
mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }
# pm2 저장본(resurrect 목록)에 통합 층이 있는지 — 이름만 본다
dump_has_adv() { grep -q "\"$ADV_NAME\"" "${PM2_HOME:-$HOME/.pm2}/dump.pm2" 2>/dev/null; }

JSON_OF='const jsonOf = (s) => { const i = s.indexOf("[{"); return i >= 0 ? s.slice(i) : s.slice(s.lastIndexOf("[]")) }'
# 도는 pleiades-* 마다 PLEIADES_ENV_FILE 이 이 셸 값과 같은지 — release-inplace env_same 과 같은 식 · 값은 내지 않는다
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
# 통합 층 프로세스 하나 — "상태 cwd일치 env상태 PLEIADES_PRIVATE_DIR" · 없으면 "none" · 경로는 내지 않는다
adv_state() {
  pm2 jlist 2>/dev/null | ADV="$ADV_NAME" APPDIR="$APPDIR" node -e "$JSON_OF"'
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let list; try { list = JSON.parse(jsonOf(s)) } catch { console.log("PARSE_FAIL - - -"); return }
      const p = list.find((x) => x.name === process.env.ADV)
      if (!p) { console.log("none - - -"); return }
      const e = p.pm2_env, sub = e.env || {}
      const v = e.PLEIADES_ENV_FILE ?? sub.PLEIADES_ENV_FILE
      const priv = (e.PLEIADES_PRIVATE_DIR ?? sub.PLEIADES_PRIVATE_DIR) === undefined ? "없음" : "있음"
      console.log(e.status, e.pm_cwd === process.env.APPDIR ? "예" : "아니오",
        v === undefined ? "MISSING" : v === process.env.PLEIADES_ENV_FILE ? "same" : "DIFF", priv)
    })'
}
confirm() {
  [[ $YES -eq 1 ]] && return 0
  printf '%s' "$1 계속? [y/N] " >&2
  local ans; read -r ans || ans=
  [[ "$ans" == y || "$ans" == Y ]] || stop 1 "사용자 취소 — 바꾸지 않았다"
}
recovery() {
  if [[ -n "${LAST_OK:-}" ]]; then printf '같은 명령 재실행 · 되돌리기 adv-inplace.sh %s · 또는 adv-inplace.sh stop' "$LAST_OK"
  else printf '같은 명령 재실행 · 또는 adv-inplace.sh stop(첫 실행 — 되돌릴 태그가 없다)'; fi
}
c3_step() {  # <이름> <디렉터리> <명령…>
  local label=$1 dir=$2; shift 2
  (cd "$dir" && "$@") >>"$LOG" 2>&1 || stop 4 "C3 — $label 실패 → $(recovery)"
}

# ── 배포 본문(락 뒤 · fd 9 없는 서브셸) ──────────────────────────────────
deploy_body() {
  # C1b — 두 앱 배포와 같은 기록·락 위치인지(B1) · claude(B10) · fin·fit env 대조(r4 정정 3)
  local a rec now fin_ok= fit_ok=
  for a in fin fit; do
    rec=$(cat "$PRIVATE/inplace-$a-last-ok" 2>/dev/null || true)
    [[ -n "$rec" ]] || stop 1 "C1 — inplace-$a-last-ok 가 없다(두 앱 배포 기록이 다른 위치 — 같은 락을 쓴다는 근거가 없다)"
    now=$(head_tag "$HOME/pleiades-$a")
    [[ "$rec" == "$now" ]] || form "   (주의) $a 마지막 통과 $rec ≠ 체크아웃 ${now:-비태그} — 되돌리기(R-8) 도중일 수 있다"
    printf -v "${a}_ok" '%s' "$rec"
  done
  local claude
  claude=$(command -v claude 2>/dev/null || true)
  [[ -n "$claude" || ! -x "$HOME/.local/bin/claude" ]] || claude="$HOME/.local/bin/claude"
  [[ -n "$claude" ]] || stop 1 "C1 — claude 를 찾지 못했다(PATH · ~/.local/bin)"
  CLAUDE_DIR=$(dirname "$claude")
  # pm2 jlist 는 데몬이 없으면 빈 데몬을 띄운다 — 두 앱이 도는 서버에서만 진행한다(stop 과 같은 표지)
  [[ -e "${PM2_HOME:-$HOME/.pm2}/rpc.sock" ]] || stop 1 "C1 — pm2 데몬이 없다(두 앱이 도는 서버에서만 · 재부팅 뒤면 두 앱 복구가 먼저)"
  local same ff n_same n_bad adv
  same=$(env_same)
  ff=$(grep -E '^(pleiades-(fin|fit)-|PARSE_FAIL)' <<<"$same")
  n_same=$(grep -c ' same$' <<<"$ff")
  n_bad=$(grep -cvE ' same$|^$' <<<"$ff")
  adv=$(awk -v n="$ADV_NAME" '$1 == n { print $2 }' <<<"$same")
  local cur adv_note=${adv:-없음}
  read -r -a cur <<<"$(adv_state)"
  ADV_OK=0   # 지금 도는 adv 가 이 셸 env 로 online — "이미 배포됨" 의 다섯째 조건(스크립트 밖 기동 복구 · W1)
  [[ "${cur[0]:-}" == online && "${cur[2]:-}" == same ]] && ADV_OK=1
  [[ -z "$adv" || "$adv" == same ]] || adv_note="$adv(이 실행이 재기동으로 고친다)"
  [[ -z "$adv" || $ADV_OK -eq 1 || "$adv" != same ]] || adv_note="${cur[0]:-?}(이 실행이 재기동으로 고친다)"
  form "C1 셸 키 $LEFT · platform $PERM · claude $claude $("$claude" --version 2>/dev/null | head -1)"
  form "   fin·fit same $n_same · DIFF/MISSING $n_bad · adv $adv_note"
  [[ "$n_bad" == 0 && "$n_same" -gt 0 ]] \
    || stop 1 "C1 — 도는 fin·fit 의 PLEIADES_ENV_FILE 이 이 셸과 다르거나 프로세스가 없다(두 앱을 먼저 정상으로)"
  local tags="태그 adv $V · fin 마지막 통과 $fin_ok · fit $fit_ok"
  [[ "$fin_ok" == "$V" && "$fit_ok" == "$V" ]] || tags+=" (주의) 두 앱과 다른 태그 — 런북: 두 앱과 같은 태그로"
  form "   $tags"

  # A — 규칙 3줄(r4): 비태그 HEAD 는 마지막 통과가 없을 때만 · "이미 배포됨" 은 넷 + adv 가 이 env 로 online 일 때만 · 그 밖은 진행
  if ! git -C "$ROOT" rev-parse -q --verify "refs/tags/$V" >/dev/null; then
    git -c maintenance.auto=false -c gc.auto=0 -C "$ROOT" fetch -q --no-tags origin tag "$V" >>"$LOG" 2>&1 \
      || stop 1 "A — 태그 $V 를 받지 못했다"
  fi
  [[ -z "$(git -C "$ROOT" status --porcelain)" ]] || stop 1 "A — 체크아웃이 깨끗하지 않다(git status)"
  local p pending stopped=
  p=$(head_tag "$ROOT")
  LAST_OK=$(cat "$PRIVATE/inplace-adv-last-ok" 2>/dev/null || true)
  pending=$(cat "$PRIVATE/inplace-adv-pending" 2>/dev/null || true)
  [[ ! -e "$PRIVATE/inplace-adv-stopped" ]] || stopped=1
  if [[ -z "$p" ]]; then
    [[ -z "$LAST_OK" ]] || stop 1 "A — HEAD 가 태그가 아니다(마지막 통과 $LAST_OK — 누가 체크아웃을 옮겼다 · git -C ~/pleiades-adv checkout $LAST_OK 뒤 다시${pending:+ · 끝나지 않은 시도 $pending})"
    form "A  첫 실행 — HEAD $(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  else
    form "A  HEAD $p → V $V · 마지막 통과 ${LAST_OK:-없음}${pending:+ · 끝나지 않은 시도 $pending}${stopped:+ · 정지됨}"
  fi
  if [[ "$p" == "$V" && "$LAST_OK" == "$V" && -z "$pending" && -z "$stopped" && $ADV_OK -eq 1 ]]; then
    form "   이미 $V 배포됨 — 할 일 없음"
    emit_form "통과 — 이미 배포됨"
    exit 0
  fi
  if [[ $DRY -eq 1 ]]; then
    form "C2~C6 (dry-run) checkout $V → 빌드 → probe → pm2 재기동 — 하지 않았다"
    emit_form "dry-run — 바꾸지 않았다"
    exit 0
  fi
  confirm "통합 층을 $V 로 띄운다."
  (umask 077; printf '%s\n' "$V" > "$PRIVATE/inplace-adv-pending") 2>>"$LOG" || stop 1 "C2 전 — 진행 중 표지 기록 실패"

  # C2 — checkout
  if [[ "$p" != "$V" ]]; then
    git -C "$ROOT" checkout -q "$V" >>"$LOG" 2>&1 || stop 4 "C2 — checkout 실패 → $(recovery)"
    [[ "$(head_tag "$ROOT")" == "$V" && -z "$(git -C "$ROOT" status --porcelain)" ]] || stop 4 "C2 — checkout 뒤 $V · 깨끗이 아니다 → $(recovery)"
    form "C2 $V · 깨끗: 예"
  else
    form "C2 HEAD 이미 $V — C3 부터"
  fi

  # C3 — 빌드(workflow.md 8절 apps/advisor 행의 선행 순서)
  c3_step "루트 npm ci" "$ROOT" npm ci
  c3_step "chat npm ci" "$ROOT" npm --prefix packages/chat ci
  c3_step "chat 빌드" "$ROOT" npx --no-install tsc -p packages/chat
  c3_step "advisor npm ci" "$APPDIR" npm ci
  c3_step "advisor 빌드" "$APPDIR" npm run build
  form "C3 빌드: 예"

  # C4 — probe(모델 호출 0 · 두 도메인 읽기 경로 · 락은 이 실행이 쥐고 있다)
  local out prc
  out=$(cd "$APPDIR" && node dist/advisor.cjs probe 2>>"$LOG"); prc=$?
  while IFS= read -r l; do
    [[ -z "$l" ]] || form "C4 ${l/#배포 락: busy/배포 락: busy(이 실행의 락)}"
  done <<<"$out"
  [[ $prc -eq 0 ]] || stop 4 "C4 — probe rc $prc(쓸 수 있는 도메인 0 · 위 줄) → $(recovery)"

  # C5 — 재기동. PATH 앞에 claude 디렉터리(B10) · 셸 env 를 넘기는 길은 start --update-env 하나(G-R1)
  local t0
  if [[ -n "$adv" ]]; then
    (cd "$APPDIR" && pm2 delete "$ADV_NAME") >>"$LOG" 2>&1 || stop 4 "C5 — 옛 $ADV_NAME 삭제 실패 → $(recovery)"
  fi
  # 옛 봇이 delete 전에 쓴 생존 표지로 C6 이 거짓 통과하지 않게 — 지우고 시각은 그 뒤에(9-1 info)
  rm -f "$APPDIR/logs/alive-adv.json"
  t0=$(date +%s)
  if ! (cd "$APPDIR" && PATH="$CLAUDE_DIR:$PATH" pm2 start "$CONFIG" --only "$ADV_NAME" --update-env) >>"$LOG" 2>&1; then
    # delete 만 되고 start 가 실패했다 — 저장 목록을 지금 상태로 맞춘다(dump 에 옛 adv 가 남으면 재부팅 때 되살아난다 · 9-1 major).
    # C1b 가 두 앱 프로세스를 확인했으므로 빈 데몬 위의 save 가 아니다
    [[ -z "$adv" ]] || pm2 save --force >>"$LOG" 2>&1 || form "   (주의) pm2 save 실패 — dump 에 옛 $ADV_NAME 가 남았을 수 있다(stop 으로 정리)"
    stop 4 "C5 — pm2 start 실패 → $(recovery)"
  fi
  pm2 save --force >>"$LOG" 2>&1 || stop 4 "C5 — pm2 save 실패 → $(recovery)"
  form "C5 $ADV_NAME 기동 · save: 예"

  # C6 — 확인
  local settle=30
  [[ "${PLEIADES_TEST:-}" != 1 || -z "${ADV_SETTLE_SECS:-}" ]] || settle=$ADV_SETTLE_SECS
  sleep "$settle"
  local st
  read -r -a st <<<"$(adv_state)"
  same=$(env_same); n_same=$(grep -c ' same$' <<<"$same"); n_bad=$(grep -cvE ' same$|^$' <<<"$same")
  form "C6 $ADV_NAME ${st[0]:-?} · cwd 이 체크아웃: ${st[1]:-?} · PLEIADES_ENV_FILE ${st[2]:-?} · PLEIADES_PRIVATE_DIR ${st[3]:-?} · 전체 pleiades-* same $n_same · DIFF/MISSING $n_bad"
  [[ "${st[0]:-}" == online && "${st[1]:-}" == 예 && "${st[2]:-}" == same && "${st[3]:-}" == 없음 && "$n_bad" == 0 ]] \
    || stop 4 "C6 — 확인 실패(위 줄) → $(recovery)"
  # 값이 있는지만 — 빈 값 · 따옴표만 있는 빈 값("" · '')은 없음으로 본다(9-1 info)
  if grep -qE "^[[:space:]]*(export[[:space:]]+)?$BOT_KEY=([^[:space:]\"']|\"[^\"]|'[^'])" "$PLEIADES_ENV_FILE" 2>/dev/null; then
    local m
    m=$(mtime "$APPDIR/logs/alive-adv.json")
    [[ -n "$m" && "$m" -ge "$t0" ]] || { form "   생존 표지 갱신: 아니오"; stop 4 "C6 — 생존 표지가 기동 뒤 갱신되지 않았다(gateway · 채널 · 허용 사용자 확인) → $(recovery)"; }
    form "   생존 표지 갱신: 예"
  else
    form "   생존 표지: 봇 키 없음 — 기다리는 중(키를 넣은 뒤 같은 명령)"
  fi

  (umask 077; printf '%s\n' "$V" > "$PRIVATE/inplace-adv-last-ok") 2>>"$LOG" || stop 4 "끝 — 마지막 통과 기록 실패 → 같은 명령 재실행"
  rm -f "$PRIVATE/inplace-adv-pending" "$PRIVATE/inplace-adv-stopped"
  form "   사람 확인: 통합 채널에 질문 1회 → pm2 로그의 cost= 줄(런북 D) — 예/아니오 를 덧붙인다"
  emit_form "통과"
}

# ── 정지 본문(락 뒤 · fd 9 없는 서브셸) — 두 앱 기록·env 대조 없음(정정 R2-1) ─────────────
stop_body() {
  confirm "통합 층을 정지한다."
  if [[ ! -e "${PM2_HOME:-$HOME/.pm2}/rpc.sock" ]]; then
    # 빈 데몬을 띄워 save --force 하면 두 앱 resurrect 목록이 지워진다(r4 정정 3)
    dump_has_adv && stop 4 "S — 데몬이 없는데 dump 에 $ADV_NAME 가 남아 있다(재부팅 복구 때 되살아난다) → 두 앱을 복구한 뒤 stop 다시"
    form "S  데몬 없음 — pm2 무변경"
  else
    local st
    read -r -a st <<<"$(adv_state)"
    case "${st[0]:-}" in
      PARSE_FAIL|'') stop 1 "S — pm2 목록을 읽지 못했다(바꾸지 않았다)" ;;
      none)
        if dump_has_adv; then
          # 목록에는 없지만 저장본에 남았다(C5 delete 뒤 실패 등 · 9-1 major) — 두 앱이 도는 데몬일 때만 save
          grep -qE '^pleiades-(fin|fit)-' <<<"$(env_same)" \
            || stop 4 "S — dump 에 $ADV_NAME 가 남았는데 두 앱이 없는 데몬이라 save 하지 않았다 → 두 앱을 복구한 뒤 stop 다시"
          pm2 save --force >>"$LOG" 2>&1 || stop 4 "S — pm2 save 실패 → 같은 명령 재실행"
          form "S  adv 없음 · dump 에 남은 adv 를 지웠다(save: 예)"
        else
          form "S  adv 없음 — pm2 무변경"
        fi
        ;;
      *)
        pm2 delete "$ADV_NAME" >>"$LOG" 2>&1 || stop 4 "S — pm2 delete 실패 → 같은 명령 재실행"
        # 두 앱이 없는 데몬(재부팅 뒤 부분 복구 등)에서 save --force 하면 두 앱 resurrect 목록이 지워진다(PR #700 Codex P2)
        grep -qE '^pleiades-(fin|fit)-' <<<"$(env_same)" \
          || stop 4 "S — $ADV_NAME 는 내렸지만 두 앱이 없는 데몬이라 save 하지 않았다(dump 에 adv 남음) → 두 앱을 복구한 뒤 stop 다시"
        pm2 save --force >>"$LOG" 2>&1 || stop 4 "S — pm2 save 실패 → 같은 명령 재실행"
        form "S  $ADV_NAME 삭제 · save: 예"
        ;;
    esac
  fi
  (umask 077; date '+%F %T' > "$PRIVATE/inplace-adv-stopped") 2>>"$LOG" || stop 4 "S — 정지 표지 기록 실패 → 같은 명령 재실행"
  rm -f "$APPDIR/logs/alive-adv.json"
  form "   마지막 통과 $(cat "$PRIVATE/inplace-adv-last-ok" 2>/dev/null || echo 없음) 유지 · 다시 켜기 = 같은 태그로 adv-inplace.sh <태그>"
  emit_form "통과 — 정지"
}

main() {
  set -uo pipefail
  [[ $# -ge 1 ]] || usage
  MODE=deploy; V=
  if [[ "$1" == stop ]]; then MODE=stop; else V=$1; fi
  shift
  YES=0; DRY=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes) YES=1 ;;
      --dry-run) [[ $MODE == deploy ]] || usage; DRY=1 ;;
      *) usage ;;
    esac
    shift
  done
  [[ $MODE == stop || "$V" =~ $TAG_RE ]] || usage

  ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
  APPDIR=$ROOT/apps/advisor
  CONFIG=$ROOT/deploy/advisor/pleiades-adv.config.cjs
  form "ADV ${V:-stop}"

  # 0 — OS · 위치 · 저장소
  [[ "$(uname -s)" != Darwin || $DRY -eq 1 ]] || stop 1 "로컬에서는 --dry-run 만(I-3)"
  local bin
  for bin in node pm2 git; do command -v "$bin" >/dev/null || stop 1 "$bin 이 PATH 에 없다(프로필·nvm)"; done
  [[ "$ROOT" == "$(cd "$HOME/pleiades-adv" 2>/dev/null && pwd -P)" ]] || stop 1 "이 체크아웃이 ~/pleiades-adv 가 아니다(B2)"
  [[ "$(node -p "require('$ROOT/package.json').name" 2>/dev/null)" == pleiades ]] || stop 1 "pleiades 체크아웃이 아니다"

  # C1a — 셸 env 고정(G-R1) · 기록 위치는 두 앱 배포와 같은 기본값만
  [[ -z "${PLEIADES_PRIVATE_DIR+x}" ]] || stop 1 "PLEIADES_PRIVATE_DIR 이 설정돼 있다 — 두 앱 배포와 같은 락·기록 위치를 보장하지 못한다(unset 뒤 다시)"
  local k
  for k in $(env | grep -oE "^($PLEIADES_KEYS)=" | tr -d =); do unset "$k"; done
  export PLEIADES_ENV_FILE="$HOME/pleiades-platform.env"
  LEFT=$(env | grep -E "^($PLEIADES_KEYS)=" | grep -vc '^PLEIADES_ENV_FILE=')
  PERM=$(stat -c '%a' "$PLEIADES_ENV_FILE" 2>/dev/null || stat -f '%Lp' "$PLEIADES_ENV_FILE" 2>/dev/null || echo 없음)
  [[ $MODE == stop || "$PERM" == 600 ]] || stop 1 "C1 — 플랫폼 설정 권한이 600 이 아니다($PERM)"
  PRIVATE="$HOME/pleiades-private"
  [[ -d "$PRIVATE" ]] || stop 1 "비공개 위치가 없다(두 앱 배포 기록이 있는 서버에서만)"

  # L — 두 앱 배포와 같은 락
  trap release_lock EXIT
  trap 'exit 130' INT TERM HUP
  if [[ $DRY -eq 0 ]]; then
    take_lock "$PRIVATE/deploy.lock" || stop 1 "다른 배포가 이 서버에서 진행 중이다(락 ~/pleiades-private/deploy.lock — 끝난 뒤 다시)"
  fi
  LOG="$PRIVATE/inplace-adv-$(date +%Y%m%d-%H%M%S).log"
  (umask 077; : > "$LOG") || stop 1 "원본 파일을 만들 수 없다"

  # 락 뒤 본문 전체 — fd 9 를 닫은 서브셸(G-R3). 양식은 그 안에서만 낸다 · 바깥은 rc 만 넘긴다
  (
    if [[ $MODE == stop ]]; then stop_body; else deploy_body; fi
  ) 9>&-
  return $?
}

[[ "${BASH_SOURCE[0]}" != "$0" ]] || { main "$@"; exit $?; }
