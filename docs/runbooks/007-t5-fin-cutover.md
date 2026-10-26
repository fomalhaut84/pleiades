# T-5 fin 전환 (#215)

**누가:** 서버 단계는 사용자가 서비스 계정으로(Claude 서버 무접촉 · I-3 · Q81). `v1.0.0` 릴리즈(T-5a 앞부분)만 Claude 가 PR 로 준비한다.
**무엇:** 007 T-5a~T-5c — fin 을 옛 서비스(`~/myFinance` · pm2 `myfinance*`)에서 pleiades(`~/pleiades-fin` · pm2 `pleiades-fin-*`)로 옮긴다. 앱 순서 fin 먼저(Q76). fit 은 이 런북 범위 밖(T-9).
**결정(사용자 2026-10-21 · #215):** 알림은 **텔레그램 그대로**(플랫폼 설정 빈 파일 — Discord 는 T-10 — fit 전환 뒤 · 007 Q80) · 옛 `.env` 의 `FIRECRAWL_API_KEY` 는 **옮기지 않는다**(사용처 0) · 전환 창은 **준비되는 대로**(아래 크론 시각 회피) · 백업 **`/backup/pleiades-cutover`**.
**셸:** bash · zsh. **C 절은 처음부터 끝까지 같은 셸**에서.
**결과:** 원본 출력은 세션에 주지 않는다(T-2 정책). 맨 아래 [판정 양식](#판정-양식)만.

> **정정 (2026-10-21 · #222 · 1·2회차 서버 실행).** fin 전환 완료(2회차 중단 36 s · `measured-facts.md` *T-5 fin*). 실행에서 드러나 고친 것: **B** — `FIN_DB` 를 비운 채 붙이면 `${FIN_DB:?}` 에서 멈춰 백업이 **조용히 하나도 안 됐다** → 이름을 먼저 채우는 줄을 따로 두고 각 명령이 빈값이면 `!!` 를 내고 건너뛴다 · 백업 파일이 664 → 블록 전체를 `umask 077`(끝에서 원복) + `chmod 600` 확인 · **R-2** — 런북을 끝까지 붙이면 같이 실행된다 → `R2=yes` 를 지정해야만 돈다 · **C0** — 2회차 전환 뒤에야 껐다 → C2 앞에 확인 줄 · **재시도** 절 신설(표지는 `--activate` 가 소비한다).

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

**먼저 DB 이름을 채운다**(T-2 U5 에서 본 이름 · 공개 기록에는 적지 않는다):

```bash
FIN_DB='<fin DB 이름>'; echo "FIN_DB=${FIN_DB}"     # <…> 가 그대로면 다시
```

```bash
OLD_UMASK=$(umask); umask 077                      # 블록 전체 — 파일이 처음부터 600(PR #223 Codex P2)
B=/backup/pleiades-cutover/fin-$(date +%Y%m%d-%H%M); mkdir -p "$B" && echo "$B"
# 1) DB — 권한 오류면 이 줄 대신: sudo -u postgres pg_dump -Fc -d "$FIN_DB" > "$B/fin.dump"
case "$FIN_DB" in ''|'<'*) echo '!! FIN_DB 를 채우지 않았다 — DB 백업 안 함' ;; *) pg_dump -Fc -d "$FIN_DB" -f "$B/fin.dump" && pg_restore -l "$B/fin.dump" | grep -c 'TABLE DATA' ;; esac
# 2) 상태 디렉터리 스냅숏 (fin backups 는 없다 — T-2 U9)
tar -C ~/myFinance -czf "$B/fin-state.tgz" reports logs && tar -tzf "$B/fin-state.tgz" | wc -l
# 3) 옛 pm2 목록 사본
cp ~/.pm2/dump.pm2 "$B/dump.pm2"
chmod 600 "$B"/*                                   # 이미 600 이어야 한다 — 확인 겸
umask "$OLD_UMASK"                                 # 셸 umask 원복
# 4) G-a — R-2 가 다시 띄울 옛 빌드 산출물
ls -la ~/myFinance/.next/BUILD_ID ~/myFinance/dist/bot/standalone.cjs ~/myFinance/dist/mcp/server.cjs
ls -la "$B"
```

**기대값:** `!!` 줄 없음 · `TABLE DATA` 개수 > 0 · tar 항목 > 0 · 산출물 3 개 있음 · `$B` 에 파일 3 개(디렉터리 700 · 파일 600).
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

**C0 를 끄지 않았으면 여기서 멈춘다**(1회차·2회차 모두 C0 없이 들어갔다 — 그 사이 서비스 Release 가 생기면 옛 배포가 같은 포트로 옛 fin 을 띄운다).

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

**종료 판정 시점 (사용자 2026-10-22 · #228):** **2026-10-26(월) 07:00 KRX 동기화(f4) 뒤.** 장주기 예외 = 월간 n6·n7·n8(다음 11-01) · 분기 n2·n3(2027-01). 그 뒤 fit 전환(T-9).

**크론 체크리스트** — 크론 정본은 `measured-facts.md` *2026-10-20 — 크론 전수(M1)* §2(시각 KST). 알림 크론은 **받았는지**로, 알림 없는 크론은 **로그**로 본다.

| 크론 | 시각 | 확인 | 비고 |
|---|---|---|---|
| f1 시세 | 10분 · 장외 매시 | 로그 `[cron] Price refresh failed` 0 · 웹 시세 갱신 | 가격·TA·전략 알림(A15~A17)은 조건이 맞을 때만 |
| f2 스냅샷 | 월~토 06:05 | 로그 `[cron] 스냅샷 실패` 0 · 웹 성과 화면 최신 날짜 | 성공 로그가 없다 |
| f3 어닝 | 매일 06:00 | 로그 `[cron] 어닝 스캔 완료` | |
| f4 KRX | **월 07:00** | 로그 `[cron] KRX 종목 동기화 완료` | 마지막 관찰 대상 |
| f5 반복거래 | 매일 09:05 | 로그 `[cron] 반복 거래 … 완료`(생성 0 이면 로그 없음) · 실패 0 | 생성분이 있으면 Whooing 반영 |
| f6 베스팅 | 매일 00:10 | 실패 0(전환 0 이면 로그 없음) | |
| n1 일일 요약 | 설정 시각(기본 08:00) | 수신 | |
| n4 RSU D-7/D-1 · n5 D-day 키보드 | 09:00 · 15:35 | 해당 RSU 가 있을 때만 수신 | 키보드는 누르지 않는다(실제 확정) |
| n8 월간 리포트 점검 | 매일 09:30 | 설정일(기본 1일)에만 발송 | 장주기 예외 |
| n9 한국 브리핑 · n11 한국 클로징 | 평일 08:30 · 15:40 | 수신 | |
| n10 미국 브리핑 · n12 미국 클로징 | 평일 23:00 · 화~토 07:15 | 수신 | |
| n13 주간 리뷰 | **토 09:00** | 수신 | |
| n2 · n3 · n6 · n7 | 분기·월 1일 등 | — | **장주기 예외** |

```bash
L=$(pm2 logs pleiades-fin-bot --lines 5000 --nostream 2>&1)
printf '%s\n' "$L" | grep -E '\[cron' | grep -E '완료|전환' | tail -20      # f3 · f4 · f5 · f6 성공 줄(시각 포함)
printf '%s\n' "$L" | grep -E '\[(cron|notification)' | grep -cE '실패|타임아웃|refresh failed'   # 0 이 정상 — 맨 'failed' 는 어닝 요약 'failed=0' 까지 센다(PR #229 Codex P2)
printf '%s\n' "$L" | grep -oE '어닝 스캔 완료: .*failed=[0-9]+' | tail -3                       # 어닝 요약의 failed=N 은 따로 본다(0 이 정상)
pm2 ls | grep pleiades-fin                                                  # 3 online · 재시작 횟수(↺)가 전환 직후와 같은가
```

**T-6 판정 양식** — 판정에 필요한 것만 세션에 준다(로그 원문 · 경로 · 값은 넣지 않는다).

```text
관찰 기간: 2026-10-21 17:46 ~ <YYYY-MM-DD HH:MM>
알림 수신(n1 n9 n10 n11 n12 n13): 예/아니오(<빠진 것>)
로그 성공 줄 f3 · f4 · f5 · f6: <있음/없음(0건이라 정상)> 각각
실패·타임아웃 줄 수: <n>     pleiades-fin 3 online · 재시작 증가 없음: 예/아니오
RSU n4·n5 해당 있었나: 아니오/예(수신 예/아니오)
이상: 없음/<한 줄>   →  T-6 종료: 예/아니오
```

**중간 기록 (2026-10-22 11:18 · 사용자):** 리포트 알림이 정상으로 온다(관찰 약 17.5시간 · 알림 크론 포괄 보고 — 크론별 판정·로그 확인은 종료 판정 때). 아직 돌지 않은 것: n5·n11(10-22 오후) · n13(10-24 토) · f4(10-26 월).

**중간 기록 — 서버 확인 (2026-10-22 오전 · 사용자 · 판정만):** `pleiades-fin` 3 online · 재시작 0 · 업타임 17 h. 로그(옛 `myfinance-bot` 03-31~10-21 ↔ 새 17 h 대조):
- 어닝 스캔 `ok=9 failed=5` — 옛 서비스도 매일 같은 값 → **서비스 유래 · 정상**(Q57).
- 텔레그램 `전송 재시도` 3줄(옛 2줄) · `Failed to fetch AAPL` 2줄(옛 19줄) — 전부 다음 시도·다음 틱에서 회복 · 사용자 수신 정상. **R-2 사유 아님 · 빈도는 옛 서비스보다 높다 → #232** 에서 T-6 동안 일별로 본다. **최종 실패(`4/4`) · 알림 누락이 나오면 바로 판단한다.**

**종료 판정 (2026-10-26 · 사용자 · #265): T-6 종료 — 예.** 3 online · 재시작 0 · f3 매일 · f4 10-26 07:00 · f5 10-22 생성 4 · f6 전환 0 · 실패·타임아웃 줄 0 · 알림 n1 n9 n10 n11 n12 n13 전부 수신. #232 는 10-23 뒤 0 — 전환 첫날만의 현상. 판정 표는 `measured-facts.md` *2026-10-26 — T-6 종료 판정*. 장주기 예외는 해당 시점에 따로.

---

## R-2 — 옛 fin 으로 되돌리기

C4 이후 언제든. 마이그레이션 0 이라 DB 는 그대로 쓴다. **새 체크아웃을 지우지 않는다** — 상태 실체가 거기 있다(P-2′).
**`R2=yes` 를 먼저 지정해야 돈다** — 런북을 끝까지 붙이면 이 블록까지 실행된다(2026-10-21 1회차는 의도된 시험이었다). 1회차 실측으로 동작이 확인된 절차다(`measured-facts.md` *T-5 fin*).

되돌리기를 정말 할 때만 **먼저 따로** `R2=yes` 를 친 뒤 아래 블록을 붙인다(블록 안에 두면 통째로 붙일 때 가드가 무의미하다).

```bash
if [ "${R2:-}" = yes ]; then
date '+%H:%M:%S R-2 시작'
pm2 stop pleiades-fin-bot pleiades-fin-web pleiades-fin-mcp; pm2 delete pleiades-fin-bot pleiades-fin-web pleiades-fin-mcp
N=~/pleiades-fin/apps/finance
for p in reports logs; do
  [ -L ~/myFinance/$p ] && rm ~/myFinance/$p && mv -T "$N/$p" ~/myFinance/$p   # 링크 제거(끝 / 없음) → 실체를 옛 자리로
done
ls -ld ~/myFinance/reports ~/myFinance/logs                                    # 링크 아님(d)
cd ~/myFinance && pm2 start ecosystem.config.js && pm2 save --force
pm2 ls | grep myfinance                                                        # 3 online
unset R2
else echo 'R-2 는 R2=yes 를 먼저 지정해야 돈다 — 아무것도 하지 않았다'; fi
```

그 뒤 C0 에서 끈 서비스 배포 workflow 를 다시 켠다(필요할 때만). 원인은 판정 양식에 적어 세션에 준다.

## 재시도 — C 를 다시 할 때 (R-2 뒤 · C3~C5 중단 뒤)

- **C1** 의 새 `.env` 는 그대로 쓸 수 있다 — 셸 env 비우기 · `PLEIADES_ENV_FILE` export · `stat`/`grep` 확인만 다시.
- **C2·C3 기본 실행부터 다시** — 준비 표지는 `--activate` 가 소비한다(없으면 `--activate` 가 거부). 옛 fin 이 다시 돌고 있으면 또 `rc=3` 으로 멈춘다.
- **C4′** — R-2 가 상태를 옛 자리로 되돌렸으면 새 체크아웃에 `reports`·`logs` 가 없어야 한다(`ls -d … | grep -vc 'No such file'` = 0) · pre-flight 가 만든 `logs` 는 루프가 백업 디렉터리로 비켜 둔다.
- **C7** 은 한 번 설정하면 남는다 — `systemctl is-enabled` 확인만.
- **B** 는 시도마다 새 디렉터리로 다시(옛 fin 이 그 사이 썼을 수 있다).

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
R-2 했나: 아니오/예(<이유 한 줄>)   C0 를 C2 전에 껐나: 예/아니오
```
