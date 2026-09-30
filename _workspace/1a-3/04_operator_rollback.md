# 04 — operator 롤백 절차: 1a-3 myFitness `send.ts` → `@pleiades/notify` 교체

**집행일:** 2026-09-30 (초안 — PR 오픈 전)
**이슈:** `fomalhaut84/pleiades#95` · **모드 I**(통합) · 계획 정본 `_workspace/1a-3/01_plan_1a3.md`(3회차) · 감사 `03_auditor_1a3plan.md` · `03_auditor_1a3plan_r2.md`
**범위:** `repos/myFitness` worktree **1개 저장소**. 원본 `~/workspace/myFitness` 무접촉(#80) · `repos/myFinance` 무접촉(1a-4 몫) · pleiades 코드 무변경(소비자가 `dev` 커밋 SHA 를 참조할 뿐 — Q48)
**되돌리기 등급:** **즉시 — `integration/pleiades` 미배포 · β2-R 미실행 동안 · 이후 중간** (U-8 · 003 §5-2 의 "중간" 과 다르다 — 정정은 E10)
**소요:** 이 저장소에 실작업 시간 기록이 없어 **등급으로 갈음한다**(005 R2). 참고 실측: worktree `npm ci` 1회 9.24 s

## 1. 상태 판정 표 (5-1 필수 항목 1 · PR 마다 한 행)

| PR | 머지 여부 · SHA | 배포·재시작 여부 | 원본 도달 | 의존성 변경 |
|---|---|---|---|---|
| **E0b** myFitness#501 `integration/chore-pleiades-sync-20260930` | 머지 — **squash** `a2bc59a`(부모 1 · 규정 위반 형태) | 없음 | 없음 | 없음 — 트리 변화 0 |
| **E0b** myFitness#502 (#501 revert) | 머지 `f20228b` | 없음 | 없음 | 없음 |
| **E0b** myFitness#503 `integration/chore-pleiades-sync-20260930-ancestry` | 머지 — merge commit `210e875`(부모 2: `f20228b` · `10e5f30`[= `-s ours` 머지 · 부모 `f20228b` · `a984b85`(dev)]) · 이후 `rev-list --count origin/integration/pleiades..origin/dev` = **0** | 없음 | 없음 | 없음 — **되돌리지 않는다** (아래 §3) |
| **1a-3** myFitness#`<pr>` `integration/feature-pleiades-1a-3` | **미머지** (커밋 3 · push 전) → 머지 후 `<머지 SHA>`(squash 1커밋) | 없음(미배포 · fit `deploy.yml` = `release.published`·`workflow_dispatch(tag)`) · β2-I(U-2)는 서버 별도 디렉터리 · 프로세스 0 | 없음 (#80) | **있음** — `dependencies` `@pleiades/notify` +1 · lock 782 → 783 · 되돌리면 `npm ci` |

**E0b 경위.** 동기화 PR #501 이 squash 로 머지돼 `dev` 가 조상이 되지 못했다(myFitness#488 과 같은 유형). #502 로 되돌리고 #503 에서 `git merge -s ours --no-ff origin/dev` 를 merge commit 으로 얹어 조상을 복구했다(#75 · myFitness#489 형태). 세 PR 모두 트리 변화 0 이고 결과 base = `210e875`.

**1a-3 브랜치 커밋 (push 전 · 머지 시 squash 1커밋으로 합쳐진다):**

| SHA | 내용 |
|---|---|
| `30da0fd` | `build(deps)` — `package.json` +1줄 · `package-lock.json` +7줄(엔트리 +1) |
| `caf327a` | `test(notify)` — `send.test.ts` → `notifier.test.ts` 순수 rename (이력 연결) |
| `fd8b7c5` | `feat(notify)` — `notifier.ts` 신규 · `send.ts` 삭제 · 호출부 4파일(호출 6) · 테스트 이식 11 + 신규 9 |

## 2. 롤백 — 세 시점 (5-1 필수 항목 2)

### 머지 전 (현재 상태)

```bash
cd /Users/sagan/workspace/pleiades/repos/myFitness
gh pr close <pr> -R fomalhaut84/myFitness --delete-branch    # PR 을 열었다면 — 열린 PR 닫기 + 원격 브랜치 삭제
git checkout integration/pleiades
git branch -D integration/feature-pleiades-1a-3              # 로컬 브랜치
npm ci                                                       # node_modules 에서 @pleiades/notify 제거 (lock 782)
npx prisma generate                                          # fit 8절 선행
# → 8절 4종: npm run lint · npm run typecheck · npm run test · npm run build
```

push 전이면 `gh pr close` 줄은 해당 없음. **bare `git stash` 는 쓰지 않는다** — worktree 가 스택을 공유한다.

### 머지 후

`integration/pleiades` 에 직접 revert·push 하지 않는다 — **revert 브랜치 → PR → 사용자 머지**.

```bash
cd /Users/sagan/workspace/pleiades/repos/myFitness
git checkout integration/pleiades && git pull --ff-only
git checkout -b integration/chore-pleiades-revert-1a-3
git revert --no-edit <머지 SHA>                              # squash 1커밋 → -m 불필요
git push -u origin integration/chore-pleiades-revert-1a-3
gh pr create -R fomalhaut84/myFitness --base integration/pleiades --head integration/chore-pleiades-revert-1a-3 \
  --title "revert: 1a-3 send.ts → @pleiades/notify 교체 되돌림 (pleiades#95)" \
  --body "Refs fomalhaut84/pleiades#95 · 되돌리기: 즉시 (미배포 · β2-R 미실행)"
# → 사용자 머지 후
git checkout integration/pleiades && git pull --ff-only
git branch -D integration/chore-pleiades-revert-1a-3
npm ci && npx prisma generate
# → 8절 4종
```

revert 는 `send.ts`(124줄)·`send.test.ts`(baseline 11)·`scheduler.ts` re-export 를 복원하고 `notifier.ts`·`notifier.test.ts` 를 지운다(tracked · 이력 보존). **DB 무변경** — `telegramMessageId` 에 저장되는 문자열은 교체 전후 동일(`String(message_id)`), 스키마 무변경.

**중간으로 올라가는 조건:** `integration/pleiades` 가 배포 경로에 들어가거나 β2-R 병행 인스턴스(`myfitness-int-bot`)가 이 코드로 돌기 시작하면, 위 행위에 서버 `npm ci` + `npm run build` + `pm2 restart <그 인스턴스>`(실행은 사용자)가 붙는다. 실서비스 pm2 6개는 이 경로와 무관하다.

**충돌 가능성(info · 감사 r2):** 머지 후 `integration/pleiades` 에 같은 파일을 건드리는 커밋이 쌓이면 revert 가 충돌할 수 있다 — 1a-2 와 같은 성질.

### 원본 도달분

**없음** (#80 — pleiades 는 원본 `~/workspace/myFitness` 에 쓰지 않는다. 미러 없음 · `git archive` 동기화 없음).

### 부가 — 서버 · pleiades 쪽

| 대상 | 행위 | 등급 |
|---|---|---|
| **β2-I 를 했으면** (U-2 · 사용자 실행) | 서버 `rm -rf ~/pleiades-int` (사용자) | 즉시 |
| β2-R | **미실행**(U-2 · U-6 γ-live 도 안 함) — 했다면 `pm2 delete myfitness-int-bot` · `DROP DATABASE myfitness_int` · 검증 env 정리 / 이미 나간 메시지 불가 | (중간) |
| pleiades 코드 revert | 1a-3 은 pleiades 코드를 바꾸지 않았다. 이후 pleiades `dev` 의 패키지 커밋을 revert 해도 **fit 은 SHA 로 핀돼 있어 영향 0** | 즉시 |
| fit 이 받은 패키지 동작만 되돌림 | fit PR 로 `package.json` SHA 한 줄 갱신 + `npm install` | 즉시 (미배포 동안) |

## 3. 원칙 (5-1 필수 항목 3)

- **되돌리기도 PR 을 거친다** — 위 머지 후 절. `git revert` 전에 브랜치를 먼저 만든다.
- **SHA 는 실값** — 머지 후 `<머지 SHA>` · `<pr>` 을 채운다(PR #64 Codex P2).
- **사전 사본: 해당 없음** — 되돌리기가 지우는 `notifier.ts`·`notifier.test.ts` 는 **tracked** 이고 revert 가 이력을 보존한다(r2 R7-3). 워킹트리 전용(ignored) 파일 삭제 없음.
- **E0b 동기화 PR(#501·#502·#503)은 되돌리지 않는다** — 트리 변화 0 이고 목적은 `dev` 를 조상으로 들이는 것이다. 되돌리면 다음 동기화가 같은 커밋을 다시 요구한다.
- **등급은 원본 도달분까지 포함** — 원본 도달 0 이므로 등급 = 즉시(시점 한정). 승인 게이트(9-2′) 롤백 칸과 같은 내용이다.
- **되돌릴 수 없는 것:** 이미 찍힌 로그. (γ-live·β2-R 미실행이므로 나간 검증 메시지는 없다.)

## 4. 서비스 영향 — 없음

- 실서비스 pm2 6개(`myfitness`·`myfitness-bot`·`myfitness-mcp` 포함) **무접촉** · 재시작·빌드·세션 초기화 **불필요**.
- `integration/pleiades` 는 배포되지 않는다 · fit CI(`ci.yml`)·`security-audit.yml` 은 `dev`/`main` 만.
- 로컬 `npm install`·`npm ci`·`npm run build` 는 worktree 디스크만 바꿨다(`.next`·`dist`·`node_modules`·`src/generated` 는 gitignored).

## 5. 집행 중 실측 (measured-facts 반영 대상 · E10)

| 항목 | 값 |
|---|---|
| base | `integration/pleiades` = `210e875` · clean · `rev-list --count origin/integration/pleiades..origin/dev` = **0** |
| pin SHA | pleiades `origin/dev` = **`d9d15355039f5a2ef0871231f608abc72eb067c1`**(#93 머지) — 착수 시 재확인 일치 |
| `package.json` | 직접 편집 **+1줄**(정렬 위치 `@modelcontextprotocol/sdk` 뒤 · `@prisma/client` 앞) · `npm install` 뒤 표기 **유지**(`git+https://…#d9d1535…` · `github:` 정규화 없음) |
| lock | **782 → 783**(+1 · +7줄 · 제거 0) · 엔트리 `name: "pleiades"` · `version: "0.1.0"` · `resolved: "git+ssh://git@github.com/fomalhaut84/pleiades.git#d9d1535…"` — 감사 스크래치 예측과 일치 |
| `npm ci` 재현 (M-4) | `rm -rf node_modules && npm ci` **exit 0 · 9.24 s(1회)** · `node_modules/@pleiades/notify/packages/notify/dist/index.js` 존재 · `npm audit` 4건(2 moderate · 2 high — 도입 전 집합과 비교는 미측정) |
| baseline 녹색 (교체 전) | `send.test.ts` **11 passed** (deps 추가 직후) |
| RED | `notifier.test.ts` 가 `../notifier` 모듈 없음으로 실패 1회 확인 |
| 테스트 (M-9) | `notifier.test.ts` **20 passed** = 이식 11(불변 9 · 의도 변경 2) + 신규 9 · `npm run test` **exit 0** — vitest **63파일 442건**(= 433 − 11 + 20 · §4 규칙 ④ 일치) + verify 5종 |
| 신규 9 내역 | ① 키보드 파싱 실패 → plain + `reply_markup` 유지 · ② 키보드 + 5000자 → 키보드는 마지막 청크 · `first.ref` = 마지막 · ③ `ENOTFOUND` 재시도(`[bot] 전송 재시도 1/4`) · ④ 호출부 label 4건(scheduler ×2 · auto-adjust ×2 · auto-adjust-cron ×1 · admin-alerts ×1 — 호출 6 전부) · ⑤ `first.ref`/`target` → `telegramMessageId`/`ChatId` 저장 2건(auto-adjust · auto-adjust-cron) — **⑤는 호출부 단위 테스트로 가능 판정**(prisma·recommend·injury·daily-report·node-cron 모듈 mock) |
| ④ 변이 확인 | admin-alerts 호출에서 `BOT_NOTIFY_CTX` 를 빼면 해당 테스트 1건 실패 → 원복 |
| lint | `eslint src/ --max-warnings 0` **exit 0** |
| typecheck | `tsc --noEmit` **exit 0** |
| build | `npm run build` **exit 0** · 10.9 s(로컬 postgres 전제 그대로) |
| M-8 (봇 번들) | `grep -c createNotifier dist/bot/standalone.cjs` = **6** · `require("@pleiades/notify")` **0** → 인라인 |
| M-7 (웹 번들) | `createNotifier` 가 `.next/server/chunks/[root-of-the-server]__….js` 에 번들 — `admin-alerts` 경유 · `transpilePackages` 불필요 |
