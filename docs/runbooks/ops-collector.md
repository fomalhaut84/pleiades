# 운영 수집기 런북 (008 단계 1 · #568)

pm2 상태 · MCP `/health` · web 응답 · pm2 로그 · 디스크를 5분마다 읽어 지문으로 묶고 억제한다. 정본 설계는 `docs/specs/008-monitoring.md` §2 아래 2026-11-10 확정 블록이다.

**지금 판(PR-1)은 `--dry-run` 만이다.** 외부로 나가는 것이 0 이고, 게시할 메시지는 서버의 dry-run 로그에만 쓴다. Discord `#ops` 게시는 PR-2 에서 이 런북 4절과 함께 켠다. 며칠 돌린 dry-run 결과로 설계 파라미터(008 Q100)를 정한다.

실행은 전부 사용자가 서버에서 한다(Claude 서버 접근 금지 · I-3). 세션에는 판정 양식과 결과 줄만 붙인다.

| 항목 | 값 |
|---|---|
| 스크립트 | `deploy/ops/collect.cjs` — 커밋을 고정해 `~/pleiades-ops/` 에 둔다(db-backup 과 같은 곳). 체크아웃 안에서 부르면 R-8 로 옛 태그를 꺼낼 때 파일이 사라지고, 배포가 도는 파일을 바꾼다 |
| 상태 | `~/pleiades-private/ops/`(700) — `state.json` · `events.jsonl`(요약 이벤트 · 원문 없음) · `dry-run.log`(템플릿 메시지) · `collect.log`(크론 출력) · 파일 600 |
| 계정 | 서비스 계정 crontab 한 줄(008 Q97) |
| pm2 | `jlist` 하나만 부른다. 데몬 소켓 연결 시험이 통과한 회에만 부른다. **배포 잠금은 열지 않는다** |
| 크기 | `state.json` 은 상한 1 MB · `events.jsonl` 은 14일 보존(하루 한 번 정리) · `collect.log` · `dry-run.log` 는 정리하지 않는다 — 크기는 dry-run 판정 때 함께 본다(PR-2 에서 다시 정한다) |
| 주기 | 5분(`2-59/5` — 정각과 db-backup 04:20 을 피한다) |

되돌리기: crontab 줄 삭제(**즉시**) · `~/pleiades-ops/collect.cjs` 와 `~/pleiades-private/ops/` 삭제(**즉시** — 억제 기록만 잃는다).

## 1. 설치

`<REF>` 와 `<SHA256>` 은 Claude 가 머지 뒤 실값을 준다. 재설치 때도 검증 전에는 도는 파일을 덮지 않는다.

```bash
mkdir -p ~/pleiades-ops ~/pleiades-private/ops && chmod 700 ~/pleiades-ops ~/pleiades-private ~/pleiades-private/ops
curl -fsSL https://raw.githubusercontent.com/fomalhaut84/pleiades/<REF>/deploy/ops/collect.cjs -o ~/pleiades-ops/collect.cjs.new \
  && echo "<SHA256>  $HOME/pleiades-ops/collect.cjs.new" | sha256sum -c --quiet \
  && mv ~/pleiades-ops/collect.cjs.new ~/pleiades-ops/collect.cjs && echo 설치 통과
```

## 2. 시험

node 와 pm2 의 절대 경로를 먼저 고정한다. 수집기는 pm2 를 `node <pm2 경로> jlist` 로 부른다. pm2 첫 줄이 `#!/usr/bin/env node` 라 크론의 PATH 로는 셔뱅이 실패하기 때문이다.

```bash
NODE_BIN=$(command -v node); PM2_BIN=$(readlink -f "$(command -v pm2)")
case "$NODE_BIN" in /*) echo "node 경로 통과" ;; *) echo "[중단] node 절대 경로가 아니다 — 멈춘다" ;; esac
case "$PM2_BIN" in /*) head -1 "$PM2_BIN" | grep -q node && echo "pm2 경로 통과" || echo "[중단] pm2 첫 줄이 node 가 아니다 — 멈춘다" ;; *) echo "[중단] pm2 를 찾지 못했다 — 멈춘다" ;; esac
```

크론과 같은 빈 환경으로 한 번 돌린다. 이 시험은 위 pm2 경로를 실제로 탄다.

```bash
env -i HOME="$HOME" PATH=/usr/bin:/bin "$NODE_BIN" ~/pleiades-ops/collect.cjs --dry-run --pm2-bin="$PM2_BIN"; echo "rc=$?"
```

**기대:** `… 수집 통과 · 관측 0 · 기록 N · 미룸 0 (dry-run)` 과 `rc=0`.
- 첫 실행은 상태 파일이 없어서 로그를 **끝에서부터** 읽는다. 과거 로그는 세지 않는다.
- 첫 실행이 09:05 KST 뒤면 일일 요약 1건이 `기록` 에 들어간다.
- `관측` 이 0 이 아니면 아래 판정 양식(3절)을 붙인다. dry-run 로그를 그대로 붙이지 않는다.

**`건너뜀 — 이전 실행이 아직 돈다`** 는 잠금 디렉터리 `~/pleiades-private/ops/collect.lock` 이 15분 안에 만들어졌다는 뜻이다. 15분 뒤에는 다음 실행이 넘겨받고 `lock-stale` 을 기록한다.

## 3. 등록

서버 시간대를 먼저 확인한다. `date +%z` 가 `+0900` 이어야 한다. 주기 칸은 시간대와 무관하지만, 수집기는 시각을 KST 로 기록한다.

`crontab -l` 이 실패하면 기존 항목(db-backup)을 지우지 않도록 멈춘다. 다시 돌려도 줄이 늘지 않는다. 2절의 `NODE_BIN` · `PM2_BIN` 이 같은 셸에 있어야 한다.

```bash
[[ "$NODE_BIN" == /* && "$PM2_BIN" == /* ]] || { echo "[중단] 2절의 경로 변수가 없다 — 2절부터"; false; } && \
if CUR=$(crontab -l 2>&1) || [[ "$CUR" == *"no crontab"* ]]; then
  [[ "$CUR" == *"no crontab"* ]] && CUR=
  { printf '%s\n' "$CUR" | grep -v collect.cjs; echo "2-59/5 * * * * $NODE_BIN --network-family-autoselection-attempt-timeout=2000 $HOME/pleiades-ops/collect.cjs --dry-run --pm2-bin=$PM2_BIN >> $HOME/pleiades-private/ops/collect.log 2>&1"; } | crontab -
else
  echo "[중단] crontab 을 읽지 못했다 — 바꾸지 않았다"
fi
crontab -l | grep -c collect.cjs; crontab -l | grep -c db-backup.cjs
```

마지막 두 숫자는 `1` · `1` 이어야 한다(db-backup 줄 보존).

**10분 뒤** 크론이 실제로 돌았는지 본다.

```bash
tail -2 ~/pleiades-private/ops/collect.log | grep -o '[0-9-]* [0-9:]* \(수집 통과\|건너뜀\).*'
```

### dry-run 판정 양식

며칠 돌린 뒤 새 셸에서 아래를 실행해 **출력 전체를 세션에 붙인다.** 출력은 개수와 지문 짧은 ID뿐이다. 경로 · 포트 · 원문은 나오지 않는다. `DAYS` 는 돌린 날 수다.

```bash
DAYS=3 "$(command -v node)" -e '
const fs=require("fs"),f=process.env.HOME+"/pleiades-private/ops/events.jsonl",since=Date.now()-process.env.DAYS*864e5
const ev=fs.readFileSync(f,"utf8").split("\n").filter(Boolean).map(JSON.parse).filter(e=>e.at>=since)
const by=(k,xs)=>xs.reduce((m,e)=>(m[k(e)]=(m[k(e)]||0)+(e.count||1),m),{})
const posts=ev.filter(e=>e.type!=="obs"),obs=ev.filter(e=>e.type==="obs")
console.log("기간(일)",process.env.DAYS,"· 관측 줄",obs.length,"· 기록",posts.length)
console.log("기록 종류별",JSON.stringify(by(e=>e.type,posts.map(e=>({...e,count:1})))))
console.log("관측 원천별",JSON.stringify(by(e=>`${e.app}·${e.role}·${e.src}·${e.sev}`,obs)))
const top=Object.entries(by(e=>`${e.app}·${e.role}·${e.src} ${e.fp}`,obs)).sort((a,b)=>b[1]-a[1]).slice(0,10)
console.log("지문 상위",JSON.stringify(top))
const d=process.env.HOME+"/pleiades-private/ops/";console.log("크기 KB",JSON.stringify(Object.fromEntries(["state.json","events.jsonl","dry-run.log","collect.log"].map(n=>{try{return [n,Math.round(fs.statSync(d+n).size/1024)]}catch{return [n,null]}}))))'
```

### `all-missing` 기록을 보면

pleiades 프로세스 6개가 모두 jlist 에 없었다는 뜻이다. 수집기는 데몬 소켓이 살아 있을 때만 pm2 를 부른다. 그래도 시험과 호출 사이에 데몬이 죽으면 pm2 CLI 가 **크론 환경으로 빈 데몬을 띄울 수 있다**(008 §2 확정 블록 Q97).

그 데몬 위에서 `pm2 resurrect` 를 하면 앱이 크론 환경(빈 PATH · 다른 env)으로 뜰 수 있다. 크론 셸에서 바로 `resurrect` 하지 않는다. 데몬을 서비스 환경(서버 부팅 때 쓰는 pm2 자동 기동 유닛)으로 다시 띄운 뒤 복구하고, 판정을 Claude 에게 알린다.
