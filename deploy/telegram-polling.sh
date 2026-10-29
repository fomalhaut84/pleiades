#!/usr/bin/env bash
# telegram-polling.sh — 앱 텔레그램 수신(롱폴링) 끄기·켜기 (009 D-2′ · #376). 서버에서 사용자가 실행한다(Claude 는 서버에 닿지 않는다 · I-3).
#
# 사용:  deploy/telegram-polling.sh fit off [--dry-run]   백업 → 앱 .env TELEGRAM_POLLING=off → pleiades-fit-bot 재시작 → 판정
#        deploy/telegram-polling.sh fit on [--dry-run]    백업 → 키 비움 → pleiades-fit-bot 재시작 → 판정 (되돌리기 · 밀린 업데이트는 버린다)
#   이 체크아웃의 apps/<dir>/.env 를 바꾼다 — 도는 봇의 체크아웃에서 부른다. fin 은 아직이다(D-3′).
#   off 의 전제: C-11 통과 · Discord 메시지 수신이 켜져 있다(플랫폼 설정 대화 채널 키 · 아니면 바꾸기 전에 멈춘다).
# 토큰·아웃바운드 텔레그램은 그대로다(폴링만). 출력: 판정 양식만 — 값·경로는 내지 않는다. 백업은 ~/pleiades-private/(700).
# 종료: 0 통과 · 1 중단(바꾸기 전) · 2 사용법 · 3 바꾼 뒤 판정 실패(off 면 키를 비우고 재시작해 되돌린다 — 되돌림 성패를 따로 적는다)
# 로컬(Darwin)은 --dry-run 만(I-3).

set -uo pipefail
export LC_ALL=C

KEY=TELEGRAM_POLLING
READY_WAIT=${PLEIADES_READY_WAIT:-90}
# 판정 문자열 — 앱(apps/<dir>/src/bot/telegram-polling.ts · discord-interactions.ts)과 chat gateway 가 찍는다(deploy/test_telegram_polling.py 가 고정)
POLL_OFF_LINE="[bot] 텔레그램 폴링 꺼짐(TELEGRAM_POLLING=off)"
POLL_START_LINE="[bot] Long polling 시작"
POLL_DROP_LINE="[bot] Long polling 시작 (밀린 업데이트 버림"
NO_TOKEN_LINE="[bot] 텔레그램 토큰 없음"
UNAUTHORIZED_LINE="[bot] 텔레그램 토큰 무효(401)"

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
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
node_step() {  # <cjs> <인자…>
  local res line ok=1 cjs=$1
  shift
  res=$(node "$HERE/$cjs" "$@" 2>/dev/null) || true
  while IFS= read -r line; do
    case "$line" in
      "F "*) form "   ${line#F }" ;;
      "RESULT ok") ok=0 ;;
    esac
  done <<<"$res"
  return $ok
}
last_form() { printf '%s' "${FORM[${#FORM[@]}-1]}"; }

# 서버 배포 락을 같이 쓴다(discord-inbound.sh 와 같다) — 자동 배포(봇 재기동)와 겹치지 않게. flock 이 없으면(macOS 테스트) mkdir
LOCK_DIR=
take_lock() {
  if [[ "${PLEIADES_TEST:-}" != 1 || "${PLEIADES_LOCK:-}" != mkdir ]] && command -v flock >/dev/null; then
    exec 9>>"$1"
    flock -n 9
    return
  fi
  mkdir "$1.d" 2>/dev/null || return 1
  LOCK_DIR="$1.d"
}
release_lock() { [[ -z "$LOCK_DIR" ]] || rm -rf "$LOCK_DIR"; LOCK_DIR=; }

# 봇 로그에서 재시작 뒤에 붙은 바이트만(discord-inbound.sh 와 같다 — 옛 줄로 거짓 통과하지 않게 · 로테이션이면 처음부터)
OFFSETS=
mark_logs() {
  local f
  OFFSETS=$(for f in "$PM2_LOGS/$BOT-"*.log; do [[ -f "$f" ]] && printf '%s\t%s\n' "$(wc -c <"$f" | tr -d ' ')" "$f"; done)
}
since() {
  local f off size
  for f in "$PM2_LOGS/$BOT-"*.log; do
    [[ -f "$f" ]] || continue
    off=$(awk -F'\t' -v f="$f" '$2 == f { print $1 }' <<<"$OFFSETS"); off=${off:-0}
    size=$(wc -c <"$f" | tr -d ' ')
    (( size < off )) && off=0
    tail -c +$((off + 1)) "$f"
  done
}

# 도는 봇 — "<online 1/0> <cwd 가 이 앱 디렉터리 1/0> <pm2 env 에 키 있음 1/0> <PLEIADES_ENV_FILE 같음 1/0>". 이름만 대조하고 값은 내지 않는다.
# 앱은 dotenv 로 .env 를 읽지만 이미 있는 env 를 덮지 않는다 — 키가 pm2 env 에 있으면 .env 를 바꿔도 소용없다(N30)
bot_state() {
  pm2 jlist 2>/dev/null 9>&- | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const i = s.search(/\[\{|\[\]/); let list = []; try { list = JSON.parse(s.slice(i)) } catch {}
      const p = list.find((x) => x.name === process.argv[1])
      if (!p) { process.stdout.write("0 0 0 0"); return }
      const env = p.pm2_env || {}; const nested = env.env || {}
      const has = (k) => Object.prototype.hasOwnProperty.call(env, k) || Object.prototype.hasOwnProperty.call(nested, k)
      let same = 0; try { same = require("fs").realpathSync(String(env.pm_cwd || "")) === process.argv[2] ? 1 : 0 } catch {}
      const file = env.PLEIADES_ENV_FILE ?? nested.PLEIADES_ENV_FILE
      process.stdout.write(`${env.status === "online" ? 1 : 0} ${same} ${has(process.argv[3]) ? 1 : 0} ${file === process.argv[4] ? 1 : 0}`) })' "$BOT" "$APP_DIR" "$KEY" "$PLATFORM"
}

count() { grep -cF -- "$1" <<<"$2"; }

# 키 줄을 쓰고(off · 빈 값이면 켬) 봇을 재시작한 뒤 판정. <값> <단계> <기대 off|on>
apply() {
  local value=$1 phase=$2 want=$3
  # 1-5 의 기준은 앱과 같다 — .env 가 아니라 재시작 직전 상태 기록(on 이 아니면 앱이 밀린 업데이트를 버린다)
  PREV_RECORD_ON=0
  node "$HERE/telegram-polling.cjs" record "$STATE_FILE" 2>/dev/null | grep -q '기록 on$' && PREV_RECORD_ON=1
  POLLING_VALUE=$value node_step telegram-polling.cjs set "$ENV_FILE" || { form "   [$phase] 키 줄을 쓰지 못했다"; return 1; }
  mark_logs
  pm2 restart "$BOT" >/dev/null 2>&1 9>&- || { form "   [$phase] $BOT 재시작 실패"; return 1; }
  sleep "${PLEIADES_RESTART_SETTLE:-3}"
  judge "$phase" "$want"
}

judge() {  # <단계> <off|on>
  local phase=$1 want=$2 waited=0 lines=
  # 기다리는 줄 — 끔: 폴링 꺼짐 + Discord 준비 · 켬: 폴링 시작만(텔레그램 왕복이 있다 · 되돌림은 Discord 가 깨졌을 때 쓰인다)
  while (( waited < READY_WAIT )); do
    lines=$(since)
    if [[ "$want" == off ]]; then
      (( $(count "$READY_LINE" "$lines") >= 1 && $(count "$POLL_OFF_LINE" "$lines") >= 1 )) && break
    else
      (( $(count "$POLL_START_LINE" "$lines") >= 1 )) && break
    fi
    (( $(count "$UNAUTHORIZED_LINE" "$lines") >= 1 )) && break
    sleep 3; waited=$((waited + 3))
  done
  lines=$(since)
  local poll_off poll_start drop no_token unauth ready inbound degrade fatal st rec=
  poll_off=$(count "$POLL_OFF_LINE" "$lines")
  poll_start=$(count "$POLL_START_LINE" "$lines")
  drop=$(count "$POLL_DROP_LINE" "$lines")
  no_token=$(count "$NO_TOKEN_LINE" "$lines")
  unauth=$(count "$UNAUTHORIZED_LINE" "$lines")
  ready=$(count "$READY_LINE" "$lines")
  inbound=$(count "$INBOUND_ON_LINE" "$lines")
  degrade=$(count "$DEGRADE_LINE" "$lines")
  fatal=$(count "$FATAL_LINE" "$lines")
  read -r -a st <<<"$(bot_state)"
  form "   [$phase] 재시작 뒤 텔레그램 폴링 꺼짐 $poll_off · 폴링 시작 $poll_start (밀린 업데이트 버림 $drop) (대기 ${waited}s · 상한 ${READY_WAIT}s)"
  form "   [$phase] 텔레그램 토큰 없음 $no_token · 토큰 무효(401) $unauth"
  form "   [$phase] Discord 준비 완료 $ready · 메시지 수신 켜짐(대화 채널) $inbound · MESSAGE CONTENT 미허용(4014) 강등 $degrade · gateway 종료 코드 $fatal"
  form "   [$phase] 봇 online ${st[0]:-0} · cwd 이 체크아웃 ${st[1]:-0} · pm2 env 키 $([[ "${st[2]:-1}" == 0 ]] && echo 없음 || echo 있음)"
  node_step telegram-polling.cjs record "$STATE_FILE" >/dev/null && rec=$(last_form)
  node_step telegram-polling.cjs state "$ENV_FILE" >/dev/null || form "   [$phase] 앱 .env 키 읽기 실패"
  local file_state
  file_state=$(last_form)
  DISCORD_OK=0
  (( ready >= 1 && degrade == 0 && fatal == 0 )) && DISCORD_OK=1
  (( no_token == 0 && unauth == 0 )) || return 1
  [[ "${st[0]:-0}" == 1 && "${st[1]:-0}" == 1 && "${st[2]:-1}" == 0 ]] || return 1
  if [[ "$want" == off ]]; then
    # 2′-2 — 텔레그램을 끈 뒤에도 Discord 가 메시지를 받는다. "수신 켜짐" 줄은 기동 때 키만 보고 찍히므로 4014 강등 0 까지 본다
    (( DISCORD_OK == 1 && inbound >= 1 && poll_off >= 1 && poll_start == 0 )) || return 1
    [[ "$file_state" == *"끔(off)" && "$rec" == *"기록 off" ]]
  else
    # 켬은 텔레그램 쪽만으로 판정한다 — Discord 상태는 양식에 적고 결과 문구로 가른다
    (( poll_start >= 1 && poll_off == 0 )) || return 1
    # 1-5 — 직전 기록이 on 이 아니면 밀린 업데이트를 버려야 한다(앱과 같은 기준)
    if (( PREV_RECORD_ON == 1 )); then (( drop == 0 )) || return 1; else (( drop >= 1 )) || return 1; fi
    [[ "$file_state" == *"켬(off 아님)" && "$rec" == *"기록 on" ]]
  fi
}

# off 실패 — 키를 비우고 재시작해 병행(텔레그램 + Discord)으로 되돌린다
revert() {  # <이유>
  CHANGED=0
  [[ $PREV_OFF -eq 1 ]] && form "   되돌림 = 켬(직전 값 off 복원 아님 · 직전 값은 백업에)"
  if apply "" 되돌림 on; then
    form "   되돌림 성공$(discord_note)"
    stop 3 "$1 — 키를 비우고 텔레그램 폴링을 다시 켰다(병행 상태 · 위 줄 확인 후 다시 off)"
  fi
  form "   되돌림 실패"
  stop 3 "$1 · 되돌림도 판정 실패 — 백업에서 복원하거나 on 을 다시"
}

discord_note() { [[ $DISCORD_OK -eq 1 ]] || printf ' (Discord 비정상 — 위 Discord 줄을 따로 확인)'; }

CHANGED=0
ON_STARTED=0
PREV_OFF=0
PREV_RECORD_ON=0
DISCORD_OK=0
on_signal() {
  trap '' INT TERM HUP
  [[ $CHANGED -eq 1 ]] && revert "중단 신호"
  [[ $ON_STARTED -eq 1 ]] && stop 130 "중단 신호 — 켜기 진행 중(키 비움 뒤일 수 있다 · 재시작·판정 미확인 → on 을 다시)"
  stop 130 "중단 신호 — 바꾸기 전"
}

main() {
  local app=${1:-} cmd=${2:-} dry=0
  shift 2 2>/dev/null || usage
  for a in "$@"; do case "$a" in --dry-run) dry=1 ;; *) usage ;; esac; done
  case "$cmd" in on|off) ;; *) usage ;; esac
  form "CMD $app $cmd$([[ $dry -eq 1 ]] && echo ' --dry-run')"
  [[ "$app" == fit ]] || { [[ "$app" == fin ]] && stop 2 "fin 은 아직이다(009 D-3′)"; usage; }
  BOT=pleiades-fit-bot
  LABEL=discord-fit
  CHAT_KEY=DISCORD_CHANNEL_ID_FITNESS_CHAT
  READY_LINE="[$LABEL] gateway 준비 완료"
  INBOUND_ON_LINE="[$LABEL] 메시지 수신 켜짐(대화 채널)"
  FATAL_LINE="[$LABEL] gateway 종료 코드"
  DEGRADE_LINE="[$LABEL] MESSAGE CONTENT 미허용(4014)"

  HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
  [[ $dry -eq 1 || "$(uname -s)" != Darwin || "${PLEIADES_TEST:-}" == 1 ]] || stop 1 "로컬에서는 --dry-run 만 — 서버 전용(I-3)"
  APP_DIR=$HERE/../apps/fitness
  [[ "${PLEIADES_TEST:-}" != 1 || -z "${PLEIADES_APP_DIR:-}" ]] || APP_DIR=$PLEIADES_APP_DIR
  APP_DIR=$(cd "$APP_DIR" 2>/dev/null && pwd -P) || stop 1 "앱 디렉터리가 없다"
  ENV_FILE=$APP_DIR/.env
  STATE_FILE=$APP_DIR/logs/telegram-polling-fit.json
  PLATFORM=${PLEIADES_ENV_FILE:-$HOME/pleiades-platform.env}
  local platform=$PLATFORM
  [[ "$platform" == /* ]] || stop 1 "PLEIADES_ENV_FILE 는 절대경로여야 한다"

  if [[ $dry -eq 1 ]]; then
    if [[ -f "$ENV_FILE" ]]; then
      local dperm
      dperm=$(stat -L -c '%a' "$ENV_FILE" 2>/dev/null || stat -L -f '%Lp' "$ENV_FILE" 2>/dev/null || echo 없음)
      form "   앱 .env 있음 · 권한 $dperm"
      command -v node >/dev/null && node_step telegram-polling.cjs state "$ENV_FILE" >/dev/null
    else
      form "   앱 .env 없음"
    fi
    if [[ -f "$platform" ]] && command -v node >/dev/null; then
      node_step discord-inbound.cjs state "$platform" "$CHAT_KEY" >/dev/null   # "플랫폼 파일 키 설정됨|비어 있음" = Discord 대화 채널
    fi
    form "   단계(바꾸지 않는다): 백업 → 앱 .env $KEY $([[ "$cmd" == off ]] && echo '=off' || echo 비움) → $BOT 재시작 → 판정"
    emit_form "dry-run — 바꾸지 않았다"
    exit 0
  fi

  local bin
  for bin in node pm2; do command -v "$bin" >/dev/null || stop 1 "$bin 이 PATH 에 없다(nvm 이면 셸 프로필)"; done
  [[ -f "$ENV_FILE" ]] || stop 1 "앱 .env 가 없다 — 도는 봇의 체크아웃에서 부른다"
  local perm
  perm=$(stat -L -c '%a' "$ENV_FILE" 2>/dev/null || stat -L -f '%Lp' "$ENV_FILE" 2>/dev/null || echo 없음)
  form "   앱 .env 권한 $perm"
  [[ "$perm" == 600 ]] || stop 1 "앱 .env 권한이 600 이 아니다"
  node_step telegram-polling.cjs state "$ENV_FILE" || stop 1 "앱 .env 를 읽지 못했다"
  [[ "$(last_form)" == *"끔(off)" ]] && PREV_OFF=1

  if [[ "$cmd" == off ]]; then
    # 텔레그램을 끄면 Discord 가 유일한 수신이다 — 대화 채널이 켜져 있어야 한다(2′-2)
    [[ -f "$platform" ]] || stop 1 "플랫폼 설정 파일이 없다 — Discord 수신을 확인할 수 없다"
    node_step discord-inbound.cjs state "$platform" "$CHAT_KEY" || stop 1 "플랫폼 설정을 읽지 못했다"
    [[ "$(last_form)" == *"키 설정됨" ]] || stop 1 "Discord 메시지 수신이 꺼져 있다 — 먼저 deploy/discord-inbound.sh fit on"
  fi

  local st
  read -r -a st <<<"$(bot_state)"
  form "   바꾸기 전 · 봇 online ${st[0]:-0} · cwd 이 체크아웃 ${st[1]:-0} · pm2 env 키 $([[ "${st[2]:-1}" == 0 ]] && echo 없음 || echo 있음) · PLEIADES_ENV_FILE 같음 ${st[3]:-0}"
  [[ "${st[0]:-0}" == 1 ]] || stop 1 "$BOT 이 online 이 아니다"
  [[ "${st[1]:-0}" == 1 ]] || stop 1 "도는 봇이 이 체크아웃의 앱이 아니다 — 도는 봇의 체크아웃에서 부른다"
  [[ "${st[2]:-1}" == 0 ]] || stop 1 "도는 봇의 pm2 env 에 $KEY 가 있다 — 앱 .env 가 가려진다(pm2 설정에서 빼고 다시)"
  # off 는 위 Discord 확인이 도는 봇의 플랫폼 파일에 대한 것이어야 한다(discord-inbound.sh 와 같다)
  [[ "$cmd" == on || "${st[3]:-0}" == 1 ]] || stop 1 "도는 봇의 PLEIADES_ENV_FILE 이 이 파일과 다르다 — 셸의 PLEIADES_ENV_FILE 을 풀고(unset) 다시"

  PM2_LOGS=$HOME/.pm2/logs
  [[ "${PLEIADES_TEST:-}" != 1 || -z "${PLEIADES_PM2_LOGS:-}" ]] || PM2_LOGS=$PLEIADES_PM2_LOGS
  local private=${PLEIADES_PRIVATE_DIR:-$HOME/pleiades-private}
  (umask 077; mkdir -p "$private" && chmod 700 "$private") 2>/dev/null || stop 1 "백업 위치를 만들 수 없다"

  trap release_lock EXIT
  trap on_signal INT TERM HUP
  take_lock "$private/deploy.lock" || stop 1 "배포가 이 서버에서 진행 중이다(끝난 뒤 다시)"

  local backup
  backup="$private/fit-env-$(date +%Y%m%d-%H%M%S).bak"
  (umask 077; cp -p "$ENV_FILE" "$backup") 2>/dev/null || stop 1 "백업 실패 — 바꾸지 않았다"
  form "   백업 만듦(비공개 위치)"

  if [[ "$cmd" == on ]]; then
    ON_STARTED=1
    apply "" on on || stop 3 "켜기 판정 실패 — 위 줄 확인(폴링 시작 0 이면 텔레그램 왕복을 상한 안에 못 봤다 · 로그를 더 본다)"
    emit_form "통과 — 텔레그램 폴링 켜짐(병행)$(discord_note)"
    exit 0
  fi
  CHANGED=1
  if apply off off off; then
    CHANGED=0
    form "   되돌리기: deploy/telegram-polling.sh fit on"
    emit_form "통과 — 텔레그램 폴링 꺼짐(fit 은 Discord 만 받는다 · 텔레그램 /today 무응답 · Discord !today 응답을 1회 확인)"
    exit 0
  fi
  revert "끄기 판정 실패"
}

main "$@"
