"""로컬 기동·migrate 전 실효 env 검사 (#104 · 006 §4-5 L-2·L-3·L-4·L-5·L-6·L-7 · I-4·I-7·I-14).

실행: python3 -m unittest discover -s tools/local
"""

import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import check_env as c  # noqa: E402

GOOD_FIT = {
    "DATABASE_URL": "postgresql://u:p@localhost:5432/pleiades_fit?schema=public",
    "PORT": "4600", "MCP_PORT": "4601",
    "TELEGRAM_BOT_TOKEN": "111:secret", "TELEGRAM_ALLOWED_CHAT_IDS": "-100",
    "CLAUDE_BIN": "/nonexistent/claude-disabled",
    "GARMIN_EMAIL": "", "GARMIN_PASSWORD": "", "MFDS_API_KEY": "",
}
OPTS = {"bot_ids": {"111", "222"}, "chat_ids": {"-100"}}


class Base(unittest.TestCase):
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

    def problems(self, app, env, cwd=None, **opts):
        cwd = cwd or self.root / "apps" / {"fin": "finance", "fit": "fitness"}[app]
        return c.problems(app, env, cwd=cwd, root=self.root, **{**OPTS, **opts})

    def keys(self, *a, **k):
        return {p.key for p in self.problems(*a, **k)}


class Fit(Base):
    def test_good_passes(self):
        self.assertEqual(self.problems("fit", GOOD_FIT), [])

    def test_violations(self):
        cases = [
            ({"DATABASE_URL": "postgresql://u:p@db.example.com:5432/pleiades_fit"}, "DATABASE_URL"),
            ({"DATABASE_URL": "postgresql://u:p@localhost:5433/pleiades_fit"}, "DATABASE_URL"),
            ({"DATABASE_URL": "postgresql://u:p@localhost:5432/myfitness"}, "DATABASE_URL"),
            ({"DATABASE_URL": "postgresql://u:p@localhost:5432/pleiades_fin"}, "DATABASE_URL"),
            ({"DATABASE_URL": ""}, "DATABASE_URL"),
            ({"PORT": "4200"}, "PORT"),
            ({"PORT": "3000"}, "PORT"),
            ({"PORT": ""}, "PORT"),
            ({"MCP_PORT": "4301"}, "MCP_PORT"),
            ({"MCP_PORT": "4600"}, "MCP_PORT"),
            ({"TELEGRAM_BOT_TOKEN": "999:x"}, "TELEGRAM_BOT_TOKEN"),
            ({"TELEGRAM_ALLOWED_CHAT_IDS": "-100,555"}, "TELEGRAM_ALLOWED_CHAT_IDS"),
            ({"GARMIN_EMAIL": "me@x.com"}, "GARMIN_EMAIL"),
            ({"MFDS_API_KEY": "k"}, "MFDS_API_KEY"),
            ({"CLAUDE_BIN": ""}, "CLAUDE_BIN"),
            ({"CLAUDE_BIN": "/bin/sh"}, "CLAUDE_BIN"),
            ({"CLAUDE_BIN": "claude"}, "CLAUDE_BIN"),  # 상대 이름은 PATH 로 풀린다
            ({"DOTENV_CONFIG_PATH": "/x/.env"}, "DOTENV_CONFIG_PATH"),
            ({"DOTENV_CONFIG_OVERRIDE": "true"}, "DOTENV_CONFIG_OVERRIDE"),
        ]
        for patch, key in cases:
            with self.subTest(patch=patch):
                self.assertIn(key, self.keys("fit", {**GOOD_FIT, **patch}))

    def test_other_app_same_bot(self):
        self.assertIn("TELEGRAM_BOT_TOKEN", self.keys("fit", GOOD_FIT, other_token_id="111"))

    def test_other_app_same_bot_from_its_env_file(self):
        """PR #110 Codex P2 — OTHER_TOKEN_ID 를 넘기지 않아도 다른 앱 .env 의 봇과 비교한다."""
        (self.root / "apps/finance/.env").write_text("TELEGRAM_BOT_TOKEN=111:other\n")
        self.assertIn("TELEGRAM_BOT_TOKEN", self.keys("fit", GOOD_FIT))
        (self.root / "apps/finance/.env").write_text("TELEGRAM_BOT_TOKEN=222:other\n")
        self.assertEqual(self.problems("fit", GOOD_FIT), [])

    def test_no_token_is_allowed(self):
        self.assertEqual(self.problems("fit", {**GOOD_FIT, "TELEGRAM_BOT_TOKEN": ""}), [])

    def test_wrong_cwd(self):
        self.assertIn("cwd", self.keys("fit", GOOD_FIT, cwd=self.root))

    def test_env_dot_files(self):
        (self.root / "apps/fitness/.env.local").write_text("X=1")
        (self.root / "apps/fitness/.env.example").write_text("X=1")
        self.assertEqual(self.keys("fit", GOOD_FIT), {".env.local"})

    def test_secret_values_never_printed(self):
        text = "\n".join(str(p) for p in self.problems("fit", {**GOOD_FIT, "TELEGRAM_BOT_TOKEN": "999:topsecret",
                                                                  "GARMIN_PASSWORD": "hunter2"}))
        self.assertNotIn("topsecret", text)
        self.assertNotIn("hunter2", text)


class Fin(Base):
    GOOD = {"DATABASE_URL": "postgresql://u:p@127.0.0.1:5432/pleiades_fin", "PORT": "4500",
            "TELEGRAM_BOT_TOKEN": "", "WHOOING_WEBHOOK_URL": ""}

    def test_good_with_shim_first(self):
        env = {**self.GOOD, "PATH": f"{self.root}/bin:/usr/bin:/bin"}
        self.assertEqual(self.problems("fin", env), [])

    def test_claude_not_shimmed(self):
        env = {**self.GOOD, "PATH": "/usr/bin:/bin"}
        self.assertIn("claude", self.keys("fin", env))

    def test_whooing_and_admin_chat(self):
        env = {**self.GOOD, "PATH": f"{self.root}/bin", "WHOOING_WEBHOOK_URL": "https://x",
               "TELEGRAM_BOT_TOKEN": "222:s", "TELEGRAM_ADMIN_CHAT_IDS": "777"}
        self.assertEqual(self.keys("fin", env), {"WHOOING_WEBHOOK_URL", "TELEGRAM_ADMIN_CHAT_IDS"})

    def test_any_chat_id_key_checked(self):
        """회귀: #104 사전 리뷰 major 1 — fin 이 읽는 키는 TELEGRAM_ADMIN_CHAT_IDS 다. 이름을 맞히지 말고 *CHAT_ID* 전부."""
        env = {**self.GOOD, "PATH": f"{self.root}/bin", "TELEGRAM_BOT_TOKEN": "222:s"}
        for key in ("TELEGRAM_ADMIN_CHAT_IDS", "ADMIN_CHAT_IDS", "REPORT_CHAT_ID", "TELEGRAM_ALLOWED_CHAT_IDS"):
            with self.subTest(key=key):
                self.assertIn(key, self.keys("fin", {**env, key: "777"}))
                self.assertNotIn(key, self.keys("fin", {**env, key: "-100"}))


class RunSh(Base):
    """run.sh — L-1 파괴 명령 거부 · 셸 DATABASE_URL 제거 · 검사 통과 시에만 실행."""

    def run_sh(self, *cmd, **env):
        import subprocess
        (self.root / "apps/fitness/.env").write_text(
            "DATABASE_URL=postgresql://u:p@localhost:5432/pleiades_fit\nPORT=4600\nCLAUDE_BIN=/nonexistent/x\n")
        import shutil
        node = shutil.which("node")
        if node is None:
            self.skipTest("node 없음")
        full = {"PATH": f"{os.path.dirname(node)}:/usr/bin:/bin", "PLEIADES_ROOT": str(self.root), **env}
        return subprocess.run(["bash", str(HERE / "run.sh"), "fit", "--", *cmd], capture_output=True, text=True,
                              env=full, check=False)

    def test_runs_when_clean(self):
        r = self.run_sh("node", "-e", "console.log('ran in ' + require('path').basename(process.cwd()))")
        self.assertEqual((r.returncode, r.stdout.strip()), (0, "ran in fitness"), r.stderr)

    def test_shell_database_url_is_dropped(self):
        r = self.run_sh("node", "-e", "console.log(process.env.DATABASE_URL || 'unset')", DATABASE_URL="postgresql://svc@prod/myfitness")
        self.assertEqual(r.stdout.strip(), "unset", r.stderr)

    def test_destructive_prisma_refused(self):
        for cmd in (["npx", "prisma", "migrate", "reset"], ["npx", "prisma", "migrate", "dev"],
                    ["npx", "prisma", "db", "push", "--force-reset"], ["psql", "-c", "drop database x"],
                    ["./deploy/deploy.sh", "dev"], ["npx", "pm2", "start", "ecosystem.config.js"]):
            with self.subTest(cmd=cmd):
                r = self.run_sh(*cmd)
                self.assertEqual(r.returncode, 1)
                self.assertIn("run.sh: 중단", r.stderr)

    def test_violation_blocks(self):
        r = self.run_sh("node", "-e", "console.log('should-not-run')", GARMIN_EMAIL="me@x.com")
        self.assertEqual(r.returncode, 1)
        self.assertNotIn("should-not-run", r.stdout)


class Dotenv(Base):
    def test_shell_wins_over_file(self):
        (self.root / "apps/fitness/.env").write_text(
            '# c\nexport DATABASE_URL="postgresql://u:p@localhost:5432/pleiades_fit"\nPORT=4600\nQ=\'a b\'\n')
        eff = c.effective_env(self.root / "apps/fitness", {"PORT": "4200"})
        self.assertEqual(eff["DATABASE_URL"], "postgresql://u:p@localhost:5432/pleiades_fit")
        self.assertEqual(eff["PORT"], "4200")  # 셸 export 가 이긴다 (006 ㉕)
        self.assertEqual(eff["Q"], "a b")


if __name__ == "__main__":
    unittest.main()
