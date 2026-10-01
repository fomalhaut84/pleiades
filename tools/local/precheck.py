#!/usr/bin/env python3
"""run.sh 가 감싸는 명령의 사전 검사 (#104 · PR #110 Codex P1 ×2).

훅은 바깥 `tools/local/run.sh …` 만 본다 — 감싼 명령은 여기서 다시 본다.
  ① 프로그램 허용 목록: 앱 명령(npm · npx · node)만. DB 관리(createdb/dropdb/psql)·셸·배포 스크립트는 run.sh 로 돌리지 않는다
  ② 파괴 명령: SQL 주석·공백·대소문자를 정규화한 뒤 본다 (L-1 · I-14)
  ③ 훅 판정기(.claude/hooks/isolation_guard.check)를 cwd = apps/<app> 로 다시 적용 (I-1 · I-3 · I-11 · I-19 · I-21)

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
DESTRUCTIVE = re.compile(
    r"\bdrop (database|schema)\b|\bdropdb\b|\bmigrate (reset|dev)\b|--force-reset\b|--accept-data-loss\b"
)


def normalize(argv: list[str]) -> str:
    """SQL 주석을 지우고 공백을 하나로 · 소문자 — `DROP /* x */  DATABASE` 도 `drop database` 가 된다."""
    text = " ".join(argv)
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.DOTALL)
    text = re.sub(r"(?<!\S)--(?=\s|$)[^\n]*", " ", text)  # SQL 한 줄 주석 `-- …` (플래그 `--sql` 은 남긴다)
    return re.sub(r"\s+", " ", text).lower()


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
