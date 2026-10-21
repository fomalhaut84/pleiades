# T-4 서버 build-only 리허설 (#209)

**누가:** 사용자가 서버에서 서비스 계정으로 실행한다. Claude 세션은 서버에 닿지 않는다(`isolation.md` I-3 · 007 Q81).
**무엇:** 007 T-4 — 앱별 새 체크아웃(S-a)을 만들고 첫 릴리즈 `v0.2.0` 으로 **설치·빌드만** 해 본다. pm2 · 서비스 포트 바인딩 · 서비스 DB · 서비스 봇 · 외부 계정은 **건드리지 않는다**(실값 없음 — 정정 6).
**결정(사용자 2026-10-21 · #209):** 체크아웃 `~/pleiades-fin` · `~/pleiades-fit`(각각 모노레포 전체 clone — fin 은 `~/pleiades-fin/apps/finance`, fit 은 `~/pleiades-fit/apps/fitness` 에서 돈다) · 플랫폼 설정 `~/pleiades-platform.env`. 기존 `~/pleiades`(dev) 는 배포에 쓰지 않는다.
**결과:** 원본 출력은 저장소 밖 · 세션에도 주지 않는다(T-2 정책). 맨 아래 [판정 양식](#판정-양식)만 준다.
**셸:** bash · zsh 둘 다(명령은 둘 다에서 돈다). **0 부터 7 까지 같은 셸**에서.

> **정정 (2026-10-21 · #211 · 1회차 서버 실행).** 1회차는 3단계에서 P-2 심링크(새 체크아웃 → 옛 디렉터리)를 걸었고 **fit build-only 가 Turbopack 오류로 실패**했다(`Symlink … .runtime/mcp-config.json … points out of the filesystem root` — fit 코드가 `.runtime`·`.garmin-tokens`·`.omron-tokens` 를 참조해 Turbopack 이 추적한다). 007 Q73 이 **P-2′(역방향 — 상태 실체는 새 체크아웃 · 옛 경로가 링크 · 이동은 T-5c ④ 뒤)** 로 바뀌어 **T-4 에는 심링크가 없다.** 함께 고친 것: 0-1 zsh 호환(인자 없는 `unset`) · 5단계 종료 코드가 `| tail` 에 가려지던 것 · 실패 로그 명령.
**되돌리기:** **즉시** — `rm -rf ~/pleiades-fin ~/pleiades-fit ~/pleiades-platform.env`(아래 [정리](#정리)의 주의를 지킨다). 옛 서비스 디렉터리·프로세스는 무접촉.

## 먼저 — 하지 않는 것

- `pm2` 명령 전부(이 리허설은 pm2 를 부르지 않는다) · `deploy.sh` 를 `--build-only` 없이 부르기
- 새 `.env` 에 봇 토큰 · 실사용 채팅 id · 서비스 DB 접속 · Garmin·OMRON·MFDS·Whooing 키 넣기 — **포트와 더미 DB 만**
- 더미 `DATABASE_URL` 을 `localhost:5432` 로 두기 — 서버의 서비스 Postgres 에 실제 접속을 시도해 인증 실패 로그를 남긴다(007 T-4 [A3] 정정 2). **아무것도 듣지 않는 포트(1)** 를 쓴다
- 심링크 경로에 **끝 `/` 를 붙여 `rm -rf`** 하기 — 링크를 따라가 옛 서비스의 `logs`·토큰을 지운다

## 0. 시작 전 기록 (서비스 무영향 대조용)

서비스 사용량이 적은 시간에 한다 — `npm ci` ×4 · fit `next build` 가 서비스와 같은 서버의 CPU·메모리를 쓴다(크론 빈 구간 00:10~06:00 · T-1c).

```bash
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s.slice(s.search(/^\[(\{|\])/m))))if(/^my(finance|fitness)/.test(p.name))console.log(p.name,p.pm2_env.status,"restarts="+p.pm2_env.restart_time)})' | tee /tmp/t4-before.txt
df -h "$HOME" | tail -1; free -h | sed -n 2p
```

## 0-1. 셸 env 비우기 (이 셸에서 끝까지 진행한다)

셸 env 는 `.env` 보다 우선한다 — dotenv 는 있는 값을 덮지 않고 `deploy/pleiades.config.cjs` 도 셸을 먼저 본다. 옛 서비스 `.env` 를 source 한 셸이면 더미 대신 **서비스 DB** 로 빌드한다(PR #210 Codex P2). 값은 내지 않고 개수만 본다.

```bash
KEYS='DATABASE_URL|PORT|MCP_PORT|MCP_TRANSPORT|TELEGRAM_[A-Z_]*|DISCORD_[A-Z_]*|NOTIFY_[A-Z_]*|GARMIN_[A-Z_]*|OMRON_[A-Z_]*|MFDS_[A-Z_]*|WHOOING_[A-Z_]*|CLAUDE_BIN|NODE_ENV|PLEIADES_ENV_FILE'
env | grep -cE "^($KEYS)=" || true      # 0 이 아니면 아래 unset
for k in $(env | grep -oE "^($KEYS)=" | tr -d =); do unset "$k"; done   # 없으면 아무것도 안 한다(zsh 의 인자 없는 unset 오류 회피)
env | grep -cE "^($KEYS)=" || true      # 0
```

## 1. 플랫폼 설정 파일 (빈 파일 · 600)

T-4 는 플랫폼 키(Discord · `NOTIFY_*`)를 비운다(정정 6). 파일만 만든다.

```bash
( umask 077 && : > ~/pleiades-platform.env ) && stat -c '%a %U %n' ~/pleiades-platform.env   # 600 <계정>
export PLEIADES_ENV_FILE="$HOME/pleiades-platform.env"   # 절대경로여야 한다(deploy.sh · #198)
```

## 2. 체크아웃 두 개 (S-a)

```bash
for app in fin fit; do
  git clone -q --no-tags https://github.com/fomalhaut84/pleiades.git ~/pleiades-$app
  git -C ~/pleiades-$app fetch -q --no-tags origin tag v0.2.0
  git -C ~/pleiades-$app checkout -q v0.2.0
  echo "$app: $(git -C ~/pleiades-$app describe --tags --exact-match HEAD) $(git -C ~/pleiades-$app rev-parse --short=12 HEAD)"
done
```

**기대값:** 두 줄 모두 `v0.2.0 ae44d06af623`.

## 3. 상태 디렉터리 없음 확인 (P-2′ · 007 Q73 정정)

상태(fin `reports`·`logs` · fit `.garmin-tokens`·`.omron-tokens`·`.runtime`·`logs`)는 **T-5c ④′ 에서 옛 디렉터리 → 새 체크아웃으로 옮긴다**. T-4 에서는 걸지도 옮기지도 않는다 — 새 체크아웃에 그 경로가 없어야 한다.

```bash
ls -d ~/pleiades-fin/apps/finance/{reports,logs} ~/pleiades-fit/apps/fitness/{.garmin-tokens,.omron-tokens,.runtime,logs} 2>&1 | grep -vc 'No such file' || true   # 0
git -C ~/pleiades-fin status --porcelain; git -C ~/pleiades-fit status --porcelain   # 출력 없음
```

## 4. 앱 `.env` — 포트와 더미 DB 만 (600)

포트는 전환 뒤 그대로 쓸 값이다(Q77 포트 유지 · nginx 무변경). fin `MCP_PORT` 는 `src/lib/ai/mcp-config.json` 의 4210 과 같아야 한다(`deploy.sh` 가 대조).

```bash
( umask 077 && printf '%s\n' 'PORT=4100' 'MCP_PORT=4210' 'DATABASE_URL="postgresql://t4:t4@127.0.0.1:1/t4?schema=public"' > ~/pleiades-fin/apps/finance/.env )
( umask 077 && printf '%s\n' 'PORT=4200' 'MCP_PORT=4301' 'DATABASE_URL="postgresql://t4:t4@127.0.0.1:1/t4?schema=public"' > ~/pleiades-fit/apps/fitness/.env )
stat -c '%a %U %n' ~/pleiades-fin/apps/finance/.env ~/pleiades-fit/apps/fitness/.env   # 600 <계정> ×2
```

## 5. build-only

```bash
# env -u — 0-1 을 건너뛰었어도 셸 값이 .env 를 가리지 않게 한 번 더
# 파이프 없이 로그로 받는다 — `| tail` 은 실패 종료 코드를 가린다(1회차 fit 실패가 그렇게 묻혔다)
for app in fin fit; do
  cd ~/pleiades-$app || break
  env -u DATABASE_URL -u PORT -u MCP_PORT bash deploy/deploy.sh $app --build-only --dry-run > /tmp/t4-$app-plan.log 2>&1 || { echo "$app dry-run rc=$?"; tail -3 /tmp/t4-$app-plan.log; break; }
  SECONDS=0
  env -u DATABASE_URL -u PORT -u MCP_PORT bash deploy/deploy.sh $app --build-only > /tmp/t4-$app.log 2>&1
  echo "$app rc=$? ${SECONDS}s"; tail -2 /tmp/t4-$app.log
done
```

**기대값:** `fin rc=0 <초>s` · `fit rc=0 <초>s` · 각 로그 끝 근처에 `=== 빌드까지 완료 (--build-only) ===`(fin 은 그 뒤 `smoke:bot OK` 한 줄).
fin 은 `build:mcp:staged` · `build:bot` 만 — `next build` 는 서비스 DB 를 읽는 prerender 때문에 건너뛴다(Q84 ①). fit 은 `prisma generate` · `build:staged`(`next build` 포함 · DB 불필요).
**rc 가 0 이 아니면:** `deploy.sh: 중단 — …` 한 줄이면 그것이 이유다(태그 · `.env` 권한 · 포트 · `PLEIADES_ENV_FILE` 절대경로). 빌드 도구 오류면 아래로 핵심만 뽑아 판정 양식에 붙인다(홈 경로는 `~` 로 바뀐다):

```bash
grep -n -B3 -A25 'Error' /tmp/t4-<app>.log | sed "s#$HOME#~#g" | head -60
```

## 6. fin `next build` — prerender 직전까지 컴파일 확인 (Q84 ①)

fin 웹의 컴파일·타입·번들 실패를 T-5c 전에 본다. **prerender 단계에서 실패하는 것이 정상**이다(더미 DB · 127.0.0.1:1 은 연결이 바로 거부된다).

```bash
cd ~/pleiades-fin/apps/finance && env -u DATABASE_URL npx --no-install next build 2>&1 | tee /tmp/t4-fin-next.log | grep -nE 'Compiled|Linting|type|Collecting page data|Generating static pages|Error|ECONNREFUSED|P1001' | head -20
```

**판정:** prerender 가 **성공하면 이상이다** — 더미 DB 가 아닌 곳에 붙었다는 뜻이므로 멈추고 0-1 을 다시 본다. `Compiled successfully`(또는 `✓ Compiled`) 가 나오고, 실패가 **페이지 데이터 수집·정적 생성 단계의 DB 연결 오류**(`P1001` · `ECONNREFUSED` · `Can't reach database server`)면 **통과**. 컴파일·타입·모듈 해석 오류면 **실패** — 그 오류의 첫 줄(파일 경로 없이)을 적는다.

## 7. 서비스 무영향 대조 · 크기

```bash
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s.slice(s.search(/^\[(\{|\])/m))))if(/^my(finance|fitness)/.test(p.name))console.log(p.name,p.pm2_env.status,"restarts="+p.pm2_env.restart_time)})' | diff /tmp/t4-before.txt - && echo "서비스 6: 상태·재시작 수 변화 없음"
pm2 jlist | grep -c '"name":"pleiades-' || true   # 0
du -sh ~/pleiades-fin ~/pleiades-fit; df -h "$HOME" | tail -1
rm -f /tmp/t4-before.txt   # 로그(/tmp/t4-*.log)는 판정 뒤 사용자가 지운다
```

## 정리

T-4 체크아웃은 **지우지 않는다** — T-5a 에서 `v1.0.0` 으로 옮겨 T-5c 에 쓴다(007 T-5a). **T-5c ④′ 뒤에는 새 체크아웃이 상태의 실체라 지우면 상태가 사라진다**(P-2′ — 그때는 먼저 상태를 옛 디렉터리로 되돌린다 · 007 R-2). 리허설을 버릴 때만(T-4 시점):

```bash
rm -rf ~/pleiades-fin ~/pleiades-fit   # T-4 에는 상태가 없어 안전하다
rm -f ~/pleiades-platform.env
```

## 판정 양식

**이 양식만** 세션에 준다. 경로 · 계정 · 값은 넣지 않는다.

```text
0  셸 관련 키 unset 뒤 0: 예/아니오
1  platform.env 600: 예/아니오
2  체크아웃 fin/fit = v0.2.0 ae44d06af623: 예/아니오 ×2
3  새 체크아웃에 상태 디렉터리 없음: 예/아니오   git status 깨끗: 예/아니오 ×2
4  앱 .env 600: 예/아니오 ×2
5  fin build-only: rc <n> · <초>s   (rc≠0 이면 이유 문장 또는 grep 발췌)
   fit build-only: rc <n> · <초>s   (같음)
6  fin next build: 컴파일 통과 · prerender DB 오류(정상)/컴파일 실패(<첫 줄>)
7  서비스 6 상태·재시작 변화 없음: 예/아니오   pleiades-* 프로세스 0: 예/아니오
   체크아웃 크기 fin/fit: <GB>   디스크 여유: <GB>
```
