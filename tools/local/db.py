#!/usr/bin/env python3
"""로컬 5432 의 pleiades_* DB 생성·삭제 — 유일한 입구 (#118 · M-2 · 006 §4-5 L-1 · isolation.md I-14).

로컬 5432 는 사용자 개발 DB(myfinance · myfitness · …)와 **공유**다. 이 스크립트는
  ① 이름을 인자로 받지 않는다 — 앱(fin|fit)만 받고 이름은 고정 표에서 만든다
  ② 호스트·포트를 명령줄에 박는다(-h localhost -p 5432) · 대상을 바꾸는 PG* 환경변수를 지운다
  ③ drop 은 `--confirm <DB 이름>` 문자열이 정확히 일치할 때만 실행한다
run.sh 는 DB 관리 명령을 거부한다(precheck · 앱 명령만) — 그 자리가 여기다.

사용:
  python3 tools/local/db.py create fin                       # 있으면 아무것도 하지 않는다
  python3 tools/local/db.py drop fin --confirm pleiades_fin
  python3 tools/local/db.py status fin
종료 코드: 0 성공 · 1 실패·거부 · 2 사용 오류
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys

DB_NAMES = {"fin": "pleiades_fin", "fit": "pleiades_fit"}
HOST = "localhost"
PORT = "5432"
# 연결 대상·자격을 바꾸는 libpq 환경변수 — 명령줄 -h/-p 보다 약하지만 PGSERVICE·PGHOSTADDR 등은 대상을 바꿀 수 있다
PG_TARGET_ENV = ("PGHOST", "PGHOSTADDR", "PGPORT", "PGDATABASE", "PGSERVICE", "PGSERVICEFILE", "PGSYSCONFDIR", "PGOPTIONS")
CONN = ["-h", HOST, "-p", PORT]


def clean_env(environ: dict[str, str]) -> dict[str, str]:
    return {k: v for k, v in environ.items() if k not in PG_TARGET_ENV}


def _run(argv: list[str], env: dict[str, str]) -> subprocess.CompletedProcess:
    return subprocess.run(argv, env=env, capture_output=True, text=True)


def exists(name: str, env: dict[str, str]) -> bool:
    # name 은 DB_NAMES 의 고정값이다 — 사용자 입력이 SQL 에 들어가지 않는다
    sql = f"SELECT 1 FROM pg_database WHERE datname = '{name}'"
    r = _run(["psql", *CONN, "-d", "postgres", "-tAc", sql], env)
    if r.returncode != 0:
        raise RuntimeError(f"psql 실패 (exit {r.returncode}): {r.stderr.strip()}")
    return r.stdout.strip() == "1"


def create(app: str, env: dict[str, str]) -> int:
    name = DB_NAMES[app]
    if exists(name, env):
        print(f"db: {name} 이미 있다 — 아무것도 하지 않는다")
        return 0
    r = _run(["createdb", *CONN, name], env)
    if r.returncode != 0:
        print(f"db: createdb {name} 실패: {r.stderr.strip()}", file=sys.stderr)
        return 1
    print(f"db: {name} 생성 ({HOST}:{PORT})")
    return 0


def drop(app: str, confirm: str | None, env: dict[str, str]) -> int:
    name = DB_NAMES[app]
    if confirm != name:
        print(f"db: 거부 — drop 은 --confirm {name} 이 정확히 일치해야 한다 (L-1 · I-14)", file=sys.stderr)
        return 1
    if not exists(name, env):
        print(f"db: {name} 없다 — 아무것도 하지 않는다")
        return 0
    r = _run(["dropdb", *CONN, name], env)
    if r.returncode != 0:
        print(f"db: dropdb {name} 실패: {r.stderr.strip()}", file=sys.stderr)
        return 1
    print(f"db: {name} 삭제 ({HOST}:{PORT})")
    return 0


def status(app: str, env: dict[str, str]) -> int:
    name = DB_NAMES[app]
    print(f"db: {name} {'있음' if exists(name, env) else '없음'} ({HOST}:{PORT})")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("action", choices=("create", "drop", "status"))
    ap.add_argument("app", choices=sorted(DB_NAMES))
    ap.add_argument("--confirm", default=None, help="drop 전용 — DB 이름을 그대로 적는다")
    args = ap.parse_args(argv)
    if args.confirm is not None and args.action != "drop":
        ap.error("--confirm 은 drop 에만 쓴다")
    env = clean_env(dict(os.environ))
    try:
        if args.action == "create":
            return create(args.app, env)
        if args.action == "drop":
            return drop(args.app, args.confirm, env)
        return status(args.app, env)
    except (RuntimeError, FileNotFoundError) as e:
        print(f"db: 중단 — {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
