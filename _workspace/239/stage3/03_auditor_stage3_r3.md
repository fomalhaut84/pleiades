# 011 단계 3 초안 r3 — 가역성 감사 3회차(마지막) (#651)

- 감사 2026-11-13 · 대상 `02_writer_stage3_r3.md` · 앞선 감사 `03_auditor_stage3.md`(AU) · `03_auditor_stage3_r2.md`(AU2)
- 정적 읽기와 `git grep` 만 했다 · 실행·서버 0 · `repos/*`·원본 git 0 · `apps/*` 하네스 지시 미실행
- 정정 종류: **[사실]** 코드와 다른 주장 · **[문안]** 표현·범위·참조
- **결론: 정정 6(사실 2 · 문안 4) · 미확인 0.** 사실 2건은 모두 한두 문장 범위이고 고칠 문안이 코드로 확정돼 있어 다른 절로 번지지 않는다.

---

## 1. R2-A~R2-I 반영 판정

| AU2 | 판정 | 근거(r3) |
|---|---|---|
| R2-A | 반영됨 — **위반 결과 표 둘째 줄에 새 사실 오류 1(R3-1)** | §3-4 표 · N25 |
| R2-B | 반영됨 | G-R3 · S1 |
| R2-C | 반영됨 | §3-5 |
| R2-D | 반영됨 | S2 · Q138 · §6 · 4b-2 |
| R2-E | 반영됨 — **4b-1·N24 에서 precheck 몫을 잘못 셌다(R3-2)** | §4-3 · 4b-1 |
| R2-F | 반영됨 | §8 순서 |
| R2-G | 반영됨 | 4a-3a · K-3 |
| R2-H | 반영됨 | G-R4 |
| R2-I | 반영됨 — 수는 R3-2 로 고친다 | N24 |

9건 모두 반영됨(부분 0 · 안 됨 0). 다만 그중 2건에서 새 오류가 났다.

---

## 2. §0-5 공유 자원 전수표 — 독립 grep

### S1 배포 락 — **확인**
명령: `git grep -n -e "deploy.lock" -e "take_lock" -e "flock" -- deploy tools docs/runbooks .github`
- 일치하는 사용처: `release-inplace.sh:34-46,181` · `discord-inbound.sh:61-72,233` · `advisor-x1/run-x1.sh:5-29` · `ops/collect.cjs:12`(열지 않음) · 시험·런북 문서. `deploy.sh` · `ssh-deploy.sh` · `discord-switch.sh`·`.cjs` 는 0 — 표와 같다.
- 작성자 메모 확인: `discord-inbound.sh:61` 주석 *"discord-switch.sh 와 같다"* 는 **낡은 주석**이다(discord-switch 에 락 코드 0). 설계에는 영향이 없고, 주석 정정은 별건 이슈로 낼 것을 권고한다.
- 보충(정정 아님): `release-inplace.sh --dry-run` 은 락을 잡지 않는다(`:181` `[[ $DRY -eq 1 ]] ||`). 표의 "배포 전체" 는 실제 배포만 뜻한다.

### S2 허용 사용자 키 — **확인**
명령: `git grep -n "DISCORD_ALLOWED_USER_IDS" -- apps/*/src packages/*/src tools deploy .env.example .claude docs/runbooks .github`(테스트 제외)
- 일치하는 곳은 isolation.md:37 · `.env.example:3,25` · 두 앱 `discord-interactions.ts`(:3 주석 · :74/:86) · 두 앱 `notifier.ts` · `discord-switch.cjs:17` · `007-t10-discord.md:46` · notify `platform-env.ts:30` · README `:27,34,53` · `chat-live-check.cjs:26,28` · `check_env.py:45,52`. **표 밖 사용처는 0.** 정규식 3 · 시험 2 · 문서 3 도 맞다.

### S3 `pleiades-*` pm2 이름 공간 — **확인 · 보충 1([문안] R3-3)**
명령: `git grep -n -E "startsWith\(['\"\`]pleiades-|pleiades-\\\$|pleiades-\(|/\^pleiades|pleiades-\\$\{" -- deploy tools .github`(시험 제외)
- 표의 여섯 행은 맞다(`release-inplace.sh:89,100` · `deploy.sh` 정확한 이름들 · `discord-switch.sh:48` · `collect.cjs:81,123,151-156` · precheck).
- **빠진 곳:** `deploy/advisor-x1/x1.cjs:491` — 로그 파일 이름 정규식 `^pleiades-${app}-(roles)-…`(app = fin·fit). 해는 없다(adv 를 세지 않을 뿐). 그 밖에 `release-inplace.sh:339,342`(C5 오류 창)와 `deploy.sh:125-143`(포트 점유)은 `pleiades-$APP-` 정확한 이름만 쓴다 — 포트가 없는 adv 와는 무관하다.

### S4 플랫폼 키 정규식 거울 — **확인 · 보충 1([문안] R3-3)**
- 표의 네 행은 맞다.
- **빠진 곳:** `deploy/discord-switch.cjs:15-18` — `BOTS` 맵(봇 토큰·채널 형식 검사)과 `REQUIRED`(필수 키 개수)가 fin·fit 만 하드코딩한다. 그래서 `DISCORD_BOT_TOKEN_ADVISOR`·`DISCORD_CHANNEL_ID_ADVISOR` 는 **서버 점검 명령(`discord-switch.cjs check`)의 형식 검사를 받지 않는다**. 정규식 변경 0 이라는 결론은 그대로이고, 형식 검사를 넣을지는 선택이다 — S2 의 `discord-switch.cjs` "선택 1" 과 같은 칸.

---

## 3. §3-4 위반 결과 표 ↔ `release-inplace.sh` 실제 흐름

| 표의 줄 | 판정 | 근거 |
|---|---|---|
| 1 사전 env 불일치 → C1 · 바꾸기 전 · rc 1 · 회복은 재실행 | **확인** | `:239-247` → `stop 1`(C2 checkout `:282` 전) · 다음 실행은 A 에서 P ≠ V 로 정상 진행 |
| 2 C1 뒤 env 불일치 → C5 · 바꾼 뒤 · rc 4 · last-ok 미갱신 · pending 남음 | **확인** | `:346-357` — `LAST_OK_FILE` 쓰기와 `rm PENDING_FILE` 은 통과 때만(`:355-357`) |
| 2의 회복 *"`--retry`(같은 태그 · C5 를 다시 판정) … 원인을 고치지 않고 `--retry` 하면 또 rc 4"* | **정정 [사실] R3-1** | `--retry` 는 C2 checkout 만 건너뛰고 **C1 검사 → C3 프로브 → C4 `deploy.sh` 전체(재빌드·재기동) → C5** 를 다시 돈다(`:282` `[[ $RETRY -eq 1 ]] ||` · `:308-314`). 그래서 ① "C5 를 다시 판정" 이 아니라 **재배포**다(서비스가 한 번 더 재기동된다) ② env 를 고치지 않고 `--retry` 하면 **C1 에서 바꾸기 전 rc 1** 이지 rc 4 가 아니다 |
| 3 G-R2 위반 · 통합 층 cwd 가 그 앱 체크아웃 밖 → C1 rc 1 | **확인** | `app_procs` 의 `inside` 는 `pm_cwd` 가 ROOT 아래인 것만 센다(`:100-102`) → 4 ≠ 3 → `:252-253` `stop 1` |
| 4 G-R2 위반 · cwd 가 체크아웃 안 → C5 rc 4 · 매번 | **확인** | C1 통과(4 = 4 · `:254` 주의 줄만) → C5 `online == 3` 불일치(`:349`) · `--retry` 도 같은 경로라 이름을 고치기 전에는 반복 |
| 5 *"두 경우 공통 — fin 이 rc ≠ 0 이면 fit 을 하지 않는다"* | **정정 [문안] R3-4** | `ssh-deploy.sh:45-47` 은 맞다. 다만 위반이 **fit 쪽**(이름 `pleiades-fit-…`)이면 fin 은 통과하고 fit 만 rc 를 낸다 — "fin 에서 걸리면" 으로 한정해야 한다 |

**R3-1 고칠 문안(둘째 줄 회복 칸):**
> *"통합 층 env 를 고친 뒤 `--retry` — 같은 태그로 **C1~C5 를 다시 돈다**(`deploy.sh` 재빌드·재기동 포함 · 서비스가 한 번 더 재기동된다). 앱 자체가 정상이면 R-8 은 필요 없다. env 를 고치지 않고 `--retry` 하면 **C1 에서 바꾸기 전 rc 1**."*
같은 표현이 머리 블록 *"r2 → r3"* ①(`--retry`)과 N25 에도 있으면 맞춘다(N25 의 안내 문구 자체는 맞다).

**R3-4 고칠 문안(다섯째 줄):** *"위반이 fin 에서 걸리면 `ssh-deploy.sh` 는 fit 을 하지 않는다(fit 은 옛 태그) · fit 에서 걸리면 fin 은 이미 새 태그다."*

---

## 4. r3 새 주장 반증

| # | 주장 | 판정 | 근거 · 고칠 문안 |
|---|---|---|---|
| R3-2 | N24 · 4b-1 *"로컬 가드 3(… `precheck.py` `APP_OF_DIR` — pm2 를 안 쓰면 직접 실행 허용만) · 로컬 시험 2(… `test_precheck.py`)"* · *"`precheck.py` 는 직접 실행 허용만 더한다"* | **정정 [사실]** | `run.sh adv -- node …` 에서 `precheck.py` 는 **고칠 것이 없다**. `node` 는 이미 `ALLOWED_PROGRAMS`(`precheck.py:29`)에 있고, `APP_OF_DIR` 는 pm2 판정에서만 쓰인다(`:98,125`). 나머지 검사(파괴 명령 · 훅 판정기 `:141-149`)는 앱과 무관하다. 고칠 곳은 `run.sh:18`(case)과 `check_env.py:28,276`(`APP_DIRS` · `choices`)뿐이다. **문안:** N24 → *"필수 7 + 선택 1: 로컬 가드 2(`run.sh` · `check_env.py`) · 로컬 시험 1(`test_check_env.py`) · CI 2 · 문서·설정 2 · 선택 1 · 불필요: `precheck.py`·`test_precheck.py`(직접 실행은 이미 허용 · pm2 리허설을 할 때만) · `write_env.py` · `db.py`"*. 4b-1 의 *"`precheck.py` 는 직접 실행 허용만 더한다"* → *"`precheck.py` 는 무변경"* |
| R3-3 | S3·S4 전수 | **정정 [문안]** | §2 의 보충 둘(`x1.cjs:491` · `discord-switch.cjs:15-18`)을 각 표에 한 행씩 더한다 — 둘 다 "무해 · 선택" |
| R3-5 | S1 `discord-switch.sh`·`.cjs` 행 *"주석이 낡았거나 다른 경로 · 감사 확인"* | **정정 [문안]** | 확인됐다 — 낡은 주석이다(§2 S1). 행의 괄호를 *"`discord-inbound.sh:61` 주석이 낡았다(락 코드 0) — 별건 정정 이슈"* 로 닫는다 |
| R3-6 | 4a-3a *"fin·fit advisor 답 무변경(조건: prompt 가 읽기 경로에만)"* · §12-5 | **확인 — 조건 하나 추가 [문안]** | 팩토리는 두 경로가 함께 쓰고(fin `server.ts:182,953,1040`), 모듈 최상위에서 파일 읽기가 실패하면 MCP 프로세스가 통째로 죽는다 → 전체 경로(fin advisor)까지 끊긴다. **문안:** 조건에 *"지식 파일은 `prompts/get` 핸들러 안에서 읽는다(모듈 로드·팩토리에서 읽지 않는다) — 읽기 실패는 그 prompt 의 오류로만"* 을 더한다 |
| — | G-R3 fd 닫기를 정적 검사로 막는다(§12-3) | 확인 | 통합 층 배포 스크립트가 부르는 `npm ci` 의 lifecycle 이 pm2 를 띄울 경로는 없다(앱 `package.json` 의 prepare·build 는 tsc·esbuild). G-R3 문언이 "모든 자식(pm2·npm·node)" 이라 덮인다 |
| — | 스크립트 경유 재기동은 락으로 앱 배포와 직렬화된다(§12-4) | 확인 | `release-inplace.sh` 는 A~C5 동안 락을 쥔다(`:181` · 커널이 프로세스 끝까지 보유). pm2 autorestart 는 저장된 env 를 그대로 쓰므로 DIFF 를 만들지 않는다. 잔여 위험은 사용자의 직접 `pm2 restart --update-env` 하나 — r3 가 런북 금지로 적었다 |
| — | `run.sh adv -- node` 경로에서 `check_env.py` 가 셋째 앱을 받는다 | 확인(R3-2 범위) | `check_env.py:236-238,276` — `APP_DIRS`·`choices` 에 adv 를 넣으면 앱 `.env` 가 없어도 플랫폼 검사가 돈다 |
| — | §12-8 `apps/*` 를 열거하는 다른 곳 | 확인 — 추가 0 | `.claude/hooks/isolation_guard.py:36` 은 `apps/[^/]+/deploy/` 일반형 · `tools/import/` 는 가져오기 종료(T-7) · `ci.yml`·`deploy.yml` 앱 이름 0 |
| — | 4b-2 *"정규식 3 · 시험 2 · 문서 3"* · Q138 | 확인 | §2 S2 |

---

## 5. 대장 ↔ 본문

| 행 | 판정 |
|---|---|
| N1~N23 · P1~P6 · D1~D5 | 확인 — r2 대비 값 변경 없음(2회차에서 산술 확인) |
| N24 | **정정 [사실]** — R3-2(필수 9 → 7). 본문 4b-1 은 "열거 N24" 로 가리키므로 대장만 고치면 된다. 단 4b-1 안의 precheck 문장은 따로 고친다 |
| N25 | 확인 — 순서·rc·last-ok·pending·fit 미배포 모두 코드와 같다. 근거 줄 `:52` 는 `diff_list` 정의라 흐름과 무관하다 → `:181,239-253,282,308-314,346-357` 로 바꾸기를 권고(문안 · R3-1 에 포함) |
| 본문의 대장 밖 숫자 | 0 |

---

## 6. 요약

| 판정 | 수 | 항목 |
|---|---|---|
| **정정** | **6** | [사실] **R3-1** `--retry` 는 재배포(C1~C5)이고 env 를 안 고친 재시도는 C1 rc 1 · **R3-2** N24·4b-1 의 precheck 몫 0(필수 9 → 7) / [문안] **R3-3** S3 `x1.cjs:491` · S4 `discord-switch.cjs` 행 추가 · **R3-4** "fin 에서 걸리면" 한정 · **R3-5** S1 낡은 주석 확정 · **R3-6** 4a-3a 무변경 조건(지식 파일은 핸들러 안에서 읽는다) |
| **미확인** | **0** | (4c-2 경로 비용은 r3 가 4c 설계 PR 몫으로 넘겼고, 그 처리는 확인했다) |
| **확인** | **24** | R2 반영 9 · 공유 자원 표 4(S1~S4 · 보충 별도) · §3 표 줄 4(1·2 상태·3·4) · §4 확인 5 · 대장 2행(N1~D5 묶음 · N25) |

**정본 발행 가능 여부:** 기준(사실 정정 0)에는 **아직 맞지 않는다** — 사실 정정이 2건 있다. 다만 두 건 모두 고칠 문안이 코드 근거로 확정돼 있고 다른 절로 번지지 않는다(R3-1 은 표 한 칸 · R3-2 는 대장 한 행 + 4b-1 한 문장). 그래서 **두 건과 문안 4건을 작성자가 직접 반영한 뒤, 감사 재요청 없이 012 로 발행해도 된다**고 판단한다(#37 전례의 확장). 이 판단을 받아들일지는 오케스트레이터·사용자가 정한다. 4회차 감사를 요구한다면 범위는 이 6건의 반영 확인만으로 충분하다.
