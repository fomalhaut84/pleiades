#!/usr/bin/env python3
"""push 전 grep-0 게이트 — 재작성된 커밋 메시지에 자동 링크 형식이 하나라도 남으면 실패한다 (#104 · 006 §4-2 · U97-5 ③).

**callback(rewrite.py)과 별도 구현이다** — 같은 정규식을 import 하지 않는다. callback 이 놓친 것을 잡는 것이 목적이다.
006 §4-2 의 다섯 형식(대소문자 무시) + `@멘션`(I-17 · callback 이 무해화했어야 한다).

사용: git -C <scratch> log --format=%B dev | python3 tools/import/gate.py   → 0 = 통과 · 1 = 남음(stderr 에 목록)
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass

PATTERNS = {
    "i": re.compile(r"[\w.-]+/[\w.-]+#\d+", re.IGNORECASE),
    "ii": re.compile(r"(https?://)?(www\.)?github\.com/[\w.-]+/[\w.-]+/(issues|pull|discussions)/\d+", re.IGNORECASE),
    "iii": re.compile(r"(?<![\w.-])[\w.-]+/[\w.-]+/(issues|pull)/\d+", re.IGNORECASE),
    "iv": re.compile(r"(?<![\w])gh-\d+", re.IGNORECASE),
    "v": re.compile(r"(?<![A-Za-z0-9_])#\d+\b", re.IGNORECASE),
    "mention": re.compile(r"(?<![\w.@/+-])@[A-Za-z0-9]"),
}
MAX_REPORT = 20


@dataclass(frozen=True)
class Finding:
    rule: str
    line_no: int
    match: str


def findings(text: str) -> list[Finding]:
    out = []
    for n, line in enumerate(text.splitlines(), start=1):
        for rule, pattern in PATTERNS.items():
            out.extend(Finding(rule, n, m.group(0)) for m in pattern.finditer(line))
    return out


def main() -> int:
    text = sys.stdin.buffer.read().decode("utf-8", "surrogateescape")
    found = findings(text)
    if not found:
        return 0
    counts = {r: sum(f.rule == r for f in found) for r in PATTERNS}
    print("gate: 실패 — 자동 링크 형식이 남았다 (push 하지 않는다 · 006 §4-2)", file=sys.stderr)
    print("  " + " · ".join(f"{r} {c}" for r, c in counts.items() if c), file=sys.stderr)
    for f in found[:MAX_REPORT]:
        print(f"  {f.rule}: {f.line_no}행 {f.match!r}", file=sys.stderr)
    if len(found) > MAX_REPORT:
        print(f"  … 외 {len(found) - MAX_REPORT}건", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
