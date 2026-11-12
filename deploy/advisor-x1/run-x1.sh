#!/bin/bash
# run-x1.sh — 011 실험 X1 실행 래퍼 (#632 · 런북 docs/runbooks/advisor-x1.md).
# 사용(서버 · 사용자): bash ~/pleiades-advisor-x1/run-x1.sh [--preflight | --rerun=<budget|resume|prompt> [--max-budget=<usd>]]
#
# S-1 — 서버 배포 락(release-inplace.sh · discord-inbound.sh 와 같은 파일 $PRIVATE/deploy.lock)을 flock -n 으로 잡고
# 실험이 끝날 때까지 쥔다. 못 잡으면 x1.cjs 를 부르지 않는다(질문 0). 실험 동안 자동 배포는 락을 못 잡아 실패한다(011 §5-3).
# 자식(node · claude)은 락 fd 를 물려받지 않는다(9>&-) — 남은 자식이 락을 영영 쥐지 않게(release-inplace.sh nolock 과 같은 이유).
set -u
if [[ "$(uname -s)" == Darwin && "${PLEIADES_TEST:-}" != 1 ]]; then echo "결과: 중단 — 서버 전용이다(I-3)"; exit 1; fi
stop1() { printf "%s\n" "$1" "결과: 시작 안 함 — 질문 0"; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd -P)
PRIVATE=${PLEIADES_PRIVATE_DIR:-$HOME/pleiades-private}
LOCK=$PRIVATE/deploy.lock
NODE=$(command -v node) || { printf "%s\n" "S-1 node 없음" "결과: 시작 안 함 — 질문 0"; exit 1; }
[[ -d "$PRIVATE" ]] || { stop1 "S-1 배포 락: 비공개 위치가 없다(release-inplace 가 한 번도 돌지 않은 서버?)"; }

LOCK_DIR=
release() { [[ -z "$LOCK_DIR" ]] || rm -rf "$LOCK_DIR"; }
# 테스트만 mkdir 폴백을 고른다(release-inplace.sh take_lock 과 같은 규칙) — 서버에서 flock 이 없으면 시작하지 않는다
if [[ "${PLEIADES_TEST:-}" == 1 && "${PLEIADES_LOCK:-}" == mkdir ]]; then
  mkdir "$LOCK.d" 2>/dev/null || { stop1 "S-1 배포 락: 다른 배포가 진행 중이다(끝난 뒤 다시)"; }
  echo $$ > "$LOCK.d/pid"; LOCK_DIR="$LOCK.d"; KIND=mkdir
  trap release EXIT
elif command -v flock >/dev/null; then
  exec 9>>"$LOCK"
  flock -n 9 || { stop1 "S-1 배포 락: 다른 배포가 진행 중이다(끝난 뒤 다시)"; }
  KIND=flock
else
  stop1 "S-1 배포 락: flock 이 없다"
fi
trap 'exit 130' INT TERM HUP

X1_LOCK_HELD=1 X1_LOCK_KIND=$KIND "$NODE" "$HERE/x1.cjs" "$@" 9>&-
