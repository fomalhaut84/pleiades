# 006 초안 2회차 감사 — `_workspace/006/02_writer_006.md` (544줄)

작성 2026-09-30 · `reversibility-auditor`(읽기 전용 — 본문을 오케스트레이터가 저장).
**판정: 조건부 직접 반영 가능** — 정정 11(블로커 1 · 비블로커 10). 1회차 19 전부 반영(3 부분). 사용자 결정 U97-5~8 존중 · 그 안의 보호 조건만 반증. 전부 고칠 방법이 정해진 문안·절차 수준 → §4 목록을 그대로 반영하고 오케스트레이터가 해당 행만 diff 확인하면 정본 가능(#37 전례).

## 0. 규율
서비스 쓰기·push·서비스 API 호출 0(1회차 GET 재사용). `gh api markdown` 은 렌더 전용(형식상 POST · 저장 없음) · `context=fomalhaut84/pleiades` 만. 서비스 코드·메시지는 스크래치 bare 클론·[S2] 재작성본 `fr_a` 에서만. 셸 env 는 개수만.

## 1. 1회차 반영
B1·B2 · N1~N4 · N6~N9 · N11 · N12 · N14 · N15 · N17 · C12 확인. **부분**: N5(R8) · N10(R6) · N13(R9) · N16(R10).

## 2. 블로커 (1)

**B1 · L-7 · I-8 "`CLAUDE_BIN` 비움 → 로컬 advisor 안 돈다" 는 두 앱 모두 불성립.**
fit `src/lib/ai/claude-advisor.ts:28` `const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude"` → 빈 값이면 PATH `claude` 폴백. fin 은 `:758`·`:814` 에서 `'claude'` 하드코딩 + `spawn('sh', ['-c', cmd])` — `CLAUDE_BIN` 미사용. 호출부: fin 봇 `briefing`·`active-review`·`monthly-report`·`ta-signal-alert`·`/ai`·`expense`. U97-7 로 M-4 가 봇을 띄우면 스케줄러·리포트가 로컬 `claude` 자동 실행 — X8(같은 계정) 이면 서버 advisor 와 쿼터 경쟁. fin `src/lib/ai/mcp-config.json` 은 `http://127.0.0.1:4210/mcp` 하드코딩(L-3 `MCP_PORT` 무시).
고침: L-7 → *"fit: `CLAUDE_BIN=/nonexistent/claude-disabled`(비어 있지 않은 없는 경로) · fin: env 로 끌 수 없음 → 웹·봇을 `claude` 가 없는 PATH(pleiades 로컬 `bin/` 의 exit 1 shim 선행)로 기동 · 기동 스크립트가 `command -v claude` 가 shim 인지 확인 후 시작"*. I-8 동일. `mcp-config.json` 4210 병기.

## 3. 비블로커 (10)

- **R1 치환·게이트 완전성.** 렌더 API `links=`: `fomalhaut84/myFinance/pull/494`(호스트 없음) **1**(myFinance 대상 · 다섯째 형식) · `gh-51`/`Gh-51` 1 · `FOMALHAUT84/PLEIADES#51` 1 · `www.github.com/…/issues/51`(`#issuecomment-1` 포함) 1 · `fin/#51`·`x:#51`·`.#51`·`fin-#51`·`fin #51` 1. 서비스 메시지: 호스트 없는 형식 0 · `gh-N`(대소문자 무관) 0 · **`/#N` fin 3 · fit 3** — [S2] callback `(?<![\w/])#` 이 건너뛰어 `fr_a` 에 `/#383`·`/#407` 잔존 → [S2] "남은 `#N` 0" 은 틀림. 게이트(대소문자 무시 · callback 과 별도 구현 · Python/perl — BSD grep 에 `-P` 없음 · `grep -c` 0건 exit 1): (i) `[\w.-]+/[\w.-]+#\d+` (ii) `(https?://)?(www\.)?github\.com/[\w.-]+/[\w.-]+/(issues|pull|discussions)/\d+` (iii) `(?<![\w.-])[\w.-]+/[\w.-]+/(issues|pull)/\d+` (iv) `(?<![\w])gh-\d+` (v) `(?<![A-Za-z0-9_])#\d+\b`.
- **R2 X11 → 확인 + 위험 범위 정정.** 렌더: `Closes fin#494` · `fit#108` · `myFinance#494` · `pleiades#51` · `fin#٥١` 모두 links=0. 렌더 파서 ≠ 커밋 추출 파서일 수 있으나 **소유자 없는 형식은 같은 저장소(pleiades) `#N` 로만 해석 가능** → 서비스 경로 원리상 없음. 문구: "X11 이 틀리면 pleiades 이슈 `referenced` 잡음(편도) — 서비스 영향 없음". 코드 스팬 한정 참조는 렌더 0 이나 커밋 추출 미확인 → Q56 비링크 권고 유지.
- **R3 가드 C 누락.** pleiades ruleset 은 squash 허용 · 평소 squash(`d9d1535 … (#90) (#93)`) · #75 squash 사고 전례. 동기화 PR squash 시 재작성 이력이 dev 조상이 아니게 되고 가드 B `git log --grep '^Service-Repo'` 가 이전 커밋을 잡거나 `^2` 실패. **가드 C**: 수용 전 `merge-base --is-ancestor <prev-rewritten-tip> origin/dev` · 복구 = #75 식 `git merge -s ours --no-ff <rewritten-tip>`(diff 0) PR · 즉시. 가드 A(조상 없음 exit 128 → `||` 중단) 동작 확인 · 가드 B 버전 드리프트 감지 확인.
- **R4 §4-3 명령 골격.** `git-filter-repo --force …` 에 `cd`/`-C` 없음 — 현재 디렉터리를 재작성 · `--force` 는 fresh-clone 검사도 끔 → pleiades 에서 실행하면 로컬 이력 재작성·reflog 만료(원격 무사 → 중간 · 미커밋 작업 손실). 고침: `(cd "$T/fit" && …)` + 스크립트가 먼저 `realpath "$T"` 가 pleiades 밖인지 검사.
- **R5 Q66 핀.** 스크래치 venv `pip show git-filter-repo` = `2.47.0` · `a40bce548d2c` 는 `--version` 출력(pip 핀 불가). git = Apple Git 2.50.1(venv 고정 불가 · CLT 업데이트로 변동). 고침: `git-filter-repo==2.47.0` 핀 + `--version`·`git --version` 을 `VERSIONS` 에 기록 · git 드리프트는 가드 B 가 잡는다고 명시.
- **R6 I-14 · L-2 "`.env` 접두 검사" 불충분.** 두 앱 `prisma.config.ts` · fin `standalone.ts:10`·`mcp/server.ts:4` · fit `scripts/*` 가 `import "dotenv/config"` 로 cwd `.env`. dotenv·`@next/env` 는 기존 `process.env` 를 덮지 않음 → 셸 export `DATABASE_URL`·`TELEGRAM_BOT_TOKEN` 이 이긴다. Next 는 `.env.local`·`.env.development`·`.env.production` 을 `.env` 보다 먼저. 현재 셸 관련 export 0 · 프로필 `DATABASE_URL` 0(잠재 위험). 고침: 기동·migrate 헬퍼가 **실효 env 사전 검사**(`DATABASE_URL` 호스트 ∈ {localhost,127.0.0.1,::1} · 포트 5432 · DB 이름 `pleiades_` 접두) · `env -u DATABASE_URL -u TELEGRAM_BOT_TOKEN` 실행 · cwd = `apps/<app>` · `apps/*/.env.*` 부재 확인 · 파괴 명령 목록에 **`prisma migrate dev`**(공유 인스턴스에 shadow DB 생성·삭제 · Q61 정합).
- **R7 M-4 · L-4 토큰 혼입.** 경로: R6 셸 env 우선 + 사용자 오붙여넣기. 고침: 템플릿에 검증 봇 id(토큰 `:` 앞 숫자 · 공개값) 허용 목록 · 기동 전 실효 토큰 id 대조(API 호출 없이) · 두 앱이 서로 다른 봇인지 확인(같은 토큰 둘이면 로컬끼리 409).
- **R8 I-10 ②③.** `claude-code-mechanisms.md:121`: `claudeMdExcludes` 는 CLAUDE.md·rules 배제 — skill·agent 발견 차단 근거 없음. 문구: "② 는 CLAUDE.md·rules 만 · skill·agent 발견 차단 수단은 미확인(U8)". 실제 방어선은 ① 룰 한 줄 + I-19 훅.
- **R9 훅 사양.** `gh api graphql -f query='mutation …'` 은 경로 없이 node id 로 서비스에 쓸 수 있음 → graphql 은 `mutation` 포함 시 거부 · `--method`·`-XPOST` 붙여 쓰기 형태 매칭.
- **R10 §9 누락.** ① `.claude/settings.json` 행(훅 · `claudeMdExcludes` 위치) ② measured-facts 정정: [S2] X2 "남은 `#N` 0" → `/#N` fin 3 · fit 3 잔존 ③ 사용자 메모리 `feedback_service_isolation.md` 충돌 통지(결정 보고에 — 오케스트레이터 주: 2026-09-30 세션에서 이미 새 원칙으로 갱신됨).

## 4. 확인 (새 주장·숫자)
Q62·Q63·Q66 "M-1 전 고정" 맞음(callback·트레일러·버전이 바뀌면 재작성 SHA 전부 변경 → 가드 B 실패 → 전 이력 재병합(중간)·중복(편도)) · Q63 `original_id` 트레일러 결정성 추정(X15 유지 타당) · Q62 제로폭 무해화 `@​sagan` links=0(대가: `@prisma/client` 류 검색 깨짐 명시) · ⑱ 숫자(fin 42(41) · fit 34 · 한정 3 · 1,331/1,945 · URL 0 · `GH-N` 0) · 11.45 MiB · 17/59 · 19 파일 · M-3 job 내 skip · 재작성 스크래치 한정 · `--no-tags` · `prepare` 유지 · Q54 사용자 단독.

## 5. 미확인
X8 · X13(멘션 알림) · X14(push protection) · X15 · U8 · 렌더=추출 파서 여부(R2 로 서비스 위험 무관).

## 6. 사용자 결정 영향
| # | 사실 | 결정 |
|---|---|---|
| F1 | U97-7 봇 기동이 두 앱 advisor 자동 실행을 켠다 · env 로 못 끔 · PATH shim 필요(B1) | U97-7 유지 + B1 수단 |
| F2 | U97-8 실제 위험은 셸 env 우선순위와 `migrate dev` shadow DB(R6) | U97-8 보호 조건 |
| F3 | squash 허용 → 동기화 PR 머지 방식이 사람 실수에 달림(R3) | 가드 C 로 충분한가 / 동기화 PR 별도 규칙 |

## 7. 직접 반영 목록
1 B1 · 2 R1 · 3 R2 · 4 R3 · 5 R4 · 6 R5 · 7 R6·R7 · 8 R8 · 9 R9 · 10 R10.

## 8. 결론
1회차 19 반영(3 부분) · 이번 정정 11(블로커 1). 블로커: 봇 기동이 두 앱 advisor 로컬 `claude` 자동 실행 — "`CLAUDE_BIN` 비움" 은 fit PATH 폴백 · fin 하드코딩. X11 은 렌더 링크 0 · 소유자 없는 형식이라 서비스 무관. 게이트 확장 · 가드 C · 스크래치 `cd` · 실효 env 검사 필요. 문안 수준 — 직접 반영 후 정본 가능.
