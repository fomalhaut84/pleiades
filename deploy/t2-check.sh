#!/usr/bin/env bash
# t2-check.sh — T-2 서버 확인(U1~U13)을 한 번에 돌려 원본을 저장소 밖 파일에 남긴다 (007 §8 · #186).
#
# 사용:  bash t2-check.sh [--fin-dir DIR] [--fit-dir DIR] [--fin-db NAME] [--fit-db NAME] [--out FILE]
#   서비스 계정으로 서버에서 사용자가 실행한다 — Claude 세션은 서버에 닿지 않는다(I-3). 로컬(Darwin)은 거부
#   --fin-dir/--fit-dir  서비스 체크아웃 — 없으면 pm2 의 myfinance·myfitness cwd 에서 찾는다
#   --fin-db/--fit-db    서비스 DB 이름 — 없으면 각 .env 의 DATABASE_URL 에서 이름만 뽑는다
#   --out FILE           원본 위치(기본 ~/pleiades-private/t2-<시각>.txt) — git 작업트리 안·이미 있는 파일은 거부
#
# 전부 읽기다. 명령마다의 기대값은 docs/runbooks/007-t2-server-check.md — 이 스크립트는 그 명령을 묶은 것이다.
# 하지 않는 것(런북 "먼저 읽을 것"): pm2 원문 출력·상태 변경 · 서비스 체크아웃 git 변경·일반 status · .env 원문 · getUpdates
# 런북과 다른 점:
#   - pm2 데몬 소켓이 없으면 pm2 를 부르지 않는다 — 다른 계정이면 pm2 ls 가 그 계정에 새 데몬을 띄운다
#   - sudo(nginx -T · ss -p · postgres)는 처음에 한 번 묻는다 — 안 되면 그 명령만 건너뛰고 적는다
#   - 해석 실패 메시지에 입력을 싣지 않는다 — node 의 JSON 오류는 입력 일부(pm2 env)를 그대로 보인다
set -uo pipefail

die() { echo "t2-check.sh: 중단 — $*" >&2; exit 1; }
usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
DB_NAME_RE='^[A-Za-z0-9_-]+$'  # psql -d 와 SQL 문자열에 들어간다 — 따옴표·공백 없는 이름만

# .env 의 키 이름과 빈값 여부만 낸다 — 값은 내지 않는다 (런북 0절과 같다 · PR #183 · #185 Codex P2)
# 여러 줄 따옴표 값(PEM 등)은 닫는 따옴표까지 건너뛴다 — 안쪽 줄이 KEY= 꼴이면 비밀 조각이 키 이름으로 나온다 (#186 사전 리뷰)
envkeys() {
  awk 'open != "" { if (index($0, open)) open = ""; next }
  /^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/ {
    line = $0; sub(/^[[:space:]]*(export[[:space:]]+)?/, "", line)
    k = line; sub(/[[:space:]]*=.*/, "", k)
    v = line; sub(/^[^=]*=[[:space:]]*/, "", v)
    if (v ~ /^["\047]/) {
      q = substr(v, 1, 1); v = substr(v, 2); i = index(v, q)
      if (i) v = substr(v, 1, i - 1); else { open = q; v = "여러 줄" }
    }
    else { sub(/#.*/, "", v); gsub(/^[[:space:]]+|[[:space:]]+$/, "", v) }
    print k "\t" (v == "" ? "빈값" : "값있음")
  }' "$1" | sort
}

# crontab 은 줄마다 일정 + 스크립트 경로만 낸다 — 나머지(인라인 비밀 가능)는 싣지 않는다.
# 마스킹은 따옴표·이스케이프·공백 변형마다 새는 길이 있어(PR #187 Codex P1 ×2) 허용 목록으로 바꿨다
crontab_summary() {
  awk '
    /^[[:space:]]*(#|$)/ { next }
    /^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/ {
      k = $0; sub(/^[[:space:]]*(export[[:space:]]+)?/, "", k); sub(/[[:space:]]*=.*/, "", k); print "env " k; next
    }
    {
      if ($1 ~ /^@(reboot|yearly|annually|monthly|weekly|daily|midnight|hourly)$/) { n = 1 }
      else {
        n = 5
        for (i = 1; i <= 5; i++) if ($i !~ /^[0-9*\/,-]+$/ && $i !~ /^[A-Za-z][A-Za-z][A-Za-z](-[A-Za-z][A-Za-z][A-Za-z])?$/) n = 0
      }
      if (n == 0) { print "<형식 밖 줄 — 생략>"; next }
      sched = $1; for (i = 2; i <= n; i++) sched = sched " " $i
      paths = ""; rest = $0
      while (match(rest, /\/[A-Za-z0-9._\/-]+\.(sh|js|cjs|mjs|ts|py)/)) {
        paths = paths " " substr(rest, RSTART, RLENGTH); rest = substr(rest, RSTART + RLENGTH)
      }
      print sched "\t" (paths == "" ? "<스크립트 경로 없음>" : substr(paths, 2))
    }'
}

# 셸 초기화 파일에서 NODE_ENV 의 값만 낸다 — 같은 줄의 다른 대입은 싣지 않는다
node_env_lines() {
  grep -nH 'NODE_ENV' "$@" 2>/dev/null \
    | sed -nE 's/^([^:]+:[0-9]+):.*NODE_ENV[[:space:]]*=[[:space:]]*["'"'"']?([A-Za-z]*).*/\1: NODE_ENV=\2/p'
}

# pm2 jlist 에서 서비스 프로세스는 이름·상태·cwd·실행 파일·포트·재시작, 그 밖은 이름·상태만 — env(토큰·DB 비밀번호)는 내지 않는다.
# args 는 원문 대신 -p/--port 값만 — 다른 플래그에 비밀이 올 수 있다 (PR #187 Codex P1)
pm2_fields() {
  node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let list
      // 경고 줄("[PM2][WARN] …" 포함)을 건너뛰고 "[{" 또는 "[]" 로 시작하는 줄부터
      const at = s.search(/^\[(\{|\])/m)
      try { list = JSON.parse(at < 0 ? "" : s.slice(at)) } catch { console.log("pm2 jlist 해석 실패(출력은 싣지 않는다)"); process.exit(1) }
      for (const p of list) {
        const e = p.pm2_env || {}
        if (!/^(myfinance|myfitness|pleiades-)/.test(String(p.name))) { console.log([p.name, e.status].join("\t")); continue }
        const a = [].concat(e.args || []).join(" ").split(/\s+/)
        const i = a.findIndex((x) => x === "-p" || x === "--port")
        const eq = a.map((x) => /^--port=(\d+)$/.exec(x)).find(Boolean)
        const port = i >= 0 && /^\d+$/.test(a[i + 1] || "") ? a[i + 1] : eq ? eq[1] : "-"
        console.log([p.name, e.status, e.pm_cwd, e.pm_exec_path, "port=" + port, "restarts=" + e.restart_time].join("\t"))
      }
    })'
}

# .env 의 DATABASE_URL 에서 DB 이름만 — 접속 문자열은 내지 않는다
db_name() {
  node -e '
    try {
      let url = ""
      for (const raw of require("fs").readFileSync(process.argv[1], "utf8").split(/\r?\n/)) {
        const m = raw.match(/^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.*?)\s*$/)
        if (m) url = m[1].replace(/^(["\x27])(.*)\1$/, "$2")
      }
      process.stdout.write(decodeURIComponent(new URL(url).pathname.replace(/^\//, "")))
    } catch { process.exit(1) }
  ' "$1" 2>/dev/null
}

as_root() {  # sudo 가 되면 비대화로 · 안 되면 건너뛴다고 적는다
  if [[ $SUDO_OK -eq 1 ]]; then sudo -n "$@"; else echo "(건너뜀 — sudo 안 됨: $*)"; fi
}

section() { echo; echo "======== $1 ========"; "$2" 2>&1; }

# ── 섹션 (런북 절 순서) ────────────────────────────────────────────────
u1_u3() {
  whoami; id -un; echo "HOME=$HOME"; echo "PM2_HOME=${PM2_HOME-<unset>}"
  if [[ $PM2_UP -eq 1 ]]; then pm2 ls; echo; printf '%s\n' "$PM2_TABLE"; else echo "pm2 데몬 없음(${PM2_DIR} 의 소켓 · 제목이 이 경로인 살아 있는 pid) — pm2 를 부르지 않았다. 서비스 계정·PM2_HOME 을 확인하고 경로는 --fin-dir/--fit-dir 로 준다"; fi
  ls -la "$PM2_DIR/dump.pm2"
  systemctl list-unit-files 'pm2*' --no-pager
  systemctl is-enabled "pm2-$(whoami)"
}

u2() {
  local d
  for d in "$FIN_DIR" "$FIT_DIR"; do
    [[ -n "$d" ]] || continue
    echo "== $d"
    git -C "$d" --no-optional-locks describe --tags --exact-match HEAD
    git -C "$d" --no-optional-locks rev-parse --short=12 HEAD
    git -C "$d" --no-optional-locks status --porcelain --untracked-files=no
    ls -la "$d/.next/BUILD_ID" "$d/dist/bot/standalone.cjs" "$d/dist/mcp/server.cjs"
  done
  [[ -z "$FIT_DIR" ]] || ls -d "$FIT_DIR/src/generated/prisma"
}

u4() {
  ls -la /etc/nginx/sites-enabled/
  if [[ $SUDO_OK -eq 1 ]]; then
    sudo -n nginx -T 2>/dev/null | grep -nE '^\s*(server_name|listen|proxy_pass|ssl_certificate)\b'
  else as_root nginx -T; fi
}

u5() {
  local db
  command -v psql pg_dump; psql --version
  as_root -u postgres psql -X -At -c 'select version()'
  as_root -u postgres psql -X -c '\l+'
  as_root -u postgres psql -X -c '\du'
  for db in "$FIN_DB" "$FIT_DB"; do
    [[ -n "$db" ]] || continue
    as_root -u postgres psql -X -At -d "$db" -c "select '$db', count(*), max(migration_name) from public._prisma_migrations where rolled_back_at is null and finished_at is not null"
  done
}

u6_u12() {
  crontab -l | crontab_summary
  ls /etc/cron.d/
  if [[ -n "$FIN_DIR" ]]; then ls -la "$FIN_DIR/backups" | tail -5; du -sh "$FIN_DIR/backups"; fi
  if [[ $SUDO_OK -eq 1 ]]; then sudo -n ss -ltnp; else echo "(sudo 안 됨 — 프로세스 이름 없이)"; ss -ltn; fi \
    | grep -E ':(3000|4100|4200|4210|4299|4301|4399)\b'
  echo "오프사이트 백업(서버 밖 복사)이 있는지는 명령으로 알 수 없다 — 기억대로 적는다"
}

u7() {
  local d
  for d in "$FIN_DIR" "$FIT_DIR"; do
    [[ -n "$d" ]] || continue
    echo "== $d/.env"; envkeys "$d/.env"
    ls -la "$d"/.env*
  done
}

u8() {
  local d t pm2_root
  node -v; npm -v; command -v node npm
  for d in "$FIT_DIR" "$FIN_DIR"; do [[ -z "$d" ]] || { echo "$d/.nvmrc: $(cat "$d/.nvmrc" 2>&1)"; }; done
  ls "$HOME/.nvm/versions/node"
  for t in git curl comm lsof jq psql claude; do printf '%s\t%s\n' "$t" "$(command -v "$t" || echo '<없음>')"; done
  claude --version
  echo "NODE_ENV=${NODE_ENV-<unset>}"
  node_env_lines ~/.bashrc ~/.profile ~/.bash_profile /etc/environment
  if command -v pm2 >/dev/null; then
    pm2_root=$(dirname "$(dirname "$(readlink -f "$(command -v pm2)")")")
    node -p "require('$pm2_root/package.json').version"
    grep -n "'.config.cjs'" "$pm2_root/lib/Common.js"
  else echo "pm2 <없음>"; fi
  df -h "$HOME"; free -h; nproc
}

u9() {
  local d p
  [[ -z "$FIN_DIR" ]] || du -sh "$FIN_DIR"/{reports,logs,backups}
  [[ -z "$FIT_DIR" ]] || du -sh "$FIT_DIR"/{.garmin-tokens,.omron-tokens,.runtime,logs}
  # 한 번에 넘기면 GNU du 가 부모에서 센 하위 경로를 출력에서 뺀다 — 하나씩 (PR #183 Codex P2)
  for d in "$FIN_DIR" "$FIT_DIR"; do
    [[ -n "$d" ]] || continue
    for p in "$d" "$d/node_modules" "$d/.next"; do du -sh "$p"; done
  done
}

u10() {
  git ls-remote https://github.com/fomalhaut84/pleiades.git refs/heads/main refs/heads/dev
  curl -sS -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/
}

u11() {
  echo "서버 밖에서 확인한다 — 각 서비스 저장소 Settings → Secrets and variables → Actions 의 secret 이름 · deploy.yml workflow 활성 여부"
}

u13() {
  local d
  for d in "$FIN_DIR" "$FIT_DIR"; do
    [[ -n "$d" ]] || continue
    # getWebhookInfo 는 polling 을 방해하지 않는다(getUpdates 는 409). 토큰은 node 안에서만 쓴다 — 오류에도 URL 을 싣지 않는다
    node -e '
      const fs = require("fs"), https = require("https")
      const dir = process.argv[1]
      let token = ""
      try {
        for (const raw of fs.readFileSync(dir + "/.env", "utf8").split(/\r?\n/)) {
          const m = raw.match(/^\s*(?:export\s+)?TELEGRAM_BOT_TOKEN\s*=\s*(.*?)\s*$/)
          if (m) token = m[1].replace(/^(["\x27])(.*)\1$/, "$2")
        }
      } catch { console.log(dir, ".env 읽기 실패"); process.exit(0) }
      if (!token) { console.log(dir, "TELEGRAM_BOT_TOKEN 없음"); process.exit(0) }
      try {
        https.get("https://api.telegram.org/bot" + token + "/getWebhookInfo", (res) => {
          let s = ""; res.on("data", (c) => (s += c)).on("end", () => {
            let j
            try { j = JSON.parse(s) } catch { console.log(dir, "응답 해석 실패 HTTP", res.statusCode); return }
            if (!j.ok) { console.log(dir, "응답 실패", j.error_code, j.description); return }
            const r = j.result
            console.log(dir, "webhook=" + (r.url ? "set" : "none"), "pending=" + r.pending_update_count, "last_error=" + (r.last_error_message || "-"))
          })
        }).on("error", (e) => console.log(dir, "요청 실패", e.code))
      } catch (e) { console.log(dir, "요청 실패", e.code || "?") }
    ' "$d"
  done
}

report() {
  echo "t2-check.sh (#186) · $(date -u '+%Y-%m-%dT%H:%MZ') · 원본: $OUT"
  echo "FIN_DIR=${FIN_DIR:-} ($FIN_DIR_FROM)"; [[ -n "$FIN_DIR" ]] || echo "FIN_DIR 없음 — --fin-dir 로 다시 돌리면 그 앱 항목이 채워진다"
  echo "FIT_DIR=${FIT_DIR:-} ($FIT_DIR_FROM)"; [[ -n "$FIT_DIR" ]] || echo "FIT_DIR 없음 — --fit-dir 로 다시 돌리면 그 앱 항목이 채워진다"
  [[ -z "$DB_NOTE" ]] || echo "$DB_NOTE"
  echo "FIN_DB=${FIN_DB:-<없음>} · FIT_DB=${FIT_DB:-<없음>} · sudo=$([[ $SUDO_OK -eq 1 ]] && echo 됨 || echo '안 됨')"
  section "U1 · U3 — 계정 · 실경로 · pm2" u1_u3
  section "U2 — 옛 체크아웃 HEAD · dirty · 빌드 산출물" u2
  section "U4 — nginx" u4
  section "U5 — 서비스 DB · psql" u5
  section "U6 · U12 — 백업 · crontab · 포트" u6_u12
  section "U7 — 서버 .env 키 목록(값 아님)" u7
  section "U8 — 도구 · NODE_ENV · pm2 .config.cjs" u8
  section "U9 — 영속 디렉터리" u9
  section "U10 — 서버에서 pleiades 접근" u10
  section "U11 — 서비스 배포 경로(서버 밖)" u11
  section "U13 — 서비스 봇 수신 방식" u13
  echo
  echo "끝. 원본은 $OUT — 저장소에 넣지 않는다. 세션에는 이 파일 또는 런북 '공개 기록 양식'(판정만)을 준다."
}

main() {
  FIN_DIR=; FIT_DIR=; FIN_DB=; FIT_DB=; OUT=
  FIN_DIR_FROM=없음; FIT_DIR_FROM=없음
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --fin-dir|--fit-dir|--fin-db|--fit-db|--out) [[ $# -ge 2 ]] || usage ;;
    esac
    case "$1" in
      --fin-dir) FIN_DIR=$2; FIN_DIR_FROM=인자; shift 2 ;;
      --fit-dir) FIT_DIR=$2; FIT_DIR_FROM=인자; shift 2 ;;
      --fin-db) FIN_DB=$2; shift 2 ;;
      --fit-db) FIT_DB=$2; shift 2 ;;
      --out) OUT=$2; shift 2 ;;
      -h|--help) usage ;;
      *) echo "모르는 인자 $1" >&2; usage ;;
    esac
  done

  # ── 가드 ────────────────────────────────────────────────────────────
  [[ "$(uname -s)" != Darwin ]] || die "로컬에서는 돌리지 않는다 — 서버에서 사용자가 실행한다(I-3)"
  local d db
  for d in "$FIN_DIR" "$FIT_DIR"; do [[ -z "$d" || -d "$d" ]] || die "디렉터리가 없다: $d"; done
  for db in "$FIN_DB" "$FIT_DB"; do [[ -z "$db" || "$db" =~ $DB_NAME_RE ]] || die "DB 이름은 영문·숫자·_·- 만: $db"; done

  OUT=${OUT:-$HOME/pleiades-private/t2-$(date '+%Y%m%d-%H%M').txt}
  [[ "$OUT" == /* ]] || OUT="$PWD/$OUT"
  # 끊긴 심링크도 "있다" — tee 가 따라가 대상을 만든다
  [[ ! -e "$OUT" && ! -L "$OUT" ]] || die "원본 파일이 이미 있다: $OUT"
  local anc gerr
  anc=$(dirname "$OUT"); while [[ ! -d "$anc" ]]; do anc=$(dirname "$anc"); done
  # 작업트리 안이면 git add 한 번에 공개된다(PUBLIC) — 서비스 체크아웃 안도 같다.
  # "저장소 아님" 외의 git 오류(dubious ownership 등)는 판정 불능이라 거부한다
  if command -v git >/dev/null; then
    if gerr=$(env -u GIT_DIR -u GIT_WORK_TREE git -C "$anc" --no-optional-locks rev-parse --is-inside-work-tree 2>&1); then
      die "원본 위치가 git 작업트리 안이다: $anc — 저장소 밖을 --out 으로 준다"
    fi
    [[ "$gerr" == *"not a git repository"* ]] || die "원본 위치가 git 작업트리 밖인지 판정하지 못했다: $anc — 다른 --out 을 준다"
  fi

  # ── 탐지 ────────────────────────────────────────────────────────────
  PM2_DIR=${PM2_HOME:-$HOME/.pm2}
  PM2_UP=0; PM2_TABLE=
  # 소켓 파일은 죽은 데몬(SIGKILL · OOM)에도 남는다 — pid 가 살아 있어야 부른다. 아니면 pm2 가 새 데몬을 띄운다 (#186 사전 리뷰)
  local pm2_pid
  pm2_pid=$(cat "$PM2_DIR/pm2.pid" 2>/dev/null || true)
  # pid 는 재사용될 수 있다 — 그 프로세스가 이 PM2_HOME 의 데몬(제목 "PM2 v…: God Daemon (<home>)")인지 본다 (PR #187 Codex P2 ×2)
  if command -v pm2 >/dev/null && [[ -S "$PM2_DIR/rpc.sock" && "$pm2_pid" =~ ^[0-9]+$ ]] \
    && ps -p "$pm2_pid" -o args= 2>/dev/null | grep -qF "God Daemon ($PM2_DIR)"; then
    PM2_UP=1
    PM2_TABLE=$(pm2 jlist 2>/dev/null | pm2_fields)
  fi
  if [[ -z "$FIN_DIR" ]]; then
    FIN_DIR=$(awk -F'\t' '$1 == "myfinance" { print $3; exit }' <<<"$PM2_TABLE")
    [[ -z "$FIN_DIR" ]] || FIN_DIR_FROM="pm2 myfinance cwd"
  fi
  if [[ -z "$FIT_DIR" ]]; then
    FIT_DIR=$(awk -F'\t' '$1 == "myfitness" { print $3; exit }' <<<"$PM2_TABLE")
    [[ -z "$FIT_DIR" ]] || FIT_DIR_FROM="pm2 myfitness cwd"
  fi
  [[ -n "$FIN_DB" || -z "$FIN_DIR" ]] || FIN_DB=$(db_name "$FIN_DIR/.env")
  [[ -n "$FIT_DB" || -z "$FIT_DIR" ]] || FIT_DB=$(db_name "$FIT_DIR/.env")
  DB_NOTE=
  [[ -z "$FIN_DB" || "$FIN_DB" =~ $DB_NAME_RE ]] || { FIN_DB=; DB_NOTE="fin .env 의 DB 이름이 형식 밖이라 쓰지 않았다(값은 싣지 않는다) — --fin-db 로 준다"; }
  [[ -z "$FIT_DB" || "$FIT_DB" =~ $DB_NAME_RE ]] || { FIT_DB=; DB_NOTE="${DB_NOTE:+$DB_NOTE · }fit .env 의 DB 이름이 형식 밖 — --fit-db 로 준다"; }

  SUDO_OK=0
  echo "sudo 를 한 번 묻는다(nginx -T · ss -p · postgres 조회용 · 거절하면 그 명령만 건너뛴다)" >&2
  if sudo -v; then SUDO_OK=1; fi

  umask 077
  mkdir -p "$(dirname "$OUT")" || die "원본 디렉터리를 만들지 못했다"
  report 2>&1 | tee "$OUT"
}

# source 하면 함수만 정의한다(테스트가 envkeys 를 직접 부른다)
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
