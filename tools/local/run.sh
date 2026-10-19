#!/usr/bin/env bash
# run.sh — apps/* 를 로컬에서 기동·migrate 할 때 쓰는 유일한 입구 (#104 · 006 §4-5 L-1·L-2·L-7).
#
# 사용:  PLEIADES_VERIFY_BOT_IDS=<id,id> PLEIADES_VERIFY_CHAT_IDS=<id,…> tools/local/run.sh <fin|fit> -- <명령…>
#   예: tools/local/run.sh fin -- npx prisma migrate deploy      tools/local/run.sh fit -- npm run dev
# 하는 일: cwd = apps/<app> · 감싼 명령 사전 검사(precheck.py — npm/npx/node 만 · 파괴 명령 · 훅 판정기)
#         · PATH 맨 앞에 pleiades bin/(claude shim) · 셸의 DATABASE_URL·TELEGRAM_BOT_TOKEN 을 지운다(env -u)
#         · PM2_HOME = <root>/.pm2-local 고정(호출자 값 무시 — 로컬 pm2 는 전용 데몬만 · #171)
#         → check_env.py 통과 시에만 실행.
# 선택 env: OTHER_TOKEN_ID(다른 앱 봇 id — 없으면 다른 앱 .env 에서 읽는다 · 같은 봇 금지) · PLEIADES_ROOT(테스트용)
set -euo pipefail

die() { echo "run.sh: 중단 — $*" >&2; exit 1; }
[[ $# -ge 3 && "$2" == "--" ]] || { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
APP=$1; shift 2
case "$APP" in fin) DIR=finance ;; fit) DIR=fitness ;; *) die "앱은 fin 또는 fit" ;; esac

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=${PLEIADES_ROOT:-$(cd "$HERE/../.." && pwd)}

cd "$ROOT/apps/$DIR" || die "$ROOT/apps/$DIR 가 없다 — M-1 전이다"
# 감싼 명령을 다시 본다 — 훅은 바깥 run.sh 만 본다 (허용 프로그램 · 파괴 명령 정규화 · 훅 판정기 · PR #110 Codex P1)
RC=0; python3 "$HERE/precheck.py" "$ROOT" "$PWD" -- "$@" || RC=$?
[[ $RC -eq 0 || $RC -eq 3 ]] || exit "$RC"   # 3 = pm2 정리(stop·delete·kill) — 띄우는 것이 없으니 env 검사를 건너뛴다 (PR #172 Codex P2)
export PATH="$ROOT/bin:$PATH"
export PM2_HOME="$ROOT/.pm2-local"
if [[ $RC -eq 3 ]]; then
  # 정리는 살아 있는 데몬에만 — 없으면 pm2 가 이 셸 env 그대로 새 데몬을 띄우고 남긴다 (PR #172 Codex P1 2회차)
  PID=$(cat "$PM2_HOME/pm2.pid" 2>/dev/null || true)
  if [[ ! -S "$PM2_HOME/rpc.sock" || ! "$PID" =~ ^[0-9]+$ ]] || ! kill -0 "$PID" 2>/dev/null; then
    echo "run.sh: pm2 데몬이 없다 ($PM2_HOME) — 정리할 것 없음" >&2
    exit 0
  fi
fi
CHECK=(python3 "$HERE/check_env.py" "$APP" --root "$ROOT")
[[ -n "${OTHER_TOKEN_ID:-}" ]] && CHECK+=(--other-token-id "$OTHER_TOKEN_ID")
[[ $RC -eq 3 ]] || env -u DATABASE_URL -u TELEGRAM_BOT_TOKEN "${CHECK[@]}" >&2
exec env -u DATABASE_URL -u TELEGRAM_BOT_TOKEN "$@"
