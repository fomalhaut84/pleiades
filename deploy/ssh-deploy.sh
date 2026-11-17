#!/usr/bin/env bash
# ssh-deploy.sh — 배포 전용 ssh 키의 forced command (#242 · 007 D-b). 이 키로는 이 스크립트만 돈다.
#
# 서버 ~/.ssh/authorized_keys 한 줄(사용자가 등록):
#   restrict,command="<홈>/pleiades-fin/deploy/ssh-deploy.sh" ssh-ed25519 AAAA… pleiades-deploy   (런북 release-inplace.md *자동 배포*)
# 받는 명령은 하나뿐: SSH_ORIGINAL_COMMAND = "deploy vX.Y.Z" — 그 밖은 거부(셸·인자 추가·다른 명령 없음).
# 하는 일: fin → fit 순서로 각 체크아웃의 deploy/release-inplace.sh <app> <V> --yes. fin 이 통과하지 않으면 fit 은 하지 않는다.
#   두 앱이 통과하면 통합 층(012 4b-5 · #744): 셋째 체크아웃이 있고 · 켜져 있고(마지막 통과 기록 · 정지 표지 없음) ·
#   입력(deploy/advisor/auto-inputs.txt)이 바뀌었을 때만 ~/pleiades-adv 의 adv-inplace.sh <V> --yes. 이 단계는 종료 코드를 바꾸지 않는다(G-R4).
# 출력은 release-inplace.sh 의 판정 양식뿐 — Actions 로그는 공개 저장소에서 누구나 본다.
# 종료 코드: 0 둘 다 통과 · 2 명령 거부 · 그 밖 = 처음 실패한 앱의 release-inplace.sh 코드(1 바꾸기 전 · 3 · 4 R-8 안내)
#   통합 층 실패는 종료 코드에 없다 — Actions 가 초록이어도 "## adv" 줄 · 배포 알림을 본다.
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
  # 전역 — EXIT trap 은 main 이 끝난 뒤에 돈다(local 이면 그때 비어 있다). 신호도 EXIT 로 보낸다(Actions 취소 · ssh 끊김)
  OUT=$(mktemp)
  trap 'rm -f "$OUT"' EXIT
  trap 'exit 143' TERM INT HUP
  for app in fin fit; do
    echo "## $app"
    # stderr 까지 공개 로그로 간다 — 홈 경로를 ~ 로(release-inplace 의 stdout 은 이미 가린다 · #242 보안 리뷰 info)
    bash "$base/pleiades-$app/deploy/release-inplace.sh" "$app" "$tag" --yes </dev/null 2>&1 \
      | sed -E "s#$HOME#~#g; s#/(home|Users)/[^/[:space:]]+#~#g" | tee "$OUT"
    rc=${PIPESTATUS[0]}
    notify "$base" "$app" "$tag" "$rc" "$OUT"
    if [[ $rc -ne 0 ]]; then
      [[ $app == fin ]] && echo "fit 은 하지 않았다 — fin 이 통과하지 않았다(rc $rc)"
      return "$rc"
    fi
  done
  adv_auto "$base" "$tag"
  return 0
}

# ── 통합 층(012 4b-5 · #744) ─────────────────────────────────────────────
# 필요할 때만 — 켜져 있고 입력이 바뀌었을 때. 실패해도 두 앱 결과(rc)를 바꾸지 않는다(G-R4).
ADV_INPUTS=deploy/advisor/auto-inputs.txt
# 릴리즈마다 올리는 버전 줄(루트 · packages 의 package.json · lock)만 바뀐 묶음은 변경으로 보지 않는다(9-1 major) —
# 의존을 올리면 같은 묶음의 resolved · integrity 줄도 바뀌므로 그대로 잡힌다. git -I 는 2.30+ · 없으면 비교 실패 = 배포
ADV_VERSION_ONLY='^[[:space:]]*"version": "[0-9]+\.[0-9]+\.[0-9]+",?[[:space:]]*$'
adv_auto() {  # <base> <tag>
  local dir="$1/pleiades-adv" priv="$HOME/pleiades-private" last why rc
  echo "## adv"
  [[ -f "$dir/deploy/advisor/adv-inplace.sh" ]] || { echo "adv 건너뜀 — 셋째 체크아웃 없음"; return 0; }
  last=$(cat "$priv/inplace-adv-last-ok" 2>/dev/null || true)
  [[ -n "$last" ]] || { echo "adv 건너뜀 — 첫 배포 전(첫 배포는 수동 · 런북 advisor-inplace.md)"; return 0; }
  [[ ! -e "$priv/inplace-adv-stopped" ]] || { echo "adv 건너뜀 — 정지됨(stop) · 마지막 통과 $last 유지"; return 0; }
  why=$(adv_reason "$dir" "$priv" "$last" "$2")
  if [[ "$why" == skip ]]; then
    echo "adv 건너뜀 — 입력 변경 없음 · $last 유지"
    return 0
  fi
  echo "adv 배포 — $why"
  bash "$dir/deploy/advisor/adv-inplace.sh" "$2" --yes </dev/null 2>&1 \
    | sed -E "s#$HOME#~#g; s#/(home|Users)/[^/[:space:]]+#~#g" | tee "$OUT"
  rc=${PIPESTATUS[0]}
  notify "$1" adv "$2" "$rc" "$OUT"
  [[ $rc -eq 0 ]] || echo "adv 실패 rc $rc — 두 앱 배포 결과는 그대로다 · 위 양식의 복구 줄은 사용자가 서버에서"
  return 0
}
# 배포할 이유 한 줄 · 할 일이 없으면 skip. 판정하지 못하면 배포한다(놓치는 것보다 한 번 더 도는 쪽 — 같은 태그면 "이미 배포됨")
adv_reason() {  # <dir> <priv> <last> <tag>
  local dir=$1 last=$3 tag=$4 line rc
  local -a specs=()
  [[ ! -s "$2/inplace-adv-pending" ]] || { echo "끝나지 않은 시도가 있다"; return; }
  # 기록은 공개 로그에 찍히고 git 인자로도 쓰인다 — 태그 형식만 믿는다(9-1 info)
  [[ "$last" =~ $TAG_RE ]] || { echo "판정 불능(마지막 통과 기록 형식)"; return; }
  [[ "$last" != "$tag" ]] || { echo "같은 태그 — 상태 확인"; return; }
  # 프롬프트 없이 · ssh 채널 stdin 을 물려받지 않게(9-1 info)
  export GIT_TERMINAL_PROMPT=0
  if ! git -C "$dir" rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1 </dev/null; then
    git -c maintenance.auto=false -c gc.auto=0 -C "$dir" fetch -q --no-tags origin tag "$tag" >/dev/null 2>&1 </dev/null \
      || { echo "판정 불능(태그를 받지 못했다)"; return; }
  fi
  while IFS= read -r line; do
    line=${line%%#*}
    line=${line#"${line%%[![:space:]]*}"}; line=${line%"${line##*[![:space:]]}"}   # 앞뒤만 다듬는다
    [[ -z "$line" ]] || specs+=("$line")
  done < <(git -C "$dir" show "$tag:$ADV_INPUTS" 2>/dev/null </dev/null)
  [[ ${#specs[@]} -gt 0 ]] || { echo "판정 불능(입력 목록 없음)"; return; }
  git -C "$dir" diff --quiet -I"$ADV_VERSION_ONLY" "$last" "$tag" -- "${specs[@]}" >/dev/null 2>&1 </dev/null; rc=$?
  case $rc in
    0) echo skip ;;
    1) echo "입력 변경 있음($last → $tag)" ;;
    *) echo "판정 불능(비교 실패)" ;;
  esac
}

# 앱마다 끝난 뒤 Discord 배포 채널로(#304 · 옛 fin·fit 의 배포 완료 메시지 · #502). 알림 실패는 배포 결과를 바꾸지 않는다.
# 요약은 판정 양식에서만 뽑는다(결과 줄 · 소요 · 프로브) — 이미 홈 경로를 가린 출력이다
notify() {  # <base> <app> <tag> <rc> <양식 파일>
  # 통합 층은 fin 체크아웃의 알림 스크립트를 빌린다 — 셋째 체크아웃에는 dotenv 가 없다(이미 새 태그다)
  local from=$2; [[ $2 != adv ]] || from=fin
  local script="$1/pleiades-$from/deploy/notify-deploy.cjs" status summary secs probe result
  [[ -f "$script" ]] || { echo "notify-deploy: 이 체크아웃에 알림 스크립트가 없다 — 건너뜀"; return 0; }
  secs=$(grep -oE '기본 실행 rc [0-9]+ · [0-9]+s' "$5" | grep -oE '[0-9]+s$' | tail -1)
  probe=$(grep -oE '프로브 오류 응답 [0-9]+' "$5" | tail -1)
  result=$(grep -E '^결과: ' "$5" | tail -1 | sed 's/^결과: //')
  if [[ $4 -eq 0 ]]; then
    status=ok; summary="${secs:+소요 $secs}${probe:+ · $probe}"
    # Actions 재실행 등으로 할 일이 없었으면 그렇게 적는다 — "배포 완료" 를 다시 받으면 오해한다
    [[ "$result" == *"이미 배포됨"* || $2 == adv ]] && summary="$result"
  else
    status=fail; summary="rc $4${result:+ · $result}"
    [[ $2 == fin ]] && summary+=" · fit 은 하지 않았다"
  fi
  # pm2 프로세스와 같은 주소 선택 타임아웃 — 서버는 IPv6 경로가 없고 IPv4 연결이 ~250 ms 라 기본값이면 외부 연결이
  # 실패한다(#191 · deploy/pleiades.config.cjs NET_ARGS · PR #305 Codex P2)
  node --network-family-autoselection-attempt-timeout=2000 "$script" "$2" "$status" "$3" "$summary" </dev/null 2>&1 | sed -E "s#$HOME#~#g; s#/(home|Users)/[^/[:space:]]+#~#g" || true
}

[[ "${BASH_SOURCE[0]}" != "$0" ]] || { main "$@"; exit $?; }
