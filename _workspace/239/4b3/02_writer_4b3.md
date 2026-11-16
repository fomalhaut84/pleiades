# 012 4b-3 설계 초안 (r1) — 통합 층 서버 배치 · G7 · 수동 실행만

- 2026-11-13 · 오케스트레이터 작성 · 입력 `01_surveyor_4b3.md`(이하 SV) · 정본 012 §3-3 G7 · §3-4 G-R1~R3 · §3-5 · §8 4b-3 행 + 진행 블록("4b-3 으로 넘긴 것" 6)
- **초안이다. 정본 아님.** 감사(`03_auditor_4b3.md`) 정정 0 뒤 012 §8 아래 정정·확정 블록으로 옮긴다.
- 소요는 실작업 시간 기록이 없어 등급으로 갈음한다(workflow 4절 R2).

---

## 0. 대장 (이 초안이 쓰는 숫자 — 전부 SV 출처)

| # | 값 | 출처 |
|---|---|---|
| D1 | 배포 락 = `${PLEIADES_PRIVATE_DIR:-$HOME/pleiades-private}/deploy.lock` · `PLEIADES_PRIVATE_DIR` 은 release-inplace 의 unset 목록 밖 | SV A-1 `:173` `:21` |
| D2 | fd 닫기 = `nolock() { "$@" 9>&-; }` · release-inplace 에 "모든 pm2 호출에 9>&-" 정적 시험 0 | SV A-1 `:45` · A-7 |
| D3 | C1 = 모든 `pleiades-*` 의 `PLEIADES_ENV_FILE` 이 `$HOME/pleiades-platform.env` 와 같고 n_bad 0 · C5 같은 대조 | SV A-1 `:85-94,244-248,346-351` |
| D4 | 두 앱 LONG_RUNNING `kill_timeout 15000` · `max_memory_restart 512M` · `min_uptime 30000` · `exp_backoff_restart_delay 100` | SV A-3 `:64-71` |
| D5 | `pleiades.config.cjs` `cwdApp()` 는 fin·fit 외 cwd 에서 throw | SV A-3 `:13,20-25` |
| D6 | 통합 층 실행 = cwd `apps/advisor` 에서 `node dist/advisor.cjs bot` · `probe` 는 모델 호출 0 | SV B-8 · `main.ts:4,22` |
| D7 | 질문 상한 10분 · 호출당 상한 $1.00 · 하루 $5.00 · 사용액은 답이 온 **뒤**에만 기록 | SV B-9 (c) · `cli.ts:13` · `bot.ts:92-97` |
| D8 | 자식 env = 상속 + 거부 4(정규식) + 고정 5 | SV B-9 (a) `cli.ts:44-57` |
| D9 | 지식: base 576 B · fin 7,904 B · fit(코드 기본값) 12,509 B · 도메인 상한 32,000 B · Linux 단일 인자 131,072 B | SV B-9 (b) |
| D10 | chat 치명 4014 = 로그 1줄 · 콜백 없음 · 통합 층은 fallback 없음 | SV B-9 (d) `gateway.ts:289-309` |
| D11 | 통합 층은 `CLAUDE_CONFIG_DIR` 을 설정하지 않는다(상속 · 없으면 `~/.claude`) · 설정 검사는 그 위치의 hooks·`mcp__` allow·와일드카드 allow 가 있으면 전 질문 거부 | SV B-9 (e) |
| D12 | 생존 표지 `apps/advisor/logs/alive-adv.json`(cwd 상대) · READY·RESUMED 즉시 · ACK 60초에 1회 | SV B-9 (f) |
| D13 | 수집기에 adv 를 넣을 곳 7 | SV A-6 |
| D14 | claude 탐색 = PATH 만(`~/.local/bin` 폴백 없음) | SV B-8 · `cli.ts:84-95` |
| D15 | 서버 CLI 2.1.311 · 서버 `--system-prompt-file` 미측정 · 로컬 2.1.323 help 독립 항목 없음 | SV B-10 · C |
| D16 | `deploy` 시험 508 통과 · 건너뜀 1 · 로컬 10분 28초 | SV A-7 실행 결과 |

---

## 1. 범위

**하는 것:** 셋째 체크아웃에서 통합 층을 띄우고 내리는 **사용자 수동 실행 스크립트**와 그 가드(G-R1~R3) · 통합 층 pm2 정의 · 시험 · 런북(판정 양식) · 수집기 adv 감시 · 4b-2 가 넘긴 6항목.
**하지 않는 것:** 자동 배포(4b-5 · G-R4) · 구조 4파일(`deploy.sh` · `release-inplace.sh` · `pleiades.config.cjs` · `ssh-deploy.sh`) 변경 · 로컬 pm2 리허설(012 §4-3) · 배포 쪽 `flock -w`(§3-5).

---

## 2. 결정 항목 (SV "설계가 정해야 할 것" 10 → 권고)

| # | 항목 | 권고 | 대안 | 되돌리기 |
|---|---|---|---|---|
| **B1** | 기동 env 고정 범위(SV 1 · D1) | **G-R1 확장(G-R1′):** 스크립트는 `PLEIADES_PRIVATE_DIR` 이 **설정돼 있으면 거부**한다(release-inplace 의 기본 경로와 같은 파일을 보게) · `PLEIADES_ENV_FILE` 은 release-inplace 와 같은 문자열로 export · 기동 뒤 `pm2 jlist` 로 둘 다 다시 확인(`PLEIADES_PRIVATE_DIR` 부재 · `PLEIADES_ENV_FILE` 일치) | (b) 스크립트가 unset 하고 진행 — 사용자가 의도해 둔 값을 조용히 바꾼다 | 스크립트 가드 **중간**(revert) |
| **B2** | 셋째 체크아웃 이름(SV 2) | **`~/pleiades-adv`**(두 앱 `~/pleiades-<app>` 규칙) · 스크립트는 자기 위치가 `$HOME/pleiades-adv` 가 아니면 거부(다른 체크아웃에서 잘못 돌려 fin·fit 체크아웃을 checkout 하는 것을 막는다) | 이름 자유 + 인자 | 이름 바꾸기 = 서버 이동 + 수집기 재설치 **중간** |
| **B3** | 스크립트 위치(SV 3) | **`deploy/advisor/`**(`adv-inplace.sh` · `pleiades-adv.config.cjs`) · 시험은 `deploy/test_adv_inplace.py`(최상위 — `unittest discover -s deploy` 가 하위 디렉터리를 패키지 없이 찾지 않으므로) · 결과: fin·fit 양식 A 줄 `deploy/ 변경` 숫자에 섞인다(정보 줄 · 중단 조건 아님 SV A-1) | `tools/advisor/` — 8절 `deploy/` 행 밖 | 위치 **즉시**(문서 · 이동 PR) |
| **B4** | 자식 env(SV 4 · D8) | **허용 목록으로 바꾼다:** `HOME` · `PATH` · `USER` · `LOGNAME` · `SHELL` · `LANG` · `LC_*` · `TZ` · `TMPDIR` · `TERM` · `CLAUDE_CONFIG_DIR` · **CLI 인증 키(있을 때만 그대로)** `ANTHROPIC_API_KEY` · `CLAUDE_CODE_OAUTH_TOKEN` + 고정 5. 그 밖(`PLEIADES_*` · `DISCORD_*` · pm2 주입 키 · `DATABASE_URL` …)은 넘기지 않는다 · 시험: 허용 밖 키가 0 · 거부 목록 시험은 허용 목록 시험으로 대체 | 거부 목록 유지 | 코드 **중간** · 인증 키를 빠뜨리면 질문 실패(모델 호출 전 실패 → 사용액 0) — 런북 첫 질문 확인이 잡는다 |
| **B5** | 지식 전달(SV 5 · D9 · D15) | **argv 유지 + 합계 가드:** `buildSystem` 결과가 **100,000 B 를 넘으면 그 질문을 거부**(사용액 0 · 관리자 알림 1회/일) · 시험: 2 도메인 상한 합계 < 100,000 · 도메인 #3 이 붙어 가드에 닿으면 그때 `--system-prompt-file`(서버 CLI 실측 뒤) | 지금 `--system-prompt-file` — 서버 2.1.311 미측정 · help 비공개 옵션이라 CLI 업데이트에 약하다 | 코드 **중간** |
| **B6** | `CLAUDE_CONFIG_DIR` 분리(SV 6 · D11) | **사용자 결정 U-1** — 아래 §3 | — | env 한 줄 **즉시** · 기록 이전 **중간** |
| **B7** | 종료 처리(SV 7 · D7) | **예약 후 정산:** 질문 시작 전에 호출당 상한($1.00)을 하루 사용액에 **예약**하고 답이 오면 실제 비용으로 고친다(init 실패 = 0 으로 고침) → 강제 종료·크래시에도 상한 쪽으로 기록된다(fail-safe) · SIGTERM: 새 질문 거절 → 진행 중 자식 `claude` 에 SIGTERM → 최대 10초 기다림 → 종료 · pm2 `kill_timeout 15000`(D4 와 같음) · 예약 상태에서 끝나면 그 $1.00 은 그대로 남는다(과다 기록 쪽) | (b) 진행 중 질문을 10분까지 기다림 — `kill_timeout` ≥ 600,000 · 배포가 10분 늘어진다 | 코드 **중간** · 사용액 파일 형식 변경(예약 필드) — 4b-2 파일과 호환(필드 추가만) |
| **B8** | 4014 알림(SV 8 · D10) | **chat 에 선택 콜백 `onFatalClose(code)`** 추가(넘기지 않으면 지금과 같음 — 두 앱 무변경 · 시험으로 고정) · 통합 층이 `DISCORD_WEBHOOK_ADMIN` 으로 1회 알림 · 수집기 `alive-adv` stale(10분)은 보조 | 수집기만 — 10분 늦고 원인(4014)을 모른다 | 패키지·코드 **중간** |
| **B9** | 수집기(SV 9 · D13) | **앱별 역할 집합** `{ fin:[web,bot,mcp], fit:[web,bot,mcp], adv:[bot] }` · adv 는 **`~/pleiades-adv/apps/advisor` 디렉터리가 있을 때만 감시**(없으면 adv 판정 0 · 장애 아님 — "없으면 통합 층만 안 뜬다") · `LOG_NAME` 에 `adv-bot` · health·glob-empty 는 adv 건너뜀 · 배포 보류는 `inplace-adv-pending`(스크립트가 같은 규칙으로 쓴다) · alive 경로는 그대로 맞는다 | adv 를 감시하지 않는다 — 4014·크래시가 안 보인다 | 코드 **중간** · 서버 재설치(REF·SHA) |
| **B10** | claude 탐색(SV 10 · D14) | 스크립트가 기동 전에 `command -v claude`(없으면 `$HOME/.local/bin/claude`)로 찾고 **그 디렉터리를 pm2 env PATH 앞에** 둔다 · 못 찾으면 기동 거부(rc 1) · 판정 양식에 경로·`--version` 1줄 | 코드에 폴백 추가(X1 방식) — 서버 경로 지식이 코드로 들어간다 | 스크립트 **중간** |

---

## 3. 사용자 결정 U-1 — CLI 설정·세션 기록 위치

| 선택 | 무엇이 달라지나 | 서버 조치 | 되돌리기 |
|---|---|---|---|
| **(a) 분리** ★ | 통합 층 전용 `~/pleiades-private/advisor/claude-config`(700). 세션 기록(대화 · 시스템 프롬프트 스냅샷 = 도메인 지식)이 개발용 `~/.claude` 와 섞이지 않는다 · 개발용 플러그인·hooks 변경이 통합 층 질문을 막지 않는다(11-12 #639 교훈) · 설정 검사가 빈 디렉터리를 본다 | **사용자: 그 디렉터리로 CLI 로그인 1회**(`CLAUDE_CONFIG_DIR=… claude` → `/login`) · 토큰이 하나 더 생긴다 | env 한 줄 **즉시** · 기록 이전 **중간** |
| (b) 공유 유지 | 지금(X1 · 4b-2)과 같다 · 개발용 user settings 에 hooks 가 생기면 모든 질문 거부(fail-closed · 안전하지만 멈춘다) · 기록이 개발용과 섞인다 | 없음 | — |

권고 (a): 서버 조치 1회로 개발 환경과 통합 층이 서로를 멈추지 않는다. (a) 의 인증 저장 위치가 그 디렉터리인지는 서버에서 **로그인 뒤 첫 질문**으로만 확인된다(미측정 · 런북 판정 줄).

---

## 4. 스크립트 `deploy/advisor/adv-inplace.sh`

```
사용: adv-inplace.sh <vX.Y.Z> [--dry-run] [--yes]
      adv-inplace.sh stop [--yes]
rc: 0 통과 · 1 바꾸기 전 중단 · 2 사용법 · 4 바꾼 뒤 실패(release-inplace 와 같은 뜻)
```

| 단계 | 하는 일 | 가드 |
|---|---|---|
| 0 | Darwin = `--dry-run` 만 · 자기 위치 `$HOME/pleiades-adv` (B2) · 루트 `package.json` name `pleiades` | rc 1 |
| C1 | release-inplace 와 **같은** `PLEIADES_KEYS` unset → `PLEIADES_PRIVATE_DIR` 설정돼 있으면 거부(B1) → `export PLEIADES_ENV_FILE="$HOME/pleiades-platform.env"` · 600 확인 · claude 찾기(B10) | rc 1 |
| L | `exec 9>>"$HOME/pleiades-private/deploy.lock"; flock -n 9` (G-R3 · `--dry-run` 은 잡지 않는다) | 못 잡으면 rc 1 |
| A | `git fetch --no-tags origin tag V` · 깨끗 · last-ok/pending 읽기 · 같은 태그 + last-ok 면 "이미 배포됨" rc 0 | rc 1 |
| C2 | pending 쓰기 → `git checkout V` | — |
| C3 | 설치·빌드: 루트 `npm ci` → chat ci → chat tsc → `apps/advisor` `npm ci` → `npm run build` — **전부 `9>&-`** | 실패 rc 4 |
| C4 | `node dist/advisor.cjs probe` `9>&-`(모델 호출 0 · 도메인 읽기 경로 · 락 상태는 "busy" 가 정상 — 자기가 쥐고 있다) → 그 출력 1~3줄을 양식에 | 도메인 0 이면 rc 4 |
| C5 | `cd apps/advisor` → `pm2 delete pleiades-adv-bot`(있으면) → `pm2 start ../../deploy/advisor/pleiades-adv.config.cjs --only pleiades-adv-bot --update-env` → `pm2 save --force` — **전부 `9>&-`** | 실패 rc 4 |
| C6 | 30초 뒤 `pm2 jlist`(`9>&-`): adv online · cwd = `$ROOT/apps/advisor` · `PLEIADES_ENV_FILE` 같음 · `PLEIADES_PRIVATE_DIR` 부재 + **모든 `pleiades-*` 의 env 대조(release-inplace C1 과 같은 식)** · 키가 있으면 `alive-adv.json` 수정 시각이 기동 뒤인지(없으면 "키 없음 — 기다리는 중" 정보 줄) | 아니면 rc 4 |
| 끝 | last-ok = V · pending 삭제 · 판정 양식 | — |
| stop | 락 → `pm2 delete pleiades-adv-bot` → `pm2 save --force`(`9>&-`) · last-ok 는 그대로 | — |

- 판정 양식은 release-inplace 와 같은 틀(`=== 판정 양식 … ===` · `결과:` · `원본:` · `=== 끝 ===`) · 원본 로그 `~/pleiades-private/inplace-adv-<시각>.log`(umask 077).
- 되돌리기 = 직전 태그로 다시 실행(`last-ok` 를 양식에 출력) · 정지 = `stop`(**즉시**).
- 마이그레이션·`mcp-config` 검사 없음(통합 층은 DB·mcp-config 를 쓰지 않는다).

**pm2 정의 `deploy/advisor/pleiades-adv.config.cjs`:** 이름 상수 `pleiades-adv-bot` 하나 · `script dist/advisor.cjs` · `args bot` · cwd `apps/advisor`(파일 위치 기준 절대경로) · D4 와 같은 LONG_RUNNING 값 · `env` 에 `PLEIADES_ENV_FILE` 넣지 않는다(셸 + `--update-env` 로만 — G-R1) · PATH 는 스크립트가 셸에서 준다.

---

## 5. 시험 (`deploy/test_adv_inplace.py` · 8절 `deploy/` 행)

1. **G-R2:** 설정 파일의 이름이 정확히 `pleiades-adv-bot` 하나 · `pleiades-fin-`·`pleiades-fit-` 로 시작하는 문자열 0.
2. **G-R3 정적:** 스크립트 본문(주석 제외)의 `pm2 ` · `npm ` · `npx ` · `node ` 로 시작하는 모든 명령 줄이 `9>&-` 를 가진다(또는 `nolock` 경유) · `flock -n 9` 존재.
3. **G-R1:** `PLEIADES_ENV_FILE="$HOME/pleiades-platform.env"` 리터럴 · release-inplace 의 `PLEIADES_KEYS` 와 **문자열 동일**(두 파일에서 추출해 비교 — 한쪽만 바뀌면 실패) · `PLEIADES_PRIVATE_DIR` 설정 시 rc 1(실행 시험 · 스텁).
4. **락:** 가짜 flock 으로 잡혀 있으면 rc 1(`test_release_inplace.py:518-541` 방식).
5. **금지:** `ssh` · `--tags` · `pm2 (kill|resurrect|stop all|delete all)` · `git clean` · `release-inplace.sh` 호출 · `pleiades.config.cjs` 참조 0.
6. `--dry-run`(Darwin 스텁): 단계 문자열 · 락 안 잡음 · rc 0.
7. 구조 4파일 무변경은 diff 로(시험 아님 · PR 체크리스트).

앱 쪽 시험(8절 `apps/advisor` 행 · `packages/chat`): B4 허용 목록 · B5 합계 가드 · B7 예약 후 정산(예약 → 정산 · 예약 상태 크래시 · 파일 호환) · B8 `onFatalClose`(넘기면 1회 · 안 넘기면 지금 동작).
수집기 시험(`deploy/test_ops_collect.py`): adv 디렉터리 없음 = 판정 0 · 있음 + bot 없음 = missing · LOG_NAME adv-bot · health·glob-empty 건너뜀 · fin·fit 기존 시험 무변경.

---

## 6. PR 나누기 (권고 3)

| PR | 범위 | 리뷰 | 되돌리기 |
|---|---|---|---|
| **4b-3a** | 앱·패키지: B4 · B5 · B7 · B8(chat `onFatalClose` + advisor 알림) · B6(U-1 이 (a) 면 `CLAUDE_CONFIG_DIR` 은 **스크립트가** env 로 준다 — 코드는 그 값을 자식 허용 목록에 넣기만) | 9-1 필수(`apps/**` · `packages/**`) | revert **중간**(소비자 0 — 띄우는 곳 없음) |
| **4b-3b** | `deploy/advisor/` 스크립트 · pm2 정의 · 시험 · 런북 `docs/runbooks/advisor-inplace.md`(설치 = clone · 실행 · 판정 · 정지 · "직접 `pm2 restart` 금지" · §3-4 위반 결과 표 · U-1 로그인) · 수동 `deploy.sh` 런북 한 줄(012 §11-1) | 9-1 필수(보안 sensitive — 외부 프로세스·서버) | revert **중간** |
| **4b-3c** | 수집기 B9 · 수집기 런북 재설치 REF | 9-1 필수 | revert **중간** · 서버 재설치 |

→ 셋 머지 뒤 **릴리즈 minor**(서버 조치 칸 = "선택 — 통합 층을 띄우려면 런북 · 없으면 무영향").

**서버 조치(사용자 · 전부 선택):** ① `git clone … ~/pleiades-adv` ② (U-1 (a)) 전용 디렉터리 로그인 ③ 플랫폼 키 2(`DISCORD_BOT_TOKEN_ADVISOR` · `DISCORD_CHANNEL_ID_ADVISOR`) — 운영 Discord 봇·채널 생성 포함 ④ `bash ~/pleiades-adv/deploy/advisor/adv-inplace.sh vX.Y.Z` → 판정 양식 ⑤ 수집기 재설치(REF·SHA 는 머지 뒤 Claude) ⑥ 첫 질문 1회.

---

## 7. 남는 위험

| # | 위험 | 대응 |
|---|---|---|
| W1 | 사용자가 `pm2 restart pleiades-adv-bot` 를 직접 실행 → 셸 env 로 재기동(G-R1 밖) | 런북 금지 · 수동이라 **다음 fin·fit 배포 C1 rc 1(바꾸기 전)** 로 드러난다 · 복구 = 스크립트 재실행 |
| W2 | 서버 재부팅 → pm2 resurrect 가 저장된 env 로 띄운다 | `pm2 save` 시점 env 가 G-R1 대로이므로 같다(미측정 — 감사 확인 대상) |
| W3 | §3-5 잔여 겹침(질문 시작 시험 몇 ms · 시험 직후 배포) | 4b 에서 수용(012 §3-5) |
| W4 | B4 허용 목록이 서버 인증 방식을 빠뜨림 | 첫 질문 확인 · 실패는 모델 호출 전 → 사용액 0 · 되돌리기 revert |
| W5 | probe 가 쥔 락을 "busy" 로 보고 → 판정 오해 | 양식 줄에 "(자기 락)" 명시 |

---

## 8. 감사에 묻는 것 (싸다고 한 곳)

1. B1 거부가 release-inplace 와 **같은 락 파일**을 보장하는가 — Actions forced command 셸에서 `PLEIADES_PRIVATE_DIR` 이 비어 있다는 근거(`ssh-deploy.sh`·`deploy.yml`·런북).
2. §5-2 정적 시험이 fd 상속 경로를 다 덮는가 — `npm ci` 의 lifecycle(prepare)·`npm run build`(esbuild)가 데몬을 띄우는 경로 · pm2 데몬이 **이 스크립트 안에서 처음 뜨는** 경우.
3. B7 예약 후 정산이 4b-2 사용액 파일·상한 판정(`bot.ts:92-97` · `spend.ts`)과 충돌 없이 들어가는가 · 예약 중 같은 날 상한 판정이 이중으로 세지 않는가.
4. B8 `onFatalClose` 를 두 앱이 넘기지 않을 때 동작 무변경인가(`gateway.ts:289-309` · fallback 경로와의 순서).
5. B9 adv 디렉터리 조건이 수집기 기존 fin·fit 판정을 바꾸지 않는가 · `deployWindow` 이름 규칙.
6. W2 — pm2 resurrect 가 `--update-env` 로 준 env 를 그대로 복원하는가(문서 근거 또는 미측정 명시).
7. B10 PATH 를 셸에서 바꿔 `--update-env` 로 주면 C1 `env_same`(PLEIADES_ENV_FILE 만 본다)에 영향 없는가.
8. B3 — `deploy/advisor/` 아래 파일이 `release-inplace.sh` A 단계 중단 조건(`:223-224`)에 걸리지 않는가.
9. 구조 4파일 무변경 주장 — `ssh-deploy.sh` 가 `deploy/` 를 통째로 다루는 곳이 없는가.
