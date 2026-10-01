"""apps/<app>/.env 작성 (#118 · 006 L-2) — 템플릿이 실효 env 검사를 통과하는지 · 덮어쓰지 않는지.

실행: python3 -m unittest discover -s tools/local
"""

import io
import stat
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import check_env  # noqa: E402
import write_env as w  # noqa: E402


class WriteEnvTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for app in ("finance", "fitness"):
            (self.root / "apps" / app).mkdir(parents=True)
        shim = self.root / "bin" / "claude"
        shim.parent.mkdir()
        shim.write_text("#!/bin/sh\nexit 1\n")
        shim.chmod(shim.stat().st_mode | stat.S_IXUSR)

    def tearDown(self):
        self.tmp.cleanup()

    def run_main(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            rc = w.main([*argv, "--root", str(self.root)])
        return rc, out.getvalue(), err.getvalue()

    def test_real_templates_pass_and_are_private(self):
        for app, d in (("fin", "finance"), ("fit", "fitness")):
            rc, out, err = self.run_main(app)
            self.assertEqual(rc, 0, err)
            target = self.root / "apps" / d / ".env"
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)
            env = check_env.parse_dotenv(target)
            self.assertTrue(env["DATABASE_URL"].endswith(f"/pleiades_{app}"))
            self.assertEqual(env["TELEGRAM_BOT_TOKEN"], "")
            for tok in ("__PGUSER__", "__SECRET__", "__PIN__"):
                self.assertNotIn(tok, target.read_text())
            for k, v in env.items():  # 값은 출력하지 않는다
                if "SECRET" in k or k == "AUTH_PIN":
                    self.assertNotIn(v, out + err)

    def test_secrets_differ_per_slot_and_run(self):
        text = "A=__SECRET__\nB=__SECRET__\nP=__PIN__\nU=__PGUSER__\n"
        r1, r2 = w.render(text, pguser="me"), w.render(text, pguser="me")
        a1, b1 = (line.split("=", 1)[1] for line in r1.splitlines()[:2])
        self.assertNotEqual(a1, b1)
        self.assertNotEqual(r1, r2)
        self.assertIn("U=me", r1)
        self.assertRegex(r1, r"P=\d{6}\n")

    def test_refuses_to_overwrite(self):
        target = self.root / "apps" / "finance" / ".env"
        target.write_text("KEEP=1\n")
        rc, _, err = self.run_main("fin")
        self.assertEqual(rc, 1)
        self.assertIn("이미 있다", err)
        self.assertEqual(target.read_text(), "KEEP=1\n")

    def test_bad_template_is_rejected(self):
        bad = "DATABASE_URL=postgresql://u@localhost:5432/myfinance\nPORT=4100\n"
        found = w.validate("fin", bad, self.root)
        keys = {p.key for p in found}
        self.assertIn("DATABASE_URL", keys)
        self.assertIn("PORT", keys)

    def test_no_temp_file_left_in_app_dir(self):
        self.run_main("fit")
        names = sorted(p.name for p in (self.root / "apps" / "fitness").iterdir())
        self.assertEqual(names, [".env"])


if __name__ == "__main__":
    unittest.main()
