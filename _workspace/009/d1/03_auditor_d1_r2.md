# 009 D-1 설계 2회차 재감사 — `02_writer_d1_r2.md` (#339 · 기준 `03_auditor_d1.md`)

감사일 2026-10-28 · `dev` `7d6248f` · reversibility-auditor(읽기 전용) · 오케스트레이터가 옮겨 적음.

## 1회차 정정 반영

6건(1·2·3·4·5·18) 전부 반영 · 보강 7·8·9·10·11·12·14·15·17·19 반영.

## 새 주장 판정

| # | 주장 | 판정 | 근거 | 정정안 |
|---|---|---|---|---|
| a1 | N15·H1 "PR-0 = 코드 0" | **정정 (경미)** | `git diff --stat v1.0.8 dev -- apps deploy .github package.json package-lock.json packages/notify tools` = 9파일 — `packages/notify/src/index.ts` +3(export `requestDiscord`·`defaultSleep`·타입 `PostConfig` · `28f6b3e`) 누락 · 런타임 무영향 · `tools/local` 4 로컬 전용 · `apps/`·`deploy/`·루트 lock 0 | "배포 동작 변경 0 — notify export +3" · 버전 근거에 포함 |
| a2 | 루트 `prepare` 는 chat 미빌드 · 루트 `npm ci` 가 `packages/chat` 아래 untracked 없음 | 확인 | `prepare` = `tsc -p packages/notify` 그대로 · `workspaces`·`postinstall` 없음(`package.json:1-25`) · 배포는 `build` 등 미호출(`deploy.sh:296-297,311-317`) · chat tsconfig 출력 `dist` 하나 · tsbuildinfo 없음 | — |
| a3 | PR-0 태그 → `v1.0.8` R-8 즉시·깨끗 | 확인 | chat 미빌드 → untracked 0 → `:279` 통과 | — |
| a4 | A3 첫 릴리즈 뒤 R-8 하한 = PR-0 태그 | 확인 | PR-0 태그에 `packages/chat/dist/` 무시 줄 · `node_modules/` | — |
| a5 | 자동 배포로 나가도 무해 | 확인 | A 단계 판정 전부 0(`:196-203`) · 두 앱 재기동 1 · IDENTIFY 각 +1 | — |
| b1 | 스모크 env 는 지우지 말고 덮는다 | 확인 | fin `standalone.ts:10` `dotenv/config` · dotenv 17.4.2 `main.js:383-384` 있는 키 미덮음 | — |
| b2 | `platformEnv` 빈 문자열 | **확인(키) · 정정 경미(`PLEIADES_ENV_FILE`)** | 키는 `fromProcess !== undefined` 면 그 값(`platform-env.ts:147-148`) → `ready` 거짓(`notifier.ts:132-140`) · **`PLEIADES_ENV_FILE=''` 은 `:77-78,84` 루트 탐색으로 떨어진다** · 없는 경로면 `{}`(`:115,129`) | `/dev/null` 등 비어 있지 않은 경로 · 정적 테스트가 빈 문자열 아님 검사 |
| b3 | M-7 확인 필요 | 해소 | b1·b2 | M-7 닫음 |
| c | §7 R-8 하한 표 | 확인 | a3·a4 · 1회차 14 · 정본 §6 머리 | — |
| d | N13 `:3723-3724` | **정정 (경미)** | node `:3724` · npm `:3725` | `:3724-3725` |
| e | 런북 crontab 없음 `:4288` | 확인 | — | — |
| f | 숫자 N1~N15 | 확인(d 제외) | — | — |

## 정정 개수

**3 — 전부 경미 · 블로커 0**(a1 · b2 · d). 문구 수준이라 오케스트레이터가 `02_writer_d1_r2.md` 에 직접 반영(끝 정정 블록) · 재감사 없음(009 3회차 선례).
