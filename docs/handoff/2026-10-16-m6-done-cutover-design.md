# 인계 노트 — 2026-10-16, M-6 완료 · fit 수용 · 전환 설계 007

직전 노트: `2026-10-15-m6b-fit-buttons.md`. **이 노트가 최신이다.**

## 이 세션에서 한 일

**서비스 영향 0 — 서비스 저장소 쓰기 0 · 서버·pm2·서비스 DB·서비스 텔레그램 봇·외부 계정 무접촉 · 서비스 원격은 https 읽기(`ls-remote` · 수용 clone · 감사용 스크래치 bare 클론)만.** 외부 트래픽: npm 레지스트리 · PyPI(`git-filter-repo==2.47.0` 스크래치 venv) · Discord API(검증 서버 `#finance` · fin 봇 1회용 gateway ≤180초).
**서비스 저장소 이슈 1건은 사용자가 직접 등록했다** — fit#529(OMRON 백필 결함 · 본문은 Claude 가 스크래치에 준비 · pleiades #162 에 비링크 기록). Claude 는 서비스 저장소에 쓰지 않았다(I-1).
**로컬 격리 자원:** `pleiades_fin`(읽기만 — 실수신 검증의 없는 RSU id 조회) · `pleiades_fit` 무변경(**fit 새 마이그레이션 36번째(OMRON) 미적용** — 다음 로컬 기동 전 `migrate deploy`) · 루트 `.env` 무변경 · **기동 프로세스 0**.

1. **M-6b-4**(#155 → PR #156 `d353b33`) — fin RSU vest 버튼 Discord: `decideVest` 분리 · `interactiveNotifierFor` 스위치 · fin 봇 프로세스 gateway · 패키지 무변경(gateway 의 type 6 지연 응답이 3초 제한 해소) · Codex P1 반영(15:35 확정 작업 가드가 버튼 수신자도 본다). 실수신(확정 → NOT_FOUND 본인 안내 · 취소 → 원본 수정) 사용자 화면 확인. fin 테스트 902.
2. **M-6 완료 기록**(#158 → PR #159).
3. **fit 정기 수용**(#160 → PR #161 · 수용 머지 `d4ac311` 부모 2) — 서비스 dev `7d1eb99faee1` → `0b3ccd4c33c2` · 7커밋(OMRON 연동 · deps 상향 · LTHR/maxHR) · 충돌 3(`package.json`·lock = theirs + `file:` 재적용 · `admin-alerts.ts` = ours notify + theirs `OmronAuthError`) · fit 테스트 547. 서비스 유래 P2 → #162(= fit#529).
4. **전환 설계 스펙 007**(#163 → PR #164 `46f198d`) — 실측 → 초안 3회 → 감사 3회(정정 8 → 5 → 2) → 사용자 결정으로 diff 대조 마감 → 정본 `docs/specs/007-cutover.md` · 확정 Q70~Q85. Codex P1(로컬 pm2 리허설은 I-3 훅이 막는다) → T-1 선행 "격리 예외 PR" 로 기록.
5. 후속 이슈 #157(gateway 동적 시작 · fin·fit) · #162(OMRON 백필 · 서비스 결함 기록).
6. 이 인계(#165).

## 결정된 것 (사용자 2026-10-16)

| | 결정 |
|---|---|
| 007 마감 | 감사 3회 초과 → 스코프 축소 대신 **2문장 수정 + diff 대조로 발행** |
| Q70~Q78 · Q81~Q85 | **권고안 일괄** — D-a 서버 수동 배포(secrets 0) · 단일 `v*` · S-a 앱별 체크아웃 · P-2 심링크 → T-8 직전 P-4 · **DB-a 기존 서비스 DB 그대로** + Q61 연장 · F-1(fit 필수 · fin 생략 가능) · **fin 먼저** · 새 pm2 이름 + 같은 포트 · 관찰 종료 = 모든 크론 1회 이상 + 사용자 판정 · **Claude 서버 접근 계속 금지** · **서비스 배포 경로 차단 = T-5c 진입 조건** · 관찰 후 archive · Q83 생략(조건부) · Q84 ① · Q85 ①+② |
| Q79 | **첫 릴리즈 조건(#88) 충족 — 단 첫 릴리즈 ≠ 전환 · 기존 서비스 병행 계속** |
| Q80 | **검증 Discord 서버·봇을 운영으로 승격**(권고와 다름) · 로컬 검증용 봇은 새로(T-10) · 같은 토큰으로 로컬 gateway 동시 기동 금지 |
| fit#529 | 서비스 결함 이슈는 사용자가 직접 등록 — Claude 는 본문 준비만(I-1 유지) |

## 결정되지 않은 것

| | 내용 | 언제 |
|---|---|---|
| **로컬 pm2 격리 예외** | Q85 ① 은 I-3 룰·훅이 막는다 → 예외 PR(전용 `PM2_HOME` · `run.sh <app> -- npx pm2` 만 · 서버·서비스 포트·`ecosystem.config.js` 계속 금지) 승인 여부. 미승인이면 Q85 ② 만(새 pm2 경로 결함은 T-5c 에서 처음 드러남) | **T-1 착수 직전** |
| Q79 해석 | "서비스 병행" = 첫 릴리즈 뒤에도 서비스 운영 계속 으로 기록. **서버에서 pleiades·서비스 동시 기동** 뜻이면 별도 토큰·포트 단계를 T-4 앞에 연다 | 사용자 확인(다음 세션) |
| U1~U14 | 서버에서만 알 수 있는 사실(경로 · nginx · DB 크기·백업 · pm2 · node · 옛 빌드 산출물 등) — 007 §8 | T-2(사용자 조사) |
| #157 · #137 · #126 | gateway 동적 시작 · lastError sanitize · npm audit | 낮음 |
| I-1 예외 룰 | 서비스 결함 이슈만 서비스 저장소 허용 — 이번에도 사용자 직접 등록으로 처리 · 룰은 미결 | 사용자 |

## 다음 세션의 첫 액션 후보

1. **fit 재수용** — 서비스 dev 가 세션 중 두 번 움직였다(`13a9c38` → 세션 끝 `39ffa15b969a`). health_checkup 마이그레이션 포함. 절차는 이번과 같다(스크래치 venv 재생성 · `import_app.sh fit sync`). 되돌리기: 머지 전 **즉시** · 머지 후 **중간**.
2. **T-1 착수**(007 §5) — 먼저 로컬 pm2 격리 예외 여부를 묻고, 루트 `deploy/` · 루트 ecosystem · 서버 `.env` 키 템플릿 · 루트 `.gitignore` 상태 경로 · 크론 전수(M1) · `workflow.md` 릴리즈 전략 개정. pleiades 안 작업 · 되돌리기 **즉시**.
3. **U1~U14 조사 요청** — 사용자가 서버에서 확인할 목록 정리(007 §8).
4. #157 gateway 동적 시작(fin·fit 공통 · 작음 · **즉시**).

## 주의사항

- **원칙: 서비스 영향 0** — `.claude/rules/isolation.md`. 전환 설계가 끝났어도 **해제는 007 §6 표의 T-5c 순간 · 그 앱의 서버 `.env` 범위**뿐이다. 그 전까지 모든 불변식 그대로.
- **세션 시작 관측:** dev clean · secrets 0 · 수용 fin 최신(`55404173bd9c`) · fit 뒤처짐(`7d1eb99faee1` → `0b3ccd4c33c2` · 이번에 수용). **세션 끝 관측: fit 서비스 dev `39ffa15b969a` — 다시 뒤처짐.** 다음 세션은 resume Step 2 결과를 신뢰한다.
- **filter-repo venv 는 스크래치라 세션마다 사라진다** — `cd <scratch> && python3 -m venv frvenv && frvenv/bin/pip install git-filter-repo==2.47.0` 후 `FILTER_REPO=<scratch>/frvenv/bin/git-filter-repo`.
- **수용 충돌 커밋은 `--no-edit` 가 `# Conflicts:` 주석을 메시지에 남긴다**(cleanup=whitespace) → 트레일러가 마지막 문단이 아니게 된다. push 전에 메시지에서 지운다(이번엔 `reset --mixed HEAD~1` → `commit --amend -F` → STATE 커밋 재생성).
- **`run.sh` 는 `PLEIADES_VERIFY_BOT_IDS`·`PLEIADES_VERIFY_CHAT_IDS` 가 필요하다** — 봇 id 는 공개값(2026-10-01 인계) · 검증 채팅 id 는 사용자에게 묻는다(저장소에 적지 않는다). `env A=.. B=.. run.sh` 형태는 precheck 가 거부한다 — `export` 후 호출.
- **fit 로컬 DB 에 OMRON 마이그레이션 미적용** — 로컬 기동 전 `run.sh fit -- npx prisma migrate deploy`.
- **007 의 핵심 함정:** 서비스 배포 경로(Release → ssh → deploy.sh)를 끊지 않고 전환하면 옛 Release 하나가 공유 DB 에 마이그레이션(편도)·dump 오염·옛 디렉터리 변경을 일으킨다 — 차단은 T-5c **진입 조건**.
- `apps/finance` 파일을 읽으면 서비스 skill 이 발견되지만 실행하지 않는다(I-10).
- 사용자 선호: **응답은 항상 한국어.**
- `MEMORY.md` 23줄(한도 200).

## 정정된 기록

- *"Discord 3초 제한 때문에 vest 확정은 지연 응답 후 원본 수정 구조가 필요"*(직전 인계 M-6b-4 행) → 패키지 gateway 가 이미 type 6 지연 응답 + `@original` 수정을 한다 — **패키지 변경 0**.
- *"fit 크론 = 웹"*(007 초안) → 웹·봇 둘 다(봇 `cron.schedule` 5곳).
- *"fin build 는 서비스 DB 없이 불가"* → DB 는 prerender 만 · 읽기 전용(`account.findMany`).
- *"로컬 pm2 리허설은 run.sh 경유면 된다"* → I-3 훅이 모든 pm2 를 막는다 — 격리 예외 PR 선행.

## 재현이 필요한 절차

- **정기 수용**: 이슈 → `chore/<n>-sync-apps-<YYYYMMDD>` → `ISSUE=<n> SCRATCH=<scratch>/sync FILTER_REPO=<venv> tools/import/import_app.sh fit sync` → 충돌 해결(원칙 006 §4-S) → lock 은 `--theirs` 후 `run.sh fit -- npm install`(file: 재적용) → `commit --no-edit` → **메시지의 `# Conflicts:` 제거** → `HEAD^2` 대조 → `guards.py state-set` → STATE 커밋 → 8절(fit 은 `prisma generate` 선행) → PR "Create a merge commit" → 머지 후 부모 2.
- **Discord 버튼 실수신**: 스크래치 `.ts` 에서 `process.env.NOTIFY_INTERACTIVE_CHANNEL='discord'`(이 프로세스만) · `interactiveNotifierFor(fakeBot)` 로 없는 id 버튼 1건 → `createDiscordGateway` 를 `handleDiscordButton` 감싸 1회용(≤180초 · 취소 클릭 후 3초 뒤 stop) → `run.sh <app> -- npx tsx <file>`.
- **설계 문서 파이프라인**: repo-surveyor → decision-writer → reversibility-auditor 순환 · SendMessage 로 같은 에이전트에 개정·재감사 요청(컨텍스트 유지) · 산출은 `_workspace/<주제>/`.
