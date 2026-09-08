# 04_operator_1a0 — 1a-0 집행 기록 · 롤백 (2026-09-08 · 이슈 #31)

**집행 대상: pleiades 저장소만.** 두 대상 저장소(`repos/*` · 원본)에는 쓰기 0. 서버 작업 0.
근거: `02_writer_1a0.md`(초안 3회차) · `03_auditor_1a0.md`(감사 3회) · 사용자 결정 4건(아래).

## 0. 사용자 결정 (2026-09-08)

| | 답 | 집행에 미친 것 |
|---|---|---|
| **Q47** | **ALT-d 위임형** — `workspaces` 없이 | 루트 `name:"pleiades"` · `private:true` · `main`/`types`/`exports`/`files`/`prepare` → `packages/notify/dist`. `peerDependencies` 미기재 |
| **Q44** | **γ 로컬 + β2 빈 스키마 사본** | 1a-0 에서는 집행 없음(서버 작업은 1a-3 과 함께 승인). 조건표는 003 §10-1 정정 |
| **Q46** | 별도 검증용 봇 토큰 발급 | 병행 인스턴스 기동 전 사용자 작업 |
| **Q45** | 보류 → 1a-3 전 | `engines` 미기재 유지 |

## 1. 집행 단계 (초안 4-3 · 실제)

| 단계 | 실행 | 결과 | 커밋 |
|---|---|---|---|
| E0 | Q47 확정 | ALT-d | — |
| E1 | 감사 3회차 | 정정 2(문안 4줄) → 직접 반영 | `6d8df37` |
| **E3** | 신규 7 + 수정 1 — 루트 `package.json` · `package-lock.json` · `packages/notify/{package.json,package-lock.json,tsconfig.json,src/index.ts,src/index.test.ts}` · `.gitignore` +1줄 | **초안은 신규 6** — `packages/notify/package-lock.json` 이 하나 더 생겼다(서브 `npm install` 산출물, `files` 밖이라 소비자 무영향). 커밋했다 — lockfile 을 ignore 하지 않는다 | `baceb96` |
| **E5** | `npm install`(루트) → `npm --prefix packages/notify install` → `npm run typecheck` → `npm test` → `npm run build` | typecheck exit 0 · vitest **4.1.11** `1 passed (1)` · build → `dist/index.js`+`index.d.ts`(ignored) · 루트 registry 패키지 **typescript 1개** · 서브 41 packages | — |
| **E4** | 스크래치패드 소비자(fin·fit 동일 tsconfig 옵션: `module esnext` · `moduleResolution bundler` · `target ES2017` · `"type"` 없음) `npm install git+file://…#baceb96` | 설치 트리 `packages/notify/dist` + `packages/notify/package.json` + README(npm 강제 포함) · **`src`·`tsconfig` 미포함** · `require('@pleiades/notify').VERSION` = `0.0.0` · `tsc --noEmit` exit 0 · lockfile `resolved` = `git+file://…#baceb967…`(커밋 SHA 핀) · **`npm ci` 2.13 / 2.18 / 2.35 s** · 설치 크기 20 K | — |
| E2 | 정본 정정 (003·004·CLAUDE.md·workflow.md 8절) | `decision-writer` — 이 파일 작성 시점에 진행 중 | (뒤 커밋) |
| E6 | 에이전트 사전 리뷰(9-0 "공개 인터페이스 — 두 저장소 동시 파급" 행) → PR base `dev` | 뒤 | — |

**초안과 달라진 점 2개 (범위 변경 아님):** ① 서브 `package-lock.json` 1개 추가(위) ② 서브 vitest 는 감사 재현의 `^2` 가 아니라 **`^4.1.8`** — fin 선언(`^4.1.8`)·003 1a-2 지시와 동일. 소비자 경로엔 실리지 않는다(E4 트리 확인).

## 2. E4·E5 명령 (재현)

```bash
# E5 — pleiades 루트
npm install --no-audit --no-fund                     # typescript 1개
npm --prefix packages/notify install --no-audit --no-fund   # vitest (41 packages) — workspaces 가 없어 필수
npm run typecheck && npm test && npm run build

# E4 — 스크래치패드 소비자 (fin·fit 동일 tsconfig 옵션)
# package.json: "dependencies": { "@pleiades/notify": "git+file:///Users/sagan/workspace/pleiades#<sha>" }
npm install --no-audit --no-fund
find node_modules/@pleiades/notify -maxdepth 3 -not -path '*/node_modules/*'
node -e "console.log(require('@pleiades/notify').VERSION)"
npx tsc -p .                                          # noEmit · bundler
for i in 1 2 3; do rm -rf node_modules; s=$(date +%s.%N); npm ci >/dev/null 2>&1; e=$(date +%s.%N); echo "$e - $s" | bc; done
```

## 3. 롤백

| 범위 | 등급 | 행위 |
|---|---|---|
| **1a-0 전체** | **즉시** | `git revert baceb96` (스캐폴딩) + 정본 정정 커밋 revert. 또는 브랜치 `feat/31-1` 폐기 — `dev` 무변경 |
| 스캐폴딩만 | **즉시** | 신규 7 삭제 + `.gitignore` 마지막 1줄 삭제. **루트 `package.json` 은 이 PR 이 신규 생성한 파일**이다(pleiades 에 원래 없었다 — 감사 3회차 정정 1) |
| 형태만 케이스 B 로 | **즉시** | 루트 `name` 1줄 |
| 로컬 산출물 | **즉시** | `rm -rf node_modules packages/notify/node_modules packages/notify/dist` |

**되돌릴 수 없는 것: 없음.** 두 저장소·서버·DB·텔레그램 무접촉.

## 4. 이 단계에서 하지 않은 것

- 서버 병행 인스턴스(β2)·DB 사본·env 배치 — Q44 확정만, 집행은 1a-3 과 함께 별도 승인
- 태그 `v0.1.0` — 소비자가 없다. 1a-3 착수 시
- `peerDependencies.grammy` · `engines` — 1a-1 · Q45 이후
- Q45 서버 측정 — 사용자 결정으로 보류
