#!/usr/bin/env bash
# db-offsite-serve.sh — 파이 키의 forced command (#441). 암호화 사본의 목록과 내용만 내보낸다.
#
# 명령은 둘뿐이다:  list  ·  get <이름>
# 쓰기·삭제 기능이 없다 — 파이 키가 유출돼도 암호문을 읽는 것이 전부다. 설치는 docs/runbooks/db-backup.md 6절.
set -u

DIR=/backup/pleiades-db/offsite
[[ "${PLEIADES_TEST:-}" == 1 && -n "${PLEIADES_OFFSITE_DIR:-}" ]] && DIR=$PLEIADES_OFFSITE_DIR
NAME_RE='^(fin|fit)-[0-9]{8}-[0-9]{4}\.dump\.age$'
CMD=${SSH_ORIGINAL_COMMAND:-}

deny() {
  echo "거부" >&2
  exit 2
}

if [[ "$CMD" == list ]]; then
  shopt -s nullglob
  for f in "$DIR"/*.dump.age; do
    name=${f##*/}
    [[ "$name" =~ $NAME_RE && -f "$f" && ! -L "$f" ]] && printf '%s\n' "$name"
  done
  exit 0
fi

if [[ "$CMD" == get\ * ]]; then
  name=${CMD#get }
  [[ "$name" =~ $NAME_RE ]] || deny
  f="$DIR/$name"
  [[ -f "$f" && ! -L "$f" ]] || deny
  exec cat -- "$f"
fi

deny
