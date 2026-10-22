# T-9 fit 전환 (#230)

**누가:** 서버 단계는 사용자가 서비스 계정으로 한다(Claude 서버 무접촉 · I-3 · Q81). 태그 확인·릴리즈(A 앞부분)만 Claude 가 한다.
**무엇:** 007 T-9 — fit 을 옛 서비스(`~/myFitness` · pm2 `myfitness*`)에서 pleiades(`~/pleiades-fit` · pm2 `pleiades-fit-*`)로 옮긴다. 절차는 fin 런북 `007-t5-fin-cutover.md`(2회 실행 · 동작 확인)와 같고, **fit 고유**만 다르다: 상태 디렉터리 4 · 포트 4200/4301 · 크론이 웹과 봇 둘 다 · 옛 ecosystem 은 절대경로.
**언제:** **fin T-6 관찰 종료 판정 뒤**(2026-10-26 월 이후 · #228 · 007 T-9 "동시 관찰 회피").
**결정(앞 런북을 잇는다):** 알림은 **텔레그램 그대로**(플랫폼 설정 빈 파일 — Discord 는 T-10 · 007 Q80) · 백업 `/backup/pleiades-cutover` · 전환 창은 아래 크론 시각 회피.
**셸:** bash · zsh. **C 절은 처음부터 끝까지 같은 셸**에서.
**결과:** 원본 출력은 세션에 주지 않는다. 맨 아래 [판정 양식](#판정-양식)만.

## fin 과 다른 점 (한눈에)

| | fin (T-5) | fit (이 런북) |
|---|---|---|
| 옛 pm2 | `myfinance` · `-bot` · `-mcp` | `myfitness` · `-bot` · `-mcp` |
| 포트 web / MCP / pre-flight | 4100 / 4210 / 4299 | **4200 / 4301 / 4399** |
| 상태(P-2′) | `reports` · `logs` | **`.garmin-tokens` · `.omron-tokens` · `.runtime` · `logs`** |
| 옛 `.env` → 새 `.env` | `FIRECRAWL_API_KEY` 빼고 `MCP_PORT` 더함 | 템플릿 밖 키 0(T-2 U7) · **`PORT`·`MCP_PORT` 를 4200/4301 로 고정** |
| 크론 | 봇만(19) | **웹 1(Garmin 싱크) + 봇 5(리포트 · 자동조정)** |
| 마이그레이션(F-1) | 차이 0 · 서비스 릴리즈 생략 | 서비스 `v2.46.1` 이 이미 했다 — DB 42 = `apps/fitness` 42(아래 A) |
| `next build` | prerender 가 서비스 DB 를 읽는다(읽기 전용) | DB 를 읽지 않는다 |
| C6 직접 확인 명령 | `/브리핑` | **`/today`**(읽기 전용) |

## 되돌리기 한눈에

| 어디까지 했나 | 되돌리기 | 등급 |
|---|---|---|
| A · B · C1 ~ C3(exit 3) | 아무것도 안 해도 된다 — 옛 fit 은 계속 돌고 있다 | **즉시** |
| C4 이후(옛 정지) | [R-2](#r-2--옛-fit-으로-되돌리기) — 새 정지 → 상태를 옛 디렉터리로 되돌림 → 옛 ecosystem 기동 | **중간**(중단 창 1회 더) |
| 마이그레이션이 적용됐다면 | 이 런북은 적용하지 않는다(`deploy.sh` 는 검사만) — 적용됐다면 R-3(백업 복원 · 편도) | 편도 |

---

## A. T-5a(fit) — 최종 수용 · 태그 (전환 전날이라도 된다)

1. **(Claude)** 재측정 — 서비스 fit `dev` = 마지막 수용인가 · 서비스 `main`·`dev`·`apps/fitness` 의 `prisma/migrations` 트리가 같은가 · `v1.0.0` 이후 런타임 경로(`apps` · `packages` · `deploy` · 루트 `package*.json`)가 바뀌었나.
   - **2026-10-22 측정:** 서비스 `main` = `v2.46.1` · `dev` = `35a04d78e532`(= 수용 #195) · `main..dev` = 문서 1커밋 · 마이그레이션 트리 **세 곳 동일**(42 · T-2 U5 서버 DB 42) · `v1.0.0..dev` 런타임 차이 = 테스트 파일 1. → **그대로면 fit 도 `v1.0.0`**(새 릴리즈 없음).
   - 그 사이 런타임 변경이 생겼으면 버전 기준(`workflow.md` 릴리즈 절)대로 새 릴리즈를 내고 아래 `V` 를 그 번호로. **fin 체크아웃은 건드리지 않는다**(앱별 체크아웃 · fin 은 `v1.0.0` 그대로).
2. **(사용자 · 서버)** 체크아웃을 그 태그로(T-4 의 `v0.2.0` 에서 옮긴다):

```bash
V=v1.0.0       # A-1 의 결론과 다르면 바꾼다
git -C ~/pleiades-fit fetch -q --no-tags origin tag "$V" && git -C ~/pleiades-fit checkout -q "$V"
git -C ~/pleiades-fit describe --tags --exact-match HEAD; git -C ~/pleiades-fit status --porcelain   # $V · 출력 없음
ls -d ~/pleiades-fit/apps/fitness/{.garmin-tokens,.omron-tokens,.runtime,logs} 2>&1 | grep -vc 'No such file' || true   # 0 — 상태는 아직 옛 디렉터리에
```

## B. T-5b(fit) — 백업 (전환 직전 · 같은 날)

**먼저 DB 이름을 채운다**(T-2 U5 에서 본 이름 · 공개 기록에는 적지 않는다):

```bash
FIT_DB='<fit DB 이름>'; echo "FIT_DB=${FIT_DB}"     # <…> 가 그대로면 다시
```

```bash
O=~/myFitness
OLD_UMASK=$(umask); umask 077                      # 블록 전체 — 토큰이 들어 있다
B=/backup/pleiades-cutover/fit-$(date +%Y%m%d-%H%M); mkdir -p "$B" && echo "$B"
# 1) DB — 권한 오류면 이 줄 대신: sudo -u postgres pg_dump -Fc -d "$FIT_DB" > "$B/fit.dump"
case "$FIT_DB" in ''|'<'*) echo '!! FIT_DB 를 채우지 않았다 — DB 백업 안 함' ;; *) pg_dump -Fc -d "$FIT_DB" -f "$B/fit.dump" && pg_restore -l "$B/fit.dump" | grep -c 'TABLE DATA' ;; esac
# 2) 상태 디렉터리 4 스냅숏
tar -C "$O" -czf "$B/fit-state.tgz" .garmin-tokens .omron-tokens .runtime logs && tar -tzf "$B/fit-state.tgz" | wc -l
# 3) pm2 목록 사본(새 fin 포함)
cp ~/.pm2/dump.pm2 "$B/dump.pm2"
chmod 600 "$B"/*
umask "$OLD_UMASK"
# 4) G-a — R-2 가 다시 띄울 옛 빌드 산출물 4
ls -la "$O/.next/BUILD_ID" "$O/dist/bot/standalone.cjs" "$O/dist/mcp/server.cjs"; ls -d "$O/src/generated/prisma"
ls -la "$B"
```

**기대값:** `!!` 줄 없음 · `TABLE DATA` 개수 > 0 · tar 항목 > 0 · 산출물 4 있음 · `$B` 에 파일 3 개(디렉터리 700 · 파일 600).
**산출물이 하나라도 없으면 C 에 들어가지 않는다** — R-2 가 성립하지 않는다.

## C. T-5c(fit) — 전환

### C0. 진입 조건 — 서비스 fit 배포 경로 차단 (사용자 · GitHub · **C2 전에**)

GitHub 웹 → 서비스 fit 저장소 → Actions → 배포 workflow → `⋯` → **Disable workflow**. 확인: *Disabled*. (fin 은 2회차 전환 뒤에야 껐다 — 이번에는 먼저.)

### C0′. 시각 — fit 크론을 피한다

fit 크론(KST · `measured-facts.md` *크론 전수(M1)* §2): **웹** Garmin 싱크 06·09·12·15·18·21:00 · **봇** 자동조정 06:30 · 모닝 08:00 · 이브닝 23:00 · 주간 **월 07:00** · 스누즈 5분(놓쳐도 다음 틱이 따라잡는다). 각 ±5분은 피한다. 가장 조용한 구간은 **00:15~05:55**(fin 크론도 비어 있다 — C3 빌드가 같은 서버 CPU 를 쓴다). 월요일 새벽이면 07:00 전에 끝낸다.

### C1. `.env` 실값 (옛 fit 은 계속 돈다)

```bash
O=~/myFitness
# 옛 fit 의 cwd 가 $O 인가(T-2 U1 — ecosystem 하드코딩 경로) — R-2 가 이 경로로 되돌린다
pm2 jlist | node -e 'const path=require("path");let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=path.resolve(process.argv[1]);for(const p of JSON.parse(s.slice(s.search(/^\[(\{|\])/m))))if(/^myfitness/.test(p.name))console.log(p.name,path.resolve(p.pm2_env.pm_cwd)===o?"cwd=O":"cwd≠O")})' "$O"   # 3줄 모두 cwd=O
# 셸 env 비우기 — 셸 값이 .env 를 가리고, pm2 는 셸 env 를 새 프로세스에 넘긴다
KEYS='DATABASE_URL|PORT|MCP_PORT|MCP_TRANSPORT|MCP_HTTP_URL|MCP_LOG_[A-Z_]*|APP_BASE_URL|BASE_URL|TELEGRAM_[A-Z_]*|DISCORD_[A-Z_]*|NOTIFY_[A-Z_]*|GARMIN_[A-Z_]*|OMRON_[A-Z_]*|MFDS_[A-Z_]*|WHOOING_[A-Z_]*|[A-Z_]*_CRON|CLAUDE_BIN|NODE_ENV|PLEIADES_ENV_FILE|AUTH_[A-Z_]*|NEXTAUTH_[A-Z_]*|FIRECRAWL_[A-Z_]*'
for k in $(env | grep -oE "^($KEYS)=" | tr -d =); do unset "$k"; done; env | grep -cE "^($KEYS)=" || true   # 0
# 플랫폼 설정 — 비어 있다(fin 과 같은 파일)
export PLEIADES_ENV_FILE="$HOME/pleiades-platform.env"; stat -c '%a %U' "$PLEIADES_ENV_FILE"; wc -c < "$PLEIADES_ENV_FILE"   # 600 <계정> · 0
# 앱 .env — 옛 fit .env 그대로 + PORT·MCP_PORT 고정(옛 .env 에 MCP_PORT 없음 · T-2 U7). T-4 의 더미 .env 를 덮어쓴다
F=~/pleiades-fit/apps/fitness/.env
( umask 077 && { grep -vE '^(PORT|MCP_PORT)=' "$O/.env"; printf '\nPORT=4200\nMCP_PORT=4301\n'; } > "$F.new" && mv "$F.new" "$F" )
stat -c '%a %U' "$F"                                                                          # 600 <계정>
grep -cE '^(PORT|MCP_PORT|DATABASE_URL|TELEGRAM_BOT_TOKEN|TELEGRAM_ALLOWED_CHAT_IDS)=' "$F"   # 5
grep -cE '^[A-Z_]+=$' "$F" || true                                                            # 0 — 빈 값(KEY=)은 코드 기본값이 아니다(#178)
grep -E '^(PORT|MCP_PORT)=' "$F"                                                              # PORT=4200 · MCP_PORT=4301
grep -c '127\.0\.0\.1:1/' "$F" || true                                                        # 0 — T-4 더미 DB 가 남지 않았다
```

### C2·C3. 기본 실행 — 빌드 · pre-flight · exit 3 (옛 fit 은 계속 돈다)

**C0 를 끄지 않았으면 여기서 멈춘다.**

의존성 → 마이그레이션 검사(서비스 DB **읽기 전용** — `migrate status` + 이름 대조) → `prisma generate` → 빌드(`next build` 는 DB 불필요) → MCP pre-flight(임시 포트 4399) → 점유 검사에서 옛 fit online 을 보고 **exit 3**.

```bash
cd ~/pleiades-fit
bash deploy/deploy.sh fit --dry-run > /tmp/t9-fit-plan.log 2>&1; echo "plan rc=$?"   # 0
SECONDS=0; bash deploy/deploy.sh fit > /tmp/t9-fit.log 2>&1; echo "rc=$? ${SECONDS}s"; tail -5 /tmp/t9-fit.log
echo "표지 $(cat .deploy-ready-fit 2>/dev/null | cut -c1-12) · HEAD $(git rev-parse --short=12 HEAD)"
```

**기대값:** `rc=3` · 로그 끝에 `=== 빌드·pre-flight 완료 · 활성화 전 정지 (exit 3) ===` · 표지 = HEAD.
**rc 가 3 이 아니면 여기서 멈춘다** — 옛 fit 은 그대로다. `deploy.sh: 중단 — …` 문장, 또는 `grep -n -B3 -A25 'Error' /tmp/t9-fit.log | sed "s#$HOME#~#g" | head -60` 발췌를 판정 양식에. 특히 `마이그레이션 이름 집합이 다르다` 면 C 를 중단한다(서비스가 그 사이 릴리즈했다 — A 재측정부터).

### C4. 옛 fit 정지 — 여기부터 중단 창

```bash
date '+%H:%M:%S 중단 시작'
pm2 stop myfitness-bot myfitness myfitness-mcp       # 봇 → 웹 → MCP
pm2 delete myfitness-bot myfitness myfitness-mcp
ss -ltn | grep -cE ':(4200|4301)\b' || true          # 0
```

### C4′. 상태 이동 (P-2′ · 007 Q73 · #211)

상태 실체 4 개를 새 체크아웃으로 옮기고 옛 경로에 링크를 남긴다(fit Turbopack 은 루트 밖을 가리키는 링크를 거부한다 — 그래서 실체가 새 쪽에 있어야 한다). pre-flight 가 새 쪽에 만든 것이 있으면 **작업트리 밖(백업 디렉터리)으로** 비켜 둔다.

```bash
O=~/myFitness; N=~/pleiades-fit/apps/fitness
for p in .garmin-tokens .omron-tokens .runtime logs; do
  [ -e "$N/$p" ] && mv "$N/$p" "/backup/pleiades-cutover/fit-preflight$p-$(date +%s)"
  mv -T "$O/$p" "$N/$p" && ln -s "$N/$p" "$O/$p"
done
for p in .garmin-tokens .omron-tokens .runtime logs; do [ -L "$O/$p" ] && echo "링크 $p"; done | wc -l                      # 4
for p in .garmin-tokens .omron-tokens .runtime logs; do [ -d "$N/$p" ] && [ ! -L "$N/$p" ] && echo "실체 $p"; done | wc -l   # 4
git -C ~/pleiades-fit status --porcelain                                                                                    # 출력 없음
```

### C5. 활성화

```bash
cd ~/pleiades-fit
SECONDS=0; bash deploy/deploy.sh fit --activate > /tmp/t9-fit-activate.log 2>&1; echo "rc=$? ${SECONDS}s"; tail -4 /tmp/t9-fit-activate.log
date '+%H:%M:%S 중단 끝'
```

**기대값:** `rc=0` · `=== 완료: fit · <V> ===` · `pleiades-fit-{mcp,web,bot}` online.
**rc 가 0 이 아니면** 마지막 `deploy.sh: 중단 — …` 문장을 보고 판단한다 — 고칠 수 없으면 [R-2](#r-2--옛-fit-으로-되돌리기). (활성화 도중 실패 뒤 다시 하려면 기본 실행 `bash deploy/deploy.sh fit` — 옛 fit 이 이미 내려가 있어 exit 3 없이 활성화까지 간다.)

### C6. 확인

```bash
pm2 ls | grep -E 'pleiades-(fin|fit)|myfitness'                              # pleiades-fit 3 online · pleiades-fin 3 그대로 · myfitness 없음
curl -sS -o /dev/null -w 'web %{http_code}\n' http://127.0.0.1:4200/
curl -sS -o /dev/null -w 'mcp %{http_code}\n' http://127.0.0.1:4301/health   # 200
pm2 logs pleiades-fit-bot --lines 60 --nostream 2>&1 | grep -ciE '409|conflict' || true   # 0
pm2 save --force                                                               # deploy.sh 가 이미 했다 — 재부팅 자동 기동 목록에 새 fit(systemd 는 T-5 에서 설정됨)
systemctl is-enabled "pm2-$(id -un)"                                           # enabled
```

그리고 사람이 확인한다:
- 브라우저로 **fit 웹 주소**(nginx · https) → 오늘 화면이 뜬다
- 텔레그램 허용 채팅에서 **`/today`** → 응답(DB 읽기만 · 부작용 없음). `/sync`·`/report regenerate` 는 Garmin·Claude·DB 쓰기가 따르므로 확인용으로 쓰지 않는다
- (쓰는 경우) AI 질문 1건 → 응답(MCP 4301 경유 · `.runtime/mcp-config.json` 은 호출마다 다시 쓰인다)

### C8. 관찰 (T-9 의 T-6 · Q78)

모든 fit 크론이 1회 이상 정상 실행될 때까지 본다 — **주간 리포트(b3)가 월요일**이라 최소 한 번의 월요일을 지난다. 이상하면 R-2.

| 크론 | 시각 | 확인 |
|---|---|---|
| w1 Garmin(+OMRON) 싱크 · 웹 | 06·09·12·15·18·21:00 | 웹 오늘 화면에 새 활동·체중 · 웹 로그 실패 0 |
| b1 모닝 · b2 이브닝 | 08:00 · 23:00 | 수신 |
| b3 주간 | 월 07:00 | 수신 |
| b4 자동조정 | 06:30 | 조정이 필요할 때만 키보드 수신 — 확인용으로 누르지 않는다(누르면 실제 결정) |
| b5 스누즈 | 5분 | 따라잡는다 — 별도 확인 없음 |
| 관리자 알림(B8) | Garmin/OMRON 인증 실패 등 | 오면 그 자체가 이상 신호 |

```bash
pm2 ls | grep pleiades-fit
pm2 logs pleiades-fit-web --lines 2000 --nostream 2>&1 | grep -iE 'error|fail' | tail -20
pm2 logs pleiades-fit-bot --lines 2000 --nostream 2>&1 | grep -iE 'error|fail' | tail -20
```

---

## R-2 — 옛 fit 으로 되돌리기

C4 이후 언제든. 마이그레이션 0 이라 DB 는 그대로 쓴다. **새 체크아웃을 지우지 않는다** — 상태 실체가 거기 있다(P-2′). 관찰 중 새 fit 이 갱신한 Garmin·OMRON 토큰도 그대로 옛 쪽으로 돌아간다.
**`R2=yes` 를 먼저 따로 쳐야 돈다**(블록 안에 두면 통째로 붙일 때 가드가 무의미하다 · fin 1회차 교훈).

```bash
if [ "${R2:-}" = yes ]; then
date '+%H:%M:%S R-2 시작'
pm2 stop pleiades-fit-bot pleiades-fit-web pleiades-fit-mcp; pm2 delete pleiades-fit-bot pleiades-fit-web pleiades-fit-mcp
O=~/myFitness; N=~/pleiades-fit/apps/fitness
for p in .garmin-tokens .omron-tokens .runtime logs; do
  [ -L "$O/$p" ] && rm "$O/$p" && mv -T "$N/$p" "$O/$p"     # 링크 제거(끝 / 없음) → 실체를 옛 자리로 — 링크가 남으면 옛 디렉터리 재빌드 때 Turbopack 이 거부한다(#211)
done
for p in .garmin-tokens .omron-tokens .runtime logs; do [ -d "$O/$p" ] && [ ! -L "$O/$p" ] && echo "실체 $p"; done | wc -l   # 4
cd "$O" && pm2 start ecosystem.config.js && pm2 save --force
pm2 ls | grep myfitness                                                        # 3 online
unset R2
else echo 'R-2 는 R2=yes 를 먼저 지정해야 돈다 — 아무것도 하지 않았다'; fi
```

그 뒤 C0 에서 끈 서비스 fit 배포 workflow 를 다시 켠다(필요할 때만). 원인은 판정 양식에 적어 세션에 준다.

## 재시도 — C 를 다시 할 때 (R-2 뒤 · C3~C5 중단 뒤)

- **C1** 의 새 `.env` 는 그대로 쓸 수 있다 — 셸 env 비우기 · `PLEIADES_ENV_FILE` export · 확인 줄만 다시.
- **C2·C3 기본 실행부터 다시** — 준비 표지는 `--activate` 가 소비한다.
- **C4′** — R-2 가 상태를 옛 자리로 되돌렸으면 새 체크아웃에 상태 4 가 없어야 한다(A 의 마지막 줄 = 0) · pre-flight 가 만든 것은 루프가 비켜 둔다.
- **B** 는 시도마다 새 디렉터리로 다시.

## 판정 양식

**이 양식만** 세션에 준다. 경로 · 계정 · DB 이름 · 도메인 · 값은 넣지 않는다.

```text
A  ~/pleiades-fit = <V> · 깨끗 · 상태 디렉터리 없음: 예/아니오
B  백업: TABLE DATA <수> · 상태 tar <항목 수> · dump 사본: 예/아니오 · G-a 산출물 4: 예/아니오 · 파일 600: 예/아니오
C0 서비스 fit 배포 workflow Disabled(C2 전에): 예/아니오
C1 옛 fit cwd=O ×3: 예/아니오 · 셸 키 0 · platform 600·0 byte · 앱 .env 600 · 키 5 · 빈 값 0 · 더미 DB 0 · PORT/MCP_PORT 4200/4301: 예/아니오
C3 기본 실행 rc <n> · <초>s · exit 3 안내: 예/아니오 · 표지 = HEAD: 예/아니오   (rc≠3 이면 이유)
C4 옛 정지 · 포트 4200·4301 비움: 예/아니오   중단 시작 <HH:MM:SS>
C4′ 링크 4 · 새 쪽 실체 4 · git 깨끗: 예/아니오   preflight 비켜 둔 것: 있음(<이름>)/없음
C5 --activate rc <n> · <초>s · 완료 안내: 예/아니오   중단 끝 <HH:MM:SS>
C6 pleiades-fit 3 online · pleiades-fin 3 그대로 · myfitness 없음 · web <코드> · mcp <코드> · 409 0 · systemd enabled: 예/아니오
   웹 오늘 화면: 예/아니오   /today 응답: 예/아니오   AI: 예/아니오/안 씀
R-2 했나: 아니오/예(<이유 한 줄>)
```
