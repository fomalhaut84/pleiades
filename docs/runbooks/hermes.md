# hermes 수동 배포 런북 (014 H-2 · #800)

hermes(`apps/hermes` · pm2 `pleiades-hrm-api`)를 **넷째 체크아웃 `~/pleiades-hermes`** 에서 띄우고 내리며, 출처 키를 발급·회수한다. 실행은 전부 사용자가 서버에서 한다(Claude 서버 접근 금지 · I-3). 세션에는 **판정 양식 블록만** 붙인다. 정본 설계: `docs/specs/014-hermes.md` §3-A(A1) · §3-C · §3-D · §4. 통합 층 런북(`advisor-inplace.md`)과 같은 모양이다.

| 항목 | 값 |
|---|---|
| 스크립트 | `~/pleiades-hermes/deploy/hermes/hrm-inplace.sh <vX.Y.Z> [--dry-run] [--yes]` · `… stop [--yes]` |
| 출처 키 | `~/pleiades-hermes/deploy/hermes/hermes-key.sh add · list · disable · enable · remove · rotate` |
| pm2 정의 | `deploy/hermes/pleiades-hrm.config.cjs` — 이름 `pleiades-hrm-api` 하나 · **루프백 포트 4700**(서버 확인 U1 · 2026-11-18) · `kill_timeout 20000` · `--disable-warning=ExperimentalWarning`(U3 — 서버 node 24.12 는 `node:sqlite` 경고 1줄) |
| 데이터 | **체크아웃 밖** `~/pleiades-hermes-data/` — `state/hermes.db`(대기열 · WAL) · `state/state.json`(수치 · 수집기가 읽는다 · H-3) · `sources.json`(출처 레지스트리 · 키 해시만) · 전부 0600/0700 |
| 플랫폼 키 | `~/pleiades-platform.env` 의 **`DISCORD_WEBHOOK_HERMES`**(채널 `#hermes` · 선택 — 없으면 받기만 하고 게시는 멈춘다 · 넣으면 재기동 없이 다음 걸음부터 게시) |
| 자동 배포 | **없다**(H-4 에서 수동 몇 회 통과 뒤 `ssh-deploy.sh` `## hrm` 단계) — 지금은 Release 뒤 손으로 |
| 기록 | `~/pleiades-private/inplace-hrm-{last-ok,pending,stopped}` · 원본 로그 `inplace-hrm-<시각>.log`(600 · 세션에 붙이지 않는다) |
| 락 | 두 앱 · 통합 층 배포와 **같은** `~/pleiades-private/deploy.lock` |
| 종료 코드 | 0 통과 · 1 바꾸기 전 중단 · 2 사용법 · 4 바꾼 뒤 실패(양식의 복구 줄) |

되돌리기: **정지 = `stop`(즉시)** · 직전 태그로 같은 명령(**중간** · 빌드 1회) · `~/pleiades-hermes` 삭제(**즉시** · `stop` 뒤). 데이터 자리는 정지 · 삭제와 따로 남는다 — 지우면 대기열 · 출처 키가 사라진다(출처마다 키를 다시 발급해야 한다 · **중간**).

## 0. 지키는 것 (어기면 두 앱 · 통합 층 배포가 멈춘다)

| 하지 않는다 | 왜 |
|---|---|
| **스크립트 밖에서 `pm2 start` · `--update-env` 로 `pleiades-hrm-api` 를 띄우지 않는다** | 두 앱 · 통합 층 배포는 모든 `pleiades-*` 의 `PLEIADES_ENV_FILE` 이 같아야 한다(012 G-R1 · 014 N14). 다른 셸 env 로 뜨면 다음 Release 자동 배포가 C1 에서 멈추고 통합 층 배포는 C6 에서 rc 4 다. 옵션 없는 `pm2 restart pleiades-hrm-api` 는 저장된 env 를 그대로 쓰므로 괜찮다 |
| `PLEIADES_PRIVATE_DIR` 을 셸·프로필에 두지 않는다 | 다른 락·기록 위치가 된다 — 스크립트가 거부한다 |
| `pm2 delete all` · `pm2 kill` | 두 앱도 내려간다 |
| pm2 정의의 포트를 fin · fit 포트와 같게 두지 않는다 | 두 앱 배포의 점유 검사가 die 한다(014 N15) — 스크립트가 기동 전에 거부한다 |
| 출처 키를 세션 · 이슈 · 채팅에 붙이지 않는다 | 키는 `add` · `rotate` 때 한 번만 보인다 — 출처 쪽 설정에 바로 넣는다. 새면 `rotate`(옛 키는 바로 401) |

**두 앱과 같은 태그로 띄운다**(양식 `(주의)` 줄) — 같은 저장소 · 같은 공통 패키지(`packages/notify`)다.

## 1. 처음 한 번

```bash
git clone https://github.com/fomalhaut84/pleiades.git ~/pleiades-hermes   # HEAD = dev(태그 아님) — 첫 실행은 이 상태를 허용한다
```

운영 Discord 에 `#hermes` 채널과 웹훅을 만들고 `~/pleiades-platform.env`(600)에 `DISCORD_WEBHOOK_HERMES="<웹훅>"` 한 줄을 넣는다(지금 없어도 된다 — 받기만 한다). 데이터 자리(`~/pleiades-hermes-data`)는 스크립트가 0700 으로 만든다.

## 2. 띄우기 (A)

```bash
V=v1.20.0   # 두 앱이 지금 도는 태그(hermes 가 든 첫 릴리즈 이상)
bash ~/pleiades-hermes/deploy/hermes/hrm-inplace.sh "$V" --dry-run   # A 까지 — 바꾸지 않는다(락도 안 잡는다)
bash ~/pleiades-hermes/deploy/hermes/hrm-inplace.sh "$V"             # y 로 확인
```

스크립트가 하는 일: **0** OS(Linux) · 위치 `~/pleiades-hermes` · node 22.13+ · **C1a** 셸 키 비우기 · `PLEIADES_ENV_FILE=~/pleiades-platform.env`(600) · **L** 배포 락 → (여기부터 락 fd 를 닫은 서브셸) **C1b** 두 앱 기록이 같은 위치 · pm2 데몬 있음 · 도는 **fin · fit · adv** 의 `PLEIADES_ENV_FILE` 이 같음 · **C1c 포트 가드**(pm2 정의 포트 ≠ fin·fit `PORT`·`MCP_PORT`·pre-flight — 새 태그의 정의로 C4 에서 다시) · **A** 태그 받기 · 깨끗 · 규칙 3줄(통합 층과 같다) · **C2** checkout · **C3** 빌드(루트 `npm ci` → hermes `npm ci` · build) · **C4** `hermes check`(대기열 WAL · 레지스트리 · 웹훅 유무 · 포트를 열지 않는다) · **C5** 옛 `pleiades-hrm-api` delete → `start --update-env` → `save --force` · **C6** 30초 뒤(pm2 `min_uptime`) online · cwd · env · 전체 `pleiades-*` same · 루프백 `/v1/health` 200 · 상태 파일이 기동 뒤 갱신 · 웹훅 있음/없음.

**확인 프롬프트(`y`)를 오래 열어 두지 않는다** — 그동안 락을 쥐고 있어 Release 자동 배포가 락에서 실패한다.

## 3. 출처 등록 (B · 출처마다 1회)

등록 전 체크(014 §3-I — 기계가 못 잡는 것):
- [ ] 출처가 보내는 글에 **사람을 특정하는 값이 없다** — 이름 · 주소 · 계좌(전화 · 이메일은 hermes 가 막는다 · 사유 `pii`). 주문 알림은 주문 번호 · 수량 · 금액 · 상태 · 관리 화면 링크까지
- [ ] 한시 출처면 **만료일**(`--expires`)을 둔다 — 그날(KST) 끝까지 받고 다음 날부터 403
- [ ] 링크를 보낼 출처면 **허용 호스트**를 정한다(`--link-host` 여러 번) — 밖이면 링크 줄만 빠진다

등록(한 줄 · `<…>` 를 실제 값으로):

```bash
bash ~/pleiades-hermes/deploy/hermes/hermes-key.sh add <id> --name <표시 이름> --expires <YYYY-MM-DD> --link-host <관리 화면 호스트>
```

키가 **한 번** 보인다 — 출처(예: 주문 앱) 설정에 넣고 화면을 닫는다. **키가 찍힌 화면은 세션 · 이슈 · 채팅에 붙이지 않는다**(붙였으면 `rotate`).

> **블록을 통째로 붙이지 않는다(#809).** 아래는 명령 표다 — 필요한 한 줄만 실행한다. 2026-11-18 첫 설치 때 옛 예시 블록을 통째로 붙여 add → disable → rotate → remove 가 연달아 돌았다.

| 하려는 것 | 명령(`hermes-key.sh` = `bash ~/pleiades-hermes/deploy/hermes/hermes-key.sh`) | 결과 |
|---|---|---|
| 목록 | `hermes-key.sh list` | id · 이름 · 켜짐 · 만료 · 링크 · 분당(해시 · 키 없음) |
| 잠시 끄기 / 다시 켜기 | `hermes-key.sh disable <id>` / `enable <id>` | 끄면 403 |
| 키 바꾸기(샜을 때) | `hermes-key.sh rotate <id>` | 새 키 한 번 · 옛 키는 바로 401 |
| 지우기 | `hermes-key.sh remove <id>` | 401 |

hermes 는 레지스트리 수정 시각으로 다시 읽는다 — **재기동하지 않는다**. 키 명령은 **한 번에 하나**(잠금 없이 읽고 고쳐 쓴다 — 동시에 돌리면 한쪽 변경이 사라진다). id 는 소문자 · 숫자 · `-`(32자) · 표시 이름(1~32자)은 `#hermes` 의 게시 이름 `hermes·<이름>` 이 된다(`discord` · `clyde` 금지).

**출처 쪽 계약(014 §2):** `POST http://127.0.0.1:4700/v1/messages` · `Authorization: Bearer <키>` · `Content-Type: application/json` · 본문 `{title?, text, link?: {label, url}, level?: "info"|"warn"}` · **`Idempotency-Key`**(같은 알림의 재시도에 같은 값) · `202` 면 끝 · `503` · 연결 실패면 같은 키로 재시도 · `400`·`401`·`403`·`413` 은 재시도하지 않는다 · `429` 는 `Retry-After` 뒤. 외부 호스트에서 보내려면 H-5(nginx)가 먼저다 — 지금은 같은 서버의 출처만.

## 4. 정지 · 다시 켜기 (C)

```bash
bash ~/pleiades-hermes/deploy/hermes/hrm-inplace.sh stop   # y 로 확인
```

락만 잡는다(두 앱 기록 · env 를 보지 않는다). pm2 데몬이 없으면 pm2 를 부르지 않는다 · `pleiades-hrm-api` 가 있을 때만 delete → save(두 앱이 없는 데몬이면 save 하지 않고 rc 4). 정지 표지를 쓰고 마지막 통과는 남긴다. **대기열 · 레지스트리는 그대로** — 다시 켜면 남은 메시지부터 게시한다(받은 지 24 h 넘은 것은 dead). 정지 중에 온 요청은 출처가 재시도한다(연결 실패 = 재시도 계약).
다시 켜기 = **같은 태그로** 2절 명령.

## 5. 실패했을 때

| 양식 | 뜻 | 할 일 |
|---|---|---|
| `결과: 중단`(rc 1) | 바꾸기 전에 멈췄다 | 사유 줄대로 고친 뒤 같은 명령 |
| `C3 — … 실패`(rc 4) | 빌드 실패 · 옛 프로세스는 그대로 | 같은 명령 재실행 · 또는 직전 태그 |
| `C4 — check rc 1` | 대기열을 못 열었거나 레지스트리가 망가졌다 — 띄우지 않았다 | 레지스트리를 `hermes-key.sh list` 로 확인(오류면 손으로 고친 파일을 되돌린다) · 같은 명령 |
| `C5 — pm2 start 실패` | 옛 프로세스는 내렸고 새 것은 못 띄웠다(저장 목록은 맞췄다) | 직전 태그로 되돌리기 · 또는 `stop` |
| `C6 — 확인 실패` | 떴지만 online · env · health · 상태 파일 중 하나가 아니다 | `pm2 logs pleiades-hrm-api --lines 50`(판정만 세션에) · 직전 태그 · 또는 `stop` |
| `웹훅: 없음` | 받기만 · 게시 멈춤(실패 아님) | 1절 웹훅 줄을 넣으면 다음 걸음부터 게시 — 재기동 불필요 |

## 6. 첫 게시 확인 (D · 띄운 뒤 1회 · 사용자)

**한 줄씩** 실행한다 — 블록을 통째로 붙이면 ② 의 `read` 가 다음 줄을 키로 읽는다(#809).

① 시험 출처(만료 = 오늘) — 키가 한 번 보인다(붙이지 않는다):

```bash
bash ~/pleiades-hermes/deploy/hermes/hermes-key.sh add smoke --name 시험 --expires "$(TZ=Asia/Seoul date +%F)"
```

② 이 줄**만** 실행하고, 입력을 기다리면 ① 의 키를 붙이고 Enter(화면에 보이지 않는 게 정상 · 셸 기록에 남지 않는다):

```bash
read -rs KEY
```

③ 한 건 보낸다 — 키는 명령줄 인자가 아니라 표준 입력으로(같은 서버의 다른 계정이 `ps` 로 볼 수 있다 · #800 9-1):

```bash
printf 'header = "Authorization: Bearer %s"\n' "$KEY" | curl -sS -K - -X POST http://127.0.0.1:4700/v1/messages -H 'Content-Type: application/json' -H 'Idempotency-Key: smoke-1' -d '{"title":"hermes 첫 게시","text":"서버 배치 확인"}'; echo; unset KEY
```

응답 `{"id":"…","duplicate":false}` · `#hermes` 에 **`hermes·시험`**(게시 이름 = `hermes·<표시 이름>` · Discord 가 "앱" 배지를 붙인다)으로 굵은 제목 + 한 줄.

④ 시험 출처를 지운다:

```bash
bash ~/pleiades-hermes/deploy/hermes/hermes-key.sh remove smoke
```

양식의 "사람 확인" 줄에 예/아니오를 덧붙인다.

**첫 설치(2026-11-18 · `v1.20.0`):** 2절 통과(C4 WAL · 레지스트리 0 · 웹훅 있음 · C6 online · health 200 · 상태 파일 갱신) · D 통과(202 · `#hermes` 에 `hermes·시험` 게시 확인 — 사용자).

## 판정 양식

스크립트가 마지막에 출력한다 — 이 블록만 세션에 붙인다(경로는 `~` 로 가려진다 · 원본 로그는 붙이지 않는다).

```
=== 판정 양식 (이 블록만 세션에 붙인다) ===
HRM v1.20.0
C1 셸 키 0 · platform 600
   fin·fit same 6 · adv 1 · DIFF/MISSING 0 · hrm 없음
   포트 가드: fin·fit 와 겹치지 않음
   태그 hrm v1.20.0 · fin 마지막 통과 v1.20.0 · fit v1.20.0
A  첫 실행 — HEAD dev
C2 v1.20.0 · 깨끗: 예
C3 빌드: 예
C4 대기열: WAL 예 · queued 0 · dead 0
C4 레지스트리: 출처 0 · 오류 아니오
C4 웹훅: 있음
C5 pleiades-hrm-api 기동 · save: 예
C6 pleiades-hrm-api online · cwd 이 체크아웃: 예 · PLEIADES_ENV_FILE same · PLEIADES_PRIVATE_DIR 없음 · 전체 pleiades-* DIFF/MISSING 0
   health 200 · 상태 파일 갱신: 예
   웹훅: 있음 — 게시 가능
   사람 확인: 출처 키로 한 건 보내 #hermes 에 보이는지(런북 D) — 예/아니오 를 덧붙인다
결과: 통과
=== 끝 ===
```

**수집기 감시(H-3 · #802):** 수집기를 hermes 감시가 든 판으로 재설치하면(`ops-collector.md` 1절 · REF 는 Claude 가 준다) pm2 상태 · 상태 파일(갱신 멈춤 · 웹훅 · 적체 · dead · 레지스트리) · stderr 가 `#ops` 로 온다 — 기록 해석은 `ops-collector.md` "hermes(`hrm·api`) 기록을 보면". 재설치 전에는 이 런북의 D 와 `pm2 ls` 로 본다.
