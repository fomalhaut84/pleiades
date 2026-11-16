# 통합 층 수동 배포 런북 (012 4b-3 · #699)

통합 어드바이저(`apps/advisor` · pm2 `pleiades-adv-bot`)를 **셋째 체크아웃 `~/pleiades-adv`** 에서 띄우고 내린다. 실행은 전부 사용자가 서버에서 한다(Claude 서버 접근 금지 · I-3). 세션에는 **판정 양식 블록만** 붙인다. 정본 설계: 012 §3-4(G-R1~R4) · §8 "확정 (2026-11-13 · #691)" 블록 · 상세 `_workspace/239/4b3/02_writer_4b3_r3.md`.

| 항목 | 값 |
|---|---|
| 스크립트 | `~/pleiades-adv/deploy/advisor/adv-inplace.sh <vX.Y.Z> [--dry-run] [--yes]` · `… stop [--yes]` |
| pm2 정의 | `deploy/advisor/pleiades-adv.config.cjs` — 이름 `pleiades-adv-bot` 하나 · `kill_timeout 15000` |
| 자동 배포 | **없다** — Release 발행은 두 앱만 배포한다(4b-5 전까지). 통합 층은 이 스크립트로만 바꾼다 |
| 기록 | `~/pleiades-private/inplace-adv-{last-ok,pending,stopped}` · 원본 로그 `inplace-adv-<시각>.log`(600 · 세션에 붙이지 않는다) |
| 락 | 두 앱 배포와 **같은** `~/pleiades-private/deploy.lock` — 두 앱 배포 중이면 rc 1(끝난 뒤 다시) · 통합 층 배포 중에 Release 를 발행하면 그 자동 배포가 락에서 실패한다 |
| 종료 코드 | 0 통과 · 1 바꾸기 전 중단 · 2 사용법 · 4 바꾼 뒤 실패(양식의 복구 줄) |

되돌리기: **정지 = `stop`(즉시 · 락이 비어 있을 때)** · 직전 태그로 같은 명령(**중간** · 빌드 1회) · `~/pleiades-adv` 삭제(**즉시** · `stop` 뒤에). 남는 것: 그날 사용액 파일 · 대화 세션 기록(비공개 위치) · 쓴 비용(**편도**).

## 0. 지키는 것 (어기면 두 앱 배포가 멈춘다)

| 하지 않는다 | 왜 |
|---|---|
| **스크립트 밖에서 `pm2 start` · `pm2 startOrRestart` · `--update-env` 로 `pleiades-adv-bot` 을 띄우지 않는다** | 두 앱 배포의 C1·C5 는 모든 `pleiades-*` 의 `PLEIADES_ENV_FILE` 이 같아야 한다(012 G-R1). 다른 셸 env 로 뜨면 **다음 Release 자동 배포가 C1 에서 rc 1**(바꾸기 전)로 멈춘다. 옵션 없는 `pm2 restart pleiades-adv-bot` 은 저장된 env 를 그대로 쓰므로 괜찮다 |
| `PLEIADES_PRIVATE_DIR` 을 셸·프로필에 두지 않는다 | 두 앱 배포와 다른 락·기록 위치가 된다 — 스크립트가 설정을 보면 거부한다 |
| `pm2 delete all` · `pm2 kill` | 두 앱도 내려간다 |
| 다른 위치에 clone 해 띄우지 않는다 | 스크립트가 `~/pleiades-adv` 가 아니면 거부한다 · 수집기(4b-3c)도 그 위치만 본다 |

**두 앱과 같은 태그로 띄운다.** 통합 층은 자기 체크아웃의 `apps/*/domain.json` · 모델 핀을 읽는다 — 두 앱과 다른 태그면 도구 목록·지식이 운영과 엇갈릴 수 있다(양식 `(주의)` 줄).

## 1. 처음 한 번 (선택 — 안 하면 통합 층만 안 뜬다)

```bash
git clone https://github.com/fomalhaut84/pleiades.git ~/pleiades-adv   # HEAD = dev(태그 아님) — 첫 실행은 이 상태를 허용한다
```

운영 Discord 에 통합 봇·채널을 만들고 `~/pleiades-platform.env`(600)에 키를 넣는다: `DISCORD_BOT_TOKEN_ADVISOR` · `DISCORD_CHANNEL_ID_ADVISOR` · (선택) `DISCORD_ALLOWED_USER_IDS_ADVISOR`(비면 공유 `DISCORD_ALLOWED_USER_IDS`). 키 없이 띄워도 된다 — 봇은 "봇 토큰·채널 미설정 — 기다린다" 로 돌다가 파일에 키가 생기면 재기동 없이 gateway 를 시작한다(`봇 토큰·채널 설정 감지` 줄 · 4b-2b). 같은 태그로 스크립트를 다시 부르면 "이미 배포됨" 으로 끝난다 — 강제로 다시 띄우려면 `stop` 뒤 같은 태그(3절).

## 2. 띄우기

```bash
V=v1.15.0   # 두 앱이 지금 도는 태그
bash ~/pleiades-adv/deploy/advisor/adv-inplace.sh "$V" --dry-run   # A 까지 — 바꾸지 않는다(락도 안 잡는다)
bash ~/pleiades-adv/deploy/advisor/adv-inplace.sh "$V"             # y 로 확인
```

스크립트가 하는 일: **0** OS(Linux) · 위치 `~/pleiades-adv` · **C1a** 셸 키 비우기 · `PLEIADES_ENV_FILE=~/pleiades-platform.env`(600) · **L** 배포 락 → (여기부터 락 fd 를 닫은 서브셸) **C1b** 두 앱 기록(`inplace-fin/fit-last-ok`)이 같은 위치에 있음 · pm2 데몬 있음 · `claude` 찾기(PATH → `~/.local/bin`) · 도는 fin·fit 의 `PLEIADES_ENV_FILE` 이 같음 · **A** 태그 받기 · 깨끗 · 규칙 3줄 · **C2** checkout · **C3** 빌드(루트 `npm ci` → chat ci·tsc → advisor `npm ci`·build) · **C4** `probe`(모델 호출 0 · 두 도메인 읽기 경로 · 락은 "busy(이 실행의 락)") · **C5** 옛 `pleiades-adv-bot` delete → `start --update-env` → `save --force` · **C6** 30초 뒤 online · cwd · env · `PLEIADES_PRIVATE_DIR` 없음 · 전체 `pleiades-*` same · 봇 키가 있으면 생존 표지 갱신.

**A 규칙(상태로 판정 · 별도 재시도 플래그 없음):**
1. HEAD 가 태그가 아니면 **마지막 통과가 없을 때만**(첫 실행) 진행 — 있으면 rc 1(`git -C ~/pleiades-adv checkout <마지막 통과>` 뒤 다시).
2. "이미 배포됨" rc 0 은 HEAD = V · 마지막 통과 = V · 끝나지 않은 시도 없음 · 정지 표지 없음 · **도는 `pleiades-adv-bot` 이 이 셸 env 로 online** — 다섯 다 참일 때만(다섯째가 거짓이면 같은 태그로 재기동해 고친다 · 4절 마지막 행).
3. 그 밖은 진행 — HEAD ≠ V 면 checkout, 같으면 C3 부터(rc 4 뒤 재실행 · `stop` 뒤 다시 켜기 · 직전 태그로 되돌리기가 전부 여기).

## 3. 정지 · 다시 켜기

```bash
bash ~/pleiades-adv/deploy/advisor/adv-inplace.sh stop   # y 로 확인
```

락만 잡는다(두 앱 기록·env 를 보지 않는다 — 어떤 상태에서도 "즉시"). pm2 데몬이 없으면 pm2 를 부르지 않는다(빈 데몬을 띄워 `save --force` 로 두 앱 resurrect 목록을 지우지 않게) · `pleiades-adv-bot` 이 있을 때만 delete → save. 정지 표지를 쓰고 생존 표지를 지운다 · 마지막 통과는 남긴다.
다시 켜기 = **같은 태그로** 2절 명령(정지 표지가 있으면 "이미 배포됨" 이 아니다).

## 4. 실패했을 때

| 양식 | 할 일 |
|---|---|
| rc 1 | 바뀐 것 없음 — 이유 줄을 고치고 다시 |
| rc 4 · 마지막 통과 **있음** | 같은 명령 재실행(일시 실패) · 또는 양식의 "되돌리기 adv-inplace.sh <직전 태그>" · 또는 `stop` |
| rc 4 · 마지막 통과 **없음**(첫 실행) | **`stop`** — 되돌릴 태그가 없다. 수집기는 이 상태를 감시하지 않으므로 양식이 유일한 신호다 |
| 두 앱 Release 배포가 C1 에서 `pleiades-adv-bot DIFF/MISSING` 으로 멈춤 | 0절 위반(스크립트 밖 기동). **`adv-inplace.sh <마지막 통과>` 로 재기동**하면 고쳐진다(adv 자신의 DIFF 는 이 스크립트가 막지 않는다) → 두 앱 배포 재실행 |

## 5. 첫 질문 확인 (띄운 뒤 1회 · 사용자)

통합 채널에 교차 질문 하나 → `pm2 logs pleiades-adv-bot --lines 50 --nostream` 에서 `[advisor] key=… status=…` 줄을 본다. **판정만** 세션에:

```
D  status <answer/…> · cost=$<값> (0 이 아니고 $1.0000 미만) · tools fin:<ok>/<n>,fit:<ok>/<n> · outside 0 · drift false: 예/아니오
```

- `cost=$0.0000` 이거나 줄이 없고 거부 문구가 오면 — 자식 env 허용 목록(012 4b-3a2 B4)이 서버 인증에 필요한 키를 빠뜨렸을 수 있다. 질문을 반복하지 말고 세션에 판정을 가져온다(실패 질문도 사용액에 $1.00 이 들어갈 수 있다 — 5회면 그날 상한).
- "실행 환경 설정" 거부 = 개발용 user settings 에 hooks · `mcp__` allow · 와일드카드 allow 가 생겼다(fail-closed · 012 4b-3 §3 (b)).

## 판정 양식

스크립트 출력의 `=== 판정 양식 … === 끝 ===` 블록 + 5절 `D` 줄. 원본 로그·`pm2 logs` 원문은 붙이지 않는다.
