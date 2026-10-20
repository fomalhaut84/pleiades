# T-2 서버 확인 — U1~U13 · T-4 추가 항목 (#182)

**누가:** 사용자가 서버에서 실행한다. Claude 세션은 서버에 닿지 않는다(`isolation.md` I-3).
**무엇:** 007 §8 의 U1~U13 과 T-1d 가 더한 T-4 확인 항목 3개(`psql` · pm2 의 `.config.cjs` 인식 · `NODE_ENV`). U14 는 감사가 이미 측정했다(007 ⑱).
**성격:** 전부 **읽기**다. 서비스 프로세스·DB·봇·git 체크아웃 상태를 바꾸는 명령은 없다. 되돌리기: 해당 없음(읽기만).
**결과:** 아래 [결과 기록 양식](#결과-기록-양식)을 채워 세션에 붙여 주면 Claude 가 `docs/research/measured-facts.md` 에 기록하고 007 의 걸린 결정을 갱신한다(별도 PR).

## 먼저 읽을 것 — 하지 않는 것과 가릴 것

**하지 않는다.**

- `pm2 jlist` · `pm2 prettylist` · `pm2 env <id>` · `pm2 describe` 의 **원문 출력** — 프로세스 env(봇 토큰·DB 비밀번호)가 그대로 나온다. 아래 명령은 필요한 필드만 뽑는다.
- `pm2 save` · `restart` · `reload` · `start` · `delete` · `update` · `resurrect` — 이 체크리스트에 상태를 바꾸는 pm2 명령은 없다.
- 서비스 디렉터리에서 `git fetch` · `checkout` · `pull` · 일반 `git status`(index 를 다시 쓸 수 있다). 아래 git 명령은 전부 `--no-optional-locks` 를 붙였다.
- `.env` 를 `cat` 하거나 `source` 하기. 아래 명령은 **키 이름과 "빈값/값있음"** 만 낸다.
- 텔레그램 `getUpdates` — 서비스 봇의 long polling 과 409 로 충돌한다. U13 은 `getWebhookInfo` 만 쓴다.

**붙여 주기 전에 가린다 — pleiades 는 PUBLIC 저장소다.**

| 가릴 것 | 예 |
|---|---|
| 토큰·비밀번호·접속 문자열 | 봇 토큰 · `DATABASE_URL` · API 키 (위 명령은 내지 않지만 손으로 덧붙이지 않는다) |
| 채팅·사용자 ID | 텔레그램 chat id · Discord id |
| 도메인·IP·SSH 포트 | nginx `server_name` · 인증서 경로의 도메인 → `<domain>` 으로 |
| 개인 경로 중 원치 않는 것 | 홈 디렉터리 이름은 이미 공개(fit `ecosystem.config.js`)이므로 그대로 둬도 된다 |

## 0. 준비 — 셸 변수

서비스를 돌리는 계정으로 로그인한 **bash** 에서 시작한다. U1 에서 실제 경로를 확인한 뒤 두 변수를 맞춘다.

```bash
FIN_DIR=/home/nasty68/myFinance   # U1 에서 확인 후 수정
FIT_DIR=/home/nasty68/myFitness   # U1 에서 확인 후 수정
envkeys() {  # .env 의 키 이름과 빈값 여부만 낸다 — 값은 내지 않는다
  awk '/^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/ {
    line = $0; sub(/^[[:space:]]*(export[[:space:]]+)?/, "", line)
    k = line; sub(/[[:space:]]*=.*/, "", k)
    v = line; sub(/^[^=]*=/, "", v); gsub(/^[[:space:]"\047]+|[[:space:]"\047]+$/, "", v)
    print k "\t" (v == "" ? "빈값" : "값있음")
  }' "$1" | sort
}
```

## U1 · U3 — 계정 · 실경로 · pm2

| 걸린 결정 | Q72(새 체크아웃 경로 이름) · R-2(fit 옛 ecosystem 은 절대경로) · Q77(옛 pm2 항목 delete) · T-5c ④ |
|---|---|

```bash
whoami; id -un; echo "HOME=$HOME"; echo "PM2_HOME=${PM2_HOME-<unset>}"
pm2 ls
pm2 jlist | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    for (const p of JSON.parse(s)) {
      const e = p.pm2_env || {};
      console.log([p.name, e.status, e.pm_cwd, e.pm_exec_path, (e.args || []).join(" "), "restarts=" + e.restart_time].join("\t"));
    }
  })'
ls -la "${PM2_HOME:-$HOME/.pm2}/dump.pm2"
systemctl list-unit-files 'pm2*' --no-pager
systemctl is-enabled "pm2-$(whoami)" 2>&1
```

**기대값:** 프로세스 6개 `myfinance` · `myfinance-bot` · `myfinance-mcp` · `myfitness` · `myfitness-bot` · `myfitness-mcp`(007 ⑪ · measured-facts) 가 `online` · fit 세 개의 cwd = `/home/nasty68/myFitness` · fin 세 개의 cwd = fin `DEPLOY_PATH` · `pleiades-*` 이름 0 · dump 파일 있음 · systemd `pm2-<계정>` enabled.
**다르면:** 위 6개 외 프로세스가 있으면 이름만 적는다(같은 서버의 다른 서비스 — U12 와 함께 본다).

## U2 — 옛 체크아웃 HEAD · dirty · 빌드 산출물 (G-a · G-b)

| 걸린 결정 | Q75(배포본 = 서비스 `main` HEAD 가정 · 007 ⑱ 의 전제) · R-2(옛 디렉터리로 되돌릴 산출물이 있는가) · T-5b |
|---|---|

```bash
for d in "$FIN_DIR" "$FIT_DIR"; do
  echo "== $d"
  git -C "$d" --no-optional-locks describe --tags --exact-match HEAD 2>&1
  git -C "$d" --no-optional-locks rev-parse --short=12 HEAD
  git -C "$d" --no-optional-locks status --porcelain --untracked-files=no
  ls -la "$d/.next/BUILD_ID" "$d/dist/bot/standalone.cjs" "$d/dist/mcp/server.cjs" 2>&1
done
ls -d "$FIT_DIR/src/generated/prisma" 2>&1
```

**기대값:** 각 HEAD 에 서비스 최신 릴리즈 태그 1개(그 태그 = 서비스 `main` HEAD) · `status` 출력 없음(fin 은 `src/lib/ai/mcp-config.json` swap 잔여가 있으면 여기 한 줄 나온다 — 그 줄을 그대로 적는다) · 산출물 3개 + fit `src/generated/prisma` 전부 있음.
**다르면:** 태그가 없거나 `main` 이 아니면 Claude 가 그 SHA 기준으로 마이그레이션 차이(⑱)를 다시 잰다. 산출물이 없으면 R-2 가 성립하지 않는다 — T-5c 진입 불가(007 T-5b).

## U4 — nginx

| 걸린 결정 | Q77(포트 유지 = nginx 무변경 전제) |
|---|---|

```bash
ls -la /etc/nginx/sites-enabled/
sudo nginx -T 2>/dev/null | grep -nE '^\s*(server_name|listen|proxy_pass|ssl_certificate)\b'
```

**기대값:** `proxy_pass` 대상이 `127.0.0.1:4100` · `:4200`(웹 두 개)뿐이고 MCP 포트(4210 · 4301)는 외부로 노출되지 않음 · 다른 vhost 가 있으면 그 `proxy_pass` 포트.
**가릴 것:** `server_name` · 인증서 경로의 도메인.

## U5 — 서비스 DB · `psql` (T-4 추가 ①)

| 걸린 결정 | Q74(DB-a 그대로) · T-5b 백업 창 · **`deploy/deploy.sh` 는 서버 `psql` 이 없으면 멈춘다**(007 G-e) |
|---|---|

```bash
command -v psql pg_dump; psql --version
sudo -u postgres psql -X -At -c 'select version()'
sudo -u postgres psql -X -c '\l+'
sudo -u postgres psql -X -c '\du'
```

위 `\l+` 에서 DB 이름을 확인해 두 변수에 넣은 뒤, 적용된 마이그레이션 수와 마지막 이름:

```bash
FIN_DB=myfinance   # \l+ 에서 확인 후 수정
FIT_DB=myfitness   # \l+ 에서 확인 후 수정
for db in "$FIN_DB" "$FIT_DB"; do
  sudo -u postgres psql -X -At -d "$db" -c "select '$db', count(*), max(migration_name) from public._prisma_migrations where rolled_back_at is null and finished_at is not null"
done
```

**기대값:** `psql` · `pg_dump` 있음 · 두 DB 가 같은 클러스터에 있음 · 각 DB 의 소유 롤 · 크기 · 마이그레이션 수가 서비스 `main` 의 `prisma/migrations` 디렉터리 수와 같음(Claude 가 대조).
**다르면:** `sudo -u postgres` 가 안 되면(원격 DB · peer 인증 아님) 그 사실만 적는다 — 접속 문자열을 명령줄에 넣지 않는다. `psql` 이 없으면 T-4 전에 설치가 필요하다(서버 패키지 — 사용자 판단).

## U6 · U12 — 백업 · crontab · 포트

| 걸린 결정 | T-5b · R-3 · **T-8 진입 조건(옛 경로 crontab 항목 재지정 · 007 정정 7)** · 전환 창 · Q77 |
|---|---|

```bash
crontab -l 2>&1
ls /etc/cron.d/ 2>&1
ls -la "$FIN_DIR/backups" 2>&1 | tail -5
du -sh "$FIN_DIR/backups" 2>&1
sudo ss -ltnp | grep -E ':(3000|4100|4200|4210|4299|4301|4399)\b'
```

**기대값:** crontab 에 fin `scripts/backup-db.sh`(옛 디렉터리 경로) 항목 · `backups/` 에 최근 날짜 파일 · 4100 · 4200 · 4210 · 4301 은 서비스 node 가 리슨 · **4299 · 4399(사전검증 임시 포트)는 비어 있음**.
**함께 적는다:** 오프사이트 백업이 있는지(서버 밖으로 복사하는 경로 — 명령으로는 알 수 없으면 기억대로).

## U7 — 서버 `.env` 키 목록 (값 아님)

| 걸린 결정 | `deploy/env/*.env.template` 의 키가 실서비스와 맞는가 · **빈 값 선택 키**(007 T-1c 보강 — `KEY=` 는 기본값이 아니라 빈 문자열) · T-5c ① |
|---|---|

```bash
for d in "$FIN_DIR" "$FIT_DIR"; do echo "== $d/.env"; envkeys "$d/.env"; done
ls -la "$FIN_DIR"/.env* "$FIT_DIR"/.env* 2>&1
```

**기대값:** 키 이름이 `deploy/env/finance.env.template` · `fitness.env.template` 의 키(활성 + `# KEY=` 주석 키) 안에 있음 · `빈값` 표시는 0 이거나, 있으면 그 키 이름.
**Claude 가 할 일:** 템플릿과 대조해 템플릿 밖 키 · 빈 값 키를 표로 만든다.

## U8 — 도구 · `NODE_ENV` · pm2 `.config.cjs` (T-4 추가 ② ③)

| 걸린 결정 | T-4 리허설(fit 의존 `>=20.19`) · advisor 인계(4-4) · `deploy/deploy.sh` 가 쓰는 도구 · **pm2 가 루트 설정 `deploy/pleiades.config.cjs` 를 설정 파일로 읽는가** · **`NODE_ENV=production` 이 셸에 걸려 있으면 `npm ci` 가 devDependencies(fit `dotenv` 등)를 건너뛴다**(007 T-1d 보강) |
|---|---|

```bash
node -v; npm -v; command -v node npm
cat "$FIT_DIR/.nvmrc" "$FIN_DIR/.nvmrc" 2>&1
ls "$HOME/.nvm/versions/node" 2>&1
for t in git curl comm lsof jq psql claude; do printf '%s\t%s\n' "$t" "$(command -v "$t" || echo '<없음>')"; done
claude --version 2>&1
echo "NODE_ENV=${NODE_ENV-<unset>}"
grep -nH 'NODE_ENV' ~/.bashrc ~/.profile ~/.bash_profile /etc/environment 2>/dev/null
PM2_ROOT=$(dirname "$(dirname "$(readlink -f "$(command -v pm2)")")")
node -p "require('$PM2_ROOT/package.json').version"
grep -n "'.config.cjs'" "$PM2_ROOT/lib/Common.js"
df -h "$HOME"; free -h; nproc
```

**기대값:** node `>=20.19`(fit 서비스는 `.nvmrc` 24) · `git` · `curl` · `comm` · `psql` · `claude` 있음 · **`NODE_ENV=<unset>`** · 셸 초기화 파일에 `NODE_ENV` 없음 · pm2 `Common.js` 에 `'.config.cjs': 'js'` 한 줄(로컬 7.0.4 는 `lib/Common.js:247`) · 디스크 여유는 `npm ci` ×2 + `next build` 를 한 번 더 감당할 만큼(현 서비스 디렉터리 크기는 U9).
**다르면:** `'.config.cjs'` 줄이 없으면 그 pm2 는 루트 설정을 설정 파일로 읽지 않는다 — T-4 전에 pm2 업데이트 또는 설정 파일 이름 변경을 결정해야 한다(pleiades PR). `NODE_ENV=production` 이면 `deploy.sh` 를 돌릴 셸에서 해제하는 방법을 정한다.

## U9 — 영속 디렉터리 (007 ⑤)

| 걸린 결정 | Q73(새 체크아웃에서 심링크로 가리킬 대상) · T-5b 스냅숏 |
|---|---|

```bash
du -sh "$FIN_DIR"/{reports,logs,backups} "$FIT_DIR"/{.garmin-tokens,.omron-tokens,.runtime,logs} 2>&1
du -sh "$FIN_DIR" "$FIT_DIR" "$FIN_DIR/node_modules" "$FIT_DIR/node_modules" "$FIN_DIR/.next" "$FIT_DIR/.next" 2>&1
```

**기대값:** 7개 경로 각각 존재 여부와 크기. 없는 것은 없다고 적는다(그러면 `.gitignore` 상태 경로 중 그 항목은 심링크 대상이 아니다).

## U10 — 서버에서 pleiades 접근

| 걸린 결정 | **T-4 전체의 선결**(003 Q45) |
|---|---|

```bash
git ls-remote https://github.com/fomalhaut84/pleiades.git refs/heads/main refs/heads/dev
curl -sS -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/
```

**기대값:** 두 ref 의 SHA 가 나온다 · npm 레지스트리 `200`.

## U11 — 서비스 배포 경로 (서버 밖)

| 걸린 결정 | Q70(D-a 유지면 옮길 것 없음) · 4-6(전환 전 서비스 배포 경로를 어떻게 막나) |
|---|---|

GitHub 웹(각 서비스 저장소 → Settings → Secrets and variables → Actions) 또는 사용자 PC 에서 `gh secret list -R <서비스 저장소>` — **이름만**. 그리고 각 서비스 `.github/workflows/deploy.yml` 이 지금도 `release: published` 로 켜져 있는지(Actions 탭에서 workflow 상태).

**기대값:** `DEPLOY_SSH_HOST` · `DEPLOY_SSH_USER` · `DEPLOY_SSH_KEY` · `DEPLOY_SSH_PORT` · `DEPLOY_SSH_FINGERPRINT` · `DEPLOY_PATH` + 배포 알림용 키(이름) · workflow 활성.

## U13 — 서비스 봇 수신 방식

| 걸린 결정 | 4-4 봇 인계 순서 · R-5(409) |
|---|---|

`getWebhookInfo` 는 polling 을 방해하지 않는다. 토큰은 node 가 `.env` 에서 직접 읽어 요청에만 쓴다 — 셸 변수·명령줄·화면에 나오지 않는다.

```bash
for d in "$FIN_DIR" "$FIT_DIR"; do
  node -e '
    const fs = require("fs"), https = require("https");
    const dir = process.argv[1];
    let token = "";
    for (const raw of fs.readFileSync(dir + "/.env", "utf8").split(/\r?\n/)) {
      const m = raw.match(/^\s*(?:export\s+)?TELEGRAM_BOT_TOKEN\s*=\s*(.*?)\s*$/);
      if (m) token = m[1].replace(/^(["\x27])(.*)\1$/, "$2");
    }
    if (!token) { console.log(dir, "TELEGRAM_BOT_TOKEN 없음"); process.exit(0); }
    https.get("https://api.telegram.org/bot" + token + "/getWebhookInfo", (res) => {
      let s = ""; res.on("data", (c) => (s += c)).on("end", () => {
        const j = JSON.parse(s);
        if (!j.ok) { console.log(dir, "응답 실패", j.error_code, j.description); return; }
        const r = j.result;
        console.log(dir, "webhook=" + (r.url ? "set" : "none"), "pending=" + r.pending_update_count, "last_error=" + (r.last_error_message || "-"));
      });
    }).on("error", (e) => console.log(dir, "요청 실패", e.code));
  ' "$d"
done
```

**기대값:** 둘 다 `webhook=none`(grammy long polling) · `pending` 이 작다 · `last_error=-`.

## 결과 기록 양식

아래를 채워 붙여 준다. 명령 출력을 그대로 붙여도 된다(가릴 것은 가린 뒤).

```text
U1  계정=        fin 경로=                 fit 경로=
U2  fin 태그/SHA=           dirty=     산출물(BUILD_ID/bot/mcp)=
    fit 태그/SHA=           dirty=     산출물(BUILD_ID/bot/mcp/generated)=
U3  pm2 프로세스(이름 status cwd)=
    dump=  systemd=  PM2_HOME=
U4  proxy_pass 포트=          다른 vhost=
U5  PG 버전=       DB(이름 크기 소유자)=
    마이그레이션 fin(수 마지막)=          fit=
    psql=  pg_dump=
U6  crontab 항목=                      backups 최근 파일=        오프사이트=
U7  fin .env 키(빈값 표시 포함)=
    fit .env 키=
U8  node=  npm=  nvmrc fin/fit=     도구 없음=
    NODE_ENV=        셸 파일 NODE_ENV=
    pm2 버전=        '.config.cjs' 줄=
    디스크 여유=     메모리=     코어=
U9  영속 디렉터리 크기=                체크아웃 크기=
U10 ls-remote=   npm=
U11 secrets 이름=                       deploy workflow 활성=
U12 포트 리슨(3000 4100 4200 4210 4299 4301 4399)=
U13 fin webhook/pending=     fit webhook/pending=
```
