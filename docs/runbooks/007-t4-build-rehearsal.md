# T-4 서버 build-only 리허설 (#209)

**누가:** 사용자가 서버에서 서비스 계정으로 실행한다. Claude 세션은 서버에 닿지 않는다(`isolation.md` I-3 · 007 Q81).
**무엇:** 007 T-4 — 앱별 새 체크아웃(S-a)을 만들고 첫 릴리즈 `v0.2.0` 으로 **설치·빌드만** 해 본다. pm2 · 서비스 포트 바인딩 · 서비스 DB · 서비스 봇 · 외부 계정은 **건드리지 않는다**(실값 없음 — 정정 6).
**결정(사용자 2026-10-21 · #209):** 체크아웃 `~/pleiades-fin` · `~/pleiades-fit`(각각 모노레포 전체 clone — fin 은 `~/pleiades-fin/apps/finance`, fit 은 `~/pleiades-fit/apps/fitness` 에서 돈다) · 플랫폼 설정 `~/pleiades-platform.env`. 기존 `~/pleiades`(dev) 는 배포에 쓰지 않는다.
**결과:** 원본 출력은 저장소 밖 · 세션에도 주지 않는다(T-2 정책). 맨 아래 [판정 양식](#판정-양식)만 준다.
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

## 3. 상태 심링크 (P-2 · 007 Q73)

새 체크아웃이 옛 서비스 디렉터리의 상태를 같은 파일로 본다. fin `backups` 는 서버에 없어 건너뛴다(T-2 U9).

```bash
for p in reports logs; do ln -s ~/myFinance/$p ~/pleiades-fin/apps/finance/$p; done
for p in .garmin-tokens .omron-tokens .runtime logs; do ln -s ~/myFitness/$p ~/pleiades-fit/apps/fitness/$p; done
ls -la ~/pleiades-fin/apps/finance | grep -- '->' ; ls -la ~/pleiades-fit/apps/fitness | grep -- '->'
git -C ~/pleiades-fin status --porcelain; git -C ~/pleiades-fit status --porcelain   # 출력 없음 — 루트 .gitignore 가 링크를 무시한다(4-2 정정 1)
```

**기대값:** 링크 2 + 4 · 두 `status` 출력 없음.

## 4. 앱 `.env` — 포트와 더미 DB 만 (600)

포트는 전환 뒤 그대로 쓸 값이다(Q77 포트 유지 · nginx 무변경). fin `MCP_PORT` 는 `src/lib/ai/mcp-config.json` 의 4210 과 같아야 한다(`deploy.sh` 가 대조).

```bash
( umask 077 && printf '%s\n' 'PORT=4100' 'MCP_PORT=4210' 'DATABASE_URL="postgresql://t4:t4@127.0.0.1:1/t4?schema=public"' > ~/pleiades-fin/apps/finance/.env )
( umask 077 && printf '%s\n' 'PORT=4200' 'MCP_PORT=4301' 'DATABASE_URL="postgresql://t4:t4@127.0.0.1:1/t4?schema=public"' > ~/pleiades-fit/apps/fitness/.env )
stat -c '%a %U %n' ~/pleiades-fin/apps/finance/.env ~/pleiades-fit/apps/fitness/.env   # 600 <계정> ×2
```

## 5. build-only

```bash
cd ~/pleiades-fin && bash deploy/deploy.sh fin --build-only --dry-run && time bash deploy/deploy.sh fin --build-only 2>&1 | tee /tmp/t4-fin.log | tail -3
cd ~/pleiades-fit && bash deploy/deploy.sh fit --build-only --dry-run && time bash deploy/deploy.sh fit --build-only 2>&1 | tee /tmp/t4-fit.log | tail -3
```

**기대값:** 각각 마지막에 `=== 빌드까지 완료 (--build-only) ===` · `real` 시간.
fin 은 `build:mcp:staged` · `build:bot` 만 — `next build` 는 서비스 DB 를 읽는 prerender 때문에 건너뛴다(Q84 ①). fit 은 `prisma generate` · `build:staged`(`next build` 포함 · DB 불필요).
**멈추면:** 마지막 `deploy.sh: 중단 — …` 한 줄이 이유다(태그 · `.env` 권한 · 포트 · `PLEIADES_ENV_FILE` 절대경로). 그 문장을 판정 양식에 적는다(경로·값은 빼고).

## 6. fin `next build` — prerender 직전까지 컴파일 확인 (Q84 ①)

fin 웹의 컴파일·타입·번들 실패를 T-5c 전에 본다. **prerender 단계에서 실패하는 것이 정상**이다(더미 DB · 127.0.0.1:1 은 연결이 바로 거부된다).

```bash
cd ~/pleiades-fin/apps/finance && npx --no-install next build 2>&1 | tee /tmp/t4-fin-next.log | grep -nE 'Compiled|Linting|type|Collecting page data|Generating static pages|Error|ECONNREFUSED|P1001' | head -20
```

**판정:** `Compiled successfully`(또는 `✓ Compiled`) 가 나오고, 실패가 **페이지 데이터 수집·정적 생성 단계의 DB 연결 오류**(`P1001` · `ECONNREFUSED` · `Can't reach database server`)면 **통과**. 컴파일·타입·모듈 해석 오류면 **실패** — 그 오류의 첫 줄(파일 경로 없이)을 적는다.

## 7. 서비스 무영향 대조 · 크기

```bash
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s.slice(s.search(/^\[(\{|\])/m))))if(/^my(finance|fitness)/.test(p.name))console.log(p.name,p.pm2_env.status,"restarts="+p.pm2_env.restart_time)})' | diff /tmp/t4-before.txt - && echo "서비스 6: 상태·재시작 수 변화 없음"
pm2 jlist | grep -c '"name":"pleiades-' || true   # 0
du -sh ~/pleiades-fin ~/pleiades-fit; df -h "$HOME" | tail -1
rm -f /tmp/t4-before.txt   # 로그(/tmp/t4-*.log)는 판정 뒤 사용자가 지운다
```

## 정리

T-4 체크아웃은 **지우지 않는다** — T-5a 에서 `v1.0.0` 으로 옮겨 T-5c 에 쓴다(007 T-5a). 리허설을 버릴 때만:

```bash
rm -rf ~/pleiades-fin ~/pleiades-fit   # 끝에 / 를 붙이지 않는다 — 링크만 지우고 옛 서비스 상태는 남는다
rm -f ~/pleiades-platform.env
```

## 판정 양식

**이 양식만** 세션에 준다. 경로 · 계정 · 값은 넣지 않는다.

```text
1  platform.env 600: 예/아니오
2  체크아웃 fin/fit = v0.2.0 ae44d06af623: 예/아니오 ×2
3  심링크 fin 2 · fit 4: 예/아니오   git status 깨끗: 예/아니오 ×2
4  앱 .env 600: 예/아니오 ×2
5  fin build-only: 완료/중단(<이유 문장>)   시간: <분>
   fit build-only: 완료/중단(<이유 문장>)   시간: <분>
6  fin next build: 컴파일 통과 · prerender DB 오류(정상)/컴파일 실패(<첫 줄>)
7  서비스 6 상태·재시작 변화 없음: 예/아니오   pleiades-* 프로세스 0: 예/아니오
   체크아웃 크기 fin/fit: <GB>   디스크 여유: <GB>
```
