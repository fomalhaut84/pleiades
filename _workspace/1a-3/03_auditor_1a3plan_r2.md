# 1a-3 계획 2회차 재감사 — `01_plan_1a3.md`(459줄) 반증

감사일 2026-09-30 · `reversibility-auditor`(읽기 전용 — 본문을 오케스트레이터가 저장). 기준 fit `integration/pleiades` `02707a3` · pleiades `origin/dev` `d9d1535`.
감사 후 fit worktree `status --porcelain` 0줄 · HEAD·`package.json` md5(`b291814d…`) 불변. 실행은 스크래치 `…/scratchpad/1a3-audit/m4`(`git archive integration/pleiades` + m3 의 notify 추가 `package.json`·lock)에서만.

## 판정 요약

- 1회차 정정 10 + info 1: **반영 확인 9 · 부분 1(N5)**.
- 새 정정 **7(블로커 1 · 비블로커 6)**. 블로커는 **β2-I 의 `.env` 확인 줄이 tracked `.env.example` 때문에 항상 거짓 중단**(한 줄).
- **M-15 · M-7 로컬 재현으로 닫힘** — 더미 URL `next build` exit 0 · Turbopack 이 웹 경로 import 패키지를 번들.
- 블로커가 명령 1줄이고 나머지는 문안 수준 → **직접 반영 후 게이트 가능 규모**(#37 선례).

## 1. 1회차 정정 반영

| 1회차 | 판정 | 근거 |
|---|---|---|
| B1 | 부분 → 새 블로커 R1 | 셸 `DATABASE_URL` 확인 · 더미 URL · 우회 금지 · 조건 #2·#8 문구는 맞다. 새 `.env` 확인 줄이 막힌다 |
| B2 | 확인 (+R6) | `git merge --no-ff origin/dev` 결과 트리 = `origin/integration/pleiades^{tree}`(`21ef21a4…`) |
| B3 | 확인 | 280 = 4×60(`bot/index.ts:30,39`)+40 · 600 = 10(`auto-adjust-cron.ts:161` `take:10`)×60 · 2,800 = 10×280 · 비율 4.67(= 280/60, 대상·청크 무관). 겹침 방지 옵션 없음(`scheduler.ts:111-118` `{ timezone }` 뿐) |
| N1 | 확인 (+R5) | 옛 `branches/dev/protection (404 = 보호 없음)` 이 표 칸에 취소선 없이 잔존 |
| N2 · N3 · N4 · N6 · N7 · I1 | 확인 | `runAutoAdjustMaintenance:166-169` · `auto-adjust-callback.ts:141,193,208` 등 |
| N5 | 부분 → R2 | §6·9-1′·9-2′ 반영, §10 에 반대 행 잔존 |

## 2. 스크래치 재현 — β2-I 교체본 순서대로 (m4 · node 20.18 / npm 10.8.2)

| 줄 | 결과 |
|---|---|
| `env \| grep -c DATABASE_URL` | 0 · 통과 |
| **`ls -a \| grep -c '^\.env'` → "0 이어야 한다"** | **1** — `.env.example`(fit tracked · `git ls-tree` 확인). 서버 클론에도 반드시 있어 **항상 중단** → **R1** |
| `npm ci --foreground-scripts` | exit 0 · 680 packages · 8 s · `dist/index.js` 존재 |
| `DATABASE_URL="$DUMMY_DB" npx prisma generate` | exit 0 (85 ms) |
| `DATABASE_URL="$DUMMY_DB" npm run build` | **exit 0 · 12.7 s** · DB 오류·`ECONNREFUSED` 0 · Turbopack 경고 4(`child_process.spawn` tracing). next → mcp → bot 완료. **M-15 로컬 닫힘**(1a-2 U4 "LISTEN 중이라 배제 불가" 도 해소). 서버 성공 여부(자원·npm 11)는 E9 |
| M-7 프로브 | m4 `admin-alerts.ts` 에 `import { createNotifier } from "@pleiades/notify"` + export 1줄 → `rm -rf .next dist && npx next build` exit 0 · `createNotifier` 가 `.next/server/chunks/[root-of-the-server]__….js` 에 번들. **`transpilePackages` 없이 CJS `dist` 번들 확인 · M-7 닫힘** |

## 3. 새 정정

### R1 (블로커) — `.env` 확인 줄이 항상 거짓 중단
`ls -a | grep -c '^\.env'` 는 `.env.example` 에 매치해 1. B1 이 막으려던 즉흥 판단 유형이다.
고침: `ls -a | grep -cE '^\.env(\.local|\.production|\.production\.local)?$'` = 0 (또는 `test ! -e .env`).

### R2 — N5 가 §10 에서 되돌려져 있다
§10 행 *"1a-1 산출물의 되돌리기가 중간으로 넘어갔음을 §8-1 에 기록"* 은 §6 새 행(pleiades revert 즉시 · fit 은 SHA 핀)과 모순. 그대로 E10 하면 1회차 오류가 정본에 들어간다.
고침: "SHA 핀이라 pleiades 쪽 즉시 유지 · fit 관측 동작은 fit PR 필요 · '1a-3 착수 전까지' 조건은 SHA 핀 아래 무의미해졌음을 §8-1 에 기록".

### R3 — `| tee` 가 exit code 를 가린다
pipefail 없으면 `$?` 는 tee 값. 명령 묶음 첫 줄 `set -o pipefail` 또는 각 줄 뒤 `echo "exit ${PIPESTATUS[0]}"`.

### R4 — 테스트 "신규 5" 는 고정값이 아니다
⑤(`first.ref` → `telegramMessageId`)는 E3 판정 조건부, ④는 호출부 4파일이라 1건이 아닐 수 있다. 게이트 문구: "신규 ①~⑤(⑤는 E3 판정 · 건수는 E5 실측 M-9)". 불변 9 + 의도 변경 2 = 11 은 확인.

### R5 — 닫힌 측정 stale 4곳
M-10 행 명령·실패 칸 · §0 "fit 빌드" 행 "인라인될 것(미측정 M-8)" · §3-2 행 2 "예상이며 미측정(M-3)" · §0 "로컬" 행 `@csstools/*`(실측 `entities@8.0.0`). 취소선/정정 표기.

### R6 — E0b 동기화 PR 게이트 누락
`dual-repo-change:193` 은 동기화 PR 에도 승인·검증·9-1·봇 적용. E0b 에 **사용자 승인**과 **9-3 봇 루프(또는 봇 불가 경로)** 가 빠짐. 1a-3 게이트로 묶어 받으면 9-2′ 에 명시.

### R7 — 9-2′ 롤백과 5-1 필수 항목 차이 3
1. 머지 후: `git -C repos/myFitness checkout integration/pleiades` 명시 + 로컬 revert 브랜치 삭제.
2. 상태 판정 표는 PR 마다 한 행 — E0b 행("되돌리지 않는다" + 사유) 추가.
3. 사전 사본 원칙: `notifier.ts`·`notifier.test.ts` 는 tracked → "해당 없음(사유: tracked · 이력 보존)" 명시.

## 4. 개정으로 새로 생긴 주장

| 주장 | 판정 |
|---|---|
| 2,800 s · 4.7배 · 기존 600 s > 300 s | 확인 |
| §2 #1 "대상당 청크 × 280 s" | 확인 — `sendToAll` 은 원래 재시도 있음, 늘어나는 것은 청크 수배뿐 |
| 불변 9 + 의도 변경 2 + 신규 5 | 11 확인 · 신규 5 는 R4 |
| 롤백 명령 순서 | 머지 전 확인 · 머지 후 R7-1 (`git revert <squash SHA>` 는 `-m` 불필요) |
| E0b 되돌리지 않음 | 확인 — 트리 변화 0, 되돌리면 다음 동기화가 같은 커밋을 다시 요구 |
| 게이트 5항목 | 형식 충족 · R1·R4·R6·R7 반영 필요 · 롤백 등급 = §6 등급 문구 일치 |
| U-8 문구 | 확인 (info: 후속 통합 커밋이 쌓이면 revert 충돌 가능 — 1a-2 도 같은 성질이라 조건으로 강제 안 함) |
| β2-I 고유 가치 "서버 자체" 로 축소 | 확인 |
| M-15 · M-7 | 로컬 닫힘으로 갱신 가능 (서버분은 E9) |

## 5. 사용자 결정 영향

- U-2: R1 미수정 시 서버 명령 매번 중단 · R3 미수정 시 성공/실패 판정 불가. M-15 로컬 결과는 가능성을 높이나 서버 자원·npm 11 은 미측정(M-6).
- U-3 ①②: 수치 코드와 일치 — 그대로 제시.
- U-8: 성립. §10 반대 행(R2) 고침 필요.
- E0b: 승인·봇 경로(R6)를 게이트에서 함께 확정.

## 6. 결론

1회차 정정 10 중 9 올바르게 반영 · N5 는 §10 반대 행 잔존. 새 수치·E0b 머지 형태·U-8 문구는 코드·규정과 맞다. 블로커 1(`.env` 확인 줄 거짓 중단) · 비블로커 6(§10 모순 · tee exit 은폐 · 신규 5 · stale 4곳 · E0b 승인/봇 · 롤백 재체크아웃/판정표). 고치면 게이트로 가도 된다. M-15·M-7 로컬 닫힘.
