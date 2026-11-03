#!/usr/bin/env bash
# db-offsite-pull.sh — 서버의 암호화된 DB 백업을 라즈베리파이로 가져온다 (#441).
#
# 사용:  db-offsite-pull.sh                       가져오기 1회(파이 crontab 이 부른다)
#        db-offsite-pull.sh --test-alert          알림 경로만 시험한다
#        db-offsite-pull.sh --accept-shrink <fin|fit>   DB 가 정말 줄었다고 사람이 인정한다
#
# 파이가 가져가는 방식이라 서버에는 파이 접속 정보가 없다. 복호화 키는 여기에도 두지 않는다.
# 설정은 ~/pleiades-offsite/config: HOST · PORT · REMOTE_USER · SSH_KEY · DEST · DISCORD_WEBHOOK.
# 실패 = 종료 코드 1 + Discord 알림(사유 코드만). 일요일 성공도 알린다 — 그 알림이 끊기면 파이가 멈춘 것이다.
#
# 침해된 서버도 파일을 보낼 수는 있다 — 받은 것으로 정상 사본이 밀려나지 않게 막는다(PR 전 리뷰 재현).
#  - 날짜가 오늘 뒤인 이름은 거부하고 16일보다 옛 이름은 저장하지 않는다 · 한 번에 앱별 16개까지만 받는다
#  - 지우는 수는 그 실행에서 새로 받은 수 이하 · 최대 2개 · 월별 첫 파일 12개는 30개와 별도로 남긴다
#  - 새 파일이 보관분 최대의 절반 아래면 경고하고 그 앱은 지우지 않는다
set -u

KEEP=30
KEEP_MONTHLY=12
MAX_NEW=16
MAX_DELETE=2
MAX_AGE_DAYS=16
MIN_BASELINE=1024
# 전송 총량 상한 = 속도 × 시간(2 MB/s × 300 s = 600 MB). 파일 수·크기를 서버가 속여도 이 값을 넘지 못한다.
# 여유 공간은 그보다 크게 요구한다 — 받는 중에 파이의 다른 서비스가 쓸 공간까지 채우지 않게
TRANSFER_KBPS=2048
TRANSFER_SECONDS=300
MIN_FREE_KB=$((1024 * 1024))
BASE="${PLEIADES_OFFSITE_BASE:-$HOME/pleiades-offsite}"
export TZ=Asia/Seoul
umask 077

[[ "$(uname -s)" == Darwin && "${PLEIADES_TEST:-}" != 1 ]] && { echo "db-offsite-pull.sh: 중단 — 파이 전용이다(I-3)" >&2; exit 1; }
case "$#:${1:-}:${2:-}" in
  0::|1:--test-alert:|2:--accept-shrink:fin|2:--accept-shrink:fit) ;;
  *) echo "사용법: db-offsite-pull.sh [--test-alert | --accept-shrink <fin|fit>]" >&2; exit 2 ;;
esac

CONFIG="$BASE/config"
HOST='' PORT=22 REMOTE_USER='' SSH_KEY='' DEST='' DISCORD_WEBHOOK=''
# shellcheck disable=SC1090
[[ -r "$CONFIG" ]] && . "$CONFIG"

alert() {
  [[ -n "$DISCORD_WEBHOOK" ]] || { echo "알림 실패: 웹훅 없음"; return 1; }
  # URL 은 표준 입력으로 넘겨 ps 에 보이지 않게 한다. 오류 출력에도 실릴 수 있어 내지 않는다. 메시지는 고정 문구와 사유 코드뿐이다
  if ! printf 'url = "%s"\n' "$DISCORD_WEBHOOK" | curl -fsS --max-time 10 --config - -H 'content-type: application/json' \
    -d "{\"content\":\"$1\",\"allowed_mentions\":{\"parse\":[]}}" >/dev/null 2>&1; then
    echo "알림 실패: 전송"
    return 1
  fi
}

fail() {
  echo "$(date +%Y%m%d-%H%M) 결과: 실패 — $1"
  alert "⚠️ DB 외부 사본 실패: $1"
  exit 1
}

day() {
  local t=$(($(date +%s) + $1 * 86400))
  date -d "@$t" +%Y%m%d 2>/dev/null || date -r "$t" +%Y%m%d
}

names_of() {
  find "$DEST" -maxdepth 1 -type f -name "$1-*.dump.age" 2>/dev/null | sed 's|.*/||' \
    | grep -E "^$1-[0-9]{8}-[0-9]{4}\.dump\.age$" | LC_ALL=C sort
}

size_of() { wc -c <"$DEST/$1" | tr -d ' '; }

# 인정 시각 뒤의 보관분 중 최대 크기와 비교한다 — 줄어든 파일이 다음 날의 기준이 되지 않게
is_shrunk() {
  local app=$1 names newest accepted='' after='' max=0 n size
  names=$(names_of "$app")
  [[ -n "$names" ]] || return 1
  newest=$(printf '%s\n' "$names" | tail -n 1)
  [[ -r "$DEST/.accept-shrink-$app" ]] && accepted=$(head -n 1 "$DEST/.accept-shrink-$app")
  [[ -n "$accepted" ]] && after="$app-$accepted"
  while IFS= read -r n; do
    [[ "$n" > "$after" ]] || continue
    size=$(size_of "$n")
    ((size > max)) && max=$size
  done <<<"$names"
  ((max >= MIN_BASELINE && $(size_of "$newest") * 2 < max))
}

prune_app() {
  local app=$1 limit=$2 names total anchors victims
  ((limit > MAX_DELETE)) && limit=$MAX_DELETE
  ((limit > 0)) || return 0
  names=$(names_of "$app")
  total=$(printf '%s\n' "$names" | grep -c .)
  ((total > KEEP)) || return 0
  anchors=$(printf '%s\n' "$names" | awk -v p="${#app}" '{m=substr($0,p+2,6)} !s[m]++' | tail -n "$KEEP_MONTHLY")
  victims=$(printf '%s\n' "$names" | head -n "$((total - KEEP))" | grep -Fxv -e "$anchors" | head -n "$limit")
  [[ -n "$victims" ]] || return 0
  while IFS= read -r n; do rm -f "$DEST/$n"; done <<<"$victims"
}

if [[ "${1:-}" == --test-alert ]]; then
  alert "🔔 DB 외부 사본 알림 시험" && { echo "알림 보냄"; exit 0; }
  exit 1
fi

[[ -r "$CONFIG" ]] || fail config
[[ -n "$HOST" && -n "$REMOTE_USER" && -n "$DEST" && -r "$SSH_KEY" && "$PORT" =~ ^[0-9]+$ && "$SSH_KEY" != *[[:space:]]* ]] || fail config
mkdir -p "$DEST" || fail write

if [[ "${1:-}" == --accept-shrink ]]; then
  date +%Y%m%d-%H%M >"$DEST/.accept-shrink-$2" || fail write
  echo "$2 크기 기준을 초기화했다 — 다음 실행부터 옛 사본을 다시 정리한다"
  exit 0
fi

LOCK="$DEST/.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  [[ -n "$(find "$LOCK" -maxdepth 0 -mmin +360 2>/dev/null)" ]] || fail locked
  rmdir "$LOCK" && mkdir "$LOCK" || fail locked
fi
INCOMING="$DEST/.incoming"
trap 'rm -rf "$INCOMING"; rmdir "$LOCK" 2>/dev/null' EXIT
rm -rf "$INCOMING"
mkdir -p "$INCOMING" || fail write

free_kb=$(df -Pk "$DEST" | awk 'NR==2{print $4}')
[[ "$free_kb" =~ ^[0-9]+$ && "$free_kb" -ge "$MIN_FREE_KB" ]] || fail disk

# 이미 가진 파일은 받지 않는다 — 서버가 옛 사본을 바꿔치기할 수 없다. --delete 없음.
# 규칙은 앞에서부터 먼저 맞는 것이 이긴다 — 가진 파일 제외를 허용 앞에 둔다. 받은 이름은 아래에서 다시 거른다
ssh_cmd="ssh -i $SSH_KEY -p $PORT -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=20"
held=()
for f in "$DEST"/*.dump.age; do [[ -e "$f" ]] && held+=("--exclude=/${f##*/}"); done
timeout "$TRANSFER_SECONDS" rsync -r --timeout=60 --max-size=500M --bwlimit="$TRANSFER_KBPS" "${held[@]+"${held[@]}"}" --include='/fin-*.dump.age' --include='/fit-*.dump.age' --exclude='*' \
  -e "$ssh_cmd" "$REMOTE_USER@$HOST:/" "$INCOMING/" >/dev/null 2>&1
rc=$?
((rc == 0)) || fail "rsync(rc=$rc)"

TODAY=$(day 0)
YESTERDAY=$(day -1)
OLDEST=$(day "-$MAX_AGE_DAYS")
new_fin=0 new_fit=0 skipped=0
# 전부 검사한 뒤에 옮긴다 — 나쁜 파일이 하나라도 있으면 그 실행에서는 아무것도 보관하지 않는다
for f in "$INCOMING"/* "$INCOMING"/.[!.]*; do
  [[ -e "$f" || -L "$f" ]] || continue
  name=${f##*/}
  [[ -f "$f" && ! -L "$f" && "$name" =~ ^(fin|fit)-([0-9]{4})(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])-([01][0-9]|2[0-3])[0-5][0-9]\.dump\.age$ ]] || fail badfile
  app=${name%%-*}
  d=${name:4:8}
  [[ "$d" > "$TODAY" ]] && fail badfile
  if [[ "$d" < "$OLDEST" ]]; then
    rm -f "$f"
    skipped=$((skipped + 1))
    continue
  fi
  if [[ -e "$DEST/$name" ]]; then
    rm -f "$f"
    continue
  fi
  [[ "$(head -c 21 "$f" | tr -d '\0')" == age-encryption.org/v1 ]] || fail badfile
  if [[ "$app" == fin ]]; then new_fin=$((new_fin + 1)); else new_fit=$((new_fit + 1)); fi
done
((new_fin <= MAX_NEW && new_fit <= MAX_NEW)) || fail toomany

for f in "$INCOMING"/*.dump.age; do
  [[ -e "$f" ]] || continue
  chmod 600 "$f"
  mv -n "$f" "$DEST/${f##*/}" || fail write
done
sync

# 이름의 날짜로 본다 — mtime 은 서버가 정한 값이다. 최신이 없는 앱은 옛 사본을 지우지 않는다
problems=''
for app in fin fit; do
  latest=$(names_of "$app" | tail -n 1)
  latest_day=${latest:4:8}
  if [[ -z "$latest" || "$latest_day" < "$YESTERDAY" ]]; then
    problems="$problems $app(stale)"
  elif is_shrunk "$app"; then
    problems="$problems $app(shrink)"
  elif [[ "$app" == fin ]]; then
    prune_app fin "$new_fin"
  else
    prune_app fit "$new_fit"
  fi
done

counts="fin $(names_of fin | grep -c .) · fit $(names_of fit | grep -c .)"
[[ -z "$problems" ]] || fail "${problems# }"
echo "$(date +%Y%m%d-%H%M) 결과: 통과 — 새 파일 $((new_fin + new_fit)) · 옛 이름 무시 $skipped · 보관 $counts"
if [[ "$(date +%u)" == 7 ]]; then
  alert "✅ 주간 DB 외부 사본 정상: 보관 $counts"
fi
exit 0
