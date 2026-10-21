# 006 실측 2회차 — 초안 `02_writer_006.md` 의 측정 요청 (X1·X2·X3·X7·X9·X10)

- 측정일: 2026-09-30 · 규칙은 1회차와 같다. 서비스 원격·원본·worktree 에는 쓰지 않았고 push 는 0이다. 원본 `.env` 는 **존재 여부만** 봤다.
- 스크래치 `$M=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono` · 스크립트 원문은 `_workspace/006/scripts/x*.{sh,py}`
- 대상은 1회차와 같은 bare clone 의 `dev`(fin `5540417` · fit `a984b85`)다.

## 결론 표

| # | 질문 | 결론 |
|---|---|---|
| X1 | 서비스 커밋 메시지의 닫기 키워드가 pleiades 이슈를 닫나 | **지금 열린 이슈와 겹치는 것은 0건.** 다만 fit 키워드 번호 10개(#53~#76)가 pleiades 에 이미 있는 번호(전부 closed)이고, 저장소를 한정한 `Closes fomalhaut84/myFinance#494` 1건이 있다(대상은 closed). GitHub 문서상 커밋 메시지의 키워드는 **기본 브랜치에 머지되면 이슈를 닫는다** |
| X2 | `filter-repo` 로 경로를 재작성하면 | **결정적이다(두 번 돌려 SHA 동일) · 증분도 된다(옛 재작성본이 새 재작성본의 조상 → 일반 merge 로 5커밋만 받음) · `#N` 무해화가 된다 · 경로 log/blame 이 살아난다(서비스와 동일)** |
| X3 | 스크래치 모노레포에서 앱별 lock 으로 8절 4종이 통과하나 | fit 은 **4/4 통과**(더미 DB). fin 은 lint·tsc·test 는 통과하지만 **build 는 DB 가 필요하다**(prerender 가 Prisma 호출 · 모노레포와 무관 — 추출본도 같은 실패). 스크래치 postgres 에 마이그레이션 27개를 적용하면 build 가 통과한다. `file:../../packages/notify` 도 `npm ci`·Next build·esbuild 번들에서 동작한다(4/4) |
| X7 | 1a-3·1a-4 대상 파일이 최근 90일에 얼마나 바뀌었나 | fit 1a-3 대상 6파일 → **4 커밋**(fit dev 전체 90일 158). fin 1a-4 대상 19파일 → **17 커밋**(fin dev 전체 59) |
| X9 | 로컬 DB·원본 `.env` | 로컬 postgres 15.14(Homebrew)가 **127.0.0.1:5432·[::1]:5432 에서 리슨 중**. `.env` 는 원본 fin·fit · worktree fin·fit **4곳 모두 존재**(내용은 읽지 않음) |
| X10 | 중첩 `apps/*/CLAUDE.md` 가 로드되나 | **시작 시에는 로드되지 않는다. 그 디렉터리의 파일을 읽으면 지연 로드된다** — 중첩 `.claude/rules` 도 같다. 중첩 skill 은 추적되는 경로에서만 발견된다(gitignored 면 발견되지 않음) · Claude Code 2.1.285 |

---

## X1. 닫기 키워드·저장소 한정 참조 (`scripts/x1.py`)

```bash
gh issue list -R fomalhaut84/pleiades --state open --json number     # 97 96 95 82 66 48 17 11
git -C $M/$r.git log dev --format='%H%x00%B%x01'                    # 정규식 \b(close[sd]?|fix(e[sd])?|resolve[sd]?)\b[:\s]+((owner/repo)?#N)
```

| | myFinance (395 커밋) | myFitness (375 커밋) |
|---|---|---|
| 키워드 참조 (커밋 수) | 42 (23) | 34 (26) |
| 그중 저장소 한정 없음 | 41 | 34 |
| 키워드 번호 범위 (고유) | #279~#434 (20) | #53~#364 (24) |
| **키워드 번호 ∩ pleiades 열린 이슈** | **0** | **0** |
| 키워드 번호 ≤ 97 (pleiades 에 이미 있는 번호) | 0 | **10** — #53·55·57·65 = pleiades PR(closed) · #59·61·63·68·70·76 = 이슈(closed) (`gh api repos/fomalhaut84/pleiades/issues/N`) |
| 키워드 없는 `#N` 중 pleiades 열린 번호와 같은 것 | #82 ×18 · #95 ×8 · #48 ×4 · #66·#96 ×2 · #17·#11 ×1 | #66 ×4 · #11·#17·#48 ×2 · #82 ×1 |
| 모든 `#N` 출현 (고유) | 1,331 (468) | 1,945 (487) |
| 저장소 한정 참조 | 3 (2 커밋) — **`Closes fomalhaut84/myFinance#494`**(issue · closed) · `Refs fomalhaut84/pleiades#51` · `fomalhaut84/myFitness#108`(PR · closed) | 0 |

**문서 근거** (`curl https://docs.github.com/api/article/body?pathname=/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue`):
- :44 *"You can also use closing keywords in a commit message. The issue will be closed when you merge the commit into the default branch, but the pull request that contains the commit will not be listed as a linked pull request."*
- :37 다른 저장소는 `KEYWORD OWNER/REPOSITORY#ISSUE-NUMBER` 형식 → `Closes fomalhaut84/myFinance#494` 는 **pleiades 기본 브랜치(`dev`)에 들어가는 순간 myFinance#494 를 닫는 형식**이다(지금은 이미 closed 라 효과는 없다 · 다시 열리면 닫힌다).
- :14 PR **본문**의 키워드는 기본 브랜치 대상일 때만 해석된다. 커밋 메시지는 :44 가 적용된다.
- 타임라인 이벤트(커밋이 `#N` 을 언급하면 그 이슈 타임라인에 "referenced" 가 남는 것): autolinked-references 문서는 **자동 링크만** 기술하고, 이벤트 생성은 명시하지 않는다(:3·"Issues and pull requests" 절). **문서 근거는 확인하지 못했다.** 실험은 하지 않았다(지시대로 — 이벤트는 지울 수 없다). → subtree 로 옮기면 1회차의 3,276개 `#N`(1,331+1,945)이 pleiades 번호로 자동 링크된다는 것까지만 문서로 확정된다.
- 미확정: GitHub 이 **한 번의 push 로 들어온 오래된 커밋 수백 개**의 키워드를 모두 처리하는지(처리 상한 여부).

## X2. `git filter-repo` 재작성 (`scripts/x2.sh` · `x2b.sh`)

`git-filter-repo` 는 설치돼 있지 않아서 스크래치 venv 에 설치했다(`python3 -m venv fr && fr/bin/pip install git-filter-repo` → 버전 `a40bce548d2c`). 시스템 설치는 하지 않았다.

```bash
git clone -q --no-local --no-tags --single-branch --branch dev $M/myFitness.git fr_a
git -C fr_a remote remove origin
git-filter-repo --force --to-subdirectory-filter apps/fitness \
  --message-callback 'import re
return re.sub(rb"(?<![\w/])#(\d+)", rb"fit#\1", message)'
# fr_b = 같은 명령 · fr_old = clone 후 `git reset --hard HEAD~5` 한 다음 같은 명령(과거 시점 재현)
```

| 항목 | fit | fin |
|---|---|---|
| 소요 | < 1 s | < 1 s |
| 커밋 수 | 375 (보존) | 395 (보존) |
| **결정성** (두 번 실행한 tip) | `2110825` = `2110825` **YES** | `71f7c4e` = `71f7c4e` **YES** |
| `HEAD:apps/<a>` == 서비스 `dev^{tree}` | YES | YES |
| 재작성본 루트 | `apps` 만 | `apps` 만 |
| **증분** — `fr_old`(dev~5 재작성) tip 이 `fr_a` 의 조상인가 | **YES** | (fit 으로만 재현) |
| 모노에서 일반 merge 로 이어 받기 | 1차 `merge --allow-unrelated-histories fr_old/dev` → 419 커밋 → 2차 `merge fr_a/dev` → **425**(+5 · 머지 커밋 1 · 부모 2) · 충돌 0 | — |
| message-callback 후 남은 한정 없는 `#N` | **0** (1,945 → `fit#N`) | 0 (→ `fin#N`) |
| 남은 **닫기 키워드** | 0 | **1 — `Closes fomalhaut84/myFinance#494`**(한정 참조는 callback 정규식 `(?<![\w/])` 가 일부러 건너뜀 → 무해화하려면 한정 형식도 치환해야 한다) |
| **경로 이력** `git log -- apps/<a>/package.json` | **32** (서비스 32) | **19** (서비스 19) |
| **blame** 고유 커밋 | **28** (서비스 28) | **16** (서비스 16) |
| 두 앱을 합친 모노 pack (gc) | 11.45 MiB · 821 커밋 | |

→ 증분이 성립하는 조건: **같은 filter-repo 버전 + 같은 옵션·callback + 서비스 dev 이력이 재작성되지 않을 것**(force-push 가 없어야 한다). 매번 전체를 다시 재작성해도 1초 안팎이다.
→ filter-repo 는 메시지 안의 커밋 해시 약어도 새 SHA 로 바꾼다(기본 동작) — 이것도 결정적이다(두 번 같은 결과).
→ 1회차 subtree 방식과 비교하면: 경로 이력이 끊기는 문제(log 1 · blame 1)가 **사라진다**. 대신 서비스 SHA 가 모노 이력에 남지 않는다. 대응표는 filter-repo 가 `.git/filter-repo/commit-map` 으로 남긴다(보존 방법은 미측정).

## X3. 스크래치 모노레포 8절 4종 (`scripts/x3.sh` · `x3b.sh` · `x3c.sh`)

대상은 X2 의 `fr_mono` 다(pleiades dev + fin·fit 재작성본 · 루트에 `workspaces` 없음 · 앱별 lock 유지). `DATABASE_URL=postgresql://none:none@127.0.0.1:1/none` · `NEXT_TELEMETRY_DISABLED=1` · `CI=1`.

| 앱 | 단계 | 결과 |
|---|---|---|
| fin | `npm ci` | rc 0 · 10 s · 670 패키지 |
| fin | `npm run lint` | rc 0 |
| fin | `npx tsc --noEmit` | rc 0 |
| fin | `npm run test:run` | rc 0 · **50 파일 · 866 테스트** |
| fin | `npm run build` (더미 DB) | **rc 1** — `/deposits/new` prerender 에서 `PrismaClientInitializationError` |
| fin | 대조: 추출본(`solo/myFinance` · 모노 밖) + 같은 더미 DB | **rc 1** — `/trades/new` prerender 에서 같은 오류 → **모노레포 때문이 아니다** |
| fin | 스크래치 postgres(`initdb` · 127.0.0.1:55432 · TCP 전용) + `npx prisma migrate deploy`(27개) → `npm run build` | **rc 0** · 20 s · `dist/mcp/server.cjs` · `dist/bot/standalone.cjs` 5.5 MB |
| fit | `npm ci` → `npx prisma generate` | rc 0 · 9 s · 679 패키지 / rc 0 |
| fit | lint · typecheck · test · build | **전부 rc 0** · test **63 파일 · 433 테스트** + verify 5 |

→ **fin build 에는 스키마가 적용된 DB 가 필요하다**(빈 스키마로 충분하다 · 데이터 불필요). 1a-0 의 *"`next build` DB 요구 없음"* 은 fit 에 대한 값이다.
→ 두 앱의 Next build 모두 경고를 낸다: *"Next.js inferred your workspace root … detected multiple lockfiles … selected `fr_mono/package-lock.json`"* — lock 이 3개면 `outputFileTracingRoot` 를 명시하라는 경고다(실패는 아니다).
→ 스크래치 postgres 는 측정 뒤 `pg_ctl stop` 으로 멈췄다(55432 리슨 0 확인). 사용자 5432 인스턴스는 건드리지 않았다.

**`file:../../packages/notify` + 1a-3 코드 (fit)**

```bash
(cd fr_mono && npm ci && npm run build)                                    # 루트 devDep tsc → packages/notify/dist 20 파일
# fd8b7c5 의 src 변경 8건(A/M 6 · D 2)을 apps/fitness 에 적용 · package.json·lock 은 제외
npm install @pleiades/notify@file:../../packages/notify                    # spec "file:../../packages/notify"
rm -rf node_modules && npm ci                                              # 10 s · symlink ../../../../packages/notify
```

| 단계 | 결과 |
|---|---|
| lock 기록 | `node_modules/@pleiades/notify: {"resolved":"../../packages/notify","link":true}` |
| `npm ci` | rc 0 · 심링크 유지 |
| typecheck · lint · test · build | **전부 rc 0** · test 63 파일 · **442 테스트**(1a-3 `notifier.test.ts` 포함) |
| Next build | `✓ Compiled successfully` · 정적 페이지 18 |
| esbuild bot 번들 | `@pleiades/notify` 가 **인라인된다**(`require("@pleiades/notify")` 0 · `packages/notify/dist` 경로 20 · 심볼 27) — `--external` 목록에 없어서다 |
| 선행 조건 | **`packages/notify/dist` 가 먼저 있어야 한다.** 루트 `npm ci`(→ `prepare` = `tsc`)를 빼먹으면 `tsc: command not found`(첫 시도 rc 127)이고 fit typecheck 는 rc 2, test·build 는 rc 1 이다 |

## X7. 최근 90일 변경량 (`scripts/x7.sh` · `--since=2026-07-02 --no-merges`)

| | fit (1a-3) | fin (1a-4) |
|---|---|---|
| 대상 정의 | `fd8b7c5` diff 의 비테스트 파일 6(`notifier.ts` 신설분은 dev 에 없음) | `git grep -lE 'sendHtml\(\|getAllowedChatIds\|bot\.api\.(sendMessage\|sendDocument)'` 18 파일(테스트·`telegram.ts` 제외) + `telegram.ts` |
| 대상 합집합 커밋 | **4** | **17** |
| 저장소 전체 (no-merges) | 158 (merge 포함 219) | 59 (60) |
| 파일별 | `auto-adjust.ts` 4 · `scheduler.ts` 4 · `auto-adjust-cron.ts` 2 · `send.ts` 1 · `admin-alerts.ts` 1 · `src/bot/notifications/**` 전체 5 | `custom-strategy-alert` 7 · `active-review` 5 · `ta-signal-alert` 5 · `briefing` 4 · `price-alert` 4 · `monthly-report` 3 · `alert-dispatcher` 2 · `lib/cron` 2 · 나머지 4파일 각 1 · **0 커밋 6 파일** |

→ 1a-4 대상 파일은 fin 서비스에서 **자주 바뀌는 영역**이다(90일 동안 전체 커밋의 29%가 닿았다). 모노레포로 가져온 뒤 1a-4 를 하면 이후 `dev` 수용 때 이 파일들이 충돌 후보가 된다.
→ 1a-4 대상을 003 §5-2 의 열거가 아니라 grep 으로 정의했다. 003 의 "20건/21곳" 과 1:1 로 대조하지는 않았다.

## X9. 로컬 postgres · `.env` 존재

```bash
pg_isready -h 127.0.0.1 -p 5432            # accepting connections
postgres --version                         # PostgreSQL 15.14 (Homebrew) · /opt/homebrew/opt/postgresql@15
lsof -nP -iTCP:5432 -sTCP:LISTEN           # postgres PID 867 · 127.0.0.1 · [::1]
ls -la ~/workspace/{myFinance,myFitness}/.env ~/workspace/pleiades/repos/{myFinance,myFitness}/.env   # 4개 모두 존재 · .env.local 없음
```

→ 로컬 5432 에 무엇이 있는지(DB 이름·서비스 데이터 사본 여부)는 조회하지 않았다. 원본 `.env` 도 열지 않았다. 로컬 `.env` 의 `DATABASE_URL` 이 이 5432 를 가리키는지는 **미확인**이다.
→ 격리 방법으로는 X3 처럼 **스크래치 `initdb` + 별도 포트**가 사용자 인스턴스와 무관하게 동작한다(Unix 소켓 경로가 103바이트 제한을 넘어 `-k ''`(TCP 전용)가 필요했다).

## X10. 중첩 `CLAUDE.md`·`.claude/` 로드 (Claude Code 2.1.285)

문서(`claude-code-mechanisms.md:117-118`)에는 *"작업 디렉터리와 모든 상위 CLAUDE.md 는 시작 시 로드 · 하위 디렉터리 것은 그 디렉터리 파일을 읽을 때 on-demand 로드"* 라고 적혀 있다. 004 §3-2 는 *"중첩 `.claude/` skills·agents 미발견"* 이라고 적었는데, 그때 측정한 곳은 **gitignored `repos/*`** 였다.

실험: 스크래치 `cmdtest/`(git init) — 루트 `CLAUDE.md`(ALDER-1144) · `apps/fitness/CLAUDE.md`(PLUM-7731) · `apps/fitness/.claude/rules/r.md`(FIG-2208) · `apps/fitness/.claude/skills/kiwi-skill/SKILL.md`(KIWI-5150) · `apps/fitness/a.txt`.

```bash
claude -p 'Do not use any tools. List every marker token …' --max-turns 1
claude -p 'Use the Read tool to read apps/fitness/a.txt. Then … list every marker token …' --allowedTools Read --max-turns 3
```

| 조건 | 모델이 보고한 토큰 |
|---|---|
| 시작 시 (도구 없음) | `ALDER-1144` 만 |
| `apps/fitness/a.txt` 를 읽은 뒤 (`apps/` 추적) | ALDER · **PLUM**(중첩 CLAUDE.md) · **FIG**(중첩 rules) · **KIWI**(중첩 skill) |
| 같은 조건에서 루트 `.gitignore` 에 `apps/` 를 둔 경우 | ALDER · PLUM · FIG — **skill 은 없음** |

→ 모노레포 `apps/finance/` 는 추적되므로, **pleiades 세션이 fin 파일을 읽는 순간 fin `CLAUDE.md` + `.claude/rules/` 5개가 컨텍스트에 들어오고 fin skill 7개도 발견된다.** fin 규칙(브랜치 `dev`·`feat/<issue>-<n>` 등)이 pleiades `workflow.md` 와 함께 로드된다는 뜻이다. 필요하면 `claudeMdExcludes` 로 막을 수 있다(`mechanisms.md:121` · 미실험).
→ 004 §3-2 의 "미발견" 은 **gitignored 조건에서는 skill 에 대해 재현되지만**, CLAUDE.md·rules 는 지연 로드된다. 004 §3-2 는 이 부분에서 정정 대상이다.
→ 한계: 모델의 자기 보고이고 조건마다 1회씩만 돌렸다. agents 는 시험하지 않았다.

## 미측정

| 항목 | 이유 |
|---|---|
| GitHub 이 push 된 오래된 커밋의 키워드를 처리하는 상한 · 커밋 참조의 타임라인 이벤트 | 문서 근거가 없고 실험은 금지(이벤트를 지울 수 없음) |
| filter-repo `commit-map` 보존·서비스 SHA 역추적 절차 | 범위 밖 |
| 로컬 `.env` 의 DB 대상 · 5432 인스턴스 내용 | 읽기 금지 |
| 1a-4 대상과 003 §5-2 열거 대조 | grep 정의로 대체 |
| 중첩 agents 로드 · 반복 실행 안정성 | 1회 실험 |
