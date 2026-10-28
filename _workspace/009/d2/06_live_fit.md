# 009 D-2 PR-3 — fit 봇 번들 로컬 실측 (#367)

2026-10-28 · 사용자 승인 UQ-1(검증 Discord 봇 · 검증 서버 · `pleiades_fit` 쓰기 · 사용자 직접 입력). 브랜치 `feat/367-fit-discord-inbound` 를 본 체크아웃에서 `tools/local/run.sh fit -- npm run build` 로 빌드한 **실제 봇 번들**을 텔레그램 토큰을 비운 채 기동: `zsh -ic "tools/local/run.sh fit -- node -e \"process.env.TELEGRAM_BOT_TOKEN='';…require('./dist/bot/standalone.cjs')\""`(`check_env: fit 통과`). 대화 채널 = 알림 채널(루트 `.env` 키 같은 값 — "같음" 만 확인). advisor·Vision CLI 는 로컬 차단(L-7 · `claude-disabled`) · Garmin 계정 비움(I-6). 끝난 뒤 봇 프로세스 0. 원본 로그·ID 는 저장소 밖.

**기동 로그:** `[discord-fit] 메시지 수신 켜짐(대화 채널)` · `[bot] 텔레그램 토큰 없음 — 폴링 안 함(크론·Discord 는 그대로)` · `[discord-fit] gateway 준비 완료` · 크론 등록 줄. 실행 내내 `gateway 종료 코드` · `IDENTIFY 보호` · `미허용(4014)` **0**.

| # | 입력 | 결과(사용자 화면 + 로그) |
|---|---|---|
| 1 | `!start` | 도움말 · 명령이 `!명령` 으로 안내 |
| 2 | `!today` | "오늘 데이터가 아직 없습니다. !sync 로 싱크해보세요." — **실측에서 깨진 문자(U+FFFD ×3) 발견 → 원래 소스 결함(#365 1번) · 이 PR 에서 수정 `64fe621`**(텔레그램 문구도 함께 · 의도된 변경) |
| 3 | `!weight` | 정상 |
| 4 | `점심 김치찌개 1인분` | 식단 기록 · 수정·삭제 버튼(kcal 추정은 로컬 CLI 차단 — 로그 `[nutrition] spawn 실패`) |
| 5 | 4의 kcal 수정 → `650` | 편집 대기 → kcal 650 정정 |
| 6 | 식단 → 삭제 버튼 | 삭제 안내 |
| 7 | `!food_kcal <id> 500` | 정상 |
| 8 | AI 질문 | 사용자용 실패 안내(원문 없음) · 로그 `[handleAiQuestion] 실패: … claude-disabled`(로컬 차단 · 정상) |
| 9 | 사진 + 캡션 | 진행 안내 → 분석 실패 안내 · 진행 안내 삭제 · 로그 `[nutrition-photo] spawn 실패`(로컬 차단) |
| 10 | `!reset` | 세션 초기화 안내 |
| 11 | `!sync` | **정적 실패 안내**(원문 없음 · #365 2번의 Discord 판) · Garmin 전 항목 실패(I-6 · 접속 0) · 봇 프로세스 경로라 관리자 알림 1회(검증 웹훅 — `!bot` = 웹 의미 보존 1-7) |

**서버 병행에서 확인할 것(로컬 불가):** AI 답 성공 · Vision 성공 · Garmin 싱크 성공 · 운영 포털 토글 · 켜기 스크립트 판정 양식(`deploy/discord-inbound.sh`).
