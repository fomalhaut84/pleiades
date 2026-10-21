# 인계 노트 — 2026-10-15, M-5 · M-6a · M-6b-1~3 (notify 통합 · Discord)

직전 노트: `2026-10-01-m4-done.md`. **이 노트가 최신이다.**

## 이 세션에서 한 일

**서비스 영향 0 — 서비스 저장소 쓰기 0 · 서버·pm2·서비스 DB·서비스 텔레그램 봇·Garmin·Whooing·MFDS 무접촉 · 서비스 원격은 https 읽기(`ls-remote`·수용 clone)만.** 외부 트래픽은 npm 레지스트리 · 텔레그램 API(검증 봇 → 검증 채팅) · **Discord API(검증 서버 · 사용자가 만든 웹훅 3 · 비공개 봇 2)**.
**로컬 격리 자원:** `pleiades_fin`·`pleiades_fit`(무변경 · 읽기만) · `apps/*/.env` · **신규 pleiades 루트 `.env`(사용자 작성 · gitignore · 플랫폼 키: 채널 스위치 · Discord 웹훅 · 봇 토큰 2 · 채널 ID · 허용 사용자 ID)**. **기동 프로세스 0**(검증 스크립트는 전부 1회용 · 종료 확인).
검증 채널에 보낸 것: 텔레그램 검증 채팅(M-5a 분할 3 · M-5b RSU 키보드 1 · M-6a 키보드 1) · Discord `#finance`(서식 · 분할 · PDF · 버튼) · `#fitness`(텍스트 · 버튼 ×3).

1. 최종 그림 기록 — 두 앱은 pleiades 모듈로 내재화, 전환 시 서비스 종료(#127 → #128 · 006 Q60 · 002 Q2 답 "포기").
2. fit 정기 수용(#129 → #130 · fit#506·fit#509 · 서비스 유래 결함은 #131 기록).
3. **M-5a**(#132 → #133) fit notify 통합 · **M-5b**(#136 → #138) fin notify 통합(Q27 흡수 · `/브리핑` 단독 발송 보존) · 상태 기록 #134→#135 · #139→#140.
4. **M-6a-1**(#141 → #142) `createDiscordTransport`(웹훅) · `htmlToDiscordMarkdown` · `splitDiscordMarkdown`.
5. **M-6a-2**(#143 → #144) 두 앱 라우트별 스위치 · **플랫폼 설정 = 루트 `.env` + `platformEnv`** · 상태 기록 #145→#146.
6. **M-6b-1**(#147 → #148) 분기 PDF 를 Discord 웹훅 첨부(`sendDiscordFile`).
7. **M-6b-2**(#149 → #150) `createDiscordBotTransport` + `createDiscordGateway`(ws) · 실수신 fin·fit 봇.
8. **M-6b-3**(#151 → #152 `9ae924c`) fit 자동조정 버튼 Discord(`decideAutoAdjust` 분리 · gateway 를 fit 봇 프로세스에) · 실수신.
9. 이 인계(#153).

## 결정된 것 (사용자 2026-10-15)

| | 결정 |
|---|---|
| 최종 그림 | 두 앱은 pleiades 모듈로 내재화 · 전환 시 서비스 종료 · 그 전까지 무영향 원칙 절대 |
| 수용 충돌 원칙 | 비즈니스 로직 = 서비스(theirs) · 플랫폼 통합 지점(notify 연결 · `file:` 줄 · CI) = ours 재적용 · CI 녹색이 머지 조건(006 §4-S) |
| Q27 | fin `rsu.ts` 흡수 |
| Discord 텍스트 | 라우트별 스위치 `NOTIFY_ALLOWED_CHANNEL` · `NOTIFY_ADMIN_CHANNEL` = `discord` · 기본 텔레그램 |
| **플랫폼 설정 위치** | **pleiades 루트 `.env`** — 앱이 늘어도 한 곳 · 앱이 `platformEnv` 로 직접 읽는다(run.sh·npm run dev·pm2 무관 · 수정 시각이 바뀌면 재읽기) · 앱 `.env` 의 플랫폼 키는 `check_env` 차단(run.sh 경유만) |
| M-6b 수신 | 봇 gateway(아웃바운드 WS) · **앱별 비공개 봇 2개** · 버튼 스위치 **`NOTIFY_INTERACTIVE_CHANNEL`** 별도 · 허용 = **사용자 ID AND 채널 ID** · DB **D-a**(스키마 무변경 · Q61) · 첨부는 포트 밖 헬퍼 |
| `ws` 위치 | 루트 `dependencies`(file: 링크는 패키지 의존성을 설치하지 않는다) · 두 앱 봇 번들에 포함 |

## 결정되지 않은 것

| | 내용 | 언제 |
|---|---|---|
| **M-6b-4** | fin RSU vest 버튼 Discord — Discord 3초 제한 때문에 vest 확정(종가 조회·트랜잭션)은 지연 응답 후 원본 수정 구조 · `vest-confirm.ts` 의 도메인 분리(`rsu-vest-service` 는 이미 분리) | 다음 세션 첫 후보 |
| Q60 전환 설계(007) | 배포 경로 · DB 이전 · 서비스 저장소 보관 · 시점 — 루트 `.env` 가 플랫폼 설정의 출발점 | 첫 릴리즈(#88) 전 필수 |
| #137 | fin `lastError` raw 저장 sanitize | 낮음 |
| #126 | npm audit 자동 이슈 | 낮음 |
| ALT-d 위임 키 정리 | 루트 `main`·`types`·`exports`·`files` — `prepare` 는 유지 · 루트 lock 삭제 금지(006 ㉒ C1) | 별도 이슈 |
| I-1 예외 룰 | 서비스 결함 이슈만 사용자 승인 후 서비스 저장소 허용 — 제안만 · 미결 | 사용자 |
| 남은 info | gateway INVALID_SESSION 대기 jitter · `ws` 를 `packages/notify/package.json` 에도 선언할지 | 필요 시 |
| Q65 · X8 | draft 봇 리뷰 · 로컬 advisor | 기존 그대로 |

## 다음 세션의 첫 액션 후보

1. **M-6b-4 — fin RSU vest 버튼 Discord**(fit 과 같은 형태: `vest-confirm.ts` 판단 분리 → fin 봇 프로세스 gateway · `interactiveNotifierFor` 스위치). 착수 직전 fin 수용 0 확인. 되돌리기 **즉시**. 실수신은 없는 RSU id 로(만료 안내) — DB 쓰기 없음.
2. M-6 완료 기록(M-6b-4 후 · 006 §4-7 · CLAUDE.md).
3. 전환 설계(Q60 · 스펙 007) 착수.

## 주의사항

- **원칙: 서비스 영향 0** — `.claude/rules/isolation.md`. 이번 세션도 0.
- **세션 시작 관측:** dev clean · secrets 0 · 수용 fin `55404173bd9c` 최신 · fit `a984b856e44b`→`7d1eb99faee1` 수용(#130). 다음 세션은 resume Step 2 결과를 신뢰한다.
- **루트 `npm ci` 가 이제 더 중요하다** — `packages/notify/dist` 와 **`ws`**(gateway)를 루트가 설치한다. 두 앱 8절·CI 모두 선행.
- **루트 `.env` 는 비밀이다**(봇 토큰·웹훅). 열지 않는다 · 값은 출력하지 않는다(있음/없음만). 플랫폼 키를 앱 `.env` 에 두면 루트 값을 가린다.
- **fit 봇 프로세스는 봇 토큰·채널이 있으면 gateway 를 상시 연다**(스위치 무관) — 로컬 기동(M-4 절차) 시 Discord 접속이 하나 생긴다. fin 은 M-6b-4 전까지 gateway 없음.
- **push protection**: 테스트에 Discord 토큰 **형식**의 리터럴을 두면 push 가 막힌다(#150) — 가짜 토큰은 실행 중 조합한다. 막히면 우회(허용 처리)하지 않는다.
- **스크래치 검증 스크립트는 앱 `.env` 를 직접 불러야 한다**(`createRequire(apps/<app>/package.json)('dotenv').config()`) — `run.sh` 가 셸 `DATABASE_URL` 을 지운다.
- `apps/finance` 파일을 읽으면 서비스 skill 이 발견되지만 실행하지 않는다(I-10).
- 사용자 선호: **응답은 항상 한국어**(메모리 · 압축 직후 영어 회귀 2회 지적).
- `MEMORY.md` 23줄(한도 200).

## 정정된 기록

- *"Discord 는 웹훅으로 충분"* → 버튼은 채널 웹훅으로 못 보낸다 — 봇 필요(M-6b 감사 B1).
- *"1b-2a 되돌리기 중간(PM2/Nginx)"* → 전환 전 pleiades 안에서는 **즉시**(003 §8-2 정정 후보 · M-6b 감사).
- *"1b-2d DB 단계"* → D-a 로 할 일 0.
- *"run.sh 가 플랫폼 키를 넘긴다"*(#144 중간 커밋) → 최종은 앱이 `platformEnv` 로 직접 읽는다.

## 재현이 필요한 절차

- **Discord 봇 준비**: Developer Portal → New Application → **Installation 탭 Install Link = None** → Bot 탭 Public Bot 끄기(순서가 반대면 "비공개 애플리케이션은 기본 승인 링크를 가질 수 없어요" 오류) · Privileged intents 모두 끔 · OAuth2 URL Generator(scope `bot` · View Channels·Send Messages·Read Message History·Attach Files)로 초대.
- **실수신 검증 스크립트 형태**: 스크래치 `.ts` → `tools/local/run.sh <app> -- npx tsx <file>` · 앱 모듈은 `path.join(process.cwd(), 'src/...')` 로 import · 패키지는 `createRequire(...)('@pleiades/notify')` · 봇·gateway 는 1회용(최대 180초 후 stop).
