# 제자리 재배포 — 같은 체크아웃에 새 태그 (#248)

**누가:** 서버 단계는 사용자가 서비스 계정으로 한다(Claude 서버 무접촉 · I-3). 태그 대조(A)·릴리즈만 Claude 가 한다.
**무엇:** 전환 뒤 릴리즈를 **이미 서비스 중인 체크아웃**(`~/pleiades-fin` · `~/pleiades-fit`)에 배포한다 — 007 R-8 의 정방향. 전환 런북(`007-t5-fin-cutover.md` · `007-t9-fit-cutover.md`)과 달리 옛 서비스가 없으므로 `deploy/deploy.sh <app>` 기본 실행이 **exit 3 없이 활성화까지 한 번에** 간다.
> **결과 (2026-10-26 · #276) — `v1.0.1` 서버 첫 적용 완료.** fin `rc 0 · 134 s` → fit `rc 0 · 81 s` · 노출 창 프로브 오류 응답 **0**(두 앱) · 창 안 오류 줄 = web 1(Next.js 시작 경고)·bot 0·mcp 0(두 앱) · R-8 없음. C6 임시 완화 제거 · 확인 1~4 통과(확인 5 는 다음 06:15 · 토 주간 리뷰). 판정 표 `measured-facts.md` *2026-10-26 — v1.0.1 제자리 재배포*. 실행 중 고친 것: C5 오류 줄 명령(파일명의 pm2 id). 되돌리기: 문구 (**즉시**).

**첫 적용:** `v1.0.1`(#247 — CLI 상위 컨텍스트 제외 · 예산 초과 로깅 · fin·fit 둘 다 · 함께: #255 모델 고정 · #261 fin 벤치마크 크론 · #269 fin AI 실패 가시성·TA 가이드 한도 \$0.25 — 확인은 C6). **이 경로는 서버에서 처음이다** — 결과가 #242(배포 자동화)의 전제가 된다.
## 실행 — 스크립트 (#278 · `v1.0.2` 부터)

**아래 A~C5 는 `deploy/release-inplace.sh` 가 한 번에 한다.** 사용자는 앱마다 한 줄을 돌리고 **끝에 나오는 판정 양식 블록만** 세션에 붙인다. 원본 로그는 `~/pleiades-private/inplace-<app>-<시각>.log`(600 · 저장소 밖)에만 남는다.

```bash
V=v1.0.2
~/pleiades-fin/deploy/release-inplace.sh fin "$V" --dry-run   # A·B·C1 검사만 — 바꾸지 않는다(먼저 한 번)
~/pleiades-fin/deploy/release-inplace.sh fin "$V"             # 확인 [y/N] 뒤 C2~C5 → 판정 양식
#  fin 결과가 "결과: 통과" 이고 웹·텔레그램 현황 확인 뒤
~/pleiades-fit/deploy/release-inplace.sh fit "$V"
```

## 자동 배포 (#242 · Release 발행 = 배포)

설정을 마친 뒤로는 **Release 가 발행되면** `.github/workflows/deploy.yml` 이 서버에 `deploy <tag>` 를 보내고, forced command `deploy/ssh-deploy.sh` 가 fin → fit 순서로 `release-inplace.sh <app> <tag> --yes` 를 돌린다(fin 이 통과하지 않으면 fit 은 하지 않는다). 판정 양식은 그 Actions 실행의 **요약(Summary)** 에 남는다 — 실패면 양식의 "재시도:"·"R-8:" 줄을 서버에서 손으로 실행한다. 서버 조치가 필요한 릴리즈는 Claude 가 draft 로 만들고 사용자가 서버 조치 뒤 Publish 한다(`workflow.md` 릴리즈 절).

**한 번만 하는 설정(사용자)** — `ssh-deploy.sh` 가 서버 fin 체크아웃에 있어야 하므로 **이 파일이 든 태그를 먼저 손으로 배포한 뒤**(아래 스크립트 실행) 한다. 그 전의 Release 발행은 workflow 가 "secret 없음" 으로 곧바로 실패한다 — 정상이다.

```bash
# 1) 서버 — 배포 전용 키(비밀번호 없음 · 저장소 밖 · umask 는 서브셸에서만)
(umask 077; ssh-keygen -q -t ed25519 -N '' -C pleiades-deploy -f ~/pleiades-private/deploy_key)
# 2) 서버 — authorized_keys 에 forced command 줄(restrict = 포워딩·pty 전부 끔)
printf 'restrict,command="%s/pleiades-fin/deploy/ssh-deploy.sh" %s\n' "$HOME" "$(cat ~/pleiades-private/deploy_key.pub)" >> ~/.ssh/authorized_keys
# 3) 서버 — 거부 확인(키를 지우기 전에 · 기대: rc 2 · "받는 명령은 'deploy vX.Y.Z' 하나다")
ssh -i ~/pleiades-private/deploy_key -p <포트> localhost bash; echo "rc=$?"
# 4) 로컬(Mac) — 서버 호스트 키(DEPLOY_HOST 와 똑같은 이름·포트로 · 22 가 아니면 [호스트]:포트 형식으로 나온다)
ssh-keyscan -t ed25519 -p <포트> <호스트> > /tmp/pleiades_known_hosts
ssh-keygen -lf /tmp/pleiades_known_hosts      # 지문을 서버의 `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` 와 대조(처음 받는 값을 믿지 않는다)
```

5) **GitHub** — Settings → Environments → `production`(없으면 New) → *Deployment branches and tags* = **Selected branches and tags** · **Add rule → Tag → `v*`** 하나만(브랜치 규칙은 두지 않는다 — 이 규칙이 키를 지킨다 · `pleiades-resume` 이 매 세션 점검) → *Environment secrets* 에 `DEPLOY_SSH_KEY`(= 서버 `deploy_key` 내용) · `DEPLOY_HOST` · `DEPLOY_USER` · `DEPLOY_KNOWN_HOSTS`(= 4 의 파일 내용) · `DEPLOY_PORT`(22 가 아니면). **저장소 수준 secrets 는 0 그대로**(I-9). Claude 는 secrets 를 만들지도 읽지도 않는다.
6) 서버 — `rm ~/pleiades-private/deploy_key`(개인 키는 GitHub 에만 · 공개 키는 authorized_keys 에 남는다). 실제 배포 확인은 다음 Release.

- **두 배포가 겹치지 않는다** — `release-inplace.sh` 가 `~/pleiades-private/deploy.lock` 에 flock 을 잡는다(손 실행 포함 · 프로세스가 끝나면 커널이 푼다 · 지우지 않는다).
- **R-8 로 #242 이전 태그(`v1.0.2` 이하)에 가면** fin 체크아웃에서 `ssh-deploy.sh` 가 사라진다 — 그동안 자동 배포는 실패로 닫힌다(안전 쪽). 다시 #242 이후 태그를 손으로 배포하면 돌아온다.
- 마이그레이션 릴리즈는 prerelease 로 발행돼 건너뛴다 · 서버 조치 릴리즈는 draft → 조치 뒤 Publish(`workflow.md` 릴리즈 절).

되돌리기: authorized_keys 의 `pleiades-deploy` 줄 삭제 · environment secrets 삭제 · workflow 삭제(**즉시**). 끄기만 하려면 Actions 에서 workflow Disable.
> **결과 (2026-10-26 · #289) — `v1.0.2` 를 스크립트로 첫 배포(부트스트랩) 완료.** fin rc 0 · 135 s · 프로브 오류 응답 1(웹 재기동 ≈2 s) → fit rc 0 · 75 s · 0 · 두 앱 C5 통과 · 사람 확인 예 · R-8 없음. 세션에는 판정 양식만. 판정 표 `measured-facts.md` *2026-10-26 — v1.0.2*. 이제 서버 체크아웃에 스크립트가 있으므로 다음부터는 체크아웃 안 판. 되돌리기: 문구 (**즉시**).

**첫 배포 — 부트스트랩(`v1.0.1` → `v1.0.2` 한 번만).** 지금 서버 체크아웃(`v1.0.1`)에는 이 스크립트가 없다 — 새 태그에서 꺼낸 판을 체크아웃 **밖**에서 부르고 `--checkout` 으로 가리킨다. 태그 fetch 는 ref 만 만들어 체크아웃은 깨끗하다(PR #283 Codex P2).

```bash
V=v1.0.2; mkdir -p ~/pleiades-private && chmod 700 ~/pleiades-private
git -C ~/pleiades-fin fetch -q --no-tags origin tag "$V"
git -C ~/pleiades-fin show "$V":deploy/release-inplace.sh > ~/pleiades-private/release-inplace.sh
bash ~/pleiades-private/release-inplace.sh fin "$V" --checkout ~/pleiades-fin --dry-run
bash ~/pleiades-private/release-inplace.sh fin "$V" --checkout ~/pleiades-fin
bash ~/pleiades-private/release-inplace.sh fit "$V" --checkout ~/pleiades-fit
```

그 뒤(`v1.0.2` 가 돌고 있으면)부터는 위의 체크아웃 안 판을 쓴다.

- **실패 뒤 다시:** C4·C5 에서 실패하면 HEAD 는 이미 새 태그다 — 같은 태그를 다시 돌릴 때는 `--retry`(양식의 "재시도:" 줄 그대로). R-8 이 실패했을 때도 같다. 통과할 때마다 `~/pleiades-private/inplace-<app>-last-ok` 에 태그를 적고(기록이 없는 첫 배포는 checkout 전에 직전 태그를 적는다 · PR #286 Codex P2), R-8 안내는 그 값을 쓴다.
- **이 스크립트는 그 앱 체크아웃 안의 것**을 부른다 — `pleiades-<app>-*` 3 프로세스가 그 체크아웃에서 돌지 않으면 C1 에서 멈춘다.
- **새 셸에서 불러도 된다** — C1(셸 키 비우기 · `PLEIADES_ENV_FILE` · 도는 6 `same`)을 스크립트가 자기 안에서 한다.
- **종료 코드:** 0 통과 · **1 서비스·체크아웃 그대로 중단**(A·B·C1 · 빌드 전 실패면 스크립트가 직전 태그로 checkout 을 되돌린 뒤) · 3 deploy.sh exit 3(옛 서비스 online) · **4 빌드·재기동 뒤 실패**(또는 되돌리기 실패) → 양식의 R-8 줄 그대로(`release-inplace.sh <app> <직전 태그>` · 직전 배포가 중간에 멈춰 프로세스가 3 개 미만이어도 돈다).
- `--dry-run` 은 서비스·체크아웃을 바꾸지 않는다 — 원본 로그 파일을 만들고 새 태그를 fetch 할 뿐이다(백업 없음).
- **창 안 오류 줄의 한계:** pm2 는 쓰기 덩어리마다 시각을 붙여 여러 줄 스택의 뒷줄은 세지 않는다(적게 센다) · 시각은 pm2 데몬 TZ 기준.
- 봇 `409` 는 재기동 뒤의 텔레그램 getUpdates 충돌 줄만 센다(숫자 409 · 옛 줄 제외).
- 스크립트가 멈추는 것(사람 판단 없이): 마이그레이션 · `mcp-config.json` 변경 · HEAD 가 태그가 아님 · 체크아웃 dirty · 플랫폼 설정 권한 ≠ 600 · 도는 프로세스의 `PLEIADES_ENV_FILE` 이 다름 · deploy.sh rc ≠ 0 · C5(3 online · mcp 200 · 409 0 · 재기동 `same`) 실패.
- **사람이 하는 것:** C0 시각 고르기 · 양식의 "사람 확인" 줄(웹 화면 · 텔레그램 `현황`/`/today`) · 릴리즈별 확인(C6 처럼 그 릴리즈에 있으면).
- 아래 A~C5 절은 **스크립트가 하는 일의 설명**이자 스크립트가 없을 때의 수동 경로다. 둘이 다르면 스크립트가 정본이다(테스트 `python3 -m unittest discover -s deploy`).

> **정정 (2026-10-26 · #278) — A 의 pathspec.** 아래 A 의 `'apps/*/prisma/migrations'` · `'apps/*/.env.example'` · `'apps/*/package-lock.json'` 은 **언제나 0 을 낸다** — 와일드카드 pathspec 은 디렉터리 접두로 맞지 않는다(실측: 이 저장소 이력에서 0 ↔ 앱 경로 직접 68). 스크립트 테스트가 잡았다. `v1.0.0 → v1.0.1` 은 앱 경로로 다시 재도 전부 0 — 그날 판정은 맞았다(`deploy.sh` 의 DB 대조도 2차로 막는다). 아래 명령은 앱 경로로 고쳤다. 되돌리기: 문구 (**즉시**).

**언제:** T-6 판정(2026-10-26 월 07:00 이후) 뒤. 앱마다 따로 — **fin 먼저 → 확인 → fit.**
**셸:** bash · zsh. **C 절은 처음부터 끝까지 같은 셸**에서(앱 둘을 같은 셸에서 이어 해도 된다).
**결과:** 원본 출력은 세션에 주지 않는다. 맨 아래 [판정 양식](#판정-양식)만.

## 전환과 다른 점

| | 전환(T-5 · T-9) | 제자리(이 런북) |
|---|---|---|
| 체크아웃 | 새 체크아웃에 빌드 · 옛 서비스는 계속 돈다 | **도는 체크아웃에서 checkout · 빌드** |
| `deploy.sh` | 기본 실행 exit 3 → 옛 정지 → `--activate` | **기본 실행 한 번 · rc 0**(옛 서비스가 없어 점유 검사가 통과) |
| 중단 | 옛 정지 → 활성화 사이(36~73 s) | **명시적 중단 없음 — 대신 노출 창**(아래) |
| 상태(P-2′) | 옛 → 새로 이동 | 이동 없음(같은 체크아웃 · gitignored) |
| 되돌리기 | R-2(옛 서비스) | **R-8**(직전 태그 제자리) → 실패 시 R-2(T-8 전) |

**노출 창.** 기본 실행의 1단계 `npm ci`(루트 → 앱)와 3단계 빌드는 **도는 웹·봇·MCP 아래에서** `node_modules` · `packages/notify/dist` · `.next` · `dist/bot` 을 바꾼다. 그 사이 프로세스는 메모리의 옛 코드로 돌지만, 나중에 불러오는 모듈·페이지는 실패할 수 있고 웹 요청이 오류를 낼 수 있다. MCP 는 `dist/mcp/server.cjs` 를 활성화 때만 바꾼다. 길이 ≈ 기본 실행 시간 — 전환 실측 **fin 65 s · fit 326 s**(+ 활성화 ≈ 20 s). **그 사이 autorestart 가 나면 반쯤 바뀐 트리에서 뜬다**(007 R-8) — 끝의 재기동이 다시 맞춘다. 이 런북은 창을 **줄이지 않고 잰다**(C3 프로브 · C5 오류 줄 수) — #242 가 같은 경로를 무인으로 돌릴지 판단할 근거다.

## 되돌리기 한눈에

| 어디까지 했나 | 되돌리기 | 등급 |
|---|---|---|
| A · B · C1 | 아무것도 안 해도 된다 | **즉시** |
| C2(checkout)만 | `git checkout -q <직전 태그>` — 도는 프로세스는 아직 옛 빌드 | **즉시** |
| C4 도중 실패 · C5 이상 | [R-8](#r-8--직전-태그로-제자리-되돌리기) — 직전 태그 checkout → 같은 기본 실행 | **중간**(노출 창 1회 더) |
| R-8 도 실패 | 그 앱 전환 런북의 R-2(옛 서비스 · **T-8 전까지만**) | 중간 |
| 새 태그가 마이그레이션을 실었다 | 이 런북 대상이 아니다 — A 에서 멈춘다(`deploy.sh` 는 적용하지 않는다 · 되돌리기가 편도가 된다) | 편도 |

---

## A. 태그 대조 (Claude · 릴리즈 직후)

`P`=직전 태그(지금 서버) · `V`=새 태그. 런타임에 닿는 것 중 **바뀌면 이 런북으로 안 되는 것**과 **바뀌면 위험이 커지는 것**을 가른다.

```bash
P=v1.0.0 V=v1.0.1
git diff --name-only "$P" "$V" -- apps/finance/prisma/migrations apps/fitness/prisma/migrations   # 없음 — 있으면 멈춘다(Q74 · 편도) · 와일드카드 pathspec 금지(#278)
git diff --name-only "$P" "$V" -- apps/finance/src/lib/ai/mcp-config.json  # 없음 — 있으면 멈춘다(007 Q83 조건 (ii): 도는 fin 이 호출마다 읽는다)
git diff --name-only "$P" "$V" -- deploy/ apps/finance/.env.example apps/fitness/.env.example   # 있으면 릴리즈 노트 "서버 조치" 와 대조(major 여부 · workflow.md 릴리즈 절)
git diff --name-only "$P" "$V" -- package-lock.json apps/finance/package-lock.json apps/fitness/package-lock.json   # 있으면 npm ci 가 바꾸는 범위가 크다 — 판정 양식에 적는다
git diff --stat "$P" "$V" -- apps packages deploy package.json | tail -1   # 규모
```

**`v1.0.1` 서버 조치:** #247 임시 완화(서버 사용자 설정 `claudeMdExcludes` 4항목)를 **두 앱 배포 뒤 C6 에서 제거**한다. 그 밖에 없음.

## B. 기록 (사용자 · 배포 직전)

```bash
APP=fin; D=~/pleiades-$APP                 # fit 차례에는 APP=fit
git -C "$D" describe --tags --exact-match HEAD; git -C "$D" status --porcelain   # 직전 태그 · 출력 없음
OLD_UMASK=$(umask); umask 077
B=/backup/pleiades-cutover/inplace-$APP-$(date +%Y%m%d-%H%M); mkdir -p "$B" && cp ~/.pm2/dump.pm2 "$B/dump.pm2"
umask "$OLD_UMASK"; ls -la "$B"
```

DB 백업은 하지 않는다 — A 에서 마이그레이션 0 을 확인했고 `deploy.sh` 는 적용하지 않는다(fin `next build` prerender 는 DB 를 읽기만 한다).

## C. 배포

### C0. 시각

두 앱 크론이 비는 **00:15~05:55**(fin `007-t5` C0′ · fit `007-t9` C0′). fin 은 매시 :00 · 미국장 시간 10분 틱이 있으니 일요일 새벽이나 평일 06:00 전 미국장 종료 뒤가 가장 조용하다. 매월 1일 · 1·4·7·10월 7일 · 월요일 07:00 직전은 피한다. fit 은 기본 실행이 5분 넘게 걸린다 — 시작 시각을 잡을 때 그만큼 남긴다.

### C1. 셸 env

```bash
# 셸 값이 .env 를 가리고, pm2 --update-env 는 이 셸의 env 를 재기동 프로세스에 넘긴다(전환 C1 · PR #219 Codex P2)
KEYS='DATABASE_URL|PORT|MCP_PORT|MCP_TRANSPORT|TELEGRAM_[A-Z_]*|DISCORD_[A-Z_]*|NOTIFY_[A-Z_]*|GARMIN_[A-Z_]*|OMRON_[A-Z_]*|MFDS_[A-Z_]*|WHOOING_[A-Z_]*|CLAUDE_BIN|NODE_ENV|PLEIADES_ENV_FILE|AUTH_[A-Z_]*|NEXTAUTH_[A-Z_]*|BASE_URL|FIRECRAWL_[A-Z_]*|MYFINANCE_ROOT|MCP_CONFIG_PATH'
for k in $(env | grep -oE "^($KEYS)=" | tr -d =); do unset "$k"; done; env | grep -cE "^($KEYS)=" || true   # 0
# 플랫폼 설정 — deploy/pleiades.config.cjs 는 이 값을 셸에서만 받는다. 빠뜨리면 재기동 프로세스가 플랫폼 설정을 잃는다(T-10 뒤면 Discord 라우팅이 조용히 텔레그램으로)
export PLEIADES_ENV_FILE="$HOME/pleiades-platform.env"; stat -c '%a %U' "$PLEIADES_ENV_FILE"   # 600 <계정>
# 도는 프로세스와 같은 값인지 — 값은 출력하지 않는다
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const l=JSON.parse(s.slice(s.indexOf("[")));for(const p of l.filter(x=>x.name.startsWith("pleiades-"))){const v=p.pm2_env.PLEIADES_ENV_FILE??(p.pm2_env.env||{}).PLEIADES_ENV_FILE;console.log(p.name,v===undefined?"MISSING":v===process.env.PLEIADES_ENV_FILE?"same":"DIFF")}})'
```

**기대값:** 셸 키 0 · `600` · 6줄 전부 `same`. `DIFF`·`MISSING` 이 있으면 멈추고 판정 양식에 적는다 — 전환 때 넘긴 값과 다르다.

### C2. 새 태그로 checkout

```bash
APP=fin; D=~/pleiades-$APP; V=v1.0.1
git -C "$D" fetch -q --no-tags origin tag "$V" && git -C "$D" checkout -q "$V"
git -C "$D" describe --tags --exact-match HEAD; git -C "$D" status --porcelain    # $V · 출력 없음
```

도는 프로세스는 아직 옛 빌드다(웹 `.next` · 봇·MCP `dist`). fin advisor 가 호출마다 읽는 `mcp-config.json` 은 A 에서 불변을 확인했다.

### C3. 프로브 시작 (노출 창 측정)

```bash
case $APP in fin) WP=4100 ;; fit) WP=4200 ;; esac
PR=/tmp/inplace-$APP-probe.log
( while :; do printf '%s %s\n' "$(date +%T)" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$WP/")"; sleep 2; done ) > "$PR" 2>&1 &
PROBE=$!; sleep 5; tail -2 "$PR"        # 평소 코드(2xx·3xx)가 찍힌다
```

### C4. 기본 실행

```bash
cd "$D"
bash deploy/deploy.sh "$APP" --dry-run > /tmp/inplace-$APP-plan.log 2>&1; echo "plan rc=$?"   # 0
T0=$(date '+%F %T'); SECONDS=0
bash deploy/deploy.sh "$APP" > /tmp/inplace-$APP.log 2>&1; echo "rc=$? ${SECONDS}s"; tail -4 /tmp/inplace-$APP.log
T1=$(date '+%F %T')
```

**기대값:** `rc=0` · `=== 완료: <app> · v1.0.1 ===` · `pleiades-<app>-{mcp,web,bot}` online.
- **`rc=3`** — 옛 서비스 pm2 가 online 이라는 뜻이다. 있으면 안 된다 — 멈추고 판정 양식에.
- **그 밖의 비0** — 마지막 `deploy.sh: 중단 — …` 문장을 본다. 마이그레이션 차이면 A 와 어긋난 것 — 멈춘다. 빌드·pre-flight·안정성 실패면 [R-8](#r-8--직전-태그로-제자리-되돌리기). 발췌가 필요하면 `grep -n -B3 -A25 'Error' /tmp/inplace-$APP.log | sed "s#$HOME#~#g" | head -60`.

### C5. 확인

```bash
kill "$PROBE"; awk '$2 !~ /^[23]/' "$PR" | wc -l; awk '$2 !~ /^[23]/' "$PR" | sed -n '1p;$p'   # 오류 응답 수 · 처음·마지막 시각
for r in web bot mcp; do printf '%s ' "$r"; cat ~/.pm2/logs/pleiades-$APP-$r-error*.log 2>/dev/null | awk -v s="$T0" -v e="$T1" 'substr($0,1,19)>=s && substr($0,1,19)<=e' | wc -l; done   # 창 안 오류 줄 수 — 파일명에 pm2 id 가 붙는다(-error-<id>.log · 재배포로 봇 id 가 바뀐다 · #276)
pm2 ls | grep -E "pleiades-$APP"                                               # 3 online
case $APP in fin) MP=4210 ;; fit) MP=4301 ;; esac
curl -sS -o /dev/null -w 'mcp %{http_code}\n' "http://127.0.0.1:$MP/health"   # 200
pm2 logs "pleiades-$APP-bot" --lines 60 --nostream 2>&1 | grep -ciE '409|conflict' || true   # 0
# 재기동 프로세스가 플랫폼 설정을 받았는지 — C1 의 같은 줄
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const l=JSON.parse(s.slice(s.indexOf("[")));for(const p of l.filter(x=>x.name.startsWith("pleiades-"))){const v=p.pm2_env.PLEIADES_ENV_FILE??(p.pm2_env.env||{}).PLEIADES_ENV_FILE;console.log(p.name,v===undefined?"MISSING":v===process.env.PLEIADES_ENV_FILE?"same":"DIFF")}})'
```

그리고 사람이 확인한다: 웹 화면(fin 계좌 · fit 오늘) · 텔레그램 fin **`현황`**(슬래시 없이 · `portfolio.ts:150`) 또는 fit **`/today`**(`today.ts:5`) — 둘 다 등록된 명령이고 DB 읽기만(AI · 외부 시세 · 쓰기 없음). **`/브리핑` 은 쓰지 않는다** — fin 은 `/briefing`·`브리핑` 만 등록하고, 브리핑은 `askAdvisor` 를 거쳐(재시도 · 최대 15분) 봇 확인과 AI 확인(C6)이 섞인다(PR #249 Codex P2).

**fit 은 fin 이 C5 를 통과한 뒤 같은 셸에서 B(`APP=fit`)부터** 다시 — C1 은 unset·export 가 이미 됐으니 확인 줄만, C2 도 `APP=fit` 으로.

### C6. 릴리즈별 확인 — `v1.0.1`(#247 · #255 · #261 · #269)

두 앱 C5 를 통과한 뒤. **임시 완화를 지워야 코드 수정의 효과를 확인할 수 있다.**

```bash
F=~/.claude/settings.json
node -e '
const fs = require("fs"), f = process.argv[1], h = process.env.HOME
const cur = JSON.parse(fs.readFileSync(f, "utf8"))
const drop = new Set(["pleiades-fin", "pleiades-fit"].flatMap((d) => [`${h}/${d}/CLAUDE.md`, `${h}/${d}/.claude/rules/**`]))
const rest = (cur.claudeMdExcludes || []).filter((p) => !drop.has(p))
const { claudeMdExcludes, ...others } = cur
const next = rest.length ? { ...others, claudeMdExcludes: rest } : others
fs.writeFileSync(f, JSON.stringify(next, null, 2) + "\n")
console.log("남은 항목", rest.length)' "$F"                  # 남은 항목 0 (#247 전에 다른 항목이 없었다면)
```

- **확인 1 (fin):** 텔레그램에서 AI 질문 1건 → 응답 · 봇 로그에 그 호출의 비용 줄(#247 C 로깅)이 남고 컨텍스트가 전환 전 수준이다. 다음 TA 시그널 알림에 가이드 문구가 붙는다(알림이 와야 볼 수 있다).
- **확인 2 (fit):** AI 질문 1건 → 응답.
- **혼동 주의:** 이제 앱 cwd 에서 맨 `claude -p "ping"` 을 치면 다시 ~107k 가 나온다 — 정상이다. 수정은 앱이 CLI 를 부르는 인자에 있고, 손으로 친 CLI 에는 없다.
- 이상하면 백업(`$F.bak-247`)이 아니라 **위 4항목을 다시 넣는다**(그 사이 다른 설정이 바뀌었을 수 있다 — #247 첫 완화 명령 그대로) · 판정 양식에.

함께 들어간 것(#271 · 확인 1 의 AI 질문 뒤 같은 셸에서):

```bash
pm2 logs pleiades-fin-bot --lines 1000 --nostream 2>&1 | grep -E '\[advisor\] (ok|fail)' | tail -5   # #255 · #247 C — used= 에 model= 값이 있고 나머지도 고정 ID 인가 · cost=
pm2 logs pleiades-fin-bot --lines 1000 --nostream 2>&1 | grep -c '모델 드리프트'                     # #255 — 0
pm2 logs pleiades-fit-bot --lines 1000 --nostream 2>&1 | grep -c '모델 드리프트'                     # #255 fit — 0
pm2 logs pleiades-fit-web --lines 1000 --nostream 2>&1 | grep -c '모델 드리프트'                     # #255 fit 웹 — 0
```

- **확인 3 (#255):** `used=` 에 `model=` 값이 **들어 있고**, 함께 찍힌 다른 ID 도 `apps/*/src/lib/ai/models.ts` 의 고정 ID 다 — sonnet 호출은 CLI 보조 모델(고정 haiku)이 같이 찍히는 게 정상이다(`detectModelDrift` 와 같은 기준 · 런북 `ai-model-upgrade.md`). **판정 기준은 `모델 드리프트` 0** 이다 — 고정 목록 밖 ID 가 찍히면 그 경고가 같이 난다(PR #272 Codex P2). 다음 브리핑·주간 리뷰(토 09:00)가 10/22·10/17 수준인지는 사용자 판정.
- **확인 4 (#269 · fin 웹):** [알림 이력] 유형 필터에 **🤖 AI 실패** 가 보인다(행은 실패가 있어야 생긴다 · 성공률 카드는 그 행을 세지 않는다). TA 가이드가 예산으로 실패하면 관리자 채팅에 **💸 예산·사용량 초과** 알림이 첫 실패에 온다 — 오면 `cost=` 를 보고 한도(\$0.25 · `TA_GUIDE_BUDGET_USD`)를 다시 맞춘다.
- **확인 5 (#261 · 다음 화~토 06:15 뒤):** `pm2 logs pleiades-fin-bot --lines 3000 --nostream 2>&1 | grep '\[cron\] 벤치마크 적재'` 에 `완료: <n>개 (<티커>+…)` · `일부 실패` 없음. 토 09:00 주간 리뷰에 알파 줄(10/31 첫 확인).

## R-8 — 직전 태그로 제자리 되돌리기

C4 이후 언제든. A 에서 마이그레이션 0 이므로 DB 는 그대로다. **같은 셸**(C1 상태)에서:

```bash
P=v1.0.0
git -C "$D" checkout -q "$P" && git -C "$D" describe --tags --exact-match HEAD && git -C "$D" status --porcelain   # $P · 출력 없음
cd "$D"; SECONDS=0; bash deploy/deploy.sh "$APP" > /tmp/inplace-$APP-r8.log 2>&1; echo "rc=$? ${SECONDS}s"; tail -4 /tmp/inplace-$APP-r8.log
```

**기대값:** `rc=0` · `=== 완료: <app> · v1.0.0 ===` · 그 뒤 C5 확인. 노출 창이 한 번 더 생긴다.
**R-8 도 실패하면** 그 앱 전환 런북의 R-2(옛 서비스로 · `R2=yes` 먼저 · **T-8 전까지만**). 그 뒤 #247 임시 완화가 지워졌다면 다시 넣는다.

## 판정 양식

**이 양식만** 세션에 준다. 경로 · 계정 · DB 이름 · 도메인 · 값은 넣지 않는다. 앱마다 한 벌.

```text
APP <fin|fit>   A 마이그레이션 0 · mcp-config 불변 · deploy/ 변경 <없음|있음> · lock 변경 <없음|루트|앱>
B  직전 태그 · 깨끗 · dump 사본: 예/아니오
C1 셸 키 0 · platform 600 · 도는 6 same: 예/아니오
C2 v1.0.1 · 깨끗: 예/아니오
C4 plan rc <n> · 기본 실행 rc <n> · <초>s · 완료 안내: 예/아니오        (rc≠0 이면 이유 한 줄)
C5 프로브 오류 응답 <수>(<처음 HH:MM:SS>~<마지막 HH:MM:SS>) · 창 안 오류 줄 web <n> bot <n> mcp <n>
   3 online · mcp <코드> · 409 0 · 재기동 6 same: 예/아니오 · 웹: 예/아니오 · 현황|/today: 예/아니오
C6 (fit 뒤 한 번) 임시 완화 제거 · 남은 항목 <n> · fin AI 응답·비용 줄: 예/아니오 · fit AI 응답: 예/아니오 · TA 가이드 문구: 예/아니오/아직
   used 에 model 포함·고정 ID 만: 예/아니오 · 드리프트 fin <n> fit <n> · 웹 'AI 실패' 필터: 예/아니오 · 💸 알림: 없음/왔음(cost <$>)
   벤치마크 적재(06:15 뒤): 완료/일부 실패/아직 · 주간 리뷰 알파: 예/아니오/아직
R-8 했나: 아니오/예(<이유 한 줄>) · R-2 했나: 아니오/예
```
