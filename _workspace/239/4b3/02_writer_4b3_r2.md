# 012 4b-3 설계 초안 (r2) — 통합 층 서버 배치 · G7 · 수동 실행만

- 2026-11-13 · 오케스트레이터 · 입력 `01_surveyor_4b3.md`(SV) · 1회차 감사 `03_auditor_4b3.md`(AU · 정정 9 · 문안 4 · 보충 9) · r1 `02_writer_4b3.md`
- **초안이다.** r1 대비 바뀐 곳은 각 행 끝 `[AU 정정 N]`·`[AU 문안 N]`·`[AU 보충 N]`.
- 소요는 시간 기록이 없어 등급으로 갈음한다(workflow 4절 R2).

---

## 0. 대장 (SV · AU 출처)

| # | 값 | 출처 |
|---|---|---|
| D1 | 배포 락 = `${PLEIADES_PRIVATE_DIR:-$HOME/pleiades-private}/deploy.lock` · `PLEIADES_PRIVATE_DIR` 은 release-inplace unset 목록 밖 · 저장소 안에서 이 키를 **설정**하는 곳 0(읽는 곳 6) · 서버 쪽(sshd environment · `.bashrc` 가드 앞 · pam_env) 미측정 | SV A-1 · AU §1 Q1 |
| D2 | fd 닫기 `nolock() { "$@" 9>&-; }` · pm2 데몬은 pm2 CLI 를 띄운 프로세스의 fd 를 물려받는다 | SV A-1 `:45` · AU Q2 |
| D3 | C1·C5 `env_same` = 모든 `pleiades-*` 의 `PLEIADES_ENV_FILE` 만 · `app_procs`·online 3 = `pleiades-<app>-` 만 | SV A-1 · AU Q7·(a) |
| D4 | LONG_RUNNING `kill_timeout 15000` 외 · pm2 기본 `kill_timeout` 1600 ms · 기본 종료 신호 **SIGINT** · `treekill` 기본 true(**트리 전체**) — 로컬 pm2 7.0.4 소스 · 서버 pm2 버전 미측정 | SV A-3 · AU 정정 5 |
| D5 | `pm2 restart`(옵션 없음)는 저장된 env · 셸 env 가 들어가는 길 = `--update-env` · `start` · `startOrRestart` | AU 정정 4 · `discord-inbound.sh:92,112` |
| D6 | `pm2 dump` 는 `pm2_env` 통째를 저장(resurrect 가 같은 env) — pm2 7.0.4 소스 | AU Q6 |
| D7 | 질문 상한 10분 · 호출당 $1.00 · 하루 $5.00 · `DailySpend.add` 는 0 이하 무시(`spend.ts:63`) · 비용 보고 없고 init 실패 아니면 $1.00 으로 셈(`bot.ts:57-62`) · 상한 판정은 질문 전 `read()`(`bot.ts:81-82`) · chat watchdog 10분 | SV B-9 (c) · AU 정정 6·8 · Q3 |
| D8 | 자식 env = 상속 + 거부 4 + 고정 5 | SV B-9 (a) |
| D9 | 지식 base 576 B · fin 7,904 · fit 기본 12,509 · 도메인 상한 32,000 · 두 도메인 상한 합계 ≈ 64.6 KB | SV B-9 (b) · AU §5 |
| D10 | chat 치명 4014 = 로그 1줄 · 강등 분기(`gateway.ts:294-302`)가 FATAL(`:303-308`) 보다 먼저 · fin·fit 은 `fallbackIntents: 0` → 강등 | SV B-9 (d) · AU Q4 |
| D11 | 설정 검사 = CLI cwd 의 **모든 조상** `.claude/settings*.json` 을 project 로 읽고 `claudeDir` 과 같은 위치만 뺀다 · project 행의 `enabledPlugins` 는 막는다 · 서버 user settings 에 플러그인 켬 | `settings.ts:61-65,79-80` · AU 정정 1 |
| D12 | 생존 표지 `apps/advisor/logs/alive-adv.json` · 통합 층 로그는 stdout | SV B-9 (f) · AU 문안 2 |
| D13 | 수집기: adv 를 넣을 곳 7 · `all-missing` = `APPS × ROLES` 전체 부재 · 감시 대상 프로세스 없음 = `missing` 장애 · 표지 파일 ENOENT = 정상 | SV A-6 · AU 정정 2·3 |
| D14 | claude 탐색 = PATH 만 | SV B-8 |
| D15 | 서버 CLI 2.1.311 · `--system-prompt-file` 서버 미측정 | SV B-10 · C |
| D16 | 통합 층은 **자기 체크아웃의** `apps/*/domain.json`·`models.ts` 를 읽는다 | AU 보충 4 · `domains.ts:51-52` · `cli.ts:29-31` |
| D17 | `runCli` 는 자식 핸들을 밖으로 내지 않는다 · SIGTERM/SIGINT → `handle.stop()` 뿐 | AU 보충 6 · `cli.ts:120-170` · `main.ts:67-74` |
| D18 | release-inplace 는 비태그 HEAD 를 거부(`:186`) · 본문 함수 + 마지막 줄 main(자기 교체 대비 `:18-19,360`) · clone 직후 HEAD = `dev` | AU 보충 1 |
| D19 | fin·fit 봇 번들이 chat dist 를 인라인 — chat 변경 = 두 앱 다음 릴리즈 재빌드·재기동 | AU 정정 7 |

---

## 1. 범위

**하는 것:** 셋째 체크아웃에서 통합 층을 띄우고 내리는 **사용자 수동 실행 스크립트**와 가드(G-R1~R3) · pm2 정의 · 시험 · 런북 · 수집기 adv 감시 · 4b-2 가 넘긴 6항목.
**하지 않는 것:** 자동 배포(4b-5) · 구조 4파일 변경 · 로컬 pm2 리허설 · 배포 쪽 `flock -w` · **CLI 설정 위치 분리**(§3 — 코드·근거가 필요해 별건).

---

## 2. 결정 항목

| # | 항목 | 권고 | 되돌리기 |
|---|---|---|---|
| **B1** | 기동 env 고정(G-R1′) | 스크립트는 `PLEIADES_PRIVATE_DIR` 이 **설정돼 있으면 거부** · `PLEIADES_ENV_FILE="$HOME/pleiades-platform.env"` export(release-inplace 와 같은 `PLEIADES_KEYS` unset 뒤) · **같은 락 파일 런타임 확인:** `$HOME/pleiades-private/inplace-fin-last-ok` 와 `-fit-last-ok` 가 둘 다 있어야 진행(Actions 배포가 같은 위치를 쓴다는 증거 · 없으면 rc 1 "배포 기록이 다른 위치")[AU 보충 3] · 기동 뒤 `pm2 jlist` 로 adv 의 `PLEIADES_ENV_FILE` 일치 · `PLEIADES_PRIVATE_DIR` 부재 재확인 | 스크립트 **중간** |
| **B2** | 셋째 체크아웃 | **`~/pleiades-adv`** · 스크립트는 자기 루트가 `$HOME/pleiades-adv` 가 아니면 거부 | 이름 변경 = 서버 이동 + 수집기 재설치 **중간** |
| **B3** | 위치 | `deploy/advisor/adv-inplace.sh` · `deploy/advisor/pleiades-adv.config.cjs` · 시험 `deploy/test_adv_inplace.py`(최상위) · release-inplace A 단계 중단 조건에 걸리지 않는다(정보 줄만 · AU Q8 확인) | **즉시**(문서·이동) |
| **B4** | 자식 env | **허용 목록:** `HOME` · `PATH` · `USER` · `LOGNAME` · `SHELL` · `LANG` · `LC_*` · `TZ` · `TMPDIR` · `TERM` · `CLAUDE_CONFIG_DIR` · (있을 때만) `ANTHROPIC_API_KEY` · `CLAUDE_CODE_OAUTH_TOKEN` + 고정 5. 인증 키를 빠뜨리면 질문 실패 — 사용액 **0 또는 $1.00**(결과 줄에 비용이 없으면 · D7) · 5회면 그날 상한이 닫힌다(fail-closed) · 런북 첫 질문 판정에 `cost=` 확인 [AU 정정 8] | 코드 **중간** |
| **B5** | 지식 전달 | argv 유지 + **합계 가드**: `buildSystem` 결과 > 100,000 B 면 그 질문 거부(모델 호출 전 · 사용액 0 — 예약 전에 판정) · 시험: 두 도메인 상한 합계 < 100,000 · 도메인 #3 이 가드에 닿으면 그때 `--system-prompt-file`(서버 실측 뒤) | 코드 **중간** |
| **B6** | CLI 설정 위치 | **공유 유지**(지금 그대로 · 코드 0) — §3 | — |
| **B7** | 종료·사용액 | **예약 후 차분 정산** [AU 정정 5·6 · 보충 5·6]: ① 상한 판정(`read()`) → 합계 가드(B5) → **`reserve(date)` = `usd += 호출당 상한`** — 쓰기 실패면 질문 시작 안 함(거부 문구) ② 답이 오면 **`settle(date, 실제 − 상한)`** 차분 1회(음수 허용 · 0 미만으로는 안 내려간다) — 파일 형식 무변경이라 4b-2 판으로 revert 해도 과다 쪽만 남는다 ③ 종료: pm2 는 **SIGINT 를 트리 전체**(자식 `claude` 포함)에 보낸다(D4) → 새 질문 거절 → 진행 중 질문은 `runCli` close 를 **최대 10초** 기다림(자식이 안 끝나면 `runCli` SIGKILL 경로) → 정산 → `process.exit` · pm2 `kill_timeout 15000` · 정산 못 하고 끝나면 예약($1.00)이 남는다(과다 쪽) ④ 배선: `runCli` 에 `AbortSignal` · 진행 중 Promise 노출 — **`cli.ts` · `advisor.ts` · `bot.ts` · `main.ts` · `spend.ts` 5파일 + 시험** ⑤ 자정 넘김 = 예약한 `date` 로 정산 | 코드 **중간** |
| **B8** | 4014 알림 | chat 에 선택 콜백 `onFatalClose(code)` — FATAL 분기 **안**에서 · `notifyFallback` 처럼 예외·거부를 삼킨다 · `chat.ts` 옵션 타입·gateway 전달 2곳 · 두 앱은 넘기지 않음(동작 무변경 — 강등 분기가 먼저 · AU Q4) · 통합 층이 `DISCORD_WEBHOOK_ADMIN` 으로 1회 알림. **chat 변경은 fin·fit 번들에 들어간다**(D19) → **별 PR**(4b-3a1) · 두 앱 다음 릴리즈에 재빌드·재기동 [AU 정정 7] | 패키지 revert **중간**(두 앱 재배포를 부른다) |
| **B9** | 수집기 | 앱별 역할 `{ fin:[web,bot,mcp], fit:[web,bot,mcp], adv:[bot] }` · **adv 감시 조건 = `$PRIVATE/inplace-adv-last-ok` 있음 AND `$PRIVATE/inplace-adv-stopped` 없음**(clone 직후·`stop` 뒤 = 판정 0) [AU 정정 2] · **`all-missing` 은 fin·fit 기대 목록으로만**[AU 정정 3] · `LOG_NAME` 에 `adv-bot` — **크래시 stderr 만**(통합 층 로그는 stdout · 4014 는 B8 알림과 `alive-adv` stale 이 맡는다)[AU 문안 2] · health·glob-empty 는 adv 건너뜀 · 배포 보류 `inplace-adv-pending`(같은 규칙) · alive 경로 그대로 | 코드 **중간** · 서버 재설치 |
| **B10** | claude 탐색 | 스크립트가 `command -v claude`(없으면 `$HOME/.local/bin/claude`)로 찾아 **그 디렉터리를 PATH 앞에** 둔 셸로 `start --update-env` · 못 찾으면 rc 1 · 양식에 경로·`--version` | 스크립트 **중간** |
| **B11** | 태그 엇갈림 [AU 보충 4] | 양식에 `adv V · fin last-ok · fit last-ok` 한 줄 · 다르면 (주의) 줄(중단 아님) · 런북 "두 앱과 같은 태그로" | **즉시** |

---

## 3. CLI 설정·세션 기록 위치 (r1 U-1 재작성 · [AU 정정 1 · 문안 1])

| 선택 | 무엇이 달라지나 | 비용 | 되돌리기 |
|---|---|---|---|
| **(b) 공유 유지** ★ | 지금(X1 · 4b-2)과 같다 · 세션 기록은 `~/.claude/projects/<work 경로 인코딩>` 에 따로 쌓이지만 **같은 루트 아래에 있고 개발용 정리·동기화 대상과 같은 위치** · 개발용 user settings 에 hooks 가 생기면 모든 질문 거부(fail-closed · 멈추지만 안전) | 코드 0 · 서버 조치 0 | — |
| (a) 분리 | 전용 `CLAUDE_CONFIG_DIR` · 개발 환경 변경이 통합 층을 멈추지 않는다 | **env 만으로는 안 된다** — 설정 검사가 조상 경로의 `~/.claude` 를 project 범위로 읽어 서버의 켜진 플러그인 때문에 **모든 질문 거부**(`settings.ts:61-65,79-80`). `settings.ts` 의 `$HOME/.claude` 처리 변경 + 그 안전 근거(CLI 가 `--setting-sources project` 에서 `~/.claude` 를 조상 project 로 읽는지 — **모델 호출 없이는 판정 불가**)가 필요 · 서버 로그인 1회 | 코드 **중간** · 근거 미측정 |

권고 (b): 4b-3 에서 코드·근거 없이 바로 쓸 수 있다. 개발용 hooks 로 질문이 멈추면 관리자 알림이 아니라 거부 문구로 드러난다 — 그때 (a) 를 별건으로.

---

## 4. 스크립트 `deploy/advisor/adv-inplace.sh`

```
사용: adv-inplace.sh <vX.Y.Z> [--dry-run] [--yes]
      adv-inplace.sh stop [--yes]
rc: 0 통과 · 1 바꾸기 전 중단 · 2 사용법 · 4 바꾼 뒤 실패
```

**구조:** 본문 전체를 함수로 두고 마지막 줄에서 `main "$@"; exit $?`(자기 교체 대비 · release-inplace `:18-19,360` 과 같은 꼴)[AU 보충 1] · 락을 잡은 뒤 **나머지 본문을 `( … ) 9>&-` 서브셸 하나로 감싸** 자식 전부가 fd 9 없이 돈다 — 락 보유는 바깥 셸만(flock 은 바깥이 끝날 때 풀린다)[AU 정정 9].

| 단계 | 하는 일 | 실패 |
|---|---|---|
| 0 | Darwin = `--dry-run` 만 · 루트 = `$HOME/pleiades-adv`(B2) · 루트 `package.json` name `pleiades` | rc 1 |
| C1 | `PLEIADES_KEYS` unset(release-inplace 와 같은 문자열) → `PLEIADES_PRIVATE_DIR` 설정 시 거부 → `PLEIADES_ENV_FILE` export · 600 → **같은 락 위치 확인**(fin·fit last-ok · B1) → claude 찾기(B10) → **`env_same` 사전 대조**(release-inplace C1 과 같은 식 · adv 가 아직 없으면 그 줄만 빠진다 · fin·fit 이 DIFF/MISSING 이면 여기서 rc 1)[AU 보충 2] | rc 1 |
| L | `exec 9>>"$HOME/pleiades-private/deploy.lock"; flock -n 9`(`--dry-run` 은 안 잡음) | rc 1 |
| A | `git -c maintenance.auto=false -c gc.auto=0 fetch --no-tags origin tag V`[AU 보충 8] · 깨끗 · last-ok/pending · 같은 태그 + last-ok = "이미 배포됨" rc 0 · **last-ok 없음 + 비태그 HEAD = 첫 실행**(허용 · 양식에 "첫 실행 — HEAD <브랜치>")[AU 보충 1] · last-ok 있음 + 비태그 HEAD = rc 1 | rc 1 |
| C2 | pending 쓰기 → `git checkout V` | — |
| C3 | 루트 `npm ci` → chat ci → chat tsc → `apps/advisor` `npm ci` → `npm run build` | rc 4 |
| C4 | `node dist/advisor.cjs probe` → 출력을 양식에(락 `busy` = "자기 락" 표기 · 모델 호출 0 · `<private>/advisor/`·`work/` 생성 · 핀 불일치 rc 1 → 여기서 rc 4) | 도메인 0 · probe rc ≠ 0 → rc 4 |
| C5 | `cd apps/advisor` → `pm2 delete pleiades-adv-bot`(있으면) → `pm2 start ../../deploy/advisor/pleiades-adv.config.cjs --only pleiades-adv-bot --update-env` → `pm2 save --force` | rc 4 |
| C6 | 30초 뒤 `pm2 jlist`: adv online · cwd `$ROOT/apps/advisor` · `PLEIADES_ENV_FILE` 같음 · `PLEIADES_PRIVATE_DIR` 부재 · **전체 `env_same`** · 키가 있으면 `alive-adv.json` 수정 시각 > 기동 시각(없으면 "키 없음 — 기다리는 중" 정보 줄) · B11 태그 줄 | rc 4 |
| 끝 | last-ok = V · pending · `-stopped` 삭제 · 판정 양식 | — |
| stop | C1 → L → `pm2 delete pleiades-adv-bot` → `pm2 save --force` → `inplace-adv-stopped` 쓰기 · `apps/advisor/logs/alive-adv.json` 삭제[AU 정정 2] · last-ok 유지 | rc 1 |

- 판정 양식 틀은 release-inplace 와 같다 · 원본 로그 `~/pleiades-private/inplace-adv-<시각>.log`(umask 077).
- 되돌리기 = 직전 태그로 재실행(양식에 last-ok) · 정지 = `stop`(**즉시** · 수집기 장애 0).

**pm2 정의:** 이름 상수 `pleiades-adv-bot` 하나 · `script dist/advisor.cjs` · `args bot` · cwd `apps/advisor`(파일 위치 기준 절대경로) · D4 LONG_RUNNING 값(`kill_timeout 15000` **필수** — 기본 1600 ms) · `env` 에 `PLEIADES_ENV_FILE` 없음.

---

## 5. 시험

**`deploy/test_adv_inplace.py`** — 격리: `HOME` 을 임시 디렉터리로 바꾸고 `FakeRoot` 를 `$HOME/pleiades-adv` 에 만든다(B1 이 `PLEIADES_PRIVATE_DIR` 을 거부하므로) · flock 은 release-inplace 시험의 가짜 flock(`test_release_inplace.py:518-541`) 또는 `PLEIADES_TEST=1` mkdir 폴백과 같은 방식 · PATH 스텁 pm2·npm·node·git·uname [AU 보충 9]
1. G-R2: 설정 파일 이름 = `pleiades-adv-bot` 하나 · `pleiades-fin-`·`pleiades-fit-` 문자열 0.
2. **G-R3 동적:** PATH 스텁 `pm2`·`npm`·`npx`·`node` 가 `[ -e /dev/fd/9 ]` 이면 기록하고 실패 → 배포·`stop` 경로 전체에서 기록 0 [AU 정정 9]. **정적 보조:** 락 뒤 본문이 `) 9>&-` 로 닫히는 서브셸 안에 있다.
3. G-R1: `PLEIADES_ENV_FILE="$HOME/pleiades-platform.env"` 리터럴 · `PLEIADES_KEYS` 가 release-inplace 와 **문자열 동일**(두 파일에서 추출 비교) · `PLEIADES_PRIVATE_DIR` 설정 → rc 1 · fin·fit last-ok 없음 → rc 1.
4. 락: 잡혀 있으면 rc 1.
5. C1 사전 대조: 스텁 jlist 에 fin DIFF → rc 1(바꾸기 전 · checkout 안 함).
6. 첫 실행: last-ok 없음 + HEAD `dev` → 진행 · last-ok 있음 + 비태그 → rc 1.
7. `stop`: `-stopped` 생성 · alive 표지 삭제 · last-ok 유지.
8. 금지: `ssh` · `--tags` · `pm2 (kill|resurrect)` · `delete all`·`stop all` · `git clean` · `release-inplace.sh`·`pleiades.config.cjs` 참조 0.
9. `--dry-run`: 단계 문자열 · 락 안 잡음 · rc 0.

**앱·패키지(8절 `apps/advisor` · pleiades 행):** B4 허용 밖 키 0 · B5 합계 가드(예약 전 거부 · 사용액 0) · B7 `reserve`→`settle` 차분 · 예약 쓰기 실패 → 거부 · 예약 상태 종료 = $1.00 남음 · 자정 넘김 · 종료 신호 → 새 질문 거절 · 10초 유예 · B8 `onFatalClose` 넘기면 1회 · 예외 삼킴 · 안 넘기면 지금 동작 · fin·fit 강등 경로 무변경.

**수집기(`deploy/test_ops_collect.py`):** adv last-ok 없음 = 판정 0 · `-stopped` 있음 = 판정 0 · 감시 중 bot 없음 = missing · fin·fit 6개 부재 + adv 생존 = `all-missing` 1건 · LOG_NAME adv-bot · health·glob-empty 건너뜀 · 기존 시험 무변경.

---

## 6. PR 나누기 (4)

| PR | 범위 | 리뷰 | 되돌리기 |
|---|---|---|---|
| **4b-3a1** | chat `onFatalClose`(B8 패키지 쪽) · 시험 · **fin·fit 동작 무변경** — 다음 릴리즈에 두 앱 재빌드 | 9-1 필수 · focus 에 fin·fit `discord-interactions.ts` 의 `createChat` 호출부 | revert **중간**(두 앱 재배포) |
| **4b-3a2** | advisor: B4 · B5 · B7(5파일) · B8 알림 연결 | 9-1 필수 | revert **중간**(띄우는 곳 0) |
| **4b-3b** | `deploy/advisor/` 스크립트 · pm2 정의 · 시험 · 런북 `docs/runbooks/advisor-inplace.md`(clone · 실행 · 판정 · `stop` · **"스크립트 밖에서 `pm2 start`·`--update-env` 로 띄우지 않는다(옵션 없는 `pm2 restart` 는 저장 env 그대로)"**[AU 정정 4] · 012 §3-4 위반 결과 표 · 첫 질문 `cost=` 확인 · 같은 태그) · `release-inplace.md` C1 복구 줄("`pleiades-adv-bot` DIFF/MISSING → adv 스크립트로 재기동")[AU 보충 7①] | 9-1 필수(외부 프로세스·서버) | revert **중간** |
| **4b-3c** | 수집기 B9 · `ops-collector.md` REF·SHA · adv 판정 줄 | 9-1 필수 | revert **중간** · 서버 재설치 |

순서: 4b-3a1 → 4b-3a2 → 4b-3b → 4b-3c → **릴리즈 minor**(서버 조치 칸 "선택 — 통합 층을 띄우려면 런북 · 없으면 무영향 · 수집기 재설치").
**문서 동기화(마지막 PR 또는 인계)**[AU 보충 7]: 012 §0-5 배포 락 사용처에 `adv-inplace.sh`(배포·`stop`) · `discord-inbound.sh` 행 대조 · 012 §8 4b-3 행 "`collect.cjs` 분기 1" → 7곳 + 감시 조건[AU 문안 3] · 012 G-R1 근거 문장(옵션 없는 restart 는 저장 env)[AU 정정 4] · `measured-facts.md`(pm2 SIGINT·treekill·dump) · `workflow.md` 8절 `deploy/` 행 · `CLAUDE.md`.

**서버 조치(사용자 · 전부 선택):** ① `git clone https://github.com/fomalhaut84/pleiades.git ~/pleiades-adv` ② 운영 Discord 통합 봇·채널 · 플랫폼 키 2 ③ `bash ~/pleiades-adv/deploy/advisor/adv-inplace.sh vX.Y.Z` → 판정 양식 ④ 수집기 재설치(REF·SHA 는 머지 뒤 Claude) ⑤ 첫 질문 1회(`cost=` 줄).

---

## 7. 남는 위험

| # | 위험 | 대응 |
|---|---|---|
| W1 | 사용자가 스크립트 밖에서 `pm2 start`·`--update-env` 로 adv 를 다른 셸 env 로 띄움 | 런북 금지 · 다음 fin·fit 배포 C1 rc 1(바꾸기 전)로 드러난다 · 복구 = 스크립트 재실행 [AU 정정 4] |
| W2 | 재부팅 resurrect | `pm2_env` 통째 저장(pm2 7.0.4 소스) · 두 앱과 같은 메커니즘 · 서버 pm2 버전 미측정 [AU 문안 4] |
| W3 | §3-5 잔여 겹침 | 4b 에서 수용 |
| W4 | B4 허용 목록이 서버 인증 키를 빠뜨림 | 첫 질문 `cost=` · 최악 그날 상한 닫힘($5.00) |
| W5 | probe 의 "busy" 오해 | 양식 "자기 락" |
| W6 | 개발용 user settings 에 hooks → 전 질문 거부(§3 (b)) | fail-closed · 거부 문구로 드러난다 · (a) 별건 |
| W7 | `git fetch` 자동 유지보수가 fd 9 를 잠깐 보유 | `-c maintenance.auto=false -c gc.auto=0` + 서브셸 `9>&-` |
