#!/usr/bin/env bash
# import_app.sh — 서비스 dev 를 읽기만 해서 filter-repo 재작성 후 pleiades apps/<app> 로 머지한다 (#104 · 006 §4-2 · §4-S).
#
# 사용:  ISSUE=<pleiades 이슈 번호> SCRATCH=<pleiades 밖 디렉터리> tools/import/import_app.sh <fin|fit> <first|sync>
#   first = M-1 최초 가져오기 (--allow-unrelated-histories · STATE.json 에 그 앱이 없어야 한다)
#   sync  = 정기 수용 (가드 A·C·B 를 모두 통과해야 머지한다)
# 선택 env: FILTER_REPO(기본 tools/import/.venv/bin/git-filter-repo) · BASE_REF(가드 C 기준 · 기본 origin/dev)
#          SOURCE_URL(테스트용 — 기본 https://github.com/fomalhaut84/<repo>.git) · PLEIADES_ROOT(테스트용)
#
# 격리 (.claude/rules/isolation.md): 서비스 저장소는 https 읽기만(I-1 · I-13) · 리모트를 등록하지 않는다 · --no-tags(I-16)
#   filter-repo 는 스크래치에서만(I-21 · guards.py scratch) · 가드 실패는 멈추고 보고한다 — 자동 복구하지 않는다(I-15).
# 머지 방식: PR 은 "Create a merge commit" (squash 하면 다음 수용의 가드 C 가 멈춘다 · U97-11).
# 이 스크립트는 pleiades 의 현재 브랜치에 커밋만 만든다 — push·PR 은 사람이 한다.
set -euo pipefail

die() { echo "import_app: 중단 — $*" >&2; exit 1; }
usage() { sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

[[ $# -eq 2 ]] || usage
APP=$1 MODE=$2
case "$APP" in
  fin) REPO=myFinance DIR=apps/finance ;;
  fit) REPO=myFitness DIR=apps/fitness ;;
  *) usage ;;
esac
[[ "$MODE" == first || "$MODE" == sync ]] || usage
: "${ISSUE:?ISSUE (pleiades 이슈 번호) 가 필요하다}"
: "${SCRATCH:?SCRATCH (pleiades 밖 디렉터리) 가 필요하다}"
[[ "$ISSUE" =~ ^[0-9]+$ ]] || die "ISSUE 는 숫자여야 한다 ($ISSUE)"

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=${PLEIADES_ROOT:-$(cd "$HERE/../.." && pwd)}
SRC=${SOURCE_URL:-https://github.com/fomalhaut84/$REPO.git}
FR=${FILTER_REPO:-$HERE/.venv/bin/git-filter-repo}
BASE_REF=${BASE_REF:-origin/dev}
STATE=$ROOT/tools/import/STATE.json
G() { python3 "$HERE/guards.py" "$@"; }
pin() { sed -n "s/^$1: //p" "$HERE/VERSIONS"; }

# ---- 사전 조건
G scratch "$SCRATCH" >/dev/null
BR=$(git -C "$ROOT" branch --show-current)
[[ -n "$BR" && "$BR" != dev && "$BR" != main ]] || die "pleiades 작업 브랜치에서 실행한다 (현재: ${BR:-detached})"
git -C "$ROOT" diff --quiet && git -C "$ROOT" diff --cached --quiet || die "pleiades 작업트리가 깨끗하지 않다"
[[ -x "$FR" ]] || die "filter-repo 가 없다 ($FR) — venv 에 $(sed -n '/^git-filter-repo==/p' "$HERE/VERSIONS") 를 설치한다"
[[ "$(cd "$SCRATCH" && "$FR" --version)" == "$(pin filter-repo-version)" ]] || die "filter-repo 버전이 VERSIONS 와 다르다 — 가드 B 가 깨진다"
[[ "$(git --version)" == "$(pin git)" ]] || die "git 버전이 VERSIONS 와 다르다 ($(git --version)) — 재작성 결정성이 보장되지 않는다"
CB_SHA=$(G callback-sha)
[[ "$CB_SHA" == "$(pin callback)" ]] || die "callback 이 VERSIONS 와 다르다"

LAST_SVC=$(G state-get "$STATE" "$APP" service_dev)
PREV_TIP=$(G state-get "$STATE" "$APP" rewritten_tip)
if [[ "$MODE" == first ]]; then
  [[ -z "$PREV_TIP" ]] || die "$APP 은 이미 가져왔다 (STATE.json) — sync 를 쓴다"
  [[ ! -e "$ROOT/$DIR" ]] || die "$DIR 가 이미 있다"
else
  [[ -n "$PREV_TIP" && -n "$LAST_SVC" ]] || die "STATE.json 에 $APP 이 없다 — first 가 먼저다"
fi

# ---- 스크래치: 읽기 전용 클론 → 재작성 → 게이트
W=$SCRATCH/$APP-import-$$
[[ ! -e "$W" ]] || die "$W 가 이미 있다"
git clone -q --no-tags --single-branch --branch dev "$SRC" "$W"
git -C "$W" remote remove origin
SVC=$(git -C "$W" rev-parse dev)
SVC_TREE=$(git -C "$W" rev-parse 'dev^{tree}')
if [[ "$MODE" == sync ]]; then
  [[ "$SVC" != "$LAST_SVC" ]] || { echo "import_app: $REPO dev 는 최신이다 (${SVC:0:12}) — 수용할 것 없음"; exit 0; }
  G guard-a "$W" "$LAST_SVC" "$SVC"
fi
( cd "$W" && PLEIADES_IMPORT_DIR="$HERE" "$FR" --quiet --force --to-subdirectory-filter "$DIR" \
    --message-callback "$(cat "$HERE/msg_$APP.callback")" )
git -C "$W" log --format=%B dev | python3 "$HERE/gate.py" || die "게이트 실패 — push 하지 않는다"
TIP=$(git -C "$W" rev-parse dev)
[[ "$(git -C "$W" rev-parse "dev:$DIR")" == "$SVC_TREE" ]] || die "재작성 트리가 서비스 dev 트리와 다르다"

# ---- pleiades: fetch(리모트 없이 · 태그 없이) → 가드 → 머지 → 상태
REF=refs/import/$APP
trap 'git -C "$ROOT" update-ref -d "$REF" 2>/dev/null || true' EXIT
git -C "$ROOT" fetch -q --no-tags "$W" "+dev:$REF"
if [[ "$MODE" == sync ]]; then
  G guard-c "$ROOT" "$PREV_TIP" "$BASE_REF"
  G guard-b "$ROOT" "$PREV_TIP" "$REF"
fi
FR_VER=$(pin filter-repo-version)
MSG=$(printf 'chore(apps): %s %s dev → %s (#%s)\n\nService-Repo: %s\nService-Dev: %s\nFilter-Repo: %s · callback %s' \
  "$([[ $MODE == first ]] && echo import || echo sync)" "$REPO" "$DIR" "$ISSUE" "$REPO" "$SVC" "$FR_VER" "$CB_SHA")
MERGE_ARGS=(--no-ff --no-edit -m "$MSG")
[[ "$MODE" == first ]] && MERGE_ARGS+=(--allow-unrelated-histories)
git -C "$ROOT" merge -q "${MERGE_ARGS[@]}" "$REF" \
  || die "머지 충돌 — 해결은 사람이 한다(충돌 해결분이 리뷰 범위 · 006 §4-S). 되돌리기: git -C $ROOT merge --abort"
[[ "$(git -C "$ROOT" log -1 --format=%P | wc -w | tr -d ' ')" == 2 ]] || die "머지 커밋이 아니다"

G state-set "$STATE" "$APP" "service_repo=$REPO" "service_dev=$SVC" "rewritten_tip=$TIP" \
  "filter_repo=$FR_VER" "callback_sha=$CB_SHA" "git=$(git --version)" >/dev/null
git -C "$ROOT" add tools/import/STATE.json
git -C "$ROOT" commit -q -m "chore(apps): STATE.json $APP ← ${SVC:0:12} (#$ISSUE)"

echo "import_app: $MODE $REPO → $DIR 완료 · 서비스 ${SVC:0:12} · 재작성 ${TIP:0:12}"
echo "  다음: 8절 apps 행 검증 → push → PR(base dev) → \"Create a merge commit\" → 머지 후 부모 2 확인"
