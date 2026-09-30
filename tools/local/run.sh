#!/usr/bin/env bash
# run.sh — apps/* 를 로컬에서 기동·migrate 할 때 쓰는 유일한 입구 (#104 · 006 §4-5 L-1·L-2·L-7).
#
# 사용:  PLEIADES_VERIFY_BOT_IDS=<id,id> PLEIADES_VERIFY_CHAT_IDS=<id,…> tools/local/run.sh <fin|fit> -- <명령…>
#   예: tools/local/run.sh fin -- npx prisma migrate deploy      tools/local/run.sh fit -- npm run dev
# 하는 일: cwd = apps/<app> · 감싼 명령 사전 검사(precheck.py — npm/npx/node 만 · 파괴 명령 · 훅 판정기)
#         · PATH 맨 앞에 pleiades bin/(claude shim) · 셸의 DATABASE_URL·TELEGRAM_BOT_TOKEN 을 지운다(env -u)
#         → check_env.py 통과 시에만 실행.
# 선택 env: OTHER_TOKEN_ID(다른 앱 봇 id — 같은 봇 금지) · PLEIADES_ROOT(테스트용)
set -euo pipefail

die() { echo "run.sh: 중단 — $*" >&2; exit 1; }
[[ $# -ge 3 && "$2" == "--" ]] || { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
APP=$1; shift 2
case "$APP" in fin) DIR=finance ;; fit) DIR=fitness ;; *) die "앱은 fin 또는 fit" ;; esac

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=${PLEIADES_ROOT:-$(cd "$HERE/../.." && pwd)}

cd "$ROOT/apps/$DIR" || die "$ROOT/apps/$DIR 가 없다 — M-1 전이다"
# 감싼 명령을 다시 본다 — 훅은 바깥 run.sh 만 본다 (허용 프로그램 · 파괴 명령 정규화 · 훅 판정기 · PR #110 Codex P1)
python3 "$HERE/precheck.py" "$ROOT" "$PWD" -- "$@"
export PATH="$ROOT/bin:$PATH"
CHECK=(python3 "$HERE/check_env.py" "$APP" --root "$ROOT")
[[ -n "${OTHER_TOKEN_ID:-}" ]] && CHECK+=(--other-token-id "$OTHER_TOKEN_ID")
env -u DATABASE_URL -u TELEGRAM_BOT_TOKEN "${CHECK[@]}" >&2
exec env -u DATABASE_URL -u TELEGRAM_BOT_TOKEN "$@"
