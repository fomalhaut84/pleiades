# 008 단계 1 — 서버 측정 판정 (2026-11-10 · 사용자 서버 실행 · #564)

출처: `.server-scripts/17-server-008-stage1-check.sh`(비추적). **판정만 적는다** — 경로 · 포트 · 계정 · 원문은 옮기지 않는다.

| # | 항목 | 판정 | 설계 영향 |
|---|---|---|---|
| V1 | pm2 데몬 소켓·`$PM2_HOME`·logs 권한 | 소켓 2개와 디렉터리가 모두 775 · 실행자(서비스 사용자) 소유 | 그룹에 열면 RPC 전체가 열린다(01 W1) |
| V2 | 서버 pm2 버전 · RPC 구조 | **6.0.8** · `Daemon.js` 의 chmod 775 줄 2 · 노출 목록에 `getMonitorData`·`stopProcessId`·`killMe` 각 1 — 로컬 7.0.4 판독과 같은 구조 | W1 확정 — 별도 사용자가 pm2 를 읽는 경로는 배제 |
| V3 | 로그 파일 권한 | pleiades 로그 142개 · 644 와 664 섞임 · 가장 큰 파일 1 MB 미만 | W5(pm_id 별 파일 누적)와 맞는다 · glob 수집 |
| V4 | pm2 로그 디렉터리 합계 | **약 2.6 GB** — 거의 전부 **pleiades 밖 다른 프로젝트의 오래된 로그**(마지막 기록 약 7개월 전 · `18-server-pm2-logdir-breakdown.sh`). 옛 fin·fit 서비스 로그는 수 MB(전환 전 프로세스 · 마지막 기록 18~19일 전). pleiades 로그는 1 MB 남짓 | 정리는 사용자(범위 밖 · 편도) · 옛 서비스 로그는 T-8 `--purge` 후보 · **같은 서버에 pleiades 밖 pm2 프로세스가 돈다** → 수집기는 `pleiades-*` 로만 거른다 · 디스크 경보는 파일시스템 전체 |
| V5 | crontab | 실효 줄 1(db-backup) | 수집기도 crontab 한 줄 |
| V6 | systemd user | running 이지만 **linger no** — 로그아웃 뒤 user 타이머 유지 안 됨 | systemd user 타이머 배제 · crontab |
| V7 | pm2 자동 기동 유닛 | 1 | 기존 그대로 |
| V8 | `~/pleiades-ops` | 있음 · 700 · 파일 3 | 수집기 설치 위치 후보(db-backup 선례) |
| V9 | 런타임 | node v24 · curl 있음 | node 스크립트 가능 |
| V10 | 루프백 MCP `/health` | fin 200 · fit 200 | 수집 대상 |
| V11 | 디스크 | 홈 사용률 38% · `/backup` 2% · inode 여유 · **서로 다른 파일시스템** | 경보는 두 곳을 따로 |
| V12 | 시간대 | KST(+0900) | 크론·로그 시각 KST |
