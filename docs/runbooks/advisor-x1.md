# 통합 어드바이저 실험 X1 런북 (011 단계 2 · #632)

두 도메인(fin · fit)의 읽기 도구를 함께 가진 `claude` 한 세션에 실데이터로 교차 질문을 던지고, **"사용자가 쓸 만하다고 판정하는 교차 답을 내는가"** 를 판정한다(011 §5-1). 정본 설계는 `docs/specs/011-integrated-advisor.md` §5(안전 요건 S-1~S-6 · 판정 J1~J5) · 확정 Q114~Q131 이다.

실행은 전부 사용자가 서버에서 한다(Claude 서버 접근 금지 · I-3). 세션에는 **판정 양식만** 붙인다. 질문·답 원문은 서버의 비공개 파일에만 있다.

| 항목 | 값 |
|---|---|
| 스크립트 | `deploy/advisor-x1/x1.cjs`(본체) + `judge.cjs`(순수 판정 함수 · x1.cjs 가 require) + `run-x1.sh`(배포 락 래퍼) — node 만 · npm 의존성 없음 · 세 파일을 같은 커밋으로 — 커밋을 고정해 `~/pleiades-advisor-x1/` 에 둔다. 체크아웃 안에서는 돌지 않는다(스크립트가 거부한다 · Q115) |
| 입력 | `~/pleiades-private/advisor-x1/questions.txt`(600 · 사용자 작성 · 2절) · 재실행 prompt 때만 `knowledge.txt`(600) |
| 결과 | `~/pleiades-private/advisor-x1/runs/<KST 시각>-<종류>/`(700) — `answers.md`(질문·도구 이름·답 원문) · `stream-<번호>.jsonl`(CLI 출력 원문) · `form.txt`(판정 양식 사본) · `mcp-config.json` · 빈 `cwd/` · 파일 600 |
| 상태 | `~/pleiades-private/advisor-x1/state.json` — 실행 기록(재실행 합쳐 최대 1회 강제) |
| 배포 락 | `~/pleiades-private/deploy.lock` 을 `flock -n` 으로 실험 끝까지 쥔다(S-1) — **그동안 Release 자동 배포는 실패한다** |
| 래퍼 표지 | x1.cjs 는 `X1_LOCK_HELD=1` 이 없으면 시작하지 않는다 — **실수 방지용 보조다(env 를 직접 주면 우회된다).** 늘 `run-x1.sh` 로 부른다 |
| 시각 | 00:15~05:40 KST 에만 시작(release-inplace 런북 C0) · 매월 1일 · 1·4·7·10월 7일은 시작 안 함 · 05:40 뒤에는 새 질문을 시작하지 않는다 |
| 비용 | 호출당 `--max-budget-usd 1.0`(Q130 = fin 크론 값) · 실행 1회 목표 $3.00(누적이 닿으면 다음 질문 미실행 — 상한 아님) |

되돌리기: `~/pleiades-advisor-x1/` 삭제(**즉시**) · `~/pleiades-private/advisor-x1/` 삭제(**즉시** — 원문·상태를 잃는다). **남는 것:** 두 MCP 로그(14일 뒤 자동 소멸) · fin 가격 캐시 갱신 · fit Garmin 조회 몇 건(크론·`!ai` 와 같은 흔적) · 쓴 비용(**편도**).

## 0. 실행 전 체크

| | 확인 | 왜 |
|---|---|---|
| 기준선 | `v1.12.1`(#624) 뒤 fin 대화가 몇 건 쌓였다 | J5 의 fin 비교선(011 §5-7) |
| 쿼터 | advisor 계정 쿼터에 여유가 있다(사용자) | 실험이 크론과 같은 계정을 쓴다 |
| 승인 | 서버 실험 실행 승인 · 허용 사용자 수 확인(사용자) | 011 §5-7 |
| `!ai` | **실험 동안 Discord `!ai` · AI 대화를 쓰지 않는다** | 공유 로그 보조 판정이 "섞임" 이 된다(S-2) |
| 릴리즈 | **실험 동안 Release 를 발행하지 않는다** | 배포 락을 실험이 쥔다 — 발행하면 자동 배포가 락에서 실패한다(S-1) |
| 시각 | 00:15~05:40 KST 시작 · 일요일 새벽이 가장 조용하다 | 크론 몰린 시각 회피(S-6) |
| 플래그 효과 먼저 | **운영 advisor 에 같은 플래그를 넣는 #635(PR #639)가 배포된 뒤**, 운영 advisor 세션 기록에서 hook 이벤트 0 을 먼저 확인한다(판정만) | `--setting-sources project` 가 2.1.308 에서 user 범위(플러그인 · hooks)를 실제로 빼는지는 init 보다 앞서 도는 SessionStart hook · 플러그인 stdio MCP 까지는 X1 이 막지 못한다 — 운영에서 먼저 보이면 X1 탐침 전에 근거가 생긴다 |

## 1. 설치

`<REF>` 와 두 `<SHA256>` 은 Claude 가 머지 뒤 실값을 준다. 검증 전에는 도는 파일을 덮지 않는다.

```bash
mkdir -p ~/pleiades-advisor-x1 ~/pleiades-private/advisor-x1 && chmod 700 ~/pleiades-advisor-x1 ~/pleiades-private ~/pleiades-private/advisor-x1
for f in x1.cjs:<SHA256_X1> judge.cjs:<SHA256_JUDGE> run-x1.sh:<SHA256_RUN>; do n=${f%%:*}; h=${f#*:}
  curl -fsSL "https://raw.githubusercontent.com/fomalhaut84/pleiades/<REF>/deploy/advisor-x1/$n" -o ~/pleiades-advisor-x1/$n.new \
    && echo "$h  $HOME/pleiades-advisor-x1/$n.new" | sha256sum -c --quiet \
    && mv ~/pleiades-advisor-x1/$n.new ~/pleiades-advisor-x1/$n && echo "$n 설치 통과" || echo "[중단] $n 검증 실패 — 멈춘다"
done
```

## 2. 입력 파일

**질문 원문은 사용자가 쓴다**(Q117) — 저장소·세션에 원문을 두지 않는다. 틀은 부록 A.

```bash
( umask 077; ${EDITOR:-nano} ~/pleiades-private/advisor-x1/questions.txt ); chmod 600 ~/pleiades-private/advisor-x1/questions.txt
```

형식 — 머리 줄 `## <번호>` 여섯 개를 한 번씩(순서 무관 · 실행 순서는 늘 X1→X4→D1→D2), 그 아래 질문 본문(여러 줄 가능 · 4000자 이하). 첫 머리 앞에 글이 있으면 거부한다.

```
## X1
(교차 질문 1)
## X2
…
## X4
…
## D1
(fin 단일 도메인 대조 질문)
## D2
(fit 단일 도메인 대조 질문)
```

권한이 600 이 아니거나 소유자가 실행 계정이 아니면 시작하지 않는다. 본 실행 뒤에는 이 파일을 바꾸지 않는다 — 재실행은 같은 파일(지문 대조)이어야 한다.

## 3. 사전 판정 (`--preflight` · 모델 호출 0)

아무 때나 돌려도 된다(시각 창은 보고만 한다). 배포 락을 잠깐 쥐므로 배포 중이 아닐 때 돌린다.

```bash
bash ~/pleiades-advisor-x1/run-x1.sh --preflight
```

**기대:** `init 탐침: 통과 · 플러그인 0(내장 n 제외) · MCP 서버 2(연결 2) · 목록 밖 도구 0 · 모델 응답 없음 · CLI <버전>` 과 `결과: 사전 판정 통과 — 질문 0(--preflight)`. 무엇을 보나:

- **S-1** 배포 락을 `flock -n` 으로 잡았나 · 지금 시각이 창 안인가
- **S-3** settings 범위별 `mcp__` allow · 와일드카드 allow · hooks · 켜진 플러그인(**user · user-local 범위는 보고만** — `--setting-sources project` 로 읽지 않는다 · 실제 로드는 4절 init 판정이 질문마다 본다 · #634) — user(`~/.claude/settings.json`) · user-local(`settings.local.json`) · 관리형 파일(`/etc/claude-code/managed-settings.json`) · 관리형 조각(`managed-settings.d/*.json`) · 실행 cwd 와 그 조상의 `.claude/settings*.json`. **하나라도 있거나 파일을 못 읽으면 시작 안 함.** 실행은 `--setting-sources project` + 빈 임시 cwd 라 user 범위를 읽지 않지만, 판정은 매번 한다(#632 서버 측정: user allow 0 · hooks 0 · 관리형 없음)
- **S-4** `claude --version` · help 에 필요한 옵션 14개 · 두 앱 `models.ts` 모델 핀이 같은가
- **S-5** 두 체크아웃의 분류 상수(fin `READ_TOOLS`·`WRITE_TOOLS` · fit `ADVISOR_ALLOWED_TOOLS`·`ADVISOR_EXCLUDED_TOOLS`)로 허용·거부 목록을 만들고, 두 MCP 의 `tools/list` 와 빠짐없이 맞는지 · fin `READ_TOOLS` 의 MCP 아닌 항목(WebSearch · WebFetch)은 버린다 · 도구 접두 = mcp-config 서버 키(`myfinance` · `myfitness`) · fin `MCP_PORT` = mcp-config 포트 · fit 포트는 기본값과 같음/다름만
  > **정정 (2026-11-13 · #653 · 012 4a-1).** 분류 출처가 두 체크아웃의 **`apps/<dir>/domain.json`**(`tools.read`·`tools.write` · MCP 도구만이라 버리는 항목이 없다)으로 바뀌었다. `x1.cjs` 를 다시 쓰려면 #653 머지 커밋 이후 REF 로 재설치한다 — 그 전 설치본은 #653 을 담은 릴리즈 뒤 S-5 에서 멈춘다(옛 TS 상수를 찾는다 · 질문 0 · 안전). 되돌리기: 문구 (**즉시**).
- **Q131** 원장 테이블 스냅샷을 읽을 수 있나(아래 4절)

어긋나면 그 줄과 `결과: 시작 안 함 — 질문 0` 이 나온다. 그 양식을 붙인다.

**탐침이 `위반(플러그인)` 이면** — 어떤 플러그인인지 이름·출처만 꺼내 판정한다(다른 내용은 출력하지 않는다 · #645):

```bash
f=$(ls -td ~/pleiades-private/advisor-x1/runs/*-preflight | head -1)/stream-probe.jsonl
head -1 "$f" | node -e 'const e=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log("plugins:",(e.plugins||[]).map(p=>typeof p==="string"?p:`${p.name||"?"} (source=${p.source||p.marketplace||"?"})`).join(" | ")||"없음");console.log("plugin_errors:",Array.isArray(e.plugin_errors)?e.plugin_errors.length:typeof e.plugin_errors)'
```

출처가 전부 `…@builtin` 이고 4-a 목록에 없는 것이 있으면 CLI 업데이트로 생긴 새 내장이다 — 목록 갱신 PR 을 거친다. 그 밖의 출처면 설정 범위 격리가 깨진 것이다 — 실행하지 않는다.

**init 탐침(#634 9-1 major 2):** 나머지 판정이 다 통과하면 마지막에 **본 실행과 같은 인자**(같은 시스템 프롬프트 · mcp-config · 허용·거부 목록 · `--setting-sources project` · 빈 cwd)로 `claude` 를 한 번 띄운다. 프롬프트는 짧은 고정 문장(`X1 탐침 — …`)이다 — `-p` 는 입력이 있어야 시작하고, init 은 질의를 시작할 때 API 호출보다 먼저 내는 첫 이벤트라(2.1.322 코드) **첫 줄(init)을 받는 즉시 SIGKILL** 한다. 판정 기준은 4-a 와 같다. 결과는 CLI 버전과 함께 `state.json` 의 `probe` 에 남고, **본 실행 · 재실행은 같은 CLI 버전의 탐침 통과가 있어야 시작한다**(없으면 질문 0 · `--preflight` 를 다시). **본 실행 · 재실행도 같은 락 아래 기록 직전에 탐침을 한 번 더 한다** — preflight 뒤 user 설정 · 분류 목록이 바뀌었으면 거기서 멈추고 횟수에 들지 않는다(#634 재리뷰). 탐침 줄에는 직전 탐침 대비 `user 범위`(user · user-local settings 파일 지문) · `허용 목록` 같음/다름이 나온다(내용은 나오지 않는다). 탐침에서 모델 응답이 오면(SIGKILL 전에 도착) 양식에 `모델 응답 있음 · 비용 …` 으로 적는다 — 비용은 result 가 없으면 `$?`(계정 사용량에서 확인).

**탐침의 한계:** 탐침도 CLI 세션이라, user 범위가 실제로 읽히는 상태라면 SessionStart hook · 플러그인 stdio MCP 가 init 전에 한 번 돈다. 탐침은 그 사실을 init(플러그인 수 · init 앞 hook 이벤트)으로 **탐지**할 뿐 막지 못한다 — 그래서 0절의 "플래그 효과 먼저"(#635)를 탐침보다 먼저 한다. 끊을 때는 **CLI 부모 프로세스만 SIGKILL** 한다 — user 범위가 실제로 로드됐다면 hook · 플러그인 stdio MCP 하위 프로세스가 남을 수 있다(그때는 `ps` 로 확인해 정리한다).

질문마다의 init 판정(4절 4-a)은 본 실행 · 재실행에서만 한다 — 사전 판정은 탐침 1회뿐이다.

## 4. 본 실행

0절을 다시 확인하고 창 안(00:15~05:40 KST)에 시작한다. 질문 6개 · 질문당 최대 10분.

```bash
bash ~/pleiades-advisor-x1/run-x1.sh
```

스크립트가 하는 일(순서):

1. 사전 판정(3절 전부) — 하나라도 어긋나면 질문 0
2. **Q131 실행 전 원장 스냅샷** — 두 앱 cwd 의 `.env` 로 Prisma `findMany`(SELECT 만 · URL 출력 없음) · 테이블별 행 수 · 최근 `updatedAt`/`createdAt` · 행 내용 지문(sha256). fin 15 테이블(`WRITE_TOOLS` 가 바꾸는 모델: HoldingStrategy · Watchlist · Transaction · Category · Asset · Deposit · Budget · RecurringTransaction · AlertConfig · RSUSchedule · StockOption · StockOptionVesting · CustomStrategy · Holding · Trade) · fit 2(TrainingPlan · TrainingWorkout). 캐시(PriceCache · EarningsCache · KrxStock · BenchmarkPrice · 스냅샷)는 뺀다. 클라이언트는 앱 생성기를 따른다 — fin = `@prisma/client`(`prisma-client-js` · node 로) · fit = `src/generated/prisma/client.ts`(`prisma-client` 생성기의 TS 출력 · 앱 `node_modules/.bin/tsx` 로 · `@prisma/client` 에는 fit 모델이 없다). 헬퍼는 `~/pleiades-private/advisor-x1/db-helper-<앱>.{mjs,mts}`(600)에 쓰고 돌린다
3. 기록 직전 init 탐침(3절 · 실패면 횟수에 안 든 채 멈춤) → 상태 파일에 실행을 먼저 기록(중간에 죽어도 횟수에 든다)
4. 질문마다 `claude --print --output-format stream-json --verbose --model <sonnet 핀> --system-prompt <새 짧은 프롬프트> --mcp-config <두 서버> --strict-mcp-config --setting-sources project --allowedTools <읽기 52> --disallowedTools <쓰기 35> --tools "" --max-budget-usd 1.0 --permission-mode dontAsk --no-session-persistence` — 인자 배열(셸 없음) · 질문은 stdin · cwd 는 빈 임시 디렉터리 · 자식 env `DISABLE_AUTOUPDATER=1` + 앱과 같은 모델 핀 세 키
   - **4-a. init 판정(#634 · fail-closed):** CLI 출력 첫 줄이 `system`/`init` 이어야 하고, 로드된 플러그인 0(`plugins` · `plugin_errors` — **CLI 내장 플러그인은 빼고 개수만 보고**한다(#645) — 내장으로 보는 것은 서버 CLI 2.1.311 에서 실측한 출처 3개와 **정확히 같은 것뿐**이다: `cc-plugin-agents-md@builtin` · `cc-plugin-telemetry@builtin` · `cc-plugin-plugin-authoring@builtin`(`judge.cjs` `BUILTIN_PLUGINS`). 같은 CLI·같은 플래그를 쓰는 운영 advisor 에도 같이 실릴 것으로 본다(추정 · 미측정). 내장 플러그인이 도구를 더하면 아래 `tools` 판정이 잡고, 내장 플러그인에 hook 이 있으면 init 앞 `hook_*` 로 위반이 된다. **CLI 를 업데이트하면** 새 내장 플러그인이 생겨 탐침이 `위반(플러그인)` 으로 멈출 수 있다 — 그때 이름·출처만 꺼내(3절 확인 명령) Claude 에게 알리고 목록 갱신 PR 을 거친다) · MCP 서버가 `myfinance` · `myfitness` 둘뿐이고 둘 다 `connected`(`mcp_server_errors` 없음) · `tools` 가 전부 허용 목록 안(내장 도구가 하나라도 있으면 실패 — `--tools ""` 기대)이어야 한다. 어긋나면 **첫 도구 호출을 기다리지 않고 자식을 SIGKILL** 하고 남은 질문은 시작하지 않는다. 사유는 둘로 나눈다(#634 9-1 major 1):
     - **위반** — 플러그인 ≥1 · MCP 서버 수·이름 불일치(`mcp_server_errors` 포함) · 목록 밖 도구 · **init 앞의 `system`/`hook_*` 이벤트**(어느 범위에도 hooks 가 없으면 나지 않으므로, 났다면 차단하려던 설정이 로드됐다는 직접 증거다) → 그 질문 `실패(init)` · 남은 질문 `미실행(init 실패)` · **J2 실패**(횟수에 든다)
     - **형식** — 첫 줄이 init 이 아님(그 밖의 init 앞 이벤트 포함) · 필드 없음 · `plugin_errors`/`mcp_server_errors` 가 배열이 아님 · 서버가 아직/못 연결(`pending` · `failed` · 알 수 없는 상태) → 그 질문 `오류(init 형식)` · 남은 질문 `미실행(init 형식)` · **J2 판정 불가**. 횟수에서 빼는 것은 **첫 질문에서 형식 실패 · 모델 응답 0 · 비용 0** 일 때뿐이다(기록은 남고 탐침 통과가 무효가 돼 `--preflight` 부터 다시). 앞 질문이 완료됐거나 모델 응답이 온 뒤의 형식 실패는 **횟수에 든 J2 판정 불가**(재실행 불가 · #634 재리뷰)
5. 누적 비용이 $3.00 에 닿았거나 비용을 모르거나 05:40 을 넘으면 남은 질문은 **미실행**
6. 끝나면 `claude --version`(전후 비교) · 원장 스냅샷 다시(차이) · 공유 로그 보조 판정 · 판정 양식

## 5. 판정 양식

출력 전체를 세션에 붙인다. 원문 · 값 · 경로 · 포트 · ID 는 나오지 않는다(도구 이름은 허용 목록 밖 호출일 때 그 이름만). 사본은 결과 디렉터리 `form.txt`.

| 줄 | 뜻 |
|---|---|
| `X1 교차 · 완료 · $0.41 · 52.3s · turns 9 · fin 3(성공 3) · fit 2(성공 2) · 목록 밖 0 · 모델 드리프트 없음 · 누적 $0.41` | 질문별 상태 · 비용 · 지연 · turns · 도메인별 도구 호출 수 |
| 상태 `완료` | 판정 대상 — J1 을 사용자가 채운다 |
| 상태 `판정 불가` | 호출당 예산 초과로 답이 끊김(`error_max_budget_usd`) — J1 분모에서 뺀다 |
| 상태 `오류(<코드>)` | CLI 실패 · 시간 초과(10분) · result 없음 — 판정 불가와 같이 다룬다 |
| `init 통과 · 플러그인 0(내장 n 제외) · MCP 서버 2(연결 2) · 목록 밖 도구 0` | 질문별 세션 init 판정(4-a) — 이름 · 경로는 나오지 않는다. `init 위반(…)` 이면 J2 실패 · `init 형식(…)` 이면 J2 판정 불가(횟수 제외) |
| 상태 `미실행(<이유>)` | 누적 목표 도달 · 비용 미상 · 크론 창 끝 — J1 분모에서 뺀다 |
| **J1** | **사용자 칸** — 완료된 교차 질문마다 `예 / 부분 / 아니오` 하나와 이유 한 줄. 통과선 = 판정된 교차 중 예 ≥ 3 · 판정된 교차가 3 미만이면 J1 판정 불가(Q116) |
| **J2** | init 위반 0 · init 형식 0 + 세션 기록(stream-json `tool_use`)의 허용 목록 밖 호출 0 + 원장 대조 다름 0 + 공유 로그 보조 판정 — **실패**면 결과와 무관하게 중단 · 원인 조사 먼저(재실행 없음). 공유 로그가 판정 불가면 J2 도 **판정 불가**(통과 아님 — 중첩 호출은 로그로만 보인다) · 재실행 근거가 아니다 |
| 공유 로그 | 실험 시간 창의 두 MCP 로그(`apps/<dir>/logs/mcp-<날짜>.log` · msg `tool_call*` 의 `tool`)가 허용 목록 안인가 · fin MCP pm2 로그 `caller=strategy:parse`(중첩) 0 · 같은 창에 fin 봇 `caller=bot:ai_chat` 이 있으면 **섞임**(세션 기록 0 이면 J2 통과로 보고 그 사실을 적는다 — 중첩 근거가 있을 때만) · 세션은 도구를 불렀는데 MCP 로그 파일이 없거나 fin MCP · fin 봇 pm2 로그 파일이 없으면 `판정 불가(로그 없음)`(섞여도 같다) · 파일은 있는데 읽지 못하면(권한 · 읽는 사이 회전) `판정 불가(로그 읽기 실패)` — 빈 로그로 보지 않는다 |
| **J3** | 완료된 교차 질문 모두 두 도메인 도구가 1번 이상 **성공** |
| J4 | 대조 질문 — 기록만(Q129) |
| J5 | 지연 p50 · max · 누적 비용 — fit 대화 기준(p50 20.5s · p90 78.7s)과 나란히 |
| S-4 후 `다름` | 실험 중 CLI 버전이 바뀌었다 — 운영 advisor 모델 드리프트를 확인한다(#255) |

**답 원문을 읽는다.** J1 은 사용자가 `answers.md` 를 직접 읽어야 판정된다.

```bash
less ~/pleiades-private/advisor-x1/runs/$(ls -t ~/pleiades-private/advisor-x1/runs | head -1)/answers.md
```

원장 대조 `다름` 이 0 이 아니면: 실험 시간 창에 원장을 바꾸는 크론(가격 알림 확인 · 반복 거래 등 — 서버에서 확인)이 돌았는지 먼저 본다. 설명되지 않으면 J2 실패와 같이 다룬다.

## 6. 재실행 (합쳐 최대 1회 · §5-5 · §5-6)

상태 파일이 강제한다 — 본 실행은 1번 · 재실행은 그 뒤 1번 · 본 실행 J2 가 통과가 아니면 재실행 불가 · 질문 파일이 바뀌었으면 불가.

| 결과 | 명령 | 무엇을 다시 묻나 |
|---|---|---|
| J1·J2·J3 통과 | — | 단계 3 |
| J1 판정 불가 — 원인이 판정 불가 질문 | `run-x1.sh --rerun=budget --max-budget=<1.0 초과 2.0 이하>` | 본 실행에서 판정 불가 · 오류 · 미실행이던 교차 질문 |
| J1 판정 불가 — 원인이 미실행 | `run-x1.sh --rerun=resume` | 미실행이던 교차 질문(같은 상한) |
| J1 실패 · J3 실패 | `run-x1.sh --rerun=prompt` | 교차 4개 — 시스템 프롬프트에 `knowledge.txt`(K2 지식 일부)를 덧붙인다 |
| J2 실패 | 없음 | 판정 중단 · 분류 목록 · settings 원인 조사 |
| J2 판정 불가 — init 형식 · 세지 않음 | `--preflight` → 같은 명령(본 실행) | 첫 질문 · 모델 응답 0 일 때만 — CLI init 형식을 Claude 와 확인한 뒤(필요하면 스크립트 갱신) |
| J2 판정 불가 — init 형식 · 셈 | 없음 | 부분 결과가 있는 실행 — Claude 와 다음을 정한다 |
| J2 판정 불가 — 공유 로그 | 없음 | 로그가 왜 없었나(pm2 로그 위치 · 회전 · `MCP_LOG_TEE_FILE`) 확인 뒤 Claude 와 다음을 정한다 — 상태 파일은 통과로 남지 않아 재실행이 막힌다 |

재실행도 목표 총액은 $3.00 이다. 재실행 뒤에도 실패 · 판정 불가면 **통합 층 보류**를 올린다(002 단계 0 판정).

`knowledge.txt`(600 · 20000바이트 이하)는 Claude 와 정한 K2 지식 발췌다(011 §3-3 W3 — fin `CLAUDE.md` 도메인 규칙 절 등 · TA · 세금 제외). 원문은 서버 파일에만 둔다.

```bash
( umask 077; ${EDITOR:-nano} ~/pleiades-private/advisor-x1/knowledge.txt ); chmod 600 ~/pleiades-private/advisor-x1/knowledge.txt
```

중간에 죽은 실행(상태 `진행 중` · 예외로 끝나면 `예외 종료` — 그때까지의 양식은 나온다)은 횟수에 들고 재실행을 막는다 — 양식 없이 끝났으면 Claude 에게 판정만 알린다. 상태 파일을 손으로 고치지 않는다.

## 7. 결과 원문 · 삭제

판정이 끝나면(단계 3 설계에 쓸 비용·지연 숫자는 양식에 있다) 원문을 지운다.

```bash
rm -rf ~/pleiades-private/advisor-x1/runs && echo 원문 삭제
# 실험을 끝낼 때(재실행 기록도 버린다): rm -rf ~/pleiades-private/advisor-x1 ~/pleiades-advisor-x1
```

## 8. 서버에서 확인 (코드로 판정하지 못한 것)

| 항목 | 현재 처리 |
|---|---|
| `claude -p` 가 stdin 으로 질문을 받는가(2.1.308) | 받는다고 보고 설계했다 — 첫 본 실행에서 `turns` · 답이 비면 알린다(사전 판정은 모델을 부르지 않아 못 본다) |
| `--setting-sources project` 의 효과 | **init 탐침(3절)과 질문마다 init 판정(4-a)이 확인한다** — user 범위 플러그인이 실제로 로드되면 탐침에서 멈추고(본 실행 불가), 본 실행 중이면 그 질문에서 끊고 J2 실패. init 앞에 도는 것은 막지 못한다 — 0절 #635 확인이 먼저 |
| init 이벤트 필드(2.1.308) | `tools` · `mcp_servers[{name,status}]` · `plugins`(+ `plugin_errors` · `mcp_server_errors`)는 로컬 CLI 2.1.322 의 init 생성 코드에서 확인했다. 2.1.308 에 `plugins` 가 없거나 init 앞에 다른 이벤트가 오면 `init 형식(…)` 으로 멈춘다 — 탐침에서 먼저 드러나고, 본 실행 중이면 횟수에 들지 않는다. 그때는 Claude 와 판정 방법을 다시 정한다. MCP 리소스 도구 같은 내장 도구가 `--tools ""` 에도 남으면 `목록 밖 도구`(위반)로 멈춘다 — 탐침에서 먼저 드러난다. init 이 API 호출보다 먼저 나오는지(탐침 비용 0)는 2.1.308 에서 확인 — 탐침 줄의 `모델 응답` 칸이 알려 준다 |
| `--bare` | 쓰지 않는다 — 인증 경로를 바꿀 수 있다(OAuth 계정). S-3 판정 + `--setting-sources` 로 대신한다 |
| pm2 로그 시각대 | 줄 접두는 서버 로컬 시각으로 읽는다(앞뒤 2분 여유) — `date +%z` 가 pm2 데몬과 같다는 전제 |
| 실험 창에 원장을 바꾸는 크론 | 원장 대조가 다르면 5절 끝 절차 |
| `~/.claude.json` 의 프로젝트별 설정 | 실행 cwd 가 매번 새 경로라 해당 항목이 없다 |
| fit tsx | 서버 `deploy.sh` 1단계 앱 `npm ci` 는 `--omit=dev` 없이 돌고 셸 `NODE_ENV` 를 비운 채 배포한다(`release-inplace.sh:237`) — devDependencies(`tsx`)가 설치된다. 없으면 Q131 이 `fit tsx 없음` 으로 멈춘다 |
| MCP 도구 검색(`ToolSearch`) | 자식 env `ENABLE_TOOL_SEARCH=false` 로 끈다 — 2.1.308 에서 이 env 가 듣는지는 확인 안 됨. 양식에 `목록 밖 … [ToolSearch]` 가 나오면 J2 판정 전에 원인을 확인한다(MCP 아닌 CLI 도구라 원장 쓰기는 아니다) |
| `permissions.defaultMode` · `managed-mcp.json` | S-3 줄에 보고만 한다(막지 않는다) — `--permission-mode dontAsk` · `--strict-mcp-config` 가 덮는다고 보고 설계했다 |

## 부록 A. 질문 틀 (일반화된 문장 · 원문은 사용자가 쓴다)

교차 4(먼저) — 두 도메인을 함께 봐야 답이 되는 질문. 캘린더 없이 되는 범위.

| 번호 | 틀 |
|---|---|
| X1 지출 × 회복·수면 | 최근 몇 주 동안 특정 지출(외식 · 술 · 야간 등)이 많았던 주와 수면 · 회복 지표가 나빴던 주가 겹치는가 |
| X2 운동량 × 소비 | 운동량이 많았던 달과 적었던 달 사이에 소비(식비 · 범주별)가 어떻게 달랐나 |
| X3 기간 비교 | 두 기간(예: 지난달 · 이번 달)을 재무와 건강 양쪽에서 비교하면 무엇이 함께 달라졌나 |
| X4 목표 × 지출 | 건강 목표(체중 · 훈련 계획) 진행과 관련 지출(식비 · 운동 용품 · 회비)의 흐름을 함께 보고 평가하면 |

대조 2(나중 · 기록만 · Q129) — 한 도메인만으로 답이 되는 질문.

| 번호 | 틀 |
|---|---|
| D1 fin | 최근 한 달 지출을 범주별로 요약하고 예산 대비 많이 쓴 곳 |
| D2 fit | 최근 몇 주 훈련 부하와 수면 추세 요약 |

**제외(011 §5-4 · §3-3 W3 — 중립 cwd + 새 프롬프트 + Web 없음이 빼는 것):** TA · 매매 방법론 · **세금** · 보유 전략 · **웹 검색이 필요한 질문**(뉴스 · 시황) · fit DB 프롬프트에 기대는 코칭 판단 · 일정·캘린더 · 데이터를 바꾸는 요청.

## 부록 B. 로컬 시험

`python3 -m unittest discover -s deploy` 의 `test_advisor_x1.py` — 스텁 `claude` · 스텁 MCP HTTP(하나는 SSE 응답) · 가짜 `@prisma/client` · 합성 로그로 S-1~S-6 · J2 · J3 · Q131 · 재실행 분기를 고정한다. 분류 상수 · 모델 핀 · 스키마는 저장소 소스를 복사해 쓴다. 로컬에서 실제 `claude` · MCP · DB 를 부르지 않는다(I-3 · I-8). flock 경로는 Linux 에서만 돈다(macOS 는 mkdir 폴백 · `PLEIADES_TEST=1` 일 때만).
