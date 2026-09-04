# 측정 — 두 저장소를 pleiades 하위로 옮기는 안 (변형 A)

측정일 2026-09-04 · 측정 환경 macOS(darwin 25.6.0)
대상: **변형 A = 로컬 디렉터리 배치만.** `pleiades/repos/{myFinance,myFitness}` 에
**독립 git 저장소**로 배치. 원격·배포·릴리즈 격리 유지.
변형 B(진짜 모노레포)는 003 §2 가 이미 다뤘으므로 재측정하지 않았다.

## 측정 시점 저장소 상태

```bash
for d in myFinance myFitness; do
  git -C ~/workspace/$d branch --show-current
  git -C ~/workspace/$d status --porcelain | wc -l
  git -C ~/workspace/$d log -1 --format='%h %ad %s' --date=short
  git -C ~/workspace/$d stash list | wc -l
done
```

| | myFinance | myFitness |
|---|---|---|
| 브랜치 | `integration/pleiades` | `integration/pleiades` |
| dirty | 0 | 0 |
| HEAD | `c549fa6` (2026-08-27) | **`ac034be` (2026-09-04)** ← 2026-09-03 측정의 `2625600` 에서 이동 |
| `git stash list` | **0건** | **0건** |
| worktree | 1개 (본체만) | 1개 (본체만) |
| submodule (`.gitmodules`) | 없음 | 없음 |

---

# M1. clone 으로는 따라오지 않는 것

## M1-1. untracked (ignore 되지 않은) 파일

```bash
git -C ~/workspace/$d status --porcelain --untracked-files=all
```

| | myFinance | myFitness |
|---|---|---|
| untracked 파일 | **0** | **0** |

→ 소스로 보이는 untracked 파일 없음. 이 축의 위험은 0.

## M1-2. gitignore 된 파일 — 전수

```bash
git -C ~/workspace/$d ls-files --others --ignored --exclude-standard --directory
```

**myFinance**

| 경로 | 크기 | clone 후 |
|---|---|---|
| `.env` | 332 B | **수동 복사** |
| `.claude/settings.local.json` | 17,469 B | **수동 복사** |
| `node_modules/` | 38,795 files / 822 M | `npm ci` |
| `.next/` | 881 files / 1.1 G | `npm run build` |
| `dist/` | 2 files / 13 M | `npm run build` |
| `coverage/` | 68 files / 1.8 M | `npm run test:coverage` |
| `next-env.d.ts` · `tsconfig.tsbuildinfo` · `docs/**/.DS_Store` | 262 B · 289 KB · 26 KB | 자동 재생성 |

**myFitness**

| 경로 | 크기 | clone 후 |
|---|---|---|
| `.env` | 221 B | **수동 복사** |
| `.garmin-tokens/` (`oauth2_token.json` 2,839 B, `oauth1_token.json` 113 B) | 2 files / 8 K | **수동 복사** (또는 Garmin 재인증) |
| **`.claude/`** (agents 5 + rules 3 + skills 9 + settings.local.json) | **18 files / 104 K** | **수동 복사 — 없으면 하네스 전부 소실** |
| **`CLAUDE.md`** | 8,621 B | **수동 복사 — 없으면 프로젝트 규칙 소실** |
| `.vscode/settings.json` | 4 K | 수동 (내용 `{"jira-plugin.workingProject": ""}` 1줄, 사실상 무의미) |
| `src/generated/prisma/` | 25 files / 20 M | `npx prisma generate` (schema.prisma:3 `output = "../src/generated/prisma"`) |
| `node_modules/` | 43,402 files / 825 M | `npm ci` |
| `.next/` | 1,266 files / 286 M | `npm run build` |
| `dist/` | 3 files / 3.2 M | `npm run build` |
| `next-env.d.ts` · `tsconfig.tsbuildinfo` · `docs/**/.DS_Store` | 288 B · 215 KB · 20 KB | 자동 재생성 |

### 비대칭 — myFitness 만 하네스가 gitignore 되어 있다

```bash
diff <(cat ~/workspace/myFinance/.gitignore) <(cat ~/workspace/myFitness/.gitignore)
git -C ~/workspace/myFinance ls-files .claude | wc -l   # 16
git -C ~/workspace/myFitness ls-files .claude | wc -l   # 0
```

| | myFinance `.gitignore` | myFitness `.gitignore` |
|---|---|---|
| claude 섹션 | `.claude/settings.local.json` **1줄만** | `.claude/`, `CLAUDE.md`, `.runtime/` **3줄** |
| `.claude/` tracked 파일 | **16** (agents 4 + rules 5 + skills 7) | **0** |
| `CLAUDE.md` tracked | **예** | **아니오** |
| 추가 ignore | — | `.vscode/`, `.idea/`, `.garmin-tokens/`, `/src/generated/prisma` |

→ **myFinance 는 clone 하면 하네스가 따라온다. myFitness 는 따라오지 않는다.**
   measured-facts 의 "myFitness agents 5 / skills 9 / rules 3" 은 전부 로컬 전용 파일이다.

## M1-3. .env 키 — example 로 재구성 가능한가

```bash
grep -oE '^[A-Za-z_][A-Za-z0-9_]*' ~/workspace/$d/.env | sort -u          # 이름만. 값 미열람
comm -23 <(… .env 키) <(… .env.example 키)
```

| | myFinance | myFitness |
|---|---|---|
| `.env` 키 수 | 7 | 4 |
| `.env.example` 키 수 | 10 | 12 |
| **`.env` 에만 있고 example 에 없는 키** | **`NEXTAUTH_SECRET`, `NEXTAUTH_URL` (2개)** | **0개** |
| `.env` 키 이름 | `AUTH_PIN` `BASE_URL` `DATABASE_URL` `NEXTAUTH_SECRET` `NEXTAUTH_URL` `TELEGRAM_ALLOWED_CHAT_IDS` `TELEGRAM_BOT_TOKEN` | `DATABASE_URL` `GARMIN_EMAIL` `GARMIN_PASSWORD` `MFDS_API_KEY` |

값은 열람하지 않았다 (시크릿). 크기는 위 표.

→ myFinance 는 `cp .env.example .env` 로 복구하면 **`NEXTAUTH_SECRET`/`NEXTAUTH_URL` 이 조용히 빠진다.**
  `.env` 원본 복사가 유일하게 안전한 경로.

## M1-4. 로컬 전용 브랜치·커밋·태그

```bash
git -C ~/workspace/$d for-each-ref --format='%(refname:short) | upstream=%(upstream:short) | track=%(upstream:track)' refs/heads
git -C ~/workspace/$d log --oneline --branches --not --remotes=origin
git -C ~/workspace/$d rev-list --count "$b" --not --remotes=origin   # 브랜치별
comm -23 <(git tag|sort) <(git ls-remote --tags origin | sed 's|.*refs/tags/||;s|\^{}||'|sort -u)
```

**upstream 없는 로컬 전용 브랜치**

| 저장소 | 브랜치 | origin 에 없는 커밋 수 |
|---|---|---|
| myFinance | `integration/pleiades` | **0** (오늘 생성, dev 와 같은 커밋) |
| myFitness | `integration/pleiades` | **0** (오늘 생성) |

**origin 어디에도 없는 커밋 — 전체 3개**

| 저장소 | 브랜치 | 커밋 |
|---|---|---|
| myFinance | `feat/45-error-loading` (ahead 1) | `0e662df docs: Phase 6-C 에러 바운더리 + 로딩 상태 완료 체크` |
| myFitness | `fix/261-2` (upstream **gone**) | `54c2f57 fix(activities): 태그 매칭 쿼리 슬림 select + take 상한 (#261)` |
| myFitness | `fix/261-2` | `84086b8 fix(activities): 러닝 후보 쿼리에 distance 프리필터 추가 (#261)` |

로컬 전용 태그: **양쪽 0개.**

→ **clone 하면 이 3개 커밋과 `integration/pleiades` 브랜치 이름 2개가 사라진다.**
  단 `integration/pleiades` 는 커밋 0개라 이름만 재생성하면 되고,
  나머지 3커밋은 `fix/261-2` 는 upstream 삭제(gone)·`feat/45` 는 오래된 docs 커밋 — 실질 손실은 작다.
  그래도 **clone 전에 push 하거나, clone 대신 `mv` 를 쓰면 0.**

---

# M2. 디스크·소요

```bash
du -sh ~/workspace/$d/{.git,node_modules,.next,dist,coverage} ~/workspace/$d
git -C ~/workspace/$d ls-files | while read f; do stat -f%z "$f"; done | awk '{s+=$1} END {print s}'
df -h ~
```

| 항목 | myFinance | myFitness | 합계 |
|---|---|---|---|
| `.git` | 16 MB | 32 MB | 48 MB |
| tracked 워킹트리 | 733 files / **8.6 MB** | 396 files / **2.9 MB** | 11.5 MB |
| `node_modules` | 822 MB | 825 MB | 1.65 GB |
| `.next` | **1.1 GB** | 286 MB | 1.39 GB |
| `dist` | 13 MB | 3.2 MB | 16 MB |
| `coverage` | 1.8 MB | 없음 | 1.8 MB |
| ignore 되었지만 필요 (`.env`·토큰·`.claude`) | 18 KB | 132 KB | 150 KB |
| `src/generated/prisma` | — | 20 MB | 20 MB |
| **디렉터리 총계** | **1.9 GB** (1,960.7 MB) | **1.1 GB** (1,169.5 MB) | **3.06 GB** |

**디스크 여유**

```bash
df -h ~
# /dev/disk3s5  926Gi  856Gi  21Gi  98%  /System/Volumes/Data
```

| | 값 |
|---|---|
| 전체 | 926 GiB |
| 사용 | 856 GiB |
| **여유** | **21 GiB (capacity 98%)** |

**두 방식의 디스크 비용**

| 방식 | 즉시 | `npm ci` 후 | `build` 후 | 여유 잔량 |
|---|---|---|---|---|
| **`mv` (이동)** | **0** | 0 | 0 | 21 GiB 유지 |
| **`git clone` (복제, 원본 유지)** | +59.5 MB (`.git` 48 + tracked 11.5) | +1.65 GB | +1.4 GB → **총 +3.06 GB** | 약 **18 GiB** |

→ 절대량은 문제 아니나 **capacity 98% 에서 3 GB 를 더 쓰는 것**은 부담.
  clone 은 `.git`·`node_modules`·`.next` 를 통째로 두 벌 갖는 것이다.
  `mv` 는 디스크 비용 0 이고 M1 의 ignored 파일·로컬 커밋 문제도 전부 사라진다.

---

# M3. 절대 경로 의존

```bash
grep -rn -- "/workspace/myFinance\|/workspace/myFitness\|~/workspace\|/Users/sagan\|\$HOME/workspace" \
  ~/workspace/$d --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
  --exclude-dir=dist --exclude-dir=coverage
```

**두 저장소 전체에서 로컬 절대 경로 하드코딩 = 6곳, 전부 myFinance `.claude/settings.local.json`**

| 파일:줄 | 내용 |
|---|---|
| `.claude/settings.local.json:22` | `Bash(git -C /Users/sagan/workspace/myFinance status --short)` |
| `.claude/settings.local.json:43` | `Bash(chmod +x /Users/sagan/workspace/myFinance/scripts/backup-db.sh)` |
| `.claude/settings.local.json:44` | `Bash(chmod +x /Users/sagan/workspace/myFinance/scripts/restore-db.sh)` |
| `.claude/settings.local.json:102` | `Bash(open /Users/sagan/workspace/myFinance/docs/designs/387-custom-strategy-web-ui/prototype.html)` |
| `.claude/settings.local.json:103` | `Bash(open /Users/sagan/workspace/myFinance/docs/designs/396-alert-config-ui/prototype.html)` |
| `.claude/settings.local.json:112` | `Bash(bash -n /Users/sagan/workspace/myFinance/deploy/deploy.sh)` |

```bash
node -e "const s=require('.../.claude/settings.local.json'); console.log((s.permissions.allow||[]).length)"
```

| | allow 항목 수 | 절대경로 포함 | 비율 |
|---|---|---|---|
| myFinance | 150 | **6** | 4.0% |
| myFitness | 105 | **1** | 1.0% |

**myFitness 소스·설정 전체: 0건.**

깨지는 것: 이 6개 허용 규칙이 매칭 실패 → **권한 프롬프트가 다시 뜬다.** 앱은 안 깨진다.

## 경로 무관함이 확인된 것

| 대상 | 실측 | 판정 |
|---|---|---|
| `ecosystem.config.js` (myFinance) | `cwd: __dirname` × 3 (`:7,:21,:46`) | **이식 가능** |
| `ecosystem.config.js` (myFitness) | `cwd: '/home/nasty68/myFitness'` × 3 (`:7,:23,:73`) | **서버 경로. 로컬 이동과 무관** |
| `tsconfig.json` paths | 양쪽 `"@/*": ["./src/*"]` — 상대 | 이식 가능 |
| `next.config.mjs` | fin `{experimental:{instrumentationHook}}` / fit `{}` — 경로 없음 | 이식 가능 |
| `prisma.config.ts` | 양쪽 동일, `schema: "prisma/schema.prisma"` 상대 | 이식 가능 |
| `vitest.config.mts` (fin) | 경로 하드코딩 0 | 이식 가능 |
| 런타임 경로 해석 | 전부 `process.cwd()` / `__dirname` 기준 (fin 8곳, fit 9곳) | 이식 가능 |
| `.mcp.json` | **양쪽 다 없음** (MCP 설정은 `src/lib/ai/` 안) | 해당 없음 |
| 로컬 cron | `crontab -l` → `crontab: no crontab for sagan` (exit 1) | **없음** |
| launchd | `~/Library/LaunchAgents` 에 workspace 참조 0건 | **없음** |
| node-cron | fin `src/lib/cron.ts`·`bot/standalone.ts`·`bot/notifications/scheduler.ts`, fit `src/lib/cron.ts`·`bot/notifications/scheduler.ts` — **전부 앱 내부** | 경로 무관 |

유일한 env 탈출구: `myFinance/src/lib/ai/claude-advisor.ts:753`
`const projectRoot = process.env.MYFINANCE_ROOT ?? process.cwd()` — `.env` 에 `MYFINANCE_ROOT` 없음.

## pleiades 쪽에서 갱신해야 할 참조

```bash
grep -rn "workspace/myFinance\|workspace/myFitness" ~/workspace/pleiades --exclude-dir=.git | wc -l
```

| 위치 | 라인 수 | 처리 |
|---|---|---|
| `docs/research/measured-facts.md` | 16 | **측정 명령 — 고치면 재현 기록이 깨진다. 정정 블록으로 경로 변경만 명시** |
| `_workspace/03_auditor_notify.md` 등 `_workspace/**` | 20 | 과거 초안. **손대지 않는다** |
| `.claude/` (agents 3 + skills 2) | 5 | **갱신 필요** |
| `CLAUDE.md` | 3 | **갱신 필요** |
| `README.md` | 1 | **갱신 필요** |
| `docs/handoff/2026-09-03-from-myfinance.md` | 1 | 과거 기록. 손대지 않음 |
| auto memory (`~/.claude/projects/-Users-sagan-workspace-pleiades/memory/`) | 3 | **갱신 필요** |
| **합계** | **49** (그중 실제 갱신 대상 **12**) | |

---

# M4. 서버 배포가 로컬 경로에 묶여 있나 — **아니오**

```bash
grep -rn "rsync\|scp \|ssh \|sshpass" ~/workspace/$d --exclude-dir=node_modules \
  --exclude-dir=.next --exclude-dir=.git --exclude-dir=dist --exclude-dir=coverage | grep -v '\.md:'
```

| | myFinance | myFitness |
|---|---|---|
| `rsync` hit | **0** | **0** |
| `scp` hit | **0** | **0** |
| `ssh` hit (주석 제외) | **0** | **0** |

유일한 hit 는 양쪽 `.github/workflows/deploy.yml:4` 의 **주석** — 자동화 도입 *이전* 수동 절차 설명.

## 실제 배포 경로 (양쪽 동일 구조)

```
GitHub Release publish
  → .github/workflows/deploy.yml  (ubuntu-latest runner)
  → appleboy/ssh-action@v1.2.2  (host/user/key/port/fingerprint 전부 GitHub Secrets)
  → 서버에서:  cd "$DEPLOY_PATH"   ($DEPLOY_PATH = secrets.DEPLOY_PATH)
               git fetch origin --tags --force
               git checkout -f "$RELEASE_TAG"
               ./deploy/deploy.sh "$RELEASE_TAG"    → npm ci → prisma migrate → build → pm2
```

- 서버는 **GitHub 에서 직접 fetch** 한다. 로컬 머신은 배포 경로에 등장하지 않는다.
- 서버 경로는 `secrets.DEPLOY_PATH` (myFinance) / `cd /home/nasty68/myFitness` 하드코딩 (myFitness `deploy/deploy.sh:10`) — **둘 다 서버 파일시스템 기준**.
- 로컬에서 배포에 도달하는 유일한 접점은 `git push` + GitHub Release 생성. 둘 다 **cwd 가 저장소 안이기만 하면 되고 절대 경로 무관**.

→ **변형 A 는 배포를 깨지 않는다.** 이것이 이 측정에서 가장 확실한 결론.

---

# M5. 중첩 git 저장소 처리

## pleiades 현재 `.gitignore`

```bash
cat ~/workspace/pleiades/.gitignore
```

```
.DS_Store
node_modules/
*.log
_workspace_prev/
```

**`repos/` 항목 없음.** 즉 현재 상태로 하위에 저장소를 두면 무방비.

## 실증 — 스크래치패드에서 재현

```bash
mkdir -p $S/outer && cd $S/outer && git init && … commit
mkdir -p $S/outer/repos/inner && cd $S/outer/repos/inner && git init && … commit
git -C $S/outer status --short
git -C $S/outer add . && git -C $S/outer ls-files -s
echo "repos/" > $S/outer/.gitignore && git -C $S/outer reset && git -C $S/outer add . && git ls-files -s
git -C $S/outer add repos/inner
git -C $S/outer grep -l "x"
```

| 상황 | 실측 결과 |
|---|---|
| ignore 없이 `git status` | `?? repos/` |
| ignore 없이 `git add .` | `warning: adding embedded git repository: repos/inner` → 인덱스에 **`160000 5143f15… 0 repos/inner`** (gitlink). pleiades clone 시 **빈 디렉터리**가 됨 |
| `.gitignore` 에 `repos/` 추가 후 `git add .` | 인덱스에 `.gitignore`, `a.txt` 만. **repos/ 미포함** |
| ignore 상태에서 명시 `git add repos/inner` | `The following paths are ignored by one of your .gitignore files: repos` + `hint: Use -f` → **차단됨** |
| outer 에서 `git grep` | inner 파일 **미검색** (ignore 이전에도) |

→ **`.gitignore` 에 `repos/` 한 줄이면 충분하다. submodule 불필요.**
  submodule 을 쓰면 오히려 커밋 SHA 핀 고정·`--recurse-submodules` 요구가 생겨
  "독립 저장소 유지"라는 변형 A 의 전제를 깬다.
  방치했을 때의 실패 모드는 **mode 160000 gitlink 커밋** — 되돌리기는 `git rm --cached repos/<name>` 1줄.

---

# M6. 두 저장소에 이미 workspaces 흔적이 있나 — **없다**

```bash
node -e "console.log(JSON.stringify(require('.../package.json').workspaces ?? null))"
ls ~/workspace/$d | grep -iE 'lock|\.yarn|pnpm|npmrc'
node -e "console.log(require('.../package-lock.json').lockfileVersion)"
```

| | myFinance | myFitness |
|---|---|---|
| `workspaces` 필드 | **null** | **null** |
| 패키지 매니저 | npm | npm |
| lockfile | `package-lock.json` (393,371 B) | `package-lock.json` (352,306 B) |
| `lockfileVersion` | **3** | **3** |
| `pnpm-lock.yaml` / `yarn.lock` / `.npmrc` / `.yarn/` | 없음 | 없음 |
| `package.json` `name` | `myfinance` | `myfitness` |
| `package.json` `version` | `0.1.0` (릴리즈 버전은 git tag) | `0.1.0` (동상) |
| `overrides` 항목 수 | 3 | **13** |

→ 변형 A 에는 workspaces 가 필요 없다 (그게 변형 B). 흔적이 0이라는 것은
  **지금 `repos/` 밑에 두어도 npm 이 상위를 올려다보며 오작동할 여지가 없다**는 뜻.
  단 `overrides` 13 vs 3 은 변형 B 로 갈 때 병합 충돌 지점 — 이번 범위 밖.

---

# 부수 발견 — 변형 A 의 숨은 비용: Claude Code 프로젝트 상태가 경로로 키잉된다

```bash
ls -1 ~/.claude/projects/ | grep -i "myF\|pleiades"
du -sh ~/.claude/projects/<key>; ls <key>/*.jsonl | wc -l; ls <key>/memory/*.md | wc -l
# 키가 cwd 경로 파생인지 검증 — 세션 jsonl 의 cwd 필드와 키 문자열 대조
for k in $(ls ~/.claude/projects); do … head -5 $k/*.jsonl | jq -r .cwd … ; done   # MISMATCH 0건
```

| 프로젝트 키 | 총 크기 | 세션 `.jsonl` | memory 토픽 |
|---|---|---|---|
| `-Users-sagan-workspace-myFinance` | **113 MB** | 7 | **38** |
| `-Users-sagan-workspace-myFitness` | **141 MB** | 6 | **18** |
| `-Users-sagan-workspace-pleiades` | 6.4 MB | 2 | 4 |

키 9개 전수 검사에서 **키 ≠ cwd 경로 파생 사례 0건**.
(`-Users-sagan-workspace-knou_python` 처럼 `_` 는 보존, `/` → `-` 만 치환)

→ 디렉터리를 `~/workspace/pleiades/repos/myFinance` 로 옮기면 키가
  `-Users-sagan-workspace-pleiades-repos-myFinance` 로 바뀐다.
  **memory 토픽 56개 + 세션 히스토리 13개 (254 MB) 가 고아가 된다.**
  `docs/research/claude-code-mechanisms.md:33` 은 "`<project>` 는 git 저장소 기준으로 파생"이라고
  적었는데, 어느 규칙이든 **결과는 경로 문자열**이고 그 경로가 바뀐다. 회피는 두 가지:
  (a) 이동 후 `~/.claude/projects/` 디렉터리를 새 키 이름으로 `mv`
  (b) 각 저장소 `.claude/settings.json` 에 `autoMemoryDirectory` 를 절대 경로로 고정
  둘 다 **실증 미측정** — 실행 전 검증 필요.

---

# 못 잰 값

| 항목 | 왜 못 쟀나 |
|---|---|
| `.env` 값 (chat id, DB URL, 토큰) | 시크릿. 이름·크기만 측정 |
| `~/.claude/projects/` 키를 `mv` 했을 때 세션/메모리가 실제로 살아나는지 | 실행 검증 필요. 읽기 전용 측정 범위 밖 |
| `autoMemoryDirectory` 가 이동 후에도 memory 를 이어주는지 | 위와 동일 |
| pleiades 를 cwd 로 열었을 때 `repos/myFinance/.claude/skills` 가 자동 탐색되는지 | Claude Code 런타임 동작. 정적 측정 불가. `claude-code-mechanisms.md:125` 는 "패키지별 `.claude/skills/` 지원" 이라 적었으나 **이 저장소 배치에서 실증 안 됨** |
| GitHub Secrets 의 `DEPLOY_PATH` 실제 값 (myFinance) | 저장소에 없음. GitHub 설정 |
| 서버 파일시스템 상태 | 읽기 전용 규율상 서버 미접속 |
