"""deploy/discord-inbound.sh · discord-inbound.cjs — fit Discord 메시지 수신 켜기·끄기 (009 D-2 PR-3 · #367).

실행: python3 -m unittest discover -s deploy
pm2 는 스텁(재시작 때 플랫폼 파일의 키를 읽어 앱과 같은 기동 로그를 쓴다). 핵심 계약: 값(채널 ID · 토큰 · 경로)을
출력하지 않는다 · 바꾸기 전 검사가 실패하면 아무것도 바꾸지 않는다 · on 은 키 1줄만 · 판정 실패면 키를 비우고 되돌린다 ·
off 는 키 줄을 비운다 · 파일 권한 600 유지 · fin 거부 · Darwin 은 --dry-run 만.
"""

import os
import re
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
SH = HERE / "discord-inbound.sh"
CJS = HERE / "discord-inbound.cjs"
BASE_PATH = "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"
NODE_DIR = str(Path(shutil.which("node") or "/usr/bin/node").parent)

KEY = "DISCORD_CHANNEL_ID_FITNESS_CHAT"
CHAT_ID = "523456789012345678"
BASE = "\n".join([
    "# 플랫폼 설정",
    'DISCORD_BOT_TOKEN_FITNESS="BOTSECRETFIT.bbbbbbbbbbbbbbbbbbbb"',
    'DISCORD_CHANNEL_ID_FITNESS="223456789012345678"',
    'DISCORD_ALLOWED_USER_IDS="323456789012345678"',
    "",
])
SECRETS = ("BOTSECRET", "223456789012345678", "323456789012345678", CHAT_ID)

# 판정 문자열(앱 · chat gateway 가 찍는 것) — 아래 계약 테스트가 실제 파일과 맞춘다
ON_LOG = "[discord-fit] 메시지 수신 켜짐(대화 채널)"
OFF_LOG = "[discord-fit] 메시지 수신 꺼짐(버튼만)"
DEGRADE_LOG = "[discord-fit] MESSAGE CONTENT 미허용(4014) — intents 0 로 낮춰 다시 접속한다(메시지 수신 꺼짐) · 포털 토글을 켠다"

# pm2 스텁 — restart 때 플랫폼 파일의 키(비었는지)로 켜짐/꺼짐 줄 · STUB_PORTAL=off 이고 켜짐이면 강등 줄 ·
# STUB_GATEWAY=ok|fatal|none · jlist 는 STUB_ONLINE · STUB_ENV_FILE · STUB_PM2_KEY(top|nested)
PM2_STUB = r"""#!/usr/bin/env bash
case "$1" in
  restart)
    echo "restart $2" >> "$STUB_CALLS"
    [[ -n "${STUB_RESTART_FAIL:-}" ]] && exit 1
    log="$PLEIADES_PM2_LOGS/$2-out.log"; err="$PLEIADES_PM2_LOGS/$2-error.log"
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    v=$(grep -E '^DISCORD_CHANNEL_ID_FITNESS_CHAT=' "$STUB_ENV_FILE" | tail -1 | sed -E 's/^[^=]*="?([^"]*)"?$/\1/')
    if [[ -n "$v" ]]; then
      echo "$ts: [discord-fit] 메시지 수신 켜짐(대화 채널)" >> "$log"
      [[ "${STUB_PORTAL:-on}" == off ]] && echo "$ts: [discord-fit] MESSAGE CONTENT 미허용(4014) — intents 0 로 낮춰 다시 접속한다(메시지 수신 꺼짐) · 포털 토글을 켠다" >> "$err"
    else
      echo "$ts: [discord-fit] 메시지 수신 꺼짐(버튼만)" >> "$log"
    fi
    case "${STUB_GATEWAY:-ok}" in
      ok) echo "$ts: [discord-fit] gateway 준비 완료" >> "$err" ;;
      fatal) echo "$ts: [discord-fit] gateway 종료 코드 4004 — 다시 접속하지 않는다(토큰·권한 확인)" >> "$err" ;;
    esac ;;
  jlist)
    echo "[PM2][WARN] 경고 줄"
    e=${STUB_ENV_FILE:-}
    k=""
    [[ "${STUB_PM2_KEY:-}" == top ]] && k=",\"DISCORD_CHANNEL_ID_FITNESS_CHAT\":\"1\""
    n=""
    [[ "${STUB_PM2_KEY:-}" == nested ]] && n=",\"env\":{\"DISCORD_CHANNEL_ID_FITNESS_CHAT\":\"1\"}"
    echo "[{\"name\":\"pleiades-fin-bot\",\"pm2_env\":{\"status\":\"online\"}},{\"name\":\"pleiades-fit-bot\",\"pm2_env\":{\"status\":\"${STUB_ONLINE:-online}\",\"PLEIADES_ENV_FILE\":\"$e\"$k$n}}]" ;;
esac
"""


class DiscordInbound(unittest.TestCase):
    def setUp(self):
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
        self.write_env(BASE)

    def tearDown(self):
        self._tmp.cleanup()

    def write_env(self, text: str, mode: int = 0o600) -> None:
        self.env_file.write_text(text)
        self.env_file.chmod(mode)

    def env(self, **extra: str) -> dict:
        return {
            "PATH": f"{self.bin}:{NODE_DIR}:{BASE_PATH}",
            "HOME": str(self.home),
            "PLEIADES_TEST": "1",
            "PLEIADES_LOCK": "mkdir",
            "PLEIADES_PM2_LOGS": str(self.logs),
            "PLEIADES_READY_WAIT": "6",
            "PLEIADES_RESTART_SETTLE": "0",
            "STUB_CALLS": str(self.calls),
            "STUB_ENV_FILE": str(self.env_file),
            **extra,
        }

    def run_sh(self, *args: str, **extra: str) -> subprocess.CompletedProcess:
        r = subprocess.run(["bash", str(SH), *args], capture_output=True, text=True, env=self.env(**extra), timeout=60)
        out = r.stdout + r.stderr
        for s in (*SECRETS, str(self.home), str(self.env_file)):
            self.assertNotIn(s, out, f"값이 출력됐다: {s}")
        return r

    def key_line(self) -> str | None:
        lines = [l for l in self.env_file.read_text().splitlines() if l.startswith(f"{KEY}=")]
        return lines[-1] if lines else None

    def restarts(self) -> list[str]:
        return self.calls.read_text().split() if self.calls.exists() else []

    def test_on_writes_key_restarts_and_prints_form(self):
        r = self.run_sh("fit", "on", CHAT_ID)
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertEqual(self.key_line(), f'{KEY}="{CHAT_ID}"')
        for line in (
            "[on] 재시작 뒤 준비 완료 1",
            "[on] 메시지 수신 켜짐(대화 채널) 1",
            "[on] 메시지 수신 꺼짐(버튼만) 0",
            "[on] MESSAGE CONTENT 미허용(4014) 강등 0",
            "[on] gateway 종료 코드 0",
            "[on] 봇 online 1 · PLEIADES_ENV_FILE 같음 1",
            "[on] pm2 env 키 없음",
            "플랫폼 파일 키 설정됨",
            "되돌리기: deploy/discord-inbound.sh fit off",
            "결과: 통과 — 메시지 수신 켜짐",
        ):
            self.assertIn(line, r.stdout)
        self.assertEqual(stat.S_IMODE(self.env_file.stat().st_mode), 0o600)
        self.assertIn("BOTSECRETFIT", self.env_file.read_text(), "다른 줄은 그대로")
        self.assertIn("# 플랫폼 설정", self.env_file.read_text())
        self.assertEqual(self.restarts(), ["restart", "pleiades-fit-bot"], "fit 봇만 재시작")
        backups = list((self.home / "pleiades-private").glob("platform-env-*.bak"))
        self.assertEqual(len(backups), 1)
        self.assertNotIn(KEY, backups[0].read_text(), "백업은 바꾸기 전 것")
        self.assertEqual(stat.S_IMODE((self.home / "pleiades-private").stat().st_mode), 0o700)

    def test_on_replaces_existing_line_once(self):
        self.write_env(BASE + f'{KEY}=""\n# {KEY}="old"\n')
        r = self.run_sh("fit", "on", CHAT_ID)
        self.assertEqual(r.returncode, 0, r.stdout)
        text = self.env_file.read_text()
        self.assertEqual(text.count(f'{KEY}="{CHAT_ID}"'), 1)
        self.assertIn(f'# {KEY}="old"', text, "주석 줄은 그대로")
        self.assertIn("키 줄 교체 1", r.stdout)

    def test_on_with_portal_toggle_off_reverts(self):
        r = self.run_sh("fit", "on", CHAT_ID, STUB_PORTAL="off")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("[on] MESSAGE CONTENT 미허용(4014) 강등 1", r.stdout)
        self.assertIn("[되돌림] 메시지 수신 꺼짐(버튼만) 1", r.stdout)
        self.assertIn("되돌림 성공", r.stdout)
        self.assertIn("키를 비우고 버튼만으로 되돌렸다", r.stdout)
        self.assertEqual(self.key_line(), f'{KEY}=""')
        self.assertEqual(self.restarts(), ["restart", "pleiades-fit-bot", "restart", "pleiades-fit-bot"])

    # 회귀: PR-3 사전 리뷰 info 2 — 다른 채널로 켜져 있던 상태의 on 실패는 직전 값이 아니라 끔으로 되돌린다
    def test_revert_from_previously_set_says_off_not_restore(self):
        self.write_env(BASE + f'{KEY}="{"9" * 18}"\n')
        r = self.run_sh("fit", "on", CHAT_ID, STUB_PORTAL="off")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("되돌림 = 끔(직전 값 복원 아님 · 직전 값은 백업에)", r.stdout)
        self.assertEqual(self.key_line(), f'{KEY}=""')
        self.assertNotIn("9" * 18, r.stdout)

    def test_on_revert_failure_is_reported(self):
        r = self.run_sh("fit", "on", CHAT_ID, STUB_GATEWAY="fatal")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("[on] gateway 종료 코드 1", r.stdout)
        self.assertIn("되돌림 실패", r.stdout)
        self.assertNotIn("되돌림 성공", r.stdout)
        self.assertEqual(self.key_line(), f'{KEY}=""', "키는 비웠다")

    def test_off_clears_key_and_judges(self):
        self.write_env(BASE + f'{KEY}="{CHAT_ID}"\n')
        r = self.run_sh("fit", "off")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertEqual(self.key_line(), f'{KEY}=""')
        for line in ("[off] 메시지 수신 꺼짐(버튼만) 1", "[off] 메시지 수신 켜짐(대화 채널) 0", "플랫폼 파일 키 비어 있음",
                     "[off] pm2 env 키 없음", "결과: 통과 — 메시지 수신 꺼짐"):
            self.assertIn(line, r.stdout)

    def test_off_appends_missing_key_line(self):
        r = self.run_sh("fit", "off")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("키 줄 추가", r.stdout)
        self.assertEqual(self.key_line(), f'{KEY}=""')

    def test_pm2_env_key_stops_before_change(self):
        for where in ("top", "nested"):
            with self.subTest(where=where):
                r = self.run_sh("fit", "on", CHAT_ID, STUB_PM2_KEY=where)
                self.assertEqual(r.returncode, 1, r.stdout)
                self.assertIn("pm2 env 키 있음", r.stdout)
                self.assertIsNone(self.key_line())
                self.assertEqual(self.restarts(), [])

    def test_different_env_file_stops_before_change(self):
        r = self.run_sh("fit", "off", STUB_ENV_FILE="/elsewhere/pleiades-platform.env")
        # 스텁 jlist 가 다른 파일을 보고한다 — 바꾸기 전에 멈추므로 restart 0
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("PLEIADES_ENV_FILE 같음 0", r.stdout)
        self.assertNotIn("elsewhere", r.stdout)
        self.assertEqual(self.restarts(), [])

    def test_bot_not_online_stops(self):
        r = self.run_sh("fit", "on", CHAT_ID, STUB_ONLINE="errored")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIsNone(self.key_line())

    def test_old_ready_line_does_not_pass(self):
        (self.logs / "pleiades-fit-bot-error.log").write_text("2099-01-01 00:00:00: [discord-fit] gateway 준비 완료\n")
        (self.logs / "pleiades-fit-bot-out.log").write_text(f"2099-01-01 00:00:00: {ON_LOG}\n")
        r = self.run_sh("fit", "on", CHAT_ID, STUB_GATEWAY="none")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("[on] 재시작 뒤 준비 완료 0", r.stdout)

    def test_permission_must_be_600(self):
        self.write_env(BASE, 0o644)
        r = self.run_sh("fit", "on", CHAT_ID)
        self.assertEqual(r.returncode, 1)
        self.assertIn("권한이 600 이 아니다", r.stdout)
        self.assertIsNone(self.key_line())

    def test_lock_held_stops_before_change(self):
        (self.home / "pleiades-private" / "deploy.lock.d").mkdir(parents=True)
        r = self.run_sh("fit", "on", CHAT_ID)
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("배포가 이 서버에서 진행 중", r.stdout)
        self.assertIsNone(self.key_line())

    def test_fin_and_usage_are_refused(self):
        r = self.run_sh("fin", "on", CHAT_ID)
        self.assertEqual(r.returncode, 2, r.stdout)
        self.assertIn("fin 은 아직이다", r.stdout)
        for args in (("fit",), ("fit", "on"), ("fit", "bogus"), ("fit", "off", "--x"), ("x", "off")):
            with self.subTest(args=args):
                self.assertEqual(self.run_sh(*args).returncode, 2)
        bad = self.run_sh("fit", "on", "#chat")
        self.assertEqual(bad.returncode, 2)
        self.assertIn("채널 ID 형식이 아니다", bad.stdout)
        self.assertIsNone(self.key_line())
        self.assertEqual(self.restarts(), [])

    def test_dry_run_changes_nothing_and_needs_no_pm2(self):
        (self.bin / "pm2").unlink()
        before = self.env_file.read_text()
        r = self.run_sh("fit", "on", CHAT_ID, "--dry-run")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("dry-run — 바꾸지 않았다", r.stdout)
        self.assertIn("플랫폼 파일 키 비어 있음", r.stdout)
        self.assertEqual(self.env_file.read_text(), before)
        self.assertFalse((self.home / "pleiades-private").exists())

    def test_darwin_allows_only_dry_run(self):
        if os.uname().sysname != "Darwin":
            self.skipTest("Darwin 전용")
        env = {"PATH": f"{self.bin}:{NODE_DIR}:{BASE_PATH}", "HOME": str(self.home), "STUB_CALLS": str(self.calls)}
        r = subprocess.run(["bash", str(SH), "fit", "off"], capture_output=True, text=True, env=env, timeout=30)
        self.assertEqual(r.returncode, 1)
        self.assertIn("서버 전용", r.stdout)
        self.assertEqual(self.restarts(), [])
        d = subprocess.run(["bash", str(SH), "fit", "off", "--dry-run"], capture_output=True, text=True, env=env, timeout=30)
        self.assertEqual(d.returncode, 0, d.stdout)

    def test_cjs_rejects_bad_value_and_unknown_key(self):
        r = subprocess.run(["node", str(CJS), "set", str(self.env_file), KEY], capture_output=True, text=True,
                           env={"PATH": f"{NODE_DIR}:{BASE_PATH}", "INBOUND_VALUE": "12"}, timeout=30)
        self.assertEqual(r.returncode, 1)
        self.assertIn("RESULT fail", r.stdout)
        r2 = subprocess.run(["node", str(CJS), "set", str(self.env_file), "DISCORD_BOT_TOKEN_FITNESS"], capture_output=True,
                            text=True, env={"PATH": f"{NODE_DIR}:{BASE_PATH}", "INBOUND_VALUE": ""}, timeout=30)
        self.assertEqual(r2.returncode, 1, "다른 키는 쓰지 않는다")
        self.assertIn("BOTSECRETFIT", self.env_file.read_text())
        self.assertIsNone(self.key_line())


class StaticContract(unittest.TestCase):
    """판정 문자열 ↔ 그 줄을 찍는 파일 · 금지 명령 · 비출력."""

    TEXT = SH.read_text()
    APP = (REPO / "apps/fitness/src/bot/notifications/discord-interactions.ts").read_text()
    GATEWAY = (REPO / "packages/chat/src/gateway.ts").read_text()

    def test_app_prints_on_off_lines_literally(self):
        self.assertIn(f'"{ON_LOG}"', self.APP)
        self.assertIn(f'"{OFF_LOG}"', self.APP)
        self.assertIn("메시지 수신 켜짐(대화 채널)", self.TEXT)
        self.assertIn("메시지 수신 꺼짐(버튼만)", self.TEXT)

    def test_gateway_prints_degrade_and_ready_lines(self):
        self.assertIn("`[${label}] MESSAGE CONTENT 미허용(4014) — intents ${intents} 로 낮춰", self.GATEWAY)
        self.assertIn("`[${label}] gateway 준비 완료`", self.GATEWAY)
        self.assertIn("MESSAGE CONTENT 미허용(4014)", self.TEXT)

    def test_no_forbidden_commands(self):
        code = "\n".join(l for l in self.TEXT.splitlines() if not l.lstrip().startswith("#"))
        for pat in (r"\bssh\b", r"pm2 (delete|stop|kill|resurrect|save|start)\b", r"pm2 restart (all|\$\{?BOTS)",
                    r"--update-env", r"\bgit\b", r"\bcurl\b", r"\brm -rf \"\$file", r"\bset -x\b"):
            with self.subTest(pat=pat):
                self.assertIsNone(re.search(pat, code), pat)
        self.assertIn('pm2 restart "$BOT"', code)

    def test_values_never_echoed(self):
        code = "\n".join(l for l in self.TEXT.splitlines() if not l.lstrip().startswith("#"))
        for pat in (r'(form|echo)[^\n]*\$channel', r'(form|echo)[^\n]*\$\{?file\b', r'(form|echo)[^\n]*\$backup'):
            with self.subTest(pat=pat):
                self.assertIsNone(re.search(pat, code), pat)
        self.assertIn("INBOUND_VALUE=$value", code, "값은 env 로 넘긴다(인자 아님)")


if __name__ == "__main__":
    unittest.main()
