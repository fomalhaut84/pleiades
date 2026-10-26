#!/usr/bin/env bash
# ssh-deploy.sh — 배포 전용 ssh 키의 forced command (#242 · 007 D-b). 이 키로는 이 스크립트만 돈다.
#
# 서버 ~/.ssh/authorized_keys 한 줄(사용자가 등록):
#   restrict,command="<홈>/pleiades-fin/deploy/ssh-deploy.sh" ssh-ed25519 AAAA… pleiades-deploy   (런북 release-inplace.md *자동 배포*)
# 받는 명령은 하나뿐: SSH_ORIGINAL_COMMAND = "deploy vX.Y.Z" — 그 밖은 거부(셸·인자 추가·다른 명령 없음).
# 하는 일: fin → fit 순서로 각 체크아웃의 deploy/release-inplace.sh <app> <V> --yes. fin 이 통과하지 않으면 fit 은 하지 않는다.
# 출력은 release-inplace.sh 의 판정 양식뿐 — Actions 로그는 공개 저장소에서 누구나 본다.
# 종료 코드: 0 둘 다 통과 · 2 명령 거부 · 그 밖 = 처음 실패한 앱의 release-inplace.sh 코드(1 바꾸기 전 · 3 · 4 R-8 안내)
# 자기 교체: fin 의 checkout 이 이 파일(fin 체크아웃 안)을 바꾼다 — 본문을 함수에 두고 마지막 줄에서 main + exit.

TAG_RE='^v[0-9]+\.[0-9]+\.[0-9]+$'

main() {
  set -uo pipefail
  export LC_ALL=C   # [0-9] 등 정규식이 ssh 로 넘어온 로캘에 따르지 않게
  local cmd=${SSH_ORIGINAL_COMMAND:-}
  local verb tag extra
  read -r verb tag extra <<<"$cmd"
  if [[ "$verb" != deploy || ! "$tag" =~ $TAG_RE || -n "$extra" || "$cmd" != "deploy $tag" ]]; then
    echo "ssh-deploy: 거부 — 받는 명령은 'deploy vX.Y.Z' 하나다" >&2
    return 2
  fi

  # 비대화형 ssh 는 로그인 프로필을 읽지 않는다 — node·pm2 가 nvm 에 있으면 여기서 올린다(없으면 release-inplace 가 PATH 로 멈춘다)
  # shellcheck disable=SC1091
  [[ -s "$HOME/.nvm/nvm.sh" ]] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
  PATH="$HOME/.local/bin:$PATH"

  local base=${PLEIADES_CHECKOUT_BASE:-$HOME}
  [[ "${PLEIADES_TEST:-}" == 1 ]] || base=$HOME   # 테스트만 위치를 바꾼다

  local app rc
  for app in fin fit; do
    echo "## $app"
    # stderr 까지 공개 로그로 간다 — 홈 경로를 ~ 로(release-inplace 의 stdout 은 이미 가린다 · #242 보안 리뷰 info)
    bash "$base/pleiades-$app/deploy/release-inplace.sh" "$app" "$tag" --yes </dev/null 2>&1 \
      | sed -E "s#$HOME#~#g; s#/(home|Users)/[^/[:space:]]+#~#g"
    rc=${PIPESTATUS[0]}
    if [[ $rc -ne 0 ]]; then
      [[ $app == fin ]] && echo "fit 은 하지 않았다 — fin 이 통과하지 않았다(rc $rc)"
      return "$rc"
    fi
  done
  return 0
}

[[ "${BASH_SOURCE[0]}" != "$0" ]] || { main "$@"; exit $?; }
