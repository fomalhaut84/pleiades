#!/usr/bin/env python3
"""가져오기·수용 가드와 상태 파일 (#104 · 006 §4-2 · I-15 · I-21).

가드는 **실패하면 멈추고 사용자에게 보고**한다 — 자동 복구하지 않는다(006 §4-S).
  scratch  <dir>                           스크래치가 pleiades 밖인가 (I-21 · realpath)
  guard-a  <scratch> <last-svc> <new-svc>  마지막 수용 서비스 SHA 가 새 dev 의 조상인가 — 서비스 force-push 감지
  guard-c  <pleiades> <prev-tip> <base>    이전 재작성 tip 이 base(origin/dev) 의 조상인가 — 이전 동기화 PR squash 감지
  guard-b  <pleiades> <prev-tip> <ref>     이전 재작성 tip 이 새 재작성본의 조상인가 — filter-repo·callback·git 드리프트 감지
  state-get <STATE.json> <app> <key>       상태 값 한 개 (없으면 빈 줄)
  state-set <STATE.json> <app> key=value…  새 상태를 검증해 원자적으로 쓴다
  callback-sha                             rewrite.py + msg_*.callback 의 sha256 (VERSIONS 대조용)
종료 코드: 0 통과 · 1 가드 실패(중단) · 2 사용 오류·검증 실패
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
APPS = ("fin", "fit")
SERVICE_REPOS = {"fin": "myFinance", "fit": "myFitness"}
SHA = re.compile(r"[0-9a-f]{40}")
STATE_KEYS = {
    "service_repo": re.compile(r"myFinance|myFitness"),
    "service_dev": SHA,
    "rewritten_tip": SHA,
    "filter_repo": re.compile(r"\S+"),
    "callback_sha": re.compile(r"[0-9a-f]{64}"),
    "git": re.compile(r"git version \S+.*"),
}
CALLBACK_FILES = ("rewrite.py", "msg_fin.callback", "msg_fit.callback")


class GuardError(Exception):
    """가드 실패 — 멈추고 보고한다."""


class UsageError(Exception):
    """입력·검증 오류."""


# ---------- 가드 ----------

def check_scratch(path: str, root: Path = ROOT) -> None:
    real, base = os.path.realpath(path), os.path.realpath(root)
    if real == base or real.startswith(base + os.sep):
        raise GuardError(f"스크래치가 pleiades 안이다 ({real}) — filter-repo 는 cwd 를 재작성한다 (I-21)")


def is_ancestor(repo: str, older: str, newer: str) -> bool:
    """older 가 newer 의 조상인가. 객체가 없으면(128) False — 판정 불능은 통과가 아니다."""
    r = subprocess.run(["git", "-C", repo, "merge-base", "--is-ancestor", older, newer],
                       capture_output=True, text=True, check=False)
    return r.returncode == 0


def guard(name: str, repo: str, older: str, newer: str) -> None:
    if not is_ancestor(repo, older, newer):
        why = {
            "a": "서비스 dev 가 force-push 됐거나 마지막 수용 SHA 를 받을 수 없다 — 재병합(중간)은 사용자 결정",
            "b": "이전 재작성 tip 이 새 재작성본의 조상이 아니다 — filter-repo·callback·git 버전 드리프트 또는 서비스 이력 재작성",
            "c": "이전 동기화 PR 이 squash 됐다(또는 객체 없음) — `-s ours` 복구 PR 먼저 (006 §4-2)",
        }[name]
        raise GuardError(f"가드 {name.upper()} 실패: {older[:12]} ⊄ {newer} — {why}")


# ---------- 상태 파일 ----------

def validate_state(state: object) -> dict:
    if not isinstance(state, dict) or type(state.get("version")) is not int or state["version"] != 1:
        raise UsageError("STATE.json: 최상위는 {\"version\": 1, …} 객체여야 한다")
    for app, entry in state.items():
        if app == "version":
            continue
        if app not in APPS:
            raise UsageError(f"STATE.json: 알 수 없는 앱 {app!r}")
        if not isinstance(entry, dict) or set(entry) != set(STATE_KEYS):
            raise UsageError(f"STATE.json[{app}]: 키는 정확히 {sorted(STATE_KEYS)} 여야 한다")
        for key, pattern in STATE_KEYS.items():
            if not isinstance(entry[key], str) or not pattern.fullmatch(entry[key]):
                raise UsageError(f"STATE.json[{app}].{key}: 형식이 틀렸다 ({entry[key]!r})")
        if entry["service_repo"] != SERVICE_REPOS[app]:
            raise UsageError(f"STATE.json[{app}].service_repo 는 {SERVICE_REPOS[app]} 여야 한다")
    return state


def load_state(path: str) -> dict:
    p = Path(path)
    if not p.exists():
        return {"version": 1}  # 최초 가져오기(M-1) 전
    try:
        return validate_state(json.loads(p.read_text()))
    except json.JSONDecodeError as e:
        raise UsageError(f"STATE.json 이 JSON 이 아니다: {e}") from e


def with_app(state: dict, app: str, values: dict[str, str]) -> dict:
    """새 상태를 돌려준다 — 원본을 바꾸지 않는다."""
    if app not in APPS:
        raise UsageError(f"알 수 없는 앱 {app!r}")
    return validate_state({**state, app: {**state.get(app, {}), **values}})


def write_state(path: str, state: dict) -> None:
    validate_state(state)
    target = Path(path)
    fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=".STATE.", suffix=".json")
    with os.fdopen(fd, "w") as f:
        json.dump(state, f, indent=2, sort_keys=True)
        f.write("\n")
    os.replace(tmp, target)


def callback_sha(here: Path = HERE) -> str:
    h = hashlib.sha256()
    for name in CALLBACK_FILES:
        h.update(name.encode() + b"\0" + (here / name).read_bytes() + b"\0")
    return h.hexdigest()


# ---------- CLI ----------

def run(argv: list[str]) -> str:
    if not argv:
        raise UsageError(__doc__ or "")
    cmd, args = argv[0], argv[1:]
    if cmd == "scratch" and len(args) == 1:
        check_scratch(args[0])
        return "scratch: pleiades 밖"
    if cmd in ("guard-a", "guard-b", "guard-c") and len(args) == 3:
        guard(cmd[-1], *args)
        return f"가드 {cmd[-1].upper()}: 통과"
    if cmd == "state-get" and len(args) == 3:
        return load_state(args[0]).get(args[1], {}).get(args[2], "")
    if cmd == "state-set" and len(args) >= 3:
        pairs = dict(a.split("=", 1) for a in args[2:] if "=" in a)
        if len(pairs) != len(args) - 2:
            raise UsageError("state-set: key=value 형식이어야 한다")
        write_state(args[0], with_app(load_state(args[0]), args[1], pairs))
        return f"STATE.json[{args[1]}] 갱신"
    if cmd == "callback-sha" and not args:
        return callback_sha()
    raise UsageError(f"알 수 없는 명령 또는 인자 수: {' '.join(argv)}")


def main() -> int:
    try:
        print(run(sys.argv[1:]))
        return 0
    except GuardError as e:
        print(f"guards: 중단 — {e}", file=sys.stderr)
        return 1
    except UsageError as e:
        print(f"guards: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
