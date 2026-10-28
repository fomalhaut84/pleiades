# 인계 노트 — 2026-10-28, 009 D-1 설계 · 구현 · `v1.1.0` · `v1.2.0`

직전 노트: `2026-10-27-d0-chat.md`. **이 노트가 최신이다.**

## 이 세션에서 한 일

**서비스 영향: 0 — https 읽기만**(서비스 저장소 쓰기 0 · Claude 서버 접근 0 · 운영 봇·DB 접촉 0). **운영 배포 2회는 Release 발행 → 자동 배포**(I-3 예외 · #242): `v1.1.0`(10:07 · fin rc 0 133 s · fit rc 0 85 s · fit C5 프로브 오류 1(1초)) · `v1.2.0`(12:53 · fin rc 0 136 s · fit rc 0 76 s · C5 프로브 오류 0).
**로컬 격리 자원(사용자 승인):** 검증 봇으로 fit·fin 봇 번들을 `run.sh` 경유 여러 번 기동·종료(남은 프로세스 0) · `pleiades_fit`·`pleiades_fin` 읽기 · `apps/{fitness,finance}/logs/{identify,telegram-polling}-<app>.json`(gitignored · 실측 뒤 IDENTIFY 기록은 원래대로 되돌림) · 스크래치 git worktree 1(M-1 · 제거함) · `npm pack pm2@6.0.8`(스크래치).

| # | 이슈 → PR | 내용 |
|---|---|---|
| 1 | #339 | D-1 전체(열림 — 서버 로그 판정 뒤 닫는다) |
| 2 | #340 → #341 | **D-1 설계 기록** — `_workspace/009/d1/`(측정 3 · 초안 2회 · 감사 2회 정정 6 → 3) · 009 §6 정정 블록 |
| 3 | #342 → #343 · 릴리즈 #344 | **PR-0 `v1.1.0`**(배포 동작 변경 0) — R-8 하한을 chat 무시 줄이 있는 태그로 |
| 4 | #345 → #346 | PR-1 — chat `intents` 옵션 · `deploy.sh`/apps-ci 에 chat 설치·빌드 · M-1(앱 `.npmrc` 불요) |
| 5 | #347 → #348 | PR-2 fit — `telegram-polling.ts` · `NotifyBot` · `TELEGRAM_POLLING` · chat gateway · 판정 문자열 교차 테스트 · Codex P2 2 반영 · 로컬 실측 4종 |
| 6 | #349 → #350 | PR-3 fin — 같은 모양 + 토큰 게이트 제거 · `notifyBot()` · 스모크 3겹 · 로컬 실측(자동 항목) |
| 7 | #351 → #352 | 버전 1.2.0 |
| 8 | #354 → #355 | **#350 회귀** — 테스트 2개가 토큰을 안 넣어 CI `apps-fin-test`(비필수) 13 실패. 릴리즈 PR 에서 사용자가 발견 |
| 9 | #353 | **`v1.2.0` 릴리즈 = 정본 §6 의 "D-1 태그"** · 자동 배포 통과 |
| 10 | #356 | 이 인계 |

## 결정된 것

| | 결정 | 누가 |
|---|---|---|
| PR-0 선행 릴리즈 | **`v1.1.0` minor** | 사용자 2026-10-28 |
| 설계 기록 형태 | 문서 PR 먼저 → 릴리즈 | 사용자 |
| 로컬 실측 범위 | fit = 전부(사용자 메시지·버튼 포함) · fin = 자동 항목만 | 사용자 |
| S-2 · S-4 · S-5 | IDENTIFY·폴링 상태 = `apps/<dir>/logs/*.json` · `TELEGRAM_POLLING=off`(앱 `.env` 선택 키) · 스모크 = `--smoke` + 무효 토큰 + 자식 env 덮기(`PLEIADES_ENV_FILE=/dev/null`) | 설계 PR(§9-2 · 감사 통과) |
| 서버 chat 설치 | `deploy.sh` 1단계(루트 `npm ci` → chat ci → tsc → 앱 `npm ci`) · 서버 조치 없음 | 설계 |
| D-1 chat intents | 0(버튼만) — MESSAGE CONTENT 포털 토글은 D-2(`--draft`) | 설계 |
| U-1 · U-15 | pm2 6.0.8 = 7.0.4 의미(소스) · chat 이 `session_start_limit` 을 읽는다 | 측정 |

## 결정되지 않은 것

| | 내용 | 언제 |
|---|---|---|
| **서버 봇 로그 판정** | 사용자가 서버에서 개수만 내는 명령(이 세션 마지막 응답)을 실행 → 기대 `밀린버림 1` · `준비 ≥1` · `IDENTIFY보호 0` · `종료코드 0` · `토큰무효 0` | 다음 세션 첫 일 · 통과하면 #339 닫음 |
| D-2 설계 | fit Discord 병행 수신 — 2-1~2-4 · Discord 수신 스위치(S-4 후반) · 포털 MESSAGE CONTENT 토글 → `--draft` · 정식 대화 채널 키 | 다음 |
| 오전 노트의 미결 | 브리핑 인용 날짜 · 10-31 주간 리뷰 알파 등 | 그대로 |

## 다음 세션의 첫 액션 후보

1. **서버 로그 판정 받기**(사용자 · 1분) → #339 닫기. 되돌리기: 해당 없음.
2. **D-2 설계**(fit 병행 수신) — 009 §6 D-2 행 · 착수 직전 측정 · 감사 → 구현. 서버 조치(포털 토글 · 채널) 있으면 `--draft`. 되돌리기: Discord 수신 스위치 끔(**즉시**).
3. 작은 것: #333(notify 패턴 1줄).

## 주의사항

- **서비스 영향 0 원칙** — 이 세션 0. 운영 배포는 Release 발행으로만(사용자 릴리즈 PR 머지 뒤 · 크론 시각 회피).
- **R-8 하한 = `v1.1.0`** — 그 아래(`v1.0.8` 이하)로 내리면 `packages/chat/dist` untracked 로 `release-inplace.sh:279` 에서 멈춘다. 서버 텔레그램 토큰을 지운 뒤 하한은 `v1.2.0`(조건: 서버 `NOTIFY_*=discord` 줄 유지 · 009 §6 머리) · **폴링을 끈 뒤(D-2′) 하한도 `v1.2.0`**(그 아래는 밀린 명령을 실행).
- **로컬 8절은 앱 `.env` 가 실린다 — CI 는 아니다.** env 로 동작이 갈리는 변경은 그 키를 비운 조건으로도 테스트하고, 머지 안내 전 `gh pr checks`(비필수 포함)를 본다(#354 · 메모리). Security Vulnerability Scan 실패는 세션 전부터의 #126.
- **가드 확인은 `zsh -ic 'tools/local/run.sh …'`** — Claude 셸은 `~/.zshrc`(검증 봇 해시·허용 목록)를 읽지 않아 `check_env` 가 막는다.
- **`run.sh` 는 node·npm·npx 만** — env 를 바꿔 기동하려면 `node -e "process.env.X='';…require('./dist/bot/standalone.cjs')"`.
- 두 앱의 `telegram-polling.ts` 는 같은 코드(스타일만 다름) — 한쪽을 고치면 다른 쪽도. `packages/chat` 에 두지 않은 이유는 C-2(텔레그램 어휘 금지) · D-5 에서 함께 사라진다.
- 서버에 `apps/<dir>/logs` 를 지우는 외부 logrotate 가 있으면 `identify-*`·`telegram-polling-*` 를 제외해야 한다(미확인 · 계정 crontab 은 없다 `measured-facts.md:4288`).
- 세션 시작 관측: dev `7d6248f` · 열린 PR 0 · 수용 fin `3685b2ca138c`·fit `35a04d78e532` 최신 → 끝 dev `022ab74` · main `170f359`(`v1.2.0`). **인계보다 현재 상태를 믿는다.**
- `MEMORY.md` 30줄 안팎. 응답은 한국어.

## 정정된 기록

- 009 §6 D-1 "착수 직전 측정 — 서버 pm2 6.0.8 동작(사용자)" → 레지스트리 소스로 해소(사용자 측정 불요).
- 설계 초안의 "PR-0 = 코드 0" → 배포 동작 변경 0(notify export 3 · 버전 필드 커밋 1).
- 대장 "L12′ 17곳" · "크론 20" · "getBot 17" 은 **fin 값**(fit 은 1 · 크론 5 · 스모크 없음).

## 재현이 필요한 절차

- **로컬 봇 실측(빌드 번들):** `zsh -ic 'tools/local/run.sh <fin|fit> -- npm run build'` → `zsh -ic "tools/local/run.sh <app> -- node -e \"process.env.TELEGRAM_BOT_TOKEN='';setTimeout(()=>process.kill(process.pid,'SIGINT'),25000).unref();require('./dist/bot/standalone.cjs')\""`. IDENTIFY 차단은 `apps/<dir>/logs/identify-<app>.json` 을 1시간 안 100회로 채우고(백업 후) 두 번 기동. 결과 표 `_workspace/009/d1/05_live_{fit,fin}.md`.
- **버전 올림:** lock 의 `"version"` 은 의존성에도 있다 — 상위 2개(+ chat lock 의 `../notify`)만 바꾼다(#351 에서 한 번 걸림).
