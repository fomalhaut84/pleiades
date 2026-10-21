# 03_auditor_1a0 — 감사 1회차 (2026-09-08)

> 대상: `_workspace/1a-0/02_writer_1a0.md` (초안 1회차) · 이슈 `fomalhaut84/pleiades#31`
> 규율: `reversibility-audit` · `workflow.md` 4절. **읽기 전용** — 두 대상 저장소에 쓰기·설치·빌드 0건.
> 실행 장소: `$AUD = /private/tmp/claude-501/-Users-sagan-workspace-pleiades/d1f70559-c2f7-4d4a-b5e2-13a0bf58b65a/scratchpad/audit`
> 코드 인용은 전부 **모드 I** — `git -C repos/<d> grep/show integration/pleiades:<path>` (체크아웃 무관).
> 환경: node v20.18.0 · npm 10.8.2 · typescript 5.9.3 · git 2.50.1 · darwin 25.6.0.

## 판정 요약

| # | 주장 (초안 §6 번호) | 판정 | 근거 한 줄 |
|---|---|---|---|
| **①** | 케이스 B(루트 = `@pleiades/notify`)가 **유일** 해법 | **정정** | 대안 **3개가 실제로 설치·`require`·`tsc` 통과**했다 — `git subtree split` 배포 브랜치 · 타르볼 URL · **루트 이름을 `pleiades` 로 둔 위임형**(설치 경로는 *소비자 의존성 키*가 정한다) |
| **②** | `private:true` + `prepare` 조합 | **확인** | 실행: `prepare` 정상 실행 · `dist` 설치 · `require` 성공. **R-3 재측정 불필요** |
| **③** | `prepare` **S-2** 권고 | **확인(수치 보강)** | 실측 `npm ci` **S-2 1.99~2.15 s / 캐시 19 MB** vs **S-1 3.14 s / 19 MB**, 서브에 vitest 를 넣은 S-1 은 **9.24 s / 캐시 140 MB**. 경계 논거가 수치로 성립 |
| **④** | dist 미커밋(D-a) · 절약 "3.9~4.5 s" | **정정** | 대조군이 틀렸다. 올바른 대조군(**git dep + dist 커밋 + `prepare` 없음**)은 **0.43~0.45 s** — 절약은 **약 1.6 s**(S-2 기준)이다. 0.19 s 는 *git dep 자체가 없는* 소비자였다. **결론(D-a)은 유지** |
| **⑤** | `git+https://` 권고 근거 = 표기 일관성 | **정정** | `npm install "git+https://…"` 는 `package.json` 문자열을 **`github:` 단축형으로 정규화**한다(실측). 표기 일관성은 **손으로 적었을 때만** 유지된다. 세 형태 모두 `integrity` **없음** |
| **⑥** | lint "해당 없음" 이 8절과 충돌하지 않는가 | **확인** | 사유를 적은 "미해당"은 건너뛰기가 아니다. 그리고 린터 devDeps 회피 근거는 이제 **실측**이다(루트 devDeps 는 소비자 설치 경로에서 실제로 설치된다 = **R-2 해소**). 단 같은 표의 `test`·`build` 칸은 **F1·F2 로 정정** |
| **⑦** | [A] M1-2 합계 10 은 오기, 열거 9 가 맞다 | **정정** | 둘 다 맞다 — **기준이 다르다.** 파일-로컬 grep(= M1-1 명령) 기준 쓰기 0건 모듈은 **정확히 10**이고, 그 10 은 "전송 도달 10"과 **동일 집합**이다(우연 아님). 고칠 것은 숫자가 아니라 **기준 표기** |
| **⑧** | α 배제 (폴백도 L3 를 탄다는 반론) | **확인(근거 교체)** | 폴백은 **같은 `sendToAll` 을 탄다**(`scheduler.ts` catch). 그러나 `send.ts:9 MAX_MSG=4096`·`:34 truncate()`·`:57~60 HTML parse 실패 → plain 전환` 세 분기를 **폴백 문구로는 밟지 못한다** — 그것이 003 Q10 의 대상이다 |
| **⑨** | β2(빈 스키마)로 fit 리포트 본문이 나온다 | **미확인** | 본문은 `askAdvisor` → **Claude CLI spawn + MCP HTTP 상주(4301)** 산물이라 로컬 측정 불가. 그리고 β2 는 **`GARMIN_*`·`CLAUDE_BIN`·MCP 상주**가 조건표에 없다 → **F3** |
| **⑩** | E6 = self-review | **정정** | F1 이 실증한다 — 이 PR 산출물이 **두 실서비스의 `npm ci` 를 깨뜨릴 수 있다.** "두 저장소 동시 파급" 행에 걸린다 |

**추가 발견 (초안이 꼽지 않은 것)**

| # | 발견 | 판정 |
|---|---|---|
| **F1** | **권고 스캐폴딩 조합이 소비자 `npm install` 을 깨뜨린다** — S-2 + vitest 서브 + `packages/notify/src/*.test.ts` 커밋 | **정정 (최우선)** |
| **F2** | `npm test` = `vitest run`(루트)이 vitest 서브 배치와 모순 — `sh: vitest: command not found` | **정정** |
| **F3** | 3-2 조건표에 fit 본문 검증 선결(`GARMIN_EMAIL/PASSWORD`·`CLAUDE_BIN`·MCP 상주) 누락 | **정정** |
| **F4** | **웹 전용 아웃바운드 트리거가 fin retry 외에 더 있다** — `POST /api/deposits:126` → `checkGiftTaxLimit` → `sendHtml` | **정정** |
| **F5** | 루트 `package.json` 신설이 `repos/*`·하네스를 오염시키지 않는다 | **확인** |
| **F6** | Q46 *"토큰 없으면 검증 자체 불가"* 는 과장 | **정정(경미)** |
| **F7** | E3 파일 목록에 `package-lock.json` 누락 | **정정(경미)** |

**정정 10건 (①④⑤⑦⑩ + F1·F2·F3·F4 + F6·F7 = 11 항목 중 문서 정정을 요하는 것 10) · 확인 5 · 미확인 1.**

---

# 1. ① 케이스 B 는 유일 해법이 아니다 — **정정**

초안 1-1 제약 1: *"루트 `package.json` 의 `name` 이 곧 설치 이름이다 → 루트 이름은 `@pleiades/notify` 여야 한다(= 케이스 B)"*.
**세 대안을 실제로 만들어 돌렸고 셋 다 성립한다.**

## 1-1. ALT-a — `git subtree split` 배포 브랜치 (루트는 003 §2-1 모노레포 형태 유지)

```bash
# 저장소 루트: name "pleiades" + private + workspaces:["packages/*"]  (= 003 §2-1 형태 그대로)
git -C $AUD/repo-MONO subtree split --prefix=packages/notify -b release/notify
git -C $AUD/repo-MONO tag notify-v0.0.1 release/notify
git -C $AUD/repo-MONO ls-tree --name-only release/notify
#   package.json / src / tsconfig.json        ← 분할 브랜치의 루트가 곧 패키지
cd $AUD/consumer-ALTa && npm install   # dep: "@pleiades/notify": "git+file://$AUD/repo-MONO#notify-v0.0.1"
```
```
> @pleiades/notify@0.0.1 prepare
> tsc -p .
added 1 package, and audited 2 packages in 3s        real 3.24
node_modules/@pleiades/notify/dist/index.d.ts · index.js
VERSION= 0.0.0
```
설치본 24 KB. **루트 `package.json` 을 건드리지 않는다** — 즉 초안 2부 **C4 의 "루트 재작성" 요구가 사라진다.**
비용: 릴리즈마다 `subtree split` 1회(스크립트화 가능) · `files` 가 없어 `src`·`tsconfig` 도 실린다.

## 1-2. ALT-b — 타르볼 URL (GitHub Release 자산 자리)

```bash
npm pack --pack-destination $AUD/dist-serve        # pleiades-notify-0.0.1.tgz (522 B)
python3 -m http.server 8917                        # GitHub Release 자산 URL 의 국소 대역
cd $AUD/consumer-ALTb && npm install                # dep: "http://127.0.0.1:8917/pleiades-notify-0.0.1.tgz"
```
```
added 1 package, and audited 2 packages in 374ms     real 0.45
"resolved":  "http://127.0.0.1:8917/pleiades-notify-0.0.1.tgz",
"integrity": "sha512-y6prHS4KT07rIKtZe98qlqF8vo+pkq+n0EOfPkqHHtjimo2EVV7W8RU73kcUEI60KjMMz6HmjM7L/wJrYMYL8A=="
npm ci → added 1 package in 376ms                    real 0.44
```
**git 의존성에는 없는 것이 둘 있다: (i) `integrity` 해시, (ii) 배포 서버의 `prepare` 부담 0.**
`npm ci` 0.44 s = git dep(S-2 2.0 s)의 **1/5**. 제약: 태그마다 자산을 올려야 하고, **github.com 릴리즈 자산 URL 자체는 미측정**(로컬 http 로 대역).

## 1-3. ALT-d — 루트 이름을 `pleiades` 로 둔 **위임형** (제약 1 의 직접 반증)

```bash
# 루트: name "pleiades" · private · workspaces:["packages/*"]  +  main/types/exports/files/prepare 가 packages/notify/dist 를 가리킴
# 소비자 package.json 의 의존성 '키' 를 @pleiades/notify 로 적는다
cd $AUD/consumer-ALTd && npm install
```
```
> pleiades@0.0.0 prepare
> tsc -p packages/notify
added 1 package … real 3.22
node_modules/@pleiades/notify/packages/notify/dist/…        ← 키가 설치 경로를 정한다
VERSION= 0.0.0
npm ci → added 1 package in 2s (real 1.94) · require after ci: 0.0.0
tsc --noEmit (fin·fit 옵션 사본) exit=0
  Module name '@pleiades/notify' was successfully resolved to
  '…/node_modules/@pleiades/notify/packages/notify/dist/index.d.ts' with Package ID 'pleiades/…@0.0.0'
```
lockfile 은 `"name": "pleiades"` 를 병기하고 `npm ci` 도 정상이다.
**따라서 "루트 `name` 이 곧 설치 이름"은 거짓이다** — 설치 경로를 정하는 것은 **소비자 `dependencies` 의 키**다.
([B] M1 (2') 가 그렇게 읽힌 것은 위치 인자 `npm install <spec>` 을 썼기 때문이다. 그 경로에서는 npm 이 패키지 자신의 `name` 을 키로 쓴다.)

**정정 문안 (1-1 제약 1 · 2부 C4 · C5):**
> *"**루트 `package.json` 이 패키지여야 한다**는 것만이 npm 10.8.2 의 제약이다(클론 루트만 읽는다). **`name` 이 `@pleiades/notify` 일 필요는 없다** — 설치 경로는 소비자 `dependencies` 의 키가 정한다(2026-09-08 실측 ALT-d). 그리고 루트를 패키지로 만들지 않는 길이 둘 더 있다: **`git subtree split` 배포 브랜치**(ALT-a, 루트 무변경)와 **릴리즈 타르볼 URL**(ALT-b, `integrity` 획득 · 소비자 `npm ci` 0.44 s). 케이스 B 는 **선택지 중 하나**이지 유일 해법이 아니다."*
> C4 의 *"단계 4 에서 루트를 재작성해야 한다"* 는 **ALT-a·ALT-d 를 택하면 발생하지 않는다** — 형태 선택 전에는 그 정정을 003 에 넣지 않는다.

---

# 2. ② `private:true` + `prepare` — **확인** (R-3 해소)

```bash
# $AUD/repo-P = S-2 형태 + "private": true
cd $AUD/consumer-P && npm install --foreground-scripts
```
```
> @pleiades/notify@0.0.1 prepare
> tsc -p packages/notify
added 1 package, and audited 2 packages in 3s
node_modules/@pleiades/notify/packages/notify/dist/index.js · index.d.ts
VERSION= 0.0.0
설치된 매니페스트: "private": true   (그대로 남는다 — 설치를 막지 않는다)
```
**초안 1-2 의 `private` 행과 4-1 의 R-3 은 확인됐다. 재측정 요청 R-3 은 삭제해도 된다.**

---

# 3. ③ S-1 vs S-2 — **확인(수치 보강)**

전부 **격리 캐시**(`--cache $AUD/cache-<n>`)로 쟀다.

| 형태 | 서브 devDeps | `npm install`(cold) | `npm ci`(warm ×3) | 캐시 | 소비자 `node_modules` |
|---|---|---|---|---|---|
| **S-1** (`npm --prefix … install && build`) | typescript **+ vitest** | **9.24 s** | — | **140 MB** | 20 K |
| **S-1b** (동일, typescript 만) | typescript | 3.69 s | **3.14 / 3.15 s** | 19 MB | 20 K |
| **S-2** (`tsc -p packages/notify`) | vitest (설치 안 됨) | 2.52 s | **1.99 / 2.01 / 2.15 s** (cold 2.55 s) | **19 MB** | 20 K |
| 대조 **D** (dist 커밋 · `prepare` 없음) | — | 0.56 s | **0.43 / 0.45 s** | 20 K | 20 K |

**두 가지가 확정됐다.**
1. **S-2 가 실제로 싸다** — 같은 조건에서 `npm ci` **1.99~2.15 s vs 3.14 s**. 초안의 *"S-2 미측정, 속도가 아니라 경계"* 는 이제 **속도로도 맞다.**
2. **경계 논거가 수치로 증명됐다** — 서브에 vitest 를 넣은 S-1 은 **9.24 s · 캐시 140 MB**(`vitest`·`vite`·`rollup`·`esbuild` 전 플랫폼 바이너리 등 100여 패키지). S-2 캐시에 들어온 registry 패키지는 **`typescript` 하나뿐**이다:
```bash
grep -rho '"key":"make-fetch-happen:request-cache:https://registry.npmjs.org/[^"/]*"' $AUD/cache-S2/_cacache/index-v5 | sort -u
# → typescript                      (S-1 은 @vitest/* @rollup/* @esbuild/* … 100여 개)
```
**부수: R-2 해소.** S-2 의 `prepare` 가 쓰는 `tsc` 는 **루트 devDeps 로만** 올 수 있고 실제로 typescript 가 격리 캐시에 적재됐다 → *"루트 devDeps 는 소비자 설치 때 임시 설치된다"* 는 **문서 근거가 아니라 실측**이다. 초안 1-2 경고 박스와 R-2 를 그렇게 고친다.
**소비자 `node_modules` 에 devDeps 가 남는가: 아니다** — 네 형태 모두 20 K, `dist` 뿐이다. 비용은 **서버의 설치 시간과 npm 캐시**에 남는다.

---

# 4. ④ dist 미커밋 — 결론 확인, **수치는 정정**

초안 1-5 D-b: *"배포마다 **약 3.9~4.5 s**(4.05~4.74 − 0.19) 절약"*.
**대조군이 틀렸다.** 0.19 s 는 *git 의존성이 아예 없는* 빈 소비자였다. dist 를 커밋해도 **git dep 클론·해석 비용은 남는다.**

```bash
# $AUD/repo-D : dist 커밋 · prepare 없음 · 나머지 동일
cd $AUD/consumer-D && npm ci --cache $AUD/cache-D
# added 1 package, and audited 2 packages in 390ms   real 0.45  (2회차 0.43)
node -e "require('@pleiades/notify').VERSION"  # 0.0.0
```

| 비교 | 초안 | 실측 |
|---|---|---|
| D-b 가 절약하는 값 | 3.9~4.5 s | **약 1.6 s** (S-2 2.0 s − D 0.43 s) · S-1 형태였다면 약 2.7 s |
| 근거가 된 하한 | 0.19 s (git dep 없음) | **0.43 s** (git dep + dist 커밋) |

**정정 문안 (1-5 D-b · 결정 근거 ① · 2부 C9):**
> *"dist 커밋이 절약하는 값은 **배포당 약 1.6 초**다(S-2 실측 `npm ci` 2.0 s → dist 커밋 0.43 s, 2026-09-08). 이전 값 3.9~4.5 s 는 **git 의존성이 없는 소비자**를 대조군으로 뺀 것이라 과대했다. 절약이 더 작아졌으므로 **D-a(미커밋) 결론은 그대로 유지되고 오히려 강해진다.**"*
> C9 의 *"`npm ci` 4.05~4.74 s"* 도 **S-1 형태의 값**이다. 초안이 권고한 S-2 형태의 값은 **1.99~2.55 s** — 채택한 형태의 숫자로 바꾼다.

---

# 5. ⑤ `git+https://` 권고 — **정정**

## 5-1. lockfile 은 세 형태 모두 동일 ([B] M2 재현 성공)

```bash
for spec in "github:isaacs/inherits#v2.0.4" "git+https://github.com/isaacs/inherits.git#v2.0.4" \
            "git+ssh://git@github.com/isaacs/inherits.git#v2.0.4"; do npm install "$spec"; done
```
```
spec: github:isaacs/inherits#v2.0.4
  package.json dep : {'inherits': 'github:isaacs/inherits#v2.0.4'}
  resolved         : git+ssh://git@github.com/isaacs/inherits.git#9a2c2940…
  integrity        : (none)
spec: git+https://github.com/isaacs/inherits.git#v2.0.4
  package.json dep : {'inherits': 'github:isaacs/inherits#v2.0.4'}      ←★
  resolved         : git+ssh://git@github.com/isaacs/inherits.git#9a2c2940…
  integrity        : (none)
spec: git+ssh://git@github.com/…
  package.json dep : {'inherits': 'github:isaacs/inherits#v2.0.4'}      ←★
  resolved         : git+ssh://git@github.com/isaacs/inherits.git#9a2c2940…
  integrity        : (none)
```

## 5-2. ★ 초안이 놓친 것 — `npm install` 은 **`package.json` 문자열까지 정규화한다**

세 형태 중 무엇을 CLI 에 쳐도 `package.json` 에는 **`github:` 단축형**이 적힌다.
초안 1-6 의 권고 근거 ①(*"`package.json` 에 적히는 문자열이 실제 전송과 일치한다"*)은 **일반적인 설치 명령 경로에서 성립하지 않는다.**
손으로 적으면 살아남는다:

```bash
# package.json 을 직접 편집한 뒤 npm install / npm ci
after npm install : {'inherits': 'git+https://github.com/isaacs/inherits.git#v2.0.4'}   ← 유지
npm ci            : added 1 package in 532ms · package.json 불변
```

**정정 문안 (1-6 · 2부 C1 · C10):**
> *"`git+https://…` 표기는 **`package.json` 을 직접 편집했을 때만** 유지된다. `npm install "git+https://…"` 로 추가하면 npm 10.8.2 가 **`github:` 단축형으로 정규화**한다(2026-09-08 실측). 따라서 이 권고는 **표기 규약 + 편집 방법**이 함께여야 성립하고, 1a-3 절차에 *'의존성은 `package.json` 직접 편집으로 추가하고, 설치 후 문자열이 `github:` 로 바뀌지 않았는지 확인한다'* 를 넣는다. 세 형태 모두 lockfile `resolved` 는 `git+ssh://` 이고 **`integrity` 는 없다**(git 의존성 공통) — 무결성 해시는 **타르볼 배포에만** 붙는다(ALT-b: `sha512-…`)."*

---

# 6. ⑥ lint "해당 없음" — **확인** (단 같은 표의 다른 칸은 정정)

- `workflow.md` 8절의 금지 대상은 **"통과하지 않은 채 넘어가는 것"**이다. 도입하지 않은 도구를 **사유와 함께 "미해당"으로 명시**하는 것은 건너뛰기가 아니다. `repos/myFinance` 행이 `typecheck` 를 `npx tsc --noEmit` 으로 **대체 표기**한 전례와 같은 형식이다.
- 초안의 회피 근거(*"린터 devDeps 가 소비자 설치 경로에 닿을 수 있다"*)는 §3 의 R-2 실측으로 **근거가 격상**됐다 — 루트 devDeps 는 실제로 소비자 설치 시 임시 설치된다.
- `tsc --noEmit` 을 **lint 칸에 넣지 않은 것도 맞다.** 타입 칸과 같은 명령을 두 칸에 적으면 게이트가 하나인데 둘로 보인다.
- **다만 그 표의 `typecheck`·`test`·`build` 칸은 그대로 쓸 수 없다** → F1·F2.
  - 확인된 것: `tsc --noEmit -p packages/notify` 는 `declaration:true` 와 **공존한다**(TS 5.9.3, exit 0). 이 칸 자체는 유효하다.

---

# 7. ⑦ [A] M1-2 의 10 vs 9 — **정정 (초안의 진단이 틀렸다)**

초안 3-1 주의 박스: *"합계표는 10, 열거는 9 → 열거를 셌다. [A] 의 합계표는 정정 대상"*.
**[A] M1-1 이 실제로 돌린 명령(파일-로컬 grep)으로 다시 세면 10 이 맞다.**

```bash
cd repos/myFinance
git grep -l --text "sendHtml(" integration/pleiades -- 'src/**/*.ts' | cut -d: -f2- \
  | grep -v 'utils/telegram.ts' | grep -v '__tests__' | sort      # 15 모듈
while read -r f; do n=$(git show integration/pleiades:"$f" \
  | grep -cE 'prisma\.[A-Za-z]+\.(create|update|upsert|delete|updateMany|deleteMany|createMany)|\$executeRaw|\$transaction'); … done
```
```
  ZERO  alert-dispatcher.ts   ← 이 파일 안에는 prisma 쓰기가 없다 (쓰기는 alert-history.ts:67)
  ZERO  briefing / budget-alert / daily / monthly-report / monthly /
        quarterly-report / quarterly / rsu / advisor-monitor
  WRITE active-review(2) custom-strategy-alert(4) networth-snapshot(1) price-alert(1) ta-signal-alert(2)
쓰기 0건 모듈 = 10 / 15
```

- **합계 10** = *파일-로컬* 기준(M1-1 명령 그대로). **열거 9** = *호출 그래프* 기준(`alert-dispatcher` → `alert-history.ts:67` 을 그 모듈의 쓰기로 귀속).
- 그리고 **두 집합은 같다**: `{9개} + alert-dispatcher` = 파일-로컬 10 = **"전송 도달 10"**. 초안의 *"우연히 같은 숫자가 된다"* 는 틀렸다 — **같은 집합이라 같은 숫자**다.

**정정 문안 (3-1 주의 박스 · 4-1 R-1):**
> *"[A] M1-2 의 **합계 10 은 오기가 아니다.** 파일-로컬 기준(M1-1 명령)으로 쓰기 0건 모듈은 10 이고, 표의 열거 9 는 `alert-dispatcher` 의 쓰기를 **호출 대상 파일(`alert-history.ts:67`)까지 따라가 귀속**한 결과다. 두 값은 기준이 다를 뿐 **모순이 아니며, 두 집합은 동일**하다(그래서 '전송 도달 10' 과 숫자가 같다). 재측정 요청 R-1 은 **숫자 정정이 아니라 '기준 표기 추가'** 로 바꾼다 — 005 R1 이 요구하는 것은 열거의 출처이지 숫자 변경이 아니다."*

---

# 8. ⑧ α 배제 — **확인 (근거를 교체하면 더 강해진다)**

반론(*"폴백 문구도 L3 를 탄다"*)의 전반부는 **코드상 참**이다:

```ts
// repos/myFitness @ integration/pleiades : src/bot/notifications/scheduler.ts
const r = await sendToAll(bot, html);            // 정상 본문
…
} catch (error) {
  void notifyAdminIfKnownFailure(bot, error).catch(() => {});
  const friendly = formatUserFriendlyError(error);
  await sendToAll(bot, `❌ ${label} 생성 실패\n${friendly}`);   // 폴백도 같은 초크포인트
}
```

**그러나 초크포인트를 '태우는 것'과 '커버하는 것'은 다르다.** `send.ts` 124줄의 분기 중 폴백 문구가 밟지 못하는 것이 셋이다:

```ts
// repos/myFitness : src/bot/notifications/send.ts
:9   const MAX_MSG = 4096;
:34  function truncate(text){ return text.length > MAX_MSG ? text.slice(0, MAX_MSG-3)+"..." : text; }
:44  const plain = truncate(htmlText.replace(/<[^>]*>/g, ""));
:57  if (useHtml && isHtmlParseError(err)) { useHtml = false; attempt--; continue; }   // HTML→plain 전환
```
- 폴백 문구(`❌ … 생성 실패\n<friendly>`)는 **HTML 태그가 없고 4096 자에 한참 못 미친다** → `truncate()` 도, `isHtmlParseError` → plain 전환도 발동하지 않는다.
- 정상 본문은 `mdToHtml(report)` 산출물이라 **정확히 그 두 분기의 대상**이고, **003 Q10(fit 절단→분할 · plain 폴백 정본)이 다루는 것이 바로 그것**이다.

**정정 문안 (3-4 α 배제 행 — 근거 교체):**
> *"α 배제 근거를 '폴백은 L3 를 타지 않는다'가 아니라 **'폴백은 L3 의 위험 분기를 밟지 않는다'**로 적는다. 폴백 문구도 같은 `sendToAll` 을 타지만(`scheduler.ts` catch), `send.ts:9·34·44·57` 의 **4096 자 절단**과 **HTML parse 실패 → plain 재전송** 분기는 **긴 HTML 본문에서만** 발동한다. 그 두 분기가 곧 003 Q10 의 대상이므로, α 에서는 **1a 가 바꾸는 바로 그 동작을 fit 에서 검증할 수 없다.**"*

---

# 9. ⑨ β2 로 fit 본문이 나오는가 — **미확인** + 조건표 누락(F3)

본문 생성 경로는 DB 조회가 아니라 **외부 프로세스 산출물**이다.

```ts
// repos/myFitness : src/lib/daily-report.ts
:1   import { askAdvisor, resetSession } from "@/lib/ai/claude-advisor";
:52  await syncAll({ … dataTypes:["sleep","daily_stats","heart_rate","activities"] });
:99  const { result } = await askAdvisor(prompt, { channel, minTurns: 2 });
:103 if (!result || result.trim().length === 0) throw new Error(`askAdvisor returned empty response …`);
:109 await prisma.$transaction([ aIAdvice.deleteMany…, aIAdvice.create… ]);
```
```ts
// repos/myFitness : src/lib/ai/claude-advisor.ts
:7   const RUNTIME_CONFIG_DIR = path.resolve(process.cwd(), ".runtime");   // ← 런타임 생성 설정
:12  const MCP_TRANSPORT = process.env.MCP_TRANSPORT || "http";
:17  MCP_HTTP_URL = process.env.MCP_HTTP_URL || `http://127.0.0.1:${process.env.MCP_PORT || "4301"}/mcp`;
:28  const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
:108 function ensureMcpConfig() { … writeFileSync(RUNTIME_MCP_CONFIG, …) }   // 매 호출 재생성
:306 const child = spawn(CLAUDE_BIN, args, …)
// repos/myFitness : src/lib/garmin/client.ts:14-19  GARMIN_EMAIL / GARMIN_PASSWORD 없으면 throw
```

**판정 미확인 — 이유와 필요한 것:**
- 본문은 **Claude CLI 를 spawn 하고 MCP(기본 http, 4301)를 통해 DB 를 읽은 결과**다. 로컬에서 재현하려면 대상 저장소에 빌드·기동이 필요해 이 감사의 읽기 전용 규율 밖이다.
- 빈 DB 에서도 `askAdvisor` 가 **비지 않은 문자열**을 돌려주면 본문 전송에는 도달한다(`:103` 은 빈 응답만 막는다). 그러나 **본문 길이·HTML 구조가 실데이터와 다르므로 §8 의 절단·plain 분기 커버는 여전히 보장되지 않는다.**
- **`preSyncForReport` 는 예외를 삼키므로**(`daily-report.ts:59`) Garmin 자격이 없어도 진행한다. 반대로 **자격을 실서비스 값 그대로 넣으면 `syncAll` 이 β2 의 "빈" 사본 DB 에 실제 개인 건강 데이터를 채운다** — β2 의 *"실데이터 없이"* 전제가 깨지고 β1 과 같은 노출이 생긴다.

**정정 문안 (3-3 β2 열 · 3-2 조건 8·9·10 — F3):**
> *"**β2 선행 조건에 셋을 추가한다.** ① **`GARMIN_EMAIL`/`GARMIN_PASSWORD` 를 더미로 두거나 비운다** — 실값이면 `syncAll` 이 사본 DB 에 실데이터를 채워 β2 가 β1 이 된다(`garmin/client.ts:14`). ② **`CLAUDE_BIN` 과 Claude CLI 가 있어야 한다** — fit 본문은 `spawn(CLAUDE_BIN)` 산출물이다(`claude-advisor.ts:28·306`). ③ **fit MCP 앱이 상주해야 한다**(`MCP_TRANSPORT` 기본 `http` · `MCP_PORT` 4301) — 조건 9 는 *'MCP 도 띄울 때'* 라는 선택 항목이 아니라 **fit 본문 검증의 필수 조건**이다. 그리고 `ensureMcpConfig()` 가 **`process.cwd()/.runtime/mcp-config.json` 을 매 호출 재생성**하므로 병행 인스턴스는 **cwd 가 실서비스와 달라야 한다**(조건 4 와 같은 이유, 근거는 다르다). **빈 DB 로 정상 본문이 실제로 생성되는지는 여전히 미측정**이다."*
> 참고 — 조건 10 의 *"`npm run build` 선행"* 은 fit 에서 충분하다: `build` 가 `build:mcp:staged && build:mcp:activate && build:bot` 까지 돈다(fit `package.json` scripts 원문).

---

# 10. F1 — **권고 스캐폴딩이 소비자 `npm install` 을 깨뜨린다 (최우선 정정)**

초안이 각각 따로 결정한 셋을 **동시에** 적용하면 설치가 실패한다.
(1-3) `prepare` = **S-2** `tsc -p packages/notify` · (1-3) **vitest 는 `packages/notify` 서브** devDeps ·
(1-7) **vitest 스모크 테스트 1건을 1a-0 에 넣는다** (자연스러운 위치는 `packages/notify/src/index.test.ts`).

`tsconfig.json` 의 `include:["src/**/*.ts"]` 가 테스트 파일을 잡고, `prepare` 는 **루트 devDeps(typescript)만** 있는 임시 클론에서 돈다.

```bash
# $AUD/repo-S2T = 초안 권고 그대로 (S-2 + I-a + vitest 스모크 커밋)
cd $AUD/consumer-S2T && npm install --foreground-scripts
```
```
npm error > tsc -p packages/notify
npm error packages/notify/src/index.test.ts(1,38): error TS2307:
          Cannot find module 'vitest' or its corresponding type declarations.
npm error npm error code 2
npm error npm error command failed
npm error npm error command sh -c tsc -p packages/notify
--- node_modules created? ---
ls: node_modules: No such file or directory
```
**설치가 통째로 실패하고 `node_modules` 가 생기지 않는다.** 1a-3 에서 이 상태가 두 저장소에 들어가면
`deploy.sh` 의 `npm ci` 가 **두 실서비스 배포에서 동시에 깨진다**([B] M3 `deploy.sh` 인용).

**순진한 수리는 더 나쁘다 — vitest 를 루트 devDeps 로 올리면 (FIX-b):**
```
npm error node_modules/vite/dist/node/index.d.ts(1,23): error TS2688: Cannot find type definition file for 'node'.
npm error node_modules/@vitest/utils/dist/index.d.ts(49,26): error TS2304: Cannot find name 'setImmediate'.
npm error node_modules/rollup/dist/rollup.d.ts(1010,10): error TS2550: Property 'asyncDispose' does not exist …
  (동종 오류 50여 건) → npm error git dep preparation failed        real 7.82 · 캐시 135 MB
```
루트 devDeps 는 임시 클론에 설치되므로 `tsc` 가 **vitest 의 `.d.ts` 까지 검사**하고, `@types/node` 부재·`lib` 설정 때문에 실패한다. **비용도 3.9배(2.0 s → 7.8 s), 캐시 7배(19 MB → 135 MB)**로 늘어 S-2 의 경계 논거를 스스로 부순다.

**성립하는 형태 (실행 확인):**
```bash
# FIX-a : packages/notify/tsconfig.json 에 "exclude": ["**/*.test.ts"]
cd $AUD/consumer-FIXa && npm install --foreground-scripts
# > @pleiades/notify@0.0.1 prepare / > tsc -p packages/notify
# added 1 package … VERSION= 0.0.0 · dist/index.js + index.d.ts 설치됨
```
```bash
# FIX-c : FIX-a + 루트 test 스크립트를 서브로 위임 + 서브에 vitest 유지
npm --prefix packages/notify install     # added 43 packages … real 5.46  (로컬 개발 루프에서만)
npm test        # → npm --prefix packages/notify run test → vitest run
                #   Test Files 1 passed (1) · Tests 1 passed (1)     exit=0
npm run typecheck  # exit 0        npm run build  # exit 0
소비자 설치: added 1 package … real 2.30   (vitest 는 소비자 경로에 들어오지 않는다)
```

**정정 문안 (1-3 · 1-7 · 4-3 E3):**
> *"**`packages/notify/tsconfig.json` 에 `\"exclude\": [\"**/*.test.ts\"]` 를 반드시 넣는다.** 넣지 않으면 `prepare`(S-2)가 임시 클론에서 테스트 파일을 컴파일하다 **TS2307 로 실패하고 소비자 `npm install` 이 통째로 깨진다**(2026-09-08 실측). vitest 를 루트 devDeps 로 올리는 우회는 **vitest 자체의 `.d.ts` 를 컴파일하다 더 크게 실패**하며 설치 비용도 2.0 s → 7.8 s, 캐시 19 MB → 135 MB 로 늘어난다. 별도 `tsconfig.build.json` 도 같은 효과를 내지만, 파일 1개 규모에서는 `exclude` 한 줄이 싸다."*
> **되돌리기: 즉시(1줄)** — 다만 **누락됐을 때의 비용은 즉시가 아니다.** 1a-3 배포 시점에 두 실서비스의 `npm ci` 가 실패하고, 원인이 pleiades 저장소에 있어 **대상 저장소 롤백으로는 풀리지 않는다.**

# 11. F2 — `npm test` = `vitest run` 은 실행되지 않는다

```bash
# 초안 1-3(vitest 는 서브) + 1-7(npm test = vitest run) 조합, 루트에서
$ npm test
> @pleiades/notify@0.0.1 test
> vitest run
sh: vitest: command not found
$ ls node_modules/.bin/          # tsc  tsserver      ← vitest 없음
```
**정정 문안 (1-7 표 `테스트` 칸):**
> *"`npm test` = **`npm --prefix packages/notify run test`** (서브의 `test` 가 `vitest run`). vitest 를 서브 devDeps 에 두기로 한 1-3 의 결정과 루트 스크립트 `vitest run` 은 **양립하지 않는다** — 루트 `node_modules/.bin` 에 vitest 가 없다(실측). 위임 형태는 실행 확인됐다(Test Files 1 passed)."*

# 12. F3 — 3-2 조건표 누락 → §9 정정 문안 참조

`GARMIN_EMAIL`/`GARMIN_PASSWORD`(fit) 는 [A] M3-5 에 *"cron off 로 회피"* 로만 적혀 있으나,
**β2 에서는 `preSyncForReport` 가 리포트 생성 경로에서 `syncAll` 을 부르므로 cron 과 무관하게 발동**한다.
조건 8(필수 분리 env fit 6)에 **`GARMIN_*` 과 `CLAUDE_BIN`** 을 더해 **fit 8** 로 고친다. fin 은 `MCP_CONFIG_PATH`·`MYFINANCE_ROOT` 가 advisor 경로 env 다(측정 A 표에 있음, 조건 8 에는 없음) — **fin 7 → 9** 로 재산정할지는 MCP 를 띄우는지에 달렸다(Q23).

# 13. F4 — 웹 전용 아웃바운드 트리거가 하나 더 있다

초안 3-2 조건 1 근거와 ⚠ 부수 발견은 *"fin retry 엔드포인트"* **하나**만 든다. 전수하면 **둘 이상**이다.

```bash
git -C repos/myFinance grep -n --text -E "from ['\"](@/bot|@/lib/alerts|@/utils/telegram)" integration/pleiades -- 'src/app'
```
```
src/app/api/alerts/history/[id]/retry/route.ts:21  ← 초안이 든 경로
src/app/api/deposits/route.ts:5   import { checkGiftTaxLimit } from '@/bot/notifications/budget-alert'
```
```ts
// src/app/api/deposits/route.ts:126
checkGiftTaxLimit(accountId as string).catch((e) => …)
// src/bot/notifications/budget-alert.ts:94~   (M1-2 기준 '쓰기 0건' 모듈)
const chatIds = getAllowedChatIds(); if (chatIds.length === 0) return;
… const bot = getBot(); … for (const chatId of chatIds) { await sendHtml(bot, chatId, message) }
```
→ **`POST /api/deposits` 가 웹 프로세스에서 텔레그램 전송을 낸다.** (조건: 계좌주 19세 미만 + 증여 한도 사용률 ≥ 0.8)
그리고 세 번째 경로가 하나 더 있다 — `src/app/api/ai/ask/route.ts` → `claude-advisor.ts:687·703` → `advisor-monitor` → `:222 sendHtml`(연속 실패 시 관리자 alert, `TELEGRAM_ADMIN_CHAT_IDS`).

**fit 쪽은 초안이 맞다(웹 트리거 0):**
```bash
git -C repos/myFitness grep -n --text -E "send(ToAll|Message|Html)?\(" integration/pleiades -- 'src/app/api'
# → src/app/api/reports/stream/route.ts 의 SSE 로컬 함수 send() 9건뿐 — 텔레그램 아님
git -C repos/myFitness grep -n --text -E "from ['\"](@/lib/telegram|\.\./telegram|@/bot)" integration/pleiades -- 'src/app'
# → 0건
```
**정정 문안 (⚠ 부수 발견 3 · 3-2 조건 1 근거):**
> *"봇을 띄우지 않아도 **fin 웹 프로세스가 아웃바운드를 내는 경로는 최소 셋**이다 — `POST /api/alerts/history/[id]/retry`(`route.ts:21`), **`POST /api/deposits`(`route.ts:126` → `budget-alert.ts:94~`)**, `POST /api/ai/ask` → `advisor-monitor:222`(연속 실패 시 관리자 alert). fit 은 0 이다(웹 API 의 `send()` 는 SSE 로컬 함수). 따라서 텔레그램 격리(조건 1)는 **retry 엔드포인트를 안 누르는 것으로 대체되지 않는다.**"*

# 14. F5 — 루트 `package.json` 신설의 되돌리기 "즉시" — **확인**

*"그 파일이 생기는 순간 `repos/*` 가 상위 `package.json` 을 부모로 인식하는가"* → **아니다.**

```bash
# 현재 상태
$ cd repos/myFinance && npm prefix   → /Users/sagan/workspace/pleiades/repos/myFinance
$ cd repos/myFitness && npm prefix   → /Users/sagan/workspace/pleiades/repos/myFitness
$ cd ~/workspace/pleiades && npm prefix → /Users/sagan/workspace/pleiades   (package.json 없어 cwd 반환)

# 시뮬레이션: 상위에 케이스 B 루트 package.json 을 두고 하위에 대상 저장소 사본
$AUD/parent-sim/package.json                       (name @pleiades/notify · prepare · files · devDeps)
$AUD/parent-sim/repos/myFinance-sim/package.json   (자체 package.json 보유)
$ cd $AUD/parent-sim/repos/myFinance-sim
  npm prefix → …/repos/myFinance-sim         (상위로 올라가지 않는다)
  npm root   → …/repos/myFinance-sim/node_modules
  npm ls --depth=0 → myfinance-sim@1.0.0 … └── (empty)
  npm run build → built                       (스크립트 정상)
```
- npm 은 **가장 가까운 `package.json` 에서 멈춘다**. 두 worktree 는 자기 `package.json` 을 갖고 있어 영향이 없다.
- 케이스 B 루트에는 **`workspaces` 가 없으므로** 워크스페이스 멤버 탐색 자체가 일어나지 않는다.
  (**ALT-d 를 택해 루트에 `workspaces:["packages/*"]` 를 두더라도 `repos/` 는 `packages/*` 글롭 밖**이라 동일하다.)
- 하네스: `bin/claude-with`·`_workspace/harness/refgraph.sh`·`regress_pr20_p1.sh` 에 **`package.json` 유무에 의존하는 분기 0건**(`regress_pr20_p1.sh:16` 은 대상 저장소의 `package.json` 을 `git show` 로 읽을 뿐 pleiades 루트와 무관). `.claude/` 에 settings·hook 파일 없음.
- `node_modules/` 는 pleiades `.gitignore` 1행에 이미 있다(현재 5줄: `.DS_Store`·`node_modules/`·`*.log`·`_workspace_prev/`·`repos/` — 초안 1-4 의 "5줄" **확인**).

→ **초안 1-8 의 "전부 즉시 · pleiades 내부에 갇힘"은 유지된다.** 단 F1 이 그 예외다(누락 시 비용이 1a-3 으로 이연된다).

# 15. F6 — Q46 의 강도는 과장이다 (경미)

초안 Q46: *"발급하지 않으면 병행 인스턴스에서 **아웃바운드 검증 자체를 할 수 없다**(= 1a 의 성공 판정 불가)"*.

```bash
for d in myFinance myFitness; do git -C repos/$d grep -oh --text -E 'process\.env\.TELEGRAM_[A-Z_]+' integration/pleiades -- src scripts ecosystem.config.js | sort -u; done
# fin: TELEGRAM_ADMIN_CHAT_IDS TELEGRAM_ALLOWED_CHAT_IDS TELEGRAM_BOT_TOKEN
# fit: TELEGRAM_ALLOWED_CHAT_IDS TELEGRAM_BOT_TOKEN            ← [A] M3-5 와 일치 (키 목록 확인)
# 하드코딩 chat id: 양쪽 0건
```
수신자는 **전부 `TELEGRAM_ALLOWED_CHAT_IDS`(fin 은 admin 경로에 `TELEGRAM_ADMIN_CHAT_IDS`)에서만** 온다
(`send.ts:23 getChatIds()` · fin `retry/route.ts:getAllowedChatIds()` · `budget-alert.ts:95`).
- 실서비스 토큰 + **검증용 chat id** 조합이면 메시지는 **검증 chat 으로만** 간다.
- 미설정이면 `chatIds.length === 0` → **전송 자체가 없다**(fail-safe). fin retry 는 500 을 돌려준다.
- 즉 **별도 토큰은 방어층(.env 통째 복사 실수 대비)이지 검증의 전제 조건이 아니다.**

**정정 문안 (Q46 · 조건 1):**
> *"Q46 의 우선도는 유지하되 문구를 고친다 — **검증 전송의 수신자는 `TELEGRAM_ALLOWED_CHAT_IDS`(fin 은 `TELEGRAM_ADMIN_CHAT_IDS` 포함)만으로 격리된다**(하드코딩 chat id 0건, 실측). 별도 봇 토큰은 **실서비스 `.env` 를 통째로 복사했을 때의 사고를 막는 두 번째 층**이다. 토큰이 없어도 아웃바운드 검증은 가능하다. 다만 '이미 나간 메시지는 되돌릴 수 없다'는 성질은 그대로이므로 **조건 1 의 최우선 지위는 유지**한다."*

# 16. F7 — E3 파일 목록에 `package-lock.json` (경미)

E3 는 *"파일 5개"* 를 든다(루트 `package.json`·서브 3개·`.gitignore`). E5 에서 `npm install` 을 돌리는 순간 **`package-lock.json` 이 생긴다.** 커밋할지 말지를 정해 두지 않으면 E6 PR diff 에 예고 없이 나타난다.
→ **권고: 커밋한다.** 소비자는 이 lockfile 을 쓰지 않으므로(git 의존성은 소비자 lockfile 에 커밋 해시로 핀된다, [B] M1 (4)) 무해하고, 루트 devDeps(typescript) 버전을 고정해 `prepare` 재현성을 준다. 되돌리기 **즉시**(파일 1개).

---

# 17. 숫자 전수 — 출처 점검

| 초안의 숫자 | 출처 | 판정 |
|---|---|---|
| `npm ci` 4.05~4.74 s · 대조군 0.19 s · 캐시 19 MB · 설치본 16 KB | [B] M1 (5)(2) | **출처 있음.** 단 4.05~4.74 는 **S-1 형태**의 값인데 초안은 **S-2** 를 권고한다 → §4 정정 |
| "약 3.9~4.5 s 절약" · "배포당 4초 내외" | 초안이 **뺄셈으로 새로 만든 값**(대장에 없음) | **정정** — 올바른 대조군으로 약 1.6 s (§4) |
| fin 15 모듈 / 20 호출 · fit 4 모듈 / 6 호출 | [A] M1-0 · `measured-facts` | **확인** (독립 재현 §7) |
| fin 10/15 · fit 1/4 · 열거 9 | [A] M1-2·M1-3·M1-4 | **기준 표기 필요** (§7) |
| 무가드 전 쓰기 fin 4 · fit 5 | [A] M1-2·M1-3 합계표 | 확인 (§7 재현에서 쓰기 모듈 5개와 정합) |
| cron on/off 0건 · fit 스케줄 env 6 · fin 하드코딩 6+13 | [A] M2-3 | 확인 |
| 필수 분리 env fin 7 · fit 6 | [A] M3-5 | **정정** — fit 은 `GARMIN_*`·`CLAUDE_BIN` 누락 (F3) |
| grammy `^1.41.1` 하한 · `^1.42.0` | [B] M3 semver | 확인 |
| `engines`·`.nvmrc`·`packageManager` 없음 | [B] M3 | 확인 |
| `.gitignore` 5줄 | 초안 1-4 | **확인** (직접 `cat`) |
| 4100/4200/4210/4301 · pm2 미설치 · Postgres 5432 | [A] M3-1·M4 | 확인 (재측정 안 함) |
| S-2 비용 "미측정" | 초안 1-3 | **해소** — 1.99~2.55 s (§3) |
| R-2 "문서 근거만" | 초안 1-2 경고 박스 | **해소** — 실측 (§3) |
| R-3 "미측정" | 초안 1-2 | **해소** — 실측 (§2) |

**대장에 없는 숫자를 본문에서 만든 곳은 1건**(D-b 절약값)이고 그것이 §4 의 정정이다. 나머지는 전부 [A]·[B]·[MF] 로 추적된다.

---

# 18. 판정과 다음 단계

**정정 10건.** `workflow.md` 4절: *"정정이 하나라도 나오면 문서는 다시 초안이다."*
→ **`02_writer_1a0.md` 는 초안 상태다. 정본(003·004·`workflow.md`) 반영(E2)과 스캐폴딩 커밋(E3)을 착수하지 않는다.**

**차수 관리:** 이번이 1회차다. `workflow.md` 4절은 3회를 넘으면 스코프를 줄이라고 한다. 정정 10건 중 **7건이 문안 교체**이고 형태 재검토가 필요한 것은 **① 하나**다.

## 착수 전 필수 (E2 앞)

| | 항목 | 왜 |
|---|---|---|
| **1** | **F1 반영** — `tsconfig` `exclude` | 유일하게 **비용이 이연되는** 정정. 누락 시 1a-3 에서 두 실서비스 배포가 깨진다 |
| **2** | **① 형태 재선택** — B / ALT-a / ALT-d / ALT-b | C4·C5 의 정정 문안이 **어느 형태를 고르느냐에 따라 통째로 달라진다.** ALT-a·ALT-d 를 고르면 C4 는 불필요해진다. **사용자 판단이 필요한 항목이 없다던 1부 서두가 이 지점에서 바뀐다 → 새 미결 질문(Q47) 후보** |
| **3** | **⑩ 재판정** — E6 를 에이전트 리뷰 필수로 | F1 이 근거 |

## 재측정이 필요한 항목

| # | 항목 | 누구에게 | 왜 |
|---|---|---|---|
| **RM-1** | **GitHub Release 자산 URL 의 실제 설치**(ALT-b) — 인증 요구 여부·`npm ci` 재현성 | `repo-surveyor` | §1-2 는 **로컬 http 서버로 대역**했다. github.com 자산 URL 자체는 미측정 |
| **RM-2** | **ALT-a 운영 비용** — `subtree split` 을 릴리즈 스크립트로 돌렸을 때의 태그·해시 안정성 | `repo-surveyor` | 형태 재선택(위 2)의 입력 |
| **RM-3** | **실제 패키지(1a-1 코드)로 `npm ci` 재측정** | 1a-1 이후 | 현재 값은 전부 **1행짜리 더미** 기준이다. 실제 `@pleiades/notify` 는 `grammy` peer·다중 파일이라 달라진다 |
| **RM-4** | 빈 스키마(β2)에서 fit 리포트 본문 생성 — ⑨ | 서버/로컬 검증 단계 | 이 감사의 읽기 전용 규율 밖 |
| **RM-5** | fin 웹 트리거 전수 재확인 — F4 가 셋을 찾았으나 **동적 import 경유는 따라가지 않았다** | `repo-surveyor` | [A] M3-4 의 "정적 3 + 동적 2" 중 동적 2 의 도달 조건 |
| ~~R-1~~ | [A] M1-2 합계 | — | **철회** — 숫자가 아니라 기준 표기 문제 (§7) |
| ~~R-2·R-3~~ | 루트 devDeps · `private`+`prepare` | — | **해소** — 이 감사에서 실측 (§2·§3) |

## 재현 자료

`$AUD/` (지우지 않음) — `repo-{S1,S1b,S2,S2T,P,D,MONO,MONO2,FIXa,FIXb,FIXc}/` · `consumer-*/` ·
`cache-*/`(격리 npm 캐시) · `parent-sim/`(상위 `package.json` 시뮬레이션) · `dist-serve/`(타르볼).
**대상 저장소 쓰기·설치·빌드 0건** — 코드는 전부 `git -C repos/<d> show|grep integration/pleiades:<path>` 로 읽었다.

---
---

# 감사 2회차 (2026-09-08)

> 대상: `_workspace/1a-0/02_writer_1a0.md` **초안 2회차**(473행) · 1회차 감사(위 §1~§18)의 정정 10건 반영본.
> **1회차 내용은 수정하지 않았다.** 이 절만 append 한다.
> 실행 장소 `$AUD = …/scratchpad/audit` (1회차 자산 재사용 + `repo-R2D`·`repo-R2Dnw`·`repo-PEER` 신설).
> **읽기 전용 유지** — 두 대상 저장소 쓰기·설치·빌드 0건. 코드는 전부 `git -C repos/<d> show|grep integration/pleiades:<path>`.

## 판정 요약

### A. 1회차 정정 10건의 반영 상태

| 1회차 # | 반영 여부 | 비고 |
|---|---|---|
| **①** 케이스 B 유일성 | **정확 반영** | 1-1 제약 1개로 축소 · **1-1b 형태 사다리 4안 + Q47** 신설. 철회 사유(위치 인자 경로)까지 정확 |
| **④** D-b 절약값 | **정확 반영** | 1.6 s · 대조군 0.43 s. *"절약이 작아져 D-a 가 강해진다"* 도 정확 |
| **⑤** `git+https://` 정규화 | **정확 반영** | 1-6 표 + **절차 3단계로 승격** · C1·C10 갱신 |
| **⑦** 합계 10 vs 열거 9 | **정확 반영** | 철회 + 기준 병기 + *"우연히 같은 숫자"* 도 함께 철회 |
| **⑩** E6 리뷰 등급 | **정확 반영** | 에이전트 필수 · 근거는 9-0 "두 저장소 동시 파급" |
| **F1** `exclude` | **정확 반영** | 1-3 🚨 박스 · 1-8 #5 · E3 · C6. 루트 vitest 우회 **배제**까지 |
| **F2** `npm test` 위임 | **반영 · 주석 1건 부정확** | 위임 형태는 맞다. 그러나 *"로컬 루프에 `npm --prefix … install` 이 선행된다"* 는 **ALT-d(`workspaces`)에서는 불필요**하다 → **A-2 (경미)** |
| **F3** β2 선결 | **반영 · 기준 오적용** | `GARMIN_*`·`CLAUDE_BIN`·MCP 를 넣은 것은 맞으나 **`CLAUDE_BIN` 을 "필수 *분리*" 열에 넣었다** → **B⑤ 정정** |
| **F4** 웹 트리거 셋 | **정확 반영** | ⚠ 부수 · 조건 1 · 3-3 α 행. *"트리거는 늘지만 커버리지 숫자는 안 바뀐다"* 도 옳다 |
| **F6·F7** Q46 하향 · lockfile | **반영 · 행위 표기 1건 부정확** | E3 *"파일 7 삭제"* 가 `.gitignore`(1줄 수정)를 파일 삭제로 처리 → **A-3 (경미)** |

**A 판정: 10건 중 7건 정확 반영 · 1건 기준 오적용(B⑤) · 2건 경미 부정확(A-2·A-3).**

### B. 초안 §6 의 반증 요청 10건

| # | 주장 | 판정 | 근거 한 줄 |
|---|---|---|---|
| **①** | ALT-d 권고 — 초안이 적은 필드 그대로 동작하는가 | **정정** | **동작한다**(install·`require`·`tsc --noEmit`·`npm ci` 전부 통과). **그러나 비용이 케이스 B 와 같지 않다** — `npm ci` **3.67~3.96 s**(케이스 B 1.99~2.15) · 설치 **11.37 s** · 캐시 **134 MB**(19 MB). 1-1b 의 `1.94 s` 는 **vitest 없는 구성**의 값이다 |
| **②** | RM-6 을 E4 로 미룬 것 | **정정** | **Q47 답 전에 재야 한다 — 이 감사가 쟀다.** RM-6 은 예측(*"실패하면"*)과 달리 **실패하지 않고 5.7배 비싸진다.** 실패는 보이지만 **배포당 +1.8 s 세금은 안 보인다** |
| **③** | ALT-b 배제 (integrity 포기) | **확인** | RM-1 미측정만으로도 충분하고, 게다가 **"integrity 포기"는 과장**이다 — git dep 은 lockfile 이 **커밋 SHA 로 핀**한다([B] M1 (4) 재확인). 잃는 것은 SHA-1↔SHA-512 강도와 **github 가용성 의존**뿐 |
| **④** | C4 "5키 삭제" | **정정** | **6키다** — `peerDependencies`(1-2 가 **루트** 필드로 결정)가 빠졌다. 단계 4 에서 그것은 `packages/notify` 로 옮겨야 한다. `private` 이 남는다는 판단은 **맞다** |
| **⑤** | 조건 8 fit **9** vs 감사의 8 | **정정** | 키 단위 열거는 옳으나 **기준이 섞였다.** `CLAUDE_BIN` 은 *"반드시 **달라야** 하는 키"*가 아니라 *"반드시 **설정돼야** 하는 키"*다(양 인스턴스 동일 값). **fit 분리 = 8** · `CLAUDE_BIN` 은 별항. ⑦ 의 교훈이 여기서 재발했다 |
| **⑥** | 단위 테스트가 `send.ts:57` 을 대체하는가 | **확인(조건부)** | `isHtmlParseError` 는 **메시지 정규식**(`/can't parse entities\|Bad Request:.*entit/i`)이라 **분기 로직은 mock 으로 결정적으로 커버된다.** 대체 못 하는 것은 *"텔레그램이 실제로 그 문구를 반환하는가"* — 잔여를 명시하면 성립 |
| **⑦** | β2 권고 유지 | **확인(보완 필요)** | 목적을 *"서버 도달"* 로 좁힌 것은 타당. 다만 β2 가 **`prepare`·Q45 를 검증하려면 병행 인스턴스가 git dep 으로 `npm ci` 를 돌아야** 하는데 그것은 **1a-3 범위**다 — β2 의 서술에 그 전제가 없다 |
| **⑧** | Q46 하향(높음→중간) | **확인** | fail-safe(`chatIds.length===0` → 전송 0) · 하드코딩 chat id 0건. 조건 1 최우선 유지도 정합 |
| **⑨** | E6 리뷰 focus 4곳 | **정정** | **`peerDependencies` 가 빠졌다 — 실측으로 설치를 깨뜨린다**(`ERESOLVE` · `node_modules` 0). focus 최소 **5곳** |
| **⑩** | E2 를 E3 앞에 둔 순서 | **확인** | E0(Q47) → E2 → E3 가 맞다. 되돌리기 단위는 **합치면 오히려 커진다**(문서 정정과 스캐폴딩이 한 revert 에 묶인다) |

### C·D

| | 항목 | 판정 |
|---|---|---|
| **C** | F1 해소 형태 재실행 | **확인** — 소비자 설치 `TS2307` 없음 · 루트 `build`/`typecheck`/`test` **전부 exit 0**(1-7 문자열 그대로) |
| **D-1** | 숫자 전수 | **경미 정정 1건** — `fin 하드코딩 19곳`(3-3 δ)이 **열거 없는 합계**다(6+13) |
| **D-2** | 대장에 없는 숫자 | **없음** — 2회차의 모든 숫자가 [A]·[B]·[C] 로 추적된다 |

**정정 8건** (B① · B② · B④ · B⑤ · B⑨ · A-2 · A-3 · D-1) · **확인 5** · **미확인 0**.

---

## 2-1. B①·B② — ALT-d 를 **초안이 적은 필드 그대로** 만들어 돌렸다

초안 1-2(루트 필드 표) · 1-3(서브 구성 표)를 글자 그대로 옮겨 `$AUD/repo-R2D` 를 만들었다.
루트 = `name:"pleiades"` · `private` · **`workspaces:["packages/*"]`** · `main`/`types`/`exports`/`files` 위임 ·
`scripts{prepare,build,typecheck,test}` · devDeps `typescript:^5`.
서브 = `name:"@pleiades/notify"` · `scripts.test:"vitest run"` · **devDeps `vitest`** · `tsconfig` 에 **`exclude:["**/*.test.ts"]`** · `src/index.ts` + `src/index.test.ts`.

```bash
git -C $AUD/repo-R2D ls-files
#   .gitignore  package.json  packages/notify/package.json
#   packages/notify/src/index.test.ts  packages/notify/src/index.ts  packages/notify/tsconfig.json
cd $AUD/consumer-R2D && npm install --foreground-scripts --cache $AUD/cache-R2D
```

### 기능은 전부 통과한다

```
> pleiades@0.0.0 prepare
> tsc -p packages/notify
added 1 package, and audited 2 packages in 11s
node_modules/@pleiades/notify/packages/notify/{dist,package.json}
npm ci → added 1 package … VERSION= 0.0.0
consumer tsc --noEmit exit=0            # fin·fit 동일 옵션(module esnext · moduleResolution bundler · target ES2017 …)
  Module name '@pleiades/notify' was successfully resolved to
  '…/node_modules/@pleiades/notify/packages/notify/dist/index.d.ts' with Package ID 'pleiades/…@0.0.0'
```

### 비용은 통과하지 않는다 — **RM-6 가 실측으로 발동했다**

`workspaces` 가 있으면 **임시 클론의 루트 설치가 워크스페이스 멤버(`packages/notify`)의 devDeps 까지 끌어온다.**

```bash
grep -rho '"key":"…registry.npmjs.org/[^"/]*"' $AUD/cache-R2D/_cacache/index-v5 | sort -u
# @vitest/* @rollup/* @esbuild/*(전 플랫폼) vite vitest playwright puppeteer-core jsdom happy-dom sass … 100여 개
du -sh $AUD/cache-R2D    # 134M
```

| 구성 | 소비자 `npm install`(cold) | **소비자 `npm ci`** | npm 캐시 | registry 패키지 |
|---|---|---|---|---|
| **ALT-d — 초안 표 그대로 (`workspaces` + 서브 vitest)** | **11.37 s** | **3.96 / 3.67 s** | **134 MB** | **100여 개** |
| ALT-d — **`workspaces` 제거**(초안이 미리 적은 폴백 (i)) | 2.86 s | **2.14 s** | 19 MB | `typescript` 1 |
| 케이스 B / S-2 (1회차 §3) | 2.52 s | 1.99~2.15 s | 19 MB | `typescript` 1 |
| 1회차가 잰 ALT-d (**서브 devDeps 없음**) | 3.22 s | **1.94 s** | — | — |

**두 가지가 뒤집힌다.**

1. **1-1b 의 `npm ci` 비교 행과 권고 근거 ②(*"비용이 케이스 B 와 같다 — 1.94 s vs 1.99~2.15 s"*)는 성립하지 않는다.**
   `1.94 s` 는 **1회차 감사가 서브 devDeps 없이 만든 최소 구성**의 값이다. 초안이 실제로 적은 구성은 **3.67~3.96 s** — 케이스 B 대비 **배포당 +1.7~1.9 s**, 두 실서비스의 **매 `npm ci` 마다**다.
2. **초안 ⚠ 델타 박스의 예측이 틀린 방향이다.** 박스는 *"실패(7.8 s · 135 MB · TS2688)로 되돌아간다"* 고 적었다.
   **실패하지 않는다** — `exclude` 가 테스트를 컴파일 대상에서 빼서 `tsc` 는 통과하고, **비용만 조용히 5.7배(설치)·1.8배(`npm ci`)로 는다.**
   **실패는 배포 로그에 보이지만 비용은 보이지 않는다.** 이것이 RM-6 을 E4 로 미루면 안 되는 이유다 — **E4 는 Q47 확정 이후**(E0 → E2 → E3 → E4)라, 그때 재면 **이미 형태를 고른 뒤**다.

**정정 문안 (1-1b 표 · 권고 근거 ② · ⚠ 델타 박스 · RM-6):**
> *"**ALT-d 의 `npm ci` 는 3.67~3.96 s 다** — 케이스 B(1.99~2.15 s)보다 **배포당 약 1.8 s 비싸고 npm 캐시가 134 MB 로 7배**다(2026-09-08 실측, `workspaces` + 서브 vitest 구성). 1회차가 잰 `1.94 s` 는 **서브 devDeps 가 없는 최소 구성**의 값이라 이 표에 쓸 수 없다. 원인은 **`workspaces` 가 임시 클론의 루트 설치에서 멤버 devDeps 를 끌어오는 것**이다 — `exclude` 덕분에 **실패하지 않고 비용만 는다.** **RM-6 는 해소됐고 E4 로 미룰 항목이 아니다.** 따라서 ALT-d 를 택하면 **`workspaces` 는 1a-0 루트에 넣지 않는다**(폴백 (i)): 그러면 `npm ci` 2.14 s · 캐시 19 MB 로 케이스 B 와 같아지고, 대가는 단계 4 에서 **`workspaces` 1키를 추가**하는 것(= 5키 삭제 + 1키 추가)뿐이다."*

> **Q47 에 미치는 영향.** 네 안의 `npm ci` 실측이 이제 전부 있다 —
> **ALT-b 0.43~0.45 s · 케이스 B 1.99~2.15 s · ALT-d(`workspaces` 제거) 2.14 s · ALT-d(초안 그대로) 3.67~3.96 s · ALT-a 미측정**.
> 1-1b 표의 비용 행을 이 값으로 바꾼 뒤 사용자에게 올린다.

---

## 2-2. B④ — C4 는 5키가 아니라 **6키**다

ALT-d 루트가 1a 기간에 갖는 키와, 단계 4(모노레포 루트)에서의 운명:

| 키 | 1a-0 값 | 단계 4 | 근거 |
|---|---|---|---|
| `name` | `"pleiades"` | **유지** | 모노레포 루트 이름 |
| `version` | `"0.0.0"` | 유지(무의미하나 무해) | — |
| `private` | `true` | **유지** | 워크스페이스 루트는 private 이 정상. [B] M1 케이스 C(= 003 §2-1 형태)도 `private:true` 였다 → **초안 §6 ④ 의 물음에 답: 남는다** |
| `workspaces` | `["packages/*"]` | **유지** (폴백 (i) 채택 시 **추가**) | §2-1 |
| **`main`** | 위임 | **삭제** | ① |
| **`types`** | 위임 | **삭제** | ② |
| **`exports`** | 위임 | **삭제** | ③ |
| **`files`** | 위임 | **삭제** | ④ |
| **`scripts.prepare`** | `tsc -p packages/notify` | **삭제** | ⑤ |
| **`peerDependencies`** | `{"grammy":"^1.41.1"}` (1-2 가 **루트** 필드로 결정 · 도입 1a-1) | **`packages/notify` 로 이동** | **⑥ — 초안이 빠뜨렸다** |
| `scripts.build/typecheck/test` | 위임 | **재작성**(워크스페이스 인지 형태) | 삭제도 유지도 아니다 |
| `devDependencies.typescript` | `^5` | 유지 | — |

**`peerDependencies` 는 ALT-d 에서 반드시 루트에 있어야 한다** — 소비자가 설치하는 것이 루트 패키지이므로, 서브에 적으면 **peer 가 아무 효력이 없다.** 그래서 단계 4 에 **이동 작업**이 남는다.

**정정 문안 (1-1b 표 "단계 4 루트 재작성" 칸 · 2부 C4 ALT-d 행):**
> *"ALT-d 의 단계 4 전환은 **5키 삭제가 아니라 6키 처리**다 — 삭제 5(`main`·`types`·`exports`·`files`·`prepare`) + **`peerDependencies` 를 `packages/notify` 로 이동** 1. 그리고 `scripts.build/typecheck/test` 는 **재작성 대상**이다(삭제도 유지도 아니다). **유지되는 것은 `name`·`version`·`private`·`workspaces`** — `private` 은 워크스페이스 루트에서도 남는다([B] M1 케이스 C 확인). 폴백 (i)로 `workspaces` 를 빼면 **6키 처리 + 1키 추가**가 된다."*

---

## 2-3. B⑤ — 조건 8 은 **기준이 섞였다** (⑦ 유형 재발)

조건 8 의 제목은 **"필수 *분리* env"** = *"병행 인스턴스에서 **반드시 달라야** 하는 키"* 다. 그 기준으로 다시 세면:

| 키 | 반드시 **달라야** 하나 | 근거 |
|---|---|---|
| `DATABASE_URL` · `PORT` · `TELEGRAM_BOT_TOKEN` · `TELEGRAM_ALLOWED_CHAT_IDS` · `MCP_PORT` · `SYNC_CRON` | **예** (fit 기존 6) | [A] M3-5 |
| `GARMIN_EMAIL` · `GARMIN_PASSWORD` | **예** — β2 에서 **더미/공란**이어야 한다. 실값이면 `syncAll` 이 사본 DB 를 실데이터로 채운다(위 §9) | [C] §9 |
| **`CLAUDE_BIN`** | **아니오** — claude 실행 파일 **경로**다. 두 인스턴스가 **같은 값**을 쓴다. `process.env.CLAUDE_BIN \|\| "claude"` (fit 5곳: `claude-advisor.ts:28` · `nutrition/*` 4곳) | 실측 |

```bash
git -C repos/myFitness grep -n --text -E "process\.env\.(CLAUDE_BIN|MCP_CONFIG_PATH)" integration/pleiades -- src
# src/lib/ai/claude-advisor.ts:28          const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
# src/lib/nutrition/{estimate-kcal,estimate-nutrition-photo,estimate-nutrition,extract-food-query}.ts   (동일 패턴)
# → MCP_CONFIG_PATH 는 fit 에 0건 (fin 전용: claude-advisor.ts:754)
```

**따라서 fit 필수 *분리* = 8 이고, `CLAUDE_BIN` 은 "필수 *설정*(동일 값)" 이라는 다른 열의 항목이다.**
초안이 *"감사는 8, 이 문서는 9 — 차이는 `GARMIN_*` 을 1항목으로 세느냐 2키로 세느냐"* 라고 정리한 것은 **원인 진단이 틀렸다.** 실제 차이는 **`CLAUDE_BIN` 을 어느 열에 넣느냐**다.
(1회차 감사 §12 의 *"fit 8"* 은 6+3 을 8 로 잘못 더한 산술 오류였다. **결과값 8 은 옳고 도출은 6+2 여야 한다** — 여기서 바로잡는다.)

**fin 쪽도 같은 점검이 필요하다.** 초안은 *"MCP 를 띄우면 `MCP_CONFIG_PATH`·`MYFINANCE_ROOT` 2 추가 = 9"* 로 적었는데, 이 둘은 **경로**라 병행 체크아웃에서 **실제로 달라야 한다**(`claude-advisor.ts:753-754` — `MYFINANCE_ROOT ?? process.cwd()`). 그러므로 **fin 은 9 가 맞다.** 다만 **[A] M3-5 는 이 셋(`CLAUDE_BIN`·`MYFINANCE_ROOT`·`MCP_CONFIG_PATH`)을 "그대로 재사용 가능" 행에 넣었다** — [A] 와 결론이 갈리는데 초안은 그 사실을 적지 않았다.

**정정 문안 (3-2 조건 8 · 그 아래 기준 박스):**
> *"조건 8 을 **두 열로 나눈다.** **(a) 필수 분리(반드시 다른 값)** — fin **9**(`DATABASE_URL`·`PORT`·`TELEGRAM_BOT_TOKEN`·`TELEGRAM_ALLOWED_CHAT_IDS`·`TELEGRAM_ADMIN_CHAT_IDS`·`MCP_PORT`·`AUTH_SECRET`·**`MYFINANCE_ROOT`·`MCP_CONFIG_PATH`**) · fit **8**(기존 6 + `GARMIN_EMAIL`·`GARMIN_PASSWORD` — β2 에서 더미/공란). **(b) 필수 설정(값은 같아도 됨)** — `CLAUDE_BIN`(fit 5곳 참조, fin 은 `claude` 기본값). **`CLAUDE_BIN` 은 (a) 가 아니다** — 두 인스턴스가 같은 실행 파일을 쓴다. 그리고 **[A] M3-5 는 `CLAUDE_BIN`·`MYFINANCE_ROOT`·`MCP_CONFIG_PATH` 를 '그대로 재사용 가능' 으로 분류했다** — 이 문서는 MCP·advisor 를 띄우는 전제에서 뒤의 둘을 (a) 로 옮기며, 그 차이를 [A] 에 되돌려 보낸다(**RM-7**)."*

---

## 2-4. B⑨ — E6 리뷰 focus 는 **4곳이 아니라 최소 5곳**

`peerDependencies` 는 **설치를 깨뜨릴 수 있는 표면**이다. 실측:

```bash
# 루트에 "peerDependencies": {"grammy": "^1.41.1"} 를 넣은 $AUD/repo-PEER
# (a) 소비자에 grammy 가 없을 때
npm install → added 11 packages, and audited 12 packages in 3s      # ← peer 를 자동 설치한다
# (b) 소비자에 grammy 1.40.0 (하한 미만) 이 있을 때
npm error code ERESOLVE
npm error ERESOLVE unable to resolve dependency tree
npm error Found: grammy@1.40.0
npm error Could not resolve dependency:
   node_modules: 0 entries                                          # ← 설치 실패
```

두 결과 모두 위험하다 — **(b)는 설치 실패**, **(a)는 소비자에 없던 `grammy` 를 조용히 심는다.**
1a-1 에서 `peerDependencies` 를 실제로 선언할 때(초안 1-2·4-2), 두 소비자의 **선언 spec** 이 `^1.41.1`/`^1.42.0` 이라 현재는 안전하지만([B] M3), **fin 이 lockfile 을 되돌리거나 하한을 낮추면 (b)가 발동**한다.

**정정 문안 (4-3 E6 리뷰 focus):**
> *"리뷰 focus 는 **`prepare` · `tsconfig` `exclude` · `files` · `exports` · `peerDependencies`** **다섯 곳**이다. `peerDependencies` 는 하한을 어긋나게 적으면 소비자 설치를 **`ERESOLVE` 로 실패**시키고(실측: `node_modules` 0), 반대로 소비자에 그 패키지가 없으면 **자동 설치돼 의존이 늘어난다**(실측: 11 packages). `engines` 는 **적지 않기로 했으므로**(1-2) focus 밖이지만, Q45 이후 추가할 때 이 목록에 넣는다."*

---

## 2-5. B③·B⑥·B⑦·B⑧·B⑩ — 확인

**③ ALT-b 배제 — 확인, 근거는 오히려 더 강하다.**
초안은 *"`integrity` 와 0.44 s 를 포기하는 값"* 을 스스로 물었다. **포기의 크기가 작다:** git dep 의 lockfile 은 **커밋 SHA 로 핀**한다(1회차 §3 재확인 — `resolved: git+file://…#9c4a85ab…`). 즉 **재현성은 SHA 로 이미 보장**되고, 태그를 force-push 해도 lockfile 이 가리키는 커밋은 바뀌지 않는다. 타르볼이 추가로 주는 것은 **해시 강도(SHA-512)와 registry 무관 배포**이지 *"무결성이 없다 vs 있다"* 가 아니다. RM-1 미측정과 합치면 배제는 타당하다.
> **보완 문안:** 1-1b 의 `integrity` 행에 각주 — *"git dep 도 **커밋 SHA 로 핀**된다(재현성 보장). ALT-b 가 더 주는 것은 해시 강도와 github 가용성 비의존이다."*

**⑥ 단위 테스트가 `send.ts:57` 을 대체하는가 — 확인(잔여 명시 조건).**
```ts
// repos/myFitness : src/bot/utils/error.ts
export function isHtmlParseError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /can't parse entities|Bad Request:.*entit/i.test(msg);
}
```
판정 근거가 **메시지 정규식**이므로, `bot.api.sendMessage` 를 mock 해 `new Error("Bad Request: can't parse entities…")` 를 던지면 **plain 재전송 분기(`:57~60`)가 결정적으로 재현된다.** 4096 절단(`:9·:34`)은 더 쉽다.
**대체하지 못하는 것 둘:** (i) 텔레그램이 실제로 그 문구를 반환하는지(정규식↔실 API 결합), (ii) 새 L3 가 만든 HTML 이 실제로 parse 에러를 유발하는지. 그리고 **fit 저장소에는 현재 테스트 파일이 0개**(`git ls-tree … | grep -E "__tests__|\.test\."` → 0)라 1a-1 이 처음부터 쓴다.
> **보완 문안:** 3-4 "위험 분기는 단위 테스트로" 행에 — *"단위 테스트가 커버하는 것은 **분기 로직**이다(`isHtmlParseError` 가 메시지 정규식이라 mock 으로 결정적). **커버하지 못하는 잔여는 정규식과 실 API 응답의 결합**이며, 이는 어떤 인스턴스 검증으로도 '한 번 맞았다' 이상을 주지 못한다 — β1 이 그 잔여를 없애지 못하므로 β1 배제는 유지된다."*

**⑦ β2 유지 — 확인(전제 1개 보완).**
목적을 *"서버 도달 검증"* 으로 좁힌 것은 정합적이다. 다만 **β2 가 `prepare`·Q45(서버 https)를 검증하려면 그 병행 인스턴스가 `@pleiades/notify` 를 git dep 으로 `npm ci` 해야** 한다 — 그것은 **1a-3 이후**의 상태다. 지금 서술대로면 β2 는 *"메시지 도달"* 만 보고 **배포 경로는 여전히 미검증**으로 남는다.
> **보완 문안:** 3-4 β2 행에 — *"β2 가 배포 경로(`prepare`·Q45)를 검증하는 것은 **병행 인스턴스가 git dep 을 실제로 설치한 뒤**부터다(= 1a-3 이후). 그 전의 β2 는 **텔레그램 도달만** 검증한다. 따라서 β2 의 서버 승인 게이트는 **1a-3 과 함께** 소비하는 편이 싸다."*

**⑧ Q46 하향 — 확인.** `getChatIds()` 가 빈 배열이면 전송 자체가 없고(fail-safe), 하드코딩 chat id 0건이라 수신자 격리는 env 로 완결된다. *"이미 나간 메시지는 불가"* 때문에 조건 1 을 최우선으로 남긴 것도 정합적이다.

**⑩ E2 → E3 순서 — 확인.** 합치면 되돌리기 단위가 **커진다** — 문서 정정(C1~C15)과 스캐폴딩이 한 커밋/한 revert 에 묶여, *"형태는 되돌리되 정정은 남긴다"* 가 불가능해진다. E2 가 먼저면 **E3 를 통째로 버려도 Q28 확정·10조건·`git+ssh` 오정정의 정정이 남는다**(초안 E2 "멈추면 남는 것" 이 그대로 옳다).

---

## 2-6. C — F1 해소 형태 재실행 (1-7 표의 명령 문자열 그대로)

```bash
cd $AUD/repo-R2D && npm install          # 루트 install (workspaces 가 멤버 devDeps 까지 설치)
npm run build       # tsc -p packages/notify              → exit=0
npm run typecheck   # tsc --noEmit -p packages/notify     → exit=0
npm test            # npm --prefix packages/notify run test → vitest run
```
```
 ✓ src/index.test.ts (1 test) 1ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
npm test exit=0
packages/notify/dist → index.d.ts  index.js        # 테스트 산출물 0 (exclude 정상)
```
**(i) 소비자 설치에 `TS2307` 없음 · (ii) 루트 3명령 전부 exit 0.** F1·F2 의 해소 형태는 확정이다.

**단, 국소 관찰 1건 (A-2):**
```bash
# ALT-d(workspaces 있음): 루트 install 만으로 vitest 가 이미 들어온다
ls $AUD/repo-R2D/node_modules/.bin   # esbuild nanoid rollup tsc tsserver vite vite-node vitest why-is-node-running
# 폴백(i)(workspaces 없음) 또는 케이스 B: 루트 install 만으로는 안 된다
cd $AUD/repo-R2Dnw && npm install && npm test
#   > vitest run
#   sh: vitest: command not found          ← npm --prefix packages/notify install 이 선행돼야 한다
```
초안 1-7 의 주석(*"로컬 개발 루프에서는 `npm --prefix packages/notify install` 이 선행된다 — 43 packages · 5.46 s"*)은
**케이스 B / 폴백(i) 에서만 참**이고 **ALT-d(`workspaces`)에서는 불필요**하다.
그런데 **§2-1 이 `workspaces` 제거(폴백 (i))를 권고**하므로, 그 경우 **선행 install 이 다시 필수**가 된다.
> **정정 문안 (1-7 주석 · E5):** *"`npm test` 는 **`packages/notify` 의 의존이 설치돼 있어야** 실행된다. `workspaces` 가 있으면 루트 `npm install` 이 함께 설치하고, **없으면(§2-1 권고 형태) `npm --prefix packages/notify install` 이 선행돼야 한다**(실측: 없으면 `sh: vitest: command not found`). **E5 는 이 선행 단계를 포함한다** — 8절 표의 명령만으로는 자족적이지 않다."*

---

## 2-7. A-3 · D-1 — 경미 2건

**A-3. E3 의 되돌리는 행위 표기.** E3 는 산출물을 *"파일 7"* 로 세고 되돌리기를 *"파일 7 삭제 + `git revert`"* 로 적는다.
그러나 7 중 **`.gitignore` 는 신규 파일이 아니라 1줄 수정**이다(현재 5줄, 1-4). *"삭제"* 하면 pleiades 의 기존 4줄까지 사라진다.
> **정정 문안:** *"E3 산출물 = **신규 파일 6**(루트 `package.json` · `packages/notify/{package.json,tsconfig.json,src/index.ts,src/index.test.ts}` · `package-lock.json`) + **수정 1**(`.gitignore` 1줄 추가). 되돌리기 = **신규 6 삭제 + `.gitignore` 1줄 되돌림**(또는 `git revert` 1회)."*

**D-1. 열거 없는 합계 1건.** 3-3 δ 열의 *"fin 하드코딩 **19곳**"* 은 3-1 (b)의 `lib/cron.ts` **6** + `scheduler.ts` **13** 을 더한 값인데, 그 셀에는 열거가 없다.
005 R1 · `workflow.md` 2절이 요구하는 형식대로 **출처를 병기**한다.
> **정정 문안:** *"fin 하드코딩 cron 지점 **6(`lib/cron.ts`) + 13(`bot/notifications/scheduler.ts`)**([A] M2-3)"*.

그 밖의 2회차 숫자는 전부 추적된다 — `1.94`·`2.30`·`5.46`·`43 packages`·`9.24`·`140 MB`·`3.14~3.15`·`1.99~2.15`·`2.55`·`0.43~0.45`·`7.8`·`135 MB`·`1.6 s`·`0.43 s`·`fin 7/fit 6`·`fin 15/fit 4`·`10/15`·`1/4`·`^1.41.1` 은 [A]·[B]·[C] 의 표에 있다. **대장에 없는 새 숫자는 0건**이다(1회차의 유일한 위반이던 D-b 뺄셈값은 정정됐다).

---

## 2-8. 판정과 다음 단계

**정정 8건.** `workflow.md` 4절 — *"정정이 하나라도 나오면 문서는 다시 초안이다."*
→ **`02_writer_1a0.md` 는 여전히 초안이다. E2(정본 정정)·E3(스캐폴딩)를 착수하지 않는다.**

**차수: 2회차 종료.** 4절은 **3회를 넘으면 스코프를 줄이라**고 한다. 다음이 3회차다.
**질적으로는 수렴 중이다** — 1회차 정정 10건 중 **형태를 뒤집는 것이 1건(①)** 이었던 데 비해,
2회차 정정 8건은 **형태를 뒤집는 것이 0건**이고 **비용 수치 1(B①·B②) · 키 계산 2(B④·B⑤) · 표면 누락 1(B⑨) · 경미 3(A-2·A-3·D-1)** 이다.
**3회차는 아래 6개 문안 반영만 확인하면 되는 규모**여야 한다. 그 이상이 나오면 스코프 축소 신호다.

### 3회차 전 반영할 문안 (전부 이 절에 원문이 있다)

| # | 절 | 반영 대상 |
|---|---|---|
| 1 | 1-1b 비용 행 · 권고 근거 ② · ⚠ 델타 · RM-6 | **§2-1** — ALT-d 실측 3.67~3.96 s / 134 MB · **`workspaces` 를 1a-0 루트에서 뺀다** · RM-6 해소 |
| 2 | 1-1b "단계 4" 칸 · 2부 C4 | **§2-2** — 5키 → **6키**(+`peerDependencies` 이동) · `scripts` 재작성 · `private` 유지 |
| 3 | 3-2 조건 8 | **§2-3** — **(a) 필수 분리 fin 9 · fit 8** / **(b) 필수 설정 `CLAUDE_BIN`** 두 열 분리 |
| 4 | 4-3 E6 focus | **§2-4** — focus **5곳**(+`peerDependencies`) |
| 5 | 1-7 주석 · E5 | **§2-6** — `npm test` 선행 조건(`npm --prefix … install`)을 E5 에 포함 |
| 6 | E3 산출물 · 3-3 δ | **§2-7** — 신규 6 + 수정 1 · `19곳` → `6+13` |

**보완(정정 아님) 3건:** ALT-b `integrity` 각주(§2-5 ③) · 단위 테스트 잔여 명시(§2-5 ⑥) · β2 배포경로 전제(§2-5 ⑦).

### 재측정 정산

| # | 상태 |
|---|---|
| **RM-6** | **해소** — 이 감사가 쟀다(§2-1). E4 항목에서 내린다 |
| **RM-7** *(신설)* | **[A] M3-5 의 `CLAUDE_BIN`·`MYFINANCE_ROOT`·`MCP_CONFIG_PATH` 분류를 되돌려 보낸다** — [A] 는 "그대로 재사용 가능", 이 문서는 뒤의 둘을 "필수 분리" 로 옮긴다(§2-3) |
| RM-1 · RM-2 | Q47 에서 ALT-b·ALT-a 를 고를 때만 선결 — **유지** |
| RM-3 · RM-4 · RM-5 | 유지 |
| R-1 / R-2 · R-3 | 철회 / 해소 — 2회차 반영 확인 |

### 재현 자료 (2회차 추가)

`$AUD/repo-R2D`(초안 필드 그대로) · `$AUD/repo-R2Dnw`(`workspaces` 제거 폴백) · `$AUD/repo-PEER`(peer 실험) ·
`$AUD/consumer-{R2D,R2Dnw,PEER1,PEER2}` · `$AUD/cache-{R2D,R2Dnw,PEER,local,localnw}`.
**대상 저장소 쓰기·설치·빌드 0건.**

---
---

# 감사 3회차 (2026-09-08)

> 대상: `_workspace/1a-0/02_writer_1a0.md` **초안 3회차**(507행).
> **범위 한정(코디네이터 지시):** ① 2회차 정정 8건 + 보완 3건의 반영 확인 · ② 초안 §6 확인 요청 10행 · ③ 숫자 전수.
> **새 반증 실험은 1건만** — 3회차에서 값이 바뀐 곳(ALT-d `workspaces` 제거 정의 = `npm ci` 2.14 s / 캐시 19 MB)의 재현.
> 1·2회차 절은 수정하지 않았다. **읽기 전용 유지** — 대상 저장소 쓰기·설치 0건.

## 판정 요약

### ① 2회차 정정 8건 + 보완 3건

| 2회차 # | 요구한 것 | 반영 위치(실측) | 판정 |
|---|---|---|---|
| **B①** | ALT-d 실측 비용 · `1.94 s` 철회 · 원인 명시 | ⚠ 표 7(64행) `1.94 s` **철회 명시** · 1-1b `npm ci` 행(113) `2.14 s` + *"`workspaces` 를 두면 3.67~3.96 s · 설치 11.37 s · 캐시 134 MB"* · 권고 근거 ②(124-125) · 개정 이력(22) **registry 100여 패키지** · Q47(409) | **반영** |
| **B②** | RM-6 을 E4 에서 내리고 **`workspaces` 제거를 ALT-d 정의에 포함** | 1-1b 루트 칸(111) *"`workspaces` 는 1a-0 에 넣지 않는다(정의에 포함)"* · ✅ 박스(136-139) *"E4 로 미룰 항목이 아니었다"* · 1-2 `workspaces` 행(158) · RM 표(427) **RM-6 해소** · E4(451) *"RM-6 은 감사가 이미 쟀다"* | **반영** |
| **B④** | C4 = 6키 처리(+`peerDependencies` 이동) · `scripts` 재작성 · `private` 유지 | 1-1b 단계 4 칸(115) · C4 ALT-d 문안(146) · 개정 이력(24) · Q47(409) | **반영** — 단 **되돌리기 칸으로 잘못 전파**(아래 정정 1) |
| **B⑤** | 조건 8 을 (a)분리/(b)설정 두 열로 · fin 9 · fit 8 · [A] 이견 명시 | 3-2 조건 8 행(353) · 정정 박스(357-361) **RM-7 포함** · 3-3 β2 선행 조건(375)도 (a)/(b) 로 갈라 적음 | **반영** |
| **B⑨** | E6 focus 5곳(+`peerDependencies`) | E6 박스(460-462) **5곳** + `ERESOLVE`·11 packages 인용 · 1-2 `peerDependencies` 행(164)이 *"넣어도 무영향"* → **"1a-0 에 넣지 않는다(확정)"** 로 교체 · 1-8 #10(292) · 4-2(439) | **반영 (초과 반영)** — 2회차는 focus 추가만 요구했는데 **1a-0 에서 아예 뺐다.** 더 안전한 방향이고 1-8·4-2 와 정합 |
| **A-2** | `npm test` 선행 조건을 갈라 적고 E5 에 포함 | 1-7 박스(273) *"`workspaces` 있으면 불필요 / 없으면(= 권고 형태) 필수"* · E5(452) **선행 install 포함** | **반영** |
| **A-3** | E3 = 신규 6 + 수정 1 | E3(450) *"신규 파일 6 · 수정 1(`.gitignore` 1줄)"* · 되돌리기 *"신규 6 삭제 + `.gitignore` 1줄 되돌림"* + 2회차 오류 명시 | **반영** |
| **D-1** | `19곳` → 열거 병기 | 3-3 δ 선행 조건(375) **`6(lib/cron.ts) + 13(bot/notifications/scheduler.ts)`** ([A] M2-3) | **반영** |
| **보완 ①** | git dep 도 커밋 SHA 로 핀 | 1-1b `integrity` 행(114) 각주 · Q47(409) | **반영** |
| **보완 ②** | 단위 테스트 잔여 2건 | 3-4 "위험 분기는 단위 테스트로" 행(393) — 정규식 인용 + 잔여 ①② + *fit 테스트 파일 0개* | **반영** |
| **보완 ③** | β2 배포 경로 검증은 1a-3 이후 | 3-4 β2 행(392) *"β2 의 서버 승인 게이트는 1a-3 과 함께 소비하는 편이 싸다"* | **반영** |

**11건 중 11건 반영 · 누락 0.** 다만 B④ 의 반영이 **한 칸을 넘어갔다** → 정정 1.

### ② 초안 §6 확인 요청 10행

| §6 # | 확인 항목 | 판정 |
|---|---|---|
| 1 | B① 수치·철회·원인 | **확인** |
| 2 | B② `workspaces` 제거가 정의에 포함 · E4 에서 하락 | **확인** (재현 실험은 아래 ③) |
| 3 | B④ 6키 + 1키 · `scripts` 재작성 · `name`/`version`/`private` 유지 | **확인** (단계 4 칸에 한해) — **되돌리기 칸은 오반영** |
| 4 | B⑤ 두 열 · fin 9/fit 8 · [A] 이견 + RM-7 | **확인** |
| 5 | B⑨ focus 5곳 · 1-2 `peerDependencies` 행 교체 | **확인** |
| 6 | A-2 조건 분기 · E5 포함 | **확인** |
| 7 | A-3 신규 6 + 수정 1 | **확인** |
| 8 | D-1 열거 병기 | **확인** |
| 9 | 보완 integrity 각주 | **확인** |
| 10 | 보완 단위 테스트 잔여 · β2 전제 | **확인** |

### ③ 재현 실험 1건 — ALT-d(`workspaces` 없음)

**3회차 1-2·1-3 표를 글자 그대로** 새로 구성(`$AUD/repo-R3D` — 루트 키 9개: `name version private main types exports files scripts devDependencies`, **`workspaces` 없음 · `peerDependencies` 없음**, 서브 vitest + `exclude` + 테스트 커밋).

```bash
cd $AUD/consumer-R3D && npm install --cache $AUD/cache-R3D     # added 1 package … real 4.92 (cold)
for i in 1 2 3; do rm -rf node_modules; npm ci --cache $AUD/cache-R3D; done
#   real 2.05 / 2.09 / 2.01
du -sh $AUD/cache-R3D                                          # 19M
grep -rho '…registry.npmjs.org/[^"/]*' …/index-v5 | sort -u    # typescript          ← 오직 하나
node -e "require('@pleiades/notify').VERSION"                  # 0.0.0
```

| 초안 3회차가 적은 값 | 이번 재현 | 판정 |
|---|---|---|
| `npm ci` **2.14 s** | **2.01~2.09 s** | **확인** (같은 대역 · 2회차 측정치 2.14 s 와도 정합) |
| 캐시 **19 MB** | **19 MB** | **확인** |
| 케이스 B(1.99~2.15 s)와 *"차이 0 수준"* | 2.01~2.09 vs 1.99~2.15 — **겹친다** | **확인** |
| registry 패키지 = `typescript` 하나 | 동일 | **확인** |

→ **`workspaces` 제거를 ALT-d 권고안의 정의에 넣은 3회차 개정은 실측으로 지지된다.**

### ④ 숫자 전수

| 점검 | 결과 |
|---|---|
| **대장([A]·[B]·[C]) 밖의 새 숫자** | **0건** — 3회차가 새로 만든 수치 없음. 초안 §6 의 자기 신고와 일치 |
| **합계 ≠ 열거** | **0건** — 조건 8 (a) fin 9 = 7+2 열거 ✓ · fit 8 = 6+2 열거 ✓ · E3 신규 6 = 6개 파일 열거 ✓ · 단계 4 6키 = 5 삭제 + 1 이동 열거 ✓ · δ `6+13` ✓ · ⚠ 표 "6건 + 감사 4건" = 10행 ✓ · 부수 발견 4건 = 4개 ✓ · Q47 *"넷 중 셋"* = 실측 3 + 미측정 1 ✓ |
| **C4 본문의 "키 5개"** (146행) | **정합** — §2-1 이 이미 `prepare` 를 세었으므로 `main`·`types`·`exports`·`files`·`peerDependencies` 5 를 더하면 6 이 된다 |
| **인용 정확도** | `2.14`·`3.67~3.96`·`11.37`·`134 MB`·`1.99~2.15`·`0.43~0.45`·`1.6 s`·`2.30`·`9.24`·`140 MB`·`3.14~3.15`·`19 MB`·`11 packages`·`fin 15/fit 4`·`10/15`·`1/4`·`^1.41.1` — 전부 [A]·[B]·[C] 의 표와 일치 |

---

## 정정 (2건)

### 정정 1 — B④ 가 **되돌리기 칸으로 잘못 전파됐다** (1-1b · 1-8)

```
119행 | **되돌리는 행위** | 루트 파일 삭제 | **루트 6키 삭제 (파일은 남는다)** | … |
283행 | 1 | 형태 = Q47 (권고 ALT-d · workspaces 없이) | 즉시 | **루트 6키 삭제 (B 면 파일 삭제)** |
```

**세 가지가 어긋난다.**

1. **`6키` 는 단계 4 전환의 델타이지 1a-0 되돌리기의 델타가 아니다.** 그 6 은 `삭제 5 + peerDependencies 이동 1` 인데, **`peerDependencies` 는 3회차에서 1a-0 에 넣지 않기로 확정했다**(1-2 164행 · 1-8 #10 · 4-2). 1a-0 루트에 존재하는 위임 키는 **5개**(`main`·`types`·`exports`·`files`·`scripts.prepare`)다.
2. **`(파일은 남는다)` 가 성립하지 않는다.** pleiades 에는 루트 `package.json` 이 **없다** — E3 가 신규 생성한다.
   ```bash
   git cat-file -e origin/dev:package.json   # → 없음 (E3 가 신규 생성)
   [ -f package.json ]                       # → 없음 (작업트리)
   # 재현 구성의 루트 키 9개: name version private main types exports files scripts devDependencies
   ```
   (`[B]` M2 도 같은 사실을 전제로 세 형태를 측정했다 — *"`origin/dev` 에 루트 `package.json` 이 없음을 먼저 확인"*.)
3. **같은 문서의 E3 와 모순된다.** E3(450행)의 되돌리기는 *"**신규 6 삭제** + `.gitignore` 1줄 되돌림"* 이고 그 신규 6 에는 **루트 `package.json` 이 포함**된다. 119·283 행은 *"파일은 남는다"* 고 적어 **같은 행위를 두 가지로 기술**한다.

> 이 항목이 중요한 이유: **되돌리는 행위 병기는 이 저장소의 고유 규율**(`workflow.md` 4절 · pleiades 고유 규율 1)이고, 1-8 은 그 규율의 요약표다. 표가 실제 행위와 다르면 롤백 시점에 그 표를 읽는 사람이 **없는 파일에서 키를 지우려 한다.**

**정정 문안 (119행 · 283행):**
> 1-1b 되돌리는 행위 행 ALT-d 칸 → *"**루트 `package.json` 삭제**(E3 가 신규 생성한 파일이다 — pleiades 에는 루트 `package.json` 이 없다). 형태만 케이스 B 로 바꾸려면 **`name` 1줄**."*
> 1-8 #1 되돌리는 행위 → *"**루트 `package.json` 파일 삭제**(B·ALT-d 동일). ※ **단계 4 의 `6키 처리 + 1키 추가` 와 혼동하지 않는다** — 그것은 전환 델타이고, 1a-0 루트에 실재하는 위임 키는 **5개**다(`peerDependencies` 는 1a-0 에 넣지 않는다)."*

### 정정 2 — 문서 상태 라벨 2곳이 2회차에 멈춰 있다 (경미)

```
448행 | **E1** | **감사 2회차** (§6 목록) | … (1회차가 10건을 걸렀다) |
476행 | **감사 2회차가 정정을 낼 때** | 3회를 넘으면 스코프를 줄인다(`workflow.md` 4절). **현재 2회차** |
```
문서 표제·상태 줄·개정 이력은 **3회차**인데, 집행 순서(E1)와 유효기간 표는 **2회차**로 남아 있다.
E1 이 가리키는 §6 도 이미 *"감사 3회차 — 반영 확인 요청"* 으로 바뀌었다.

**정정 문안:**
> E1 → *"**감사 3회차**(§6 반영 확인 목록). 1·2회차가 **정정 18건**(10 + 8)을 걸렀다."*
> 5절 → *"**현재 3회차** — `workflow.md` 4절상 마지막 순환이다."*

---

## 최종 판정

**정정 2건 · 오반영 1 · 누락 0 · 확인 10(§6 전 행) + 재현 1.**
**정정이 0 이 아니므로 `02_writer_1a0.md` 는 통과가 아니다.**

**그러나 3회차는 `workflow.md` 4절의 마지막 순환이다** — *"3회를 넘으면 스코프를 줄인다."*
따라서 **오케스트레이터에게 스코프 축소를 보고**하되, **축소 대상은 문서가 아니라 감사 순환 자체**임을 함께 보고한다. 근거:

| 회차 | 정정 | 성격 |
|---|---|---|
| 1회차 | **10건** | **형태를 뒤집는 것 1건**(케이스 B 유일성) · 설치를 깨뜨리는 것 1건(F1) · 수치 오류 · 표면 누락 |
| 2회차 | **8건** | 형태를 뒤집는 것 **0** · 비용 수치 1 · 키 계산 2 · 표면 누락 1 · 경미 3 |
| **3회차** | **2건** | 형태·비용·사실 주장 정정 **0** · **표기 1**(되돌리기 칸) · **라벨 1**(회차 표시) |

**새 측정도, 새 결정도 요구하지 않는다** — 두 건 모두 위에 **문안 원문**이 있고 **4줄 수정**으로 끝난다.
따라서 권고는 다음과 같다.

> **4회차 전체 순환을 열지 않는다.** 위 2건을 문안대로 반영한 뒤,
> **재감사는 `git diff` 로 그 4줄만 확인**하는 것으로 갈음한다(`decision-writer` 가 반영 → 오케스트레이터가 diff 확인).
> 그 확인이 끝나면 초안은 **E0(Q47) 로 넘어갈 수 있는 상태**다.

**남은 게이트는 감사가 아니라 사용자 판단이다** — **Q47(배포 형태)** 이 E2·E3 를 막고 있고,
그 입력값(네 형태의 `npm ci`·단계 4 델타·미측정 선결)은 이제 **전부 문서에 있다**.
Q44·Q45·Q46 은 1a-0 을 막지 않는다(각각 서버 작업 승인 전 · 1a-3 착수 전 · 병행 인스턴스 기동 전).

**재측정 정산 (3회차 변화 없음):** RM-1·RM-2(Q47 종속) · RM-3(1a-1 이후) · RM-4(Q44 확정 후) · RM-5 · RM-7(신설, [A] 에 되돌려 보냄) 유지 · **RM-6 해소** · R-1 철회 · R-2·R-3 해소.

**재현 자료 (3회차 추가):** `$AUD/repo-R3D` · `$AUD/consumer-R3D` · `$AUD/cache-R3D`.
**대상 저장소 쓰기·설치·빌드 0건.**
