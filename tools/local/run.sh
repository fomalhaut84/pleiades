#!/usr/bin/env bash
# run.sh — apps/* 를 로컬에서 기동·migrate 할 때 쓰는 유일한 입구 (#104 · 006 §4-5 L-1·L-2·L-7).
#
# 사용:  PLEIADES_VERIFY_BOT_IDS=<id,id> PLEIADES_VERIFY_CHAT_IDS=<id,…> tools/local/run.sh <fin|fit> -- <명령…>
#   예: tools/local/run.sh fin -- npx prisma migrate deploy      tools/local/run.sh fit -- npm run dev
# 하는 일: cwd = apps/<app> · PATH 맨 앞에 pleiades bin/(claude shim) · 셸의 DATABASE_URL·TELEGRAM_BOT_TOKEN 을 지운다(env -u)
#         → check_env.py 통과 시에만 실행. 공유 5432 를 망가뜨리는 prisma 명령은 거부한다(L-1).
# 선택 env: OTHER_TOKEN_ID(다른 앱 봇 id — 같은 봇 금지) · PLEIADES_ROOT(테스트용)
set -euo pipefail

die() { echo "run.sh: 중단 — $*" >&2; exit 1; }
[[ $# -ge 3 && "$2" == "--" ]] || { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
APP=$1; shift 2
case "$APP" in fin) DIR=finance ;; fit) DIR=fitness ;; *) die "앱은 fin 또는 fit" ;; esac

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=${PLEIADES_ROOT:-$(cd "$HERE/../.." && pwd)}
CMD=" $* "
# L-1: 공유 인스턴스에서 다른 DB 를 지우거나 shadow DB 를 만드는 명령
for bad in "migrate reset" "migrate dev" "force-reset" "dropdb" "DROP DATABASE"; do
  [[ "$CMD" != *"$bad"* ]] || die "'$bad' 는 쓰지 않는다 — 로컬 5432 는 사용자 개발 DB 와 공유다 (L-1 · I-14)"
done

cd "$ROOT/apps/$DIR" || die "$ROOT/apps/$DIR 가 없다 — M-1 전이다"
export PATH="$ROOT/bin:$PATH"
CHECK=(python3 "$HERE/check_env.py" "$APP" --root "$ROOT")
[[ -n "${OTHER_TOKEN_ID:-}" ]] && CHECK+=(--other-token-id "$OTHER_TOKEN_ID")
env -u DATABASE_URL -u TELEGRAM_BOT_TOKEN "${CHECK[@]}" >&2
exec env -u DATABASE_URL -u TELEGRAM_BOT_TOKEN "$@"
