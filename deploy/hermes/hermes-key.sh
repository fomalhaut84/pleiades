#!/usr/bin/env bash
# hermes-key.sh — hermes 출처 키 관리(014 §3-D · H-2 #800 · 런북 docs/runbooks/hermes.md B).
#
# 사용:  deploy/hermes/hermes-key.sh add <id> --name <표시 이름> [--expires YYYY-MM-DD] [--link-host <호스트>]… [--rate <분당>]
#        deploy/hermes/hermes-key.sh list | disable <id> | enable <id> | remove <id> | rotate <id> | expires <id> <YYYY-MM-DD|none>
#   서버의 ~/pleiades-hermes 안에서 사용자가 직접 부른다(Claude 서버 접근 금지 · I-3). 빌드된 dist 가 있어야 한다(hrm-inplace.sh 통과 뒤).
#   레지스트리 = ~/pleiades-hermes-data/sources.json(pm2 정의와 같은 자리) · 0600 · 키의 SHA-256 만 저장한다.
#   add · rotate 는 키를 **한 번만** 출력한다 — 출처 쪽 설정에 넣고 화면을 닫는다(세션 · 이슈 · 채팅에 붙이지 않는다).
#   받는 hermes 는 수정 시각으로 다시 읽는다 — 재기동이 필요 없다.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
CONFIG=$ROOT/deploy/hermes/pleiades-hrm.config.cjs
DIST=$ROOT/apps/hermes/dist/hermes.cjs
[[ $# -ge 1 ]] || { sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
[[ -f "$DIST" ]] || { echo "hermes-key: $DIST 가 없다 — hrm-inplace.sh 로 먼저 배포한다" >&2; exit 1; }
NV=$(node -p 'process.versions.node' 2>/dev/null || echo 없음)
[[ "$(printf '%s\n%s\n' 22.13.0 "$NV" | sort -V | head -1)" == 22.13.0 ]] || { echo "hermes-key: node $NV — node:sqlite 를 쓰는 dist 는 22.13 이상(hrm-inplace.sh 와 같은 node 로)" >&2; exit 1; }
REG=$(node -e "process.stdout.write(require(process.argv[1]).apps[0].env.HERMES_REGISTRY)" "$CONFIG")
(umask 077; mkdir -p "$(dirname "$REG")")
# 키 명령은 한 번에 하나 — 잠금 없는 읽기·고치기·쓰기라 동시에 돌리면 한쪽 변경이 사라진다(런북 B)
HERMES_REGISTRY="$REG" exec node --disable-warning=ExperimentalWarning "$DIST" key "$@"
