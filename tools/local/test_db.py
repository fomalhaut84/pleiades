"""pleiades_* DB 생성·삭제 (#118 · 006 L-1 · I-14) — 가짜 psql/createdb/dropdb 로 인자만 본다.

실행: python3 -m unittest discover -s tools/local
"""

import io
import os
import stat
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import db  # noqa: E402

FAKE = """#!/bin/sh
echo "$(basename "$0") $*" >> "$FAKE_LOG"
case "$(basename "$0")" in
  psql) [ -n "$FAKE_PSQL_FAIL" ] && { echo boom >&2; exit 2; }; [ -n "$FAKE_EXISTS" ] && echo 1; exit 0 ;;
  *) exit "${FAKE_RC:-0}" ;;
esac
"""


class DbTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        bindir = Path(self.tmp.name) / "bin"
        bindir.mkdir()
        for name in ("psql", "createdb", "dropdb"):
            p = bindir / name
            p.write_text(FAKE)
            p.chmod(p.stat().st_mode | stat.S_IXUSR)
        self.log = Path(self.tmp.name) / "log"
        self.env = {"PATH": f"{bindir}:/usr/bin:/bin", "FAKE_LOG": str(self.log)}

    def tearDown(self):
        self.tmp.cleanup()

    def run_main(self, *argv, **extra):
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, {**self.env, **extra}, clear=True), redirect_stdout(out), redirect_stderr(err):
            rc = db.main(list(argv))
        return rc, out.getvalue(), err.getvalue()

    def calls(self):
        return self.log.read_text().splitlines() if self.log.exists() else []

    def test_create_uses_fixed_name_and_local_target(self):
        rc, out, _ = self.run_main("create", "fin")
        self.assertEqual(rc, 0)
        self.assertIn("createdb -h localhost -p 5432 pleiades_fin", self.calls())
        self.assertIn("pleiades_fin 생성", out)

    def test_create_is_noop_when_exists(self):
        rc, out, _ = self.run_main("create", "fit", FAKE_EXISTS="1")
        self.assertEqual(rc, 0)
        self.assertFalse(any(c.startswith("createdb") for c in self.calls()))
        self.assertIn("이미 있다", out)

    def test_drop_requires_exact_confirm(self):
        for confirm in (None, "pleiades_fit", "myfinance", "PLEIADES_FIN", "pleiades_fin "):
            argv = ["drop", "fin"] + ([] if confirm is None else ["--confirm", confirm])
            rc, _, err = self.run_main(*argv, FAKE_EXISTS="1")
            self.assertEqual(rc, 1, confirm)
            self.assertIn("거부", err)
        self.assertEqual(self.calls(), [])  # 거부는 DB 에 닿기 전이다

    def test_drop_with_confirm(self):
        rc, _, _ = self.run_main("drop", "fin", "--confirm", "pleiades_fin", FAKE_EXISTS="1")
        self.assertEqual(rc, 0)
        self.assertIn("dropdb -h localhost -p 5432 pleiades_fin", self.calls())

    def test_drop_missing_is_noop(self):
        rc, _, _ = self.run_main("drop", "fit", "--confirm", "pleiades_fit")
        self.assertEqual(rc, 0)
        self.assertFalse(any(c.startswith("dropdb") for c in self.calls()))

    def test_name_not_accepted_as_app(self):
        with self.assertRaises(SystemExit) as cm, redirect_stderr(io.StringIO()):
            db.main(["create", "myfinance"])
        self.assertEqual(cm.exception.code, 2)

    def test_confirm_only_for_drop(self):
        with self.assertRaises(SystemExit), redirect_stderr(io.StringIO()):
            db.main(["create", "fin", "--confirm", "pleiades_fin"])

    def test_pg_target_env_removed(self):
        env = db.clean_env({"PGHOST": "prod", "PGSERVICE": "svc", "PGPORT": "6543", "PGDATABASE": "myfinance", "PATH": "/x"})
        self.assertEqual(env, {"PATH": "/x"})

    def test_psql_failure_stops(self):
        rc, _, err = self.run_main("create", "fin", FAKE_PSQL_FAIL="1")
        self.assertEqual(rc, 1)
        self.assertIn("중단", err)
        self.assertFalse(any(c.startswith("createdb") for c in self.calls()))

    def test_createdb_failure_reported(self):
        rc, _, err = self.run_main("create", "fin", FAKE_RC="1")
        self.assertEqual(rc, 1)
        self.assertIn("실패", err)


if __name__ == "__main__":
    unittest.main()
