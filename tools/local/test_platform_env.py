"""루트 .env 플랫폼 키 전달 (#143 · M-6a-2).

실행: python3 -m unittest discover -s tools/local
"""

import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import platform_env as p  # noqa: E402


class PlatformEnv(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_no_root_env(self):
        self.assertEqual(p.platform_env(self.root, {}), ({}, []))

    def test_only_platform_keys_pass(self):
        (self.root / ".env").write_text(
            'NOTIFY_ALLOWED_CHANNEL="discord"\n'
            "DISCORD_WEBHOOK_FINANCE=https://discord.com/api/webhooks/1/t\n"
            "TELEGRAM_BOT_TOKEN=111:secret\nDATABASE_URL=postgresql://svc/prod\n# NOTIFY_ADMIN_CHANNEL=discord\n"
        )
        passed, ignored = p.platform_env(self.root, {})
        self.assertEqual(passed, {"NOTIFY_ALLOWED_CHANNEL": "discord",
                                  "DISCORD_WEBHOOK_FINANCE": "https://discord.com/api/webhooks/1/t"})
        self.assertEqual(ignored, ["DATABASE_URL", "TELEGRAM_BOT_TOKEN"])

    def test_shell_wins(self):
        (self.root / ".env").write_text("NOTIFY_ALLOWED_CHANNEL=discord\n")
        self.assertEqual(p.platform_env(self.root, {"NOTIFY_ALLOWED_CHANNEL": ""})[0], {})

    def test_lowercase_or_lookalike_keys_do_not_pass(self):
        (self.root / ".env").write_text("notify_x=1\nXNOTIFY_A=1\nDISCORD_WEBHOOK=1\nDISCORD_TOKEN=1\n")
        passed, ignored = p.platform_env(self.root, {})
        self.assertEqual(passed, {})
        self.assertEqual(len(ignored), 4)

    # 회귀: #143 사전 리뷰 major — 값 뒤 인라인 주석이 값에 섞이면 Discord 전환이 조용히 무시된다
    def test_inline_comment_is_not_part_of_value(self):
        (self.root / ".env").write_text(
            'NOTIFY_ALLOWED_CHANNEL="discord"   # 주석\n'
            "NOTIFY_ADMIN_CHANNEL=discord # 주석\n"
            "DISCORD_WEBHOOK_FINANCE='https://discord.com/api/webhooks/1/t#frag'\n"
            "DISCORD_WEBHOOK_FITNESS=https://discord.com/api/webhooks/2/t#x\n"
        )
        passed, _ = p.platform_env(self.root, {})
        self.assertEqual(passed["NOTIFY_ALLOWED_CHANNEL"], "discord")
        self.assertEqual(passed["NOTIFY_ADMIN_CHANNEL"], "discord")
        self.assertEqual(passed["DISCORD_WEBHOOK_FINANCE"], "https://discord.com/api/webhooks/1/t#frag")
        self.assertEqual(passed["DISCORD_WEBHOOK_FITNESS"], "https://discord.com/api/webhooks/2/t#x")

    def test_unparsable_platform_value_raises(self):
        for line in ('NOTIFY_ALLOWED_CHANNEL="discord\n', 'NOTIFY_ALLOWED_CHANNEL="discord" x\n'):
            with self.subTest(line=line):
                (self.root / ".env").write_text(line)
                with self.assertRaises(ValueError):
                    p.platform_env(self.root, {})

    def test_unparsable_non_platform_value_is_just_ignored(self):
        (self.root / ".env").write_text('TELEGRAM_BOT_TOKEN="111:x\nNOTIFY_ALLOWED_CHANNEL=discord\n')
        passed, ignored = p.platform_env(self.root, {})
        self.assertEqual(passed, {"NOTIFY_ALLOWED_CHANNEL": "discord"})
        self.assertEqual(ignored, ["TELEGRAM_BOT_TOKEN"])

    def test_main_never_prints_values_to_stderr(self):
        (self.root / ".env").write_text("TELEGRAM_BOT_TOKEN=111:topsecret\nNOTIFY_ALLOWED_CHANNEL=discord\n")
        r = subprocess.run([sys.executable, str(HERE / "platform_env.py"), str(self.root)],
                           capture_output=True, text=True, check=False)
        self.assertEqual(r.returncode, 0)
        self.assertNotIn("topsecret", r.stderr + r.stdout)
        self.assertIn("TELEGRAM_BOT_TOKEN", r.stderr)
        self.assertEqual(r.stdout, "NOTIFY_ALLOWED_CHANNEL=discord\0")


class RunShPlatform(unittest.TestCase):
    """run.sh 가 루트 플랫폼 키만 앱 프로세스에 넘긴다."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for app in ("finance", "fitness"):
            (self.root / "apps" / app).mkdir(parents=True)
        shim = self.root / "bin" / "claude"
        shim.parent.mkdir()
        shim.write_text("#!/bin/sh\nexit 1\n")
        shim.chmod(shim.stat().st_mode | stat.S_IXUSR)
        (self.root / "apps/fitness/.env").write_text(
            "DATABASE_URL=postgresql://u:p@localhost:5432/pleiades_fit\nPORT=4600\nCLAUDE_BIN=/nonexistent/x\n"
            "NOTIFY_ALLOWED_CHANNEL=telegram\n")

    def tearDown(self):
        self.tmp.cleanup()

    def run_sh(self, script, **env):
        node = shutil.which("node")
        if node is None:
            self.skipTest("node 없음")
        full = {"PATH": f"{os.path.dirname(node)}:/usr/bin:/bin", "PLEIADES_ROOT": str(self.root), **env}
        return subprocess.run(["bash", str(HERE / "run.sh"), "fit", "--", "node", "-e", script],
                              capture_output=True, text=True, env=full, check=False)

    def test_platform_keys_reach_app_and_win_over_app_env(self):
        (self.root / ".env").write_text(
            "NOTIFY_ALLOWED_CHANNEL=discord\nDISCORD_WEBHOOK_FITNESS=https://discord.com/api/webhooks/9/a b\n"
            "TELEGRAM_BOT_TOKEN=111:leak\n")
        r = self.run_sh("const e=process.env;console.log([e.NOTIFY_ALLOWED_CHANNEL,e.DISCORD_WEBHOOK_FITNESS,"
                        "e.TELEGRAM_BOT_TOKEN||'unset'].join('|'))")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.strip(), "discord|https://discord.com/api/webhooks/9/a b|unset")
        self.assertNotIn("leak", r.stderr)

    # 회귀: #143 사전 리뷰 major — platform_env 가 실패하면 기동하지 않는다(프로세스 치환은 종료 코드를 잃는다)
    def test_broken_root_env_blocks_start(self):
        for content in (b"NOTIFY_ALLOWED_CHANNEL=\xff\xfe\n", b'NOTIFY_ALLOWED_CHANNEL="discord\n'):
            with self.subTest(content=content):
                (self.root / ".env").write_bytes(content)
                r = self.run_sh("console.log('should-not-run')")
                self.assertEqual(r.returncode, 1)
                self.assertNotIn("should-not-run", r.stdout)
                self.assertIn("run.sh: 중단", r.stderr)

    def test_no_root_env_is_fine(self):
        r = self.run_sh("console.log(process.env.NOTIFY_ALLOWED_CHANNEL||'unset')")
        self.assertEqual((r.returncode, r.stdout.strip()), (0, "unset"), r.stderr)


if __name__ == "__main__":
    unittest.main()
