#!/usr/bin/env python3
"""공개 승격 검사기 — matrix 이슈를 공개 pleiades 이슈로 옮기기 전 본문을 검사한다.

정본: docs/specs/008-monitoring.md §5-2 P-2(금지) · P-3(검사) · Q93(스크립트 · #253).
규칙: .claude/rules/matrix-intake.md M-3.

사용:
    python3 tools/ops/promote_check.py <본문 파일>      # 또는 - (stdin)
    python3 tools/ops/promote_check.py body.md --max-chars 8000

판정: 통과 exit 0 · 차단 exit 1 · 입력·금지 값 파일 오류 exit 2.
차단하면 **위치(줄:열)와 사유 코드만** 출력한다 — 걸린 값은 어디에도 다시 쓰지 않는다.

저장소에 둘 수 없는 금지 값(서버 도메인 · DB 이름 · 계정명 · 단어 호스트 등)은 비추적 파일에 한 줄씩 둔다:
    기본 tools/ops/deny.local (.gitignore) · env PLEIADES_PROMOTE_DENY_FILE 로 다른 경로.
    빈 줄 · `#` 주석은 건너뛴다 · 대소문자 무시 부분 일치 · 4자 미만 값은 건너뛴다(모든 줄에 걸린다).
파일이 없으면 경고하고 일반 패턴 검사만 한다.

이 검사기는 보조다 — 통과해도 사람 확인(P-4)을 거친다. 패턴이 못 잡는 금지 항목
(사용자 메시지 · 요청·응답 본문 · 개인 도메인 값)은 사람이 본다. 패턴은 줄 단위다 —
줄바꿈으로 쪼갠 토큰은 못 잡는다(금지 값만 줄바꿈을 지운 본문으로 한 번 더 본다).

경계는 모두 ASCII 로 쓴다 — 파이썬 `\\w`·`\\b` 는 한글도 단어 문자로 봐서
`10.0.0.5에서` 처럼 조사가 붙으면 놓쳤다(#253 사전 리뷰 critical).
"""

from __future__ import annotations

import argparse
import datetime
import ipaddress
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Sequence

HERE = Path(__file__).resolve().parent
DENY_ENV = "PLEIADES_PROMOTE_DENY_FILE"
DEFAULT_DENY_FILE = HERE / "deny.local"
DEFAULT_MAX_CHARS = 6000
MIN_DENY_LEN = 4
MIN_TOKEN_PIECE = 16  # `-`·`_` 로 나눈 조각 중 하나가 이만큼 길어야 토큰 — 하이픈 파일 이름 제외

# 공개해도 되는 호스트(문서·코드 호스팅 · 예시). 하위 도메인도 허용한다.
ALLOWED_HOSTS = (
    "github.com",
    "githubusercontent.com",
    "discord.com",
    "anthropic.com",
    "claude.com",
    "npmjs.com",
    "nodejs.org",
    "nextjs.org",
    "prisma.io",
    "example.com",
    "example.org",
)
_TLDS = (
    "com|net|org|io|dev|app|kr|co|me|xyz|cloud|ai|info|biz|site|online|tech|jp|us"
    "|local|internal|lan|home|localdomain|intranet|corp"  # 사설 이름
)

REASONS = {
    "TOO_LONG": "길이 상한 초과(패턴 검사 생략)",
    "ABS_PATH": "절대 경로",
    "IPV4": "IP 주소",
    "IPV6": "IP 주소",
    "EMAIL": "이메일",
    "HOST": "호스트·도메인",
    "URL_USERINFO": "URL 계정 정보",
    "ENV_VALUE": "env 값",
    "LONG_NUMBER": "긴 숫자열(ID 형태)",
    "TOKEN": "토큰 형태",
    "LOG_LINE": "로그 원문 줄",
    "TIMESTAMP_SECONDS": "초 단위 시각(로그 원문 의심)",
    "DENY": "금지 값 목록",
}

_W = "A-Za-z0-9_"  # ASCII 단어 문자
_A = re.ASCII


def _re(pattern: str, flags: int = 0) -> re.Pattern[str]:
    return re.compile(pattern, flags | _A)


_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("ABS_PATH", _re(
        rf"(?<![{_W}.~])(?:~/|/(?:Users|home|root|var|etc|opt|tmp|srv|usr|private|backup|mnt|Volumes)/)")),
    ("EMAIL", _re(rf"(?<![{_W}.+-])[{_W}.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")),
    # Yahoo 환율 심볼(`AMD=X` · `KRW=X`)은 env 가 아니다 — fin 문서에 자주 나온다
    ("ENV_VALUE", _re(rf"(?<![{_W}])[A-Z][A-Z0-9_]{{2,}}=[\"']?(?!X(?![^\s`'\")\]]))[^\s`'\"]+")),
    ("TOKEN", _re(rf"(?<![{_W}])(?:bot)?\d{{6,}}:[A-Za-z0-9_-]{{30,}}")),  # 텔레그램 봇
    ("TOKEN", _re(rf"(?<![{_W}-])[MNO][A-Za-z\d_-]{{20,}}\.[A-Za-z\d_-]{{5,}}\.[A-Za-z\d_-]{{25,}}")),  # Discord 봇
    ("TOKEN", _re(rf"(?<![{_W}-])eyJ[{_W}-]{{10,}}\.[{_W}-]{{10,}}\.[{_W}-]{{10,}}")),  # JWT
    ("TOKEN", _re(rf"(?<![{_W}])(?:gh[pousr]_[A-Za-z0-9]{{30,}}|github_pat_[{_W}]{{20,}})")),
    ("TOKEN", _re(rf"(?<![{_W}-])sk-[A-Za-z0-9_-]{{20,}}")),
    ("TOKEN", _re(rf"(?<![{_W}])AKIA[0-9A-Z]{{16}}(?![{_W}])")),
    ("TOKEN", _re(rf"(?<![{_W}])xox[abposr]-[A-Za-z0-9-]{{4,}}")),
    ("TOKEN", _re(r"/(?:webhooks|interactions)/[^/\s]*/[A-Za-z0-9_-]{20,}")),
    ("TIMESTAMP_SECONDS", _re(r"(?<![\d:])\d{1,2}:\d{2}:\d{2}(?![\d:])")),
)
_LOG_LINE = (
    _re(r"^\s*\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}"),
    _re(rf"^\s*\d+\|[{_W}.-]+\s*\|"),  # pm2 로그 접두
    _re(r"^\s*\[(?:ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL)\]", re.IGNORECASE),
)
_LONG_NUMBER = _re(rf"(?<![{_W}.])\d{{9,}}(?![{_W}])(?!\.\d)")
_GENERIC_TOKEN = _re(rf"(?<![{_W}-])[{_W}-]{{32,}}(?![{_W}-])")
_TOKEN_SPLIT = _re(r"[-_]")
_HEX = _re(r"^[0-9a-fA-F]+$")
_IPV4 = _re(rf"(?<![{_W}.])(?:\d{{1,3}}\.){{3}}\d{{1,3}}(?![{_W}])(?!\.\d)")
_IPV6 = _re(rf"(?<![{_W}:])(?:[0-9A-Fa-f]{{0,4}}:){{2,7}}[0-9A-Fa-f]{{0,4}}(?![{_W}:])")
_URL = _re(r"(?<![A-Za-z0-9+.-])[a-z][a-z0-9+.-]*://([^/\s?#'\"<>)]+)", re.IGNORECASE)
_BARE_HOST = _re(rf"(?<![{_W}@./-])(?:[a-z0-9-]+\.)+(?:{_TLDS})(?![{_W}-])", re.IGNORECASE)


@dataclass(frozen=True)
class Finding:
    code: str
    line: int  # 1부터 · 0 = 본문 전체
    col: int


class DenyFileError(Exception):
    """금지 값 파일을 읽지 못했다 — 사유는 예외 타입 이름만."""


def _host_allowed(host: str) -> bool:
    h = host.lower().rstrip(".")
    return any(h == a or h.endswith("." + a) for a in ALLOWED_HOSTS)


def _is_generic_token(s: str) -> bool:
    if _HEX.match(s):  # 커밋 SHA 는 허용 필드다
        return False
    if not (any(c.isdigit() for c in s) and any(c.isalpha() for c in s)):
        return False
    return max(len(p) for p in _TOKEN_SPLIT.split(s)) >= MIN_TOKEN_PIECE


def _is_migration_stamp(s: str) -> bool:
    """Prisma 마이그레이션 이름(`YYYYMMDDHHMMSS`)은 ID 가 아니다 — Discord ID 17~20자리 · 텔레그램 9~13자리와 겹치지 않는다."""
    if len(s) != 14:
        return False
    try:
        datetime.datetime.strptime(s, "%Y%m%d%H%M%S")
    except ValueError:
        return False
    return True


def _is_ipv6(s: str) -> bool:
    try:
        ipaddress.IPv6Address(s)
    except ValueError:
        return False
    if s == "::1":
        return True
    groups = [g for g in s.split(":") if g]
    return len(groups) >= 2 and sum(len(g) for g in groups) >= 4


def _is_ipv4(s: str) -> bool:
    try:
        ipaddress.IPv4Address(s)
    except ValueError:
        return False
    return True


def _url_findings(line: str, n: int) -> Iterator[Finding]:
    for m in _URL.finditer(line):
        authority = m.group(1)
        if "@" in authority:
            yield Finding("URL_USERINFO", n, m.start(1) + 1)
        host = authority.rsplit("@", 1)[-1]
        if host.startswith("["):  # IPv6 리터럴은 IPV6 가 본다
            continue
        if not _host_allowed(host.split(":", 1)[0]):
            yield Finding("HOST", n, m.start(1) + 1)


def _line_findings(line: str, n: int, deny_lower: Sequence[str]) -> Iterator[Finding]:
    for code, pat in _PATTERNS:
        for m in pat.finditer(line):
            yield Finding(code, n, m.start() + 1)
    if any(pat.search(line) for pat in _LOG_LINE):
        yield Finding("LOG_LINE", n, 1)
    for m in _LONG_NUMBER.finditer(line):
        if not _is_migration_stamp(m.group()):
            yield Finding("LONG_NUMBER", n, m.start() + 1)
    for m in _GENERIC_TOKEN.finditer(line):
        if _is_generic_token(m.group()):
            yield Finding("TOKEN", n, m.start() + 1)
    for m in _IPV4.finditer(line):
        if _is_ipv4(m.group()):
            yield Finding("IPV4", n, m.start() + 1)
    for m in _IPV6.finditer(line):
        if _is_ipv6(m.group()):
            yield Finding("IPV6", n, m.start() + 1)
    yield from _url_findings(line, n)
    for m in _BARE_HOST.finditer(line):
        if not _host_allowed(m.group()):
            yield Finding("HOST", n, m.start() + 1)
    low = line.lower()
    for value in deny_lower:
        start = low.find(value)
        while start != -1:
            yield Finding("DENY", n, start + 1)
            start = low.find(value, start + 1)


def check(text: str, deny_values: Sequence[str] = (), max_chars: int = DEFAULT_MAX_CHARS) -> list[Finding]:
    """본문을 검사해 걸린 위치를 돌려준다. 빈 목록 = 통과.

    상한을 넘으면 패턴 검사 없이 TOO_LONG 하나만 돌려준다(긴 입력의 정규식 비용 · #253 사전 리뷰).
    """
    if len(text) > max_chars:
        return [Finding("TOO_LONG", 0, 0)]
    deny_lower = [v.lower() for v in deny_values if v.strip()]
    lines = text.splitlines()
    body = sorted(
        {f for n, line in enumerate(lines, start=1) for f in _line_findings(line, n, deny_lower)},
        key=lambda f: (f.line, f.col, f.code),
    )
    # 줄바꿈으로 쪼갠 금지 값 — 줄 단위로 안 걸렸을 때만 본문 전체 한 건
    joined = "".join(lines).lower()
    split_deny = [v for v in deny_lower if v in joined and not any(v in line.lower() for line in lines)]
    return ([Finding("DENY", 0, 0)] if split_deny else []) + body


def deny_path() -> Path:
    env = os.environ.get(DENY_ENV)
    return Path(env) if env else DEFAULT_DENY_FILE


def load_deny(path: Path) -> list[str] | None:
    """금지 값 목록. 파일이 없으면 None · 읽기 오류는 DenyFileError."""
    try:
        raw = path.read_text(encoding="utf-8-sig")
    except FileNotFoundError:
        return None
    except (OSError, UnicodeDecodeError) as e:
        raise DenyFileError(type(e).__name__) from None
    return [s.strip() for s in raw.splitlines() if s.strip() and not s.strip().startswith("#")]


def _positive_int(s: str) -> int:
    v = int(s)
    if v <= 0:
        raise argparse.ArgumentTypeError("1 이상이어야 한다")
    return v


def _read_input(source: str) -> str:
    if source == "-":
        return sys.stdin.read()
    return Path(source).read_text(encoding="utf-8")


def _deny_label() -> str:
    """경고에 쓰는 이름 — 절대 경로(사용자명)를 찍지 않는다."""
    return f"env {DENY_ENV} 경로" if os.environ.get(DENY_ENV) else "기본 deny.local"


def _format(f: Finding) -> str:
    where = "본문 전체" if f.line == 0 else f"L{f.line}:C{f.col}"
    return f"{where} {f.code} — {REASONS[f.code]}"


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="공개 승격 본문 검사 (008 §5-2 P-3)")
    ap.add_argument("source", help="본문 파일 경로 또는 - (stdin)")
    ap.add_argument("--max-chars", type=_positive_int, default=DEFAULT_MAX_CHARS,
                    help=f"길이 상한 (기본 {DEFAULT_MAX_CHARS})")
    args = ap.parse_args(argv)

    try:
        deny = load_deny(deny_path())
    except DenyFileError as e:
        print(f"금지 값 파일을 읽지 못했다({_deny_label()}): {e}", file=sys.stderr)
        return 2
    if deny is None:
        print(f"경고: 금지 값 파일이 없다({_deny_label()}) — 일반 패턴만 검사한다", file=sys.stderr)
        deny = []
    short = [v for v in deny if len(v) < MIN_DENY_LEN]
    if short:
        print(f"경고: 짧은 금지 값 {len(short)}개 건너뜀({MIN_DENY_LEN}자 미만)", file=sys.stderr)
        deny = [v for v in deny if len(v) >= MIN_DENY_LEN]

    try:
        text = _read_input(args.source)
    except (OSError, UnicodeDecodeError) as e:
        print(f"입력을 읽지 못했다: {type(e).__name__}", file=sys.stderr)
        return 2

    findings = check(text, deny_values=deny, max_chars=args.max_chars)
    if not findings:
        print(f"통과 ({len(text)}자 · 금지 값 {len(deny)}개 대조)")
        return 0
    for f in findings:
        print(_format(f))
    print(f"차단 {len(findings)}건 — 값은 출력하지 않는다. 본문을 고쳐 다시 돌린다")
    return 1


if __name__ == "__main__":
    sys.exit(main())
