#!/usr/bin/env python3
"""pleiades 루트 `.env` 의 **플랫폼 키**만 앱 프로세스에 넘긴다 (#143 · M-6a-2 · 사용자 2026-10-15).

플랫폼 키 = pleiades 가 소유한 설정 — 알림 채널 스위치 `NOTIFY_*` · Discord 웹훅 `DISCORD_WEBHOOK_*`.
앱 고유 설정(DB · 텔레그램 봇 토큰 · 수신 chat · 외부 계정)은 앱 `.env` 에 남는다 — 격리 검사(check_env)가 앱 단위로 지킨다.
그래서 루트 `.env` 에 다른 키가 있어도 **넘기지 않는다**(실수로 넣은 봇 토큰·DB URL 이 앱으로 새지 않게). 값은 출력하지 않는다.

셸 export 가 이긴다(006 ㉕ · check_env.effective_env 와 같은 규칙) — 이미 셸에 있는 키는 넘기지 않는다.
dotenv·Next 는 이미 있는 process.env 를 덮지 않으므로, 넘긴 값은 앱 `.env` 의 같은 키보다 우선한다.

사용 (run.sh 가 부른다):  python3 platform_env.py <pleiades root>
  stdout: 넘길 `KEY=VALUE` 를 NUL 로 구분 · stderr: 무시한 키 이름(값 없음)
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_env import LINE  # noqa: E402

PLATFORM_KEY = re.compile(r"^(?:NOTIFY_[A-Z0-9_]+|DISCORD_WEBHOOK_[A-Z0-9_]+)$")


def parse_value(raw: str) -> str | None:
    """dotenv 값 — 따옴표 값은 닫는 따옴표까지, 그 뒤는 공백·`#주석` 만 허용. 따옴표 없는 값은 ` #` 앞까지.

    check_env.parse_dotenv 는 검사용이라 인라인 주석을 값에 남겨도 해가 없었지만, 여기서 만든 값은 **그대로 앱에 들어가고
    앱 .env 보다 우선한다** — `KEY="discord"  # 주석` 이 `"discord"  # 주석` 으로 넘어가면 전환이 조용히 무시된다
    (#143 사전 리뷰 major). 해석할 수 없으면 None(넘기지 않는다).
    """
    raw = raw.strip()
    if raw[:1] in ("'", '"'):
        end = raw.find(raw[0], 1)
        if end < 0:
            return None
        rest = raw[end + 1 :].strip()
        return raw[1:end] if rest == "" or rest.startswith("#") else None
    cut = re.search(r"\s#", raw)
    return (raw[: cut.start()] if cut else raw).strip()


def read_root_env(path: Path) -> tuple[dict[str, str], list[str]]:
    """(키·값, 해석 못 한 키 이름)."""
    values: dict[str, str] = {}
    bad: list[str] = []
    if not path.exists():
        return values, bad
    for line in path.read_text(encoding="utf-8").splitlines():
        m = LINE.match(line)
        if not m or line.lstrip().startswith("#"):
            continue
        v = parse_value(m.group(2))
        if v is None:
            bad.append(m.group(1))
        else:
            values[m.group(1)] = v
    return values, bad


def platform_env(root: Path, environ: dict[str, str]) -> tuple[dict[str, str], list[str]]:
    """(넘길 키·값, 무시한 키 이름) — 셸에 이미 있는 플랫폼 키는 넘기지 않는다. 해석 못 한 플랫폼 키는 ValueError."""
    file_env, bad = read_root_env(root / ".env")
    bad_platform = sorted(k for k in bad if PLATFORM_KEY.match(k))
    if bad_platform:
        raise ValueError(f"루트 .env 값을 해석할 수 없다(따옴표 짝 · 닫는 따옴표 뒤 글자) — {', '.join(bad_platform)}")
    passed = {k: v for k, v in file_env.items() if PLATFORM_KEY.match(k) and k not in environ}
    ignored = sorted({k for k in file_env if not PLATFORM_KEY.match(k)} | set(bad))
    return passed, ignored


def main() -> int:
    if len(sys.argv) != 2:
        print("사용: platform_env.py <pleiades root>", file=sys.stderr)
        return 2
    try:
        passed, ignored = platform_env(Path(sys.argv[1]), dict(os.environ))
    except (ValueError, UnicodeDecodeError, OSError) as e:
        # 값은 싣지 않는다 — 키 이름·원인만
        print(f"platform_env: 중단 — {e.__class__.__name__}: {e if isinstance(e, ValueError) else '루트 .env 를 읽을 수 없다'}", file=sys.stderr)
        return 1
    if ignored:
        print(f"platform_env: 루트 .env 의 플랫폼 키가 아닌 것은 넘기지 않는다 — {', '.join(ignored)}", file=sys.stderr)
    for k, v in passed.items():
        if "\0" in v:
            print(f"platform_env: 중단 — {k} 값에 NUL 이 있다", file=sys.stderr)
            return 1
        sys.stdout.write(f"{k}={v}\0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
