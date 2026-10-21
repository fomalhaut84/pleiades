# T-5 fin 전환 (#215)

**누가:** 서버 단계는 사용자가 서비스 계정으로(Claude 서버 무접촉 · I-3 · Q81). `v1.0.0` 릴리즈(T-5a 앞부분)만 Claude 가 PR 로 준비한다.
**무엇:** 007 T-5a~T-5c — fin 을 옛 서비스(`~/myFinance` · pm2 `myfinance*`)에서 pleiades(`~/pleiades-fin` · pm2 `pleiades-fin-*`)로 옮긴다. 앱 순서 fin 먼저(Q76). fit 은 이 런북 범위 밖(T-9).
**결정(사용자 2026-10-21 · #215):** 알림은 **텔레그램 그대로**(플랫폼 설정 빈 파일 — Discord 는 T-6 안정 뒤 별도) · 옛 `.env` 의 `FIRECRAWL_API_KEY` 는 **옮기지 않는다**(사용처 0) · 전환 창은 **준비되는 대로**(아래 크론 시각 회피) · 백업 **`/backup/pleiades-cutover`**.
**셸:** bash · zsh. **C 절은 처음부터 끝까지 같은 셸**에서.
**결과:** 원본 출력은 세션에 주지 않는다(T-2 정책). 맨 아래 [판정 양식](#판정-양식)만.

## 되돌리기 한눈에

| 어디까지 했나 | 되돌리기 | 등급 |
|---|---|---|
| A · B · C① ~ C③(exit 3) | 아무것도 안 해도 된다 — 옛 fin 은 계속 돌고 있다. 원하면 새 `.env` 삭제 | **즉시** |
| C④ 이후(옛 정지) | [R-2](#r-2--옛-fin-으로-되돌리기) — 새 정지 → 상태를 옛 디렉터리로 되돌림 → 옛 ecosystem 기동 | **중간**(중단 창 1회 더) |
| 마이그레이션이 적용됐다면 | 이 런북은 적용하지 않는다(`deploy.sh` 는 검사만 · 정정 5) — 적용됐다면 R-3(백업 복원 · 편도) | 편도 |

---

## A. T-5a — 최종 수용 · `v1.0.0` (전환 전날이라도 된다)

1. **(Claude)** fin 서비스 `dev` 가 마지막 수용(`3685b2ca138c`)과 같은지 확인 · 수용 0 · fin 은 마이그레이션 차이 0 이라 서비스 쪽 릴리즈 없음(007 ⑱ · T-2 U5 29 = 29).
2. **(Claude → 사용자 머지)** 버전 `1.0.0` PR → 릴리즈 PR `dev` → `main`(봇 게이트 · 머지 커밋) → 태그 `v1.0.0` · Release(서버 조치 칸: 이 런북).
3. **(사용자 · 서버)** 체크아웃을 `v1.0.0` 으로:

```bash
git -C ~/pleiades-fin fetch -q --no-tags origin tag v1.0.0 && git -C ~/pleiades-fin checkout -q v1.0.0
git -C ~/pleiades-fin describe --tags --exact-match HEAD; git -C ~/pleiades-fin status --porcelain   # v1.0.0 · 출력 없음
ls -d ~/pleiades-fin/apps/finance/{reports,logs} 2>&1 | grep -vc 'No such file' || true                 # 0 — 상태는 아직 옛 디렉터리에
```

> `v1.0.0` 뒤 C 가 중단되면 그 태그는 지우지 않는다 — 다음 시도는 다음 번호(`v1.0.1` …)로 새로 릴리즈해 다시 checkout 한다(007 T-5a).

## B. T-5b — 백업 (전환 직전 · 같은 날)

`/backup` 아래에 쓸 수 없으면 처음 한 번만 `sudo install -d -m 700 -o "$(id -un)" /backup/pleiades-cutover`.

```bash
B=/backup/pleiades-cutover/fin-$(date +%Y%m%d-%H%M); ( umask 077 && mkdir -p "$B" ) && echo "$B"
FIN_DB=''   # T-2 U5 에서 본 fin DB 이름을 채운다
: "${FIN_DB:?fin DB 이름}"
# 1) DB — 실패하면 다음 줄 대신: sudo -u postgres pg_dump -Fc -d "$FIN_DB" > "$B/fin.dump"
pg_dump -Fc -d "$FIN_DB" -f "$B/fin.dump" && pg_restore -l "$B/fin.dump" | grep -c 'TABLE DATA'
# 2) 상태 디렉터리 스냅숏 (fin backups 는 없다 — T-2 U9)
tar -C ~/myFinance -czf "$B/fin-state.tgz" reports logs && tar -tzf "$B/fin-state.tgz" | wc -l
# 3) 옛 pm2 목록 사본
cp ~/.pm2/dump.pm2 "$B/dump.pm2"
# 4) G-a — R-2 가 다시 띄울 옛 빌드 산출물
ls -la ~/myFinance/.next/BUILD_ID ~/myFinance/dist/bot/standalone.cjs ~/myFinance/dist/mcp/server.cjs
ls -la "$B"
```

**기대값:** `TABLE DATA` 개수 > 0 · tar 항목 > 0 · 산출물 3 개 있음 · `$B` 에 파일 3 개(700 디렉터리).
**산출물이 하나라도 없으면 C 에 들어가지 않는다** — R-2 가 성립하지 않는다(007 T-5b).

## C. T-5c — 전환

### C0. 진입 조건 — 서비스 fin 배포 경로 차단 (사용자 · GitHub)

옛 배포 workflow 가 살아 있으면 서비스 저장소 Release 하나로 옛 코드가 서버에 배포된다(T-2 U11). **전환 전에 끈다.**
GitHub 웹 → 서비스 fin 저장소 → Actions → 배포 workflow → `⋯` → **Disable workflow** (또는 사용자 PC 에서 `gh workflow disable deploy.yml -R <서비스 fin 저장소>`). 확인: 그 workflow 가 *Disabled* 로 보인다.

### C0′. 시각 — fin 크론을 피한다

C④~C⑤(중단 창 · 수 분) 동안 도는 크론은 그 회차를 놓친다. **피할 시각(KST · T-1c):** 00:10 · 06:00 · 06:05 · 07:00 · 07:15 · 08:00 · 08:30 · 09:00 · 09:05 · 09:30 · 10:00 · 15:35 · 15:40 · 23:00 각 ±5분, 그리고 **매시 :00**(n1 점검 · f1 장외 틱). 미국장 시간(평일 밤~새벽)에는 f1 이 10분마다 돈다. 가장 조용한 구간은 **00:15~05:55**(일요일이면 장도 모두 닫힘). 매월 1일 · 1·4·7·10월 7일은 피한다.

### C1. `.env` 실값 (옛 fin 은 계속 돈다)

```bash
# 셸 env 비우기 — 셸 값이 .env 를 가리고, pm2 는 셸 env 를 새 프로세스에 넘긴다(PR #219 Codex P2)
# 옛 fin .env 의 키(AUTH_* · NEXTAUTH_* · BASE_URL · FIRECRAWL_* — T-2 U7)까지 — 옛 .env 를 source 한 셸이면 옮기지 않기로 한 키도 새 프로세스에 들어간다
KEYS='DATABASE_URL|PORT|MCP_PORT|MCP_TRANSPORT|TELEGRAM_[A-Z_]*|DISCORD_[A-Z_]*|NOTIFY_[A-Z_]*|GARMIN_[A-Z_]*|OMRON_[A-Z_]*|MFDS_[A-Z_]*|WHOOING_[A-Z_]*|CLAUDE_BIN|NODE_ENV|PLEIADES_ENV_FILE|AUTH_[A-Z_]*|NEXTAUTH_[A-Z_]*|BASE_URL|FIRECRAWL_[A-Z_]*'
for k in $(env | grep -oE "^($KEYS)=" | tr -d =); do unset "$k"; done; env | grep -cE "^($KEYS)=" || true   # 0
# 플랫폼 설정 — 비어 있다(텔레그램 그대로 · 결정). T-4 에서 만든 파일
export PLEIADES_ENV_FILE="$HOME/pleiades-platform.env"; stat -c '%a %U' "$PLEIADES_ENV_FILE"; wc -c < "$PLEIADES_ENV_FILE"   # 600 <계정> · 0
# 앱 .env — 옛 .env 에서 FIRECRAWL_API_KEY 만 빼고 MCP_PORT 를 더한다(T-2 U7 · mcp-config.json 4210)
F=~/pleiades-fin/apps/finance/.env
( umask 077 && { grep -v '^FIRECRAWL_API_KEY=' ~/myFinance/.env; printf '\nMCP_PORT=4210\n'; } > "$F.new" && mv "$F.new" "$F" )
stat -c '%a %U' "$F"                                                      # 600 <계정>
grep -cE '^(PORT|MCP_PORT|DATABASE_URL|TELEGRAM_BOT_TOKEN)=' "$F"         # 4
grep -c '^FIRECRAWL_API_KEY=' "$F" || true                                # 0
grep -E '^(PORT|MCP_PORT)=' "$F"                                          # PORT=4100 · MCP_PORT=4210
```

### C2·C3. 기본 실행 — 빌드 · pre-flight · exit 3 (옛 fin 은 계속 돈다)

의존성 → 마이그레이션 검사(서비스 DB **읽기 전용** — `migrate status` + 이름 대조) → 빌드(fin `next build` prerender 가 서비스 DB 를 읽는다 · 읽기 전용) → MCP pre-flight(임시 포트 4299) → 점유 검사에서 옛 fin online 을 보고 **exit 3**.

```bash
cd ~/pleiades-fin
bash deploy/deploy.sh fin --dry-run > /tmp/t5-fin-plan.log 2>&1; echo "plan rc=$?"   # 0
SECONDS=0; bash deploy/deploy.sh fin > /tmp/t5-fin.log 2>&1; echo "rc=$? ${SECONDS}s"; tail -5 /tmp/t5-fin.log
echo "표지 $(cat .deploy-ready-fin 2>/dev/null | cut -c1-12) · HEAD $(git rev-parse --short=12 HEAD)"
```

**기대값:** `rc=3` · 로그 끝에 `=== 빌드·pre-flight 완료 · 활성화 전 정지 (exit 3) ===` · 표지 = HEAD.
**rc 가 3 이 아니면 여기서 멈춘다** — 옛 fin 은 그대로다. `deploy.sh: 중단 — …` 문장, 또는 `grep -n -B3 -A25 'Error' /tmp/t5-fin.log | sed "s#$HOME#~#g" | head -60` 발췌를 판정 양식에. 특히 `마이그레이션 이름 집합이 다르다` 면 C 를 중단(007 정정 5).

### C4. 옛 fin 정지 — 여기부터 중단 창

```bash
date '+%H:%M:%S 중단 시작'
pm2 stop myfinance-bot myfinance myfinance-mcp       # 봇 → 웹 → MCP
pm2 delete myfinance-bot myfinance myfinance-mcp
ss -ltn | grep -cE ':(4100|4210)\b' || true          # 0
```

### C4′. 상태 이동 (P-2′ · 007 Q73)

상태 실체를 새 체크아웃으로 옮기고 옛 경로에 링크를 남긴다. pre-flight 가 새 쪽에 `logs` 를 먼저 만들었을 수 있다 → **작업트리 밖(백업 디렉터리)으로** 비켜 둔다(안에 두면 `.gitignore` 밖이라 `git status` 가 dirty — PR #216 Codex P2).

```bash
N=~/pleiades-fin/apps/finance
for p in reports logs; do
  [ -e "$N/$p" ] && mv "$N/$p" "/backup/pleiades-cutover/fin-preflight-$p-$(date +%s)"
  mv -T ~/myFinance/$p "$N/$p" && ln -s "$N/$p" ~/myFinance/$p
done
ls -la ~/myFinance | grep -E ' (reports|logs) ->'      # 링크 2
ls -d "$N"/reports "$N"/logs && git -C ~/pleiades-fin status --porcelain   # 실제 디렉터리 2 · 출력 없음
```

### C5. 활성화

```bash
cd ~/pleiades-fin
SECONDS=0; bash deploy/deploy.sh fin --activate > /tmp/t5-fin-activate.log 2>&1; echo "rc=$? ${SECONDS}s"; tail -4 /tmp/t5-fin-activate.log
date '+%H:%M:%S 중단 끝'
```

**기대값:** `rc=0` · `=== 완료: fin · v1.0.0 ===` · `pleiades-fin-{mcp,web,bot}` online.
**rc 가 0 이 아니면** 마지막 `deploy.sh: 중단 — …` 문장을 보고 판단한다 — 고칠 수 없으면 [R-2](#r-2--옛-fin-으로-되돌리기). (활성화 도중 실패 뒤 다시 하려면 `--activate` 가 아니라 기본 실행 `bash deploy/deploy.sh fin` — 옛 fin 은 이미 내려가 있어 exit 3 없이 활성화까지 간다.)

### C6. 확인

```bash
pm2 ls | grep -E 'pleiades-fin|myfinance'                                    # pleiades-fin 3 online · myfinance 없음
curl -sS -o /dev/null -w 'web %{http_code}\n' http://127.0.0.1:4100/
curl -sS -o /dev/null -w 'mcp %{http_code}\n' http://127.0.0.1:4210/health   # 200
pm2 logs pleiades-fin-bot --lines 60 --nostream 2>&1 | grep -ciE '409|conflict' || true   # 0
```

그리고 사람이 확인한다:
- 브라우저로 **fin 웹 주소**(nginx · https) → 로그인 → 계좌 화면이 뜬다
- 텔레그램 허용 채팅에서 **`/브리핑`** → 응답(부작용 없는 유일한 직접 경로 · T-1c G-d)
- (쓰는 경우) AI 어드바이저에 질문 1건 → 응답(MCP 4210 경유)

### C7. 재부팅 자동 기동 (T-2 U3 · 사용자 결정 — 이번 전환에서 설정)

```bash
pm2 save --force                    # deploy.sh 가 이미 했다 — 다시 해도 무해
pm2 startup systemd                 # 출력 마지막의 'sudo env PATH=… pm2 startup systemd -u … --hp …' 줄을 그대로 실행
systemctl is-enabled "pm2-$(id -un)"   # enabled
```

`dump.pm2` 에 있는 **모든** pm2 앱(같은 서버의 다른 서비스 포함)이 재부팅 뒤 되살아난다 — 지금은 재부팅하면 아무것도 안 뜨는 상태다.

### C8. 관찰 (T-6 · Q78)

모든 fin 크론이 1회 이상 정상 실행될 때까지 본다(분기 PDF n3 같은 장주기는 예외로 명시). 이상하면 R-2.

```bash
pm2 ls | grep pleiades-fin; pm2 logs pleiades-fin-bot --lines 100 --nostream 2>&1 | grep -iE 'error|fail' | tail -20
```

---

## R-2 — 옛 fin 으로 되돌리기

C4 이후 언제든. 마이그레이션 0 이라 DB 는 그대로 쓴다. **새 체크아웃을 지우지 않는다** — 상태 실체가 거기 있다(P-2′).

```bash
date '+%H:%M:%S R-2 시작'
pm2 stop pleiades-fin-bot pleiades-fin-web pleiades-fin-mcp; pm2 delete pleiades-fin-bot pleiades-fin-web pleiades-fin-mcp
N=~/pleiades-fin/apps/finance
for p in reports logs; do
  [ -L ~/myFinance/$p ] && rm ~/myFinance/$p && mv -T "$N/$p" ~/myFinance/$p   # 링크 제거(끝 / 없음) → 실체를 옛 자리로
done
ls -ld ~/myFinance/reports ~/myFinance/logs                                    # 링크 아님(d)
cd ~/myFinance && pm2 start ecosystem.config.js && pm2 save --force
pm2 ls | grep myfinance                                                        # 3 online
```

그 뒤 C0 에서 끈 서비스 배포 workflow 를 다시 켠다(필요할 때만). 원인은 판정 양식에 적어 세션에 준다.

## 판정 양식

**이 양식만** 세션에 준다. 경로 · 계정 · DB 이름 · 도메인 · 값은 넣지 않는다.

```text
A  ~/pleiades-fin = v1.0.0 · 깨끗 · 상태 디렉터리 없음: 예/아니오
B  백업: TABLE DATA <수> · 상태 tar <항목 수> · dump 사본: 예/아니오 · G-a 산출물 3: 예/아니오
C0 서비스 fin 배포 workflow Disabled: 예/아니오
C1 셸 키 0 · platform 600·0 byte · 앱 .env 600 · 키 4 · FIRECRAWL 0 · PORT/MCP_PORT 4100/4210: 예/아니오
C3 기본 실행 rc <n> · <초>s · exit 3 안내: 예/아니오 · 표지 = HEAD: 예/아니오   (rc≠3 이면 이유)
C4 옛 정지 · 포트 4100·4210 비움: 예/아니오   중단 시작 <HH:MM:SS>
C4′ 링크 2 · 새 쪽 실제 디렉터리 2 · git 깨끗: 예/아니오   preflight 비켜 둔 디렉터리: 있음/없음
C5 --activate rc <n> · <초>s · 완료 안내: 예/아니오   중단 끝 <HH:MM:SS>
C6 pleiades-fin 3 online · myfinance 없음 · web <코드> · mcp <코드> · 409 0: 예/아니오
   웹 로그인·계좌: 예/아니오   /브리핑 응답: 예/아니오   어드바이저: 예/아니오/안 씀
C7 systemd pm2-<계정> enabled: 예/아니오
R-2 했나: 아니오/예(<이유 한 줄>)
```
