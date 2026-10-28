# 009 D-1 PR-3 — fin 로컬 실측 (#349)

2026-10-28 · 사용자 승인 범위 = **자동 항목만**(검증 Discord·텔레그램 봇 · `pleiades_fin` · advisor 차단 그대로 · 사용자 조작 없음). 실행은 `zsh -ic 'tools/local/run.sh fin -- node -e "…require(\"./dist/bot/standalone.cjs\")"'`(빌드 번들 · `check_env 통과`) · N 초 뒤 SIGINT → 정상 종료 · 끝날 때마다 남은 프로세스 0. 원본 로그는 저장소 밖.

| # | 요구 | 방법 | 결과 |
|---|---|---|---|
| ① | 1-2 · 1-3 · E3 토큰 없이 기동 | `TELEGRAM_BOT_TOKEN=''` 25 s | `[cron] … 등록` 7줄(lib/cron 7) + `[notification] 알림 스케줄러 등록 (…)`(13) — **토큰 게이트 제거로 토큰 없이도 20 전부** · `[bot] 텔레그램 토큰 없음 — 폴링 안 함` · `[discord-fin] gateway 준비 완료` · 상태 `off` · 부팅 시드 `EarningsCache empty → 초기 시드` 는 로컬 DB(attempted 0) |
| ③ | 1-9 · 0-5 IDENTIFY 차단 · 1-4 | `logs/identify-fin.json` 1시간 안 100회 선채움 → `TELEGRAM_POLLING=off` 로 15 s 기동 2회 | 1회차 `[bot] 텔레그램 폴링 꺼짐(TELEGRAM_POLLING=off)` · `[discord-fin] IDENTIFY 보호 — local-limit · 100/100` · 보류 · ADMIN 알림 1회(`미전송` 경고 없음) · 2회차 보류만 · 알림 0(`alertedAt`) · 기록은 원래대로 되돌림 |
| 1-6 | 스모크 `--smoke` | `npm run build`(→ `build:bot` → `smoke:bot`) | `[smoke:bot] OK — main() 진입 확인` · 진입점은 마커 직후 `--smoke` 로 종료 |
| M-2 | 웹 번들에 chat 없음 | `.next/server`·`.next/static` vs `dist/bot/standalone.cjs` 에서 `session_start_limit`·`createIdentifyGuard`·`fileGuardStore`·`packages/chat` | bot 1·6·6·18 · web 0·0·0·0 |

②(밀린 업데이트 버림)·④(버튼)는 사용자 결정으로 갈음 — ②는 fit 과 같은 `telegram-polling` 모듈(fin 판은 같은 코드 · 단위 테스트 21)과 fit 실측 ②b·②c(`05_live_fit.md`) · ④는 단위 테스트(`discord-interactions.test.ts`)와 fit 실측 ④(같은 chat 버튼 경로).
