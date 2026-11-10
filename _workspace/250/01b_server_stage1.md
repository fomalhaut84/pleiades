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

## 추가 측정 (2026-11-10 · 사용자 서버 실행 · `.server-scripts/19-server-008-stage1-extra.sh` · PR-1 전 X-1 · X-2 · X-4)

| # | 항목 | 판정 | PR-1 영향 |
|---|---|---|---|
| V14 (X-1) | MCP `-out` 줄 형식 | fin·fit 최근 줄 전부 **pm2 시각 접두(`YYYY-MM-DD HH:mm:ss: `) + JSON** · 전부 `level` 키 · **`level` 값은 문자열**(fin `info`·`warn` · fit `info`) — 숫자 아님 | 오류 판정 = `level` ∈ {`error`,`fatal`}(문자열) · 숫자 50·60 도 받는다(로거 설정이 바뀔 때) |
| V15 (X-2) | `pm2 jlist` 모양 | 출력 1줄 · JSON 이 첫 줄에서 시작(앞 경고 줄 0) · 프로세스 11 중 `pleiades-*` 6 · 6 모두 `name`·`pm_id`·`status`·`restart_time`·`unstable_restarts`·`pm_uptime`·`exec_mode`·`monit.memory`·`monit.cpu` 있음 · status online 6 · exec_mode `cluster_mode` 6 | 허용 목록 필드 확정 · `pleiades-*` 거르기 필수 · 앞 경고 줄 방어는 남긴다(B-1) |
| V16 (X-2) | 실행 환경 | pm2 = npm 전역 · 첫 줄 `#!/usr/bin/env node` · pm2·node 모두 nvm 아님 · `/usr/bin/node` 있음 · **`flock(1)` 있음** | `process.execPath <pm2 bin>`(E-2) · crontab node 경로 고정 쉽다 · 잠금 (i) 기본 + crontab `flock -n` 덧대기 가능(§2-3 (ii)) |
| V17 (X-4) | 역할·스트림별 24 h 증가 | 12칸 모두 KB 단위(최대 24 KB/일) · 줄 수가 꾸준한 out = fin bot · fin mcp · fit web · fit bot · fit mcp · fin web out 은 하루 18줄로 적다 · `-error` 대부분 조용 · **fit web error 하루 77줄**(기준선 소음 후보) · bot 로그 파일 앱마다 약 30개(배포마다 pm_id 교체 누적) | C-7 ② 침묵 감지 = 꾸준한 out 5개만 켠다 · fin web out · 모든 `-error` 는 끈다 · fit web error 의 정체는 dry-run 지문별 판정에서 · 파일 수 많음 → glob + inode·오프셋(E-8) |
