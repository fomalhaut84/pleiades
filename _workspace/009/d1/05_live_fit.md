# 009 D-1 PR-2 — fit 로컬 실측 (#347)

2026-10-28 · 사용자 승인(검증 Discord 봇 · 검증 텔레그램 봇 · `pleiades_fit` · advisor 차단 그대로). 실행은 전부 `zsh -ic 'tools/local/run.sh fit -- node -e "…require(\"./dist/bot/standalone.cjs\")"'`(빌드 번들 · `check_env 통과` · `zsh -ic` 는 `~/.zshrc` 의 검증 봇 허용 목록을 읽기 위해) · 각 실행은 N 초 뒤 스스로 SIGINT → 정상 종료 · 끝날 때마다 남은 프로세스 0. 원본 로그는 저장소 밖(스크래치).

| # | 요구 | 방법 | 결과 |
|---|---|---|---|
| ① | 1-2 · 1-3 토큰 없이 기동 | `TELEGRAM_BOT_TOKEN=''` 25 s | `[bot-cron] 알림 스케줄 등록 완료`(크론 5) · `[bot] 텔레그램 토큰 없음 — 폴링 안 함` · `[discord-fit] gateway 준비 완료` · 상태 파일 `off` |
| ③ | 1-9 · 0-5 IDENTIFY 차단 | `logs/identify-fit.json` 을 1시간 안 100회로 선채움 → 15 s 기동 2회 | 1회차 `[discord-fit] IDENTIFY 보호 — local-limit · 100/100` + 보류(크론은 등록) · 알림 1회(검증 웹훅 · 전송 실패 로그 0) · 2회차 보류만 · 알림 0(`alertedAt`) · 기록은 원래대로 되돌림 |
| ②a | 1-4 폴링만 끔 | `TELEGRAM_POLLING=off` 12 s | `[bot] 텔레그램 폴링 꺼짐(TELEGRAM_POLLING=off)` · gateway 준비 · 상태 `off` |
| ②b | 1-5 꺼진 동안 쌓인 업데이트 | 상태 `off` → 사용자 1건 전송 → 정상 기동 30 s(추가 전송 없음) | `Long polling 시작 (밀린 업데이트 버림 — 직전에 꺼져 있었다)` · 처리 0(AI 경로 로그 0 · 답장 없음) · 상태 `on` |
| ②c | 1-1 정상 재시작 사이 메시지 | 상태 `on` → 사용자 1건 → 정상 기동 30 s | `Long polling 시작`(버림 없음) · 처리 1(advisor 차단 오류 답장 = 수신·처리 증거) |
| ④ | 1-8 버튼 gateway → chat | 정상 기동 90 s · 검증 채널에 시험 버튼(`auto_adjust:accept:<없는 id>` · `vest:…`) · 사용자 클릭 | 사용자 확인 — "이미 만료된 제안입니다." · "알 수 없는 요청입니다." 안내(본인만) · DB 쓰기 0(없는 id · 로컬 DB 읽기) |
| M-2 | 웹 번들에 chat 없음 | `next build` + `build:bot` 뒤 `.next/server`·`.next/static` 과 `dist/bot/standalone.cjs` 에서 `session_start_limit`·`createIdentifyGuard`·`fileGuardStore`·`packages/chat` 검색 | bot 1·6·6·18 · web 0·0·0·0 |
| M-5 | grammY `drop_pending_updates` 전달 | `apps/fitness/node_modules/grammy/out/bot.js:294-295` | `start()` 가 `deleteWebhook({ drop_pending_updates })` 로 넘긴다 |

텔레그램 쪽 AI 오류 답장은 로컬 advisor 차단(I-8 · `CLAUDE_BIN=/nonexistent/claude-disabled`)의 정상 결과다.
