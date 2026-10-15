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
from check_env import parse_dotenv  # noqa: E402

PLATFORM_KEY = re.compile(r"^(?:NOTIFY_[A-Z0-9_]+|DISCORD_WEBHOOK_[A-Z0-9_]+)$")


def platform_env(root: Path, environ: dict[str, str]) -> tuple[dict[str, str], list[str]]:
    """(넘길 키·값, 무시한 키 이름) — 셸에 이미 있는 플랫폼 키는 넘기지 않는다."""
    file_env = parse_dotenv(root / ".env")
    passed = {k: v for k, v in file_env.items() if PLATFORM_KEY.match(k) and k not in environ}
    ignored = sorted(k for k in file_env if not PLATFORM_KEY.match(k))
    return passed, ignored


def main() -> int:
    if len(sys.argv) != 2:
        print("사용: platform_env.py <pleiades root>", file=sys.stderr)
        return 2
    passed, ignored = platform_env(Path(sys.argv[1]), dict(os.environ))
    if ignored:
        print(f"platform_env: 루트 .env 의 플랫폼 키가 아닌 것은 넘기지 않는다 — {', '.join(ignored)}", file=sys.stderr)
    for k, v in passed.items():
        if "\0" in v:
            print(f"platform_env: {k} 값에 NUL 이 있다 — 넘기지 않는다", file=sys.stderr)
            continue
        sys.stdout.write(f"{k}={v}\0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
