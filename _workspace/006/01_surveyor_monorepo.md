# 006 실측 — 모노레포 가져오기 (`git subtree`) · #97

- 측정일: 2026-09-30 · 측정자: repo-surveyor · 로컬 git 2.50.1 (Apple) · node v20.18.0 · npm 10.8.2
- **측정 대상: 서비스 GitHub 원격의 `dev`** (fin `5540417` · fit `a984b85`) — 가져올 대상이 서비스 `dev` 이므로 worktree(`integration/pleiades`)가 아니라 원격을 잰다. 차이는 7절에 병기.
- **서비스 저장소 무접촉.** 원본 `~/workspace/myF*`·worktree `repos/*` 는 열지 않았다(fetch 로 그 `.git` 을 건드리지 않기 위해). 스크래치에 `git clone --bare https://github.com/fomalhaut84/<repo>.git` 을 새로 받아 거기서만 읽었다. 실험 클론은 전부 `origin` 제거 · push 0.
- 스크래치: `$S=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono`
- 실행 스크립트 원문: `_workspace/006/scripts/` (아래 명령은 그 요약. 경로 `$S` 치환)
- zsh 는 `$var` 단어 분할을 하지 않아 첫 시도 3건이 `command not found` 로 실패 → 전부 `bash script.sh` 로 재실행한 값만 적는다.

---

## 1. 이력 규모 (`scripts/m1.sh` · `m2.sh`)

```bash
git clone --bare -q https://github.com/fomalhaut84/$r.git $S/$r.git        # fin 1.73 s · fit 3.02 s
git -C $S/$r.git rev-list --count dev
git -C $S/$r.git count-objects -vH                                          # 전 ref(브랜치 219/185 · 태그 27/85)
git -C $S/$r.git rev-list --objects dev | git -C $S/$r.git pack-objects --stdout -q | wc -c   # dev 만
git -C $S/$r.git rev-list --objects dev | git -C $S/$r.git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
  | awk '$1=="blob"' | sort -k3 -n -r | awk '!seen[$4]++' | head -10
```

> `cat-file --batch-check` 는 포맷에 `%(rest)` 가 없으면 입력 줄 전체(`sha path`)를 객체명으로 읽어 **조용히 0** 을 낸다(첫 시도 `blobs=0` 오측정 → `%(rest)` 추가로 재측정).

| | myFinance | myFitness | pleiades (현재) |
|---|---|---|---|
| `dev` 커밋 | **395** (2026-03-04 ~ 09-28) | **375** (2026-04-07 ~ 09-28) | 48 |
| 전 ref 커밋 · 브랜치 · 태그 | 1,031 · 219 · 27 | 1,024 · 185 · 85 | — |
| 전 ref pack (`size-pack`) | 5.34 MiB | 7.58 MiB | — |
| **`dev` 만 pack** | **4,788,647 B (4.6 MiB)** | **6,874,787 B (6.6 MiB)** | **1,156,656 B (1.1 MiB, 전 ref)** |
| `dev` 이력 blob 수 · 비압축 합 | 1,935 · 21.8 MB | 1,645 · 21.4 MB | — |
| `dev` HEAD 트리 파일 · 바이트 | 745 · 9,127,900 B | 678 · 7,933,234 B | — |
| HEAD 바이너리(ttf·png·woff 등) | 5 파일 4.8 MB | 41 파일 3.8 MB | — |

**가장 큰 blob 상위 10 (`dev` 이력 · 경로별 최대)**

| # | myFinance | myFitness |
|---|---|---|
| 1 | 2400.0 KB `assets/fonts/NotoSansKR-Regular.ttf` | 378.5 KB `package-lock.json` |
| 2 | 2399.7 KB `assets/fonts/NotoSansKR-Bold.ttf` | 323.4 KB `docs/designs/397-insights/screenshots/desktop.png` |
| 3 | 384.2 KB `package-lock.json` | 174.4 KB `docs/designs/397-insights/screenshots/mobile-360.png` |
| 4 | 66.3 KB `src/app/fonts/GeistMonoVF.woff` | 162.7 KB `docs/designs/440-activity-ai-eval/screenshots/mobile-360.png` |
| 5 | 64.7 KB `src/app/fonts/GeistVF.woff` | 152.8 KB `docs/designs/440-activity-ai-eval/screenshots/desktop.png` |
| 6 | 50.1 KB `docs/designs/9-trade-crud/prototype.html` | 151.0 KB `docs/designs/418-hr-recovery/screenshots/desktop.png` |
| 7 | 48.7 KB `docs/milestone-2.md` | 136.4 KB `docs/designs/440-activity-ai-eval/screenshots/live-mobile-360.png` |
| 8 | 42.0 KB `src/lib/ai/claude-advisor.ts` | 134.8 KB `docs/designs/396-highlights/screenshots/records.png` |
| 9 | 42.0 KB `src/mcp/server.ts` | 134.0 KB `docs/designs/394-history/screenshots/mobile-360.png` |
| 10 | 40.6 KB `docs/designs/2-layout-dashboard-ui/prototype.html` | 133.1 KB `docs/designs/440-activity-ai-eval/screenshots/live-desktop.png` |

→ **1 MB 넘는 blob 은 fin 폰트 2개뿐**(합 4.7 MB · HEAD 에 있음 → squash 해도 안 준다). LFS 불필요 수준.

작성자 이메일(`git log --format=%ae dev | sort | uniq -c`): fin 3종 · fit 2종 — noreply 외에 개인·회사 주소 포함. **이미 PUBLIC 인 서비스 저장소 이력에 있는 값이라 새 공개는 아니다.** 값은 적지 않는다.

## 2. 이력 내 비밀값 스캔 (`scripts/scan.py` · `insp.sh` · `pii.sh`)

gitleaks·trufflehog·detect-secrets **미설치**(`which` 3개 not found) → 정규식 스캐너로 대체. 대상: **전 ref**(`git log --all -p -U0 --text`) 의 **추가된 줄**(fin 281,746 줄 · fit 225,442 줄). 값은 출력하지 않고 종류·경로·커밋·자리수만.

패턴 12종: 텔레그램 봇 토큰(`\d{8,10}:AA…{33}`) · AWS `AKIA` · `sk-ant-` · `sk-`/`sk-proj-` · GitHub `ghp_/gho_/github_pat_` · Slack `xox?-` · `BEGIN … PRIVATE KEY` · Google `AIza` · JWT · 비밀번호 포함 postgres URL · Discord webhook · `*PASSWORD|SECRET|TOKEN|API_KEY* = 16자+`.
추가: 파일명(`.env`·`.pem`·`.key`·`id_rsa`·`credentials` 등)이 **한 번이라도 추가된** 적 있는지(`git log --all --diff-filter=A --name-only`).

| 판정 | myFinance | myFitness |
|---|---|---|
| `.env`/키 파일이 커밋된 적 | **0** (`.env.example` 만) | **0** (`.env.example` 만) |
| 텔레그램 토큰·AWS·Anthropic·OpenAI·GitHub·Slack·Google·JWT·Discord 패턴 | **0** | **0** |
| `PRIVATE KEY` 헤더 | 1 경로(`docs/specs/366-deploy-automation.md`) — 문서 예시 `-----BEGIN OPENSSH PRIVATE KEY-----\n...` **플레이스홀더** | 0 |
| postgres URL 비밀번호 | `.env.example`·`docs/architecture.md`·`docs/milestone-2.md`·`ci.yml` — 전부 플레이스홀더(`password` 8자) 또는 CI 전용 `ci:ci` | `.env.example`·`docs/architecture.md`·`docs/specs/1-project-init.md` — 플레이스홀더 · CI `ci:ci` |
| `*SECRET/TOKEN/KEY*=` 16자+ | `.env.example`(`generate-…` 안내문 · `your-…`) · `src/mcp/__tests__/logger.test.ts`(redaction 테스트 픽스처 `'x'`·`'MY_…'`) | `src/lib/nutrition/food-db-mfds.ts`(`process.env.MFDS_API_KEY` 읽기 코드 — 값 아님) |
| 텔레그램 chat id 숫자 | `.env.example`·docs 5줄 — `123456`·`789012`·`123456789` 형 **플레이스홀더** | 0 |
| 이메일(비-noreply) | 라이브러리 저자(`izs.me`) · 도메인 `myfinance.<개인 도메인>` 4건 | `izs.me` · `xx…@gmail.com` 예시 1 |

→ **정규식 기준 실비밀 0 / 0.** fit `ecosystem.config.js` 에 **서버 홈 절대경로(계정명 포함)** 하드코딩 3곳 — 비밀은 아니나 식별자. 이미 PUBLIC.
→ 한계: 정규식 12종 · 엔트로피 검사 없음 · 스크래치 클론은 **도달 가능 객체만** 받는다(GitHub 의 unreachable/PR ref 는 미포함).

## 3. subtree 실험 (`scripts/sub1.sh` ~ `sub4.sh`)

```bash
git clone -q --branch dev ~/workspace/pleiades $S/plx && git -C $S/plx remote remove origin
git remote add fin $S/myFinance.git ; git remote add fit $S/myFitness.git ; git fetch fin dev ; git fetch fit dev
git subtree add --prefix=apps/finance fin $(git rev-parse fin/dev~1)       # 한 커밋 전으로 add
git subtree add --prefix=apps/fitness fit $(git rev-parse fit/dev~1)
git subtree pull --prefix=apps/finance fin dev                              # dev 새 커밋 수용 재현
git subtree pull --prefix=apps/fitness fit dev
# 원격 URL 직접(리모트 등록 없이 · 읽기 전용 fetch):
git subtree add --prefix=apps/finance https://github.com/fomalhaut84/myFinance.git dev
```

| 항목 | 값 |
|---|---|
| `subtree add` 소요 (로컬 bare) | fin 0.39 s · fit 0.57 s |
| `subtree add` 소요 (GitHub https 직접) | fin 2.05 s · fit 3.15 s · 자격 증명 불필요 · `git remote -v` 0줄(리모트 등록 불필요) |
| `subtree pull` 소요 | fin 0.20 s(1파일 `.claude/rules/workflow.md`) · fit 0.17 s(6파일 · vitest 미러 #492) |
| 커밋 수 | 48 → **820**(add 2 · 이력 전체 편입) → pull 2 더해 822 |
| pack (gc 후 · 리모트 ref 제거 후) | 1.1 MiB → **11.81 ~ 12.15 MiB** |
| 결과 트리 = 서비스 `dev` 트리? | `HEAD:apps/finance` == `fin/dev^{tree}` **YES** · fitness **YES** |
| 루트 충돌 | **0** — 루트 항목 12 → 13(`apps` 만 추가). 두 앱의 루트 파일은 전부 `apps/*/` 아래로 간다 |
| add 커밋 메타 | 본문 트레일러 `git-subtree-dir` · `git-subtree-mainline` · `git-subtree-split`(= 서비스 dev SHA). 다음 pull 은 이것으로 기준을 찾는다 |
| pull 커밋 | `Merge commit '<dev SHA>' into dev` — 2-parent 머지. 서비스 dev SHA 가 조상이 된다 |
| 충돌 재현 (`sub3.sh`) | 스크래치 fit 클론에 README 1줄 커밋 + pleiades 쪽 `apps/fitness/README.md` 1줄 수정 → pull → `CONFLICT (content)` · `UU apps/fitness/README.md` — **일반 merge 와 같은 충돌 해결 절차** |

**`--squash` 비교 (`sub4.sh`)**

| | 이력 포함 | `--squash` |
|---|---|---|
| 커밋 수 | 822 | **56** (48 + add 2×2 + pull 2×2) |
| pack (리모트 ref 제거·gc) | **11.81 MiB** | **8.80 MiB** |
| 트리 = 서비스 dev | YES | YES |
| 이후 `subtree pull --squash` | 동작(`Squashed 'apps/fitness/' changes from 94e4e15..a984b85`) | — |

→ squash 는 3 MiB(25%)만 줄인다 — 크기의 대부분이 **HEAD 에 있는** 폰트·스크린샷·lock 이기 때문.

**이력 포함인데 경로 이력이 끊긴다 (`sub2.sh`)**

```bash
git log --oneline -- apps/finance/package.json | wc -l                 # 1   (add 커밋만)
git -C $S/myFinance.git log --oneline dev -- package.json | wc -l      # 19
git log --oneline --follow -- apps/finance/package.json | wc -l        # 0
git blame -s apps/finance/package.json | cut -c1-8 | sort -u | wc -l   # 1 커밋  (서비스: 16 커밋)
```

→ subtree 는 이력을 재작성하지 않으므로 옛 커밋에서 파일은 **루트 경로**(`package.json`)에 있다. `apps/finance/…` 경로로 `log`·`blame` 하면 **add 커밋에서 끊긴다.** 이력은 객체로는 있고 `git log <split-sha> -- package.json` 처럼 옛 경로로는 읽힌다. `filter-repo --to-subdirectory-filter` 로 경로를 재작성하면 이 문제는 없지만 **SHA 가 바뀌어 이후 `subtree pull`(서비스 dev 정기 수용)의 공통 조상이 사라진다** — 이 절충은 미측정(filter-repo 미실험).

## 4. 루트 설정 충돌 (`scripts/m4.sh`)

| 항목 | myFinance `dev` | myFitness `dev` | subtree 후 |
|---|---|---|---|
| `.github/workflows` | `ci.yml` · `deploy.yml` · `security-audit.yml` | 같은 3개(이름 동일) | `apps/*/.github/` 는 **GitHub 가 읽지 않는다 → 동작 0**. 루트로 올리면 pleiades 의 `ci.yml`·`security-audit.yml` 과 **이름 충돌 2** |
| 트리거 | ci: push/PR `[dev, main]` · security: cron 월 03:00 + push · **deploy: `release: published` + `workflow_dispatch`** | 같음 | deploy 를 루트로 옮기면 pleiades 릴리즈가 서비스 서버 ssh 배포를 트리거하는 구조. 단 **pleiades Actions secrets = 0** (`gh api …/actions/secrets` → `total_count 0`) → preflight(`DEPLOY_SSH_FINGERPRINT`) 에서 fail |
| deploy secrets 이름 | `DEPLOY_SSH_{HOST,USER,KEY,PORT,FINGERPRINT}` · `DEPLOY_PATH` · `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` | 같음 | — |
| `.claude/` · `CLAUDE.md` | **tracked 16 파일 · CLAUDE.md 있음** | **0 · 없음**(`.gitignore:35-36` `.claude/`·`CLAUDE.md`) | fin 하네스는 `apps/finance/.claude/` 로 **들어온다**(중첩이라 자동 로드 안 됨 · 004 §3-2). fit 은 안 온다. `apps/fitness/.gitignore` 가 `CLAUDE.md` 를 계속 ignore(`git check-ignore` 확인) |
| `.gitignore` | 앵커(`/node_modules`, `/.next/`) · `.env` | 같음 + `/src/generated/prisma` · `.garmin-tokens/` | 중첩 `.gitignore` 는 자기 디렉터리 기준으로 동작(`apps/fitness/node_modules` → `apps/fitness/.gitignore:2`) · 루트 `node_modules` 는 pleiades `.gitignore` 가 처리 |
| `.env.example` | 있음 | 있음 | 앱별 유지 |
| `ecosystem.config.js` | `cwd: __dirname` · 4100 · 4210 | **`cwd` 서버 절대경로 하드코딩 3곳** · 4200 · MCP 포트 env | pleiades 에서 pm2 를 쓰지 않으면 읽히지 않는 파일(추론 · 미실행). fit 판은 경로가 고정돼 `apps/fitness` 로 옮겨도 서버 경로를 가리킨다 |
| `deploy/` | `deploy.sh` · `nginx/myfinance.conf` | `deploy.sh` · `nginx/myfitness.conf` | 앱 안에 남음 |
| `prisma/` | 30 파일 · migrations 27 | 37 파일 · migrations 36 | 앱별 스키마 2벌(DB 분리 유지) |
| 기타 루트 설정 | `.eslintrc.json`(eslint 8) · `next.config.mjs` · `vitest.config.mts` · `prisma.config.ts` · `tailwind.config.ts` · `assets/` · `.vscode/` | `eslint.config.mjs`(eslint 9 flat) · 나머지 동일 계열 | 전부 앱 디렉터리 안 — 충돌 0 |

## 5. 의존성 (`scripts/deps.sh` · `inst1.sh` · `inst2.sh` · `drift.js`)

```bash
git -C $S/$r.git show dev:package.json ; git -C $S/$r.git show dev:package-lock.json   # 스펙 → lock 실제 버전
```

| 패키지 | fin spec → lock | fit spec → lock | `packages/notify` |
|---|---|---|---|
| next | ^15.5.16 → **15.5.19** | ^16.3.5 → **16.3.5** | — |
| react · react-dom | ^19.2.7 → 19.2.7 | ^19.2.5 → 19.2.5 | — |
| prisma · @prisma/client | ^6.19.2 → 6.19.3 | ^6.19.3 → 6.19.3 | — |
| typescript | ^5 → 5.9.3 | ^5 → 5.9.3 | (루트 devDep) |
| vitest | ^4.1.8 → 4.1.9 | ^4 → 4.1.11 | ^4.1.8 → 4.1.11 |
| grammy | ^1.41.1 → 1.44.0 | ^1.42.0 → 1.42.0 | 무의존(D-3) |
| eslint · eslint-config-next | ^8 → **8.57.1** · 15.5.19 | ^9.39.4 → **9.39.4** · 16.3.5 | — |
| node-cron · pino · tailwindcss | 4.5.0 · 10.3.1 · 3.4.19 | 4.2.1 · 10.3.1 · 3.4.19 | — |
| @types/node | ^20 → 20.19.43 | ^20 → 20.19.39 | ^20 → 20.19.43 |
| zod · recharts · MCP sdk | 4.4.3 · 3.8.1 · 1.29.0 | 4.3.6 · 3.8.1 · 1.30.0 | — |
| `engines.node` | 없음 | 없음 | 없음 |
| `overrides` | **3** (`js-yaml`·`postcss`·`next>postcss`) | **16** (`esbuild:"$esbuild"`·`sharp`·`axios`·`deepmerge-ts` 등) | 없음 |
| lock 패키지 수 · 바이트 | 799 · 393 KB급 | 781 · 378 KB급 | 94 |
| CI node | 20.x | 20.x | 20.x · 24.x |
| lock 이 요구하는 node 최소 | next 15.5.19 `>=20.0` · vitest `^20` | **next 16.3.5 `>=20.9.0`** · `@csstools/*` `>=20.19.0` | — |

**호이스팅 충돌 후보 (주버전 다름):** `next` 15 ↔ 16 · `eslint` 8 ↔ 9 · `eslint-config-next` 15 ↔ 16. 나머지는 부 버전 차이.

**설치 규모 — 스크래치 실측** (`--ignore-scripts --no-audit --no-fund` · npm 캐시 warm · 로컬 node 20.18.0)

| 형태 | 명령 | 소요 | node_modules |
|---|---|---|---|
| 앱별 (현행 · lock 2개) | `git archive dev \| tar -x` → `npm ci` | fin 6 s · fit 6 s | fin **748 MB** · fit **797 MB** · 합 **1,545 MB** |
| npm workspaces (`["apps/*","packages/*"]` · lock 새로 생성) | 루트 `package-lock.json` 삭제 후 `npm install` | **36 s** · exit 0 | 루트 **957 MB** + `apps/fitness/node_modules` **203 MB**(`next`·`eslint`·`eslint-config-next`·`postcss` 만 중첩) = **1,160 MB** |
| workspaces lock | — | — | 937 패키지 · 463,915 B |

경고: EBADENGINE 7 패키지(`@csstools/*` 5 · `entities@8.1.0` · `eslint-visitor-keys@5.0.1` — `>=20.19.0`, 로컬 20.18.0) · deprecated 11 (eslint 8·9 둘 다 포함).
→ **fin 이 루트 호이스팅을 차지**(`next` 15 가 루트 · fit 의 16 이 중첩). `react` 는 두 앱이 **한 벌**(19.3.0)을 공유하게 된다.

**lock 3개 → 1개 전환 시 버전 드리프트 (`drift.js`)** — 서비스 lock 의 최상위 패키지를 workspace lock 이 각 앱에서 실제로 해석하는 버전과 비교:

| | 같음 | 다름 | 없음 | 직접 의존 중 다름 | override 대상 중 다름 |
|---|---|---|---|---|---|
| apps/finance | 491 | **221** | 7 | **21** (next 15.5.19→15.5.26 · react 19.2.7→19.3.0 · grammy 1.44.0→1.46.0 · zod 4.4.3→4.6.5 …) | `js-yaml` · `next` · `postcss` |
| apps/fitness | 459 | **242** | 3 | **22** (next 16.3.5→16.3.7 · react 19.2.5→19.3.0 · node-cron 4.2.1→4.6.0 · eslint 9.39.4→9.39.5 …) | **`deepmerge-ts` 8.0.2→7.1.5**(override `^8.0.2` 위반) · `brace-expansion` · `esbuild` · `sharp` 외 7 |

→ **npm 은 workspace 하위 `package.json` 의 `overrides` 를 무시한다** — `deepmerge-ts ^8.0.2` override 가 있는데 7.1.5 가 해석된 것이 그 증거. 보안 패치용 override 19개(fin 3 + fit 16)를 루트로 올려 합쳐야 하고 `"esbuild":"$esbuild"` 같은 `$` 참조는 **루트의 의존성**을 가리키게 뜻이 바뀐다.
→ 위 드리프트는 **lock 없이 새로 해석**한 값이다. 서비스 lock 두 개를 시드로 한 lock 병합(버전 고정 유지)은 **미측정**.
→ 대안(workspaces 없이 앱별 lock 유지): pleiades 루트에 `workspaces` 가 없으면 `apps/*` 안의 `npm ci` 는 독립 루트로 동작한다 — 위 "앱별" 행이 그 값(단, `apps/` 경로에서 직접 돌린 것은 아니고 `git archive` 추출본에서 쟀다).

## 6. 로컬 실행 분리 (`scripts/env.sh`)

```bash
git -C $S/$r.git grep --text -ohE 'process\.env\.[A-Z0-9_]+' dev -- src prisma.config.ts next.config.mjs ecosystem.config.js | sort | uniq -c
git -C $S/$r.git show dev:.env.example | grep -oE '^[A-Z0-9_]+='
git -C $S/$r.git show dev:src/instrumentation.ts
```

| | myFinance | myFitness |
|---|---|---|
| 서비스 포트 (ecosystem) | web 4100 · MCP 4210 (`MCP_PORT`) | web 4200 · MCP `MCP_PORT`(env · 기존 실측 4301) |
| 로컬 `npm run dev` | `next dev` — 포트 미지정(기본 3000 · 또는 `PORT`) | 같음 |
| DB | `DATABASE_URL` 1개 | `DATABASE_URL` 1개 |
| 텔레그램 env | `TELEGRAM_BOT_TOKEN` · `TELEGRAM_ALLOWED_CHAT_IDS` · `TELEGRAM_ADMIN_CHAT_IDS` · `TELEGRAM_WEBHOOK_SECRET`(예시에만) | `TELEGRAM_BOT_TOKEN` · `TELEGRAM_ALLOWED_CHAT_IDS` |
| 인증 | `AUTH_SECRET` · `AUTH_PIN` · `AUTH_TRUST_HOST` (next-auth) | 없음 |
| 외부 계정 | `WHOOING_WEBHOOK_URL`(설정 UI) | **`GARMIN_EMAIL` · `GARMIN_PASSWORD`** · `MFDS_API_KEY` · `MFDS_BASE_URL` |
| AI | `claude -p`(PATH) | `CLAUDE_BIN`(미설정 시 PATH 의 `claude`) |
| cron env | 없음(봇 프로세스 `scheduler.ts` 안 `cron.schedule` 10+곳) | `SYNC_CRON`(기본 `0 6,9,12,15,18,21 * * *`) · `MORNING_/EVENING_/REPORT_CRON` · `AUTO_ADJUST(_MAINTENANCE)_CRON` |
| MCP/로그 env | `MCP_TRANSPORT` · `MCP_PORT` · `MCP_LOG_*` 4 · `MCP_CONFIG_PATH` · `MYFINANCE_ROOT` | `MCP_TRANSPORT` · `MCP_PORT` · `MCP_HTTP_URL` · `MCP_LOG_*` 4 · `APP_BASE_URL` |
| **web 기동만으로 도는 것** | `instrumentation.ts` **빈 함수** — cron 은 봇 프로세스에서만 | **`instrumentation.ts` → `startCronJobs()`** (Garmin 싱크 3시간 주기) · photo temp sweeper · orphan job sweeper(기존 실측: 부팅 1회 + 5분 주기 DB 쓰기) |
| 봇 | `bot.start()` long polling (`src/bot/standalone.ts:53`) | `.start({…})` long polling (`:53`) |
| Garmin 토큰 저장 | — | `process.cwd()/.garmin-tokens/` (ignored) |

**서비스와 겹치지 않고 띄우는 env 최소 집합 (정적 근거):**
- 공통: `DATABASE_URL` = **로컬 별도 DB**(서비스 DB 금지 · 1a-0 의 β2 빈 스키마 사본 `myfinance_int`·`myfitness_int` 선례) · `PORT` 를 4100/4200 과 다르게(로컬엔 원래 리슨 없음 — 004 §M4).
- 텔레그램: **토큰을 비우거나 검증용 별도 봇 토큰**(Q46). 두 봇 모두 long polling 이라 **서비스 토큰을 로컬에서 쓰면 Telegram 이 같은 토큰의 두 번째 `getUpdates` 에 409 Conflict 를 내 서비스 봇 수신이 끊긴다** — 문서화된 Telegram 동작이며 **서비스 영향이라 실측하지 않았다.** fin 웹 경로 3곳도 전송을 낸다(기존 실측 · 1a-0).
- fit: **`GARMIN_EMAIL`/`GARMIN_PASSWORD` 미설정** — 웹 기동만으로 Garmin 싱크 cron 이 등록된다. 같은 계정 로그인은 서비스의 Garmin 세션·레이트리밋에 영향 가능(미측정). 미설정 시 `client.ts:19` 에서 throw → cron tick 에러 로그. `SYNC_CRON` 등으로 끌 env 는 없다(스케줄 문자열만 바꿀 수 있음 — 기존 실측 "cron off 는 env 가 아니다").
- fin: `AUTH_SECRET`·`AUTH_PIN` 로컬 값 · 봇 프로세스(`dist/bot/standalone.cjs`)를 띄우지 않으면 cron 0.
- AI: `claude -p` 호출은 사용자 로컬 Claude 쿼터를 쓴다(서비스 무관).

## 7. `integration/pleiades` 산출물 vs 서비스 `dev` (`scripts/m7.sh`)

```bash
git -C $S/$r.git diff --name-status dev integration/pleiades
git -C $S/$r.git log --oneline dev..integration/pleiades
git -C $S/myFitness.git diff --stat integration/pleiades...fd8b7c5
```

| | myFinance | myFitness |
|---|---|---|
| `integration/pleiades` SHA | `c94cbb8` | `210e875` |
| dev → int 뒤처짐 (`int..dev`) | **2** | **0** |
| int 에만 있는 커밋 | 7 | 16 |
| **트리 차이 (dev ↔ int)** | 10 파일 — **`.claude/` 9 + `CLAUDE.md`** (전부 M · 하네스 문구 #8·#51·#62·#67) | 20 파일 — **`.claude/` 18 + `CLAUDE.md`** (A) + `.gitignore` (M) |
| `src/`·테스트·`package.json` 차이 | **0** | **0** — 1a-2 vitest·테스트 3파일은 **이미 서비스 dev 에 있다**(myFitness#492 미러 · dev tip `a984b85`) |
| 1a-3 브랜치 | 없음 | `integration/feature-pleiades-1a-3` = **`fd8b7c5`** (base `210e875`) — 10 파일 +471/−324: `send.ts` 삭제 → `notifier.ts` 신설 · 호출부 4 · `send.test.ts` → `notifier.test.ts` · `package.json` 에 `@pleiades/notify` = `git+https://…pleiades.git#d9d1535…`(pleiades dev SHA) |

**가져올 가치 목록**

| 산출물 | 서비스 dev 에 있나 | subtree 후 처리 |
|---|---|---|
| fin 하네스 정정(#8·#51·#62·#67) | **아니오** — dev ↔ int 트리 차이 10 파일(전부 하네스 문구) | `apps/finance/.claude/` 위에 int 판을 덮는 커밋 1개 |
| fit 하네스 18 + `CLAUDE.md` (#369·#372·#72) | **없음**(dev 에서 ignored) | `apps/fitness/.gitignore` 의 `.claude/`·`CLAUDE.md` 2줄 제거가 선행 — 이 수정은 다음 `subtree pull` 때 **충돌 후보**(서비스 `.gitignore` 가 바뀌면) |
| 1a-2 vitest·회귀 테스트 3 | **있음** | 가져올 것 없음 |
| 1a-3 `fd8b7c5` (fit) | 없음 | 모노레포에선 git dep 대신 **workspace 참조**로 다시 써야 한다 — `package.json`/lock 2파일은 폐기 대상, `src/` 8파일은 재사용 가능 |

## 미측정

| 항목 | 이유 |
|---|---|
| gitleaks·trufflehog 급 스캔(엔트로피 · 수백 규칙) | 도구 미설치 · 설치는 사용자 결정 |
| 서비스 lock 2개를 시드로 한 단일 lock 병합 결과 · 드리프트 0 가능성 | 수동 병합 필요 — 이번 범위 밖 |
| workspaces 로 두 앱 `lint`/`typecheck`/`test`/`build` 통과 여부 | 설치만 했다(`--ignore-scripts` · `prisma generate` 미실행) |
| `filter-repo --to-subdirectory-filter` 대안의 크기·pull 절충 | 미실험 |
| 텔레그램 409 · Garmin 동시 세션의 서비스 영향 | **실측 자체가 서비스 영향** — 금지 |
| GitHub 저장소 크기 증가의 원격 표시값 | push 금지 |
| `apps/` 경로 안에서 직접 `npm ci`(루트 workspaces 없음) | 추출본에서만 쟀다 |
