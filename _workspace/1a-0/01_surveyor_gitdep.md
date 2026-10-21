# npm git 의존성 역학 실측 — M1~M3 (2026-09-08)

> ⚠ **가정을 뒤집는 결과 3건.**
> ① **git 의존성은 서브디렉터리를 설치할 수 없다.** npm 10.8.2 는 클론 **루트의 `package.json`** 만 읽는다
> (루트에 없으면 `ENOENT … /_cacache/tmp/git-cloneXXXX/package.json`, EXIT 254). `#path:` 같은 문법은 문서에도 없고 실행에서도 실패했다.
> → **`packages/notify/` 를 그대로 두고 `git+ssh://…/pleiades#tag` 로 설치하는 003 §1-1 + §2-1 조합은 성립하지 않는다.**
> 케이스 C(루트 = `workspaces` 모노레포 루트) 는 `node_modules/**pleiades**/` 로 설치되고 `require('@pleiades/notify')` 는 실패한다.
> **003 §2-1 의 "모노레포 승계 시 `package.json` 무변경" 주장은 정정 대상이다.**
> ② **Q28 답 — 세 형태 전부 SSH 키 없이 설치된다.** pacote 는 GitHub-hosted spec 을 **https 로 먼저** 해석하고 ssh 는 폴백이다.
> 사용자가 `git+ssh://` 라고 써도 **ssh 는 한 번도 호출되지 않았다**(래퍼 로그 0회 / 비-hosted URL 대조군은 2회).
> 다만 **lockfile `resolved` 에는 `git+ssh://` 가 기록된다** — 읽고 "키가 필요하다"고 결론내면 틀린다.
> ③ **`prepare` 는 `npm ci` 에서도 매번 재실행된다.** 두 저장소 `deploy/deploy.sh` 가 `npm ci` 를 쓰므로
> **배포 때마다 서버에서 `git clone` + devDeps 설치 + `tsc` 컴파일**이 돈다(실측 4.0~4.7초, 캐시 19 MB). 대조군(git dep 없음) 0.19초.

환경: node **v20.18.0** · npm **10.8.2** · git **2.50.1 (Apple Git-155)** · darwin 25.6.0
작업 장소: `/private/tmp/claude-501/-Users-sagan-workspace-pleiades/d1f70559-c2f7-4d4a-b5e2-13a0bf58b65a/scratchpad/gitdep/` (이하 `$S`)
**대상 저장소 쓰기 0건.** M3 는 `repos/*` worktree 의 `integration/pleiades` ref 에서 `git show` 로만 읽었다 (모드 I).
`~/.gitconfig` 에 `insteadOf` 재작성 **없음**(측정 전 확인) — URL 형태가 그대로 npm 에 전달된다.

---

## M1. git 의존성은 서브디렉터리를 설치할 수 있는가

### 준비한 더미 저장소 3종

| 저장소 | 루트 `package.json` | `packages/notify/` | tag |
|---|---|---|---|
| `$S/fake-A` | **없음** | `@pleiades/notify` + `src/index.ts` + `tsconfig.json` | `v0.0.1` |
| `$S/fake-B` | **있음** — `name:@pleiades/notify`, `main/types/exports` 가 `packages/notify/dist/*` 를 가리킴, `prepare` 가 하위 install+build, `files:["packages/notify/dist","packages/notify/package.json"]` | 동일 | `v0.0.1` |
| `$S/fake-C` | **있음** — `name:pleiades`, `private:true`, `workspaces:["packages/*"]` (= 003 §2-1 형태) | 동일 | `v0.0.1` |

`dist` 는 세 저장소 모두 `.gitignore` 에 있다(빌드 산출물이 커밋돼 있지 않은 상태를 재현).

### (1) 케이스 A — 루트 `package.json` 없음 → **실패**

```bash
cd $S/consumer-A && npm install "git+file://$S/fake-A#v0.0.1"
```
```
npm error code ENOENT
npm error syscall open
npm error path /Users/sagan/.npm/_cacache/tmp/git-cloneoobaAt/package.json
npm error enoent Could not read package.json: Error: ENOENT: no such file or directory,
             open '/Users/sagan/.npm/_cacache/tmp/git-cloneoobaAt/package.json'
```
실제 종료 코드 **254**. `node_modules` 는 생성되지 않았다(`ls` 로 확인 — `package.json` 하나뿐).

### (2) 케이스 B — 루트가 곧 패키지 → **성공**

```bash
cd $S/consumer-B && npm install "git+file://$S/fake-B#v0.0.1"
# added 1 package, and audited 2 packages in 5s   (real 5.24s)

find node_modules/@pleiades/notify -maxdepth 3 | sort
```
```
node_modules/@pleiades/notify
node_modules/@pleiades/notify/package.json
node_modules/@pleiades/notify/packages
node_modules/@pleiades/notify/packages/notify
node_modules/@pleiades/notify/packages/notify/dist
node_modules/@pleiades/notify/packages/notify/package.json
```

| 확인 항목 | 결과 |
|---|---|
| `dist/index.js` 생성 (= `prepare` 실행) | **예** — `exports.hello = 'notify';` |
| `dist/index.d.ts` | **예** — `export declare const hello = "notify";` |
| `node -e "require('@pleiades/notify')"` | **`{"hello":"notify"}`** |
| `src/` · `tsconfig.json` 포함 여부 | **제외됨** (`files` 가 걸러냄) |
| `node_modules/@pleiades/notify` 크기 | **16 KB** (`node_modules` 전체 20 KB) — typescript 는 소비자에 남지 않는다 |

### (2') 케이스 C — 루트가 `workspaces` 모노레포 루트 (003 §2-1 형태) → **설치는 되지만 쓸 수 없다**

```bash
cd $S/consumer-C && npm install "git+file://$S/fake-C#v0.0.1"
# added 1 package, and audited 2 packages in 2s
find node_modules/pleiades -maxdepth 4 | sort
```
```
node_modules/pleiades/package.json
node_modules/pleiades/packages/notify/package.json
node_modules/pleiades/packages/notify/src/index.ts
node_modules/pleiades/packages/notify/tsconfig.json
```
- 설치 이름이 **`pleiades`** 다 (`@pleiades/notify` 아님). `require('@pleiades/notify')` → `MODULE_NOT_FOUND`.
- **`prepare` 없음 → `dist` 없음.** `workspaces` 는 소비자 설치에서 전개되지 않는다.
- `private: true` 여도 **git 의존성 설치는 막히지 않았다** (publish 만 막는다).
- lockfile: `{"version":"0.0.1","resolved":"git+file://…/fake-C#eaecdf66…","workspaces":["packages/*"]}`

### (3) 서브디렉터리 지정 문법 — npm 10 에 **없다**

`npm help package-spec` (NPM@10.8.2, July 2024) 의 **git urls** 절 전문:
```
   git urls
       •   <git:// url>
       •   <github username>/<github project>

       Refers to a package in a git repo. This can be a full git url, git shorthand, or a
       username/package on GitHub. You can specify a git tag, branch, or other git ref by appending
       #ref.

       Examples:
       •   https://github.com/npm/cli.git
       •   git@github.com:npm/cli.git
       •   git+ssh://git@github.com/npm/cli#v6.0.0
       •   github:npm/cli#HEAD
       •   npm/cli#c12ea07
```
`npm help install` 의 URL 문법(`npm install <git remote url>`) 도 **서브디렉터리 성분이 없다**:
```
 <protocol>://[<user>[:<password>]@]<hostname>[:<port>][:][/]<path>[#<commit-ish> | #semver:<semver>]

<protocol> is one of git, git+ssh, git+http, git+https, or git+file.
```
`#<commit-ish>` 와 `#semver:<semver>` **둘뿐**이다.

문서 검색 (`npm help {install,package-spec,package-json,ci} | col -b | grep -iE 'subdirector|#path:|sub-?folder'`):

| man page | hit |
|---|---|
| `install` | 1 — tarball 내부 subfolder 설명(`The package contents should reside in a subfolder inside the tarball`). git spec 과 무관 |
| `package-spec` | **0** |
| `package-json` | 2 — `.npmignore` 설명. 무관 |
| `ci` | **0** |

실행으로도 확인:
```bash
npm install "git+file://$S/fake-A#path:packages/notify"
# → npm error ENOENT … /_cacache/tmp/git-clonekGIBXX/package.json   (path: 를 committish 로 먹고 루트를 봤다)
npm install "git+file://$S/fake-A/packages/notify#v0.0.1"
# → npm error fatal: '…/fake-A/packages/notify' does not appear to be a git repository
```

### (4) `prepare` 실행 조건 — 문서 + 실측

`npm help scripts` (Life Cycle Scripts › prepare):
```
•   NOTE: If a package being installed through git contains a prepare script, its
    dependencies and devDependencies will be installed, and the prepare script will be run,
    before the package is packaged and installed.
```
`npm help install` (`npm install <git remote url>`) 도 같은 문장을 반복한다:
```
If the package being installed contains a prepare script, its dependencies and
devDependencies will be installed, and the prepare script will be run, before the package is
packaged and installed.
```

**임시 디렉터리에서 돈다** — 격리 캐시로 재현(`--cache $S/npmcache --loglevel verbose --foreground-scripts`):
```
> @pleiades/notify@0.0.1 prepare
> npm --prefix packages/notify install && npm --prefix packages/notify run build
...
> @pleiades/notify@0.0.1 prepare
> tsc -p .
up to date, audited 2 packages in 956ms
npm verbose cwd …/scratchpad/gitdep/npmcache/_cacache/tmp/git-clone9axX7V
```
**devDependency 가 실제로 임시 설치됐다** — 빈 캐시에 typescript 가 들어왔다:
```bash
grep -rho '"key":"[^"]*typescript[^"]*"' $S/npmcache/_cacache/index-v5 | sort -u
# "key":"make-fetch-happen:request-cache:https://registry.npmjs.org/typescript"
# "key":"make-fetch-happen:request-cache:https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz"
du -sh $S/npmcache   # 19M
```
> **주의 — devDeps 는 클론 *루트* 의 것만 설치된다.** fake-B 루트에는 devDependencies 가 없고,
> typescript 는 루트 `prepare` 안의 `npm --prefix packages/notify install` 이 끌어왔다.
> 서브디렉터리 패키지의 devDeps 를 npm 이 알아서 설치해주지 않는다.

**lockfile — 커밋 해시로 핀된다:**
```json
"node_modules/@pleiades/notify": {
  "version": "0.0.1",
  "resolved": "git+file:///…/fake-B#e63696c268e92976ede31fbcfe1719ff79828baa"
}
```
`git -C $S/fake-B rev-parse v0.0.1^{commit}` → `e63696c268e92976ede31fbcfe1719ff79828baa` (**일치**). 루트 `dependencies` 에는 태그 표기(`#v0.0.1`)가 남는다. lockfileVersion 3.

**`npm ci` 에서도 돈다:**
```bash
rm -rf node_modules && npm ci --foreground-scripts
# > @pleiades/notify@0.0.1 build
# > tsc -p .
# added 1 package, and audited 2 packages in 4s
node -e "console.log(require('@pleiades/notify').hello)"   # notify
```

### (5) 소비자 측 `npm ci` 비용

| 시나리오 | real |
|---|---|
| `npm install <git dep>` (최초, 공유 캐시) | **5.24 s** |
| `npm ci` — **cold** 캐시 (`--cache $S/npmcache-ci`, 빈 디렉터리) | **4.74 s** (캐시 19 MB 적재) |
| `npm ci` — warm 캐시 1회차 | **4.05 s** |
| `npm ci` — warm 캐시 2회차 | **4.32 s** |
| **대조군** — git dep 없는 빈 consumer `npm ci` | **0.19 s** |

**cold 와 warm 차이가 0.4~0.7초뿐이다.** 비용의 본체는 tarball 다운로드가 아니라
**매 `npm ci` 마다 반복되는 클론 + devDeps 설치 + `tsc` 컴파일**이다. 설치 결과물은 16 KB.

---

## M2. Q28 — 형태별 자격 증명 (실제 public 저장소 `github.com/fomalhaut84/pleiades`)

`origin/dev` 에 루트 `package.json` 이 **없음**을 먼저 확인(`git cat-file -e origin/dev:package.json` → `does not exist`).
따라서 **세 형태 모두 "클론까지 성공 → 루트 `package.json` ENOENT"** 로 끝나야 접근이 된 것이다.

### (a) 기본 실행 — 세 형태 전부 클론 성공

```bash
cd $S/consumer-m2
npm install --dry-run --loglevel silly "<spec>" --cache $S/npmcache-t-<n>
```

| spec | EXIT | 종료 지점 |
|---|---|---|
| `github:fomalhaut84/pleiades#dev` | 254 | `ENOENT … /_cacache/tmp/git-cloneEmETWK/package.json` |
| `git+https://github.com/fomalhaut84/pleiades.git#dev` | 254 | `ENOENT … /git-cloneN3IOAk/package.json` |
| `git+ssh://git@github.com/fomalhaut84/pleiades.git#dev` | 254 | `ENOENT … /git-clonexKB2oS/package.json` |

**세 형태 모두 저장소 접근·클론에 성공했다.** 실패 원인은 오직 "루트에 `package.json` 이 없다"이다.

### (b) SSH 키 무력화 — **ssh 는 한 번도 호출되지 않는다**

먼저 무력화가 실제로 먹히는지 검증. `~/.ssh/config` 가 `Host github.com / IdentityFile ~/.ssh/id_ed25519` 를 갖고 있어
**`-F /dev/null` 없이는 차단되지 않았다**(첫 시도는 그대로 성공했다 — 방법론 함정):
```bash
env -u SSH_AUTH_SOCK GIT_SSH_COMMAND='ssh -o IdentitiesOnly=yes -o IdentityFile=/dev/null -o BatchMode=yes' \
  git ls-remote git@github.com:fomalhaut84/pleiades.git dev
# → 79cb890532f1f6ed5df28a8655d0e66944e8203c refs/heads/dev   ← 차단 실패

env -u SSH_AUTH_SOCK GIT_SSH_COMMAND='ssh -F /dev/null -o IdentitiesOnly=yes -o IdentityAgent=none \
  -o IdentityFile=/dev/null -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null' \
  git ls-remote git@github.com:fomalhaut84/pleiades.git dev
# → git@github.com: Permission denied (publickey).            ← 차단 성공
```

키 무력화 상태에서 npm 3종 재실행 → **세 형태 전부 (a) 와 동일하게 클론 성공**(같은 ENOENT).

더 강한 계측: `GIT_SSH_COMMAND` 를 **호출을 기록하고 반드시 실패하는 래퍼**(`$S/ssh-fail.sh`)로 바꿔 재실행.

| spec | **ssh 호출 횟수** | 결과 |
|---|---|---|
| `github:fomalhaut84/pleiades#dev` | **0** | 클론 성공(ENOENT 로 종료) |
| `git+https://…#dev` | **0** | 클론 성공 |
| `git+ssh://git@github.com/…#dev` | **0** | 클론 성공 |
| **대조군** `git ls-remote git@github.com:…` (npm 아님) | **2** | `fake ssh: denied` → 실패 |
| **대조군** `npm install git+ssh://git@example.invalid/x/y.git#main` (비-hosted) | **2** | `npm error command git --no-replace-objects ls-remote ssh://git@example.invalid/x/y.git` → 실패 |

```
SSH-ATTEMPT: -G -o SendEnv=GIT_PROTOCOL git@example.invalid
SSH-ATTEMPT: git@example.invalid git-upload-pack '/x/y.git'
```
→ **래퍼는 npm 의 git 자식 프로세스에 확실히 전달된다**(`npm help install` 의 인식 환경변수 목록에 `GIT_SSH_COMMAND` 가 있고,
`@npmcli/git/lib/opts.js` 는 `env: { ...finalGitEnv, ...process.env }` 로 통째 상속한다).
그럼에도 **GitHub-hosted spec 에서는 0회**다. 즉 **`git+ssh://` 라고 써도 npm 은 ssh 로 가지 않는다.**

### 근거 — pacote 소스 (`$(npm root -g)/npm/node_modules/pacote/lib/git.js`)

```js
// Fall back to SSH to support private repos
// NB: we always store the https url in resolved field if auth
// is present, otherwise ssh if the hosted type provides it
#resolvedFromHosted (hosted) {
  return this.#resolvedFromRepo(hosted.https && hosted.https()).catch(er => {
    if (er instanceof git.errors.GitPathspecError) { throw er }
    const ssh = hosted.sshurl && hosted.sshurl()
    if (!ssh || hosted.auth) { throw er }
    return this.#resolvedFromRepo(ssh)
  })
}
```
**https 우선 · ssh 는 catch 폴백.** 입력이 `github:` 이든 `git+https://` 든 `git+ssh://` 든 hosted 로 파싱되면 같은 경로다.

### (c) lockfile 함정 — `github:` 로 써도 `git+ssh://` 가 기록된다

같은 파일의 `repoUrl` 이 **resolved 필드용 URL 을 ssh 우선으로 만든다**:
```js
const repoUrl = (h, opts) =>
  h.sshurl && !(h.https && h.auth) && addGitPlus(h.sshurl(opts)) ||
  h.https && addGitPlus(h.https(opts))
```
실측 (`$S/consumer-lock`, 소형 public 저장소로 재현):
```bash
npm install "github:isaacs/inherits#v2.0.4"
```
```json
"node_modules/inherits": {
  "version": "2.0.4",
  "resolved": "git+ssh://git@github.com/isaacs/inherits.git#9a2c29400c6d491e0b7beefe0c32efa3b462545d"
}
```
그리고 **그 lockfile 로 키 없이 `npm ci` 가 된다**:
```bash
rm -rf node_modules
env -u SSH_AUTH_SOCK SSHLOG=… GIT_SSH_COMMAND=$S/ssh-fail.sh GIT_TERMINAL_PROMPT=0 \
  npm ci --cache $S/npmcache-ci2
# ssh 호출 횟수: 0
node -e "console.log('require ok:', typeof require('inherits'))"   # require ok: function
```

### Q28 결론

| 형태 | public 저장소에서 자격 증명 필요? | 실제 전송 |
|---|---|---|
| `github:fomalhaut84/pleiades#<tag>` | **불필요** | https |
| `git+https://github.com/fomalhaut84/pleiades.git#<tag>` | **불필요** | https |
| `git+ssh://git@github.com/fomalhaut84/pleiades.git#<tag>` | **불필요** | **https** (ssh 미호출) |

**세 형태의 실측 차이는 0 이다** — 적어도 저장소가 PUBLIC 이고 npm 10.8.2 인 동안은.
차이는 두 곳에만 남는다: (i) `package.json` 에 적히는 문자열, (ii) **https 가 막힌 망**에서는 ssh 폴백이 유일한 경로이므로 그때는 키가 필요하다.
lockfile 이 `git+ssh://` 를 적는 것은 **표기일 뿐 요구사항이 아니다.**

---

## M3. 소비자 측 호환 조건 (읽기 전용 · `repos/*` worktree · ref `integration/pleiades`)

측정 대상은 **모드 I** — `~/workspace/pleiades/repos/{myFinance,myFitness}` @ `integration/pleiades`
(fin `654215240cb3ddfa4c9bf0db3181c86642fee985` · fit `626a2016b30b9b79bc89ae7fb8080ea4d6187cbb`). 두 worktree 모두 **clean**, HEAD 가 `integration/pleiades`.
명령은 전부 `git -C <worktree> show integration/pleiades:<path>`.

### tsconfig — `exports.types` 를 볼 수 있는가

| 옵션 | myFinance | myFitness |
|---|---|---|
| `module` | `esnext` | `esnext` |
| **`moduleResolution`** | **`bundler`** | **`bundler`** |
| `target` | `ES2017` | `ES2017` |
| `esModuleInterop` | `true` | `true` |
| `strict` / `skipLibCheck` / `isolatedModules` / `allowJs` / `noEmit` | true / true / true / true / true | 동일 |
| `paths` | `{"@/*":["./src/*"]}` | 동일 |
| `jsx` | `preserve` | **`react-jsx`** |
| `include` 차이 | `.next/types/**/*.ts` | + `.next/dev/types/**/*.ts` |

**둘 다 `moduleResolution: bundler` → `exports` 맵의 `types` 조건을 읽는다.** 최상위 `types` 필드를 따로 둘 필요는 없다(둬도 무해).

**실증** — fin·fit 과 동일 옵션의 소비자에서 케이스 B 패키지를 타입 해석:
```bash
# consumer-B/tsconfig.json = 위 표의 fin/fit 옵션 복제
echo "import { hello } from '@pleiades/notify'; export const x: string = hello;" > src/use.ts
npx tsc --noEmit          # 오류 0
npx tsc --noEmit --traceResolution | grep pleiades
```
```
File '…/node_modules/@pleiades/notify/packages/notify/dist/index.d.ts' exists - use it as a name resolution result.
======== Module name '@pleiades/notify' was successfully resolved to
         '…/node_modules/@pleiades/notify/packages/notify/dist/index.d.ts' with Package ID
         '@pleiades/notify/packages/notify/dist/index.d.ts@0.0.1'. ========
```

### `type` · Next · `transpilePackages`

| 항목 | myFinance | myFitness |
|---|---|---|
| `package.json` `"type"` | **없음** (= CJS 기본) | **없음** |
| `next` | `^15.5.16` | `^16.2.6` |
| `react` | `^19.2.7` | `^19.2.5` |
| `typescript` (dev) | `^5` | `^5` |
| `engines` | **없음** | **없음** |
| `packageManager` | **없음** | **없음** |

`next.config.mjs` **원문 전체** (`transpilePackages` 없음 — 양쪽 다):
```js
// repos/myFinance @ integration/pleiades : next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
```
```js
// repos/myFitness @ integration/pleiades : next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```
→ **003 §8-1 정정 4 재확인:** 패키지가 컴파일된 JS(`dist/*.js`)를 배포하면 `transpilePackages` 를 건드릴 필요가 없고,
현재 두 파일 어디에도 그 키가 없으므로 **추가하려면 두 저장소 모두 코드 변경이 발생한다.** 배포 형태를 JS 로 두는 편이 변경 0 이다.

### Node 버전 — 서버 값은 **못 잼**

| 단서 | 결과 |
|---|---|
| `.nvmrc` | **없음** (양쪽 `does not exist in 'integration/pleiades'`) |
| `package.json` `engines` | **없음** (양쪽) |
| `ecosystem.config.js` | node 버전 지정 없음. `script: 'node_modules/.bin/next'`, `node_args: '--max-old-space-size=…'`, `NODE_ENV: production` 뿐 |
| `deploy/deploy.sh` | node 버전 지정 없음 |
| 간접 단서 | 두 저장소 `build:mcp:staged` 가 `esbuild --target=node20` → **node 20 대를 가정하고 빌드한다** |
| 로컬 | node **v20.18.0** · npm **10.8.2** |

**서버의 실제 node/npm 버전은 코드에 없다 → 미확인.**

### `deploy.sh` 가 `npm ci` 를 쓴다 (M1-5 비용이 배포마다 발생)

```bash
# repos/myFinance:deploy/deploy.sh  (106행 부근)
echo "=== 3. Install dependencies ==="
npm ci
echo "=== 4. DB Migrate ==="
npx prisma migrate deploy
```
```bash
# repos/myFitness:deploy/deploy.sh  (49행 부근)
echo "=== 3. Install dependencies ==="
npm ci
echo "=== 4. DB Migrate + Generate ==="
npx prisma migrate deploy
npx prisma generate
```
→ **`prepare` 가 서버에서 매 배포마다 돈다.** 서버에 `git` 과 registry·github 네트워크가 필요하고,
`prepare` 실패는 곧 배포 실패다. `dist` 를 커밋해 `prepare` 를 없애는 선택지가 여기서 생긴다(가역성: 즉시, `files`/`.gitignore` 1줄).

### grammy — peerDependencies 범위

| | myFinance | myFitness |
|---|---|---|
| `package.json` spec | `^1.41.1` | `^1.42.0` |
| **lockfile 실제 설치본** | **1.44.0** | **1.42.0** |
| `grammy` 를 import 하는 src 파일 | **24** | **20** |

```bash
git -C repos/<d> grep --text -lE "from ['\"]grammy" integration/pleiades -- 'src' | wc -l
git -C repos/<d> show integration/pleiades:package-lock.json | python3 -c "…packages['node_modules/grammy']['version']"
```

semver 검증 (`npm` 번들 semver):
```
1.41.1 ^1.41.1 true  | 1.42.0 ^1.41.1 true | 1.44.0 ^1.41.1 true
1.41.1 ^1.42.0 false
```
→ **양쪽을 모두 만족하는 peer 표기는 `"grammy": "^1.41.1"`** (= `>=1.41.1 <2.0.0`). `^1.42.0` 으로 적으면 fin 의 **선언 spec** 하한(`1.41.1`)을 배제한다
— 현재 설치본(1.44.0)은 통과하지만 fin 이 lockfile 을 되돌리면 peer 경고가 난다. 하한은 **1.41.1** 로 둔다.

---

## 못 잰 값

| 항목 | 왜 못 쟀나 |
|---|---|
| **서버 node / npm 버전** | 코드에 핀이 없다(`.nvmrc`·`engines`·`ecosystem.config.js`·`deploy.sh` 전부 무지정). 서버 접속은 이 에이전트 범위 밖 |
| **서버의 github.com https 아웃바운드 허용 여부** | 로컬에서 확인 불가. 이것이 막히면 M2 결론(키 불필요)이 뒤집혀 **ssh 폴백 = 키 필요**가 된다 |
| **서버에 git 이 설치돼 있는지 / 배포 사용자에게 ssh 키가 있는지** | 동일 |
| **PRIVATE 저장소일 때의 동작** | pleiades 는 현재 PUBLIC. private 전환 시 https 는 인증이 필요해 ssh 폴백이 실제로 발동한다 — 그때 재측정해야 한다 |
| **npm 11/12 에서의 동일 동작** | 로컬은 10.8.2. npm 12.0.2 가 나와 있다(설치 중 notice). pacote 의 https-우선 로직이 유지되는지는 미확인 |
| **실제 `@pleiades/notify` 로 두 저장소를 빌드했을 때의 `npm ci` 시간** | 대상 저장소에 쓰기·설치 금지. 측정치는 **더미 패키지 기준**(4.0~4.7초)이며 실제 패키지 크기·의존에 따라 달라진다 |
| **`prepare` 없이 `dist` 를 커밋한 변형의 비용** | 더미로 재현하지 않았다(범위 밖). M1-5 대조군 0.19초가 하한 근사 |
| **fin `experimental.instrumentationHook` 이 패키지 로딩에 주는 영향** | 런타임 데이터 필요 |

## 재현 자료 (지우지 않음)

`/private/tmp/claude-501/-Users-sagan-workspace-pleiades/d1f70559-c2f7-4d4a-b5e2-13a0bf58b65a/scratchpad/gitdep/`
- `fake-A/` `fake-B/` `fake-C/` — 더미 git 저장소 (각 tag `v0.0.1`)
- `consumer-A/` `consumer-B/` `consumer-C/` `consumer-m2/` `consumer-lock/` `consumer-empty/`
- `ssh-fail.sh` — 호출 기록 + 항상 실패하는 ssh 래퍼 · `sshlog-*.txt`
- `verbose-install.log` · `m2-{github,https,ssh}.log` · `m2-trace-*.log` · `m2-nokey-*.log` · `m2-wrap-*.log`
- `npmcache*/` — 격리 캐시 (typescript 적재 증거)
