# 인계 노트 — 2026-10-19, 서비스 동결 · 최종 수용 · T-1a 로컬 pm2 예외

직전 노트: `2026-10-16-m6-done-cutover-design.md`. **이 노트가 최신이다.**

## 이 세션에서 한 일

**서비스 영향 0 — 서비스 저장소 쓰기 0 · 서버·pm2·서비스 DB·서비스 텔레그램 봇·외부 계정 무접촉 · 서비스 원격은 https 읽기(`ls-remote` · 수용 clone `--no-tags` 스크래치)만.** 외부 트래픽: npm 레지스트리 · PyPI(`git-filter-repo==2.47.0` 스크래치 venv) · fin `build` 의 `smoke:bot` 이 가짜 토큰으로 Telegram `getMe` 1회(실패 · 서비스 봇 아님).
**로컬 격리 자원:** `pleiades_fin` 에 `migrate deploy`(8절 선행 · 수용분) · `pleiades_fit` 무변경(**미적용 마이그레이션 6** — OMRON 1 + 이번 수용 5) · 루트 `.env` 무변경 · **pm2 는 한 번도 실행하지 않았다(`.pm2-local/` 없음)** · 기동 프로세스 0.

1. **#166 머지 확인**(직전 인계 PR).
2. **fin·fit 최종 수용**(#167 → PR #169 · 머지 `644972c` 부모 2) — fin `55404173bd9c` → `3685b2ca138c`(충돌 2: `package.json` = theirs + notify `file:` · lock theirs → `npm install`) · fit `0b3ccd4c33c2` → `6f174d2546b5`(무충돌 · `standalone.ts` 에 서비스 `ensureDefaults()` + pleiades gateway 공존). 8절 fin 938 · fit 797 · 사전 리뷰 0/0/2(pleiades 통합분 diff 머지 전후 동일). Codex P2 1(서비스 유래) → #170.
3. **T-1a 로컬 pm2 격리 예외**(#171 → PR #172 `c6b0e25` · squash · 트리 대조 orphan 0) — 사전 리뷰 2회(critical 1·major 3) + Codex 4회(P1 3·P2 2 → 마지막 👍). 훅 무변경 · `precheck.py` pm2 허용 목록(닫힌 인자 집합) · `run.sh` `PM2_HOME` 고정.
4. 후속 이슈 #168(CI fit Node 20 ↔ 서비스 24) · #170(fit prompt_run reload 겹침 고아 run · 서비스 유래).
5. 이 인계(#173).

## 결정된 것 (사용자 2026-10-19)

| | 결정 |
|---|---|
| **서비스 동결** | **myFinance·myFitness 개별 프로젝트는 pleiades 진행을 위해 동결.** #167 수용이 기준점(fin `3685b2ca138c` · fit `6f174d2546b5`) — 수용 추적 종료가 아니라 "더 움직이지 않음" 전제 |
| 로컬 pm2 예외 | **승인**(Q85 ①+② 유지) — 정본 `isolation.md` I-3 행 · 007 Q85 확정 블록 |
| T-1 분할 | **4 PR**: ① T-1a pm2 예외(완료) ② T-1b 루트 `deploy/` 스크립트 + `deploy/pleiades.config.cjs` + `.gitignore` 상태 경로 + 서버 `.env` 키 템플릿 ③ T-1c 크론 전수(M1) + 알림 경로별 실응답 목록(G-d) ④ T-1d 로컬 리허설(pm2 판 포함) + `workflow.md` 릴리즈 전략 개정 |
| pm2 이름 | **`pleiades-<fin\|fit>-<역할>`**(Q77 "새 pm2 이름" · 서비스 `myfinance*`·`myfitness*` 와 분리) — precheck 가 강제 |
| 루트 설정 파일 | **`deploy/pleiades.config.cjs`**(이름에 `ecosystem.config` 를 쓰지 않는다 — I-19 정규식과 분리 · 007 §4-1 "루트 ecosystem" = 이 파일) |

## 결정되지 않은 것

| | 내용 | 언제 |
|---|---|---|
| Q79 해석 | "서비스 병행" = 첫 릴리즈 뒤 서비스 운영 계속(기록대로)인지, 서버 동시 기동인지 | T-3 전 · 사용자 |
| **동결과 T-5a** | 007 F-1 은 **fit 서비스가 dev 를 먼저 릴리즈**(마이그레이션)해야 전환 가능 — 동결 중에도 이 릴리즈 1회는 필요하다 | T-5a 전 · 사용자 |
| U1~U14 | 서버에서만 알 수 있는 사실(007 §8) | T-2(사용자) |
| #168 · #170 · #157 · #137 · #126 | CI Node · reload 고아 run(T-1b reload 방식과 함께) · gateway 동적 시작 · lastError · npm audit | #170 은 T-1b 에서 판단 |
| I-1 예외 룰 | 서비스 결함 이슈만 서비스 저장소 허용 여부 — 동결로 실익 감소 | 사용자 |

## 다음 세션의 첫 액션 후보

1. **T-1b** — 루트 `deploy/deploy.sh <app>`(정리 단계 없음 · `git clean`·`add -A` 금지 · 첫 전환은 `migrate deploy` 제외) · `deploy/pleiades.config.cjs`(`pleiades-<app>-<역할>` · `path.join(__dirname, 'apps/<app>')` · **포트 env 누락 시 기동 거부** · shim 포함 PATH 는 리허설 조건) · 루트 `.gitignore` 끝 `/` 없는 상태 경로 · 서버 `.env` 키 템플릿(값 없음 · [S] §3). reload 방식은 #170 을 보고 정한다(`startOrReload` 겹침 vs restart). pleiades 안 · 되돌리기 **즉시**.
2. **T-1c** — 크론 전수(fit 웹·봇 둘 다) · 알림 경로별 실응답 확인 목록. 문서·실측 · **즉시**.
3. #168(작음 · **즉시**).

## 주의사항

- **원칙: 서비스 영향 0** — `isolation.md`. 해제는 007 §6 의 T-5c 순간 · 그 앱 서버 `.env` 범위뿐.
- **세션 시작 관측:** dev clean · secrets 0 · 수용 fin 뒤처짐(`55404173bd9c` → `3685b2ca138c`) · fit 뒤처짐(`0b3ccd4c33c2` → `6f174d2546b5`) → 이번에 수용 · **세션 끝: 둘 다 최신**. **동결 이후 resume Step 2 가 다시 뒤처짐을 보이면 자동 수용하지 말고 사용자에게 먼저 알린다**(동결 위반 가능성).
- **로컬 pm2 는 `tools/local/run.sh <app> -- npx pm2 …` 만.** start = `<루트 설정> --only pleiades-<이 앱>-<역할> [--update-env]` · 관리 대상 = 그 앱 이름만(`all`·id·`resurrect` 없음) · **정리(`stop`·`delete`·`kill`)도 `check_env` 를 거친다** — 실패하면 검증 id `export` 후 재시도(알려진 한계). 직접 `pm2`·`npx pm2` 는 훅이 막는다. 데몬 `.pm2-local/`(gitignored).
- **`deploy/pleiades.config.cjs` 는 아직 없다** — T-1b 가 만든다. precheck 는 경로만 대조하므로 지금 start 를 치면 precheck 는 통과하고 pm2 가 파일 없음으로 실패한다.
- **fit 서비스가 Node 24(.nvmrc · fit#556)** — 로컬 20.18 · CI 20 으로 8절은 통과(#168).
- **fin `npm run build` 끝에 `smoke:bot`**(fin#518) — 가짜 토큰으로 봇 번들을 띄워 Telegram `getMe` 1회 후 종료(DB·Discord·서비스 봇 무접촉).
- **fit 로컬 DB 미적용 마이그레이션 6** — 로컬 기동 전 `run.sh fit -- npx prisma migrate deploy`.
- **검증 채팅 id 는 `apps/*/.env` 의 `TELEGRAM_*_CHAT_IDS` 에서 읽어도 된다**(사용자 2026-10-19) — 값을 출력하지 말고 스크래치 파일로 `PLEIADES_VERIFY_CHAT_IDS` 에 넣는다.
- `MEMORY.md` 23줄(한도 200). 응답은 항상 한국어.

## 정정된 기록

- *"Q85 ① 은 isolation.md + 훅 + 훅 테스트를 바꾸는 PR"*(007 PR #164 정정 블록) → **훅은 무변경** — 예외는 `precheck.py` 한 곳 + `run.sh` `PM2_HOME`(007 확정 블록).
- *"정리 명령은 env 검사 없이 돌 수 있어야 한다"*(PR #172 Codex 1회차 P2 반영) → **폐기** — 데몬이 없으면 pm2 가 검사 안 된 env 로 새 데몬을 띄우고 남긴다(2·3회차 반례). 모든 pm2 가 `check_env` 를 거친다.

## 재현이 필요한 절차

- **정기 수용**(동결 후에는 사용자 확인 먼저): 직전 노트 절차 그대로. 두 앱을 한 브랜치에서 이어 수용 가능(STATE.json 앱별 키 · PR 1). 충돌 커밋은 `--no-edit` 후 메시지의 `# Conflicts:` 이하를 지우고 `commit --amend --cleanup=strip -F`.
- **Codex 라운드가 같은 영역에서 2회 이상** → 덧대지 말고 허용을 좁힌다(PR #172 3회차 — 생략 경로 폐기 후 4회차 👍).
