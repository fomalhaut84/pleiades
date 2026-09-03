# CLAUDE.md

## Overview

**pleiades** — `myFinance` 와 `myFitness` 두 프로젝트를 어디까지 통합할지 검토하고, 결정된 범위를 실행하는 저장소.

**현재 상태: 방향 확정 · 단계 0 실행.**
2026-09-03 에 Q1·Q4·Q5·Q6 이 답을 받아 방향이 정해졌다 — **개인 비서 플랫폼**.
정본 방향은 `docs/specs/002-platform-direction.md`. 001 은 분석 근거로 유효하나 권고 경로는 002 가 대체한다.
남은 미결은 Q7(DB 경계) · Q2(독립 배포) · Q3(봇 인바운드 통합) 이고, 전부 단계 3 이후 안건이다.

## 대상 저장소

통합 대상은 이 저장소 밖에 있다. 읽거나 고치려면 세션에 붙여야 한다.

| 저장소 | 경로 | 버전 | 브랜치 |
|---|---|---|---|
| myFinance | `~/workspace/myFinance` | v0.16.4 | dev |
| myFitness | `~/workspace/myFitness` | v2.27.2 | dev |

```bash
# 두 저장소를 함께 보는 세션 (CLAUDE.md·rules 까지 로드)
CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 \
  claude --add-dir ~/workspace/myFinance --add-dir ~/workspace/myFitness
```

주의: `--add-dir` 는 `--resume` 시 복원되지 않는다. 세션을 재개할 때마다 다시 넘겨야 한다.

## 문서 지도

| 파일 | 내용 | 언제 읽나 |
|---|---|---|
| `docs/handoff/` 의 최신 파일 | 직전 세션 인계 노트 (현재: `2026-09-03-direction-002.md`) | **새 세션 시작 시 먼저** |
| `docs/specs/002-platform-direction.md` | **정본 방향** — 개인 비서 플랫폼, 개정 경로 0~4, 확정된 답 | **방향 판단 시 먼저** |
| `docs/specs/001-integration-master.md` | 축 A/B 분해·옵션·리스크 분석 (권고 경로는 002 가 대체) | 분석 근거가 필요할 때 |
| `docs/research/measured-facts.md` | 두 저장소 실측 데이터 (2026-09-03) | 숫자가 필요할 때. **재측정 전에 여기부터** |
| `docs/research/claude-code-mechanisms.md` | Claude Code 기능 조사 (메모리·세션·플러그인·모노레포) | 축 A 작업 시 |

## 핵심 전제 (여기서 벗어나면 재검토)

1. **통합은 두 개의 독립 축이다.** 축 A = 하네스·세션(코드 무변경), 축 B = 저장소·런타임. 따로 결정한다.
2. **되돌리기 비용 순으로 진행한다.** 값싸고 가역적인 것부터. 각 단계는 그 지점에서 멈춰도 손해가 없어야 한다.
3. **가장 큰 이득은 코드 통합 없이 나온다.** 두 MCP 서버가 이미 로컬 HTTP 로 상주 중이라, `mcp-config.json` 병합만으로 교차 도메인 AI 어드바이저가 된다.
4. **B2(모노레포)는 목표에 내장된 요구사항이다.** 001 은 "증거가 나오면"이라 했으나,
   목표가 "도메인을 계속 늘리는 플랫폼"으로 확정되면서 바뀌었다. 진입 조건은 **도메인 #3(캘린더)을 붙일 때**.
5. **아웃바운드 알림과 인바운드 봇 명령은 비용이 다르다.** 아웃바운드는 어댑터 교체(초크포인트 1곳),
   인바운드는 재작성(210건). 인바운드를 저장소별로 각각 옮기지 않는다.

## 작업 규칙

- **기존 두 저장소에 쓰기 전 반드시 사용자 확인.** 둘 다 실서비스 중이다 (PM2 + Nginx, finance:4100 / fitness:4200).
- 새 옵션·단계를 제안할 때는 **되돌리기 비용을 항상 함께 적는다.** 이 저장소 문서의 일관된 형식이다.
- 실측값은 추정하지 않는다. `docs/research/measured-facts.md` 에 없으면 직접 측정하고 그 파일에 측정 명령과 함께 추가한다.
- 문서는 한국어. 코드·변수명·경로는 영어.
- 커밋: conventional commits — `<type>(<scope>): <desc>`. `main` 브랜치, 원격 없음
- 아티팩트 소스는 `docs/artifacts/integration-artifact.html`. 발행 전 `action:"read"` 로 현재 버전 확인 필수

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
