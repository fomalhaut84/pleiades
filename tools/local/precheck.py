#!/usr/bin/env python3
"""run.sh 가 감싸는 명령의 사전 검사 (#104 · PR #110 Codex P1 ×2).

훅은 바깥 `tools/local/run.sh …` 만 본다 — 감싼 명령은 여기서 다시 본다.
  ① 프로그램 허용 목록: 앱 명령(npm · npx · node)만. DB 관리(createdb/dropdb/psql)·셸·배포 스크립트는 run.sh 로 돌리지 않는다
  ② 파괴 명령: SQL 주석·공백·대소문자를 정규화한 뒤 본다 (L-1 · I-14)
  ③ 훅 판정기(.claude/hooks/isolation_guard.check)를 cwd = apps/<app> 로 다시 적용 (I-1 · I-3 · I-11 · I-19 · I-21)
  ④ 로컬 pm2 예외 (#171 · 007 Q85 ①): `npx [-y] pm2[@x.y.z] <허용 서브커맨드>` 만 ③ 의 I-3 대신 여기서 판정한다 —
     start 계열은 `<루트 deploy/pleiades.config.cjs> --only pleiades-<이 앱>-<역할>` 만 · 관리 대상은 이 앱 이름만 ·
     플래그는 닫힌 집합만. 데몬은 run.sh 가 PM2_HOME 으로 고정한다.
     직접 치는 `pm2`·`npx pm2` 는 훅이 계속 막는다 — 이 예외는 run.sh 안에서만 있다

사용: python3 precheck.py <root> <cwd> -- <명령…>   → 0 통과 · 1 거부 · 2 사용 오류
"""

from __future__ import annotations

import os
import re
import shlex
import sys
from pathlib import Path

HOOKS = Path(__file__).resolve().parents[2] / ".claude" / "hooks"
sys.path.insert(0, str(HOOKS))

import isolation_guard  # noqa: E402

ALLOWED_PROGRAMS = {"npm", "npx", "node"}
PM2_PACKAGE = re.compile(r"pm2(?:@\d+\.\d+\.\d+)?")
PM2_CONFIG = "deploy/pleiades.config.cjs"  # 루트 설정 파일 (007 T-1) — apps/*/ecosystem.config.js 는 I-19 로 계속 금지
PM2_START = {"start", "startOrReload", "startOrRestart", "startOrGracefulReload"}
PM2_MANAGE = {"restart", "reload", "stop", "delete", "del", "list", "ls", "l", "status", "jlist", "prettylist",
              "describe", "desc", "info", "show", "logs", "flush", "save", "dump", "kill",
              "ping", "pid", "id", "--version", "-v"}
# 인자는 닫힌 집합만 — pm2 는 start 가 가변 인자이고 설정 파일을 부분 문자열로 판정하며 `-` 는 stdin 이다 (#171 사전 리뷰)
PM2_FLAGS = {"--nostream", "--err", "--out"}   # 값 없음 · --update-env 는 start 계열만(앱 범위 --only 와 함께 · #171 재리뷰)
PM2_VALUE_FLAGS = {"--lines": re.compile(r"\d+")}             # 값 있음 (start 의 --only 는 따로)
PM2_NODE_CLI = re.compile(r"(?:^|/)node_modules/(?:pm2/|\.bin/pm2)")  # 실수 방지 — node 는 원래 무엇이든 실행할 수 있다
APP_OF_DIR = {"finance": "fin", "fitness": "fit"}

DESTRUCTIVE = re.compile(
    r"\bdrop (database|schema)\b|\bdropdb\b|\bmigrate (reset|dev)\b|--force-reset\b|--accept-data-loss\b"
)


def normalize(argv: list[str]) -> str:
    """SQL 주석을 지우고 공백을 하나로 · 소문자 — `DROP /* x */  DATABASE` 도 `drop database` 가 된다."""
    text = " ".join(argv)
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.DOTALL)
    text = re.sub(r"(?<!\S)--(?=\s|$)[^\n]*", " ", text)  # SQL 한 줄 주석 `-- …` (플래그 `--sql` 은 남긴다)
    return re.sub(r"\s+", " ", text).lower()


def _pm2_args(argv: list[str]) -> list[str] | None:
    """`npx [-y|--yes] pm2[@x.y.z] …` 이면 pm2 뒤 인자 · 아니면 None. 다른 npx 플래그(-p 등)는 예외 대상이 아니다."""
    if os.path.basename(argv[0]) != "npx":
        return None
    i = 1
    while i < len(argv) and argv[i] in ("-y", "--yes"):
        i += 1
    if i < len(argv) and PM2_PACKAGE.fullmatch(argv[i]):
        return argv[i + 1:]
    return None


def _is_pm2_cli(arg: str, cwd: str) -> bool:
    """경로 변형(`..` · 중복 `/` · 대소문자 · 심링크)을 접은 뒤 판정한다 (PR #172 Codex P1)."""
    full = os.path.join(cwd, arg)
    return any(PM2_NODE_CLI.search(c.lower()) for c in (arg, os.path.normpath(full), os.path.realpath(full)))


def _pm2_flags(args: list[str], sub: str) -> tuple[list[str], list[str]]:
    """(위치 인자, 문제). 허용 플래그 밖이면 문제."""
    pos, out, i = [], [], 0
    while i < len(args):
        a = args[i]
        if a in PM2_FLAGS:
            i += 1
        elif a in PM2_VALUE_FLAGS:
            if i + 1 >= len(args) or not PM2_VALUE_FLAGS[a].fullmatch(args[i + 1]):
                out.append(f"pm2 {sub}: {a} 값이 잘못됐다")
            i += 2
        elif a.startswith("-"):
            out.append(f"pm2 {sub}: 허용 밖 플래그 {a} (#171)")
            i += 1
        else:
            pos.append(a)
            i += 1
    return pos, out


def _pm2_start_problems(sub: str, rest: list[str], *, cwd: str, root: str) -> list[str]:
    """`start <루트 설정> --only pleiades-<이 앱>-<역할>[,…] [--update-env]` 만. check_env 는 이 앱만 보므로 --only 필수."""
    config = os.path.normpath(os.path.join(root, PM2_CONFIG))
    if not rest or os.path.normpath(os.path.join(cwd, rest[0])) != config:
        return [f"pm2 {sub}: 첫 인자는 루트 {PM2_CONFIG} 여야 한다 (#171 · I-19)"]
    app = APP_OF_DIR.get(os.path.basename(os.path.normpath(cwd)))
    names, tail, i = None, [], 1
    while i < len(rest):
        if rest[i] == "--only" and i + 1 < len(rest) and names is None:
            names = rest[i + 1].split(",")
            i += 2
        elif rest[i] == "--update-env":
            i += 1
        else:
            tail.append(rest[i])
            i += 1
    if tail:
        return [f"pm2 {sub}: 설정 파일 뒤에는 --only · --update-env 만 ({tail[0]} · #171 · I-19)"]
    if not names or app is None or not all(re.fullmatch(rf"pleiades-{app}-[a-z]+", n) for n in names):
        return [f"pm2 {sub}: --only pleiades-{app or '<app>'}-<역할> 필수 — run.sh 는 이 앱의 env 만 검사한다 (#171)"]
    return []


def _pm2_problems(args: list[str], *, cwd: str, root: str) -> list[str]:
    if not args:
        return ["pm2: 서브커맨드가 없다"]
    sub, rest = args[0], args[1:]
    if sub in PM2_START:
        return _pm2_start_problems(sub, rest, cwd=cwd, root=root)
    if sub not in PM2_MANAGE:
        return [f"pm2 {sub}: 로컬 예외 밖 서브커맨드 — 허용은 start 계열·관리·조회뿐 (#171 · I-3)"]
    pos, out = _pm2_flags(rest, sub)
    app = APP_OF_DIR.get(os.path.basename(os.path.normpath(cwd)))
    bad = [a for a in pos if not (app and re.fullmatch(rf"pleiades-{app}-[a-z]+", a))]
    if bad:
        # 이 앱 이름만 — all·id·다른 앱이면 run.sh 가 검사하지 않은 앱이 재기동된다 (PR #172 Codex P1 3회차) · 설정 파일·stdin 도 여기서 막힌다
        out.append(f"pm2 {sub}: 대상은 pleiades-{app or '<app>'}-<역할> 만 ({bad[0]}) — all·id·다른 앱·설정 파일·stdin 금지 (#171)")
    return out


def problems(argv: list[str], *, cwd: str, root: str, home: str) -> list[str]:
    if not argv:
        return ["실행할 명령이 없다"]
    out = []
    prog = os.path.basename(argv[0])
    if prog not in ALLOWED_PROGRAMS:
        out.append(f"{prog}: run.sh 는 앱 명령({', '.join(sorted(ALLOWED_PROGRAMS))})만 실행한다 — "
                   "DB 생성·삭제는 tools/local/db.py 로 (L-1 · #118)")
    m = DESTRUCTIVE.search(normalize(argv))
    if m:
        out.append(f"'{m.group(0)}' — 로컬 5432 는 사용자 개발 DB 와 공유다 (L-1 · I-14)")
    if prog == "node" and any(_is_pm2_cli(a, cwd) for a in argv[1:]):
        out.append("node 로 pm2 CLI 직접 실행 — run.sh 안 pm2 는 `npx pm2` 만 (#171)")
    pm2 = _pm2_args(argv)
    if pm2 is not None:  # ④ — 훅 판정기의 pm2 일괄 거부(I-3) 대신 좁은 허용 목록
        return out + _pm2_problems(pm2, cwd=cwd, root=root)
    out += [f"{v.rule}: {v.reason}" for v in isolation_guard.check(shlex.join(argv), cwd=cwd, root=root, home=home)]
    return out


def main() -> int:
    args = sys.argv[1:]
    if len(args) < 4 or args[2] != "--":
        print(__doc__, file=sys.stderr)
        return 2
    found = problems(args[3:], cwd=args[1], root=args[0], home=os.environ.get("HOME", str(Path.home())))
    if not found:
        return 0
    print("run.sh: 중단 — 감싼 명령이 격리 규칙에 걸린다 (.claude/rules/isolation.md)", file=sys.stderr)
    for r in found:
        print(f"  · {r}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
