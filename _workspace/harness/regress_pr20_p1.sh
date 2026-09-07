#!/usr/bin/env bash
# 회귀 재현: PR #20 Codex P1 — 프로세스 치환 안의 git show 실패가 묻혀 드리프트 0(동일) 으로 오기록된다.
# 테스트 프레임워크 부재 → 재현 스크립트로 대체 (workflow.md 9-5). 기대: BEFORE=0 (오탐), AFTER 는 "미확인" 2줄.
set -u
cd "$(dirname "$0")/../.."
FIN=repos/myFinance; FIT=repos/myFitness; REF=integration/pleiades; P=src/NOPE.ts   # 존재하지 않는 경로
echo -n "BEFORE (게이트 없음): "; diff <(git -C $FIN show $REF:$P 2>/dev/null) <(git -C $FIT show $REF:$P 2>/dev/null) | wc -l | tr -d ' '
echo "AFTER  (cat-file -e 게이트를 diff 와 && 로 묶음 — 2회차 P1):"
if git -C $FIN cat-file -e "$REF:$P" 2>/dev/null && git -C $FIT cat-file -e "$REF:$P" 2>/dev/null; then
  diff <(git -C $FIN show $REF:$P) <(git -C $FIT show $REF:$P) | wc -l
else
  echo "  미확인 — ref/path 없음 (diff 미실행)"
fi
echo -n "REF-GATE (없는 ref nope/x, if/else — 3회차): "
if git -C $FIN rev-parse --verify --quiet "nope/x^{commit}" >/dev/null; then git -C $FIN ls-tree -r --name-only nope/x -- src | grep -E "\.tsx?$" | wc -l; else echo "미확인 — ref 없음 (ls-tree 미실행)"; fi
echo -n "CONTROL (실재 경로 package.json): "; git -C $FIN cat-file -e "$REF:package.json" && git -C $FIT cat-file -e "$REF:package.json" && diff <(git -C $FIN show $REF:package.json) <(git -C $FIT show $REF:package.json) | wc -l | tr -d ' '
echo -n "DIFF-ERR (없는 fd → 상태 2): "; diff /nonexistent_a /nonexistent_b 2>/dev/null | wc -l | tr -d " "; ds=${PIPESTATUS[0]}; [[ $ds -le 1 ]] || echo "  미확인 — diff 오류(상태 $ds)"
