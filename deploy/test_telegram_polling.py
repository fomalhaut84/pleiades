"""deploy/telegram-polling.sh · telegram-polling.cjs — fit 텔레그램 폴링 끄기·켜기 (009 D-2′ · #376).

실행: python3 -m unittest discover -s deploy
pm2 는 스텁(재시작 때 앱 .env 의 TELEGRAM_POLLING 과 플랫폼 파일의 대화 채널 키를 읽어 앱과 같은 기동 로그·상태 파일을 쓴다).
핵심 계약: 값(토큰 · 채널 ID · 경로)을 출력하지 않는다 · 바꾸기 전 검사가 실패하면 아무것도 바꾸지 않는다 · 키 1줄만 ·
off 는 Discord 수신이 켜져 있을 때만 · off 판정 실패면 키를 비우고 되돌린다 · on 은 밀린 업데이트 버림을 본다(1-5) ·
.env 심링크 유지 · 권한 600 유지 · fin 거부 · Darwin 은 --dry-run 만.
"""

import json
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
SH = HERE / "telegram-polling.sh"
CJS = HERE / "telegram-polling.cjs"
BASE_PATH = "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"
NODE_DIR = str(Path(shutil.which("node") or "/usr/bin/node").parent)

KEY = "TELEGRAM_POLLING"
APP_ENV = "\n".join([
    "# fit 앱",
    'TELEGRAM_BOT_TOKEN="111111:TGSECRETFIT"',
    'ALLOWED_CHAT_IDS="987654321"',
    "",
])
PLATFORM = "\n".join([
    'DISCORD_BOT_TOKEN_FITNESS="BOTSECRETFIT.bbbbbbbbbbbbbbbbbbbb"',
    'DISCORD_CHANNEL_ID_FITNESS_CHAT="523456789012345678"',
    "",
])
SECRETS = ("TGSECRET", "987654321", "BOTSECRET", "523456789012345678")

# 판정 문자열(앱이 찍는 것) — 아래 계약 테스트가 실제 파일과 맞춘다
POLL_OFF = "[bot] 텔레그램 폴링 꺼짐(TELEGRAM_POLLING=off)"
POLL_START = "[bot] Long polling 시작"
POLL_DROP = "[bot] Long polling 시작 (밀린 업데이트 버림 — 직전에 꺼져 있었다)"

# pm2 스텁 — restart 때 앱 .env 의 키(off 인지)로 폴링 줄 + 상태 파일 · 직전 상태 파일이 on 이 아니면 버림 줄 ·
# 플랫폼 대화 채널 키로 Discord 수신 줄 · STUB_GATEWAY=ok|fatal|degrade|none · STUB_TELEGRAM=ok|401|none(토큰 없음)|silent ·
# STUB_DROP=never(앱 결함 흉내 — 버리지 않음) · jlist 는 STUB_ONLINE · STUB_CWD · STUB_PM2_KEY(top|nested) · STUB_ENV_FILE
PM2_STUB = r"""#!/usr/bin/env bash
case "$1" in
  restart)
    echo "restart $2" >> "$STUB_CALLS"
    [[ -n "${STUB_RESTART_FAIL:-}" ]] && exit 1
    log="$PLEIADES_PM2_LOGS/$2-out.log"; err="$PLEIADES_PM2_LOGS/$2-error.log"
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    st="$STUB_APP/logs/telegram-polling-fit.json"; mkdir -p "$STUB_APP/logs"
    prev=$(sed -n 's/.*"polling":"\([a-z]*\)".*/\1/p' "$st" 2>/dev/null)
    v=$(grep -E '^TELEGRAM_POLLING=' "$STUB_APP/.env" | tail -1 | sed -E 's/^[^=]*="?([^"]*)"?$/\1/')
    if [[ "${STUB_TELEGRAM:-ok}" == none ]]; then
      echo "$ts: [bot] 텔레그램 토큰 없음 — 폴링 안 함(크론·Discord 는 그대로)" >> "$log"; echo '{"polling":"off"}' > "$st"
    elif [[ "$v" == off ]]; then
      echo "$ts: [bot] 텔레그램 폴링 꺼짐(TELEGRAM_POLLING=off)" >> "$log"; echo '{"polling":"off"}' > "$st"
    elif [[ "${STUB_TELEGRAM:-ok}" == 401 ]]; then
      echo "$ts: [bot] 텔레그램 토큰 무효(401) — 폴링을 멈춘다(크론·Discord 는 그대로): x" >> "$err"; echo '{"polling":"off"}' > "$st"
    elif [[ "${STUB_TELEGRAM:-ok}" == ok ]]; then
      echo "$ts: [bot] @fitbot 초기화 완료" >> "$log"
      if [[ "$prev" == on || "${STUB_DROP:-}" == never ]]; then echo "$ts: [bot] Long polling 시작" >> "$log"
      else echo "$ts: [bot] Long polling 시작 (밀린 업데이트 버림 — 직전에 꺼져 있었다)" >> "$log"; fi
      echo '{"polling":"on"}' > "$st"
    fi
    c=$(grep -E '^DISCORD_CHANNEL_ID_FITNESS_CHAT=' "$STUB_PLATFORM" | tail -1 | sed -E 's/^[^=]*="?([^"]*)"?$/\1/')
    if [[ -n "$c" ]]; then echo "$ts: [discord-fit] 메시지 수신 켜짐(대화 채널)" >> "$log"
    else echo "$ts: [discord-fit] 메시지 수신 꺼짐(버튼만)" >> "$log"; fi
    case "${STUB_GATEWAY:-ok}" in
      ok) echo "$ts: [discord-fit] gateway 준비 완료" >> "$err" ;;
      degrade) [[ -n "$c" ]] && echo "$ts: [discord-fit] MESSAGE CONTENT 미허용(4014) — intents 0 로 낮춰 다시 접속한다(메시지 수신 꺼짐) · 포털 토글을 켠다" >> "$err"
               echo "$ts: [discord-fit] gateway 준비 완료" >> "$err" ;;
      fatal) echo "$ts: [discord-fit] gateway 종료 코드 4004 — 다시 접속하지 않는다(토큰·권한 확인)" >> "$err" ;;
    esac ;;
  jlist)
    echo "[PM2][WARN] 경고 줄"
    k=""
    [[ "${STUB_PM2_KEY:-}" == top ]] && k=",\"TELEGRAM_POLLING\":\"on\""
    n=""
    [[ "${STUB_PM2_KEY:-}" == nested ]] && n=",\"env\":{\"TELEGRAM_POLLING\":\"on\"}"
    echo "[{\"name\":\"pleiades-fin-bot\",\"pm2_env\":{\"status\":\"online\"}},{\"name\":\"pleiades-fit-bot\",\"pm2_env\":{\"status\":\"${STUB_ONLINE:-online}\",\"pm_cwd\":\"${STUB_CWD:-$STUB_APP}\",\"PLEIADES_ENV_FILE\":\"${STUB_ENV_FILE:-}\"$k$n}}]" ;;
esac
"""


class TelegramPolling(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        t = Path(os.path.realpath(self._tmp.name))
        self.home = t / "home"
        self.home.mkdir()
        self.app = t / "checkout" / "apps" / "fitness"
        self.app.mkdir(parents=True)
        self.logs = t / "pm2logs"
        self.logs.mkdir()
        self.bin = t / "bin"
        self.bin.mkdir()
        (self.bin / "pm2").write_text(PM2_STUB)
        (self.bin / "pm2").chmod(0o755)
        self.calls = t / "calls"
        self.env_file = self.app / ".env"
        self.platform = self.home / "pleiades-platform.env"
        self.platform.write_text(PLATFORM)
        self.platform.chmod(0o600)
        self.write_env(APP_ENV)
        self.write_state("on")

    def tearDown(self):
        self._tmp.cleanup()

    def write_env(self, text: str, mode: int = 0o600) -> None:
        self.env_file.write_text(text)
        self.env_file.chmod(mode)

    def write_state(self, value: str) -> None:
        (self.app / "logs").mkdir(exist_ok=True)
        (self.app / "logs" / "telegram-polling-fit.json").write_text(json.dumps({"polling": value}, separators=(",", ":")))

    def env(self, **extra: str) -> dict:
        return {
            "PATH": f"{self.bin}:{NODE_DIR}:{BASE_PATH}",
            "HOME": str(self.home),
            "PLEIADES_TEST": "1",
            "PLEIADES_LOCK": "mkdir",
            "PLEIADES_APP_DIR": str(self.app),
            "PLEIADES_PM2_LOGS": str(self.logs),
            "PLEIADES_READY_WAIT": "6",
            "PLEIADES_RESTART_SETTLE": "0",
            "STUB_CALLS": str(self.calls),
            "STUB_APP": str(self.app),
            "STUB_PLATFORM": str(self.platform),
            "STUB_ENV_FILE": str(self.platform),
            **extra,
        }

    def run_sh(self, *args: str, **extra: str) -> subprocess.CompletedProcess:
        r = subprocess.run(["bash", str(SH), *args], capture_output=True, text=True, env=self.env(**extra), timeout=60)
        out = r.stdout + r.stderr
        for s in (*SECRETS, str(self.home), str(self.app)):
            self.assertNotIn(s, out, f"값이 출력됐다: {s}")
        return r

    def key_line(self) -> str | None:
        lines = [l for l in self.env_file.read_text().splitlines() if l.startswith(f"{KEY}=")]
        return lines[-1] if lines else None

    def restarts(self) -> list[str]:
        return self.calls.read_text().split() if self.calls.exists() else []

    def test_off_writes_key_restarts_and_prints_form(self):
        r = self.run_sh("fit", "off")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertEqual(self.key_line(), f"{KEY}=off")
        for line in (
            "[off] 재시작 뒤 텔레그램 폴링 꺼짐 1 · 폴링 시작 0 (밀린 업데이트 버림 0)",
            "[off] 텔레그램 토큰 없음 0 · 토큰 무효(401) 0",
            "[off] Discord 준비 완료 1 · 메시지 수신 켜짐(대화 채널) 1 · MESSAGE CONTENT 미허용(4014) 강등 0 · gateway 종료 코드 0",
            "[off] 봇 online 1 · cwd 이 체크아웃 1 · pm2 env 키 없음",
            "봇 폴링 상태 기록 off",
            "앱 .env 폴링 키 끔(off)",
            "되돌리기: deploy/telegram-polling.sh fit on",
            "결과: 통과 — 텔레그램 폴링 꺼짐",
        ):
            self.assertIn(line, r.stdout)
        self.assertEqual(stat.S_IMODE(self.env_file.stat().st_mode), 0o600)
        text = self.env_file.read_text()
        self.assertIn("TGSECRETFIT", text, "토큰은 그대로")
        self.assertIn("# fit 앱", text)
        self.assertEqual(self.restarts(), ["restart", "pleiades-fit-bot"], "fit 봇만 재시작")
        backups = list((self.home / "pleiades-private").glob("fit-env-*.bak"))
        self.assertEqual(len(backups), 1)
        self.assertNotIn(KEY, backups[0].read_text(), "백업은 바꾸기 전 것")
        self.assertEqual(stat.S_IMODE((self.home / "pleiades-private").stat().st_mode), 0o700)

    def test_on_after_off_requires_drop_pending(self):
        self.write_env(APP_ENV + f"{KEY}=off\n")
        self.write_state("off")
        r = self.run_sh("fit", "on")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertEqual(self.key_line(), f"{KEY}=")
        for line in ("폴링 시작 1 (밀린 업데이트 버림 1)", "봇 폴링 상태 기록 on", "앱 .env 폴링 키 켬(off 아님)",
                     "결과: 통과 — 텔레그램 폴링 켜짐"):
            self.assertIn(line, r.stdout)

    # 1-5 — 직전 기록이 off 인데 밀린 업데이트를 버리지 않았으면 실패
    def test_on_without_drop_after_off_fails(self):
        self.write_env(APP_ENV + f"{KEY}=off\n")
        self.write_state("off")
        r = self.run_sh("fit", "on", STUB_DROP="never")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("(밀린 업데이트 버림 0)", r.stdout)
        self.assertIn("켜기 판정 실패", r.stdout)

    # 회귀: 사전 리뷰 info 1 — 1-5 의 기준은 .env 가 아니라 앱과 같은 상태 기록(기록 on 이면 앱은 버리지 않는다)
    def test_on_uses_state_record_not_env_for_drop(self):
        self.write_env(APP_ENV + f"{KEY}=off\n")
        self.write_state("on")
        r = self.run_sh("fit", "on")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("(밀린 업데이트 버림 0)", r.stdout)

    # 회귀: 사전 리뷰 major 2 — 켬(되돌리기)은 Discord 가 깨져 있어도 텔레그램이 살아나면 통과(따로 확인 문구)
    def test_on_passes_when_discord_is_down(self):
        self.write_env(APP_ENV + f"{KEY}=off\n")
        self.write_state("off")
        r = self.run_sh("fit", "on", STUB_GATEWAY="fatal")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("gateway 종료 코드 1", r.stdout)
        self.assertIn("결과: 통과 — 텔레그램 폴링 켜짐(병행) (Discord 비정상", r.stdout)

    # 회귀: 사전 리뷰 major 1 — "수신 켜짐" 줄은 기동 때 찍힌다. 4014 강등이면 Discord 수신이 없으므로 끄지 않는다
    def test_off_with_4014_degrade_reverts(self):
        r = self.run_sh("fit", "off", STUB_GATEWAY="degrade")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("[off] Discord 준비 완료 1 · 메시지 수신 켜짐(대화 채널) 1 · MESSAGE CONTENT 미허용(4014) 강등 1", r.stdout)
        self.assertIn("되돌림 성공 (Discord 비정상", r.stdout)
        self.assertEqual(self.key_line(), f"{KEY}=")

    # 회귀: 사전 리뷰 info 2 — 이미 off 에서 다시 off 가 실패하면 되돌림은 켬(직전 값 복원 아님)이라고 적는다
    def test_off_again_failure_says_revert_is_on(self):
        self.write_env(APP_ENV + f"{KEY}=off\n")
        self.write_state("off")
        r = self.run_sh("fit", "off", STUB_GATEWAY="degrade")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("되돌림 = 켬(직전 값 off 복원 아님", r.stdout)

    # 회귀: 사전 리뷰 info 3 — 도는 봇의 플랫폼 파일이 다르면 off 는 바꾸기 전에 멈춘다(on 은 상관없다)
    def test_off_stops_when_bot_uses_other_platform_file(self):
        r = self.run_sh("fit", "off", STUB_ENV_FILE="/elsewhere/pleiades-platform.env")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("PLEIADES_ENV_FILE 같음 0", r.stdout)
        self.assertNotIn("elsewhere", r.stdout)
        self.assertEqual(self.restarts(), [])

    def test_off_replaces_existing_lines_and_keeps_comments(self):
        self.write_env(APP_ENV + f"{KEY}=on\n# {KEY}=off\n{KEY}=\n")
        r = self.run_sh("fit", "off")
        self.assertEqual(r.returncode, 0, r.stdout)
        text = self.env_file.read_text()
        self.assertEqual(text.splitlines().count(f"{KEY}=off"), 2, "유효 줄 2개 모두 off")
        self.assertIn(f"# {KEY}=off", text, "주석 줄은 그대로")
        self.assertIn("키 줄 교체 2", r.stdout)

    def test_off_keeps_symlinked_env(self):
        real = self.app.parent.parent / "state-env"
        real.write_text(APP_ENV)
        real.chmod(0o600)
        self.env_file.unlink()
        self.env_file.symlink_to(real)
        r = self.run_sh("fit", "off")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertTrue(self.env_file.is_symlink(), "링크를 파일로 덮지 않는다")
        self.assertIn(f"{KEY}=off", real.read_text())
        self.assertEqual(stat.S_IMODE(real.stat().st_mode), 0o600)

    def test_off_refused_when_discord_inbound_off(self):
        self.platform.write_text('DISCORD_CHANNEL_ID_FITNESS_CHAT=""\n')
        r = self.run_sh("fit", "off")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("Discord 메시지 수신이 꺼져 있다", r.stdout)
        self.assertIsNone(self.key_line())
        self.assertEqual(self.restarts(), [])

    def test_off_gateway_fatal_reverts_to_parallel(self):
        r = self.run_sh("fit", "off", STUB_GATEWAY="fatal")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("gateway 종료 코드 1", r.stdout)
        self.assertIn("되돌림 성공 (Discord 비정상", r.stdout, "텔레그램은 살렸다 · Discord 는 따로 확인")
        self.assertEqual(self.key_line(), f"{KEY}=", "키는 비웠다")
        self.assertEqual(self.restarts(), ["restart", "pleiades-fit-bot", "restart", "pleiades-fit-bot"])

    def test_off_with_missing_token_fails_and_reverts(self):
        # 토큰이 없으면 폴링 꺼짐 줄이 아니라 "토큰 없음" 이 찍힌다 — D-2′ 는 토큰을 남기는 단계라 실패로 본다
        r = self.run_sh("fit", "off", STUB_TELEGRAM="none")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("[off] 텔레그램 토큰 없음 1", r.stdout)
        self.assertIn("되돌림 실패", r.stdout)

    def test_off_revert_success(self):
        # 끄기 판정 실패(Discord 수신 줄이 재시작 뒤 0) → 되돌림 on 은 Discord 수신 줄을 요구하지 않는다
        r = self.run_sh("fit", "off", PLEIADES_READY_WAIT="3", STUB_PLATFORM=str(self.empty_platform()))
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("[off] Discord 준비 완료 1 · 메시지 수신 켜짐(대화 채널) 0", r.stdout)
        self.assertIn("되돌림 성공", r.stdout)
        self.assertIn("텔레그램 폴링을 다시 켰다", r.stdout)
        self.assertIn("[되돌림] 재시작 뒤 텔레그램 폴링 꺼짐 0 · 폴링 시작 1 (밀린 업데이트 버림 1)", r.stdout)
        self.assertEqual(self.key_line(), f"{KEY}=")

    def empty_platform(self) -> Path:
        # 스텁만 보는 플랫폼 파일 — 스크립트의 사전 검사는 진짜 파일(키 설정됨)을 본다
        p = self.home.parent / "stub-platform.env"
        p.write_text('DISCORD_CHANNEL_ID_FITNESS_CHAT=""\n')
        return p

    def test_on_401_fails(self):
        self.write_env(APP_ENV + f"{KEY}=off\n")
        self.write_state("off")
        r = self.run_sh("fit", "on", STUB_TELEGRAM="401")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("토큰 무효(401) 1", r.stdout)

    def test_pm2_env_key_stops_before_change(self):
        for where in ("top", "nested"):
            with self.subTest(where=where):
                r = self.run_sh("fit", "off", STUB_PM2_KEY=where)
                self.assertEqual(r.returncode, 1, r.stdout)
                self.assertIn("pm2 env 키 있음", r.stdout)
                self.assertIsNone(self.key_line())
                self.assertEqual(self.restarts(), [])

    def test_other_checkout_stops_before_change(self):
        r = self.run_sh("fit", "off", STUB_CWD="/elsewhere/apps/fitness")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("cwd 이 체크아웃 0", r.stdout)
        self.assertNotIn("elsewhere", r.stdout)
        self.assertEqual(self.restarts(), [])

    def test_bot_not_online_stops(self):
        r = self.run_sh("fit", "off", STUB_ONLINE="errored")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIsNone(self.key_line())

    def test_old_lines_do_not_pass(self):
        (self.logs / "pleiades-fit-bot-error.log").write_text("2099-01-01 00:00:00: [discord-fit] gateway 준비 완료\n")
        (self.logs / "pleiades-fit-bot-out.log").write_text(f"2099-01-01 00:00:00: {POLL_OFF}\n")
        r = self.run_sh("fit", "off", STUB_GATEWAY="none", PLEIADES_READY_WAIT="3")
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("[off] Discord 준비 완료 0", r.stdout)

    def test_permission_must_be_600(self):
        self.write_env(APP_ENV, 0o644)
        r = self.run_sh("fit", "off")
        self.assertEqual(r.returncode, 1)
        self.assertIn("권한이 600 이 아니다", r.stdout)
        self.assertIsNone(self.key_line())

    def test_lock_held_stops_before_change(self):
        (self.home / "pleiades-private" / "deploy.lock.d").mkdir(parents=True)
        r = self.run_sh("fit", "off")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("배포가 이 서버에서 진행 중", r.stdout)
        self.assertIsNone(self.key_line())

    def test_fin_and_usage_are_refused(self):
        r = self.run_sh("fin", "off")
        self.assertEqual(r.returncode, 2, r.stdout)
        self.assertIn("fin 은 아직이다", r.stdout)
        for args in (("fit",), ("fit", "bogus"), ("fit", "off", "--x"), ("x", "off"), ("fit", "on", "1")):
            with self.subTest(args=args):
                self.assertEqual(self.run_sh(*args).returncode, 2)
        self.assertIsNone(self.key_line())
        self.assertEqual(self.restarts(), [])

    def test_dry_run_changes_nothing_and_needs_no_pm2(self):
        (self.bin / "pm2").unlink()
        before = self.env_file.read_text()
        r = self.run_sh("fit", "off", "--dry-run")
        self.assertEqual(r.returncode, 0, r.stdout)
        for line in ("dry-run — 바꾸지 않았다", "앱 .env 있음 · 권한 600", "앱 .env 폴링 키 켬(off 아님)", "플랫폼 파일 키 설정됨"):
            self.assertIn(line, r.stdout)
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

    def test_cjs_rejects_other_values(self):
        for v in ("on", "OFFX", "1"):
            with self.subTest(v=v):
                r = subprocess.run(["node", str(CJS), "set", str(self.env_file)], capture_output=True, text=True,
                                   env={"PATH": f"{NODE_DIR}:{BASE_PATH}", "POLLING_VALUE": v}, timeout=30)
                self.assertEqual(r.returncode, 1)
                self.assertIn("RESULT fail", r.stdout)
        self.assertIsNone(self.key_line())


class StaticContract(unittest.TestCase):
    """판정 문자열 ↔ 그 줄을 찍는 파일 · 금지 명령 · 비출력."""

    TEXT = SH.read_text()
    POLLING = (REPO / "apps/fitness/src/bot/telegram-polling.ts").read_text()
    STANDALONE = (REPO / "apps/fitness/src/bot/standalone.ts").read_text()
    INTERACTIONS = (REPO / "apps/fitness/src/bot/notifications/discord-interactions.ts").read_text()
    GATEWAY = (REPO / "packages/chat/src/gateway.ts").read_text()

    def test_app_prints_polling_lines_literally(self):
        self.assertIn(f'"{POLL_OFF}"', self.POLLING)
        self.assertIn('"[bot] 텔레그램 토큰 없음 — 폴링 안 함', self.POLLING)
        self.assertIn("`[bot] Long polling 시작${drop ? \" (밀린 업데이트 버림 — 직전에 꺼져 있었다)\" : \"\"}`", self.POLLING)
        self.assertIn("`[bot] 텔레그램 토큰 무효(401)", self.POLLING)
        for s in (POLL_OFF, "[bot] Long polling 시작", "[bot] Long polling 시작 (밀린 업데이트 버림", "[bot] 텔레그램 토큰 무효(401)"):
            self.assertIn(s, self.TEXT)

    def test_state_file_path_matches_app(self):
        self.assertIn('POLLING_STATE_FILE = "logs/telegram-polling-fit.json"', self.STANDALONE)
        self.assertIn("logs/telegram-polling-fit.json", self.TEXT)
        self.assertIn('return (env.TELEGRAM_POLLING ?? "").trim().toLowerCase() === "off"', self.POLLING)

    def test_discord_lines_match(self):
        self.assertIn('"[discord-fit] 메시지 수신 켜짐(대화 채널)"', self.INTERACTIONS)
        self.assertIn("`[${label}] MESSAGE CONTENT 미허용(4014) — intents ${intents} 로 낮춰", self.GATEWAY)
        self.assertIn('DEGRADE_LINE="[$LABEL] MESSAGE CONTENT 미허용(4014)"', self.TEXT)
        self.assertIn("`[${label}] gateway 준비 완료`", self.GATEWAY)
        self.assertIn("메시지 수신 켜짐(대화 채널)", self.TEXT)

    def test_no_forbidden_commands(self):
        code = "\n".join(l for l in self.TEXT.splitlines() if not l.lstrip().startswith("#"))
        for pat in (r"\bssh\b", r"pm2 (delete|stop|kill|resurrect|save|start)\b", r"pm2 restart (all|\$\{?BOTS)",
                    r"--update-env", r"\bgit\b", r"\bcurl\b", r"\brm -rf \"\$\{?(ENV_FILE|APP_DIR|platform)", r"\bset -x\b"):
            with self.subTest(pat=pat):
                self.assertIsNone(re.search(pat, code), pat)
        self.assertIn('pm2 restart "$BOT"', code)

    def test_values_never_echoed(self):
        code = "\n".join(l for l in self.TEXT.splitlines() if not l.lstrip().startswith("#"))
        for pat in (r'(form|echo)[^\n]*\$\{?ENV_FILE', r'(form|echo)[^\n]*\$\{?platform', r'(form|echo)[^\n]*\$backup',
                    r'(form|echo)[^\n]*\$\{?APP_DIR'):
            with self.subTest(pat=pat):
                self.assertIsNone(re.search(pat, code), pat)


if __name__ == "__main__":
    unittest.main()
