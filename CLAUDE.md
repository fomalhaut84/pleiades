# CLAUDE.md

## Overview

**pleiades** — `myFinance` 와 `myFitness` 두 프로젝트를 어디까지 통합할지 검토하고, 결정된 범위를 실행하는 저장소.

**현재 상태: 방향 확정 · 단계 1(1a) 착수 대기.**
2026-09-03 에 Q1·Q4·Q5·Q6 이 답을 받아 방향이 정해졌고 — **개인 비서 플랫폼** —
같은 날 Q15·Q9·Q8·Q11 이 답을 받아 **단계 1 의 설계가 확정**됐다:
**git 의존성 배포 · 1a/1b 분할(1a → 1b) · L3 2층 인터페이스 · 혼합 운영 허용.**
정본 방향은 `docs/specs/002-platform-direction.md`, 단계 1 상세 설계는 `docs/specs/003-notify-package.md`.
001 은 분석 근거로 유효하나 권고 경로는 002 가 대체한다.

착수 전 남은 것: **Q10**(fit 절단→분할 · plain 폴백 정본, 1a 착수 전) ·
미확인 U1(myFitness vitest 의존성 resolve) · 1a-4 청구서 확정을 위한 정적 측정 1건 (003 §9).
그 뒤 미결: Q12(1b DB) · Q13(fit 관리자 alert) · Q14(실서비스 DB 읽기, 낮음) ·
Q7(DB 경계) · Q2(독립 배포) · Q3(봇 인바운드 통합).

## 대상 저장소

**통합 작업 소스는 `repos/` 아래 git worktree 로 있다** (2026-09-04 배치, 상세는 `docs/specs/004-repo-layout.md`).
저장소는 여전히 각각 하나다 — worktree 는 같은 저장소의 두 번째 작업 디렉터리이므로 **분기가 불가능하다.**

| 용도 | 경로 | 브랜치 | 성격 |
|---|---|---|---|
| **통합 작업** | `repos/myFinance` | **`integration/pleiades`** | worktree. **여기서 작업·커밋** |
| **통합 작업** | `repos/myFitness` | **`integration/pleiades`** | worktree. **여기서 작업·커밋** |
| 서비스 유지 | `~/workspace/myFinance` (v0.16.4) | `dev` | 원본. 핫픽스·단일 저장소 작업용 |
| 서비스 유지 | `~/workspace/myFitness` (v2.27.2) | `main` | 원본. 핫픽스·단일 저장소 작업용 |

**이 프로젝트의 작업은 `repos/` 아래에서만 한다.** 원본 두 경로는 이 프로젝트가 끝날 때까지
**서비스 유지용으로 남긴다** — 필요하면 읽기 전용으로 참고한다.
단계 작업은 `integration/pleiades-<단계>` 를 따서 PR 로 합친다 (003 §5-2 의 단계별 되돌리기 등급 보존).
`dev` 로의 PR 은 1a 전체가 끝난 뒤. `main` 직접 변경 금지. 롤백은 `_workspace/04_operator_rollback.md`.

`repos/` 는 pleiades `.gitignore` 에 등재돼 있다. 그 결과 **Grep 은 루트 검색에서 `repos/` 를 건너뛴다** —
두 저장소를 검색할 때는 **`path` 를 `repos/` 이하로 지정**해야 한다 (Glob·Read 는 영향 없음).

**하네스는 아직 통합되지 않았다.** 하위 디렉터리의 `.claude/skills`·`agents` 는 **로드되지 않으므로**
(`--add-dir` 로 붙였을 때만 보인다) `repos/*/.claude/` 는 현재 동작하지 않는다.
두 저장소 하네스(fin 16 tracked + fit 18 ignored)를 pleiades 로 모으는 것이 **002 단계 2** 이고,
이 배치의 선결 조건이다. 그때까지 저장소별 하네스가 필요하면 `--add-dir` 로 원본을 붙인다:

```bash
CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 \
  claude --add-dir ~/workspace/myFinance --add-dir ~/workspace/myFitness
```

주의: `--add-dir` 는 `--resume` 시 복원되지 않는다. 세션을 재개할 때마다 다시 넘겨야 한다.

## 문서 지도

| 파일 | 내용 | 언제 읽나 |
|---|---|---|
| `docs/handoff/` 의 최신 파일 | 직전 세션 인계 노트 (현재: `2026-09-03-direction-002.md`) | **새 세션 시작 시 먼저** |
| `docs/specs/002-platform-direction.md` | **정본 방향** — 개인 비서 플랫폼, 개정 경로 0~4, 확정된 답 | **방향 판단 시 먼저** |
| `docs/specs/003-notify-package.md` | **단계 1 상세 설계** — `@pleiades/notify`. 확정된 답 Q15·Q9·Q8·Q11, 발견 8~15, L3 인터페이스, 1a-0~1a-4 · 1b, 되돌리기 표, 제외 목록 | **단계 1 작업 시.** 002 를 대체하지 않는다 |
| `docs/specs/001-integration-master.md` | 축 A/B 분해·옵션·리스크 분석 (권고 경로는 002 가 대체) | 분석 근거가 필요할 때 |
| `docs/research/measured-facts.md` | 두 저장소 실측 데이터 (2026-09-03) | 숫자가 필요할 때. **재측정 전에 여기부터** |
| `docs/research/claude-code-mechanisms.md` | Claude Code 기능 조사 (메모리·세션·플러그인·모노레포) | 축 A 작업 시 |

## 핵심 전제 (여기서 벗어나면 재검토)

1. **통합은 두 개의 독립 축이다.** 축 A = 하네스·세션(코드 무변경), 축 B = 저장소·런타임. 따로 결정한다.
2. **되돌리기 비용 순으로 진행한다.** 값싸고 가역적인 것부터. 각 단계는 그 지점에서 멈춰도 손해가 없어야 한다.
3. **가장 큰 이득은 코드 통합 없이 나온다.** 두 MCP 서버가 이미 로컬 HTTP 로 상주 중이라, `mcp-config.json` 병합만으로 교차 도메인 AI 어드바이저가 된다.
4. **B2(모노레포)는 목표에 내장된 요구사항이다.** 001 은 "증거가 나오면"이라 했으나,
   목표가 "도메인을 계속 늘리는 플랫폼"으로 확정되면서 바뀌었다. 진입 조건은 **도메인 #3(캘린더)을 붙일 때**,
   그리고 병렬 조건으로 **1a 운영 중 패키지 수정 PR 2개짜리 왕복이 반복적으로 성가실 때** (003 §2-4).
   따라서 공유 패키지는 **처음부터 `packages/notify/`** — 모노레포에서 갖게 될 그 경로에 만든다 (003 §2-1).
5. **아웃바운드 알림과 인바운드 봇 명령은 비용이 다르다.** 아웃바운드는 어댑터 교체(초크포인트 1곳),
   인바운드는 재작성(210건). 인바운드를 저장소별로 각각 옮기지 않는다.

## 작업 규칙

- **기존 두 저장소에 쓰기 전 반드시 사용자 확인.** 둘 다 실서비스 중이다 (PM2 + Nginx, finance:4100 / fitness:4200).
- **작업은 `repos/` 아래 worktree 에서, 브랜치는 `integration/pleiades`.** 원본 `~/workspace/myF*` 는 서비스 유지용이므로 쓰기 금지 (위 표 참조).
- **절대경로 측정에는 반드시 `grep --binary-files=text`.** 없으면 `.next/cache` 같은 파일이 binary 로 판정돼 조용히 0건 오탐이 난다 (004).
- 새 옵션·단계를 제안할 때는 **되돌리기 비용을 항상 함께 적는다.** 이 저장소 문서의 일관된 형식이다.
- 실측값은 추정하지 않는다. `docs/research/measured-facts.md` 에 없으면 직접 측정하고 그 파일에 측정 명령과 함께 추가한다.
- 문서는 한국어. 코드·변수명·경로는 영어.
- **브랜치 전략은 gitflow.** `main`(정본) → `dev`(개발) → `<type>/<issue>-<n>`(작업).
  **작업 브랜치는 `dev` 에서 분기하고 `dev` 로 PR.** `main` 직접 push 금지. `main` 은 `dev` 에서만 받는다
- **모든 작업은 GitHub 이슈와 PR 이 1:1 로 매칭된다.** 이슈 없이 작업 브랜치를 만들지 않는다.
  PR 본문에 `Closes #<issue>` 를 넣어 자동으로 닫히게 한다
- 커밋: conventional commits — `<type>(<scope>): <desc> (#<issue>)`.
  원격 `origin` = `git@github.com:fomalhaut84/pleiades.git` (**PUBLIC**)
- **PR 머지는 사용자가 직접 한다.** 로컬 merge / `main` 직접 push 금지 — 두 대상 저장소와 같은 규칙
- 아티팩트 소스는 `docs/artifacts/integration-artifact.html`. 발행 전 `action:"read"` 로 현재 버전 확인 필수

## 하네스: pleiades 통합

**목표:** 두 실서비스 저장소를 읽어 실측하고, 방향 문서를 쓰고, 그 비용 추정을 코드로 반증한 뒤, 승인 후에만 집행한다.

**트리거:** 통합 방향 판단·단계 실행·재검토 요청 시 `pleiades-orchestrator` 스킬을 사용하라.
세션 시작은 `pleiades-resume`, 종료는 `pleiades-handoff`. 단순 질문은 직접 응답 가능.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-09-03 | 초기 구성 — 에이전트 4 + 스킬 6(오케스트레이터 포함) | 전체 | - |

## 상속하는 컨벤션

두 대상 저장소가 공유하는 규칙이다. 통합 코드를 쓰게 되면 그대로 따른다.

- Next.js App Router + TypeScript + Tailwind + Recharts
- DB 접근은 `@/lib/prisma` singleton. raw query 금지
- API 응답은 envelope `{ success, data?, error?, meta? }` (myFinance `@/lib/api-response` 패턴)
- catch 블록에서 `error.message` 원문 노출 금지 — 한국어 정적 메시지
- 날짜 ISO 8601, 금액은 currency 필드 동반
- 브랜치: `main`(실서비스) → `dev` → `feat/<issue>-<n>`. PR 머지는 사용자가 직접

## 이름

플레이아데스 — 흩어진 별들이 하나의 성단으로 묶여 보이는 것. 저장소는 여럿이되 하나로 다룬다는 뜻.
