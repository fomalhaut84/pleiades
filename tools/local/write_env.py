#!/usr/bin/env python3
"""apps/<app>/.env 를 루트 템플릿에서 새로 쓴다 (#118 · M-2 · 006 §4-5 L-2).

복사 금지 3종(원본 .env · repos/*/.env · .env.example — 서비스 DB·포트를 가리킨다)을 대신한다.
  ① 템플릿은 tools/local/env/<app>.env (apps/* 밖)
  ② __PGUSER__ = 현재 OS 사용자 · __SECRET__ = 매번 새 난수 · __PIN__ = 6자리 난수
  ③ 이미 있으면 덮어쓰지 않는다 — 지우고 다시 돌린다
  ④ 쓰기 전에 check_env 의 파일 단위 검사(DB · 포트 · 비워야 할 키)를 통과해야 한다. 값은 출력하지 않는다
  ⑤ 권한 0600

사용: python3 tools/local/write_env.py <fin|fit>
종료 코드: 0 성공 · 1 거부 · 2 사용 오류
"""

from __future__ import annotations

import argparse
import getpass
import os
import secrets
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import check_env  # noqa: E402

ROOT = HERE.parents[1]


def render(template: str, *, pguser: str) -> str:
    out = template.replace("__PGUSER__", pguser)
    while "__SECRET__" in out:  # 자리마다 다른 값
        out = out.replace("__SECRET__", secrets.token_urlsafe(32), 1)
    out = out.replace("__PIN__", f"{secrets.randbelow(10**6):06d}")
    left = [tok for tok in ("__PGUSER__", "__SECRET__", "__PIN__") if tok in out]
    if left:  # token_urlsafe 는 '_' 를 낼 수 있다 — 넓은 "__" 검사는 오탐이다
        raise ValueError("채워지지 않은 자리표시자가 남았다")
    return out


def validate(app: str, text: str, root: Path) -> list[check_env.Problem]:
    """파일만 본다 — 셸 env·봇 토큰 id 는 run.sh 가 실행 때 다시 본다."""
    # 앱 디렉터리 밖 임시 파일로 파싱한다 — 안에 두면 check_env 의 `.env.*` 부재 검사에 걸린다
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d) / ".env"
        tmp.write_text(text)
        env = check_env.parse_dotenv(tmp)
    env["PATH"] = str(root / "bin")  # fin advisor 검사는 run.sh 가 넣는 shim PATH 기준
    return check_env.problems(app, env, cwd=root / "apps" / check_env.APP_DIRS[app], root=root,
                              bot_ids=set(), chat_ids=set(), other_token_id="")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("app", choices=sorted(check_env.APP_DIRS))
    ap.add_argument("--root", default=str(ROOT), help="pleiades 루트 (테스트용)")
    args = ap.parse_args(argv)
    root = Path(args.root)
    app_dir = root / "apps" / check_env.APP_DIRS[args.app]
    if not app_dir.is_dir():
        print(f"write_env: 중단 — {app_dir} 가 없다", file=sys.stderr)
        return 1
    target = app_dir / ".env"
    if target.exists():
        print(f"write_env: 거부 — {target} 가 이미 있다 (덮어쓰지 않는다 · 다시 만들려면 지우고 돌린다)", file=sys.stderr)
        return 1
    text = render((HERE / "env" / f"{args.app}.env").read_text(), pguser=getpass.getuser())
    found = validate(args.app, text, root)
    if found:
        print(f"write_env: 중단 — 템플릿이 실효 env 검사를 통과하지 못한다 {len(found)}건", file=sys.stderr)
        for p in found:
            print(f"  · {p}", file=sys.stderr)
        return 1
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(text)
    print(f"write_env: {target} 작성 (0600 · 값은 출력하지 않는다)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
