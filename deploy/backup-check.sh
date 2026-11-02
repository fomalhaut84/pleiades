#!/usr/bin/env bash
# backup-check.sh — 서버 DB 백업 현황을 읽기만 해 판정 양식을 출력한다 (#441).
#
# 사용:  sudo -v; bash backup-check.sh [--backup-dir DIR]     (기본 /backup)
#   서버에서 사용자가 실행한다 — Claude 세션은 서버에 닿지 않는다(I-3). 로컬(Darwin)은 거부
#   sudo -v 를 먼저 하면 잠긴 파일과 root·postgres 쪽까지 본다. 비밀번호를 묻지 않는다(sudo -n) — 안 되면 "미확인" 으로 적는다
#
# 출력은 개수·일수·용량·예/아니오뿐이다 — 경로·파일 이름·crontab 원문·DB 이름을 내지 않는다(오류 출력도 버린다).
# 전부 읽기다. 덤프를 뜨지 않고 어떤 파일도 쓰지 않는다.
# 탐지는 이름 기준의 후보다 — "못 찾음" 은 없다는 보증이 아니다. 복원 가능 여부와 서버 밖 보관은 이 스크립트로 알 수 없다.

usage() { sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

BACKUP_DIR=/backup
while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup-dir) [[ $# -ge 2 ]] || usage; BACKUP_DIR=$2; shift 2 ;;
    *) usage ;;
  esac
done

[[ "$(uname -s)" != "Darwin" ]] || { echo "backup-check.sh: 중단 — 서버 전용이다(I-3)" >&2; exit 1; }

exec 2>/dev/null   # 잠긴 파일의 오류 문구에 경로가 실린다 — 공개 양식이라 오류 출력을 통째로 버린다
set -uo pipefail

# 테스트만 바꾼다 — 기본값이 실제 서버 경로다
ETC_ROOT=${BACKUP_CHECK_ETC:-/etc}
VAR_BACKUPS=${BACKUP_CHECK_VAR_BACKUPS:-/var/backups}
PG_HOME=${BACKUP_CHECK_PGDATA:-/var/lib/postgresql}

SCHED_RE='pg_dump|pg_basebackup|pgbackrest|restic|borg|rclone|(^|[^a-z])backup([^s]|$)'
SYSTEM_RE='dpkg-db-backup'   # 시스템이 스스로 도는 항목 — DB 백업이 아니다
FRESH_DAYS=2                 # 일수 내림이라 "2 미만" = 48 시간 미만
MIN_BYTES=1024               # pg_dump 가 실패해도 빈 파일은 생긴다

SUDO_OK=0
sudo -n true >/dev/null && SUDO_OK=1
priv() { if [[ $SUDO_OK -eq 1 ]]; then sudo -n "$@"; else "$@"; fi; }
is_int() { [[ "$1" =~ ^[0-9]+$ ]]; }

count_sched() { grep -vE '^[[:space:]]*(#|$)' | grep -viE "$SYSTEM_RE" | grep -ciE "$SCHED_RE" || true; }

crontab_count() {  # $@ = crontab 명령 — "없음" 과 확인 실패를 가른다
  local out rc
  out=$("$@" -l 2>&1); rc=$?
  if [[ $rc -eq 0 ]]; then printf '%s\n' "$out" | count_sched
  elif [[ "$out" == *"no crontab"* ]]; then echo 0
  else echo 미확인; fi
}

ETC_CRON=0; ETC_FAIL=0
scan_etc() {
  local f content
  for f in "$ETC_ROOT/crontab" "$ETC_ROOT"/cron.d/* "$ETC_ROOT"/cron.hourly/* "$ETC_ROOT"/cron.daily/* \
           "$ETC_ROOT"/cron.weekly/* "$ETC_ROOT"/cron.monthly/*; do
    [[ -f "$f" ]] || continue
    if ! content=$(priv cat "$f"); then ETC_FAIL=$((ETC_FAIL + 1)); continue; fi
    if [[ "$(printf '%s\n' "$content" | count_sched)" != "0" ]]; then ETC_CRON=$((ETC_CRON + 1)); fi
  done
}

TIMERS=미확인; TIMER_NOTE=; TIMER_PARTIAL=0
scan_timers() {  # 유닛 이름만 본다 — 이름에 드러나지 않는 타이머는 놓친다
  local sys usr
  sys=$(systemctl list-timers --all --no-legend --no-pager) || return
  # ssh 세션은 사용자 서비스 관리자에 못 붙을 수 있다 — 못 본 것을 0 으로 적지 않는다(PR #442 Codex P2)
  if ! usr=$(systemctl --user list-timers --all --no-legend --no-pager); then
    usr=; TIMER_NOTE=" (사용자 타이머 미확인)"; TIMER_PARTIAL=1
  fi
  TIMERS=$(printf '%s\n%s\n' "$sys" "$usr" | count_sched)
}

FIND_PARTIAL=0
PARTIAL_MARK='//find-partial//'   # 경로로 나올 수 없는 줄 — find 실패를 $( ) 밖으로 알린다
find_dumps() {
  local root list
  for root in "$BACKUP_DIR" "$VAR_BACKUPS" "${HOME:-}" "$PG_HOME"; do
    [[ -n "$root" ]] || continue
    priv test -d "$root" || { [[ ! -e "$root" ]] || echo "$PARTIAL_MARK"; continue; }
    # -H: 백업 위치가 볼륨으로 가는 심링크여도 따라간다 · pg_wal 의 *.backup 은 기록 파일이다
    list=$(priv find -H "$root" -maxdepth 6 \
        \( -type d \( -name node_modules -o -name .git -o -name .next -o -name .npm -o -name .nvm -o -name .pm2 \
                      -o -name .cache -o -name dist -o -name prisma -o -name migrations -o -name pg_wal \) -prune \) -o \
        -type f ! -name '.env*' \( -name '*.dump' -o -name '*.dump.*' -o -name '*.pgdump' -o -name '*.pgdump.*' \
                   -o -name '*.sql.*' -o -name '*dump*.tar*' -o -name '*backup*.tar*' -o -name 'toc.dat' \
                   -o -name '*.backup' -o -name '*.bak' -o -name '*.sql' \) -print) || echo "$PARTIAL_MARK"
    printf '%s\n' "$list"
  done
}

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

skip_weak_match() {  # 참 = 건너뛴다. 약한 확장자는 이름·부모 디렉터리에 백업 낱말이 있거나 백업 위치 안일 때만 덤프로 본다
  local f=$1 s
  case "$f" in
    *.backup|*.bak|*.sql) ;;
    *) return 1 ;;
  esac
  case "$f" in "$BACKUP_DIR"/*|"$VAR_BACKUPS"/*) return 1 ;; esac
  s=$(lower "$(basename "$(dirname "$f")")/$(basename "$f")")
  [[ ! "$s" =~ backup|dump ]]
}

app_of() {
  local s
  s=$(lower "$1")
  if [[ "$s" =~ (^|[^a-z])(my)?(fin|finance)(db)?([^a-z]|$) ]]; then echo fin
  elif [[ "$s" =~ (^|[^a-z])(my)?(fit|fitness)(db)?([^a-z]|$) ]]; then echo fit
  fi
}

classify() {  # 파일 이름이 먼저 · 부모 디렉터리는 대체 수단
  local a
  a=$(app_of "$(basename "$1")")
  [[ -n "$a" ]] || a=$(app_of "$(basename "$(dirname "$1")")")
  echo "${a:-미분류}"
}

NOW=$(date +%s)
TOTAL=0; BYTES=0; OPEN_PERM=0; TINY=0; META_FAIL=0
FIN_N=0; FIN_MIN=; FIT_N=0; FIT_MIN=; ETC_N=0; ETC_MIN=
ALL=$(find_dumps | sort -u)
while IFS= read -r f; do
  [[ -n "$f" ]] || continue
  if [[ "$f" == "$PARTIAL_MARK" ]]; then FIND_PARTIAL=1; continue; fi
  skip_weak_match "$f" && continue
  size=$(priv ls -ln "$f" | awk '{ print $5 }')
  m=$(priv date -r "$f" +%s)
  if ! is_int "${size:-x}" || ! is_int "${m:-x}"; then META_FAIL=$((META_FAIL + 1)); continue; fi
  if [[ $size -lt $MIN_BYTES ]]; then TINY=$((TINY + 1)); continue; fi
  age=$(( (NOW - m) / 86400 )); [[ $age -ge 0 ]] || age=0
  TOTAL=$((TOTAL + 1)); BYTES=$((BYTES + size))
  [[ -z "$(priv find "$f" \( -perm -040 -o -perm -004 \))" ]] || OPEN_PERM=$((OPEN_PERM + 1))
  case "$(classify "$f")" in
    fin) FIN_N=$((FIN_N + 1)); if [[ -z "$FIN_MIN" || $age -lt $FIN_MIN ]]; then FIN_MIN=$age; fi ;;
    fit) FIT_N=$((FIT_N + 1)); if [[ -z "$FIT_MIN" || $age -lt $FIT_MIN ]]; then FIT_MIN=$age; fi ;;
    *)   ETC_N=$((ETC_N + 1)); if [[ -z "$ETC_MIN" || $age -lt $ETC_MIN ]]; then ETC_MIN=$age; fi ;;
  esac
done <<< "$ALL"

[[ $META_FAIL -eq 0 ]] || FIND_PARTIAL=1

age_text() { if [[ -z "$1" ]]; then echo 없음; else echo "최신 ${1}일 전"; fi; }

USER_CRON=$(crontab_count crontab)
if [[ $SUDO_OK -eq 1 ]]; then
  ROOT_CRON=$(crontab_count sudo -n crontab)
  PG_CRON=$(crontab_count sudo -n crontab -u postgres)
else
  ROOT_CRON=미확인; PG_CRON=미확인
fi
scan_etc
scan_timers

SCHED=$ETC_CRON; UNKNOWN=0
for v in "$USER_CRON" "$ROOT_CRON" "$PG_CRON" "$TIMERS"; do
  if is_int "$v"; then SCHED=$((SCHED + v)); else UNKNOWN=1; fi
done
[[ $ETC_FAIL -eq 0 ]] || UNKNOWN=1
[[ $TIMER_PARTIAL -eq 0 ]] || UNKNOWN=1

is_fresh() { [[ -n "$1" && $1 -lt $FRESH_DAYS ]]; }

verdict_app() {  # $1 = 그 앱의 최신 일수
  local t
  if is_fresh "$1"; then echo "최근 덤프 있음"; return; fi
  if [[ -n "$1" ]]; then t="최근 덤프 없음"
  elif [[ $FIND_PARTIAL -eq 1 ]]; then t="덤프 못 찾음(일부 미확인)"
  else t="덤프 못 찾음"; fi
  if is_fresh "$ETC_MIN"; then t="$t(미분류 최근 있음 — 확인 필요)"; fi
  echo "$t"
}

if [[ $SCHED -gt 0 ]]; then SCHED_TEXT="후보 ${SCHED} — 내용은 사람이 확인"
elif [[ $UNKNOWN -eq 1 ]]; then SCHED_TEXT="후보 못 찾음(일부 미확인 — 위 미확인 칸을 본다)"
else SCHED_TEXT="탐지 범위에서 못 찾음"; fi

DATA_DIR=$PG_HOME
DB_MB=미확인
if [[ $SUDO_OK -eq 1 ]]; then
  v=$(sudo -n -u postgres psql -X -At -c "select coalesce(sum(pg_database_size(datname)),0)/1048576 from pg_database where not datistemplate" | head -1)
  v=${v%%.*}
  if is_int "${v:-x}"; then DB_MB="${v} MB"; fi
  d=$(sudo -n -u postgres psql -X -At -c "show data_directory" | head -1)
  if [[ "$d" == /* ]]; then DATA_DIR=$d; fi
fi

DISK=미확인; SAME=미확인
if priv test -d "$BACKUP_DIR"; then
  DISK=$(priv df -P "$BACKUP_DIR" | awk 'NR==2 { printf "사용률 %s · 여유 %d GB", $5, $4 / 1048576 }')
  [[ -n "$DISK" ]] || DISK=미확인
  a=$(priv df -P "$BACKUP_DIR" | awk 'NR==2 { print $1 }')
  b=$(priv df -P "$DATA_DIR" | awk 'NR==2 { print $1 }')
  if [[ -n "$a" && -n "$b" ]]; then if [[ "$a" == "$b" ]]; then SAME=예; else SAME=아니오; fi; fi
else
  DISK="백업 위치 없음"
fi

PG_VER=$(pg_dump --version | grep -oE '[0-9]+' | head -1); [[ -n "$PG_VER" ]] || PG_VER=없음
ETC_NOTE=; [[ $ETC_FAIL -eq 0 ]] || ETC_NOTE=" (읽기 실패 ${ETC_FAIL})"

echo "=== 백업 점검 판정 양식 (이 블록만 세션에 붙인다) ==="
echo "등록  계정 crontab ${USER_CRON} · root ${ROOT_CRON} · postgres ${PG_CRON} · /etc 항목 ${ETC_CRON}${ETC_NOTE} · systemd 타이머 ${TIMERS}${TIMER_NOTE}"
echo "덤프  전체 ${TOTAL} · 합계 $((BYTES / 1048576)) MB · 남이 읽을 수 있는 파일 ${OPEN_PERM} · 너무 작은 파일 ${TINY}"
echo "      fin ${FIN_N} ($(age_text "$FIN_MIN")) · fit ${FIT_N} ($(age_text "$FIT_MIN")) · 미분류 ${ETC_N} ($(age_text "$ETC_MIN"))"
echo "위치  ${DISK} · DB 와 같은 디스크: ${SAME}"
echo "도구  pg_dump ${PG_VER} · DB 합계 ${DB_MB}"
echo "판정  정기 등록: ${SCHED_TEXT}"
echo "      fin: $(verdict_app "$FIN_MIN") · fit: $(verdict_app "$FIT_MIN")"
echo "      서버 밖 보관: [예/아니오 — 사용자가 적는다]"
echo "=== 끝 ==="
