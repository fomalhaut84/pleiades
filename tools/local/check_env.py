#!/usr/bin/env python3
"""로컬 기동·migrate 전 실효 env 검사 (#104 · 006 §4-5 L-1~L-7 · isolation.md I-4·I-5·I-6·I-7·I-8·I-12·I-14).

`.env` 만으로는 부족하다 — 셸 export 가 이긴다(006 ㉕). 그래서 **실효 env**(apps/<app>/.env 위에 현재 환경을 덮은 것)를 본다.
값은 출력하지 않는다(비밀) — 키 이름과 이유만.

사용 (cwd = apps/<app> · 보통 tools/local/run.sh 가 부른다):
  PLEIADES_VERIFY_BOT_IDS=<id,id> PLEIADES_VERIFY_CHAT_IDS=<id,…> python3 ../../tools/local/check_env.py <fin|fit> [--other-token-id ID]
종료 코드: 0 통과 · 1 위반 · 2 사용 오류
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
APP_DIRS = {"fin": "finance", "fit": "fitness"}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
DB_PORT = 5432
RESERVED_PORTS = {3000, 4100, 4200, 4210, 4301}  # next dev 기본 · 서비스 fin/fit 웹 · MCP (006 L-3)
MUST_BE_EMPTY = {
    "fin": ("WHOOING_WEBHOOK_URL",),  # 실제 가계부에 기록된다 (L-6)
    "fit": ("GARMIN_EMAIL", "GARMIN_PASSWORD", "MFDS_API_KEY"),  # 서비스 Garmin 세션 · 외부 API (L-5 · L-6)
}
# 수신자 키 이름을 맞히지 않는다 — fin 은 TELEGRAM_ADMIN_CHAT_IDS 를 읽는다(006 L-4 의 "ADMIN_CHAT_IDS" 는 약칭).
# 이름에 CHAT_ID 가 든 키 전부를 검증 채팅과 대조한다 (회귀: #104 사전 리뷰 major 1)
CHAT_KEY = re.compile(r"CHAT_IDS?$|CHAT_ID_", re.IGNORECASE)
# dotenv 동작을 바꾸는 셸 변수 — prisma.config 의 `dotenv/config` 가 다른 파일을 읽거나 셸 값을 덮게 된다
DOTENV_CONTROL = ("DOTENV_CONFIG_PATH", "DOTENV_CONFIG_OVERRIDE", "DOTENV_CONFIG_ENCODING", "DOTENV_KEY")
LINE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$")


@dataclass(frozen=True)
class Problem:
    key: str
    reason: str

    def __str__(self) -> str:
        return f"{self.key}: {self.reason}"


def parse_dotenv(path: Path) -> dict[str, str]:
    out = {}
    if not path.exists():
        return out
    for raw in path.read_text().splitlines():
        m = LINE.match(raw)
        if not m or raw.lstrip().startswith("#"):
            continue
        value = m.group(2)
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        out[m.group(1)] = value
    return out


def effective_env(app_dir: Path, environ: dict[str, str]) -> dict[str, str]:
    """dotenv 는 이미 있는 process.env 를 덮지 않는다 — 셸 값이 이긴다."""
    return {**parse_dotenv(app_dir / ".env"), **environ}


def _ids(value: str) -> set[str]:
    return {v.strip() for v in value.split(",") if v.strip()}


def _check_db(app: str, url: str) -> list[Problem]:
    want = f"pleiades_{app}"
    if not url:
        return [Problem("DATABASE_URL", f"비어 있다 — 로컬 {want} 를 가리켜야 한다")]
    u = urlparse(url)
    db = u.path.lstrip("/")
    bad = []
    if u.scheme not in ("postgres", "postgresql"):
        bad.append("postgres 가 아니다")
    if u.hostname not in LOCAL_HOSTS:
        bad.append("호스트가 로컬이 아니다")
    if u.port != DB_PORT:
        bad.append(f"포트가 {DB_PORT} 가 아니다")
    if db != want:
        bad.append(f"DB 이름이 {want} 가 아니다 (서비스 기본값·다른 앱 DB 금지 · U97-8)")
    return [Problem("DATABASE_URL", " · ".join(bad))] if bad else []


def _check_ports(env: dict[str, str]) -> list[Problem]:
    out, seen = [], set()
    for key in ("PORT", "MCP_PORT"):
        value = env.get(key, "")
        if not value:
            if key == "PORT":
                out.append(Problem(key, "비어 있다 — 기본 3000 · 서비스 포트와 겹치지 않게 명시한다 (L-3)"))
            continue
        if not value.isdigit() or int(value) in RESERVED_PORTS or value in seen:
            out.append(Problem(key, f"예약 포트({sorted(RESERVED_PORTS)})이거나 다른 포트와 겹친다"))
        seen.add(value)
    return out


def _check_telegram(app: str, env: dict[str, str], bot_ids: set[str], chat_ids: set[str],
                    other_token_id: str | None) -> list[Problem]:
    token = env.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        return []  # 봇 미기동 — 검증 토큰 준비 전 (L-4)
    out = []
    bot_id = token.split(":", 1)[0]
    if bot_id not in bot_ids:
        out.append(Problem("TELEGRAM_BOT_TOKEN", "검증 봇 id 허용 목록에 없다 — 서비스 봇이면 409 로 서비스 수신이 끊긴다 (I-4)"))
    elif other_token_id and bot_id == other_token_id:
        out.append(Problem("TELEGRAM_BOT_TOKEN", "다른 앱과 같은 봇이다 — 로컬끼리 409 (L-4)"))
    for key in sorted(k for k in env if CHAT_KEY.search(k)):
        extra = _ids(env.get(key, "")) - chat_ids
        if extra:
            out.append(Problem(key, f"검증 채팅이 아닌 id {len(extra)}개 (I-5)"))
    return out


def _check_advisor(app: str, env: dict[str, str], root: Path) -> list[Problem]:
    if app == "fit":
        path = env.get("CLAUDE_BIN", "")
        if not path.startswith("/") or os.path.exists(path):
            return [Problem("CLAUDE_BIN", "비어 있지 않은 **없는 절대** 경로여야 한다 — 비우거나 이름만 주면 PATH 로 풀린다 (L-7)")]
        return []
    found = shutil.which("claude", path=env.get("PATH", ""))
    shim = os.path.realpath(root / "bin" / "claude")
    if not found or os.path.realpath(found) != shim:
        return [Problem("claude", f"PATH 첫 claude 가 pleiades shim({root / 'bin/claude'})이 아니다 — fin 은 'claude' 하드코딩 (L-7)")]
    return []


def problems(app: str, env: dict[str, str], *, cwd: Path, root: Path = ROOT, bot_ids: set[str],
             chat_ids: set[str], other_token_id: str | None = None) -> list[Problem]:
    if app not in APP_DIRS:
        raise ValueError(f"알 수 없는 앱 {app!r}")
    app_dir = root / "apps" / APP_DIRS[app]
    out = []
    if os.path.realpath(cwd) != os.path.realpath(app_dir):
        out.append(Problem("cwd", f"{app_dir} 에서 실행해야 한다 — .env 와 prisma.config 가 cwd 기준이다"))
    for f in sorted(app_dir.glob(".env.*")):
        if f.name != ".env.example":
            out.append(Problem(f.name, "Next 가 .env 보다 먼저 읽는다 — 지운다 (L-2)"))
    out += [Problem(k, "dotenv 동작을 바꾼다 — 셸에서 지운다 (L-2)") for k in DOTENV_CONTROL if k in env]
    out += _check_db(app, env.get("DATABASE_URL", ""))
    out += _check_ports(env)
    out += _check_telegram(app, env, bot_ids, chat_ids, other_token_id)
    out += [Problem(k, "비워야 한다") for k in MUST_BE_EMPTY[app] if env.get(k)]
    out += _check_advisor(app, env, root)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("app", choices=sorted(APP_DIRS))
    ap.add_argument("--other-token-id", default=None)
    ap.add_argument("--root", default=str(ROOT), help="pleiades 루트 (run.sh 가 넘긴다)")
    args = ap.parse_args()
    cwd = Path.cwd()
    env = effective_env(cwd, dict(os.environ))
    found = problems(args.app, env, cwd=cwd, root=Path(args.root), bot_ids=_ids(os.environ.get("PLEIADES_VERIFY_BOT_IDS", "")),
                     chat_ids=_ids(os.environ.get("PLEIADES_VERIFY_CHAT_IDS", "")),
                     other_token_id=args.other_token_id)
    if not found:
        print(f"check_env: {args.app} 통과")
        return 0
    print(f"check_env: 중단 — {args.app} 실효 env 위반 {len(found)}건 (.claude/rules/isolation.md · 006 §4-5)", file=sys.stderr)
    for p in found:
        print(f"  · {p}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
