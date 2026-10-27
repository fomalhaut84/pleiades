#!/usr/bin/env bash
# discord-switch.sh — T-10 Discord 승계 스위치 (#314 · 007 T-10 · Q80). 서버에서 사용자가 실행한다(Claude 는 서버에 닿지 않는다 · I-3).
#
# 사용:  deploy/discord-switch.sh check [--no-send]   플랫폼 설정 600 · 필요한 키 9 · 형식 · 웹훅 4·봇 채널 2 에 시험 메시지
#        deploy/discord-switch.sh on [--no-send]      check → 백업 → 스위치 4줄 discord → 두 앱 봇 재시작 → gateway 준비 판정
#        deploy/discord-switch.sh off                 백업 → 스위치 4줄 비움 → 두 앱 봇 재시작 (되돌리기 · 텔레그램)
# 플랫폼 설정: PLEIADES_ENV_FILE(절대경로) 또는 ~/pleiades-platform.env. 값은 사용자가 먼저 채운다 — 이 스크립트는 스위치 줄만 쓴다.
# 출력: 판정 양식만. 값(웹훅 URL · 토큰 · ID)은 내지 않는다. 백업은 ~/pleiades-private/(700).
# 종료: 0 통과 · 1 중단(바꾸기 전) · 2 사용법 · 3 바꾼 뒤 판정 실패(on 이면 off 로 되돌린다)
# 웹(fin·fit)은 플랫폼 설정의 수정 시각으로 다시 읽어 재시작이 필요 없다 — 봇은 gateway 가 기동 때만 설정을 본다(#157).

set -uo pipefail
export LC_ALL=C

BOTS=(pleiades-fin-bot pleiades-fit-bot)
READY_WAIT=${PLEIADES_READY_WAIT:-90}

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
redact() { sed -E "s#$HOME#~#g; s#/(home|Users)/[^/[:space:]]+#~#g"; }

FORM=()
form() { FORM+=("$*"); }
emit_form() {
  echo
  echo "=== 판정 양식 (이 블록만 세션에 붙인다) ==="
  printf '%s\n' "${FORM[@]}"
  echo "결과: $1"
  echo "=== 끝 ==="
}
stop() { local code=$1; shift; emit_form "중단 — $(printf '%s' "$*" | redact)"; exit "$code"; }

# 노드 쪽 결과 — "F <줄>" 은 양식으로, 마지막 RESULT 로 성패
node_step() {  # <인자…>
  local res line ok=1
  res=$(node "$HERE/discord-switch.cjs" "$@" 2>/dev/null) || true
  while IFS= read -r line; do
    case "$line" in
      "F "*) form "   ${line#F }" ;;
      "RESULT ok") ok=0 ;;
    esac
  done <<<"$res"
  return $ok
}

# 서버 배포 락을 같이 쓴다 — 자동 배포(봇 재기동)와 겹치지 않게. flock 이 없으면(macOS 테스트) mkdir
LOCK_DIR=
take_lock() {
  # mkdir 폴백은 테스트만 고른다 — 운영에서 flock 을 쓰는 release-inplace.sh 와 서로 막아야 한다
  if [[ "${PLEIADES_TEST:-}" != 1 || "${PLEIADES_LOCK:-}" != mkdir ]] && command -v flock >/dev/null; then
    exec 9>>"$1"
    flock -n 9
    return
  fi
  mkdir "$1.d" 2>/dev/null || return 1
  LOCK_DIR="$1.d"
}
release_lock() { [[ -z "$LOCK_DIR" ]] || rm -rf "$LOCK_DIR"; LOCK_DIR=; }

# 봇 로그에서 재시작 뒤에 붙은 바이트만 — 시각 비교는 셸과 pm2 데몬의 TZ 가 다르면 어긋나고(옛 "준비 완료" 줄로 거짓 통과)
# 시각 없는 이어진 줄도 창에 섞인다(사전 리뷰 major). 재시작 직전 크기를 적어 두고 그 뒤만 본다 · 줄었으면(로테이션) 처음부터
OFFSETS=
mark_logs() {
  local f
  OFFSETS=$(for f in "$PM2_LOGS"/pleiades-*-bot-*.log; do [[ -f "$f" ]] && printf '%s\t%s\n' "$(wc -c <"$f" | tr -d ' ')" "$f"; done)
}
since() {  # <봇 이름>
  local f off size
  for f in "$PM2_LOGS/$1-"*.log; do
    [[ -f "$f" ]] || continue
    off=$(awk -F'\t' -v f="$f" '$2 == f { print $1 }' <<<"$OFFSETS"); off=${off:-0}
    size=$(wc -c <"$f" | tr -d ' ')
    (( size < off )) && off=0
    tail -c +$((off + 1)) "$f"
  done
}
online() {  # <봇 이름> — pm2 jlist 앞의 "[PM2][WARN]" 줄을 건너 JSON 만
  pm2 jlist 2>/dev/null 9>&- | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const i = s.search(/\[\{|\[\]/); let list = []; try { list = JSON.parse(s.slice(i)) } catch {}
      const p = list.find((x) => x.name === process.argv[1]); process.stdout.write(p && p.pm2_env.status === "online" ? "1" : "0") })' "$1"
}

restart_bots() {  # 재시작 → 둘 다 online 인지
  local b
  for b in "${BOTS[@]}"; do
    pm2 restart "$b" >/dev/null 2>&1 9>&- || return 1
  done
  sleep 3
  for b in "${BOTS[@]}"; do [[ "$(online "$b")" == 1 ]] || return 1; done
}

# gateway 판정 — 두 봇 모두 "[discord-<app>] gateway 준비 완료" 가 재시작 뒤에 · 종료 코드·미설정 줄 0
judge_gateway() {
  local waited=0 b app ready=0 lines
  while (( waited < READY_WAIT )); do
    ready=0
    for b in "${BOTS[@]}"; do
      app=${b#pleiades-}; app=${app%-bot}
      since "$b" | grep -q "\[discord-$app\] gateway 준비 완료" && ready=$((ready + 1))
    done
    (( ready == ${#BOTS[@]} )) && break
    sleep 3; waited=$((waited + 3))
  done
  local bad=0 fatal unset_n deny
  for b in "${BOTS[@]}"; do
    app=${b#pleiades-}; app=${app%-bot}
    lines=$(since "$b")
    fatal=$(grep -c "\[discord-$app\] gateway 종료 코드" <<<"$lines")
    unset_n=$(grep -cE "\[discord-$app\] (봇 토큰·채널 미설정|DISCORD_ALLOWED_USER_IDS 비어 있음)" <<<"$lines")
    deny=$(grep -c "\[discord\] " <<<"$lines")
    form "   $app 봇 gateway 준비 $(grep -c "\[discord-$app\] gateway 준비 완료" <<<"$lines") · 종료 코드 $fatal · 미설정 $unset_n · 전송 재시도·속도 제한 $deny"
    (( fatal == 0 && unset_n == 0 )) || bad=1
  done
  form "   대기 ${waited}s(상한 ${READY_WAIT}s)"
  (( ready == ${#BOTS[@]} && bad == 0 ))
}

# on 실패 — 바로 텔레그램으로 되돌린다(반쯤 켜진 상태로 두지 않는다). 되돌리기 자체의 성패를 따로 적는다(사전 리뷰 major:
# 재시작이 다시 실패하면 앞서 뜬 봇은 discord 설정으로 남는다 — "되돌렸다" 로 덮지 않는다)
revert() {  # <이유>
  CUTOVER=0
  node_step set "$FILE" telegram || stop 3 "$1 · 되돌리기 실패(스위치를 쓰지 못했다) — 백업에서 복원 후 off"
  if restart_bots; then
    form "   되돌림 · 봇 online: 예"
    stop 3 "$1 — 텔레그램으로 되돌렸다"
  fi
  form "   되돌림 · 봇 online: 아니오"
  stop 3 "$1 · 스위치는 텔레그램이지만 봇 재시작 실패 — 앞서 뜬 봇은 discord 설정일 수 있다 · pm2 확인 후 off"
}

CUTOVER=0
on_signal() {
  trap '' INT TERM HUP   # 되돌리는 중에 다시 끊기지 않게
  [[ $CUTOVER -eq 1 ]] && revert "중단 신호"
  stop 130 "중단 신호 — 바꾸기 전"
}

main() {
  local cmd=${1:-} send=1
  shift || true
  for a in "$@"; do case "$a" in --no-send) send=0 ;; *) usage ;; esac; done
  case "$cmd" in check|on|off) ;; *) usage ;; esac
  [[ "$cmd" != off || $send -eq 1 ]] || usage

  HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
  form "CMD $cmd$([[ $send -eq 1 ]] || echo ' --no-send')"
  [[ "$(uname -s)" != Darwin || "${PLEIADES_TEST:-}" == 1 ]] || stop 1 "로컬에서는 돌리지 않는다 — 서버 전용(I-3)"
  local bin
  for bin in node pm2; do command -v "$bin" >/dev/null || stop 1 "$bin 이 PATH 에 없다(nvm 이면 셸 프로필)"; done

  local file=${PLEIADES_ENV_FILE:-$HOME/pleiades-platform.env}
  FILE=$file
  [[ "$file" == /* ]] || stop 1 "PLEIADES_ENV_FILE 는 절대경로여야 한다"
  [[ -f "$file" ]] || stop 1 "플랫폼 설정 파일이 없다"
  local perm
  perm=$(stat -c '%a' "$file" 2>/dev/null || stat -f '%Lp' "$file" 2>/dev/null || echo 없음)
  form "   플랫폼 설정 권한 $perm"
  [[ "$perm" == 600 ]] || stop 1 "플랫폼 설정 권한이 600 이 아니다"
  node_step state "$file" || stop 1 "스위치 상태를 읽지 못했다"

  PM2_LOGS=$HOME/.pm2/logs
  [[ "${PLEIADES_TEST:-}" != 1 || -z "${PLEIADES_PM2_LOGS:-}" ]] || PM2_LOGS=$PLEIADES_PM2_LOGS
  local private=${PLEIADES_PRIVATE_DIR:-$HOME/pleiades-private}
  (umask 077; mkdir -p "$private" && chmod 700 "$private") 2>/dev/null || stop 1 "백업 위치를 만들 수 없다"

  if [[ "$cmd" == check ]]; then
    local args=(check "$file"); [[ $send -eq 1 ]] || args+=(--no-send)
    if node_step "${args[@]}"; then emit_form "통과 — 켤 준비가 됐다(on)"; exit 0; fi
    stop 1 "점검 실패 — 위 줄의 키를 채우거나 고친 뒤 다시"
  fi

  trap release_lock EXIT
  # 신호(Ctrl-C · ssh 끊김 · SIGTERM) — on 이 스위치를 쓴 뒤면 텔레그램으로 되돌리고 끝낸다(PR #315 Codex P2)
  trap on_signal INT TERM HUP
  take_lock "$private/deploy.lock" || stop 1 "배포가 이 서버에서 진행 중이다(끝난 뒤 다시)"

  if [[ "$cmd" == on ]]; then
    local args=(check "$file"); [[ $send -eq 1 ]] || args+=(--no-send)
    node_step "${args[@]}" || stop 1 "점검 실패 — 바꾸지 않았다"
  fi

  local backup
  backup="$private/platform-env-$(date +%Y%m%d-%H%M%S).bak"
  (umask 077; cp -p "$file" "$backup") 2>/dev/null || stop 1 "백업 실패 — 바꾸지 않았다"
  form "   백업 $(printf '%s' "$backup" | redact)"

  local to=discord; [[ "$cmd" == on ]] || to=telegram
  [[ "$cmd" == on ]] && CUTOVER=1
  node_step set "$file" "$to" || stop 1 "스위치를 쓰지 못했다(백업으로 그대로)"

  mark_logs
  if ! restart_bots; then
    form "   봇 재시작 · online: 아니오"
    [[ "$cmd" == on ]] || stop 3 "봇 재시작 실패 · pm2 상태 확인(스위치는 이미 텔레그램)"
    revert "봇 재시작 실패"
  fi
  form "   봇 재시작 · online: 예"

  if [[ "$cmd" == off ]]; then
    emit_form "통과 — 텔레그램으로 돌아왔다"
    exit 0
  fi
  if judge_gateway; then
    form "   되돌리기: deploy/discord-switch.sh off"
    emit_form "통과 — Discord 승계(라우트별 첫 실알림 확인은 런북 5절)"
    exit 0
  fi
  revert "판정 실패 · 위 봇 줄(종료 코드 = 토큰·권한 · 미설정 = 키)을 확인"
}

main "$@"
