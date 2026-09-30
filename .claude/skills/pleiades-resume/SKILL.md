---
name: pleiades-resume
description: pleiades 통합 프로젝트의 새 세션 시작 시 인계 상태를 로드하고 브리핑한다. 트리거 - 새 세션 첫 발화가 명시적 작업 지시가 아닐 때, "이어서 진행", "지금 상황", "어디까지 했지", "뭐부터 하면 돼". 상태 복원과 브리핑까지가 범위이고, 실제 작업은 pleiades-orchestrator 로 넘긴다.
---

# Pleiades Resume — 통합 프로젝트 재개 브리핑

`pleiades` 는 myFinance × myFitness 를 **개인 비서 플랫폼**으로 통합하는 저장소다.
제품 코드는 아직 없고, 산출물은 결정과 근거다. 재개는 "무엇을 짜다 말았나"가 아니라
**"무엇이 결정됐고 무엇이 안 됐나"** 를 복원하는 일이다.

## 사용 X

- 사용자가 명확한 작업을 지시한 경우 → `pleiades-orchestrator`
- 단순 질문 응답

## 절차

### Step 1 — 인계 소스 로드 (병렬)

```
Read: docs/handoff/ 의 가장 최근 파일
Read: docs/specs/002-platform-direction.md   ← 정본 방향 (목표)
Read: docs/specs/006-monorepo-first.md        ← 방향 전환 정본 (경로 · 격리) — 002 단계 4·003 배포·004 worktree 를 대체
Bash: ls docs/handoff/ && git log --oneline -5
```

> **정정 (2026-09-30 · 006 · #101).** 옛 Step 1 은 `git -C repos/myF* log` 를 돌렸다. `repos/*` 는 동결됐고 그 안에서 git 명령을 하지 않는다(`.claude/rules/isolation.md` I-11). 되돌리기: 즉시.

`001-integration-master.md` 는 **분석 근거로만 유효하다.** 권고 경로와 단계 0 범위는 002 가 대체했다.
001 을 읽고 그 전제로 움직이지 않는다.

`docs/research/measured-facts.md` 는 숫자가 실제로 필요할 때만 읽는다. **재측정 전에 반드시 이 파일부터 확인한다.**

### Step 2 — pleiades · 수용 상태 확인

두 서비스는 이 세션 밖에서 계속 움직인다. pleiades 는 그것을 **https 로 읽기만** 한다(`isolation.md` I-1·I-13).

```bash
cd ~/workspace/pleiades
git fetch -q origin && git status -sb | head -1
gh pr list -R fomalhaut84/pleiades --state open
# I-9 — pleiades Actions secrets 는 0 이어야 한다. 0 이 아니면 브리핑 첫 줄에 적고 사용자에게 보고
echo "actions secrets: $(gh api repos/fomalhaut84/pleiades/actions/secrets --jq .total_count)"
# 정기 수용 판정 (006 §4-S · Q54b) — 서비스 dev tip(ls-remote · 읽기) ↔ 마지막 수용 머지 커밋의 Service-Dev 트레일러
for r in myFinance myFitness; do
  svc=$(git ls-remote https://github.com/fomalhaut84/$r.git refs/heads/dev | cut -f1)
  last=$(git log origin/dev --grep "^Service-Repo: $r\$" -1 --format=%B | sed -n 's/^Service-Dev: //p')
  if [ -z "$last" ]; then echo "$r: 미수용 (M-1 전) · dev ${svc:0:12}"
  elif [ "$svc" = "$last" ]; then echo "$r: 최신 (${svc:0:12})"
  else echo "$r: 뒤처짐 — 수용 ${last:0:12} → dev ${svc:0:12}"; fi
done
```

**뒤처짐이면 브리핑의 후보 액션에 수용을 올린다** — M-5a·M-5b 착수 직전에는 **필수 0** 이다(006 Q54b). 수용 절차는 006 §4-S · `tools/import/`(#104).
`ls-remote` 가 실패하면(서비스 저장소가 PRIVATE 으로 바뀌었을 수 있다 — 006 §10) **재시도·우회하지 않고** 브리핑에 적는다.

> **정정 (2026-09-30 · 006 · #101 · M-0).** 옛 Step 2 — 체크아웃 4개(`repos/*` worktree 2 + 원본 2)의 브랜치·dirty 확인 · 원본↔worktree 하네스 드리프트 · 서비스 저장소의 `label:pleiades` 이관 이슈 수 · worktree behind · `integration/pleiades` behind dev — 는 **전부 소진**이다. `repos/*`·원본에서는 git 명령을 하지 않고(I-11 · `status` 도 index 를 갱신할 수 있다), 이관 이슈는 동결(#82)이며, 서비스 dev 는 pleiades 안 `apps/*` 로 수용한다(006 §4-S). 옛 명령은 git 이력(이 정정 직전 커밋)에 있다. 되돌리기: 즉시.

### Step 3 — 브리핑 (3문단 이내)

```
## pleiades 상태

**단계:** {0~4 중 어디} — {실행 전 / 진행 중 / 완료}
**M 단계:** M-{0~6} (006 §4) — {진행 중 / 완료}
**pleiades:** dev {clean/ahead} · 열린 PR {n} · Actions secrets {0}
**수용:** fin {미수용/최신/뒤처짐} · fit {…}
**미결:** 006 §7 중 다음 단계를 막는 것 · 002 Q7·Q2·Q3 는 전환 이후

**다음 후보 액션:**
1. {가장 자연스러운 다음 스텝 — 범위·소요·되돌리기 비용 병기}
2. {대안}

어떤 방향으로 갈까?
```

### Step 4 — 진행

작업 방향이 정해지면 `pleiades-orchestrator` 로 넘긴다. 이 스킬의 범위는 브리핑까지다.

## 확정된 것 (2026-09-03)

| | 답 |
|---|---|
| Q1 목표 | 개인 비서 플랫폼. 도메인을 계속 늘린다 |
| Q4 테스트 | 붙인다 (범위는 추출 대상 코드로 한정) |
| Q5 도메인 #3 | 일정·캘린더 |
| Q6 알림 채널 | Discord |

남은 미결은 Q7(DB 경계) · Q2(독립 배포) · Q3(봇 인바운드 통합). 전부 단계 3 이후 안건이라
단계 0~2 는 이 답들 없이도 진행할 수 있다.

## 원칙

- **되돌리기 비용을 항상 함께 말한다.** 이 프로젝트 문서의 일관된 형식
- **실측값은 추정하지 않는다.** `measured-facts.md` 에 없으면 측정하고 그 파일에 추가
- **기존 두 저장소 쓰기 전 사용자 확인.** 둘 다 실서비스 중이다
- **착수 직전 비용을 재확인한다.** 001 의 "단계 0 은 JSON 두 줄"이 실측에서 뒤집힌 전례가 있다
  (실제로는 TS 2파일 + 빌드 + `pm2 restart`). 값싸 보이는 계획일수록 `reversibility-audit` 이 필요하다

## 세션 종료 시

`pleiades-handoff` 스킬을 사용한다.
