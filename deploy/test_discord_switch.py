"""deploy/discord-switch.sh · discord-switch.cjs — T-10 Discord 승계 스위치 (#314).

실행: python3 -m unittest discover -s deploy
Discord 에는 보내지 않는다(로컬 HTTP 스텁 · PLEIADES_DISCORD_BASE) · pm2 는 스텁. 핵심 계약: 값(웹훅 · 토큰 · ID)을
출력하지 않는다 · 점검이 실패하면 아무것도 바꾸지 않는다 · on 은 스위치 4줄만 discord 로 · gateway 판정 실패면 텔레그램으로
되돌린다 · off 는 4줄을 비운다 · 파일 권한 600 유지 · 백업은 비공개 위치에.
"""

import http.server
import json
import os
import shutil
import stat
import subprocess
import tempfile
import threading
import time
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

# pm2 스텁 — restart 때 봇 로그에 gateway 줄을 쓴다(STUB_GATEWAY=ok|fatal|none) · jlist 는 STUB_ONLINE 에 따라
PM2_STUB = r"""#!/usr/bin/env bash
case "$1" in
  restart)
    app=${2#pleiades-}; app=${app%-bot}
    # STUB_FAIL_AFTER=n — n 번째 이후 restart 는 실패(첫 봇만 뜨고 나머지·되돌리기 재시작이 실패하는 경우)
    n=$(( $(wc -l < "$STUB_CALLS" 2>/dev/null || echo 0) + 1 ))
    if [[ -n "${STUB_FAIL_AFTER:-}" && $n -gt $STUB_FAIL_AFTER ]]; then echo "restart-fail $2" >> "$STUB_CALLS"; exit 1; fi
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "restart $2" >> "$STUB_CALLS"
    case "${STUB_GATEWAY:-ok}" in
      ok) echo "$ts: [discord-$app] gateway 준비 완료" >> "$PLEIADES_PM2_LOGS/$2-error.log" ;;
      fatal) echo "$ts: [discord-$app] gateway 종료 코드 4004 — 다시 접속하지 않는다(토큰·권한 확인)" >> "$PLEIADES_PM2_LOGS/$2-error.log" ;;
    esac ;;
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
        self.logs = t / "logs"
        self.logs.mkdir()
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
            "PLEIADES_LOCK": "mkdir",
            "PLEIADES_PM2_LOGS": str(self.logs),
            "PLEIADES_DISCORD_BASE": f"http://127.0.0.1:{self.server.server_port}",
            "PLEIADES_READY_WAIT": "6",
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

    def test_on_sets_four_switches_restarts_bots_and_judges_gateway(self):
        r = self.run_sh("on", "--no-send")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("결과: 통과 — Discord 승계", r.stdout)
        self.assertIn("fin 봇 gateway 준비 1 · 종료 코드 0 · 미설정 0", r.stdout)
        self.assertIn("되돌리기: deploy/discord-switch.sh off", r.stdout)
        sw = self.switches()
        for k in ("NOTIFY_ALLOWED_CHANNEL", "NOTIFY_ADMIN_CHANNEL", "NOTIFY_INTERACTIVE_CHANNEL", "NOTIFY_DEPLOY_CHANNEL"):
            self.assertEqual(sw[k], '"discord"', k)
        self.assertEqual(stat.S_IMODE(self.env_file.stat().st_mode), 0o600)
        self.assertIn("SECRETHOOK444", self.env_file.read_text(), "다른 줄은 그대로")
        self.assertIn("# 플랫폼 설정", self.env_file.read_text())
        self.assertEqual(self.calls.read_text().split(), ["restart", "pleiades-fin-bot", "restart", "pleiades-fit-bot"])
        backups = list((self.home / "pleiades-private").glob("platform-env-*.bak"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(stat.S_IMODE((self.home / "pleiades-private").stat().st_mode), 0o700)
        self.assertNotIn('"discord"', backups[0].read_text(), "백업은 바꾸기 전 것")

    def test_on_reverts_to_telegram_when_gateway_fails(self):
        r = self.run_sh("on", "--no-send", STUB_GATEWAY="fatal")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("종료 코드 1", r.stdout)
        self.assertIn("텔레그램으로 되돌렸다", r.stdout)
        self.assertTrue(all(v == '""' for v in self.switches().values()))

    def test_on_reverts_when_bots_not_online(self):
        r = self.run_sh("on", "--no-send", STUB_ONLINE="errored")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertTrue(all(v == '""' for v in self.switches().values()))

    # 회귀: 사전 리뷰 major — 재시작 전에 있던 "준비 완료" 줄(시각이 미래여도)로 통과하지 않는다(바이트 오프셋)
    def test_old_ready_line_does_not_pass(self):
        for b in ("pleiades-fin-bot", "pleiades-fit-bot"):
            app = b.split("-")[1]
            (self.logs / f"{b}-error.log").write_text(f"2099-01-01 00:00:00: [discord-{app}] gateway 준비 완료\n")
        r = self.run_sh("on", "--no-send", STUB_GATEWAY="none")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("fin 봇 gateway 준비 0", r.stdout)
        self.assertTrue(all(v == '""' for v in self.switches().values()))

    # 회귀: 서버 첫 on(2026-10-27) — 봇 로그가 error·out 둘이면 grep -q 가 첫 파일에서 끝나 다음 tail 이 SIGPIPE →
    # pipefail 로 준비를 못 보고 상한까지 기다려 판정 실패했다
    def test_ready_found_with_out_log_after_error_log(self):
        stub = (self.bin / "pm2").read_text().replace(
            '    case "${STUB_GATEWAY:-ok}" in',
            '    head -c 2000000 /dev/zero | tr "\\0" "x" >> "$PLEIADES_PM2_LOGS/$2-out.log"; echo >> "$PLEIADES_PM2_LOGS/$2-out.log"\n'
            '    case "${STUB_GATEWAY:-ok}" in')
        (self.bin / "pm2").write_text(stub)
        r = self.run_sh("on", "--no-send", PLEIADES_READY_WAIT="9")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("대기 0s", r.stdout)

    def test_rotated_log_is_read_from_start(self):
        big = "x" * 5000 + "\n"
        for b in ("pleiades-fin-bot", "pleiades-fit-bot"):
            (self.logs / f"{b}-error.log").write_text(big)
        # 스텁이 restart 때 로그를 비우고(로테이션) 새 줄만 쓴다
        stub = (self.bin / "pm2").read_text().replace('    case "${STUB_GATEWAY:-ok}" in', '    : > "$PLEIADES_PM2_LOGS/$2-error.log"\n    case "${STUB_GATEWAY:-ok}" in')
        (self.bin / "pm2").write_text(stub)
        r = self.run_sh("on", "--no-send")
        self.assertEqual(r.returncode, 0, r.stdout)

    # 회귀: 사전 리뷰 major — 되돌린 뒤 재시작도 실패하면 "되돌렸다" 로 덮지 않는다
    def test_revert_restart_failure_is_reported(self):
        r = self.run_sh("on", "--no-send", STUB_FAIL_AFTER="1")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("되돌림 · 봇 online: 아니오", r.stdout)
        self.assertIn("앞서 뜬 봇은 discord 설정일 수 있다", r.stdout)
        self.assertNotIn("텔레그램으로 되돌렸다", r.stdout)
        self.assertTrue(all(v == '""' for v in self.switches().values()))

    # 회귀: PR #315 Codex P2 — 스위치를 쓴 뒤 신호로 끊기면 텔레그램으로 되돌린다
    def test_signal_after_switch_reverts(self):
        env = {
            "PATH": f"{self.bin}:{NODE_DIR}:{BASE_PATH}", "HOME": str(self.home), "PLEIADES_TEST": "1",
            "PLEIADES_LOCK": "mkdir", "PLEIADES_PM2_LOGS": str(self.logs), "PLEIADES_READY_WAIT": "30",
            "STUB_CALLS": str(self.calls), "STUB_GATEWAY": "none", "STUB_ENV_FILE": str(self.env_file),
        }
        p = subprocess.Popen(["bash", str(SH), "on", "--no-send"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
        for _ in range(100):   # 판정 대기에 들어설 때까지(스위치 discord · 재시작 끝)
            if self.calls.exists() and len(self.calls.read_text().split()) >= 4:
                break
            time.sleep(0.1)
        time.sleep(1)
        self.assertEqual(self.switches()["NOTIFY_ALLOWED_CHANNEL"], '"discord"')
        p.terminate()
        out, _ = p.communicate(timeout=30)
        self.assertEqual(p.returncode, 3, out)
        self.assertIn("중단 신호 — 텔레그램으로 되돌렸다", out)
        self.assertTrue(all(v == '""' for v in self.switches().values()))
        self.assertFalse((self.home / "pleiades-private" / "deploy.lock.d").exists(), "락은 풀린다")

    def test_on_does_nothing_when_check_fails(self):
        self.write_env(FULL.replace('DISCORD_ALLOWED_USER_IDS="323456789012345678"', 'DISCORD_ALLOWED_USER_IDS=""'))
        r = self.run_sh("on", "--no-send")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("바꾸지 않았다", r.stdout)
        self.assertFalse(self.calls.exists())
        self.assertFalse(list((self.home / "pleiades-private").glob("*.bak")))

    def test_off_clears_switches_and_appends_missing_deploy_switch(self):
        self.write_env(FULL.replace('NOTIFY_ALLOWED_CHANNEL=""', 'NOTIFY_ALLOWED_CHANNEL="discord"'))
        r = self.run_sh("off")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("텔레그램으로 돌아왔다", r.stdout)
        sw = self.switches()
        self.assertEqual(len(sw), 4, "없던 NOTIFY_DEPLOY_CHANNEL 줄을 더한다")
        self.assertTrue(all(v == '""' for v in sw.values()))

    def test_lock_held_by_deploy_stops_before_change(self):
        (self.home / "pleiades-private" / "deploy.lock.d").mkdir(parents=True)
        r = self.run_sh("on", "--no-send")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("배포가 이 서버에서 진행 중", r.stdout)
        self.assertEqual(self.switches()["NOTIFY_ALLOWED_CHANNEL"], '""')

    # 회귀: PR #318 Codex P2 — 도는 프로세스가 다른 플랫폼 파일을 읽으면 바꾸기 전에 거부한다
    def test_running_processes_must_read_this_file(self):
        r = self.run_sh("on", "--no-send", STUB_ENV_FILE="/elsewhere/pleiades-platform.env")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("DIFF/MISSING 4", r.stdout)
        self.assertIn("PLEIADES_ENV_FILE 이 이 파일과 다르거나", r.stdout)
        self.assertNotIn("elsewhere", r.stdout)
        self.assertEqual(self.switches()["NOTIFY_ALLOWED_CHANNEL"], '""')
        self.assertFalse(self.calls.exists())

    def test_usage(self):
        self.assertEqual(self.run_sh("off", "--no-send").returncode, 2)
        self.assertEqual(self.run_sh("bogus").returncode, 2)

    def test_refuses_on_darwin_outside_tests(self):
        if os.uname().sysname != "Darwin":
            self.skipTest("Darwin 전용")
        env = {"PATH": f"{self.bin}:{NODE_DIR}:{BASE_PATH}", "HOME": str(self.home)}
        r = subprocess.run(["bash", str(SH), "check", "--no-send"], capture_output=True, text=True, env=env, timeout=30)
        self.assertEqual(r.returncode, 1)
        self.assertIn("서버 전용", r.stdout)


if __name__ == "__main__":
    unittest.main()
