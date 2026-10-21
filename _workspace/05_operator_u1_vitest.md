# 05 — operator: U1 vitest resolve 확인 · U2 zero-warning 게이트 정적 판단

**집행일:** 2026-09-04
**대상:** `pleiades/repos/myFitness` (worktree, `integration/pleiades`) · 비교군 `pleiades/repos/myFinance`
**범위:** 조회 전용. **대상 저장소 파일 변경 0.**
**환경:** node v20.18.0 / npm 10.8.2 / darwin 25.6.0

---

## 결론 한 줄

**1a-2 는 "조건부 성립"이다.** vitest 3종은 fit 에서 **peer dependency 충돌(`ERESOLVE`) 없이 resolve 된다.**
그러나 fit `package.json` 의 `overrides` 에 있는 **`"postcss": "$postcss"` 한 줄 때문에
`npm install` 명령 자체가 실패한다.** 이 한 줄을 리터럴 `"^8.5.10"` 으로 바꾸면 즉시 통과한다.

**막고 있는 것은 vitest 가 아니라 fit 의 npm overrides `$` 참조 문법이다.**

---

## 1. U1 — 실행한 명령과 출력

### 1-1. 지시받은 명령 (대상 저장소, 1회)

플래그 2개(`--dry-run`, `--package-lock-only`)가 모두 있는 것을 실행 전 확인했다.

```bash
cd ~/workspace/pleiades/repos/myFitness
npm install --dry-run --package-lock-only \
  'vitest@^4.1.8' '@vitest/coverage-v8@^4.1.8' 'vite-tsconfig-paths@^6.1.1'
```

출력:

```
npm error Unable to resolve reference $postcss
npm error A complete log of this run can be found in: ~/.npm/_logs/2026-09-04T04_06_02_507Z-debug-0.log
EXIT=1
```

**`ERESOLVE` 가 아니다.** peer dependency 충돌 메시지가 아니라 npm overrides 참조 해석 실패다.

### 1-2. 대조군 — 기존 트리는 멀쩡하다

```bash
npm install --dry-run --package-lock-only        # 인자 없이
→ up to date in 297ms / 210 packages / EXIT=0
```

즉 **현재 fit 트리는 정상**이고, 실패는 **패키지를 추가할 때만** 발생한다.

### 1-3. 원인 분리 (scratchpad 사본에서 수행 — 대상 저장소 무관)

`package.json` + `package-lock.json` 을 scratchpad 로 복사해 변형별로 재현했다.

| 사본 | overrides 상태 | 추가 패키지 | 결과 |
|---|---|---|---|
| A | 원본 (`$postcss`, `$esbuild`) | 3종 | **실패** `Unable to resolve reference $postcss` |
| A | 원본 | `vitest` 만 | **실패** (동일) |
| A | 원본 | `@vitest/coverage-v8` 만 | **실패** (동일) |
| A | 원본 | `vite-tsconfig-paths` 만 | **성공** (212 packages) |
| A | 원본 | `is-odd` (무관 패키지) | **성공** (210 packages) |
| **D** | **`$postcss` 만 리터럴로** (`$esbuild` 유지) | 3종 | **성공** (223 packages) |
| E | `$esbuild` 만 리터럴로 (`$postcss` 유지) | 3종 | **실패** (동일) |
| B | 둘 다 리터럴로 | 3종 | **성공** (223 packages) |

**판정: 유일한 blocker 는 `"postcss": "$postcss"` 한 줄이다.** `$esbuild` 는 무관하다.

### 1-4. 왜 postcss 만 터지는가 (npm 디버그 로그 스택)

```
Error: Unable to resolve reference $postcss
    at get spec [as spec]        (@npmcli/arborist/lib/edge.js:202:15)
    at #nodeFromEdge             (build-ideal-tree.js:1036:46)
    at #loadPeerSet              (build-ideal-tree.js:1294:35)   ← peer set 확장 중
    at #nodeFromEdge             (build-ideal-tree.js:1079:29)
    at async #loadPeerSet        (build-ideal-tree.js:1294:11)
    at async #loadPeerSet        (build-ideal-tree.js:1305:23)
...
silly unfinished npm timer idealTree:node_modules/vitest        ← vitest 서브트리에서 중단
```

- `vitest` → `vite` → `postcss` 경로가 생기면서 npm 이 `postcss` override 를 평가해야 하는 상황이 된다.
- 그 평가가 **peer set 확장(`#loadPeerSet`) 경로**에서 일어나는데, 이 경로에서는 npm 이 `$name` 참조를
  해석하지 못한다 (arborist `edge.js` 의 `spec` getter 가 throw).
- `is-odd`·`vite-tsconfig-paths` 는 postcss 를 트리에 끌어들이지 않으므로 override 가 평가되지 않아 통과한다.

즉 **fit 의 `$postcss` 는 원래부터 깨져 있었고, postcss 를 새로 끌어들이는 패키지를 추가하는 순간에만 드러난다.**
vitest 는 그 조건을 처음 만족시킨 패키지일 뿐이다.

### 1-5. resolve 되는 실제 버전 (scratchpad 사본 B 에서 lock 생성 후 판독)

| 패키지 | 현재 fit | 추가 후 | 비고 |
|---|---|---|---|
| `vitest` | (없음) | **4.1.11** | `^4.1.8` 충족 |
| `@vitest/coverage-v8` | (없음) | **4.1.11** | vitest 와 동일 버전 |
| `vite-tsconfig-paths` | (없음) | **6.1.1** | |
| `vite` | (없음) | **6.4.3** | fin 과 **동일 버전** |
| `postcss` | 8.5.25 | **8.5.25 (무변경)** | override 유지, 중복 사본 없음 |
| `esbuild` | 0.28.1 | **0.28.1 (무변경)** | override 유지 |
| lock 엔트리 수 | 716 | **785** (+69) | |

**`ERESOLVE` 0건. peer dependency 충돌 0건.**

### 1-6. fin / fit 트리 차이가 실제로 문제를 일으켰는가 — **아니오**

003 §9 가 지목한 차이(eslint 8 vs 9 / eslint-config-next 15 vs 16 / prisma 6.19.2 vs 6.19.3)는
**이번 resolve 에 전혀 관여하지 않았다.** vitest 는 eslint·prisma 와 의존 관계가 없다.
실제 blocker 는 003 이 예상하지 못한 **fit 의 `overrides` `$` 참조 문법**이었다.

> 003 §9 의 U1 가설("fin 에서 되는 것이 fit 에서 된다는 보장이 없다")은 **결론적으로 옳았으나 이유가 달랐다.**

### 1-7. 부수 발견 — esbuild override 가 vite 를 선언 범위 밖으로 민다 (fin/fit 비대칭)

`vite@6.4.3` 의 선언: `esbuild: "^0.25.0"`, `postcss: "^8.5.3"`

| | vite 가 쓰게 되는 esbuild | 방식 |
|---|---|---|
| **myFinance (현재 실동작)** | `vite/node_modules/esbuild@0.25.12` | 중첩 설치. vite 선언 범위 **안** |
| **myFitness (추가 시 예상)** | `esbuild@0.28.1` (top-level, 중첩 사본 없음) | fit 의 `"esbuild": "$esbuild"` override 가 강제 |

fit 은 override 때문에 **vite 가 선언하지 않은 esbuild 0.28.1 위에서 돌게 된다.**
npm overrides 는 설계상 범위 검사를 우회하므로 **resolve 는 통과하지만**, vitest 가 런타임에
정상 동작하는지는 **미확인** — 확인하려면 실제 설치 후 `npx vitest run` 이 필요하고, 이번 범위 밖이다.

---

## 2. U1 판정

**조건부 성립.**

- 성립하는 부분: vitest 4.1.11 / coverage-v8 4.1.11 / vite-tsconfig-paths 6.1.1 이
  fit 트리에서 **peer 충돌 없이 resolve 된다.** fin 과 같은 vite 6.4.3 으로 수렴한다.
- 조건: fit `package.json` `overrides` 의 **`"postcss": "$postcss"` → `"^8.5.10"`** 1줄 수정.

### 필요한 수정 (승인 대상 — 아직 하지 않았다)

```diff
   "overrides": {
     ...
-    "postcss": "$postcss",
+    "postcss": "^8.5.10",
```

**의미는 동일하다.** npm 의 `$postcss` 는 "루트 package.json 의 postcss 의존성 spec 을 그대로 쓰라"는 뜻이고,
fit 의 `devDependencies.postcss` 가 정확히 `^8.5.10` 이다. 리터럴로 바꿔도 **해석 결과가 바뀌지 않는다**
(대조군 D 에서 lock 결과가 동일함을 실증: 양쪽 모두 postcss 8.5.25 로 수렴).

- 되돌리기 등급: **즉시** (1줄 되돌림)
- 서비스 영향: **없음** — 빌드 산출물의 postcss 버전이 8.5.25 로 동일
- 다만 **1a-2 의 승인 범위에 없던 파일 변경**이므로 별도 승인이 필요하다.

### 대안 (수정 없이 가려면)

`npm install --legacy-peer-deps` 는 이 오류를 피하지 못한다(override 해석 단계가 별개).
`$` 참조를 유지한 채 회피하는 방법은 확인하지 못했다 → **미확인**.

---

## 3. U2 — zero-warning 게이트 (정적 판단만, 테스트 파일 미작성)

### 3-1. 읽은 설정 원문

`repos/myFitness/eslint.config.mjs` (127 bytes, 전문):

```js
import nextConfig from "eslint-config-next";

export default [
  ...nextConfig,
  {
    ignores: ["src/generated/**"],
  },
];
```

`repos/myFinance/.eslintrc.json` (전문):

```json
{ "extends": ["next/core-web-vitals", "next/typescript"] }
```

### 3-2. 비대칭 표

| 항목 | myFinance | myFitness | 비대칭? |
|---|---|---|---|
| eslint 설정 형식 | `.eslintrc.json` (eslintrc) | `eslint.config.mjs` (flat config) | **예** |
| eslint | ^8 | ^9.39.4 | **예** |
| eslint-config-next | ^15.5.16 | ^16.2.6 | **예** |
| next | ^15.5.16 | ^16.2.6 | **예** |
| `lint` 스크립트 | `next lint` | `eslint src/ --max-warnings 0` | **예** |
| `--max-warnings 0` 게이트 | **없음** | **있음** | **예** |
| lint 대상 경로 | `next lint` 기본 디렉터리 | **`src/` 로 한정** | **예** |
| `ignores` 에 `__tests__`/`*.test.ts` | 없음 | **없음** (003 §9 기록대로 `src/generated/**` 뿐) | 아니오 |
| `typecheck` 스크립트 | **없음** | `tsc --noEmit` | **예** |
| `tsconfig.include` | `["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts"]` | 동일 + `.next/dev/types/**/*.ts` | 사실상 동일 |
| `tsconfig.jsx` | `preserve` | `react-jsx` | **예** |
| 테스트 프레임워크 | vitest (`test:run`) | **없음** | **예** |
| 기존 테스트 파일 | **44개+** (`src/**/__tests__/`) | **0개** | **예** |
| next.config 의 lint/ts 우회 | 없음 | 없음 | 아니오 |

### 3-3. 정적 판단

1. **`ignores` 확인 — 003 §9 기록이 맞다.** fit `eslint.config.mjs` 의 `ignores` 는 `src/generated/**` 뿐이고,
   `__tests__` 도 `*.test.ts` 도 없다. **테스트 파일은 lint 검사 대상이 된다.**

2. **다만 003 §9 에 없던 한정 조건이 있다 — lint 범위는 `src/` 뿐이다.**
   fit 의 `lint` 는 `eslint src/ --max-warnings 0` 이라 **`src/` 밖은 아예 검사하지 않는다.**
   fin 의 기존 테스트가 `src/**/__tests__/**/*.test.ts` 에 있으므로(vitest.config.mts `include` 도 동일),
   fit 이 같은 컨벤션을 따르면 **`src/` 안 → zero-warning 게이트에 그대로 걸린다.**
   `__tests__` 를 리포지토리 루트에 두면 게이트를 피하지만, **fin 과 경로 컨벤션이 어긋난다.**

3. **`--max-warnings 0` 은 fit 에만 있다.** fin 의 `next lint` 에는 없다.
   같은 테스트 코드가 **fit 에서만 warning 하나로 실패**할 수 있다. 대칭 변경의 완료 판정 기준이 저장소별로 다르다.

4. **`tsc --noEmit` 대상 여부 — 003 §9 를 한 군데 정정한다.**
   003 §9 는 "myFitness 에만 `typecheck` 가 있고 `tsconfig.include` 가 `**/*.ts` 다"라고 적었는데,
   `include` 에 `**/*.ts` 가 있는 것은 **fin 도 마찬가지다.** 비대칭의 원인은 include 가 아니라
   **`typecheck` 스크립트의 유무**다. 결론(새 테스트 파일이 fit 에서만 `tsc --noEmit` 검사 대상)은 유효하다.
   덧붙여 fin 은 `next build` 가 타입 검사를 수행하므로(`ignoreBuildErrors` 없음) **빌드 단계에서는 fin 도 걸린다.**

5. **실제 warning/error 가 나는지는 미확인.** 테스트 파일을 쓰지 않았으므로 `npm run lint` 를 돌리지 않았다.
   eslint 9 + eslint-config-next 16 이 vitest 전역(`describe`/`it`/`expect`)을 `no-undef` 로 잡는지,
   `@typescript-eslint` 규칙이 테스트 관용구에 걸리는지는 **실행해야만 알 수 있다.**

### 3-4. U2 판정

**미해결로 유지.** 게이트가 **존재하고 테스트 파일에 적용된다는 것**은 정적으로 확정했으나
(단, `src/` 안에 둘 때만), **통과 여부**는 테스트 파일 작성 후 `npm run lint` 1회가 필요하다.
이는 1a-2 집행 중에 확인할 항목이지 착수 전 선결 조건은 아니다.

---

## 4. 파일 무변경 검증 — **통과**

| 검증 | 결과 |
|---|---|
| `repos/myFitness` `git status --porcelain` | **빈 출력 (clean)** |
| `repos/myFitness` 브랜치 | `integration/pleiades` (변경 없음) |
| `package.json` md5 | `6d60a19…dfc` = 실행 전 baseline **동일** |
| `package-lock.json` md5 | `4b9ee3b…318` = 실행 전 baseline **동일** |
| `repos/myFinance` `git status --porcelain` | **빈 출력 (clean)** / `integration/pleiades` |
| 원본 `~/workspace/myFitness` | 브랜치 `main` — **접근·변경 없음** |
| 원본 `~/workspace/myFinance` | 브랜치 `dev` — **접근·변경 없음** |

- 대상 저장소에서 실행한 npm 명령은 **2건뿐**이고 둘 다 `--dry-run --package-lock-only` 였다
  (지시받은 1건 + 대조군 1건).
- 원인 분리(A/B/C/D/E)와 lock 생성은 **전부 scratchpad 사본**에서 했다.
  scratchpad 경로: `…/scratchpad/{A,B,C,D,E}` + `backup/` (실행 전 원본 사본 보관).
- `npm install`(dry-run 없이)·`npm ci`·`npx vitest` — **대상 저장소에서 실행하지 않았다.**

---

## 5. 롤백

**롤백 대상 없음.** 대상 저장소 파일이 변경되지 않았다.
부수 효과는 `~/.npm/_logs/` 의 디버그 로그와 npm 메타데이터 캐시뿐이며 저장소·서비스와 무관하다.
빌드·`pm2 restart`·세션 초기화 **전부 불필요**. 서비스 영향 **없음**.

---

## 6. 1a-2 착수 전 사용자 결정이 필요한 것

1. **`overrides.postcss` 1줄 수정 승인** — 이것 없이는 1a-2 가 첫 명령에서 멈춘다.
   1a-2 의 승인 범위에 없던 파일이므로 범위 확대에 해당한다.
2. **테스트 파일 경로** — `src/**/__tests__/` (fin 과 대칭, fit zero-warning 게이트 적용) vs
   루트 `__tests__/` (게이트 회피, 컨벤션 어긋남). **전자를 권한다.**
3. **`--save-dev` 사용** — 이번 dry-run 은 지시받은 대로 플래그 없이 실행해서 npm 이
   세 패키지를 `dependencies` 에 넣으려 했다. fin 은 `devDependencies` 에 있으므로
   실제 집행 시 `--save-dev` 가 필요하다.

## 7. 미확인으로 남긴 것

- fit 에서 vitest 가 **런타임에 실제로 도는지** — `esbuild` override(0.28.1, vite 선언 `^0.25.0` 밖) 때문.
  설치 후 `npx vitest run` 필요.
- fit 테스트 파일이 **`eslint src/ --max-warnings 0` 을 통과하는지** (U2 본체).
- `$postcss` 를 **유지한 채** 회피하는 방법이 있는지.
