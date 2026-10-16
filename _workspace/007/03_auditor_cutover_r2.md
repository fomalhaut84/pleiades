# 007 전환 설계 초안 2회차 재감사 — reversibility-auditor (#163 · 2026-10-16)

**대상:** `_workspace/007/02_writer_cutover.md` 2회차(§9-1 정정 이력). 1회차 감사 `03_auditor_cutover.md` 는 그대로 둔다.
**격리:** 1회차와 같다 — 서버·pm2·서비스 DB 0 · `repos/*`·원본 git 0 · `.env` 열람 0. 실험은 스크래치 빈 저장소
`/private/tmp/claude-501/-Users-sagan-workspace-pleiades/3b6ddfbd-153c-4782-b595-fc80620ec29d/scratchpad/audit007/symtest2` 에서만. 로컬 빌드 산출물(`apps/finance/.next/prerender-manifest.json` · M-2 판)은 읽기만.

**결론: 1회차 정정 8 중 7 반영 확인 · 1 불충분(정정 8 잔여 1곳). 새 정정 5(위 1 포함) · 미확인 2. 초안은 다시 초안 — 단 전부 문장·조건 수준이라 3회차는 국소 개정으로 충분하다.** 핵심 설계(T-5c 재배열 · 루트 `.gitignore` · R-8 신설)는 실측으로 지지된다.

---

## 1. 1회차 정정 반영

| # | 판정 | 근거 |
|---|---|---|
| 정정 1 (심링크) | **확인** — 그리고 보강안을 실측으로 확인했다(아래 2-B) | §4-2 정정 1 · §4-1 신설 행 · T-1 |
| 정정 2 (⑰ 근거) | **확인** | ⑰ · §4-1 bootstrap 행 조건 (i)(ii) · Q83. 경미: §4-1 표 "현 상태" 칸이 여전히 *"workflow 에 있음"* — deploy.sh(`:21-35`)에도 있다(정정 미산입) |
| 정정 3 (R-8) | **확인** — 단 사다리에 새 결함(새 정정 2) | §7 R-8 · :291 한정 |
| 정정 4 (배포 경로 차단) | **확인** | §4-6 · T-5c 진입 조건 · Q82 |
| 정정 5 (`migrate status`) | **확인**(설계) · 종료 코드 거동은 미확인(아래 미확인 M-a) | §4-3 · T-5c ② |
| 정정 6 (T-4 실값) | **확인** — 단 §6 문안 1곳(새 정정 5) | T-4 · T-5c ① · §6 I-4/5/7/8 행 |
| 정정 7 (T-8 crontab) | **확인** | T-8 진입 조건 · U6·U12 |
| 정정 8 (fit 크론 웹+봇) | **불충분**(새 정정 1) | ⑪·M1·4-4 크론 행·T-9·Q78 은 고쳤으나 **§4-4 "정지·기동 순서" 근거 칸(:175) 에 *"웹은 fit 크론 담당(⑪)"* 이 남아 있다** |

## 2. 작성자가 지목한 새 주장

### 2-A. T-5c 재배열 ①~③ "즉시" · 옛 프로세스와 함께 서비스 DB 읽기

| 주장 | 판정 | 실제 |
|---|---|---|
| ①~③ 에서 멈추면 **즉시**(옛 프로세스 무접촉 · `.env` 삭제) | **확인** | ①~③ 은 전부 **새 체크아웃 안**의 파일·`node_modules`·`.next`·`dist` 만 만든다. 옛 디렉터리·옛 pm2 항목·포트에 닿는 단계가 없다(④ 이전). 배포 경로 차단이 진입 조건이므로 그 사이 옛 디렉터리가 바뀔 경로도 없다 |
| ③ fin build 가 옛 프로세스와 함께 서비스 DB 를 읽어도 무해 — 쓰기 여부 | **확인(읽기 전용)** | 로컬 M-2 빌드의 `prerender-manifest.json` routes = `/_not-found` `/auth/signin` `/deposits/new` `/dividends/new` `/favicon.ico` `/offline` `/trades/new`. DB 를 부르는 것은 `deposits/new`·`dividends/new`·`trades/new` 의 `prisma.account.findMany`(각 `page.tsx:7`) + `app/layout.tsx:39` `account.findMany` — **전부 읽기**, 해당 파일에 `create/update/upsert/delete/executeRaw` 0. 부수: 이 세 페이지는 **빌드 시점 계좌 목록이 고정**된다 — 서비스 현행 빌드와 같은 거동이라 새 위험은 아니다 |
| 서비스 영향 칸 *"서비스 DB 읽기(③)"* | **보강(정정 미산입)** | ③ 은 `npm ci`×2 + `next build` 를 **서비스가 도는 같은 서버**에서 한다 — CPU·메모리 부하를 T-4 와 같이 적는다(현 서비스 배포도 같은 거동이라 새 등급은 아니다). 또 DB 첫 접속은 ③ 이 아니라 **② `migrate status`** 다(새 정정 5) |

### 2-B. 루트 `.gitignore` 의 끝 `/` 없는 경로 — 스크래치 실측

| 주장 | 판정 | 실측 |
|---|---|---|
| 심링크도 무시 대상이 되어 트리가 dirty 로 보이지 않고 `-x` 없는 `clean -fd` 에도 남는다 | **확인** | 앱 `.gitignore` = 1회차와 같은 끝 `/` 패턴 · 루트 `.gitignore` = `apps/finance/reports` · `apps/finance/logs` · `apps/fitness/.garmin-tokens`. 결과: `git status --porcelain` **빈 출력** · `--ignored` 에 `!!` 3건 · `check-ignore -v` 가 **루트 `.gitignore:1~3`** 을 가리킴 · `checkout -f t1` + `clean -fd` 뒤 **심링크 3 생존** · `add -A` 뒤 staged **0**. **`clean -fdx` 는 링크 3을 지운다**(대상 데이터 `a.pdf` 는 남음) |
| 4-1 신설 행의 금지 목록 | **보강(정정 미산입)** | 루트 `.gitignore` 를 넣으면 위험 명령은 `clean -d` 가 아니라 **`clean -x`/`-X`** 다. 금지 목록에 `-x` 를 더한다 |

### 2-C. R-8 등급(중간) · "실패 시 R-2·R-7 로 내려간다"

| 주장 | 판정 | 실제 |
|---|---|---|
| R-8 = 중간 | **확인(조건부)** | 직전 태그 checkout + 루트·앱 `npm ci` + 제자리 빌드 + 재기동. 제자리라 **실패하면 체크아웃이 반쯤 바뀐 상태로 남고**, 그동안 도는 새 프로세스가 autorestart 되면 깨진 트리에서 뜬다 — 현 서비스 deploy.sh 와 같은 성격(그쪽은 MCP dist 백업·staged 로 일부 막는다). 등급은 유지하되 "실패 시 현재 프로세스도 흔들린다"를 적는다 |
| 사다리: T-8 전 → R-2 | **확인** | 옛 디렉터리·Q74 연장(관찰 끝까지 스키마 무변경)이 살아 있는 동안 R-2 전제는 유지된다 |
| 사다리: T-8 후 → R-7(높음) | **정정**(새 정정 2) | **Q74 의 스키마 무변경 연장은 관찰 종료까지다**(§4-3 · Q74). T-7 이후 pleiades 가 `apps/*` 에 마이그레이션을 더하는 순간 **R-7(서비스 태그 코드 재구축)은 옛 코드를 새 스키마 위에 올린다 → 높음이 아니라 편도(백업 복원 = 데이터 손실)**. 같은 이유로 **R-8 도 마이그레이션을 실은 릴리즈를 되돌릴 때는 편도**다(`migrate deploy` 는 forward-only · R-8 행의 *"Q74 로 대상 0 이어야 한다"* 는 T-8 이후 성립하지 않는다). R-7·R-8 에 조건 *"전환 이후 pleiades 마이그레이션 0"* 을 붙이고, 그 조건이 깨지면 등급을 편도로 적는다. 아울러 T-7 archive 뒤 R-7 은 unarchive 가 선행이다(R-6 과 같은 사전 단계) |

### 2-D. Q85 ① — 로컬 pm2 리허설 판

| 주장 | 판정 | 실제 |
|---|---|---|
| 포트를 env 로 받게 하면 L-3 포트로 기동·health 가 된다 | **확인(코드 경로)** | fin 웹 = `next start -p <arg>`(ecosystem 이 정한다) · fin MCP = `MCP_PORT`(server.ts:924-925) · fit 웹 = `-p` / `PORT` · fit MCP = `MCP_PORT`(→ `MCP_HTTP_URL`) · fit MCP→웹 = `APP_BASE_URL`. health 는 MCP `/health`. **advisor 는 health·기동 경로에 없다** — fin config 의 4210 고정은 기동을 막지 않고, 필요하면 `MCP_CONFIG_PATH`(claude-advisor.ts:754)로 로컬 config 를 가리킬 수도 있다. 사전검증 4299·4399 는 I-12 목록 밖. **기본값이 서비스 포트(4100·4200·4210·4301)라 env 누락 = I-12 위반** → 리허설 판은 env 누락 시 기동을 거부해야 한다 |
| *"fin advisor 는 4210 고정이라 L-7 차단 상태로"* · I-12 준수만 적음 | **정정**(새 정정 3) | **L-7 차단은 pm2 아래에서 자동 성립하지 않는다.** fin 의 advisor 차단은 `tools/local/run.sh:23` 이 `PATH` 맨 앞에 `bin/`(claude shim)을 넣는 것이고, 셸의 `DATABASE_URL`·`TELEGRAM_BOT_TOKEN` 제거(`:27` `env -u`)와 `check_env.py`(`:24`) 도 **run.sh 경유일 때만** 일어난다(CLAUDE.md M-6a 문단 *"pm2 직접 기동은 검사 없음"*). pm2 앱의 환경은 pm2 데몬·CLI 의 환경을 물려받으므로, run.sh 밖에서 데몬이 떠 있으면 **fin 봇의 `claude` 가 실 CLI 로 풀린다 → advisor 계정 사용(I-8)** · 셸의 실값이 섞일 수 있다(I-4·I-14). Q85 ① 은 **전용 `PM2_HOME`(새 데몬) · run.sh 경유 첫 기동 · ecosystem 에 shim 포함 `PATH` 명시 · 기동 뒤 프로세스 env 확인(`claude` 가 shim 인지)** 을 조건으로 적고, **봇·웹 기동 = 격리 경계 작업이라 착수 전 사용자 확인**(isolation 파생 규칙)도 적는다. 로컬 pm2 미설치(004 Q23)이므로 설치 방식(전역 설치 vs `npx`)도 그 확인에 포함한다 |

### 2-E. Q84 ① — 늦은 발견 위험

| 주장 | 판정 | 실제 |
|---|---|---|
| *"fin build 는 서비스 DB 없이는 못 하므로 Q84 ① — T-5c ③ 으로"* · 비교 칸 *"fin 빌드 실패를 언제 아는가(① 은 T-5c ③)"* | **정정**(새 정정 4) | **DB 가 필요한 것은 `next build` 의 prerender 단계뿐이다**(006 ㉑ *"더미 DB 로 rc 1 — prerender 가 Prisma 호출"* · 위 2-A 의 4곳 `findMany`). 그 앞의 컴파일·타입·lint 와, `build:mcp:staged`·`build:bot`(esbuild 번들 · DB 무관)은 **T-4 에서 더미 DB 로 돌릴 수 있다** — `npm run build` 는 `&&` 체인이라 `next build` 실패에서 멈추므로 번들 두 개는 따로 부른다. 따라서 T-5c ③ 까지 미뤄지는 발견은 **"prerender 단계 실패" 한 부류**로 좁혀진다. Q84 ① 을 *"T-4 에서 fin 은 더미 DB 로 prerender 직전까지 + MCP·봇 번들 · prerender 만 T-5c ③"* 으로 다시 쓰면 ②(서버 빈 스키마 DB · 잔여물)를 고를 이유가 대부분 사라진다 |
| *"③ 구간은 옛 프로세스가 돌고 있어 중단 창이 아니다 · 그때 멈추면 즉시"* | **확인** | 2-A 와 같다. 대가는 T-5a(동결·fit 서비스 릴리즈)·T-5b(백업)를 이미 치른 뒤라는 것 — 즉시이되 창을 한 번 버린다 |

## 3. 표·숫자·격리 표

| 항목 | 판정 | 실제 |
|---|---|---|
| ⑱ 값(트리 동일 ×2 · fin 차이 0 · 하네스 문서 1파일 · fit 수용 ref↔main 0 · 서비스 fit dev `13a9c38` 대기 1 `20261016011539_health_checkup`) | **확인** | 1회차 A-1a·A-1b 와 일치. 같은 숫자가 §4-3·4-5·T-5a·T-9·Q75 에 다시 나오지만 전부 ⑱ 참조로 적혀 새 숫자를 만들지 않았다 |
| M1 `scheduler.ts:66,78,89,101,108` · T-8 `backup-db.sh:18-20` · 크론 `*/10`·`0 *` · `scheduler.ts:141` | **확인** | 1회차 근거와 일치 |
| *"절대경로 4곳"*(4-7 O-b) | **확인** | measured-facts 새 절에 있다 |
| §6 표 ↔ isolation.md | **확인** — T-0~T-4 에 I-4·5·7·8 해제 없음 · T-5c ① 에서 그 앱 서버 범위만 · I-1·I-2 영구 · I-9 D-a 유지 · I-19 유지 | 모순 없음. 문안 2곳만(새 정정 5) |
| §6 I-7 행 *"③ fin build 가 처음 읽는다"* · 인용부 *"T-2·T-4 의 서버 접근은 … 서비스 프로세스·DB·봇에 닿지 않는다"* | **정정**(새 정정 5 · 경미) | 서비스 DB 첫 접속은 **② `migrate status`**(③ 앞). T-2 의 U3(`pm2 ls`·dump)·U5(DB 이름·크기·권한)는 서비스 pm2·DB 를 **읽는다** — "닿지 않는다" → *"읽기만 한다(사용자)"* |

## 미확인

| # | 항목 | 왜 | 어떻게 |
|---|---|---|---|
| M-a | `npx prisma migrate status` 가 **대기 마이그레이션·DB 전용 마이그레이션 둘 다에서 비0 종료**하는지 | 실행하지 않았다(로컬 DB 조작 = 격리 경계 작업) | T-1 리허설에서 `pleiades_fin` 으로 확인(대기 1개 상태를 만드는 방법 포함 · 착수 전 사용자 확인). 종료 코드가 아니라 출력 문자열로 판정해야 하면 스크립트가 그렇게 쓴다 |
| M-b | pm2 데몬/앱이 어느 시점의 환경을 물려받는지(첫 데몬 기동 시 · `pm2 start` CLI 시 · `--update-env`) | 로컬 pm2 미설치 · 실행 안 함 | Q85 ① 리허설 첫 단계에서 프로세스 env 를 확인 — 새 정정 3 의 조건이 그 확인을 요구한다 |

## 새 정정 상세 (고쳐야 할 문장)

1. **§4-4 :175 근거 칸** *"웹은 fit 크론 담당(⑪)"* → *"fit 크론은 웹·봇 둘 다(⑪) — 셋 다 정지한 뒤 기동하므로 중복 없음"*.
2. **§7 R-7·R-8** — 두 행에 조건 *"전환 이후 pleiades 마이그레이션 0(Q74 연장은 관찰 종료까지)"* · 깨지면 **편도**(백업 복원). R-8 의 *"Q74 로 대상 0 이어야 한다"* 를 *"관찰 기간 안에서만"* 으로 한정. R-7 에 *"T-7 archive 뒤면 unarchive 선행"*. R-8 에 *"제자리 재빌드 실패 시 도는 프로세스도 흔들린다"*.
3. **Q85 ①** — 조건 추가: 전용 `PM2_HOME` · run.sh 경유 첫 기동 · ecosystem 에 shim 포함 `PATH` · 기동 후 `claude` 해석·env 확인 · 포트 env 누락 시 기동 거부 · 착수 전 사용자 확인(봇·웹 기동 · pm2 설치). *"L-7 차단 상태로"* 는 이 조건을 만족할 때만 참.
4. **T-4 · Q84** — *"fin build 는 서비스 DB 없이는 못 한다"* → *"prerender 단계만 DB 가 필요하다"* · Q84 ① = *"T-4 에서 fin 더미 DB 빌드(prerender 실패 예상) + `build:mcp:staged`·`build:bot` 개별 실행 · prerender 만 T-5c ③"* · 비교 칸의 늦은 발견을 *"prerender 단계 실패 한 부류"* 로.
5. **§6 I-7 행 · 인용부(:272)** — 첫 DB 접속은 ② · T-2 는 서비스 pm2·DB 를 읽기만(사용자).

**합계: 새 정정 5(1 = 1회차 정정 8 불충분분) · 미확인 2 · 1회차 정정 반영 확인 7/8.** 로드맵 순서·등급 체계는 바뀌지 않는다. 초안 재작성: **필요 — 3회차 국소 개정 후 재감사**(workflow 4절 "3회 넘으면 스코프 축소"에 닿기 전 마지막 기회라는 점을 오케스트레이터에 알린다).

## 근거 명령

```bash
python3 -I -c "import json;print(sorted(json.load(open('apps/finance/.next/prerender-manifest.json'))['routes']))"
grep -n prisma apps/finance/src/app/{layout.tsx,deposits/new/page.tsx,dividends/new/page.tsx,trades/new/page.tsx}
grep -rn "create\|update\|upsert\|delete\|executeRaw" apps/finance/src/app/{deposits,dividends,trades}/new/page.tsx   # orderBy: createdAt 만
# 스크래치 symtest2: 루트 .gitignore 끝 / 없는 경로
git status --porcelain ; git status --porcelain --ignored ; git check-ignore -v <3 paths>
git checkout -qf t1 ; git clean -fdq ; ls -la … | grep -- '->'   # 3 생존
git add -A ; git diff --cached --name-only                         # 0
git clean -fdxq                                                    # 링크 삭제 · 대상 데이터 남음
grep -n "check_env\|PATH\|exec" tools/local/run.sh                 # :23 PATH shim · :24 check · :27 env -u
```
