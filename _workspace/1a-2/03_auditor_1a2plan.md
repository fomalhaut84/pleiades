# 1a-2 착수 직전 재감사 — `01_plan_1a2.md` 반증

감사 2026-09-11 · `reversibility-auditor` · **읽기 전용** (대상 저장소·pleiades 쓰기 0, 이 파일만 예외)
대상 ref — `repos/myFitness` **`8b7a224`** (`integration/pleiades`) · `repos/myFinance` **`6542152`** (`integration/pleiades`), **둘 다 지시된 값과 일치**.
감사 종료 시 두 worktree `git status --porcelain` **공백** · fit `package.json` md5 `6d60a1985026f3889e44d151d2bb4dfc` · `package-lock.json` md5 `4b9ee3b5049a54a2167ff8b9ccfbb318` (감사 시작 시각과 동일).
측정·설치·실행은 전부 스크래치패드 `audit-1a2/{lockrepro,variantB,u3,ci-test}/` 에서 했다. 대상 저장소에서 실행한 쓰기성 명령 **0건**.

**판정 요약: 확인 6 · 정정 10 · 미확인 1(U4, 단 성격 재분류 필요).**
**정정이 나왔으므로 계획은 초안 상태로 되돌아간다.** 그중 **블로커 3건**(정정 3·4·5)은 승인 게이트 전에 계획을 고쳐야 한다.
반대로 **U3 는 이 감사에서 실측으로 해소**됐다 — 계획이 "집행 중 해소"로 둔 항목이 착수 전에 닫혔다.

---

## 주장 1 — §0 표 전항 재현

**판정: 정정** (핵심 수치 전부 재현, 열거 2건이 누락)

### 재현된 것 (확인)

```bash
# 스크래치 사본 (package.json · package-lock.json 만 복사) → $postcss 리터럴화
S=…/scratchpad/audit-1a2/lockrepro
cp repos/myFitness/{package.json,package-lock.json} $S/
# "postcss": "$postcss" → "^8.5.10"
npm install --package-lock-only --save-dev --ignore-scripts \
  'vitest@^4.1.8' '@vitest/coverage-v8@^4.1.8' 'vite-tsconfig-paths@^6.1.1'
```

| 항목 | 계획 §0 | 실측 | |
|---|---|---|---|
| EXIT | 0 | **0** (`up to date, audited 785 packages in 4s`) | ✓ |
| lock 엔트리 | 716 → 785 (+69) | **716 → 785**, 신규 엔트리 `len(new)` = **69** | ✓ |
| vitest / coverage-v8 | 4.1.11 / 4.1.11 | **4.1.11 / 4.1.11** | ✓ |
| vite-tsconfig-paths / vite | 6.1.1 / 6.4.3 | **6.1.1 / 6.4.3** | ✓ |
| postcss / esbuild | 8.5.25 / 0.28.1 무변경 | **8.5.25 / 0.28.1 무변경** | ✓ |
| `vite/node_modules/esbuild` | 없음 | **ABSENT** | ✓ |
| `dependencies` 오염 | 없음 | 루트 `dependencies` 에 vite 계열 **0** | ✓ |
| npm 이 쓰는 범위 | `^4.1.11` | devDeps 에 `vitest: ^4.1.11` · `@vitest/coverage-v8: ^4.1.11` · `vite-tsconfig-paths: ^6.1.1` | ✓ |
| `npm audit` 도입 전 | 4 (critical 1 · high 2 · moderate 1) | `{critical:1, high:2, moderate:1, total:4}` · 집합 `['hono','js-yaml','next','sharp']` | ✓ |
| `npm audit` 도입 후 | 4 · 같은 집합 | **동일** `{1,2,1,4}` · **동일 집합** | ✓ |
| `--omit=dev` | 3 | `{critical:1, high:1, moderate:1, total:3}` | ✓ |
| fit `package.json` | scripts.test = verify 2종 · `overrides.postcss="$postcss"` · devDeps 15 · vitest 계열 0 · `engines`·`type` 없음 | **전부 일치** (devDeps 열거 15개 확인) | ✓ |
| `tsconfig.json` | `include: **/*.ts` · `paths @/*→./src/*` · `moduleResolution: bundler` | **일치.** fin 과의 차이는 `jsx`(preserve↔react-jsx) + include 1줄(`.next/dev/types/**/*.ts`) **뿐** (`compilerOptions` 키 집합 동일, 값 차이 `jsx` 1개) | ✓ |
| lint | `eslint src/ --max-warnings 0` · `ignores: src/generated/**` | 일치 | ✓ |
| `.gitignore` | `/coverage`·`/dist`·`/.next/`·`.env` | `:8 /coverage` · `:11 /.next/` · `:16 /dist` · `:28 .env` | ✓ |
| `.env` | `localhost:5432/myfitness` | `DATABASE_URL` 의 host/db = **`localhost:5432/myfitness`** (자격 증명 미열람. 키 이름 4개: `DATABASE_URL`·`GARMIN_EMAIL`·`GARMIN_PASSWORD`·`MFDS_API_KEY`) | ✓ |
| `.next`·`dist` | 2026-09-09 15:02 빌드본 | `.next` Sep 9 15:02:07 · `dist` Sep 9 15:01:44 | ✓ |
| `error.ts` / `telegram.ts` 줄수 | 85 / 60 | **85 / 60** | ✓ |
| deploy.yml 트리거 | `release.published` · `workflow_dispatch(tag)` | 일치 (`on: release: types:[published]` + `workflow_dispatch`) | ✓ |
| security-audit.yml 트리거 | `push:[main,dev]`(paths `package*.json`) + 주간 cron + dispatch | 일치 (cron `0 3 * * 1`) | ✓ |

### 정정 1 — `npm test` 참조는 **7행이 아니라 9행 / 7파일**

```bash
/usr/bin/grep -rn --binary-files=text -E "npm (run )?test" . \
  --exclude-dir={node_modules,.git,.next,dist}
```

```
./.claude/rules/workflow.md:135
./.claude/rules/workflow.md:165
./.claude/skills/branch-workflow/SKILL.md:76
./.claude/skills/branch-workflow/SKILL.md:83
./.claude/skills/codex-review-loop/SKILL.md:68
./.github/workflows/ci.yml:66          ← 계획 누락 (주석)
./.github/workflows/ci.yml:69
./CLAUDE.md:34
./docs/specs/bot-telegram-ipv6-timeout-202606.md:214   ← 계획 누락
./docs/specs/training-plan-ui.md:119                    ← 계획 누락
```

10행이 나오되 `ci.yml:66`·`:69` 는 같은 스텝이므로 **명령 참조로 세면 9행**(`ci.yml:66` 은 주석). 어느 쪽으로 세든 **7 은 아니다.**
결론(이름 `test` 를 유지하면 전부 유효)은 바뀌지 않지만, **`docs/specs/bot-telegram-ipv6-timeout-202606.md:214`** 는 *"현재 레포에 테스트 프레임워크(jest/vitest)가 없고 `npm run test` 스크립트도 미정의"* 라 **도입 후 거짓이 되는 세 번째 문장**이다(주장 7 참조).

### 정정 2 — `ci.yml` 트리거에 `push` 가 빠졌다

계획 §0: *"fit `ci.yml` | `pull_request: [dev, main]`"*. 원문은 **둘 다**다:

```yaml
on:
  push:
    branches: [dev, main]
  pull_request:
    branches: [dev, main]
```

**결론은 불변** — `integration/pleiades` 는 push 목록에도 없다. 그러나 §5 "서비스 영향 없음"의 근거 열거가 한 축 비어 있었고, 이 문서의 규율(열거를 센다)에 어긋난다.

---

## 주장 2 — `test` 스크립트 설계가 참조를 깨지 않는가 · CI 에서 DB 없이 도는가

**판정: 확인** (단서 2)

- **이름을 바꾸지 않으므로 9행 전부 명령으로서 유효하다.** `vitest run && npm run verify:mcp-date-labels && npm run verify:food-edit-pending` 은 `npm test`/`npm run test` 호출부를 그대로 만족한다.
- **verify 2종은 DB 를 열지 않는다.**
  - `scripts/verify-food-edit-pending.ts` — import 는 `../src/bot/commands/food-edit-state`·`food-edit-format` **둘뿐**이고 두 모듈 모두 `^import` **0행**(순수). prisma 경로 없음.
  - `scripts/verify-mcp-date-labels.ts` — `../src/mcp/tools/weight-loss` 를 import 하고 **그 파일 1행이 `import prisma from "../prisma"`(런타임 import)** 다. 그러나 `src/lib/prisma.ts` 는 `new PrismaClient()` 만 하고 쿼리를 하지 않는다(lazy connect). fit 자체 스펙이 이를 명시한다 — `docs/specs/364-mcp-date-label-off-by-one.md:111`: *"`scripts/verify-mcp-date-labels.ts` — … **DB 연결 없이 실행된다 (Prisma client 는 lazy connect)**."*
  - `vitest run` 이 앞에 붙어도 **이 성질은 바뀌지 않는다** — 테스트 대상 2파일은 prisma 를 import 하지 않는다(주장 4).
- **CI 순서상으로는 애초에 쟁점이 아니다.** `ci.yml` 은 job-level `DATABASE_URL` + postgres service 를 두고 `npm test` **앞에** `prisma generate`·`migrate deploy` 를 돌린다. `npm test` 시점에 DB 는 이미 있다. `npm ci` 가 devDeps 를 설치하므로 `vitest` 도 있다.
- `&&` 단축 평가로 vitest 실패 시 verify 2종이 안 돈다 — fail-fast 의도와 일치.

**단서 (정정 9 로 계상):** `ci.yml:64-68` 의 주석(*"#364 회귀 검증 스크립트는 CI 에 걸어야…"*, *"`npm run test` 도 실재하지 않아 함께 신설"*)과 스텝 이름 `Test — 회귀 검증 스크립트` 가 도입 후 부정확해진다. `ci.yml` 은 계획 §1 변경 파일 목록에 **없다.** B-2 와 같은 성격의 문장이므로 **같은 PR 에 넣든 명시적으로 제외하든 계획이 결정해야 한다.**

---

## 주장 3 — `vitest.config.mts`(fin 사본)가 fit tsconfig(bundler·paths)에서 `@/` 를 해석하는가

**판정: 확인 — 문서 근거가 아니라 실제 실행으로 확인했다**

스크래치 `u3/` 에 fit `package.json`(vitest 3종 추가 + postcss 리터럴화) · fit `package-lock.json` · **fit `tsconfig.json` 원본** · fin `vitest.config.mts` 사본(coverage include 만 계획대로 조정)을 두고 **전체 설치 후 실행**했다.

```
added 682 packages, and audited 683 packages in 7s     # npm install --ignore-scripts, EXIT 0
npx vitest run
 RUN  v4.1.11
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

테스트 안에서 **`import { PROBE } from '@/lib/probe'`** 와 **`import { … } from '@/bot/utils/error'`** 가 모두 해석됐다.
fit `tsconfig.json` 은 `baseUrl` 없이 `paths: {"@/*": ["./src/*"]}` + `moduleResolution: "bundler"` 인데 **`vite-tsconfig-paths@6.1.1`**(deps: `tsconfck ^3.0.3`)이 그대로 처리한다.
fin `node_modules/vite-tsconfig-paths/package.json` = **6.1.1** 로 동일 버전이다.

`compilerOptions` 키 집합은 fin·fit 동일, 값 차이는 **`jsx` 하나**, include 차이는 **1줄**. 계획 §7-3 의 서술 그대로다.

`--coverage` 도 정상 동작 (v8 provider · 리포트 출력 확인).

> **부수 관측(비블로커):** coverage `include` 에 `src/lib/**/*.ts` 를 fin 에서 그대로 가져오면 fit `src/lib` **전체**가 0% 로 리포트에 열거된다. threshold 설정이 없어 실패하지는 않는다. 노이즈만 남는다.

---

## 주장 4 — 테스트 대상 2파일의 순수성 · `replyLong` 간접 검증

**판정: 순수성은 확인 · 대상 선정 근거는 정정**

### 확인된 것

- **`src/bot/utils/error.ts` — `^import` 0행.** 완전 순수. export 5개(`sanitizeMessage`·`sanitizeError`·`getErrorCode`·`isNetworkError`·`isHtmlParseError`), `isHtmlParseError` 는 82-85행.
- **`src/bot/utils/telegram.ts` — import 1행이고 그것이 `import type { Context } from "grammy"`.** **런타임 import 0** 확인.
- **`replyLong` fake ctx 경유 `splitMessage` 검증은 성립한다.** 실제로 돌려서 4가지를 전부 잡았다:
  - 줄 경계 우선: `'A'×3000 + '\n' + 'B'×2000` → chunk 2개, 첫 chunk **정확히 3000자**
  - `trimStart`: 둘째 chunk 가 `'B'×2000` (선행 `\n` 제거됨)
  - 절반 미만이면 하드 슬라이스: `'A'×100 + '\n' + 'B'×5000` → 첫 chunk **정확히 4096자**
  - 파싱 실패 폴백: 첫 `ctx.reply` 가 throw → `'<b>hi</b>'` 가 `'hi'` 로 재전송
  - (분할 규칙 확인: `lastIndexOf('\n', maxLength)` 는 index `maxLength` 의 `\n` 도 잡으므로 chunk 최대 길이가 4096 을 넘지 않는다.)

### 정정 3 (블로커) — coverage include 근거가 틀렸고, **1a-3 이 교체할 모듈에 baseline 이 없다**

계획 §1 `vitest.config.mts` 행: *"coverage `include` 만 `['src/lib/**/*.ts', 'src/bot/utils/**/*.ts']`(**fit 의 1a 추출 대상이 `bot/utils` 라서**)"*.

**fit 의 1a 추출 대상은 `bot/utils` 가 아니다.**

| 출처 | 원문 |
|---|---|
| 003 §5-2 표 1a-3 행 | *"myFitness **`send.ts`(124줄)** → 패키지 교체, 호출 6건"* |
| `.claude/skills/dual-repo-change/SKILL.md:116` | *"같은 역할 다른 위치 \| … \| 아웃바운드 전송: **`bot/notifications/send.ts`**"* |

실측:

```bash
wc -l src/bot/notifications/send.ts          # → 124
sed -n '1,45p' src/bot/notifications/send.ts
```

```ts
import type { Bot, InlineKeyboard } from "grammy";          // 타입 전용
import { sanitizeError, isNetworkError, isHtmlParseError } from "../utils/error";
const MAX_MSG = 4096;
const RETRY_DELAYS_MS = [2000, 8000, 30000];
…
function truncate(text: string): string {
  return text.length > MAX_MSG ? text.slice(0, MAX_MSG - 3) + "..." : text;   // ← 1a-3 이 지우는 절단
}
```

즉:

1. **1a-3 이 실제로 지우는 절단·재시도·HTML→plain 폴백은 `send.ts` 안에 있다** (`truncate` :36 · `RETRY_DELAYS_MS` · `isHtmlParseError` 분기 :59 · `isNetworkError` 분기 :64). Q10-L ①(분할로 통일)이 바꾸는 것도 여기다.
2. `bot/utils/error.ts` 는 그 모듈의 **의존**일 뿐이다 (`send.ts:7`). error.ts 테스트는 **유효한 간접 baseline 이지만 직접 baseline 이 아니다.**
3. `telegram.ts` 의 `splitMessage`/`replyLong` 은 **아웃바운드가 아니다** — 소비자가 `src/bot/commands/report.ts:3` 와 `src/bot/commands/ai.ts:12` 뿐인 **인바운드 명령 응답 경로**다. 1a-3 과 무관하다. (`mdToHtml` 만 `scheduler.ts:7` 에서 아웃바운드에 쓰인다.)
4. **그리고 `send.ts` 는 테스트 가능하다** — 런타임 import 가 `../utils/error` 하나뿐이고 `Bot`·`InlineKeyboard` 는 타입 전용이다. fake bot(`bot.api.sendMessage`) + `TELEGRAM_ALLOWED_CHAT_IDS` env + `vi.useFakeTimers()` 로 재시도 4회·지연 `[2000,8000,30000]`·폴백·`SendResult{sent,failed,total}` 를 그대로 잡을 수 있다.

**영향:** 계획대로 집행하면 1a-2 가 *"회귀 baseline 이 생겼다"*(003 §5-2 1a-2 행)를 선언하는데 **1a-3 이 통째로 교체할 바로 그 모듈은 커버리지 include 에서도 빠지고 테스트도 0건**이다. 되돌리기 등급에는 영향이 없지만 **단계의 목적이 미달**한다.

**고칠 곳:** §0 "첫 테스트 대상 후보" 행 · §1 `vitest.config.mts` 행의 include 와 그 괄호 근거 · §1 테스트 파일 목록(`src/bot/notifications/__tests__/send.test.ts` 추가 여부) · §7 항목 4.
**최소 수정안:** coverage include 에 `'src/bot/notifications/**/*.ts'` 를 더하고, `send.test.ts` 를 이번에 넣을지 1a-3 착수 시점으로 미룰지를 **승인 게이트 항목으로 올린다.** 미룬다면 §0 B-1/B-2 옆에 *"1a-3 교체 대상 `send.ts` 는 이번 범위 밖 — baseline 은 그 의존(`error.ts`)까지"* 를 명시한다.

---

## 주장 5 — 되돌리기: `npm ci` 가 실제로 `node_modules/vitest` 를 제거하는가

**판정: 확인 — 실측**

```bash
cp -R u3 ci-test           # vitest 설치된 상태 (node_modules/{vitest,vite,@vitest} 존재)
cd ci-test
cp repos/myFitness/{package.json,package-lock.json} .   # 되돌린 상태로 교체
npm ci --ignore-scripts
```

```
before: node_modules/@vitest node_modules/vite node_modules/vitest
NPM_CI_EXIT=0
after: vitest=REMOVED  vite=REMOVED  @vitest=REMOVED  bin/vitest=REMOVED
```

`npm ci` 는 **`node_modules` 를 통째로 지우고 lock 대로 재설치**한다(npm 공식 동작). 따라서:

| 시점 | 계획 §4 | 판정 |
|---|---|---|
| 머지 전 | 브랜치 삭제 · `git checkout integration/pleiades && npm ci` | **확인** — 체크아웃으로 `package.json`·lock 이 되돌아가고 `npm ci` 가 node_modules 를 lock 에 맞춘다. 위 실측과 같은 경로 |
| 머지 후 | `git revert <squash>` + `npm ci` | **확인** — 동일 |
| 서버 무접촉 | `integration/pleiades` 미배포 | **확인** (주장 6) |

되돌리기 등급 **즉시** 유지. `node_modules` 가 되돌리기 단위가 아니라는 서술도 맞다.

---

## 주장 6 — 서비스 영향 0

**판정: 확인 (워크플로우·미배포·`.env`) · U4 는 미확인이되 성격 재분류 필요 → 정정 8**

### 확인

| 워크플로우 | 트리거 원문 | `integration/pleiades` |
|---|---|---|
| `ci.yml` | `push.branches:[dev,main]` + `pull_request.branches:[dev,main]` | **무관** (정정 2 로 push 축 보강) |
| `deploy.yml` | `release: types:[published]` + `workflow_dispatch(inputs.tag)` | **무관** — 브랜치 이벤트가 아예 없다 |
| `security-audit.yml` | `schedule: '0 3 * * 1'` + `workflow_dispatch` + `push.branches:[main,dev] paths:[package.json, package-lock.json]` | **무관** — `package*.json` 을 바꾸지만 브랜치가 `main`/`dev` 가 아니다 |

`.env` — `DATABASE_URL` 의 host/db 는 **`localhost:5432/myfitness`**. 서버가 아니다. (자격 증명은 열람하지 않았다.)

### 미확인 — U4 (`next build` 가 로컬 DB 를 여는가)

정적으로 닫을 수 없다. 양쪽 근거가 다 있다:

- **열지 않는다는 쪽**: `next.config.mjs` 는 빈 객체. `src/instrumentation.ts` 의 `register()` 는 **서버 부트스트랩 시점**에 호출되고 `next build` 는 호출하지 않는다(내용도 cron·sweeper 기동이라 런타임 전용). app 페이지 15곳 전부 `export const dynamic = "force-dynamic"`.
- **열 수 있다는 쪽**: `export async function GET` 을 가진 route handler **15파일 중 13파일에 `force-dynamic` 이 없다.** Next 16 은 dynamic API 를 안 쓰는 GET 핸들러를 빌드 타임에 prerender 할 수 있고, 그 경로가 prisma 를 부르면 빌드 중 쿼리가 난다. **그리고 fit CI 자체가 `build` 앞에 postgres service + `prisma migrate deploy` 를 둔다** — DB 가 필요하다는 가장 강한 방증이다.

**실행 가능성 실측:** 로컬 5432 에 postgres 가 **LISTEN 중**이다.

```
lsof -nP -iTCP:5432 -sTCP:LISTEN
postgres 2348 sagan 7u IPv6 … TCP [::1]:5432 (LISTEN)
postgres 2348 sagan 8u IPv4 … TCP 127.0.0.1:5432 (LISTEN)
```

2026-09-09 15:02 의 `.next`/`dist` 빌드본도 같은 조건에서 나온 것으로 보인다.

→ **E5 는 돌 가능성이 높다.** 그러나 계획 §6 U4 의 *"실패 시: 관측만(로컬)"* 은 틀렸다 — DB 가 필요한 경우 `npm run build` 는 **실패하고 8절 게이트가 막힌다.** 정정 8 참조.

---

## 주장 7 — B-2 가 되돌리기 등급·9-0 리뷰 범위를 바꾸는가

**판정: 등급·리뷰 범위는 확인 · 범위 열거와 집행 경로는 정정**

### 확인

- **되돌리기 등급 즉시 불변.** 문서 2파일(→3파일, 정정 4)은 `git revert` 대상에 들어갈 뿐 `npm ci`·재빌드·재시작을 추가하지 않는다. 계획 §4 의 "4파일 → 6파일" 서술은 산술만 정정 4 에 따라 갱신하면 된다.
- **9-0 리뷰 범위 불변.** pleiades `workflow.md` 9-0 표는 *"대상 저장소 변경 — 경로 무관(`repos/**` 또는 원본 `~/workspace/myF*`) → **에이전트 필수**"* 이고, 우선순위 규칙은 *"필수 행이 하나라도 걸리면 필수"* 다. 1a-2 PR 은 `package.json`·테스트만으로 이미 필수 경로다. 문서 2~3파일은 **아무것도 바꾸지 않는다.**

### 현재 문장 인용

`repos/myFitness/.claude/rules/workflow.md:165-166`

```
> myFitness 의 `npm run test` 는 vitest 가 아니라 **verify 스크립트 2개**다 — 테스트 프레임워크가 없다는 것과
> **실행할 것이 없다는 것은 다르다.** 검증 세트는 7단계의 4종이 정본이고, 이 절은 그것을 축약하지 않는다.
```

`repos/myFitness/.claude/skills/branch-workflow/SKILL.md:83-84`

```
> `npm run test` 는 vitest 가 아니라 **verify 스크립트 2개**다 — 프레임워크가 없다는 것과
> **실행할 것이 없다는 것은 다르다.** 4종이 정본이다.
```

### 정정 4 (블로커 성격) — B-2 는 2곳이 아니라 **3곳**이다

`/usr/bin/grep -rn --binary-files=text -E "vitest|jest|테스트 프레임워크|test framework|테스트 인프라" .claude CLAUDE.md docs`

fit **하네스(`.claude/`)** 안에 세 번째 지점이 있다:

`repos/myFitness/.claude/rules/workflow.md:275` (8-5 회귀 방지 테스트 절, **작성 원칙** 목록)

```
- 테스트 프레임워크 부재 시 최소한 재현 스크립트 (`scripts/*.ts`) + `docs/specs/` 스펙 갱신으로 대체.
```

**이건 죽은 서술이 아니라 살아 있는 지시다.** vitest 도입 후에도 남겨두면 에이전트가 회귀 테스트를 계속 `scripts/*.ts` 로 대체한다 — **1a-2 가 만들려는 회귀 baseline 을 정면으로 무력화하는 문장**이고, 165행·`branch-workflow:83` 보다 실행 영향이 크다. 165행은 사실 진술이라 거짓이 되는 데 그치지만, 275행은 **행동을 바꾼다.**

(`docs/specs/` 쪽 6곳 — `bot-telegram-ipv6-timeout-202606.md:214`, `364-…:111,148`, `350-…:136`, `220-…:97`, `M14-followup.md:179,181`, `m5-1-…:183`, `m5-2-1-…:110`, `security-dependabot-202606-2.md:99` — 은 **그 시점의 스펙 기록**이라 pleiades 의 소진 이력과 같은 성격이다. 고칠 필요는 없지만 **계획이 "고치지 않는다"를 명시**해야 한다. 지금은 존재 자체가 계획에 없다.)

### 정정 5 (블로커) — B-2·#51 이 **실제로 로드되는 하네스에 도달하지 않는다**

계획이 고치는 것은 **worktree** `repos/myFitness/.claude/` 다. 그런데:

| 근거 | 내용 |
|---|---|
| `CLAUDE.md` 하네스 절 | *"**대상은 항상 원본**이다"* — `bin/claude-with fit` = `claude --add-dir ~/workspace/myFitness` |
| `workflow.md` 브랜치 전략 · #25 | *"`integration/pleiades` 는 `dev` 로 머지되지 않는다"* |
| `CLAUDE.md` 상태 문단 (2026-09-10) | #42 집행 = *"myFitness#373 · **원본 동기화 완료**"* |
| `workflow.md` 10절 (#27) | 머지 후 원본 복원 절차(`git archive integration/pleiades … \| tar -x`) |

즉 **worktree 만 고치면 세션이 실제로 읽는 fit 하네스는 계속 *"vitest 가 아니라 verify 스크립트 2개"* 라고 말한다.** #51 의 원인이 된 #42 는 정확히 이 이유로 원본 동기화를 함께 했다.

그런데 계획 머리말은 못박는다:

> *"이 단계가 쓰는 곳은 `repos/myFitness` worktree(모드 I)와 — #51 만 — `repos/myFinance` worktree 다. **원본 `~/workspace/myF*` 쓰기 0.**"*

**B-2 의 목적과 이 문장은 양립하지 않는다.** 둘 중 하나를 골라 **승인 게이트 항목으로 올려야 한다:**

- **(a)** 원본 `.claude/` 동기화를 범위에 넣고 **"쓰기 0" 문구를 철회**한다 (#42 선례 · `git archive … | tar -x` 경로 · 되돌리기는 여전히 즉시)
- **(b)** 동기화를 후속으로 미루고, §5 에 **"머지 후에도 실제 로드되는 fit 하네스는 거짓 문장을 유지한다"** 를 명시한다

**같은 것이 #51(fin `repos/myFinance/.claude/rules/workflow.md`)에도 걸린다.** #51 이슈 본문은 *"fin 단독 문서 수정 — 모드 I · `repos/myFinance` · base `integration/pleiades`"* 라 원본 동기화를 다루지 않는다 — 고치는 목적이 *"운영자가 model 지정 대신 쿼터 회복을 기다리는 것을 막는 것"* 인데, 그 운영자가 읽는 파일은 원본이다.

### 정정 6 — E10 의 pleiades 하네스 정정 대상이 1곳이 아니라 **5곳**

계획 E10: *"`dual-repo-change` §4 표 fit 행(*"vitest 없음"* → 도입)"* — **표 1행만** 적었다. 실측:

```
.claude/skills/dual-repo-change/SKILL.md:115   (§4 저장소별 표 — 계획이 잡은 1곳)
.claude/skills/dual-repo-change/SKILL.md:119-120 (바로 아래 인용 블록, 같은 문장)
.claude/agents/dual-repo-operator.md:64         (같은 표)
.claude/agents/dual-repo-operator.md:69-70      (같은 인용 블록)
.claude/rules/workflow.md:231                   ("myFitness 의 `test` 는 … verify 스크립트다(1a-2 가 vitest 를 도입할 때까지)")
```

`.claude/rules/workflow.md:223` 의 8절 fit 행(`npm run test`)은 **계획 말대로 무변경으로 유효하다** ✓.

**부수 (정정 아님 · 선행 결함):** `.claude/skills/dual-repo-change/SKILL.md:86-89` 는 여전히 *"myFitness worktree 에는 `.claude/` 가 없다 (PR #6 교차 감사 M8) … fit 의 하네스는 gitignored 라 worktree 에 따라오지 않는다"* 라고 적는다. **#369 로 tracked 된 뒤 stale 이다** — 계획의 B-2 가 바로 그 worktree 파일을 고친다. `bin/claude-with:12` 의 같은 결함은 2026-09-09 에 이미 고쳤다. E10 에 함께 넣는 것이 자연스럽다.

---

## 주장 8 — U3 (vite 6.4.3 이 `$esbuild` override 의 esbuild 0.28.1 위에서 기동하는가)

**판정: 정정 — 계획은 "집행 중 해소(E3·E4)"로 두었으나 이 감사에서 실측으로 해소됐다**

스크래치 `u3/` 에서 **전체 설치 + 실제 실행**을 했다 (fit `package.json`+lock 만 복사, `$postcss` 리터럴화, `$esbuild` 는 **원본 그대로 유지**):

```bash
npm install --ignore-scripts        # → added 682 packages, EXIT 0
node -e "console.log(require.resolve('esbuild',{paths:[require.resolve('vite/package.json')]}))"
# → …/u3/node_modules/esbuild/lib/main.js      ← top-level. 중첩 사본 없음
node -e "console.log(require('esbuild/package.json').version)"   # → 0.28.1
node -e "console.log(require('vite/package.json').version, …dependencies)"
# → 6.4.3 {"esbuild":"^0.25.0", …}             ← 선언 범위 밖
npx vitest run           # → Test Files 1 passed (1) · Tests 8 passed (8)
npx vitest run --coverage # → v8 리포트 정상 출력
```

**vite@6.4.3 은 선언 범위(`^0.25.0`) 밖인 esbuild@0.28.1 위에서 정상 기동하고 TS 변환·커버리지까지 돈다.** node v20.18.0 · npm 10.8.2 · darwin 25.6.0.

**엔진 경고 확인:** 설치 시 EBADENGINE 7종이 뜨는데 **전부 baseline 패키지**다(`@csstools/*` 5 · `eslint-visitor-keys` · `entities` — lock diff 로 baseline 13개 중 일부임을 확인). **vitest 도입이 새로 만드는 EBADENGINE 은 0** 이다:

| 신규 패키지 | engines.node | node 20.18.0 |
|---|---|---|
| `vite@6.4.3` | `^18.0.0 \|\| ^20.0.0 \|\| >=22.0.0` | **충족** |
| `vitest@4.1.11` | `^20.0.0 \|\| ^22.0.0 \|\| >=24.0.0` | **충족** |
| `esbuild@0.28.1` | `>=18` | 충족 |

**결과:** §6 U3 행 · E3 의 *"U3 1차"* · E4 의 *"U3 해소"* · §9 대안(`$esbuild` 리터럴화 → 중단·승인 재요청)은 **전부 불필요**하다. 003 §9 의 신규 미확인 U3 도 **이행 정정 대상**(E10)이다.

**유일한 단서(관측만):** 신규 optional dep `@napi-rs/lzma-linux-x64-gnu@1.5.1`(rollup 의 optionalDependency, `os:["linux"] cpu:["x64"] engines:{node:"^22.20 || ^24.12 || >=25"}`)이 **ubuntu CI · node 20.x 에서 EBADENGINE 경고**를 낸다. optional 이고 fit 에 `.npmrc` 가 없어 `engine-strict` 도 꺼져 있으므로 `npm ci` 는 실패하지 않는다. darwin 로컬에서는 os 게이트로 설치조차 안 된다.

---

## 주장 9 — #51 (fin 8-4 문장)

**판정: 확인 (문안 단서 1 → 정정 10)**

**fin 현재 문장** — `repos/myFinance/.claude/rules/workflow.md:222`

```
품질은 유사하지만 model/quota 이슈 잦음. 실패 시 pr-review-toolkit 으로 폴백. 에러 메시지가
"model not supported when using Codex with a ChatGPT account" 형태로 나오면 대개 쿼터 초과이므로 사용자에게 확인.
```

**fit 머지본(myFitness#373)** — `repos/myFitness/.claude/rules/workflow.md:257`

```
품질은 유사하지만 model/quota 이슈 잦음. 실패 시 pr-review-toolkit 으로 폴백. 에러가 나면 종류를 가른다 —
`"model not supported when using Codex with a ChatGPT account"` 는 **model 미지원**이므로 위 `model` 파라미터를
지원 모델로 지정해 재시도하고, usage limit·rate limit 계열 메시지가 **쿼터 초과**이므로 사용자에게 확인한다
(쿼터는 GitHub Codex bot 과 공유된다).
```

**fit 정정 블록 형식** — 같은 파일 259-262

```
> **정정 (2026-09-10 · pleiades#42).** 8-4 는 codex-cli MCP 를 "선택 대안"으로 권하고 폴백으로 끝났으나,
> 정본(pleiades workflow.md 9-7 · fin 8-4 — myFinance `e228c81` · 2026-07-02)은 "GitHub Codex bot 과 동일 쿼터를 공유하므로
> 원칙적으로 쓰지 않는다" 다. 절 순서(8-6 뒤)도 base 부터 있던 선행 결함 — 8-3 뒤로 옮겼다. 되돌리기: 즉시.
```

- **절 순서 — 계획의 "정정 없음" 은 맞다.** fin 은 `8-3`(205행 끝) → `#### 8-4.`(207행) → `### 9. PR 생성`(224행) 순이다. fit 이 #373 에서 고친 "8-6 뒤에 있던 8-4" 결함이 fin 에는 없다 ✓
- **형식 정합성:** fit 블록은 헤더에 **이슈 번호만**(`pleiades#42`) 적고, 출처 근거(`myFinance e228c81`)는 **본문**에 둔다. 계획 §2 의 *"(`pleiades#51` · 출처 myFitness#373 Codex P2)"* 는 출처를 헤더에 묶는 표기로 읽힌다. **fit 관례에 맞추려면 헤더는 `> **정정 (2026-09-11 · pleiades#51).**`, 본문에 `myFitness#373 Codex P2` 를 쓴다.** 문안 수준.
- **구조 차이 1건 (계획 미기재):** fin 의 8절에는 **`8-5`·`8-6` 이 없다**(8-1~8-4 뒤 곧바로 `### 9`). fit 은 8-5(회귀 테스트)·8-6(PR body)을 갖는다. #51 범위에는 영향이 없지만, "fit 머지본 문안으로 맞춘다"가 8절 전체 대칭화로 읽히지 않도록 §2 에 한 줄 적어두는 편이 안전하다.
- **정정 5 가 #51 에도 걸린다** — 위 주장 7 참조.

---

## 주장 10 — 계획이 놓친 것 (실측)

| 항목 | 판정 | 근거 |
|---|---|---|
| `next-env.d.ts`·`*.tsbuildinfo` 가 diff 를 오염시키나 | **문제 없음** | fit `.gitignore:43 *.tsbuildinfo` · `:44 next-env.d.ts`. `git ls-files` 에 **둘 다 없다**(untracked). 실제로 `next-env.d.ts`(288 B)·`tsconfig.tsbuildinfo`(203 KB)가 2026-09-09 빌드로 이미 있는데 `git status --porcelain` 이 공백이다 |
| `npm install` 이 `package.json` 의 다른 필드를 건드리나 | **건드리지 않는다** | 변형 B(직접 편집 `^4.1.8` → 인자 없이 `npm install --package-lock-only --ignore-scripts`): **md5 `978176b0e732a518a3c6153be80ff6e1` 가 install 전후 동일.** `overrides` 재정렬 0 · 키 순서 변동 0 · devDeps 범위 `^4.1.8` 유지 · lock **785** 로 §0 재현값과 일치. **계획 §1 ②(직접 편집으로 fin 범위 `^4.1.8` 고정)가 성립한다** |
| `tsconfig.include` 가 `vitest.config.mts` 를 typecheck 대상에 넣나 | **안 넣는다** | `npx tsc --noEmit --listFilesOnly` → 프로젝트 파일 4개(`error.ts`·`telegram.ts`·`probe.ts`·`__tests__/smoke.test.ts`)뿐, **`vitest.config.mts` 없음.** TS 의 `**/*.ts` 글롭은 `.mts` 를 매치하지 않는다. → 설치 전/후 CI 순서 문제 **없음**. (fin `vitest.config.mts` 도 같은 이유로 타입체크 대상이 아니다) |
| 테스트 파일이 `tsc --noEmit` 을 통과하나 | **통과** | 같은 실행에서 `tsc --noEmit` **EXIT 0** (테스트 파일은 include 대상이고 `vitest`·`grammy` 타입 해석됨) |
| eslint 9 / eslint-config-next 16 이 `.test.ts` 에서 warning 을 내나 (**U2**) | **부분 해소 — 규칙이 테스트 관용구를 막지 않는다** | 스크래치에 fit `eslint.config.mjs` 그대로 복사 후 `npx eslint src/ --max-warnings 0` → **EXIT 0**. per-file counts: `smoke.test.ts` **0 error / 0 warning**. fake ctx 는 `as unknown as Context` 로 캐스팅해 `@typescript-eslint/no-explicit-any` 를 피했다. **남은 U2 는 실제 테스트 파일의 스타일뿐**이고, §6 U2 의 "규칙 자체가 테스트 관용구를 막으면 중단" 시나리오는 가능성이 낮다 |
| `vitest run` 이 테스트 0건일 때 exit code | **exit 1** | `No test files found, exiting with code 1` — 계획 E3 의 *"테스트 0 은 exit 1 일 수 있음 — 기동 여부만 본다"* 서술이 **정확**하다 |
| coverage include `src/lib/**/*.ts` 의 부작용 | 노이즈 | fit `src/lib` 전체가 0% 로 열거된다. threshold 없음 → 실패 아님 |

---

## 정정 목록

| # | 정정 | 블로커 | 고칠 절 |
|---|---|---|---|
| **1** | `npm test` 참조 **7행 → 9행 / 7파일**. 누락 `ci.yml:66`(주석) · `docs/specs/bot-telegram-ipv6-timeout-202606.md:214` · `docs/specs/training-plan-ui.md:119` | 아니오 | §0 표 `npm test` 참조 행 |
| **2** | `ci.yml` 트리거에 **`push: [dev, main]`** 누락 (결론 불변) | 아니오 | §0 표 `ci.yml` 행 · §5 |
| **3** | coverage include 근거 *"fit 의 1a 추출 대상이 `bot/utils`"* 가 **오류**. 1a-3 교체 대상은 **`src/bot/notifications/send.ts`(124줄)** 이고 그 모듈에 baseline 이 0건. `send.ts` 는 런타임 import 가 `../utils/error` 하나뿐이라 **테스트 가능**하다 | **예** — 단계 목적(회귀 baseline) 미달 | §0 "첫 테스트 대상 후보" 행 · §1 `vitest.config.mts` 행 · §1 테스트 파일 목록 · §7-4 |
| **4** | B-2 는 **2곳이 아니라 3곳**. 누락 `repos/myFitness/.claude/rules/workflow.md:275`(8-5 작성 원칙 — *"테스트 프레임워크 부재 시 … `scripts/*.ts` 로 대체"*)는 **살아 있는 지시**라 1a-2 목적을 무력화한다. 더불어 `docs/specs/` 6파일은 "고치지 않는다"를 명시해야 한다 | **예** (성격상) | §0 B-2 행 · §1 변경 파일 표 · §4 파일 수 |
| **5** | B-2·#51 이 고치는 것은 **worktree** 하네스인데 세션이 로드하는 것은 **원본 `~/workspace/myF*/.claude/`** 다(`bin/claude-with` · `--add-dir`). `integration/pleiades` 는 `dev` 로 가지 않으므로 **실제 쓰이는 하네스는 계속 거짓**이다. #42 선례는 원본 동기화를 함께 했다. 계획 머리말 *"원본 쓰기 0"* 과 양립하지 않는다 → **(a) 원본 동기화를 범위에 넣고 문구 철회 / (b) 후속으로 미루고 §5 에 한계 명시** 중 택일해 **승인 게이트 항목으로** | **예** | 머리말 · §0 B-2 · §2 · §3 E6·E9 · §5 |
| **6** | E10 의 pleiades 하네스 정정 대상 **1곳 → 5곳** (`dual-repo-change:115` **+ `:119-120`** · `dual-repo-operator.md:64` **+ `:69-70`** · `workflow.md:231`). 8절 표 `:223` 은 무변경 유효 ✓. 부수: `dual-repo-change:86-89` 의 *"fit worktree 에 `.claude/` 없다"* 는 **이미 stale** | 아니오 | §3 E10 |
| **7** | **U3 는 이미 해소됐다** — 스크래치 전체 설치 + `npx vitest run` 8/8 통과 + `--coverage` 정상. vite 6.4.3 이 top-level esbuild 0.28.1 위에서 돈다(`require.resolve` 확인, 중첩 없음). 신규 EBADENGINE 0. §9 대안(`$esbuild` 리터럴화 → 중단) 불필요 | 아니오 (범위 **축소**) | §6 U3 행 · §3 E3·E4 의 U3 문구 · E10 의 003 §9 U3 이행 정정 |
| **8** | §6 U4 의 *"실패 시: 관측만(로컬)"* 이 **틀렸다.** `next build` 가 DB 를 요구하면 **E5 가 막힌다**(force-dynamic 없는 GET route handler 13/15 · fit CI 가 build 앞에 postgres+migrate 를 두는 방증). 실측상 로컬 5432 postgres 는 LISTEN 중이라 돌 가능성이 높으나, **"로컬 postgres 가동"이 E5 의 전제**임을 적어야 한다 | 아니오 | §6 U4 행 · §3 E5 |
| **9** | `ci.yml:64-68` 주석 + 스텝 이름 `Test — 회귀 검증 스크립트` 가 도입 후 stale. `ci.yml` 은 §1 변경 파일 목록에 없다 — **포함/제외를 결정**해야 한다 | 아니오 | §1 변경 파일 표 |
| **10** | #51 정정 블록 형식: fit 관례는 헤더에 **이슈 번호만**, 출처는 본문. `> **정정 (2026-09-11 · pleiades#51).**` + 본문에 `myFitness#373 Codex P2`. 그리고 **fin 8절에는 8-5·8-6 이 없다**(구조 차이)는 한 줄 | 아니오 (문안) | §2 |

**확인(정정 없음)으로 남는 주장:** 2(`test` 스크립트 설계 + verify 2종 DB 무접촉) · 3(`@/` 해석 — 실행으로 확인) · 4 전반부(두 파일 순수성 · `replyLong` 간접 검증 성립) · 5(`npm ci` 제거 — 실행으로 확인) · 6 전반부(세 워크플로우 트리거 · `.env` · 미배포) · 9 본체(#51 문안 대조 · 절 순서) · 10 의 생성 파일·`npm install` 필드 보존·`.mts` 미포함·U2 부분 해소.

**권고:** 정정 3·4·5 를 계획에 반영한 **2회차 초안**을 낸 뒤 재감사한다. 정정 7 은 계획의 범위를 **줄이므로**(U3 대안·E3 의 별도 관문 제거) 함께 반영하면 E3~E4 가 단순해진다.
