# 운영 수집기 런북 (008 단계 1 · #568)

pm2 상태 · MCP `/health` · web 응답 · pm2 로그 · 디스크를 5분마다 읽어 지문으로 묶고 억제한다. 정본 설계는 `docs/specs/008-monitoring.md` §2 아래 2026-11-10 확정 블록이다.

**PR-2b(#725)부터 게시 판이다.** 크론 줄에 `--dry-run` 이 있으면 지금처럼 외부로 나가는 것이 0 이고(게시할 메시지는 dry-run 로그에만) · 빼면 Discord `#ops` 에 보낸다(4절). 게시를 켜기 전까지는 dry-run 그대로 둔다.

실행은 전부 사용자가 서버에서 한다(Claude 서버 접근 금지 · I-3). 세션에는 판정 양식과 결과 줄만 붙인다.

| 항목 | 값 |
|---|---|
| 스크립트 | `deploy/ops/collect.cjs` — 커밋을 고정해 `~/pleiades-ops/` 에 둔다(db-backup 과 같은 곳). 체크아웃 안에서 부르면 R-8 로 옛 태그를 꺼낼 때 파일이 사라지고, 배포가 도는 파일을 바꾼다 |
| 상태 | `~/pleiades-private/ops/`(700) — `state.json` · `events.jsonl`(요약 이벤트 · 원문 없음) · `dry-run.log`(dry-run 때 템플릿 메시지) · `posted.log`(게시 때 보낸 그대로 · #725) · `collect.log`(크론 출력) · 파일 600 |
| 계정 | 서비스 계정 crontab 한 줄(008 Q97) |
| pm2 | `jlist` 하나만 부른다. 데몬 소켓 연결 시험이 통과한 회에만 부른다. **배포 잠금은 열지 않는다** |
| 크기 | `state.json` 은 상한 1 MB · `events.jsonl` 은 14일 보존(하루 한 번 정리) · `collect.log` · `dry-run.log` 는 정리하지 않는다 — 크기는 dry-run 판정 때 함께 본다(PR-2 에서 다시 정한다) |
| 주기 | 5분(`2-59/5` — 정각과 db-backup 04:20 을 피한다) |

되돌리기: crontab 줄 삭제(**즉시**) · `~/pleiades-ops/collect.cjs` 와 `~/pleiades-private/ops/` 삭제(**즉시** — 억제 기록만 잃는다).

## 1. 설치

`<REF>` 와 `<SHA256>` 은 Claude 가 머지 뒤 실값을 준다. 재설치 때도 검증 전에는 도는 파일을 덮지 않는다.

**지금 설치된 판(2026-11-19 · #846 U1 · AI 사용량 집계 + PR-4 하트비트 판 · 크론 `--dry-run` 없음 · 사용자 설치 통과):** REF `096a5c6d2aa1daceebaa55e759b7fb7d6d3c7027` · SHA256 `cc8681fd040b6567ae69236a743d0233965049c27bc27b4e0326276d7d88bb5f`. 되돌리기: 게시만 멈추려면 3절(크론 줄에 `--dry-run`) · ping 만 멈추려면 6절 되돌리기 · 사용량 집계만 빼려면 직전 판 REF `d7355f2eeacb5fad2238e79e293b932ed251342e`(#847 PR-4 판) · SHA256 `91956340403d481e6d602855f7e1e2eeb5c5a289becf76fb2b0ad48c11a1e145` 로 같은 명령(하트비트는 그대로) · 그 앞 판 REF `18bab57f89e53cba3aed47e57a8c91473ddc3469`(#802) · SHA256 `b8ffdc77ef1af7d7e0933030b9dddfc721df829069f4e6c780509f6391735729` — **이때 healthchecks 체크를 Pause 한다**(그 판은 ping 하지 않는다).

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

**기대:** `… 수집 통과 · 관측 0 · 기록 N · 미룸 0 · 요약만 N (dry-run)` 과 `rc=0`(`요약만` 은 #713 부터).
- **경고(🟡)는 기록하지 않는다 — 일일 요약에만 "경고 어제 N종 M회" 로 나온다**(#713 · 사용자 2026-11-16). 첫 발생·반복·복구 모두 조용히 처리되고 `events.jsonl` 에 `quiet: true` 로 남는다 · `기록` 에는 실패·장애·복구·폭주·요약만.
- 첫 실행은 상태 파일이 없어서 로그를 **끝에서부터** 읽는다. 과거 로그는 세지 않는다.
- 첫 실행이 09:05 KST 뒤면 일일 요약 1건이 `기록` 에 들어간다.
- `관측` 이 0 이 아니면 아래 판정 양식(3절)을 붙인다. dry-run 로그를 그대로 붙이지 않는다.

**`건너뜀 — 이전 실행이 아직 돈다`** 는 잠금 디렉터리 `~/pleiades-private/ops/collect.lock` 이 15분 안에 만들어졌다는 뜻이다. 15분 뒤에는 다음 실행이 넘겨받고 `lock-stale` 을 기록한다. 넘겨받기는 보조 잠금 `collect.lock.takeover` 안에서 한 실행만 한다(#577) — 이것도 15분 넘게 남아 있으면 다음 실행이 치운다.

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

### `gateway · stale` 기록을 보면 (#589)

봇의 생존 표지(`apps/<dir>/logs/alive-<app>.json`)가 10분 넘게 바뀌지 않았다는 뜻이다. 봇 gateway 가 Discord 와 연결을 유지하지 못하고 있다 — 좀비 연결 · IDENTIFY 보호에 막힘 · 치명 close 코드로 멈춤 · 재접속 계속 실패 중 하나다. 그 봇의 `-error` 로그에서 `gateway` 줄을 보고(원문은 세션에 붙이지 않는다) 판정만 Claude 에게 알린다.

**이 판정은 "연결 유지" 를 보지 "응답 가능" 을 보지 않는다.** 연결이 살아 있으면 표지는 정상으로 남으므로, 4014 로 버튼만 받는 모드로 강등된 경우(메시지 명령을 받지 못한다 · stderr 기록으로 따로 잡힌다)와 핸들러·AI 호출이 멈춰 답이 없는 경우는 이 기록으로 드러나지 않는다.

봇이 pm2 에서 멈췄으면 pm2 기록과 함께 나온다.

Discord 를 일부러 끈 봇(봇 토큰을 비움 등)은 표지가 낡은 채 남아 이 기록이 계속 난다 — 그때는 그 표지 파일을 지운다. 파일이 없으면 정상으로 보고, 열려 있던 기록은 복구로 닫힌다.

### `all-missing` 기록을 보면

pleiades 프로세스 6개가 모두 jlist 에 없었다는 뜻이다. 수집기는 데몬 소켓이 살아 있을 때만 pm2 를 부른다. 그래도 시험과 호출 사이에 데몬이 죽으면 pm2 CLI 가 **크론 환경으로 빈 데몬을 띄울 수 있다**(008 §2 확정 블록 Q97).

그 데몬 위에서 `pm2 resurrect` 를 하면 앱이 크론 환경(빈 PATH · 다른 env)으로 뜰 수 있다. 크론 셸에서 바로 `resurrect` 하지 않는다. 데몬을 서비스 환경(서버 부팅 때 쓰는 pm2 자동 기동 유닛)으로 다시 띄운 뒤 복구하고, 판정을 Claude 에게 알린다.

### 통합 층(`adv·bot`) 기록을 보면 (012 4b-3c · #704)

수집기는 통합 층 `pleiades-adv-bot` 을 **수동 배포가 한 번이라도 통과했고(`~/pleiades-private/inplace-adv-last-ok`) 정지 표지(`inplace-adv-stopped`)가 없을 때만** 감시한다 — 처음 clone 한 뒤 · `adv-inplace.sh stop` 뒤에는 아무 기록도 나지 않는다. 다시 켠 첫 회는 정지 동안 쌓인 오류 로그를 건너뛴다.

| 기록 | 뜻 · 할 일 |
|---|---|
| `adv·bot · pm2 · missing` · `status:<x>` | 감시 중인데 pm2 목록에 없다 · online 이 아니다. 띄우려면 `adv-inplace.sh <마지막 통과 태그>`(런북 `advisor-inplace.md`) · 내려 둘 것이면 `adv-inplace.sh stop`(다음 회부터 감시 밖 — 열려 있던 adv 기록은 복구 게시 없이 조용히 닫힌다) |
| `adv·bot · gateway · stale` | 생존 표지(`~/pleiades-adv/apps/advisor/logs/alive-adv.json`)가 10분 넘게 그대로 — 위 `gateway · stale` 절과 같다. 4014(메시지 수신 권한 꺼짐)는 통합 층이 관리자 채널로 따로 알린다 |
| `adv·bot · stderr · …` | 통합 층 프로세스의 크래시 stderr(통합 층의 정상 로그는 stdout 이라 보지 않는다) |

`all-missing` 은 두 앱 6 프로세스로만 센다 — 통합 층 하나가 살아 있어도 두 앱이 모두 없으면 난다. 통합 층에는 health · 침묵 감지가 없다.

### hermes(`hrm·api`) 기록을 보면 (014 H-3 · #802)

통합 층과 같은 규칙으로 감시한다 — **`~/pleiades-private/inplace-hrm-last-ok` 가 있고 `inplace-hrm-stopped` 가 없을 때만**(`hrm-inplace.sh` 가 쓴다 · 배포 중 `inplace-hrm-pending` 이면 보류). hermes 는 gateway 봇이 아니라 생존 표지가 없다 — 대신 **상태 파일 `~/pleiades-hermes-data/state/state.json`**(수치만 · 10초마다)을 본다. 런북 `hermes.md`.

| 기록 | 뜻 · 할 일 |
|---|---|
| `hrm·api · pm2 · missing` · `status:<x>` · `restart` | 감시 중인데 없다 · online 이 아니다 · 재시작했다. 띄우려면 `hrm-inplace.sh <마지막 통과 태그>` · 내려 둘 것이면 `hrm-inplace.sh stop` |
| 🔴 `hrm·api · state · stale` | 상태 파일이 5분 넘게 갱신되지 않았다 — 게시 루프가 멈췄거나 프로세스가 떠 있지만 응답하지 않는다(그동안 다른 상태 판정은 하지 않는다). 파일을 못 읽으면 수집기 경고 `state-read:hrm`. `pm2 logs pleiades-hrm-api --lines 50`(판정만) · 같은 태그로 `hrm-inplace.sh` |
| 🔴 `hrm·api · registry · error` | 출처 레지스트리가 깨졌다 — **받기가 503**(출처가 재시도한다). `hermes-key.sh list` · 손으로 고친 파일을 되돌린다 |
| 🟠 `hrm·api · webhook · none` · `secrets` | `DISCORD_WEBHOOK_HERMES` 없음·형식 오류 / 비밀 대조 재료를 못 읽음 — **받기만 하고 게시는 멈춘다**(대기열에 쌓인다 · 24 h 넘으면 dead). 플랫폼 설정을 고치면 다음 걸음부터 게시 |
| 🟠 `hrm·api · queue · backlog` | 가장 오래된 대기 메시지가 30분 넘었다 — Discord 장애 · 429 · 웹훅 문제. 위 줄과 함께 본다 |
| 🟠 `hrm·api · dead` | 메시지가 dead 가 됐다(시도 20회 · 24 h · Discord 400) — 그 메시지는 게시되지 않는다. 출처에 알린다(오늘 dead 수의 증가로 센다 · 보존 정리와 무관) |
| 🟡 `blocked` · `link-dropped` · `expiry · <출처>` | 게시 전 검사 차단(`#hermes` 에 고정 문구) · 허용 밖 링크 줄을 뺐다 · 출처 키가 7일 안에 만료된다 — **일일 요약에만** |
| 🟠 `hrm·api · stderr · hermes · …` | hermes 의 stderr(대기열 쓰기 실패 · 게시 루프 오류 등). 상태 전환 줄(`게시 멈춤` · `레지스트리 오류`)은 위 상태형 기록과 겹치므로 경고(`hermes-paused` · `hermes-registry`)로만 |

### 판정 보정 (#713 · #622 재판정 2026-11-16)

- **침묵 감지:** fin·fit **bot 은 보지 않는다**(연결은 생존 표지가 본다) · **fin mcp 는 72시간**(주말엔 fin AI 호출이 없다) · fit web·mcp 는 24시간.
- **알려진 stderr:** 외부 스캐너의 Server Action 요청(두 문구 모두 `server-action-ref`) · Auth.js `UnknownAction`(`/api/auth/*` 탐색 · `auth-unknown-action`) — 둘 다 경고(요약에만). 줄 앞 색 코드는 판정 전에 벗긴다.
- **재설치 직후 한 번:** 색 코드로 시작하던 줄은 태그를 새로 읽어 지문이 바뀐다 — 그런 줄이 "새 지문" 으로 한 번 나온다(경고면 요약에만).
- **침묵 · `glob-empty` · 수집기 자신의 경고도 경고다** — 게시되지 않고 일일 요약의 "열린 이상" 에 나온다.
- **스택 연속 덩어리:** 같은 초에 `    at …` 로 시작하는 덩어리는 앞 덩어리의 뒷부분으로 보고 따로 세지 않는다(pm2 가 따로 쓴 스택에 시각을 따로 붙인다).

## 4. 게시 켜기 (PR-2b · #725)

수집기가 Discord `#ops` 로 보낸다. 웹훅은 **플랫폼 설정의 `DISCORD_WEBHOOK_OPS` 하나뿐이다** — 배포 채널로 넘어가지 않는다(008 Q98 · 폴백 없음).

**보내기 전 검사(008 §1-4 ⓪~③):** ⓪ 로그에서 뽑은 칸은 허용 문자일 때만 · ① 두 앱 `.env` 와 플랫폼 설정의 **비밀 키 값**(이름에 `TOKEN`·`SECRET`·`PASSWORD`·`EMAIL`·`WEBHOOK` · `_KEY` · `_PIN` · `DATABASE_URL` — 8자 미만은 건너뜀)이 본문에 들어 있으면 차단 · ② 토큰 형식(`promote_check.py` 와 같은 패턴) · ③ 2000자. 걸리면 본문 대신 **`[ops] 게시 차단 · 지문 <ID> · 사유 <secret-match|token|length>`** 만 보낸다. **세 파일 중 하나라도 못 읽으면 본문을 보내지 않고 미룬다** — 그동안 `[ops] 게시 보류 · 사유 secret-load · 미룸 N` 이 한 시간에 한 번 온다.

**게시 실패(웹훅 없음 · 비밀 읽기 실패 · 네트워크 · HTTP)는 미룸이다** — 다음 회에 다시 보낸다. 실패한 회는 남은 것을 더 보내지 않는다. `collect.log` 의 줄 끝에 이유가 붙는다(`· 웹훅 없음` · `· 웹훅 형식 오류` · `· 비밀 읽기 실패` · `· dotenv 없음` · `· 게시 실패 HTTP 429` — 주소는 찍지 않는다). 한 회 안에서는 0.5초 간격으로 보낸다 — 그래도 429 가 나면 남은 것은 다음 회에 이어 보낸다(잃지 않는다). **본문 때문에 거절(HTTP 400 · 413)** 되면 `사유 rejected` 고정 문구로 바꿔 한 번 보내고 넘어간다.

### 4-1. 웹훅 등록(사용자 · Discord)

`#ops` 채널 → 연동 → 웹후크 만들기 → URL 복사. 플랫폼 설정 파일에 한 줄 더한다(편집기로 · 값을 명령줄·히스토리에 남기지 않는다).

```bash
${EDITOR:-nano} ~/pleiades-platform.env    # DISCORD_WEBHOOK_OPS=<복사한 URL>
chmod 600 ~/pleiades-platform.env && grep -cE '^DISCORD_WEBHOOK_OPS=["'"'"']?https://discord(app)?\.com/api/webhooks/' ~/pleiades-platform.env
```

마지막 숫자는 `1` 이어야 한다.

### 4-2. 게시 판 설치 · 시험

1절 명령을 **게시 판 REF · SHA256** 으로 돌린다(머지 뒤 Claude 가 준다). 2절의 `NODE_BIN` · `PM2_BIN` 을 같은 셸에 둔 채로:

```bash
env -i HOME="$HOME" PATH=/usr/bin:/bin "$NODE_BIN" --network-family-autoselection-attempt-timeout=2000 ~/pleiades-ops/collect.cjs --test-alert; echo "rc=$?"
```

**기대:** `시험 게시 통과 — #ops 에 시험 문구 1건` · `rc=0` · `#ops` 에 🟢 시험 문구. 수집하지 않고 상태 파일도 바꾸지 않는다.
- `웹훅 없음` · `웹훅 형식 오류`(https:// 로 시작하지 않는다) → 4-1 · `비밀 읽기 실패` → 두 앱 `.env` · 플랫폼 설정의 읽기 권한 · `dotenv 없음` → 두 앱 체크아웃의 `node_modules`(배포 중이면 끝난 뒤 다시) · `게시 실패 HTTP 401/404` → 웹훅 URL(지워졌거나 잘렸다).

### 4-3. 크론에서 `--dry-run` 빼기

3절과 같은 방식으로 줄을 바꾼다(db-backup 줄 보존 · 다시 돌려도 줄이 늘지 않는다).

```bash
[[ "$NODE_BIN" == /* && "$PM2_BIN" == /* ]] || { echo "[중단] 2절의 경로 변수가 없다 — 2절부터"; false; } && \
if CUR=$(crontab -l 2>&1) || [[ "$CUR" == *"no crontab"* ]]; then
  [[ "$CUR" == *"no crontab"* ]] && CUR=
  { printf '%s\n' "$CUR" | grep -v collect.cjs; echo "2-59/5 * * * * $NODE_BIN --network-family-autoselection-attempt-timeout=2000 $HOME/pleiades-ops/collect.cjs --pm2-bin=$PM2_BIN >> $HOME/pleiades-private/ops/collect.log 2>&1"; } | crontab -
else
  echo "[중단] crontab 을 읽지 못했다 — 바꾸지 않았다"
fi
crontab -l | grep -c 'collect.cjs --pm2-bin'; crontab -l | grep -c db-backup.cjs
```

마지막 두 숫자는 `1` · `1`. **10분 뒤:**

```bash
tail -2 ~/pleiades-private/ops/collect.log | grep -o '[0-9-]* [0-9:]* \(수집 통과\|건너뜀\).*'
```

줄 끝이 `· 차단 0 (게시)` 이고 `웹훅` · `비밀 읽기 실패` · `dotenv 없음` · `게시 실패` 가 없으면 통과다(`HTTP 429` 한 번은 다음 회에 이어 보내므로 통과로 본다). dry-run 동안 쌓인 것은 다시 나가지 않는다(dry-run 도 기록한 것으로 넘겼다). 다음 09:05 에 일일 요약이 `#ops` 에 와야 한다 — **안 오면 그것이 신호다**(수집기 · 크론 · 웹훅 중 하나가 멈췄다 · 008 §2-4).

**되돌리기:** 3절 명령(줄에 `--dry-run`)을 다시 돌린다 — **즉시**. 이미 보낸 메시지는 Discord 에서 지운다(**중간**). 웹훅을 지우면 다음 회부터 `게시 실패 HTTP 404` 로 미룬다 — 미룬 것이 상태 파일에 쌓이므로 웹훅을 지울 때는 크론도 `--dry-run` 으로 되돌린다.

## 5. 확인 (PR-3 · #739)

게시 판을 켠 뒤 평소에 보는 것은 **`#ops` 의 일일 요약 하나**다. 아래 5-4 양식은 요약이 안 왔을 때 · 차단·보류 문구가 왔을 때 · `건너뜀` 이 이어질 때만 돌린다.

### 5-1. 일일 요약 도착

매일 **09:05 뒤 첫 수집(09:07 무렵)** 에 일일 요약이 온다. 이 글이 수집기 · 크론 · 웹훅 · 서버가 모두 살아 있다는 표지다(008 Q90 — PR-4 외부 ping 전까지 탐지 상한은 사람이 알아채는 때다). 모양(#863 · 2026-11-20 절 나눔 — 이전 판은 한 줄):

```text
[ops] **일일 요약** · 11-19            ← 날짜 = 어제(집계 대상 날)
✅ 살아 있음 · 열린 이상 0 · 경고 어제 2종 25회      ← 열린 이상이 있으면 ❗

**열린 이상**                          ← 있을 때만 · 최대 10 + "외 N"
- fit·web·health `1a2b3c4d5e6f`

**어제 상위**                          ← 어제 관측 수 상위 5(실패 · 경고 모두)
- fin·web·stderr `c95e60949450` ×24

**💰 AI 사용량** (API 환산 · 서비스 호출만)   ← 7절
- 어제 $0.76 — fin $0.58 · fit $0.18 · 4회 · 실패 0
- 이달 $0.76 · 월말 예상 $22.74 (1일 기준)
```

`posted.log` · `dry-run.log` 에는 게시 하나가 한 줄이다 — 여러 줄 본문은 줄바꿈을 ` ⏎ ` 로 적는다.

| 보이는 것 | 뜻 · 할 일 |
|---|---|
| 요약이 왔다 · `열린 이상 0` | 정상 |
| `열린 이상 N` + **열린 이상** 목록 | 아직 복구되지 않은 상태형 이상(pm2 · health · 디스크 · gateway 등) — 지문 짧은 ID 를 Claude 에게 알린다 |
| `경고 어제 N종 M회` | 경고는 게시하지 않고 여기에만 센다(#713) — 평소보다 크게 늘었을 때만 5-4 양식을 붙인다 |
| **10:00 까지 요약이 없다** | 수집기 · 크론 · 웹훅 · 서버 중 하나가 멈췄다 — 5-4 양식을 붙인다 |

### 5-2. 차단 · 보류 문구

| 문구 | 뜻 · 할 일 |
|---|---|
| `[ops] 게시 차단 · 지문 <ID> · 사유 secret-match` | 본문에 비밀 키 값(①)이 들어 있었다 — 본문은 보내지 않았다. 지문 ID 만 Claude 에게 알린다. 로그를 찾아 붙이지 않는다(값이 거기 있다). 어떤 줄인지 알아야 하면 Claude 가 판정 스크립트를 따로 만든다 |
| `… · 사유 token` | 토큰 모양(②) — 위와 같다 |
| `… · 사유 length` | 2000자 넘음(③) — 해롭지 않다 · 반복되면 알린다 |
| `… · 사유 rejected` | Discord 가 본문을 거절했다(HTTP 400 · 413) — 고정 문구로 한 번 보내고 넘어갔다 · 반복되면 알린다 |
| `[ops] 게시 보류 · 사유 secret-load · 미룸 N` | 두 앱 `.env` · 플랫폼 설정 중 하나를 못 읽어 **아무것도 보내지 않고 있다**(한 시간에 한 번 온다). 배포 중이면 끝난 뒤 사라진다 · 계속되면 4-2 의 `비밀 읽기 실패` · `dotenv 없음` 줄 |

`secret-match` · `token` 이 왔으면 **그 값이 로그에 있다는 뜻**이다 — 교체는 사용자가 한다(008 §5-2 P-6). 교체 뒤에도 같은 지문으로 또 오면 그 줄을 쓰는 코드가 값을 찍고 있다.

### 5-3. 남은 잠금

잠금은 디렉터리 `~/pleiades-private/ops/collect.lock` 이다. 한 회가 죽어 남아도 **15분 뒤 다음 실행이 넘겨받는다**(`lock-stale` 기록 1건 · 2절) — 평소에는 손대지 않는다.

`건너뜀 — 이전 실행이 아직 돈다` 가 **20분 넘게 이어지면** 5-4 양식의 `잠금` 칸을 보고:
- **수집기가 실제로 돌고 있다**(`pgrep -fc 'pleiades-ops/collect.cjs'` 가 1 이상) — 한 회 상한(2분)을 넘겨 멈춘 것이다. 그 프로세스를 끝내고(`pkill -f 'pleiades-ops/collect.cjs'`) 다음 회를 본다. 판정은 Claude 에게 알린다.
- **돌고 있지 않은데 잠금이 15분보다 오래됐다** — 넘겨받기가 실패하고 있다(권한 · 디스크 가득 · 시계). `collect.log` 의 `결과: 실패 — 예외 <코드>` 줄의 코드만 Claude 에게 알린다. 프로세스가 없을 때만 `rmdir ~/pleiades-private/ops/collect.lock ~/pleiades-private/ops/collect.lock.takeover 2>/dev/null` 로 치운다 — **돌고 있는 동안 지우면 두 회가 겹친다.**

### 5-4. 확인 양식

새 셸에서 실행해 **출력 전체를 세션에 붙인다.** 읽기만 한다. 출력은 개수 · 날짜 · 사유 코드 · 지문 수뿐이다(경로 · 원문 없음). `collect.log` 는 최근 288줄(5분 주기면 24시간)만 센다.

```bash
"$(command -v node)" -e '
const fs=require("fs"),D=process.env.HOME+"/pleiades-private/ops/",now=Date.now(),pad=n=>String(n).padStart(2,"0")
const ymd=t=>{const d=new Date(t);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`},ago=t=>t==null?"없음":Math.round((now-t)/6e4)+"분 전"
const read=n=>{try{return fs.readFileSync(D+n,"utf8")}catch{return null}}
const st=(()=>{try{return JSON.parse(read("state.json"))}catch{return null}})()
const hm=(()=>{const d=new Date();return pad(d.getHours())+":"+pad(d.getMinutes())})()
console.log("== 수집기 확인 ==",ymd(now),hm)
if(!st)console.log("상태: 읽지 못함")
else{const fps=Object.values(st.fps||{})
 console.log("직전 수집",ago(st.lastRunAt),"· 일일 요약 마지막",st.summaryDate||"없음",st.summaryDate===ymd(now)?"(오늘 나감)":hm>="09:05"?"(오늘 아직 — 신호)":"(09:05 전)")
 console.log("열린 이상",fps.filter(e=>e.kind==="state"&&e.open).length,"· 미뤄진 첫 발생",fps.filter(e=>e.deferred).length,"· 반복 대기",fps.filter(e=>e.pending>0).length,"· 지문",fps.length)}
const lines=(read("collect.log")||"").split("\n").filter(Boolean).slice(-288)
const c={통과:0,건너뜀:0,예외:0,기타:0},why={}
for(const l of lines){if(/ 수집 통과 /.test(l)){c.통과++;const m=l.match(/ · 차단 \d+ · (.+) \(게시\)$/);if(m)why[m[1]]=(why[m[1]]||0)+1}else if(/ 건너뜀 /.test(l))c.건너뜀++;else if(/^결과: 실패/.test(l))c.예외++;else c.기타++}
const last=[...lines].reverse().find(l=>/ (수집 통과|건너뜀) /.test(l))
console.log("collect.log 최근",lines.length,"줄",JSON.stringify(c),"· 실패 사유",JSON.stringify(why))
console.log("마지막 줄",last?last.match(/[0-9-]+ [0-9:]+ (수집 통과|건너뜀).*/)[0]:"없음")
const ev=(read("events.jsonl")||"").split("\n").filter(Boolean).flatMap(l=>{try{return [JSON.parse(l)]}catch{return []}}).filter(e=>e.at>=now-864e5&&e.type!=="obs")
const by=(k,xs)=>xs.reduce((m,e)=>(m[k(e)]=(m[k(e)]||0)+1,m),{})
console.log("24h 기록",JSON.stringify(by(e=>e.type,ev.filter(e=>!e.quiet))),"· 요약만",ev.filter(e=>e.quiet).length,"· 차단",JSON.stringify(by(e=>e.blocked,ev.filter(e=>e.blocked))))
const lk=n=>{try{return Math.round((now-fs.statSync(D+n).mtimeMs)/6e4)+"분"}catch{return "없음"}}
console.log("잠금",lk("collect.lock"),"· 넘겨받기",lk("collect.lock.takeover"))
console.log("크기 KB",JSON.stringify(Object.fromEntries(["state.json","events.jsonl","posted.log","collect.log"].map(n=>{try{return [n,Math.round(fs.statSync(D+n).size/1024)]}catch{return [n,null]}}))))'
```

| 줄 | 정상 |
|---|---|
| `직전 수집` | 5분 안팎 — 15분 넘으면 크론이 돌지 않는다(3절 끝의 두 숫자 확인 명령) |
| `일일 요약 마지막` | 09:05 뒤면 오늘 날짜(`오늘 나감`) — `오늘 아직 — 신호` 면 수집은 도는데 요약을 못 보냈다(`실패 사유` · `미룸` 을 본다) |
| `미뤄진 첫 발생` · `실패 사유` | 0 · `{}` — `게시 실패 HTTP 429` 한두 번은 다음 회에 이어 보내므로 정상 · 그 밖의 사유는 4-2 표 |
| `건너뜀` · `예외` | 0 — 이어지면 5-3 |
| `잠금` | `없음` 또는 몇 분 — 15분 넘게 남았으면 5-3 |
| `크기 KB` | `state.json` 1024 아래(상한 1 MB) · `collect.log` · `posted.log` 는 정리하지 않는다 — 수십 MB 가 되면 알린다 |

되돌리기: 이 절은 문구다(**즉시**). 양식은 상태 파일을 읽기만 한다.

## 6. 외부 하트비트 (PR-4 · #847 · 008 Q90)

서버 전체 장애 · 크론 정지 · 잠금 · Discord 쪽 침묵은 수집기 자신이 알릴 수 없다. 수집기가 **매 회 끝에, 그 회의 게시 경로가 막히지 않았을 때만** 외부 서비스(healthchecks.io)에 ping 한다. ping 이 끊기면 그 서비스가 **이메일**로 알린다(+ 원하면 Discord).

- ping = `GET <주소>` · 본문 없음(밖으로 나가는 데이터 0) · 서버 인바운드 노출 없음
- **ping 하지 않는 회:** `--dry-run` · 웹훅 없음 · 비밀 읽기 실패 · 게시 실패(미룸 1 이상) · 크론이 돌지 않음 · 서버가 죽음 — 전부 외부 서비스의 알림으로 드러난다
- ping 실패는 수집 결과(rc · 상태)를 바꾸지 않는다 · `collect.log` 줄 끝에 이유만(`· ping 통과` · `· ping 실패 HTTP 5xx` · `· ping 건너뜀(게시 막힘)` · `· ping 형식 오류`) — 주소는 찍지 않는다
- 주소는 비밀로 다룬다 — 게시 본문에 실리면 검사 ① 이 막는다(키 이름의 `HEARTBEAT`)

### 6-1. 체크 만들기(사용자 · healthchecks.io)

가입 전에 지금의 무료 한도를 확인한다. 새 체크를 만들고:

| 설정 | 값 |
|---|---|
| Schedule | Simple · **Period 5 minutes**(크론 주기) |
| Grace | **15 minutes** 권고 — 한 회 상한(2분) · 429 로 미룬 한두 회를 소음으로 만들지 않는다 |
| Integrations | **Email**(필수 — Discord 장애 때도 오는 길) · Discord 는 선택 |

Ping URL(`https://hc-ping.com/<uuid>`)을 복사해 플랫폼 설정에 한 줄 더한다(편집기로 · 값을 명령줄 · 히스토리에 남기지 않는다).

```bash
${EDITOR:-nano} ~/pleiades-platform.env    # OPS_HEARTBEAT_URL=<복사한 URL>
chmod 600 ~/pleiades-platform.env && grep -cE '^OPS_HEARTBEAT_URL=["'"'"']?https://' ~/pleiades-platform.env
```

마지막 숫자는 `1` 이어야 한다.

### 6-2. 설치 · 시험

1절 명령을 **PR-4 판 REF · SHA256** 으로 돌린다. 시험은 크론이 쓰는 node 로 한다 — 새 셸이면 `NODE_BIN` 이 비어 `env: ''` rc 127 이 난다(2026-11-19 실측). 크론 줄의 여섯째 칸이 node 경로다:

```bash
NODE_BIN=$(crontab -l | grep 'collect.cjs --pm2-bin' | awk '{print $6}')
case "$NODE_BIN" in /*) echo "node 경로 통과" ;; *) echo "[중단] 크론 줄에서 node 경로를 찾지 못했다 — 2절의 NODE_BIN 으로" ;; esac
env -i HOME="$HOME" PATH=/usr/bin:/bin "$NODE_BIN" --network-family-autoselection-attempt-timeout=2000 ~/pleiades-ops/collect.cjs --test-ping; echo "rc=$?"
```

**기대:** `시험 ping 통과 — 외부 서비스에서 마지막 ping 시각을 확인한다` · `rc=0` · healthchecks 화면의 체크가 `up`. 수집하지 않고 상태 파일도 바꾸지 않는다.
- `OPS_HEARTBEAT_URL 없음` · `형식 오류` → 6-1 · `dotenv 없음` → 4-2 표 · `통과 · 단 크론 회는 ping 을 건너뛴다 — <사유>`(rc 1) → 그 사유(4-2 표)를 먼저 고친다 · `시험 ping 실패 HTTP 404` → 주소가 잘렸거나 체크가 지워졌다 · `TypeError` · `AbortError` → 서버의 나가는 연결

크론 줄은 바꾸지 않는다(같은 줄이 다음 회부터 ping 한다). **10분 뒤** `tail -2 ~/pleiades-private/ops/collect.log` 줄 끝에 `· ping 통과` 가 있고 healthchecks 의 마지막 ping 이 5분 안팎이면 통과다.

**되돌리기:** 플랫폼 설정에서 `OPS_HEARTBEAT_URL` 줄 삭제 → 다음 회부터 ping 없음(**즉시**) · 또는 수집기 옛 판 재설치(**즉시**). **어느 쪽이든 healthchecks 의 체크를 Pause 한다**(안 하면 유예 뒤 "down" 알림이 온다). 계정 · 체크 삭제는 사용자.

## 7. AI 사용량 · API 환산 비용 (#846 U1)

수집기가 세 앱의 AI 호출 줄에서 **CLI 가 계산한 API 가격 환산 비용**(`total_cost_usd`)을 모아 일일 요약 끝에 절 하나를 붙인다(#863 — 이전 판은 한 줄):

```text
**💰 AI 사용량** (API 환산 · 서비스 호출만)
- 어제 $1.23 — fin $0.80 · fit $0.30 · adv $0.13 · 41회 · 실패 2
- 이달 $12.40 · 월말 예상 $28.00 (14일 기준)
```

- **읽는 줄:** 고정 접두 세 개만 — fin `[advisor] ok|fail caller=`(web · bot · mcp 의 stdout · stderr — mcp 는 사용자 전략 파서) · fit `[askAdvisor] channel=`(web · bot stdout) · 통합 층 `[advisor] key=`(adv-bot stdout). 그 밖의 줄은 버린다. 꺼내는 것은 앱 · 호출부/채널 이름(허용 문자만) · 성공/실패 · cost 숫자 — **원문은 저장하지 않는다**
- **저장:** 상태 파일 `usage` 칸(날짜별 앱 · 호출부 합 · 62일) · 일일 요약을 보낸 회에 어제 하루치를 `usage.jsonl` 에 한 줄(015 V-5 가 읽는다)
- **처음 켠 회**(이 판을 설치한 첫 회)는 모든 로그를 끝에서 시작한다 — 과거 호출은 세지 않는다. 그날의 요약은 `- 집계 시작 전` · 다음 날 요약의 "어제" 는 설치 회부터라 **`(집계 시작일 · 일부)`** 가 붙는다(#863)
- **월말 예상** = 이달 누적 ÷ 집계한 날수 × 그 달 날수 — 괄호의 `N일 기준` 이 그 날수다(며칠 쌓이기 전에는 흔들린다)
- **잡히지 않는 것:** fit 의 실패 호출(비용 줄이 없다 — U2 에서 메운다) · 서버에서 사람이 쓰는 개발 세션(같은 계정이지만 로그가 없다) · 비용 칸이 `?` 이거나 깨진 줄은 `비용 모름 N` 으로 센다
- 날짜는 수집 회의 KST 날짜다 — 자정 근처 5분 안의 호출은 다음 날로 갈 수 있다 · 수집기가 오래 멈췄다 다시 돌면 밀린 줄이 재개한 날로 들어간다 · 설치한 달의 월말 예상은 첫날이 반나절이라 낮게 나온다
- **시뮬레이션이다.** 실제 청구는 구독이다. CLI 의 환산이 공식 가격과 맞는지는 U2(모델별 토큰 × 가격표 대조)에서 검증한다

**되돌리기:** 직전 판으로 재설치(**즉시** — 옛 판은 `usage` 칸을 읽지 않는다) · `usage.jsonl` 삭제(**즉시**).
