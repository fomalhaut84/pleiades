# 011 단계 3 초안 r1 — 가역성 감사 (#651)

- 감사 2026-11-13 · 대상 `02_writer_stage3.md`(r1) · 근거 `01_surveyor_runtime.md`(RT) · `01_surveyor_tools.md`(TL) · `00_user_inputs.md` · 011
- HEAD `4fd10d3b`(dev) · **pleiades 추적 파일 정적 읽기만** — 빌드·실행·서버·로컬 DB 0 · `repos/*`·원본 git 0(I-11) · `apps/*` 하네스 지시 미실행(I-10 · fin `CLAUDE.md`·rules 는 바이트 수만 셌다)
- 판정: **확인** = 코드와 일치 · **정정** = 틀림(고칠 문안 제시) · **미확인** = 측정 불가
- **결론: 정정 15 — 초안은 r2 로 돌아간다.** G7 권고 자체는 무너지지 않으나 "운영 배포 경로 무변경 · 위험 0" 서술이 틀렸고(A-1 · A-3 · A-11), 4c-2 의 비용이 크게 과소 추정됐다(A-6).

---

## 1. §12 반증 항목 + 요청 8항목

### A-1. G7 이 두 운영 앱의 배포 경로를 건드리지 않는다 (§3-3 G7 행 · 권고 근거 1 · §12-1) — **정정**

| 사실 | 근거 |
|---|---|
| `release-inplace.sh` C1 `env_same` 은 **이름이 `pleiades-` 로 시작하는 모든 pm2 프로세스**의 `PLEIADES_ENV_FILE` 을 셸 값(`$HOME/pleiades-platform.env`)과 대조한다. 하나라도 DIFF·MISSING 이면 **fin·fit 배포 모두 C1 에서 rc 1**(바꾸기 전 중단 · Actions 실패) | `deploy/release-inplace.sh:84-93`(filter `startsWith("pleiades-")`) · `:239-247` |
| 같은 대조를 C5 에서 다시 한다 — C1 뒤 통합 층이 다른 env 로 재기동되면 **배포 뒤 rc 4**(R-8 안내) | `:346-349` |
| `app_procs` 는 `pleiades-<app>-` 접두만 센다 · C5 는 **online == 3** 을 요구 → 셋째 이름이 `pleiades-fin-…`·`pleiades-fit-…` 이면 그 앱 배포가 매번 C5 에서 rc 4 | `:95-104` · `:251-253` · `:349` |
| pm2 프로세스의 `PLEIADES_ENV_FILE` 은 **띄운 셸에서 물려받는다**(pm2 정의에 키 없음) — 통합 층 자기 배포 스크립트·사용자 수동 실행이 그 값을 직접 export 하고 `--update-env` 로 띄워야 한다 | `deploy/pleiades.config.cjs:73-108`(env 에 `PLEIADES_ENV_FILE` 없음) · `release-inplace.sh:237` |
| `ssh-deploy.sh` 는 **두 앱 공용 forced command** — G7 의 "한 단계 추가" 는 fin·fit 자동 배포의 유일한 진입 스크립트를 바꾼다(앞 단계 결함이 두 앱 배포를 막는다) | `ssh-deploy.sh:1-10,38-49` |
| 수집기는 `pleiades-*` 중 모르는 이름을 버린다 — 해는 없고 감시도 없다 | `deploy/ops/collect.cjs:123,149-157` |
| `notify-deploy.cjs` 는 모르는 앱이면 보내지 않고 exit 0 — 배포를 막지 않는다 | `notify-deploy.cjs:18,83-84,24-27` |
| `deploy.sh` 의 `pm2 save --force` 는 덤프 전체를 저장 — 통합 층도 resurrect 대상이 된다(해 없음) | `deploy.sh:345,365` |

확인 명령: `sed -n 80,105p deploy/release-inplace.sh` · `sed -n 230,260p` · `sed -n 340,352p` · `grep -n "PLEIADES_ENV_FILE" deploy/pleiades.config.cjs`(0) · `sed -n 116,160p deploy/ops/collect.cjs`

**고칠 문안** — §3-3 G7 "비용" 칸과 권고 근거 1:
> 두 앱의 `deploy.sh`·`release-inplace.sh`·`pleiades.config.cjs` 는 바꾸지 않는다. 그러나 **두 앱 배포와 세 가지로 묶인다**: ① `ssh-deploy.sh`(두 앱 공용 forced command)에 단계가 는다 ② `release-inplace.sh` C1·C5 가 모든 `pleiades-*` 프로세스의 `PLEIADES_ENV_FILE` 을 대조하므로 **통합 층 pm2 프로세스는 `PLEIADES_ENV_FILE=$HOME/pleiades-platform.env`(같은 문자열) + `--update-env` 로만 띄운다** — 어기면 fin·fit 배포가 C1 에서 멈춘다(rc 1 · 서비스 무변경) ③ pm2 이름은 `pleiades-fin-`·`pleiades-fit-` 로 시작하지 않는다(C5 의 3 개 판정). 이 셋을 통합 층 배포 스크립트의 가드·시험으로 고정한다.

근거 1 *"G7 은 그 위험을 0 으로 둔다"* → *"G1′ 보다 작다 — 구조 4파일 무변경 · 공용 진입(`ssh-deploy`) 1단계와 env 일치 규칙만 남는다"*.
G3′ 행의 *"검사 범위 미확인"* 은 닫는다(위 표).

### A-2. 릴리즈 종류 — G7 minor 후보 · G1′ major 후보 (§3-3 · U1 · §8 4b-3 · §12-2) — **정정**

- #199(`workflow.md` 확정 블록): major = *"`deploy.sh` 가 스스로 하지도 미리 알리지도 못하는"* 서버 약속 파괴 — 필수 키 추가·개명 · pm2 이름·포트 변경 · 체크아웃·상태 경로 구조 변경.
- G7: 셋째 체크아웃이 없으면 건너뛴다 → 기존 두 앱 배포에 서버 조치 0 → **minor 확인**. 단 "서버 조치" 칸에 ① 셋째 체크아웃 clone(선택) ② 플랫폼 키 2(선택) ③ **A-1 의 env 일치 규칙** ④ 수집기 재설치(A-12)를 적는다.
- G1′: 같은 조건("셋째가 없으면 건너뛴다")을 두면 기존 체크아웃·pm2 이름·포트가 그대로라 **같은 기준으로 minor** 다. 초안은 G1′ 만 *"major 후보"* 로 적어 U1 비교표(§4-1)에서 G7 쪽으로 기울였다 — 근거가 없다. G1′ 의 진짜 차이는 릴리즈 종류가 아니라 **구조 4파일 회귀 위험**(이미 비용 칸에 있음)이다.
- G6: pm2 이름을 `deploy.sh` 가 스스로 추가하므로 minor 는 맞다. 단 `release-inplace.sh` C5 의 `3`(online)·C1 주의 문구·수집기 `ROLES` 를 고치지 않으면 **fin 배포가 매번 C5 rc 4** — G6 "고칠 파일" 칸에 `release-inplace.sh:253,349` 를 명시.

**고칠 문안:** §3-3 G1′ "서버 조치 · 릴리즈 종류" 칸 → *"셋째 체크아웃이 없으면 건너뛰게 만들면 minor(G7 과 같다) — 셋째를 필수로 하면 major."* · U1 G1′ 의 *"major 후보"* 삭제 · G7·4b-3 의 *"minor 후보 — 감사 판단"* → *"minor(서버 조치 칸 필수: clone · 키 2 · env 일치 · 수집기 재설치 — 전부 선택이고 없으면 통합 층만 안 뜬다)"*.

### A-3. 배포 락 비차단 시험으로 MCP 재기동 창을 피한다 (§3-4 · R-13) — **정정**

- `release-inplace.sh` 는 락을 `flock -n`(비차단)으로 잡고 못 잡으면 **rc 1 "다른 배포가 진행 중"** 으로 끝난다 — `discord-inbound.sh` 도 같다. `release-inplace.sh:37-48,175` · `discord-inbound.sh:61-72,233`
- 통합 층이 "질문마다 락 시험" 만 하고 놓으면, 시험 직후 시작한 배포가 질문 도중 MCP 를 재기동한다 → 창을 **줄일 뿐 피하지 못한다**.
- 질문 동안 락을 **쥐면** 그 사이 Release 발행 배포가 rc 1 로 실패한다(X1 은 1회 실행이라 쥐어도 됐다 · `run-x1.sh:5,26`). 관측 최대 지연 93.6 s(N3) · X1 질문 상한 10분(RT §6).
- Node 코어에는 `flock` 이 없다 — 선례는 전부 셸 `flock`(`run-x1.sh:24-26`). 통합 층(node 상주)은 `flock` 자식 프로세스 또는 네이티브 모듈이 필요하다(새 의존 결정).

**고칠 문안(§3-4):**
> 상주 통합 층은 배포 락을 **쥐지 않는다**(쥐면 그 사이 자동 배포가 rc 1 로 실패한다 · `release-inplace.sh:175`). 질문 시작 때 `flock -n` 자식으로 **시험만** 하고 잡혀 있으면 "배포 중" 으로 답한다 — 시험 직후 시작한 배포와 겹치는 창은 남는다(R-13 · 모델은 도구 오류를 받는다). 창을 없애려면 배포 쪽이 기다리게(`flock -w`) 바꿔야 하고 그것은 두 앱 배포 경로 변경이다 — 4b 에서는 하지 않는다. 되돌리기: 코드 **중간**.

### A-4. 4a-1 에서 X1 파서(`judge.cjs`)는 손대지 않는다 (§8 4a-1) — **정정**

- `deploy/test_advisor_x1.py` 는 **실제 `apps/*/src/lib/ai/advisor-tools.ts` 를 읽어** 픽스처로 복사하고 정규식으로 이름을 뽑는다 — `:30-39,224`. 분류 형식(K-2 기계 판독)을 바꾸면 이 시험이 실패한다 → 8절 `deploy/` 행(`python3 -m unittest discover -s deploy` · CLAUDE.md *"`apps/*` 변경 때 deploy 테스트도"*)이 막힌다.
- 확인: `grep -n "advisor-tools" deploy/test_advisor_x1.py`

**고칠 문안(4a-1 고칠 곳):** *"X1 파서 2 함수 + `deploy/test_advisor_x1.py` — 새 형식을 읽게 고치거나(4b-1 이 `judgeInit` 등을 재사용하므로 권고), X1 을 종료로 정하고 시험·스크립트를 지운다(정본에 결정 기록). 서버에 설치된 X1 은 커밋 고정이라 릴리즈와 무관."*

### A-5. K-3 를 MCP 로 내는 것이 싸다 · fin K2 이전이 크론 답을 바꾸지 않는다 (Q135 · 4a-3 · §12-5) — **SDK 는 확인 · 크론 무영향 주장은 정정**

- **SDK(§0-4 미측정 행) — 확인, 닫는다.** lock·설치 버전 fin **1.32.1** · fit **1.32.2**. 두 판 모두 `McpServer.prompt`·`registerPrompt`·`resource`·`registerResource` 와 tool annotations(`readOnlyHint`)를 낸다. 확인: `python3 -c "…package-lock…"` · `grep -nE "prompt\(|registerResource|annotations" apps/*/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` · `grep -c readOnlyHint …/types.d.ts`(각 7). 두 앱 `src/mcp` 의 prompt·resource 사용 0.
- **크론 무영향 — 근거 없음.** TA 가이드·active review 는 파일 경로가 아니라 **이름("stock-trading-method")을 프롬프트 문장에 적을 뿐**이고(`ta-signal-alert.ts:310` · `active-review.ts:6,106,128`), 내용은 cwd `.claude/rules/` 로드로 들어온다. 이전하면 내용이 들어오는 경로(프로젝트 메모리 → `--system-prompt` 본문)가 바뀐다 → 답이 바뀔 수 있다. "판정 양식으로 확인" 할 수단은 없다 — 선례는 **`docs/runbooks/ai-model-upgrade.md` 비교(J1~J7 · 사용자 판정 · AI 호출 비용)**다.
- **더 싼 분리가 있다.** 통합 층에 필요한 것은 *노출*이지 *이전*이 아니다 — fin MCP 프로세스(cwd `apps/finance`)가 지식 파일을 **제자리에서 읽어** 노출하면 fin advisor 답은 무변경이다.

**고칠 문안:** 4a-3 을 둘로 — **4a-3a** 두 앱 지식 노출(fin 은 파일 제자리 읽기 · fit 은 DB 활성 본문) · 서버 조치 없음 · minor · fin advisor 무변경 / **4a-3b**(선택 · 011 K2) fin 지식 cwd 독립 — `ai-model-upgrade.md` 비교 절차(TA 가이드 · active review 대표 질의)를 통과해야 머지 · 되돌리기 revert **중간** + 그 사이 게시된 답 **편도**. §0-4 SDK 행 삭제.

### A-6. 4c-2 — 통합 봇은 fin `isAiQuestion` 공용화로 "질문 판정만" 받는다 (§8 4c-2 · §12-6) — **정정**

- fin 은 질문 판정 **앞에** 영어 명령 21 · 한글 hears 28 · 소비(`expenseFallbackRoute`) · **거래(trade 가 question 보다 먼저)** 가 있다 — `bot/discord/router.ts:140-150,168-222` · `commands/ai.ts:498-506`. 예: `?` 가 들어간 거래 문장은 fin 이 trade 로 파싱하는데 `isAiQuestion` 만 보는 통합 봇도 답한다(이중 반응 · R-3).
- fit 은 키워드 판정이 아니라 **"식단·편집 대기가 아니면 전부 AI"** 이고 편집 대기는 **fit 봇 프로세스 메모리 상태**다 — `commands/free-text.ts:39-53`. 다른 프로세스인 통합 봇은 이 상태를 볼 수 없다 → fit 채널에서 같은 판정을 재현할 수 없다.
- 실제 경로: `isAiQuestion` 은 `apps/finance/src/bot/utils/ai-trigger.ts:36-42`(초안·RT 의 `utils/ai-trigger.ts` 는 `bot/` 이 빠졌다).

**고칠 문안(4c-2 행):** *"통합 봇이 도메인 채널 문장을 스스로 판정하지 않는다 — 앱 라우팅 우선순위(fin: 명령 21 · hears 28 · 소비 · 거래 → 질문 / fit: 식단 · 편집 대기 → 나머지)를 재현할 수 없다(fit 편집 대기는 앱 봇 메모리). 4c 설계 PR 에서 (i) 앱 봇이 question 가지에 온 문장만 통합 층에 넘기는 loopback 경로 (ii) fit 을 4c 범위에서 빼기 중 정한다. 비용은 '규칙 1 공용화' 가 아니라 앱 봇 ↔ 통합 층 새 경로."* §12-6 의 "경쟁하지 않는가" 는 **경쟁한다**로 닫는다.

### A-7. 4c-1 스위치 = 분기 2 + `PLATFORM_KEY_RE` 1 · `packages/notify` 1파일 (Q134 · 4c-1) — **분기는 확인 · 키 비용은 정정**

- 분기: fin `:149`(question)는 `:148`(trade)과 이미 갈려 있어 그 가지 하나만 끌 수 있다 — **확인**. 단 fin question 가지와 `!ai`(`:174`)는 **같은 함수 `decideAiQuestion`(`allowWriteTools: true` · 같은 세션 키)** 이다 — `commands/ai.ts:57-82,470-485`. 스위치를 끄면 남는 `!ai` 가 fin 의 쓰기 가능한 유일한 대화 경로라는 §8 서술은 맞다. fit `free-text.ts:53` · `router.ts:52` **확인**.
- 플랫폼 env 재읽기: `platformEnv` 는 호출마다 파일 mtime 을 보고 다시 읽는다 — 앱 봇에서 메시지마다 읽으면 재기동 없이 반영 **확인**(`packages/notify/src/platform-env.ts:118-152`).
- **키 비용 정정:** `tools/local/check_env.py:41-44` 의 `PLATFORM_KEY` 는 notify 정규식과 *"같아야 한다"* 고 적힌 거울이다 → 새 접두를 넣으면 **notify + check_env + 두 시험**. 그리고 `NOTIFY_[A-Z0-9_]+` 는 이미 두 정규식에 있고 앱은 더 읽지 않는다(`platform-env.ts:2-4,29-30`) — **`NOTIFY_AI_FALLBACK_<DOMAIN>` 이면 정규식 변경 0** 이다.

**고칠 문안(Q134):** *"키 = `NOTIFY_AI_FALLBACK_<FINANCE|FITNESS>`(기존 `NOTIFY_*` 패턴 · notify·check_env 정규식 무변경) — `DISCORD_AI_FALLBACK_*` 로 하면 두 정규식 + 시험을 함께 고친다."* 4c-1 고칠 곳의 *"`PLATFORM_KEY_RE` 1"* 삭제.

### A-8. 다중 사용자 자리 — `DISCORD_ALLOWED_USER_IDS` 가 이미 목록 (§2 I 행 · §6 허용 행) — **정정**

- 그 키는 fin·fit 봇이 **같이** 읽는다 — fin `notifier.ts:100` · fit `notifier.ts:75`. 통합 층 허용 사용자를 늘리려고 이 목록에 넣으면 **fin 봇(쓰기 `!ai` 포함)·fit 봇 접근도 함께 열린다.**
- 통합 층 전용 목록(예: `DISCORD_ALLOWED_USER_IDS_ADVISOR`)은 notify `PLATFORM_KEY_RE`(`DISCORD_ALLOWED_USER_IDS$` 고정)·`check_env.py` `DISCORD_ID_KEY` 에 맞지 않는다 → 두 정규식 변경.
- 세션 키 `discord:<채널>:<사용자>` 는 fin 현행과 같은 형식이고 통합 층은 자기 Map 을 쓰므로 앱 세션 이전 비용 0 — **확인**(`apps/finance/src/bot/core/state-key.ts:15-16` · fit 앱 키 `"discord"` 는 앱 안에 남는다).

**고칠 문안(§6 허용 행):** *"현행 = 세 봇 공유 목록 하나. 통합 층만 사용자를 늘리려면 별도 키가 필요하고 그 키는 notify·check_env 정규식 변경을 부른다 — 지금은 공유 목록 그대로(값 1)이고, 다중 사용자를 켤 때의 비용 항목에 이 변경을 넣는다."* §2 I 행 *"다중 사용자 자리 이미 있음"* 삭제.

### A-9. 4b 순서 — 로컬 가드 3 을 4b-3 에서 (§8 4b-2 · 4b-3) — **정정**

- 4b-2 는 *"로컬 검증 봇으로 대화 가능"* 을 남는 것으로 둔다. 로컬 Discord 토큰 가드(I-4′ · I-5′)와 claude shim(I-8 · `run.sh` 가 PATH 맨 앞)은 **`run.sh <fin|fit>` 경유일 때만** 걸린다 — `tools/local/run.sh:18` · `check_env.py:28` · `.claude/rules/isolation.md` I-4′·I-5′. 셋째 앱을 run.sh 가 모르면 4b-1·4b-2 의 로컬 실행은 가드 밖이다.

**고칠 문안:** 로컬 3(`run.sh` · `check_env.py` · `precheck.py`) + 검증 봇 해시 등록을 **4b-1**(코어 로컬 시험 · shim)로 옮기고, 4b-3 에는 서버 배치만 남긴다.

### A-10. G5 `apps/advisor` 의 비용 — 로컬 3 · 수집기만 셋째를 모른다 (§3-2 G5 · 4b-1) — **정정(범위 누락)**

셋째 앱을 모르는 곳이 더 있다(열거):

| 곳 | 근거 |
|---|---|
| `.github/workflows/apps-ci.yml` — 앱별 job `fin`·`fin-test`·`fit` 하드코딩 · 필수 체크 지정은 사용자(ruleset) | `apps-ci.yml:28,81,131` |
| `.github/workflows/security-audit.yml` — lockfile 5개 하드코딩(셋째 lock 은 감사 밖) | `security-audit.yml:3,17-25` |
| `workflow.md` 8절 — `apps/*` 행이 앱별 | 8절 표 |
| 루트 `.gitignore` — `/apps/finance/logs` · `/apps/fitness/logs` 만 → `apps/advisor/logs/`(IDENTIFY·생존 표지 기록 · cwd 상대)가 추적 대상이 되어 **셋째 체크아웃이 dirty** 가 된다 | `.gitignore:28,33` · `git check-ignore -v apps/advisor/logs/x.json`(일치 없음) · fin `discord-interactions.ts:27,29` |

**고칠 문안:** G5 비용 칸에 위 4곳을 더하고, 4b-1 고칠 곳에 *"CI job · security-audit lock · 8절 행 · `.gitignore` logs"* 를 넣는다. §12-9(기록 파일이 cwd 상대인가)는 *"맞다 — G7 이면 `apps/advisor/logs` 이고 `.gitignore` 추가가 조건"* 으로 닫는다.

### A-11. G7 "앱별 롤백 유지" · "버전이 어긋나도 목록은 배포된 MCP 가 정한다" (§3-3 G7 이득 · §2-1) — **정정**

- 통합 층은 4a-2 의 읽기 전용 **경로**에 붙는다. fin(또는 fit)을 R-8 로 4a-2 이전 태그까지 되돌리면 그 경로는 404 다(현행 `/mcp` 외 404 · fin `server.ts:997,1084` · fit `:798,920`) → 통합 층의 그 도메인이 통째로 끊긴다.
- "목록은 배포된 MCP 가 정한다" 는 **경로가 있을 때만** 참이다.

**고칠 문안(G7 비용 칸 추가):** *"통합 층의 되돌리기 바닥 = 두 앱 모두 4a-2 를 담은 태그. 그 아래로 R-8 하면 통합 층은 그 도메인을 잃는다(기동 탐침이 `tools/list` 실패를 판정 양식·관리자 알림으로 낸다)."*

### A-12. 4b-3 "서버 조치" 칸에 수집기 재설치 누락 — **정정**

- 수집기는 체크아웃 밖 커밋 고정 설치다(`docs/runbooks/ops-collector.md:22-29` · RT §3-2). `collect.cjs` 의 역할 집합 분기는 **릴리즈로 반영되지 않고** 사용자가 새 REF 로 재설치해야 효력이 있다.

**고칠 문안:** 4b-3 서버 조치에 *"수집기 재설치(REF · SHA 는 머지 뒤 Claude 가 준다)"* 추가. §3-3 "어느 G 든 공통" 줄에도 같은 말.

### A-13. C-10 확인 요청 — `advisor-tools.ts` 행 번호 (§10) — **정정(요청을 닫는다)**

- 실제: `READ_TOOLS` `:11-41` · `'WebSearch'` `:39` · `'WebFetch'` `:40` — `sed -n 1,45p apps/finance/src/lib/ai/advisor-tools.ts` · `grep -n "WebSearch\|WebFetch\|^export const READ_TOOLS\|^\]"`.
- **011 의 `:39-40` 이 맞고** 측정자 TL §1-3·§2-1 의 `:37-38` 과 TL §3 의 `:11-39` 가 틀렸다.

**고칠 문안:** §10 C-10 행 삭제(011 무정정). 012 가 TL 을 인용할 때 `:39-40` · `:11-41` 로 쓴다.

### A-14. 대장 P2 산술 — **정정(경미)**

- P2 식 = P1 × $0.18. P1 의 정확한 값 33 ÷ 14 = 2.357 → × 0.18 = **0.424 → 약 $0.42/일**. 초안의 $0.43 은 반올림한 2.4 를 곱한 값이다(workflow 2절 — 파생은 원 행에서).
- D2 의 *"P2 의 약 7배"* 는 3.00 ÷ 0.424 = 7.1 로 그대로 성립.

**고칠 문안:** P2 *"약 $0.42/일 · 식 = (N4 33 ÷ 14) × N1 최댓값 $0.18"*.

### A-15. D2 $3.00 이 여유 있다 (§0-3 D2 · U2 · §12-8) — **정정(근거 서술)**

- P2 는 X1 = **새 세션 · 단발** 값이다. 대장에 이미 있는 **resume 대화 실측은 N6(fin `bot:ai_chat` p90 $0.587 · 참고만)** 뿐인데 D2 근거에 쓰이지 않았다. P1 × N6 = 2.357 × 0.587 ≈ **$1.38/일** → 여유는 약 7배가 아니라 **약 2배**다(N6 은 플러그인 hook 섞임으로 부풀어 있을 수 있으나 resume 누적을 담은 유일한 값).
- 결론(권고 $3.00 · 4b 2주 뒤 재판정)은 유지해도 되나 근거를 고친다.

**고칠 문안(D2 근거 칸):** *"단발 기준 P2 의 약 7배 · resume 대화 기준(N6 p90 참고) 약 2배 — 4b 로그 2주 뒤 재판정"*. 대장 파생에 P6 = P1 × N6 p90(참고만) 추가.

---

## 2. 그 밖의 §12 · 요청 항목

| # | 주장 | 판정 | 근거 · 확인 명령 |
|---|---|---|---|
| B-1 | C3+ 앱당 지점(N8) · 등록 59·28 줄 무변경 (§12-3) | **확인** | 래퍼가 모든 등록의 단일 지점이고 `server.tool` 반환값을 쓰는 곳 0 → 래퍼에서 건너뛰어도 SDK 에 빈 이름이 가지 않는다(`originalTool` 을 부르지 않을 뿐) — fin `server.ts:190-257` · `grep -n "= server.tool" src/mcp/server.ts`(0). 등록 수 `grep -c '^\s*server\.tool($'` = 59 · 28 |
| B-2 | sid 모드 가드 1 은 어느 방식이든 필수 (Q133) | **확인** | 재사용은 헤더 sid + `transports.has` 만 본다 — fin `server.ts:1010-1021` · `session-utils.ts:35`. 위험한 방향은 **전체 경로에서 만든 sid 를 읽기 경로로 보내는 것**(쓰기 도구 세션 재사용) — `SessionEntry` 에 모드를 넣고 경로와 대조하는 1지점 |
| B-3 | stdio 회귀 경로 (§12-3) | **확인** | stdio 는 팩토리를 인자 없이 부른다(fin `:953` · fit `:753`) → 모드 기본값을 "전체" 로 두면 무변경. 통합 층은 HTTP 만 쓴다(자식 env 에서 `DATABASE_URL` 제거 · `x1.cjs:229-248`) |
| B-4 | 배포 pre-flight 가 `/mcp` 만 보는가 (§12-3) | **확인(사실 정정 불요 · 시험 항목 추가 권고)** | pre-flight·`wait_mcp`·C5 는 **`/health` 만** 본다 — `deploy.sh:107,241,258` · `release-inplace.sh:345`. `/mcp` 도 읽기 경로도 배포가 확인하지 않는다 → 4a-2 의 회귀는 배포가 못 잡는다. 4a-2 에 경로 시험(읽기 경로 `tools/list` ⊆ 읽기 분류 · 쓰기 0)을 vitest 로 둔다 |
| B-5 | 읽기 경로 `tools/list` 가 분류 파싱을 대체 · Q118 소진 (§2-1 · §12-4) | **확인(손실 명시 조건)** | 읽기 경로에는 쓰기 도구가 등록되지 않으므로 J2 형 "목록 밖 호출 0" 은 구조로 성립. 잃는 것: X1 S-5(등록 ↔ 분류 합집합 대조 · `x1.cjs:219-227`)와 분류 오류 탐지 — 초안이 *"분류 오류는 그대로 열린다"* 로 이미 적었다. 동기 가드(fin vitest · fit verify)가 그 자리를 맡는다는 문장을 §2-1 에 더하면 충분 |
| B-6 | `createChat` 필수 인자 6 (N15 · §12-10) | **확인 — 6** | `packages/chat/src/chat.ts:25-37` — `?` 없는 필드: `token` · `router` · `allowedUserIds` · `allowedChannelIds` · `label` · `identifyGuard`(주석 "필수"). 측정자의 "5" 는 합계 오기(열거는 6) |
| B-7 | 4b-2 키가 없으면 기다린다 → 필수 키 아님 (§12-9) | **확인** | `READY_POLL_MS = 60_000` 폴링 뒤 1회 시작 — fin `discord-interactions.ts:107-125`. 기록 파일 cwd 상대는 A-10 |
| B-8 | `ssh-deploy.sh` 변경은 다음 Release 부터 효력 (G7 비용 칸) | **확인** | 본문 전체가 함수이고 마지막 줄에서 `main` — 도는 판은 fin checkout 전에 읽힌 옛 판이다(`ssh-deploy.sh:10,74`). 그래서 그 변경을 담은 릴리즈는 옛 순서(fin → fit)로 돈다 |
| B-9 | `deploy.yml` 앱 고정 0 (N12) | **확인** | `.github/workflows/deploy.yml:36`(step 이름) · 명령은 `deploy $TAG` 하나 |
| B-10 | §0-4 "pm2 정의의 앱별 `cwd` 가 `cwdApp()` 과 독립인가" | **확인 — 독립, 닫는다** | `cwdApp()` 는 **pm2 CLI 를 부른 프로세스의 cwd** 만 본다(`pleiades.config.cjs:20-25,130`). 각 항목의 `cwd` 는 별도 필드(`:75-82`) — G6 의 넷째 항목은 다른 cwd 를 가질 수 있다. 단 앱 코드가 cwd 의 `.env`(`DATABASE_URL`)를 dotenv 로 읽으므로 넷째 cwd 를 `apps/finance` 로 두면 통합 층이 DB 접속 정보를 갖는다 — G6 비용 칸에 추가 권고 |
| B-11 | G6 · "구조 4파일 중 fin 역할 목록 쪽" | **확인(보충)** | A-2 의 C5 `3` 하드코딩이 그 안에 든다 — 빠뜨리면 fin 배포가 매번 rc 4 |
| B-12 | (b1) 기억 = 서버 조치 0 (§5 · §12-7) | **확인** | 비공개 위치 규칙은 실행 시 `mkdir -p` + 700 을 스스로 한다(`release-inplace.sh:169-172` · `x1.cjs:102-131`). DB 백업(#441)은 DB 만 — 기억 파일은 백업 밖(초안이 이미 적음 · 넣을지는 사용자) |
| B-13 | `fileGuardStore` 를 기억 쓰기 원시 함수로 | **확인(형식 주의)** | 범용 `read()`/`write(text)` · 임시 600 → rename · 디렉터리 700(`identify-guard.ts:160-193`). **append 가 아니라 전체 덮어쓰기**이고 잠금이 없다 — 쓰는 프로세스가 통합 층 하나라 충분. "`.jsonl`" 은 덮어쓰기 전제로 적는다 |
| B-14 | C-1 정정(대화 채널 키는 메시지마다) | **확인** | `chat.ts:144,196-204`(`messageChannels` 함수 호출) · fin `discord-interactions.ts:40-41,89-90` · `platform-env.ts:118-152`(mtime 재읽기). `discord-inbound.sh:10` 이 이미 같은 말을 한다 |
| B-15 | C-4 정정의 `get_personal_records` 는 Garmin 경로가 아니다 | **확인** | `app/api/history/records/route.ts:3-5` — `lib/garmin/utils`(날짜 함수)만 import · 캐시 경유 |
| B-16 | C-6 · C-7 정정 | **확인** | fit `server.ts:746-749`(4301) · fin `claude-advisor.ts:808,840,958`(`duration=`) |
| B-17 | E 축 키 `DISCORD_BOT_TOKEN_ADVISOR` · `DISCORD_CHANNEL_ID_ADVISOR` 가 기존 패턴에 맞다 | **확인** | `platform-env.ts:29-30` · `check_env.py:41-44,49-51` · `release-inplace.sh:21`(`DISCORD_[A-Z_]*` 셸 키 정리 대상) |
| B-18 | Q137 `DISCORD_WEBHOOK_ADMIN` 재사용 | **확인** | 플랫폼 키 패턴 안 · fin 만 쓰는 키(TL §6-1) |
| B-19 | R-12 자식 env `DISABLE_AUTOUPDATER` 는 통합 층 자신만 막는다 | **확인** | 두 앱 `src` 에 `DISABLE_AUTOUPDATER` 0(`grep -rln DISABLE_AUTOUPDATER apps/finance/src apps/fitness/src deploy` → `deploy/advisor-x1/x1.cjs` · 시험만) — 앱 advisor 호출이 CLI 를 계속 갱신할 수 있다 |
| B-20 | 다중 사용자 세션 키 — 앱 현행과 충돌·이전 비용 (요청 5) | **확인(허용 목록은 A-8)** | 통합 층 세션 Map 은 새 프로세스의 것 · 앱 키 무변경 · 4c-2 에서 같은 채널 ID 를 두 프로세스가 쓰나 Map 이 달라 충돌 0 |

---

## 3. 대장(§0) 대조 — 요청 7

| 행 | 판정 | 확인 |
|---|---|---|
| N1 | 확인 | 011 §3-5 표 — 교차 0.11·0.09·0.12·0.18 · 대조 0.05·0.04 |
| N2 · N3 | 확인(출처 인용) | 011 `:152` · 표 `:138-144`. 참고: 6개 지연의 표본 중앙값은 (27.8+45.6)/2 = 36.7 s — 011 의 "p50 45.6" 은 상위 중앙값 정의다. 초안 문제는 아니고 011 출처 그대로 |
| N4 | 확인 | 92 + 46 = 138 · 24.33 + 12.16 = 36.49 — 011 `:123-125` |
| N5 | 확인 | 명시 호출부 7 = parser 2 + ai-review + briefing 2 + ta + active (TL §5) |
| N7 | 확인 | 25 + 34 = 59 · 27 + 1 = 28 · `grep -c '^\s*server\.tool($'` = 59 · 28 |
| N10 | 확인 | 5,001 + 1,077 + 1,816 = 7,894 · 13,226 + 7,894 + 12,513 = 33,633 · `wc -c` 재측 · 하네스 전체 32,979 재측 |
| N12 · P4 | 확인 | 8 = 구조 4 + P4 4 · 시험 6 열거 · 로컬 3 |
| N14 | 확인 | `wc -l` 135 · 148 · chat 비시험 11파일 1,653(열거 합 = 1,653) |
| N15 | 확인 | B-6 |
| N16 · P5 | 확인 | fin 1파일 3분기 + fit 2파일 2분기 = 3 · 5 · 줄 번호 재확인(fin `:148,149,174` · fit `free-text.ts:53` · `router.ts:52`) |
| N17 · N18 | 확인 | `grep -c '^model '` 30 · 22 · `wc -l` 788 · 124 · 33 |
| P1 · P3 | 확인 | 2.357 · 1.738 |
| P2 | **정정** | A-14 |
| D1 | 확인 | 1.00 ÷ 0.18 = 5.6 |
| D2 | **정정(근거)** | A-15 |

대장 밖 숫자가 본문에 새로 생긴 곳: 없음. 측정자 쪽 불일치 1건(초안 미인용 · 참고): RT §2-1 *"fit 명령 10"* 과 §1-2 *"명령 11"* — 실제 `.command(` 11(`grep -c '\.command(' apps/fitness/src/bot/discord/router.ts`).

---

## 4. 서버 조치 · 릴리즈 종류 — PR별 (요청 8)

| PR | 초안 | 판정 |
|---|---|---|
| 4a-1 | 없음 · minor/patch | 확인 — 단 고칠 곳에 X1 시험(A-4) |
| 4a-2 | 없음 · minor | 확인 — 같은 포트 · `.env` 무변경 · 경로 시험 추가(B-4) |
| 4a-3 | 없음 · minor | 3a 확인 · 3b 는 비교 절차 조건(A-5) |
| 4a-4 | 없음 · patch~minor | 확인 — fit 상한 신설은 동작 변경(상한 넘는 호출이 실패로 바뀜)이라 **minor** 로 고정 권고 |
| 4b-1 | 없음 · minor | 확인 — 고칠 곳 누락(A-9 · A-10) |
| 4b-2 | 사용자 키·봇 · 필수 키 아님 · minor | 확인(B-7) |
| 4b-3 | clone · 직접 실행 · minor 후보 | **정정** — minor 확정 + 서버 조치 칸에 env 일치(A-1) · 수집기 재설치(A-12) |
| 4b-4 | 없음 · minor | 확인(B-12) |
| 4c-1 | 없음 · minor | 확인 — 키 이름은 A-7 |
| 4c-2 | 플랫폼 키 · minor | **정정** — 범위가 새 앱 ↔ 통합 층 경로(A-6) |
| 4c-3 | 키 토글 | 확인 |

---

## 5. 요약

| 판정 | 수 | 항목 |
|---|---|---|
| **정정** | **15** | A-1 G7 배포 결합(env 일치 · 공용 forced command · 이름 접두) · A-2 릴리즈 종류 비대칭 · A-3 배포 락 · A-4 X1 시험 · A-5 크론 무영향 근거 · A-6 4c-2 판정 재현 불가 · A-7 스위치 키 정규식 · A-8 허용 목록 공유 · A-9 로컬 가드 순서 · A-10 셋째 앱 누락 4곳 · A-11 롤백 바닥 · A-12 수집기 재설치 · A-13 C-10 · A-14 P2 산술 · A-15 D2 근거 |
| **미확인** | **2** | 셋째 체크아웃의 서버 디스크 사용량(서버 · I-3) · resume 대화 턴별 비용(초안 §0-4 그대로 · 4b 로그) |
| **확인** | **35** | §2 표 B-1~B-20 = 20 · §3 대장 표의 확인 행 13(N1 · N2·N3 · N4 · N5 · N7 · N10 · N12·P4 · N14 · N15 · N16·P5 · N17·N18 · P1·P3 · D1) · 정정 항목 안의 확인 부분 2(A-5 SDK · A-7 분기·재읽기) |

정정이 있으므로 초안은 r2 로 돌아간다. 같은 주장이 두 번 정정된 것은 없다 — 다만 G 축 서술은 011(G1·G3) → r1(G7) 로 두 번 연속 "배포 경로에 무해" 쪽으로 기울었다(A-1 · 011 C-2). r2 는 G 옵션마다 **`release-inplace.sh` C1·C5 와 `ssh-deploy.sh` 에 무엇이 닿는지** 한 칸을 둔다.
