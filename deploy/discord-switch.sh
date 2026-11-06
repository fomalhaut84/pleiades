#!/usr/bin/env bash
# discord-switch.sh — Discord 플랫폼 설정 점검 (#314 · 007 T-10 · Q80). 서버에서 사용자가 실행한다(Claude 는 서버에 닿지 않는다 · I-3).
#
# 사용:  deploy/discord-switch.sh check [--no-send]   플랫폼 설정 600 · 필요한 키 9 · 형식 · 웹훅 4·봇 채널 2 에 시험 메시지
# 플랫폼 설정: PLEIADES_ENV_FILE(절대경로) 또는 ~/pleiades-platform.env. 이 스크립트는 읽기만 한다.
# 출력: 판정 양식만. 값(웹훅 URL · 토큰 · ID)은 내지 않는다.
# 종료: 0 통과 · 1 중단 · 2 사용법
# 옛 on·off(스위치 4줄 쓰기 · 봇 재시작 · 옛 채널 되돌리기)는 009 D-5 B1(#502)에서 지웠다 — 돌아갈 옛 채널이 없다.
# 그 이전 태그로 R-8 하면 그 태그의 스크립트가 돌아온다.

set -uo pipefail
export LC_ALL=C

usage() { sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
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

# 도는 web·bot 이 읽는 플랫폼 설정이 이 파일인지 — 다른 파일을 점검하면 판정만 통과하고 앱은 다른 값을 쓴다
# (PR #318 Codex P2 · release-inplace.sh C1 과 같은 대조). 값은 내지 않는다
# 출력: "<봇 수> <같음> <다름·없음>"
env_same() {  # <파일>
  pm2 jlist 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const i = s.search(/\[\{|\[\]/); let list = []; try { list = JSON.parse(s.slice(i)) } catch {}
      const mine = list.filter((p) => /^pleiades-(fin|fit)-(web|bot)$/.test(p.name))
      const bots = mine.filter((p) => /-bot$/.test(p.name)).length
      const v = (p) => p.pm2_env.PLEIADES_ENV_FILE ?? (p.pm2_env.env || {}).PLEIADES_ENV_FILE
      const same = mine.filter((p) => v(p) === process.argv[1]).length
      process.stdout.write(`${bots} ${same} ${mine.length - same}`) })' "$1"
}

main() {
  local cmd=${1:-} send=1
  shift || true
  for a in "$@"; do case "$a" in --no-send) send=0 ;; *) usage ;; esac; done
  [[ "$cmd" == check ]] || usage

  HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
  form "CMD $cmd$([[ $send -eq 1 ]] || echo ' --no-send')"
  [[ "$(uname -s)" != Darwin || "${PLEIADES_TEST:-}" == 1 ]] || stop 1 "로컬에서는 돌리지 않는다 — 서버 전용(I-3)"
  local bin
  for bin in node pm2; do command -v "$bin" >/dev/null || stop 1 "$bin 이 PATH 에 없다(nvm 이면 셸 프로필)"; done

  local file=${PLEIADES_ENV_FILE:-$HOME/pleiades-platform.env}
  [[ "$file" == /* ]] || stop 1 "PLEIADES_ENV_FILE 는 절대경로여야 한다"
  [[ -f "$file" ]] || stop 1 "플랫폼 설정 파일이 없다"
  local perm
  perm=$(stat -c '%a' "$file" 2>/dev/null || stat -f '%Lp' "$file" 2>/dev/null || echo 없음)
  form "   플랫폼 설정 권한 $perm"
  [[ "$perm" == 600 ]] || stop 1 "플랫폼 설정 권한이 600 이 아니다"
  node_step state "$file" || stop 1 "스위치 상태를 읽지 못했다"
  local es
  read -r -a es <<<"$(env_same "$file")"
  form "   도는 web·bot 플랫폼 설정 same ${es[1]:-0} · DIFF/MISSING ${es[2]:-?} · 봇 ${es[0]:-0}"
  [[ "${es[0]:-0}" == 2 && "${es[2]:-1}" == 0 ]] \
    || stop 1 "도는 프로세스의 PLEIADES_ENV_FILE 이 이 파일과 다르거나 봇이 없다 — 셸의 PLEIADES_ENV_FILE 을 풀고(unset) 다시"

  local args=(check "$file"); [[ $send -eq 1 ]] || args+=(--no-send)
  if node_step "${args[@]}"; then emit_form "통과 — 설정이 갖춰졌다"; exit 0; fi
  stop 1 "점검 실패 — 위 줄의 키를 채우거나 고친 뒤 다시"
}

main "$@"
