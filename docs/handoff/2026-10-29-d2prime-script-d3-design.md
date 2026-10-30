# 인계 노트 — 2026-10-29, 009 D-2′ 스크립트 · D-3 fin 설계 확정

직전 노트: `2026-10-28-d2-fit-discord-inbound.md`. **이 노트가 최신이다.**

## 이 세션에서 한 일

**서비스 영향: 0 — https 읽기만**(서비스 저장소 쓰기 0 · Claude 서버 접근 0 · 운영 봇·DB 접촉 0 · Release 0). **로컬 격리 자원: 0**(봇·웹 기동 없음 · DB 쓰기 없음 · 서브에이전트는 전부 읽기 + 지정 파일 1개).

| # | 이슈 → PR | 내용 |
|---|---|---|
| 1 | #376 → #378 | **D-2′ 실행 수단** — `deploy/telegram-polling.sh fit off\|on [--dry-run]` + `.cjs` + 테스트 30(deploy 전체 250 OK). 앱 `.env` `TELEGRAM_POLLING` 한 줄 → `pleiades-fit-bot` 재시작 → 판정 양식. 9-1 리뷰 major 2(4014 강등 미검사 · 되돌림이 Discord 에 묶임) 반영 · 봇 0 · CI 5 pass |
| 2 | #377 → #379 | **D-3 fin 설계 확정** — `_workspace/009/d3/`(측정 → 초안 3회 → 감사 2회 · 정정 4 → 0) · 009 정정 블록 3(§3 L20 · §4-1 · §6 D-3) · 사용자 UQ-1~5 전부 권고안 |
| 3 | #380 | 이 인계 |

## 결정된 것

| | 결정 | 누가 |
|---|---|---|
| D-3 UQ-1 | fin 로컬 실측 승인(검증 fin 봇 포털 토글 · 로컬 키 기입 · fin 봇 기동 · `pleiades_fin` 쓰기 · 직접 입력) | 사용자 2026-10-29 |
| D-3 UQ-2 | `Transaction.userId` — Discord 확정 행 = `discord:<userId>` · 텔레그램 행 그대로 · 스키마 0 | 사용자 |
| D-3 UQ-3 | 판단 분리 경로의 서비스 유래 결함 4(`알림설정` 한글 인자 · 커스텀전략 오류 원문 · plain `&amp;` · DB 확정 뒤 원본 수정 실패의 거짓 "실패")는 Discord 에 옮기지 않고 **텔레그램도 함께 고침**(`알림설정` 텔레그램 쪽은 로컬 실측 확인 뒤 · 특성 테스트 커밋 뒤 별도 커밋) | 사용자 |
| D-3 UQ-4 | 병행 중 AI **대화** 동시 실행 플랫폼별 허용(chat 단위 1건 그대로) | 사용자 |
| D-3 UQ-5 | 릴리즈·켜기 = D-2 와 같다(일반 Release · 서버 조치 없음 · `discord-inbound.sh fin on` · 키 `DISCORD_CHANNEL_ID_FINANCE_CHAT` = 알림 채널 값) | 사용자 |
| D-3 수단 | **chat 변경 0** · 영어 이름 명령 `!` · 한글 28 = 정규식 그대로(`hears`) · 버튼 한도 초과는 앱 어댑터가 행 재배치 · PR **1a(소비·거래) → 1b(AI `ai.ts`) → 2(나머지·`/브리핑`·`/report`) → 3(Discord 수신 + `discord-inbound.sh` 앱 인자화)** 순차 | 설계 PR #379 (감사 통과) |

## 결정되지 않은 것

| | 내용 | 언제 |
|---|---|---|
| **C-11 실사용 결과** | 운영 fit 채널 §4-2 전 행 1회(AI·Vision·Garmin 성공은 로컬 미확인) | 10-31 16:57 전까지 — 사용자 |
| D-2′ 실행 | C-11 통과 뒤 사용자 서버 실행(아래 절차) | 10-31 16:57 뒤 |
| D-3 착수 직전 측정 | X-2 운영 카테고리 수(서비스 DB → 사용자) · X-3 `/report` PDF 크기 · X-1·X-4~X-6(로컬) — `02_writer_d3_r3.md` §3-3 | X-2·X-3 은 PR-3 전 |
| 기존 미결 | #365(2번) · #368 · #373 · #359 · #333 · 이전 노트의 오전 미결 | 그대로 |

## 다음 세션의 첫 액션 후보

1. **D-3 PR-1a — 소비·거래 판단 분리**(`expense.ts`·`trade.ts` · ctx 107 · 응답 모델·상태 키 함수 신설 · pending 값에 플랫폼 · `requestedByUserId: string` 이되 `from` 없음 = 거부 유지 · 정규식 상수 3). **특성 테스트 먼저**(`vi.mock` 모듈 대체 + 가짜 Bot 핸들러 캡처 · 테스트마다 모듈 전역 pending 리셋 · 선례 `vest-confirm.test.ts`) · 텔레그램 호출열 무변경 · 9-1 필수. 정본 = `_workspace/009/d3/02_writer_d3_r3.md` §4·§5 · T 표. 되돌리기: revert(**즉시** · 릴리즈 전).
2. **C-11 결과 받기 → D-2′ 실행 판정 기록**(사용자 결과 블록 → 이슈 #358 코멘트 · 실패 행은 PR). 되돌리기: `telegram-polling.sh fit on`(**즉시**).
3. 작은 것: #373 · #368 · #359 · #333.

## 주의사항

- **서비스 영향 0 원칙** — 이 세션 0 · 로컬 자원 0.
- **D-2′ 스크립트는 fit 만**(fin 은 stop 2 "D-3′"). 실행 전제: Discord 대화 채널 키 설정됨(아니면 바꾸기 전에 멈춘다). off 판정은 **4014 강등 0** 까지 본다 — "메시지 수신 켜짐" 줄은 기동 때 키만 보고 찍히므로 그것만으로 Discord 수신을 믿지 않는다. on 은 텔레그램 쪽만으로 판정(Discord 비정상은 결과 문구 `(Discord 비정상 — …)`).
- **1-5 기준은 상태 기록**(`apps/fitness/logs/telegram-polling-fit.json`) — `.env` 가 아니다(앱과 같은 기준).
- D-3 PR-2 는 PR-1b 뒤 **순차**다(`/report` 파일 단계가 응답 모델을 바꾼다 · 재감사 [A2]#1).
- D-3 의 `/브리핑` 주입: 텔레그램 notifier 는 실패를 `sent=0` 으로 삼키고 chat `ctx.reply` 는 throw 한다 — 분할·재시도는 텔레그램 = notify 코어 · Discord = 어댑터(감사 [A]#3). `notifier.ts:13` "항상 텔레그램" 주석은 PR-2 에서 고친다.
- **정정된 기록:** 009 L20 "fin 식별자 컬럼 0" → `Transaction.userId` 1(§3 정정 블록).
- **서브에이전트 산출은 그대로 믿지 않는다** — 이 세션도 9-1 리뷰 major 2 를 앱·gateway 코드와 대조한 뒤 반영했다(`discord-interactions.ts:87` · `gateway.ts:274-278`).
- dotenv 17 은 같은 키가 여러 줄이면 **뒤 줄이 이긴다**(로컬 확인) — `.env` 를 고치는 스크립트는 모든 유효 줄을 같은 값으로 바꾼다.
- 세션 시작 관측: dev `3a4d28d` · 열린 PR 0 · 수용 fin `3685b2ca138c`·fit `35a04d78e532` 최신(서비스 동결) · secrets 저장소 0 · production 허용 목록 4 · `tag:v*` → 끝 dev `972471c`. **인계보다 현재 상태를 믿는다.**
- `MEMORY.md` 29줄 안팎. 응답은 한국어.

## 재현이 필요한 절차

- **D-2′ 서버 실행(사용자):** `~/pleiades-fit/deploy/telegram-polling.sh fit off --dry-run` → `… fit off` → 판정 양식 블록만 세션에 붙인다 → 텔레그램 `/today` 무응답 · Discord `!today` 응답 1회. 되돌리기 `… fit on`(밀린 업데이트 버림 1 확인). 종료 코드: 0 통과 · 1 바꾸기 전 중단 · 3 판정 실패(off 면 스크립트가 병행으로 되돌림).
- **설계 파이프라인(이 세션 형태):** 측정(repo-surveyor · 파일 1) → 초안(decision-writer) → 감사(reversibility-auditor) → 같은 에이전트에 SendMessage 로 회차 이어가기 → 정정 0 이면 UQ 를 AskUserQuestion → 정본 정정 블록 + `_workspace/` 기록 PR.
