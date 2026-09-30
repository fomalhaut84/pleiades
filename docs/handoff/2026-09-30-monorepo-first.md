# 인계 노트 — 2026-09-30, 방향 전환: 모노레포 먼저 · 서비스 무영향 (006)

직전 노트: `2026-09-28-dev-sync-policy.md`. **이 노트가 최신이다.**

## 이 세션에서 한 일

**대상 저장소 쓰기: myFitness 에 PR 4개(fit#501·fit#502(사용자)·fit#503 머지 · fit#504 닫음) + 브랜치 3개 push — 전부 방향 전환 *이전*, 사용자 승인 게이트 안에서. 방향 전환 이후 서비스 저장소 쓰기는 fit#504 닫기(동결 조치) 1건뿐. myFinance 쓰기 0. 서버·pm2·DB·텔레그램 무접촉.** (이 노트는 서비스 참조를 비링크 `fin#N`·`fit#N` 으로 적는다 — U97-9.)

1. `pleiades-resume` → 1a-3 준비 착수.
2. **#85 → PR #86 `8bd0cf9`** — `VERSION` 상수 삭제(#48 I1 · 소비자 임시 클론엔 `@types/node` 가 없어 package.json 주입 불가) · 버전 0.1.0 · 버전 단일 출처 테스트(package.json 2 + lock 2 × 최상위/`packages[""]`).
3. **릴리즈 PR #87 닫음 → #88 → PR #89 `b539bac`** — 사용자 결정: **첫 릴리즈는 두 저장소가 모노레포로 온전히 들어오고 Discord 통합 알림이 어느 정도 기능할 때.** 003 §1-1 정정 · Q48 신설 · `workflow.md` 릴리즈 절.
4. **#91 → PR #92 `051ab0e`** — Q45 서버 측정(사용자 실행): github https 200 · node v24.12.0 · npm 11.6.2 · git 2.53.0 · engine-strict false · 서버 1대.
5. **#90 → PR #93 `d9d1535`** — `ci.yml`(verify 20.x/24.x) · `security-audit.yml`(lock 2 · fail-closed · 직렬화 · 심각도 정렬) · **ruleset "main·dev 보호"(id 24220405)** — deletion · non_fast_forward · PR 필수(승인 0) · 필수 체크 verify 2 · bypass 없음 · `delete_branch_on_merge` · 보안 감사 첫 실행 success.
6. **1a-3 계획·감사**(`_workspace/1a-3/` — 계획 3회차 · 감사 2회 정정 10 → 7) → 사용자 결정(Q48 SHA 40자 · β2-I · 동작 변경 전부 · 등급 조건부 즉시) → 게이트 승인 → **#94 fit dev 동기화**: fit#501 **squash 머지됨** → 사용자가 fit#502 revert → fit#503 `-s ours` 로 조상 복구(`210e875`) → **1a-3 구현** fit#504(10파일 · 테스트 442 · 사전 리뷰 0/0/3 · 후속 #96).
7. **방향 전환 (사용자 2026-09-30)** — *"플레이아데스는 절대 지금 서비스중인 두 서비스를 어떤 목적으로도 영향을 주면 안되."* → fit#504 머지 없이 닫음 · #95 보류 · 서버 β2-I 취소 · 메모리 `feedback_service_isolation` 갱신.
8. **#97 → 006** — 실측 2회(`_workspace/006/01_*` · measured-facts) → 초안 3회 → 감사 2회(정정 19 → 11 · 마지막 직접 반영) → 사용자 결정 U97-1~12 → **PR #98 `588479d` 정본 `docs/specs/006-monorepo-first.md`**. Codex P1(가드 C 입력 소실 → `tools/import/STATE.json` + 결정적 재구성) · P2(1a-3 패치 보존 `_workspace/1a-3/patch/`) 반영.

## PR 현황 (전부 머지 · 열린 PR 0)

| PR | 내용 | 머지 | 되돌리기 |
|---|---|---|---|
| #86 | VERSION 삭제 · 0.1.0 | `8bd0cf9` | 즉시 |
| #87 | 릴리즈 v0.1.0 | **닫음** | — |
| #89 | 릴리즈 시점 결정 · Q48 | `b539bac` | 즉시 |
| #92 | Q45 기록 | `051ab0e` | 즉시 |
| #93 | CI · 보안 감사 | `d9d1535` | 즉시 (ruleset 은 Settings 에서 disable) |
| #98 | 006 정본 | `588479d` | 즉시 (문서) |
| fit#501 · #502 · #503 | fit dev 동기화 (squash → revert → `-s ours`) | `a2bc59a` · `f20228b` · `210e875` | **되돌리지 않는다**(트리 변화 0) |
| fit#504 | 1a-3 | **닫음** | — |

## 결정된 것 (사용자 2026-09-30)

| | 결정 | 정본 |
|---|---|---|
| 첫 릴리즈 시점 | 모노레포 흡수 + Discord 통합 알림 이후 | 003 §1-1 정정 · `workflow.md` 릴리즈 절 · #88 |
| **원칙** | pleiades 는 서비스에 어떤 목적으로도 영향을 주지 않는다 — 서비스 저장소 쓰기 0 · 운영 영향 0 · https 읽기의 traffic 흔적만 허용 | 006 §2 U97-6 · 메모리 |
| 가져오기 | **filter-repo 재작성**으로 `apps/{finance,fitness}` 이력째(subtree 탈락 — 이력 속 서비스 한정 참조가 push 시 서비스 타임라인에 지울 수 없는 이벤트) · 모든 링크 형식 → 비링크 · push 전 5형식 게이트 · 가드 A·B·C · `STATE.json` | 006 U97-5 · §4-2 |
| 수용·동결·첫 목표 | 서비스 dev 정기 수용(pleiades 안에서만) · 기존 산출물 동결 · 첫 목표 = 두 앱이 pleiades 에서 돈다(CI + 로컬 DB + 검증 봇) | 006 U97-2~4·7 |
| 로컬 DB | 기존 5432 에 `pleiades_fin`·`pleiades_fit`(서비스 기본값과 겹치지 않게 · 실효 env 사전 검사) | 006 U97-8 · L-1~L-9 |
| M-0 규칙 · M-1 설정 · 가드 C · lock | 새 발견은 pleiades 이슈에만 · 서비스 참조 비링크 · 차단 훅 · `claude-with` 소진 / filter-repo 2.47.0 핀 · `@멘션` 무해화 · 머지 커밋 트레일러 · draft / 가드 C 로 충분 / 앱별 lock | 006 U97-9~12 |

**바뀐 판단:** 002 단계 4(모노레포) 진입 조건 "도메인 #3" → **지금**. 003 의 git 의존성·Q48·β2·1a-3/1a-4 절차 → 모노레포 안 `file:` 의존성(M-5). 004 worktree·`workflow.md` 모드 I·dev 수용·#83 이관 정책 → 소진 예정(M-0).

## 결정되지 않은 것

| | 내용 | 언제 |
|---|---|---|
| 006 Q52 | CI 필수 체크·DB(Actions postgres 권고) | M-3 |
| 006 Q57 | `apps/*` 에서 서비스 결함 고치나(권고: 안 고침) | M-3 |
| 006 Q54 · Q54b | 동결 산출물 최종 처리(사용자 단독) · 수용 주기 | 낮음 |
| 006 Q59~Q61 | 단계 0 보류 · cutover 스펙 007 · 1b-2 스키마 | 첫 릴리즈 전 / M-6 |
| 미측정 | X4·X5·X6·X8(계정 쿼터)·X12~X15·U8 | 006 §3 |
| #66 · #48(I2·I3 → M-5a) · #17 · #11 · #96 | 이전 그대로 | — |

## 다음 세션의 첫 액션 후보

1. **M-0 (PR B)** — 006 §9 체크리스트: 002·003·004·005·`workflow.md`·스킬·에이전트 정정/소진 블록 · 격리 불변식 룰 · 차단 훅(`.claude/settings.json`) · `tools/import/`(callback · gate · 가드 · `VERSIONS` · `STATE.json` 스키마 · `claude` shim · env 검사 헬퍼) · `CLAUDE.md` 대상 저장소·하네스 절. 코드 무변경 · 되돌리기 **즉시**. 규모가 커서 PR 을 룰/스펙 · 도구 둘로 나누는 것을 검토.
2. M-1 (가져오기 · draft PR) — M-0 머지 후. 되돌리기: 트리 즉시 · 이력 **사실상 편도**(PR ref · 이벤트).
3. 사용자 준비물: M-4 전 **BotFather 검증 토큰 2개 + 검증 채팅**.

## 주의사항

- **원칙: 서비스 저장소(GitHub 포함)에 쓰지 않는다** — 브랜치·PR·이슈·코멘트 전부. 읽기(https fetch·`gh` GET)만. **pleiades 의 커밋 메시지·PR·이슈 본문에 `owner/repo#N`·서비스 URL 을 쓰지 않는다**(서비스 타임라인 이벤트 · 편도) — `fin#N`·`fit#N` 만. 저장소 *파일* 속 참조는 무해.
- **006 이 옛 룰보다 우선한다** — M-0 전까지 `workflow.md` 모드 I·dev 수용·`dual-repo-change`·`pleiades-resume` Step 2(동기화 판정)·`claude-with` 는 **실행하지 않는다**.
- **관측 상태(종료 시):** `repos/myFinance` = `integration/pleiades` `c94cbb8` clean · **`repos/myFitness` = `integration/feature-pleiades-1a-3` `fd8b7c5` clean**(1a-3 브랜치에 남아 있다 — 동결 · 되돌리기·정리는 Q54 사용자 단독 · pleiades 는 `repos/*` 에서 git 명령을 하지 않는다) · 원본 fin·fit 둘 다 `dev` clean.
- **pleiades ruleset** — `dev`·`main` 직접 push 불가 · CI 필수. 문서 PR 도 CI(~20 s) 통과 필요. CI 가 트리거 안 되면 PR close/reopen(이번 세션 #98 에서 1회).
- **squash 사고 2회**(fit#488 · fit#501) — 동기화 PR 은 merge commit. 006 가드 C 가 감지.
- 로컬 postgres 15 가 5432 에서 돈다(사용자 인스턴스) · 원본·worktree 에 `.env` 존재 — 복사 금지(006 L-2).
- fin `next build` 는 스키마 적용 DB 가 필요하다(fit 은 불필요) — measured-facts 1a-0 값은 fit 한정.
- 두 앱 advisor 는 봇 기동 시 로컬 `claude` 를 자동 실행한다(fit `CLAUDE_BIN` 빈 값 → PATH 폴백 · fin 하드코딩) — 006 L-7 shim.
- `MEMORY.md` 20줄(한도 200).

## 정정된 기록 — 옛 문서를 그 전제로 읽지 말 것

- *"1a-3 은 첫 태그로 참조"* → 첫 릴리즈는 모노레포 이후 · Q48 → 006 에서 `file:` 의존성으로 소진.
- *"β2(서버 병행 인스턴스)로 검증"* → 서버 사용 금지(원칙).
- *"`integration/pleiades` 는 배포 안 되니 서비스 무영향"* → 사용자 기준 아님(서비스 저장소 쓰기 자체가 영향).
- *"subtree 이력 포함"*(#97 최초 결정) → filter-repo 재작성으로 변경(U97-5).
- *"중첩 `.claude/`·`CLAUDE.md` 는 보이지 않는다"*(004 §3-2 · CLAUDE.md 하네스 절) → 그 디렉터리 파일을 읽으면 **지연 로드된다**(X10) — M-0 에서 정정.
- *"`next build` DB 요구 없음"* → fit 한정.

## 재현이 필요한 절차

- **동결 1a-3 재현** — `_workspace/1a-3/patch/` 0002·0003 → `apps/fitness` 에 `git am --directory=apps/fitness`(0001 은 버림) · 006 §4-6.
- **filter-repo 가져오기 실험** — `_workspace/006/scripts/x2*.sh` · 스크래치에서만.
- **CI 미트리거 복구** — `gh pr close <n> && gh pr reopen <n>`.
