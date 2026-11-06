"""deploy/discord-switch.sh · discord-switch.cjs — Discord 플랫폼 설정 점검 (#314 · 009 D-5 B1 #502).

실행: python3 -m unittest discover -s deploy
Discord 에는 보내지 않는다(로컬 HTTP 스텁 · PLEIADES_DISCORD_BASE) · pm2 는 스텁. 핵심 계약: 값(웹훅 · 토큰 · ID)을
출력하지 않는다 · 파일을 바꾸지 않는다 · 봇을 재시작하지 않는다 · 도는 프로세스가 이 파일을 읽어야 통과.
옛 on·off(스위치 쓰기 · 봇 재시작 · 옛 채널 되돌리기)는 B1 에서 지웠다.
"""
import http.server
import json
import os
import shutil
import stat
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SH = HERE / "discord-switch.sh"
BASE_PATH = "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"
NODE_DIR = str(Path(shutil.which("node") or "/usr/bin/node").parent)

HOOK = "https://discord.com/api/webhooks/{n}/SECRETHOOK{n}"
FULL = "\n".join([
    "# 플랫폼 설정",
    'NOTIFY_ALLOWED_CHANNEL=""',
    'NOTIFY_ADMIN_CHANNEL=""',
    f'DISCORD_WEBHOOK_FINANCE="{HOOK.format(n=111)}"',
    f'DISCORD_WEBHOOK_FITNESS="{HOOK.format(n=222)}"',
    f'DISCORD_WEBHOOK_ADMIN="{HOOK.format(n=333)}"',
    f'DISCORD_WEBHOOK_DEPLOY="{HOOK.format(n=444)}"',
    'NOTIFY_INTERACTIVE_CHANNEL=""',
    'DISCORD_BOT_TOKEN_FINANCE="BOTSECRETFIN.aaaaaaaaaaaaaaaaaaaa"',
    'DISCORD_BOT_TOKEN_FITNESS="BOTSECRETFIT.bbbbbbbbbbbbbbbbbbbb"',
    'DISCORD_CHANNEL_ID_FINANCE="123456789012345678"',
    'DISCORD_CHANNEL_ID_FITNESS="223456789012345678"',
    'DISCORD_ALLOWED_USER_IDS="323456789012345678"',
    "",
])
SECRETS = ("SECRETHOOK", "BOTSECRET", "123456789012345678", "223456789012345678", "323456789012345678")

# pm2 스텁 — jlist 만(점검은 봇을 재시작하지 않는다 · restart 가 불리면 STUB_CALLS 에 남는다)
PM2_STUB = r"""#!/usr/bin/env bash
case "$1" in
  restart) echo "restart $2" >> "$STUB_CALLS" ;;
  jlist)
    s=${STUB_ONLINE:-online}
    echo "[PM2][WARN] 경고 줄"
    e=${STUB_ENV_FILE:-}
    p() { echo "{\"name\":\"$1\",\"pm2_env\":{\"status\":\"$2\",\"PLEIADES_ENV_FILE\":\"$e\"}}"; }
    echo "[$(p pleiades-fin-web online),$(p pleiades-fin-bot "$s"),$(p pleiades-fin-mcp online),$(p pleiades-fit-web online),$(p pleiades-fit-bot "$s")]" ;;
esac
"""


class Stub(http.server.BaseHTTPRequestHandler):
    calls: list = []
    status = 204

    def do_POST(self):  # noqa: N802
        body = self.rfile.read(int(self.headers.get("content-length", 0)))
        Stub.calls.append((self.path, self.headers.get("authorization"), json.loads(body)))
        self.send_response(Stub.status)
        self.end_headers()

    def log_message(self, *a):
        pass


class DiscordSwitch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Stub)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        Stub.calls = []
        Stub.status = 204
        self._tmp = tempfile.TemporaryDirectory()
        t = Path(self._tmp.name)
        self.home = t / "home"
        self.home.mkdir()
        self.bin = t / "bin"
        self.bin.mkdir()
        (self.bin / "pm2").write_text(PM2_STUB)
        (self.bin / "pm2").chmod(0o755)
        self.calls = t / "calls"
        self.env_file = self.home / "pleiades-platform.env"
        self.write_env(FULL)

    def tearDown(self):
        self._tmp.cleanup()

    def write_env(self, text: str, mode: int = 0o600) -> None:
        self.env_file.write_text(text)
        self.env_file.chmod(mode)

    def run_sh(self, *args: str, **extra: str) -> subprocess.CompletedProcess:
        env = {
            "PATH": f"{self.bin}:{NODE_DIR}:{BASE_PATH}",
            "HOME": str(self.home),
            "PLEIADES_TEST": "1",
            "PLEIADES_DISCORD_BASE": f"http://127.0.0.1:{self.server.server_port}",
            "STUB_CALLS": str(self.calls),
            "STUB_ENV_FILE": str(self.env_file),
            **extra,
        }
        r = subprocess.run(["bash", str(SH), *args], capture_output=True, text=True, env=env, timeout=60)
        for s in SECRETS:
            self.assertNotIn(s, r.stdout + r.stderr, f"값이 출력됐다: {s}")
        return r

    def switches(self) -> dict:
        out = {}
        for line in self.env_file.read_text().splitlines():
            if line.startswith("NOTIFY_") and "=" in line:
                k, v = line.split("=", 1)
                out[k] = v
        return out

    def test_check_sends_probe_to_four_webhooks_and_two_bot_channels(self):
        r = self.run_sh("check")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("키 9/9 채움", r.stdout)
        self.assertIn("시험 전송 웹훅 4/4 · 봇 2/2", r.stdout)
        self.assertIn("결과: 통과", r.stdout)
        paths = sorted(p for p, _, _ in Stub.calls)
        self.assertEqual(len(paths), 6)
        self.assertIn("/api/v10/channels/123456789012345678/messages", paths)
        bot = [c for c in Stub.calls if c[0].startswith("/api/v10/channels/")]
        self.assertTrue(all(a and a.startswith("Bot ") for _, a, _ in bot))
        self.assertTrue(all(b["allowed_mentions"] == {"parse": []} for _, _, b in Stub.calls))
        self.assertEqual(self.switches()["NOTIFY_ALLOWED_CHANNEL"], '""', "check 는 바꾸지 않는다")
        self.assertFalse(self.calls.exists(), "check 는 봇을 재시작하지 않는다")

    def test_check_fails_on_missing_and_malformed_keys_without_values(self):
        text = FULL.replace(f'DISCORD_WEBHOOK_DEPLOY="{HOOK.format(n=444)}"', 'DISCORD_WEBHOOK_DEPLOY=""')
        text = text.replace('DISCORD_CHANNEL_ID_FITNESS="223456789012345678"', 'DISCORD_CHANNEL_ID_FITNESS="#fitness"')
        self.write_env(text)
        r = self.run_sh("check")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("비어 있음 DISCORD_WEBHOOK_DEPLOY", r.stdout)
        self.assertIn("형식 오류 1 (DISCORD_CHANNEL_ID_FITNESS)", r.stdout)
        self.assertEqual(Stub.calls, [], "점검 실패면 보내지 않는다")

    def test_check_reports_failed_probe_by_alias_only(self):
        Stub.status = 401
        r = self.run_sh("check")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("FINANCE HTTP 401", r.stdout)

    def test_permission_must_be_600(self):
        self.write_env(FULL, 0o644)
        r = self.run_sh("check", "--no-send")
        self.assertEqual(r.returncode, 1)
        self.assertIn("권한이 600 이 아니다", r.stdout)

    def test_check_does_not_change_file_or_restart(self):
        before = self.env_file.read_bytes()
        r = self.run_sh("check", "--no-send")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("시험 전송 생략(--no-send)", r.stdout)
        self.assertEqual(self.env_file.read_bytes(), before)
        self.assertEqual(stat.S_IMODE(self.env_file.stat().st_mode), 0o600)
        self.assertFalse(self.calls.exists(), "점검은 봇을 재시작하지 않는다")
        self.assertEqual(Stub.calls, [])

    # 회귀: #502 — S0(.server-scripts) 가 state 출력의 `=discord` 개수를 센다 · discord 가 아니면 `미설정`(옛 채널 이름이 아니다)
    def test_state_prints_discord_or_unset_never_legacy_channel(self):
        self.write_env(FULL.replace('NOTIFY_ADMIN_CHANNEL=""', 'NOTIFY_ADMIN_CHANNEL="discord"'))
        r = subprocess.run(["node", str(HERE / "discord-switch.cjs"), "state", str(self.env_file)], capture_output=True, text=True, timeout=30)
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("F 스위치 ALLOWED=미설정 ADMIN=discord INTERACTIVE=미설정 DEPLOY=미설정", r.stdout)
        self.assertNotIn("telegram", r.stdout)
        self.assertEqual(r.stdout.count("=discord"), 1)

    def test_cjs_has_no_set_command(self):
        before = self.env_file.read_bytes()
        r = subprocess.run(["node", str(HERE / "discord-switch.cjs"), "set", str(self.env_file), "discord"], capture_output=True, text=True, timeout=30)
        self.assertEqual(r.returncode, 1)
        self.assertIn("사용법: <check|state>", r.stdout)
        self.assertEqual(self.env_file.read_bytes(), before)

    def test_running_processes_must_read_this_file(self):
        r = self.run_sh("check", "--no-send", STUB_ENV_FILE="/elsewhere/pleiades-platform.env")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("DIFF/MISSING 4", r.stdout)
        self.assertIn("PLEIADES_ENV_FILE 이 이 파일과 다르거나", r.stdout)
        self.assertNotIn("elsewhere", r.stdout)
        self.assertEqual(self.switches()["NOTIFY_ALLOWED_CHANNEL"], '""')
        self.assertFalse(self.calls.exists())

    def test_usage(self):
        for args in (("on",), ("off",), ("on", "--no-send"), ("bogus",), ()):
            with self.subTest(args=args):
                self.assertEqual(self.run_sh(*args).returncode, 2)
        self.assertFalse(self.calls.exists())

    def test_refuses_on_darwin_outside_tests(self):
        if os.uname().sysname != "Darwin":
            self.skipTest("Darwin 전용")
        env = {"PATH": f"{self.bin}:{NODE_DIR}:{BASE_PATH}", "HOME": str(self.home)}
        r = subprocess.run(["bash", str(SH), "check", "--no-send"], capture_output=True, text=True, env=env, timeout=30)
        self.assertEqual(r.returncode, 1)
        self.assertIn("서버 전용", r.stdout)


if __name__ == "__main__":
    unittest.main()
