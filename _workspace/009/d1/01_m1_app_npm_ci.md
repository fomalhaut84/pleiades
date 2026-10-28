# M-1 — 앱 `npm ci` 가 `@pleiades/chat`(`file:`) 을 받는가 (009 D-1 · #339)

측정 2026-10-28 · `dev` `b659e5e`(v1.1.0) 의 스크래치 git worktree(pleiades 자신 · 작업트리 무변경). 로컬 node v20.18.0 · npm 10.8.2 / `npx npm@11.6.2`(서버 npm 메이저 · `measured-facts.md:3725`).

```bash
git worktree add --detach <scratch>/m1 dev && cd <scratch>/m1
npm ci && npm --prefix packages/chat ci                       # 루트 → notify dist · chat 링크
# apps/fitness/package.json dependencies 에 "@pleiades/chat": "file:../../packages/chat" 추가
(cd apps/fitness && npm install)                              # lock 갱신
(cd apps/fitness && rm -rf node_modules && npm ci)            # npm 10
(cd apps/fitness && rm -rf node_modules && npx -y npm@11.6.2 ci)   # npm 11
```

| 항목 | 결과 |
|---|---|
| npm 10 `npm install` | rc 0 · `null.edgesOut` 없음 |
| npm 10 `npm ci` | rc 0 · `node_modules/@pleiades/{chat,notify}` 링크 |
| npm 11.6.2 `npm ci` | rc 0 · 같음 |
| 앱 설치가 `packages/chat/node_modules` 를 건드리나 | 아니다 — 앱 lock 의 `../../packages/chat` 항목은 메타데이터만(링크 대상 의존을 설치하지 않음) · `git status` 는 앱 두 파일만 |
| fit lock 변경 | +17 −1 — chat 링크 항목 · `../../packages/notify` 의 `version` 이 `0.1.0` → `1.1.0`(기존 lock 의 낡은 값이 같이 갱신됨 · 동작 무관) |

**결론:** 앱 cwd 에 `.npmrc`(`legacy-peer-deps`) 우회는 **필요 없다** — `null.edgesOut` 은 chat 자신의 `npm ci`(peer 집합에 notify 링크) 경로에서만 났고(#332), 앱 쪽 링크 설치에서는 npm 10·11 모두 재현되지 않았다. 감사 [A]#7 의 R-new4 는 **소거**. PR-2·PR-3 범위에서 `apps/<dir>/.npmrc` 를 뺀다. chat 자신의 `npm ci`(`packages/chat/.npmrc`)는 서버에서도 필요하다 — `deploy.sh` 단계가 `npm --prefix packages/chat ci` 로 그 디렉터리의 `.npmrc` 를 읽는다(`--prefix` 는 그 디렉터리를 프로젝트로 삼는다 · `ci.yml:55` 24.x 통과가 대리 증거).
