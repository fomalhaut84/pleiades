# 01_surveyor_i1 — #32 I1 `packages/notify` 테스트 타입체크 게이트 실측 (2026-09-09)

이슈 **#37 Phase 1 실측 B**. 선택지 (a) `vitest --typecheck` · (b) 별도 `tsconfig.test.json` + `tsc --noEmit -p` · (c) 둘 다 · (d) 도입 안 함.

**측정 장소는 스크래치패드 사본뿐이다.** `packages/notify` 원본·`package-lock.json`·루트 `node_modules` 쓰기 **0건**
(측정 후 `git status --porcelain` 에 `packages/**` 없음 — 확인함).
사본: `/private/tmp/claude-501/-Users-sagan-workspace-pleiades/b157e638-1697-4e47-8fde-6fd960260a99/scratchpad/i1/root/`
(루트 `package.json` + `packages/notify/` 를 그대로 복사해 **위임형 루트 구조를 보존**했다 — `prepare`·`npm pack` 을 재현하려면 루트가 필요하다).

환경: node **v20.18.0** / npm **10.8.2** / tsc **5.9.3** / vitest **4.1.11** (`^4.1.8` 해석 — `packages/notify/package-lock.json` 실측) / darwin 25.6.0.
1a-0 기록(`_workspace/1a-0/04_operator_1a0.md` E5·E6, `measured-facts.md` 2026-09-08 절)과 같은 환경이다.

---

## ⚠ 뒤집힌 가정 (6건)

### F1. `vitest --typecheck` 는 기본값으로 `.test.ts` 를 **보지 않는다** — 선택지 (a) 의 전제가 깨진다

vitest 4.1.11 의 typecheck 기본 include 는 `**/*.{test,spec}-d.?(c|m)[jt]s?(x)` 다 (설치본 실측:
`node_modules/vitest/dist/chunks/defaults.9aQKnqFk.js:73-77`). `src/index.test.ts` 는 `-d` 가 없으므로 대상 밖이다.

```
npx vitest run --typecheck        # 설정 없음 · 오류 주입 상태
→ exit 0 · "Type Errors  no errors" · "Test Files 2 passed (2)"
```

### F2. `typecheck.include` 를 넣어도 **여전히 안 잡힌다** — (a) 는 (b) 의 파일을 반드시 포함한다

`vitest.config.mts` 에 `typecheck.include: ['**/*.test.ts']` 만 넣으면 vitest 는 테스트를 typecheck 대상으로 **집어가지만**,
넘겨받은 tsc 가 **base `tsconfig.json` 의 `exclude`**(= 손대면 안 되는 안전 조건) 때문에 그 파일들을 프로그램에서 뺀다.

```
npx vitest run --typecheck        # typecheck.include 만 · 오류 주입 상태
→ exit 0 · "Test Files 4 passed (4)" · "Type Errors  no errors"
```

`typecheck.tsconfig: './tsconfig.test.json'` 을 **함께** 지정해야 비로소 잡힌다(아래 §2). 즉

> **(a) 와 (b) 는 배타적 선택지가 아니다. (a) = (b) + `vitest.config.mts` 10줄.**
> `tsconfig.test.json` 없이 성립하는 (a) 는 존재하지 않는다 — base `exclude` 를 푸는 방법뿐인데 그건 금지 조건이다.

이 인과는 대조군으로 확인했다: `exclude: []` 인 `tsconfig.test.json` 을 쓰면 `tsc` 가 그 오류를 잡는다(§3).
그리고 `npx tsc -p . --showConfig` 의 해석 결과 `"files": ["./src/index.ts"]` — 테스트가 실제로 프로그램에서 빠져 있다.

### F3. `vitest.config.ts` 는 이 환경에서 **로드 자체가 실패**한다 — `.mts` 여야 한다

```
npx vitest run --typecheck        # vitest.config.ts (확장자 .ts)
→ exit 1
failed to load config from …/vitest.config.ts
Error [ERR_REQUIRE_ESM]: require() of ES Module …/node_modules/std-env/dist/index.mjs not supported.
  at Object.<anonymous> (…/node_modules/vitest/dist/config.cjs:4:14)
```

`packages/notify/package.json` 에 `"type": "module"` 이 없어 `.ts` 설정이 CJS 로 로드되고, node v20.18.0 에는
`require(esm)` 이 없다. **`"type":"module"` 추가는 대안이 아니다** — `dist` 는 `module: "commonjs"` 로 빌드돼 소비자에게 나간다.
**`vitest.config.mts`** 로 쓰면 통과한다(실측 exit 0).

### F4. 두 안 모두 **`@types/node` devDependency 가 선결**이다 (현재 없음)

`exclude` 를 푸는 순간 기존 `src/build-config.test.ts`(1a-0 E6 의 회귀 테스트)가 먼저 터진다.

```
npx tsc --noEmit -p tsconfig.test.json        # @types/node 미설치
→ exit 2
src/build-config.test.ts(1,30): error TS2307: Cannot find module 'node:fs' …
src/build-config.test.ts(2,22): error TS2307: Cannot find module 'node:path' …
src/build-config.test.ts(8,47): error TS2304: Cannot find name '__dirname'.
src/index.test.ts(12,7):        error TS2322: Type 'string' is not assignable to type 'number'.
```

현재 `packages/notify` devDependencies 는 `vitest` **1개뿐**이다. `@types/node` 를 넣으면 위 3건이 사라지고 TS2322 만 남는다.
**런타임(node v20.18.0)에 맞추려면 `^20` 으로 핀해야 한다** — 그냥 `npm i -D @types/node` 하면 **`^26.5.0`** 이 들어온다(실측).
둘 다 게이트는 통과하지만 26 은 런타임에 없는 API 타입을 통과시킨다.

| | `@types/node@^26.5.0` (기본) | `@types/node@^20` (핀) |
|---|---|---|
| 해석 버전 | 26.5.0 | **20.19.43** |
| `node_modules/@types/node` 크기 | 2.6 M | **2.3 M** |
| 추가 패키지 | 2 (`@types/node` + `undici-types`) | 2 (동일) |
| `packages/notify/package-lock.json` | **+18줄** | +18줄 |
| (b) 게이트 exit (clean) | 0 | **0** |
| `prepare`(`tsc -p .`) exit | 0 | **0** |

### F5. `tsconfig.test.json` 에 `"noEmit": true` 를 **파일 안에** 넣지 않으면 테스트가 `dist/` 로 새어나간다

`--noEmit` 을 CLI 에만 두고 파일에는 안 넣은 4줄 최소안에서, 누군가 플래그 없이 돌리면:

```
npx tsc -p tsconfig.test.json        # --noEmit 없이
→ exit 2 · dist/ 에 build-config.test.d.ts · build-config.test.js · index.test.d.ts · index.test.js 생성 (총 6파일)
```

루트 `files` 가 `packages/notify/dist` 이므로 **그대로 소비자 tarball 에 실린다.**
`"compilerOptions": { "noEmit": true }` 를 파일에 박으면 플래그 없이 돌려도 `dist` 미생성(실측).

### F6. vitest 4.1.11 은 타입 오류를 잡고도 요약줄에 `Type Errors  no errors` 를 찍는다

```
 FAIL  src/index.test.ts [ src/index.test.ts ]
TypeCheckError: Type 'string' is not assignable to type 'number'.
 ❯ src/index.test.ts:12:7
 Test Files  1 failed | 3 passed (4)
      Tests  6 passed (6)
Type Errors  no errors          ← 오류가 있는데도 이렇게 찍힌다
exit=1
```

**exit code 는 정확하다(1).** 요약줄 `Type Errors` 를 사람이나 스크립트가 읽으면 오판한다.

---

## 1. 현재 상태 재현 — 게이트 3개가 전부 통과한다

**주입:** 사본 `packages/notify/src/index.test.ts` 말미에

```ts
// #32 I1 실측 — 의도적 타입 오류
const bad: number = VERSION;
void bad;
```

**명령과 exit code** (사본 `packages/notify/` 에서):

| 명령 | 오류 주입 전 | **오류 주입 후** | 판정 |
|---|---|---|---|
| `npx tsc --noEmit -p .` | 0 | **0** | 못 잡음 (테스트가 `exclude`) |
| `npx tsc -p .` (= `prepare`) | 0 | **0** | **정상** — 안전 조건이 의도대로 동작 |
| `npx vitest run` | 0 | **0** | 못 잡음 (transpile-only) |

루트 스크립트로도 동일: `npm run typecheck` = 0 · `npm test` = 0 · `npm run build` = 0.
**#32 I1 의 문제 서술은 그대로 재현된다.**

---

## 2. (a) `vitest --typecheck`

**플래그 존재:** 있다. `npx vitest run --help` →
`--typecheck  Enable typechecking alongside tests (default: false)`.
하위 옵션: `--typecheck.enabled` · `.only` · `.checker` · `.allowJs` · `.ignoreSourceErrors` · **`.tsconfig <path>`** · `.spawnTimeout`.
**`--typecheck.include` 는 CLI 에 없다 — 설정 파일에서만 지정할 수 있다.**

**단계별 실측 (오류 주입 상태)**

| 구성 | exit | 결과 |
|---|---|---|
| 설정 없음 | **0** | `Type Errors no errors` — **F1** |
| `vitest.config.ts` + `typecheck.include` | **1** | 설정 로드 실패 `ERR_REQUIRE_ESM` — **F3** |
| `vitest.config.mts` + `typecheck.include` 만 | **0** | `Test Files 4 passed (4)` · 오류 미검출 — **F2** |
| `vitest.config.mts` + `include` + **`tsconfig: './tsconfig.test.json'`** | **1** | `TypeCheckError: Type 'string' is not assignable to type 'number'` · `src/index.test.ts:12:7` ✅ |

**필요한 최소 설정 — 파일 2개 · 15줄 + devDep 1**

`packages/notify/vitest.config.mts` (**10줄**, 신규):
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    typecheck: {
      include: ['**/*.test.ts'],
      tsconfig: './tsconfig.test.json',
    },
  },
});
```

`packages/notify/tsconfig.test.json` (**5줄**, 신규 — (b) 와 동일 파일):
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": true },
  "exclude": []
}
```

`packages/notify/package.json` devDependencies **+1줄**: `"@types/node": "^20"` (F4).

**부수 효과:** `vitest.config.mts` 가 있어도 `--typecheck` 없는 평문 `npx vitest run` 은 `Test Files 2 passed (2)` 로 **변하지 않는다**(설정 유무 대조 실측). `--typecheck` 를 켤 때만 4파일 6테스트로 중복 계수된다(런타임 2 + 타입 2).
**잔여 임시파일 없음** — 실행 후 `tsconfig.vitest-temp.json` 류 산출물 0건.

---

## 3. (b) 별도 `tsconfig.test.json` + `tsc --noEmit -p`

**실측 (오류 주입 상태)**

```
npx tsc --noEmit -p tsconfig.test.json
→ exit 2
src/index.test.ts(12,7): error TS2322: Type 'string' is not assignable to type 'number'.
```
clean 상태 → exit 0.

**최소안 변형 3개 비교**

| 변형 | 줄 수 | 오류 검출 | 위험 |
|---|---|---|---|
| `include` 명시 + `noEmit` | 6 | ✅ exit 2 | — (`include` 는 `extends` 로 상속되므로 불필요) |
| **`include` 생략 + `noEmit` 생략** | **4** | ✅ exit 2 | ❌ **F5 — 플래그 없이 돌리면 테스트가 `dist/` 로 산출** |
| **`include` 생략 + `noEmit` 명시 (채택안)** | **5** | ✅ exit 2 | 없음 — 플래그 없이 돌려도 `dist` 미생성 |

**추가 파일·줄:** `tsconfig.test.json` **1파일 5줄** + 루트 `package.json` 스크립트 **1줄** + `@types/node` devDep **1줄** (+ `packages/notify/package-lock.json` **+18줄**, 자동).

### `prepare` 에 영향을 주지 않는가 — 3중으로 확인

| 확인 | 명령 | 결과 |
|---|---|---|
| ① `prepare` 가 이 파일을 읽는가 | `tsconfig.test.json` 을 **고의로 파손**(`{ THIS IS NOT JSON`) 후 `npx tsc -p .` | **exit 0** — 읽지 않는다. 대조군 `tsc -p tsconfig.test.json` 은 exit 2 로 즉시 반응 |
| ② `tsc -p .` 의 해석 결과 | `npx tsc -p . --showConfig` | `files: ["./src/index.ts"]` · `exclude` 4패턴 그대로. `tsconfig.test.json` 흔적 0 |
| ③ tarball 에 실리는가 | 사본 루트에서 `npm pack --dry-run` | **4파일** — `package.json` · `packages/notify/dist/index.d.ts` · `packages/notify/dist/index.js` · `packages/notify/package.json`. `tsconfig.json`·`tsconfig.test.json`·`vitest.config.mts`·`src` **전부 미포함** (1a-0 E6 은 5파일 — 차이는 `README.md`, 사본에 없음) |

**소비자 임시 클론 end-to-end 재현** — (a)+(b) 를 모두 적용한 사본을 git 커밋(`21de95f`)하고 `git+file://` 로 설치:

```bash
# consumer/package.json: "@pleiades/notify": "git+file://<사본루트>#21de95f"
npm install --no-audit --no-fund     # exit 0 — prepare 성공
find node_modules/@pleiades/notify -maxdepth 3 -not -path '*/node_modules/*'
```
| 항목 | 값 |
|---|---|
| `npm install` exit | **0** — 임시 클론에서 `prepare`(`tsc -p packages/notify`) 정상 |
| 설치 트리 | `package.json` · `packages/notify/dist/` · `packages/notify/package.json` (1a-0 E4 와 동일) |
| **`@types/node` 누수** | **0** — 소비자 `node_modules/@types` 자체가 없다 |
| **`vitest` 누수** | **0** |
| `require('@pleiades/notify').VERSION` | `0.0.0` |
| `npm ci` 3회 | 1.65 / 1.55 / 1.51 s → **중앙값 1.55 s** · 설치 크기 16 K |

> `npm ci` 는 1a-0 E4 의 2.13 / 2.18 / 2.35 s(중앙값 2.18) 보다 **빠르다**. 다른 세션·다른 캐시 상태라
> 통제된 비교가 아니다. **말할 수 있는 것은 "증가가 관측되지 않았다" 까지다.**

### `build-config.test.ts` 단언이 (b) 에 걸리는가 — **걸리지 않는다**

`build-config.test.ts` 는 `../tsconfig.json` 을 읽어 `skipLibCheck === true` 와 `exclude` 4패턴을 단언한다.
(b) 는 **별도 파일**에서 `exclude: []` 를 쓰므로 단언 대상이 아니다 — (a)+(b) 적용 후 `npx vitest run` = `3 passed (3)`.

> 다만 방향이 반대로 얽힌다: **`build-config.test.ts` 의 M2 단언이 곧 F2 의 원인**이다.
> 그 회귀 테스트가 base `exclude` 를 고정하고 있기 때문에 (a) 도 (b) 도 두 번째 tsconfig 없이는 성립할 수 없다.
> 두 안 어느 쪽을 골라도 `build-config.test.ts` 는 **그대로 두어야** 한다 — 그것을 지우면 `prepare` 안전 조건이 풀린다.

---

## 4. 소요 시간표 (각 3회 · 중앙값 · warm cache)

**사본 루트에서 npm 스크립트로** (`npm` 오버헤드 포함 — 실제 8절 검증이 도는 형태)

| 게이트 | 명령 | 3회 (s) | **중앙값** | 현행 대비 |
|---|---|---|---|---|
| 현행 타입 | `npm run typecheck` | 0.618 / 0.563 / 0.565 | **0.565 s** | — |
| 현행 테스트 | `npm test` | 0.651 / 0.628 / 0.603 | **0.628 s** | — |
| 현행 빌드 | `npm run build` | 0.563 / 0.585 / 0.568 | **0.568 s** | — |
| **(b)** | `npm run typecheck:test` | 0.639 / 0.610 / 0.620 | **0.620 s** | **+0.620 s** (추가 게이트) |
| **(a)** | `npm run test:types` | 1.085 / 1.030 / 1.041 | **1.041 s** | `npm test` 대체 시 **+0.413 s** / 추가 시 **+1.041 s** |

**패키지 디렉터리에서 직접** (npm 오버헤드 제외)

| 명령 | 3회 (s) | 중앙값 |
|---|---|---|
| `npx vitest run` | 0.600 / 0.575 / 0.575 | 0.575 |
| `npx vitest run --typecheck` | 1.114 / 1.025 / 1.039 | **1.039** (`typecheck 304~534 ms` 내부 계측) |
| `npx tsc --noEmit -p .` | 0.661 / 0.661 / 0.657 | 0.661 |
| `npx tsc --noEmit -p tsconfig.test.json` | 0.724 / 0.734 / 0.731 | **0.731** |
| (참고) `npx tsc --noEmit -p . --types` | 0.332 / 0.315 / 0.321 | 0.321 |

> **`--types` 행이 참고인 이유:** 사본에는 `@types/node` 가 설치돼 있어 `tsc` 가 자동 포함한다.
> 현행 원본(= `@types/node` 없음)의 `typecheck` 는 **0.321 s 쪽에 가깝다.**
> 즉 `@types/node` 도입 자체가 **기존 `npm run typecheck` 를 약 +0.34 s** 늘린다. 표의 0.565/0.661 은 이미 그것을 포함한 값이다.

**(c) 둘 다** = (a) 1.041 + (b) 0.620 → **+1.661 s**. tsc 가 사실상 두 번 돈다(vitest 가 spawn 하는 tsc + 직접 tsc).
검출 능력은 동일하다 — (c) 가 (a)·(b) 어느 쪽보다 더 잡아내는 오류는 이번 측정 범위에서 **0건**이다.

**(d) 도입 안 함** = 0 s · 0 파일. 대신 §1 의 3행(전부 exit 0)이 1a-1 이후에도 그대로 남는다.

---

## 5. `workflow.md` 8절 pleiades 행 — 안별 1줄 변경

현행 행: `lint 해당 없음 | 타입 npm run typecheck | 테스트 npm test | 빌드 npm run build`

| 안 | 8절 변경 (1줄) | 추가 스크립트 |
|---|---|---|
| **(a)** | **테스트** 칸을 `npm test` → **`npm test` + `npm run test:types`** 로 (또는 `packages/notify` 의 `test` 를 `vitest run --typecheck` 로 바꿔 칸 표기 무변경) | 루트 `"test:types": "npm --prefix packages/notify run test -- --typecheck"` |
| **(b)** | **타입** 칸을 `npm run typecheck` → **`npm run typecheck && npm run typecheck:test`** 로 (또는 루트 `typecheck` 자체를 두 `tsc` 의 `&&` 로 합쳐 칸 표기 무변경) | 루트 `"typecheck:test": "tsc --noEmit -p packages/notify/tsconfig.test.json"` |
| **(c)** | 위 두 줄 모두 | 위 두 스크립트 모두 |
| **(d)** | 변경 없음 | 없음 |

두 안 모두 8절의 선행 조건 **`npm --prefix packages/notify install`** 은 그대로 필요하다
(`vitest` 뿐 아니라 `@types/node` 도 서브 패키지 devDep 이다).
`npm test -- --typecheck` 형태의 인자 전달은 실측으로 동작을 확인했다(clean exit 0 · 오류 주입 exit 1).

---

## 6. 되돌리기 — 실측 기반

| 안 | 등급 | 되돌리는 행위 | 파일·줄 |
|---|---|---|---|
| **(a)** | **즉시** | `rm packages/notify/vitest.config.mts packages/notify/tsconfig.test.json` · 루트 `package.json` `test:types` 1줄 삭제 · `packages/notify/package.json` `@types/node` 1줄 삭제 · `npm --prefix packages/notify install` 로 lockfile 되돌림 | 삭제 2파일(15줄) · 수정 2파일(−2줄) · lockfile −18줄 |
| **(b)** | **즉시** | `rm packages/notify/tsconfig.test.json` · 루트 `typecheck:test` 1줄 삭제 · `@types/node` 1줄 삭제 · lockfile | 삭제 1파일(5줄) · 수정 2파일(−2줄) · lockfile −18줄 |
| **(c)** | **즉시** | (a) 와 동일 + 스크립트 1줄 더 | 삭제 2파일(15줄) · 수정 2파일(−3줄) · lockfile −18줄 |
| **(d)** | — | 해당 없음 | — |

**되돌릴 수 없는 것: 없다.** 세 안 모두 소비자 계약(`files`·`exports`·`dist`)을 건드리지 않는다 —
`npm pack --dry-run` 4파일 · 소비자 설치 트리 무변경 · `prepare` exit 0 을 각각 확인했다(§3).
`@types/node` 를 되돌릴 때 **1a-1 테스트가 이미 `node:*` 를 쓰고 있으면 `build-config.test.ts` 가 다시 깨진다** —
되돌리기는 "게이트 도입 이전 상태로" 만 즉시이고, 그 위에 쌓인 테스트까지 되돌리는 건 아니다.

---

## 7. 못 잰 값

| 항목 | 왜 못 쟀나 |
|---|---|
| node 22.12+ 에서 F3(`vitest.config.ts` ERR_REQUIRE_ESM)이 재현되는지 | 로컬 node 는 v20.18.0 하나뿐. node 22.12+ 는 `require(esm)` 이 기본 활성이라 **재현되지 않을 수 있다**. Q45(서버 node 버전)가 미측정이라 서버 쪽 판정 불가 |
| 1a-1 실테스트(포트·파사드·grammy peerDep) 유입 후의 소요 | 그 코드가 아직 없다. 위 시간은 **테스트 2파일 3케이스** 기준 — 하한이다 |
| `grammy` peerDependency 가 `tsconfig.test.json`(`exclude: []`) 경로에서 TS2583 을 내는지 | grammy 미설치. base 는 `skipLibCheck: true` 를 상속하므로 1a-0 E6 의 M1 조건은 이어받는다는 것까지만 확인 |
| GitHub 원격(`git+https`) 소비자 설치 | 이번도 `git+file://` 다 — 1a-0 과 동일한 한계 |
| `@types/node@^20` vs `^26` 이 실제 API 표면에서 갈리는 지점 | 타입 차이 열거는 이번 범위 밖. 게이트 통과 여부(둘 다 0)만 쟀다 |
