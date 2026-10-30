#!/usr/bin/env bash
# discord-inbound.sh — 앱 Discord 메시지 수신 켜기·끄기 (009 D-2 PR-3 · #367 · fin D-3 PR-3 · #398). 서버에서 사용자가 실행한다(Claude 는 서버에 닿지 않는다 · I-3).
#
# 사용:  deploy/discord-inbound.sh <fit|fin> on <채널ID> [--dry-run]   백업 → 대화 채널 키 1줄 기입 → pleiades-<앱>-bot 재시작 → 판정
#        deploy/discord-inbound.sh <fit|fin> off [--dry-run]           백업 → 키 줄 비움 → pleiades-<앱>-bot 재시작 → 판정 (되돌리기)
#   먼저: 운영 그 앱 봇 포털 MESSAGE CONTENT 토글 켬 · 대화 채널(알림 채널과 같아도 된다)에 봇 권한.
# 플랫폼 설정: PLEIADES_ENV_FILE(절대경로) 또는 ~/pleiades-platform.env(release-inplace.sh 와 같다). 키 DISCORD_CHANNEL_ID_<FITNESS|FINANCE>_CHAT 한 줄만 쓴다.
# 출력: 판정 양식만 — 값(채널 ID · 토큰 · 경로)은 내지 않는다. 백업은 ~/pleiades-private/(700).
# 종료: 0 통과 · 1 중단(바꾸기 전) · 2 사용법 · 3 바꾼 뒤 판정 실패(on 이면 키를 비우고 재시작해 되돌린다 — 되돌림 성패를 따로 적는다)
# 로컬(Darwin)은 --dry-run 만(I-3). 끄기의 "즉시" 는 키 비움 → 다음 메시지부터 무시(재시작 없이) — 재시작은 intents 까지 0 으로.

set -uo pipefail
export LC_ALL=C

READY_WAIT=${PLEIADES_READY_WAIT:-90}

# 앱별 표 — 키 · pm2 이름 · 로그 label · 통과 안내. 알 수 없는 앱이면 1(사용법)
# 판정 문자열 — 앱(apps/<dir>/src/bot/notifications/discord-interactions.ts)과 chat gateway 가 찍는다(deploy/test_discord_inbound.py 가 고정)
set_app() {  # <fit|fin>
  case "$1" in
    fit) KEY=DISCORD_CHANNEL_ID_FITNESS_CHAT; BOT=pleiades-fit-bot; LABEL=discord-fit
         PASS_HINT="대화 채널에서 !today · 자유 텍스트 · 사진 1회씩 확인" ;;
    fin) KEY=DISCORD_CHANNEL_ID_FINANCE_CHAT; BOT=pleiades-fin-bot; LABEL=discord-fin
         PASS_HINT="대화 채널에서 !help · 한글 명령 1 개 · 소비 1 건 확인" ;;
    *) return 1 ;;
  esac
  READY_LINE="[$LABEL] gateway 준비 완료"
  ON_LINE="[$LABEL] 메시지 수신 켜짐(대화 채널)"
  OFF_LINE="[$LABEL] 메시지 수신 꺼짐(버튼만)"
  DEGRADE_LINE="[$LABEL] MESSAGE CONTENT 미허용(4014)"
  FATAL_LINE="[$LABEL] gateway 종료 코드"
}

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
node_step() {  # <인자…>
  local res line ok=1
  res=$(node "$HERE/discord-inbound.cjs" "$@" 2>/dev/null) || true
  while IFS= read -r line; do
    case "$line" in
      "F "*) form "   ${line#F }" ;;
      "RESULT ok") ok=0 ;;
    esac
  done <<<"$res"
  return $ok
}

# 서버 배포 락을 같이 쓴다(discord-switch.sh 와 같다) — 자동 배포(봇 재기동)와 겹치지 않게. flock 이 없으면(macOS 테스트) mkdir
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

# 봇 로그에서 재시작 뒤에 붙은 바이트만(discord-switch.sh 와 같은 방식 — 옛 줄로 거짓 통과하지 않게 · 로테이션이면 처음부터)
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

# 도는 봇 — "<online 1/0> <PLEIADES_ENV_FILE 같음 1/0> <pm2 env 에 키 있음 1/0>". 이름만 대조하고 값은 내지 않는다.
# pm2 restart 는 저장된 env 를 그대로 쓴다 — 키가 pm2 env 에 있으면 파일을 비워도 꺼지지 않는다(N30). 둘 다 본다(discord-switch.sh env_same)
bot_state() {  # <파일>
  pm2 jlist 2>/dev/null 9>&- | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const i = s.search(/\[\{|\[\]/); let list = []; try { list = JSON.parse(s.slice(i)) } catch {}
      const p = list.find((x) => x.name === process.argv[1])
      if (!p) { process.stdout.write("0 0 0"); return }
      const env = p.pm2_env || {}; const nested = env.env || {}
      const file = env.PLEIADES_ENV_FILE ?? nested.PLEIADES_ENV_FILE
      const key = Object.prototype.hasOwnProperty.call(env, process.argv[3]) || Object.prototype.hasOwnProperty.call(nested, process.argv[3])
      process.stdout.write(`${env.status === "online" ? 1 : 0} ${file === process.argv[2] ? 1 : 0} ${key ? 1 : 0}`) })' "$BOT" "$1" "$KEY"
}

count() { grep -cF -- "$1" <<<"$2"; }

# 키 줄을 쓰고(값 = $1 · 빈 값이면 끔) 봇을 재시작한 뒤 판정. <단계 이름> <on|off>
apply() {  # <값> <단계> <기대>
  local value=$1 phase=$2 want=$3
  INBOUND_VALUE=$value node_step set "$FILE" "$KEY" || { form "   [$phase] 키 줄을 쓰지 못했다"; return 1; }
  mark_logs
  pm2 restart "$BOT" >/dev/null 2>&1 9>&- || { form "   [$phase] $BOT 재시작 실패"; return 1; }
  sleep "${PLEIADES_RESTART_SETTLE:-3}"
  judge "$phase" "$want"
}

judge() {  # <단계> <on|off>
  local phase=$1 want=$2 waited=0 lines=
  while (( waited < READY_WAIT )); do
    lines=$(since)
    (( $(count "$READY_LINE" "$lines") >= 1 )) && break
    sleep 3; waited=$((waited + 3))
  done
  lines=$(since)
  local ready on off degrade fatal st
  ready=$(count "$READY_LINE" "$lines")
  on=$(count "$ON_LINE" "$lines")
  off=$(count "$OFF_LINE" "$lines")
  degrade=$(count "$DEGRADE_LINE" "$lines")
  fatal=$(count "$FATAL_LINE" "$lines")
  read -r -a st <<<"$(bot_state "$FILE")"
  form "   [$phase] 재시작 뒤 준비 완료 $ready (대기 ${waited}s · 상한 ${READY_WAIT}s)"
  form "   [$phase] 메시지 수신 켜짐(대화 채널) $on"
  form "   [$phase] 메시지 수신 꺼짐(버튼만) $off"
  form "   [$phase] MESSAGE CONTENT 미허용(4014) 강등 $degrade"
  form "   [$phase] gateway 종료 코드 $fatal"
  form "   [$phase] 봇 online ${st[0]:-0} · PLEIADES_ENV_FILE 같음 ${st[1]:-0}"
  form "   [$phase] pm2 env 키 $([[ "${st[2]:-1}" == 0 ]] && echo 없음 || echo 있음)"
  node_step state "$FILE" "$KEY" >/dev/null || form "   [$phase] 플랫폼 파일 키 읽기 실패"
  local file_ok=1
  if [[ "$want" == on ]]; then
    grep -q "플랫폼 파일 키 설정됨" <<<"${FORM[*]: -1}" && file_ok=0
    (( ready >= 1 && on >= 1 && off == 0 && degrade == 0 && fatal == 0 )) || return 1
  else
    grep -q "플랫폼 파일 키 비어 있음" <<<"${FORM[*]: -1}" && file_ok=0
    (( ready >= 1 && off >= 1 && on == 0 && degrade == 0 && fatal == 0 )) || return 1
  fi
  [[ "${st[0]:-0}" == 1 && "${st[1]:-0}" == 1 && "${st[2]:-1}" == 0 && $file_ok -eq 0 ]]
}

# on 실패 — 키를 비우고 재시작해 버튼만으로 되돌린다(반쯤 켜진 상태로 두지 않는다 · 키를 둔 채면 재시작마다 강등 + 알림 + IDENTIFY 2)
revert() {  # <이유>
  CHANGED=0
  # 직전에 다른 채널로 켜져 있었어도 그 값으로 돌리지 않는다 — 끔(버튼만)이 되돌림이다 (PR-3 사전 리뷰 info 2)
  [[ $PREV_SET -eq 1 ]] && form "   되돌림 = 끔(직전 값 복원 아님 · 직전 값은 백업에)"
  if apply "" 되돌림 off; then
    form "   되돌림 성공"
    stop 3 "$1 — 키를 비우고 버튼만으로 되돌렸다(포털 MESSAGE CONTENT 토글 · 채널 권한 확인 후 다시 on)"
  fi
  form "   되돌림 실패"
  stop 3 "$1 · 되돌림도 판정 실패 — 백업에서 복원하거나 off 를 다시"
}

CHANGED=0
OFF_STARTED=0
PREV_SET=0
on_signal() {
  trap '' INT TERM HUP
  [[ $CHANGED -eq 1 ]] && revert "중단 신호"
  # off 는 키를 비운 뒤일 수 있다 — 안전한 쪽(다음 메시지부터 무시)이지만 재시작·판정은 미확인 (PR-3 사전 리뷰 info 1)
  [[ $OFF_STARTED -eq 1 ]] && stop 130 "중단 신호 — 끄기 진행 중(키 비움 뒤일 수 있다 · 재시작·판정 미확인 → off 를 다시)"
  stop 130 "중단 신호 — 바꾸기 전"
}

main() {
  local app=${1:-} cmd=${2:-} channel= dry=0
  shift 2 2>/dev/null || usage
  if [[ "$cmd" == on ]]; then channel=${1:-}; shift || usage; fi
  for a in "$@"; do case "$a" in --dry-run) dry=1 ;; *) usage ;; esac; done
  case "$cmd" in on|off) ;; *) usage ;; esac
  form "CMD $app $cmd$([[ $dry -eq 1 ]] && echo ' --dry-run')"
  set_app "$app" || usage
  if [[ "$cmd" == on ]]; then
    [[ "$channel" =~ ^[0-9]{17,20}$ ]] || stop 2 "채널 ID 형식이 아니다(숫자 17~20자리)"
    form "   채널 ID 형식 통과"
  fi

  HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
  [[ $dry -eq 1 || "$(uname -s)" != Darwin || "${PLEIADES_TEST:-}" == 1 ]] || stop 1 "로컬에서는 --dry-run 만 — 서버 전용(I-3)"

  local file=${PLEIADES_ENV_FILE:-$HOME/pleiades-platform.env}
  FILE=$file
  [[ "$file" == /* ]] || stop 1 "PLEIADES_ENV_FILE 는 절대경로여야 한다"

  if [[ $dry -eq 1 ]]; then
    if [[ -f "$file" ]]; then
      local dperm
      dperm=$(stat -c '%a' "$file" 2>/dev/null || stat -f '%Lp' "$file" 2>/dev/null || echo 없음)
      form "   플랫폼 설정 있음 · 권한 $dperm"
      command -v node >/dev/null && node_step state "$file" "$KEY" >/dev/null
    else
      form "   플랫폼 설정 없음"
    fi
    form "   단계(바꾸지 않는다): 백업 → 키 줄 $([[ "$cmd" == on ]] && echo 기입 || echo 비움) → $BOT 재시작 → 판정"
    emit_form "dry-run — 바꾸지 않았다"
    exit 0
  fi

  local bin
  for bin in node pm2; do command -v "$bin" >/dev/null || stop 1 "$bin 이 PATH 에 없다(nvm 이면 셸 프로필)"; done
  [[ -f "$file" ]] || stop 1 "플랫폼 설정 파일이 없다"
  local perm
  perm=$(stat -c '%a' "$file" 2>/dev/null || stat -f '%Lp' "$file" 2>/dev/null || echo 없음)
  form "   플랫폼 설정 권한 $perm"
  [[ "$perm" == 600 ]] || stop 1 "플랫폼 설정 권한이 600 이 아니다"
  node_step state "$file" "$KEY" || stop 1 "플랫폼 설정을 읽지 못했다"
  grep -q "플랫폼 파일 키 설정됨" <<<"${FORM[*]: -1}" && PREV_SET=1

  local st
  read -r -a st <<<"$(bot_state "$file")"
  form "   바꾸기 전 · 봇 online ${st[0]:-0} · PLEIADES_ENV_FILE 같음 ${st[1]:-0} · pm2 env 키 $([[ "${st[2]:-1}" == 0 ]] && echo 없음 || echo 있음)"
  [[ "${st[0]:-0}" == 1 ]] || stop 1 "$BOT 이 online 이 아니다"
  [[ "${st[1]:-0}" == 1 ]] || stop 1 "도는 봇의 PLEIADES_ENV_FILE 이 이 파일과 다르다 — 셸의 PLEIADES_ENV_FILE 을 풀고(unset) 다시"
  [[ "${st[2]:-1}" == 0 ]] || stop 1 "도는 봇의 pm2 env 에 $KEY 가 있다 — 플랫폼 파일이 가려진다(pm2 설정에서 빼고 다시)"

  PM2_LOGS=$HOME/.pm2/logs
  [[ "${PLEIADES_TEST:-}" != 1 || -z "${PLEIADES_PM2_LOGS:-}" ]] || PM2_LOGS=$PLEIADES_PM2_LOGS
  local private=${PLEIADES_PRIVATE_DIR:-$HOME/pleiades-private}
  (umask 077; mkdir -p "$private" && chmod 700 "$private") 2>/dev/null || stop 1 "백업 위치를 만들 수 없다"

  trap release_lock EXIT
  trap on_signal INT TERM HUP
  take_lock "$private/deploy.lock" || stop 1 "배포가 이 서버에서 진행 중이다(끝난 뒤 다시)"

  local backup
  backup="$private/platform-env-$(date +%Y%m%d-%H%M%S).bak"
  (umask 077; cp -p "$file" "$backup") 2>/dev/null || stop 1 "백업 실패 — 바꾸지 않았다"
  form "   백업 만듦(비공개 위치)"

  if [[ "$cmd" == off ]]; then
    OFF_STARTED=1
    apply "" off off || stop 3 "끄기 판정 실패 — 위 줄 확인(pm2 env 키 있음 · PLEIADES_ENV_FILE 다름이면 파일을 비워도 꺼지지 않는다)"
    emit_form "통과 — 메시지 수신 꺼짐(버튼만)"
    exit 0
  fi
  CHANGED=1
  if apply "$channel" on on; then
    CHANGED=0
    form "   되돌리기: deploy/discord-inbound.sh $app off"
    emit_form "통과 — 메시지 수신 켜짐($PASS_HINT)"
    exit 0
  fi
  revert "켜기 판정 실패(강등 ≥1 이면 포털 MESSAGE CONTENT 토글이 꺼져 있다)"
}

main "$@"
