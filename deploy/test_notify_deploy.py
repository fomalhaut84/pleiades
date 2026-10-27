"""deploy/notify-deploy.cjs · ssh-deploy.sh 알림 연결 — 자동 배포 완료·중단 알림 (#304).

실행: python3 -m unittest discover -s deploy
텔레그램에는 보내지 않는다(PLEIADES_TEST=1 NOTIFY_DRY_RUN=1). 핵심 계약: 토큰·채팅 ID 를 출력하지 않는다 ·
fin = 관리자 경로 · fit = ALLOWED · 설정이 비면 보내지 않고 0 · ssh-deploy 는 앱마다 결과를 넘긴다.
"""

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
NOTIFY = HERE / "notify-deploy.cjs"
SSH_DEPLOY = HERE / "ssh-deploy.sh"
BASE_PATH = "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"
NODE_DIR = str(Path(shutil.which("node") or "/usr/bin/node").parent)
DOTENV = HERE.parent / "apps" / "finance" / "node_modules" / "dotenv"


@unittest.skipUnless(DOTENV.exists(), "apps/finance 의존성 없음(npm ci 먼저)")
class NotifyDeploy(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        (self.root / "deploy").mkdir()
        shutil.copy(NOTIFY, self.root / "deploy" / "notify-deploy.cjs")
        for d in ("finance", "fitness"):
            nm = self.root / "apps" / d / "node_modules"
            nm.mkdir(parents=True)
            (nm / "dotenv").symlink_to(DOTENV)

    def tearDown(self):
        self._tmp.cleanup()

    def env_file(self, d: str, text: str) -> None:
        (self.root / "apps" / d / ".env").write_text(text)

    def run_notify(self, *args: str, dry: bool = True, **extra: str) -> subprocess.CompletedProcess:
        env = {"PATH": f"{NODE_DIR}:{BASE_PATH}", "PLEIADES_TEST": "1", **extra}
        if dry:
            env["NOTIFY_DRY_RUN"] = "1"
        return subprocess.run(["node", str(self.root / "deploy" / "notify-deploy.cjs"), *args],
                              capture_output=True, text=True, env=env, timeout=30)

    def test_fin_goes_to_admin_route_and_hides_secrets(self):
        self.env_file("finance", 'TELEGRAM_BOT_TOKEN="123:SECRETTOKEN"\nTELEGRAM_ALLOWED_CHAT_IDS=111,222\nTELEGRAM_ADMIN_CHAT_IDS=999\n')
        r = self.run_notify("fin", "ok", "v1.0.5", "소요 129s · 프로브 오류 응답 0")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("수신자 1", r.stdout)
        self.assertIn("✅ <b>fin v1.0.5 배포 완료</b>", r.stdout)
        self.assertIn("소요 129s", r.stdout)
        self.assertIn("https://github.com/fomalhaut84/pleiades/releases/tag/v1.0.5", r.stdout)
        for secret in ("SECRETTOKEN", "999", "111"):
            self.assertNotIn(secret, r.stdout + r.stderr)

    def test_fit_uses_allowed_route(self):
        self.env_file("fitness", 'TELEGRAM_BOT_TOKEN=1:X\nTELEGRAM_ALLOWED_CHAT_IDS=" 555 , 666 "\n')
        r = self.run_notify("fit", "fail", "v1.0.5", "rc 4 · 중단 — C5 <확인 실패>")
        self.assertIn("수신자 2", r.stdout)
        self.assertIn("⚠️ <b>fit v1.0.5 배포 중단</b>", r.stdout)
        self.assertIn("&lt;확인 실패&gt;", r.stdout)   # HTML 이스케이프
        self.assertIn("Actions 실행 요약", r.stdout)

    def test_missing_config_does_not_fail_the_deploy(self):
        self.env_file("finance", "TELEGRAM_BOT_TOKEN=1:X\nTELEGRAM_ADMIN_CHAT_IDS=\n")
        r = self.run_notify("fin", "ok", "v1.0.5", "x")
        self.assertEqual(r.returncode, 0)
        self.assertIn("수신자(TELEGRAM_ADMIN_CHAT_IDS)가 비어 있다", r.stdout)
        r = self.run_notify("fit", "ok", "v1.0.5", "x")   # .env 없음
        self.assertEqual(r.returncode, 0)
        self.assertIn(".env 를 읽지 못했다", r.stdout)

    def test_bad_arguments_send_nothing(self):
        self.env_file("finance", "TELEGRAM_BOT_TOKEN=1:X\nTELEGRAM_ADMIN_CHAT_IDS=9\n")
        for args in (("xxx", "ok", "v1.0.5"), ("fin", "maybe", "v1.0.5"), ("fin", "ok", "1.0.5"), ("fin", "ok", "v1.0.5; rm")):
            r = self.run_notify(*args)
            self.assertEqual(r.returncode, 0)
            self.assertIn("보내지 않았다", r.stdout)

    # T-10(#314) — 배포 알림 Discord 별도 채널 · 동시 모드 없음 · 실패 시 텔레그램으로 대신
    def platform(self, text: str) -> str:
        f = self.root / "platform.env"
        f.write_text(text)
        return str(f)

    def test_discord_switch_on_sends_only_to_deploy_webhook(self):
        self.env_file("finance", "TELEGRAM_BOT_TOKEN=1:X\nTELEGRAM_ADMIN_CHAT_IDS=9\n")
        pf = self.platform('NOTIFY_DEPLOY_CHANNEL="discord"\nDISCORD_WEBHOOK_DEPLOY="https://discord.com/api/webhooks/1/SECRETHOOK"\n')
        r = self.run_notify("fin", "fail", "v1.0.7", "rc 1 · 중단 — C4 *빌드* 실패", PLEIADES_ENV_FILE=pf)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("(dry-run) Discord 배포 채널", r.stdout)
        self.assertIn("⚠️ **fin v1.0.7 배포 중단**", r.stdout)
        self.assertIn("\\*빌드\\*", r.stdout)   # 마크다운 escape
        self.assertNotIn("수신자", r.stdout, "텔레그램으로는 보내지 않는다")
        self.assertNotIn("SECRETHOOK", r.stdout + r.stderr)

    def test_discord_webhook_without_switch_stays_on_telegram(self):
        self.env_file("finance", "TELEGRAM_BOT_TOKEN=1:X\nTELEGRAM_ADMIN_CHAT_IDS=9\n")
        pf = self.platform('NOTIFY_DEPLOY_CHANNEL=""\nDISCORD_WEBHOOK_DEPLOY="https://discord.com/api/webhooks/1/S"\n')
        r = self.run_notify("fin", "ok", "v1.0.7", "x", PLEIADES_ENV_FILE=pf)
        self.assertIn("수신자 1", r.stdout)

    def test_discord_failure_falls_back_to_telegram(self):
        self.env_file("finance", "TELEGRAM_BOT_TOKEN=1:SECRETTOKEN\nTELEGRAM_ADMIN_CHAT_IDS=9\n")
        pf = self.platform('NOTIFY_DEPLOY_CHANNEL=discord\nDISCORD_WEBHOOK_DEPLOY=https://discord.com/api/webhooks/1/SECRETHOOK\n')
        (self.root / "split.cjs").write_text(
            "globalThis.fetch = async (u, o) => { require('fs').appendFileSync(process.env.CALLS, JSON.parse(o.body).content ? 'discord\\n' : 'telegram\\n');"
            " return u.includes('discord') ? { ok: false, status: 404, body: null } : { ok: true, status: 200, body: null } }\n")
        calls = self.root / "calls"
        r = self.run_notify("fin", "ok", "v1.0.7", "x", dry=False, PLEIADES_ENV_FILE=pf, CALLS=str(calls),
                            NODE_OPTIONS="--require=" + str(self.root / "split.cjs"))
        self.assertEqual(r.returncode, 0)
        self.assertIn("보냄 1/1 (Discord 실패 HTTP 404 — 텔레그램으로 대신)", r.stdout)
        self.assertEqual(calls.read_text().split(), ["discord", "telegram"])
        self.assertNotIn("SECRET", r.stdout + r.stderr)

    def test_test_mode_never_reads_home_platform_file(self):
        home = self.root / "home"
        home.mkdir()
        (home / "pleiades-platform.env").write_text("NOTIFY_DEPLOY_CHANNEL=discord\nDISCORD_WEBHOOK_DEPLOY=https://discord.com/api/webhooks/1/S\n")
        self.env_file("finance", "TELEGRAM_BOT_TOKEN=1:X\nTELEGRAM_ADMIN_CHAT_IDS=9\n")
        r = self.run_notify("fin", "ok", "v1.0.7", "x", HOME=str(home))
        self.assertIn("수신자 1", r.stdout)

    def test_http_error_reports_status_only(self):
        # 비-2xx — 상태 코드만 · 토큰 없음(비출력 계약의 나머지 반쪽 · 사전 리뷰 info)
        self.env_file("finance", "TELEGRAM_BOT_TOKEN=1:SECRETTOKEN\nTELEGRAM_ADMIN_CHAT_IDS=9\n")
        (self.root / "http401.cjs").write_text("globalThis.fetch = async () => ({ ok: false, status: 401, body: null })\n")
        env = {"PATH": f"{NODE_DIR}:{BASE_PATH}", "NODE_OPTIONS": "--require=" + str(self.root / "http401.cjs"),
               "PLEIADES_ENV_FILE": str(self.root / "none.env")}
        r = subprocess.run(["node", str(self.root / "deploy" / "notify-deploy.cjs"), "fin", "ok", "v1.0.5", "x"],
                           capture_output=True, text=True, env=env, timeout=30)
        self.assertEqual(r.returncode, 0)
        self.assertIn("실패 HTTP 401", r.stdout)
        self.assertNotIn("SECRETTOKEN", r.stdout + r.stderr)

    def test_real_send_failure_hides_token(self):
        # 실제 전송 경로 — 접속이 실패해도 토큰이 담긴 URL 을 내지 않고 0 으로 끝난다(네트워크 없이 · 잘못된 프록시로 실패시킨다)
        self.env_file("finance", "TELEGRAM_BOT_TOKEN=1:SECRETTOKEN\nTELEGRAM_ADMIN_CHAT_IDS=9\n")
        env = {"PATH": f"{NODE_DIR}:{BASE_PATH}", "NODE_OPTIONS": "--require=" + str(self.root / "nofetch.cjs"),
               "PLEIADES_ENV_FILE": str(self.root / "none.env")}
        (self.root / "nofetch.cjs").write_text("globalThis.fetch = async (u) => { throw new TypeError('fetch failed ' + u) }\n")
        r = subprocess.run(["node", str(self.root / "deploy" / "notify-deploy.cjs"), "fin", "ok", "v1.0.5", "x"],
                           capture_output=True, text=True, env=env, timeout=30)
        self.assertEqual(r.returncode, 0)
        self.assertIn("보냄 0/1 · 실패 TypeError", r.stdout)
        self.assertNotIn("SECRETTOKEN", r.stdout + r.stderr)


class SshDeployNotifies(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name)
        self.log = self.base / "calls"
        self.log.write_text("")
        for app in ("fin", "fit"):
            d = self.base / f"pleiades-{app}" / "deploy"
            d.mkdir(parents=True)
            (d / "release-inplace.sh").write_text(
                '#!/bin/bash\necho "C4 plan rc 0 · 기본 실행 rc ${STUB_RC:-0} · 77s · 완료 안내: 예"\n'
                'echo "C5 프로브 오류 응답 0 · 창 안 오류 줄 web 1(경고 1)"\n'
                '[[ ${STUB_RC:-0} -eq 0 ]] && echo "결과: 통과" || echo "결과: 중단 — C4 — 빌드 실패 (/home/svc/x)"\nexit ${STUB_RC:-0}\n')
            (d / "notify-deploy.cjs").write_text("require('fs').appendFileSync(process.env.STUB_LOG, process.argv.slice(2).join('|') + '\\n');"
                                                 "require('fs').appendFileSync(process.env.STUB_LOG + '.exec', process.execArgv.join(' ') + '\\n')\n")

    def tearDown(self):
        self._tmp.cleanup()

    def run_cmd(self, **extra: str) -> subprocess.CompletedProcess:
        env = {"PATH": f"{NODE_DIR}:{BASE_PATH}", "HOME": str(self.base), "PLEIADES_TEST": "1",
               "PLEIADES_CHECKOUT_BASE": str(self.base), "STUB_LOG": str(self.log), "SSH_ORIGINAL_COMMAND": "deploy v1.0.5", **extra}
        return subprocess.run(["bash", str(SSH_DEPLOY)], capture_output=True, text=True, env=env, timeout=30)

    def test_each_app_notifies_with_summary(self):
        r = self.run_cmd()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.log.read_text().splitlines(),
                         ["fin|ok|v1.0.5|소요 77s · 프로브 오류 응답 0", "fit|ok|v1.0.5|소요 77s · 프로브 오류 응답 0"])

    def test_fin_failure_notifies_once_with_redacted_result(self):
        r = self.run_cmd(STUB_RC="4")
        self.assertEqual(r.returncode, 4)
        lines = self.log.read_text().splitlines()
        self.assertEqual(len(lines), 1)
        self.assertTrue(lines[0].startswith("fin|fail|v1.0.5|rc 4 · 중단 — C4 — 빌드 실패"), lines[0])
        self.assertTrue(lines[0].endswith("· fit 은 하지 않았다"), lines[0])
        self.assertNotIn("/home/svc", lines[0])

    def test_already_deployed_is_not_reported_as_a_new_deploy(self):
        for app in ("fin", "fit"):
            (self.base / f"pleiades-{app}" / "deploy" / "release-inplace.sh").write_text('#!/bin/bash\necho "결과: 통과 — 이미 배포됨"\n')
        self.assertEqual(self.run_cmd().returncode, 0)
        self.assertEqual(self.log.read_text().splitlines()[0], "fin|ok|v1.0.5|통과 — 이미 배포됨")

    def test_failure_before_form_has_no_dangling_separator(self):
        (self.base / "pleiades-fin" / "deploy" / "release-inplace.sh").write_text("#!/bin/bash\nexit 127\n")
        self.assertEqual(self.run_cmd().returncode, 127)
        self.assertEqual(self.log.read_text().splitlines(), ["fin|fail|v1.0.5|rc 127 · fit 은 하지 않았다"])

    # 회귀: PR #305 Codex P2 — 서버 IPv4 ~250 ms · IPv6 경로 없음 → pm2 와 같은 타임아웃을 알림 node 에도(#191)
    def test_notifier_gets_network_family_timeout(self):
        self.assertEqual(self.run_cmd().returncode, 0)
        execs = Path(str(self.log) + ".exec").read_text().splitlines()
        self.assertEqual(execs, ["--network-family-autoselection-attempt-timeout=2000"] * 2)
        cfg = (HERE / "pleiades.config.cjs").read_text()
        self.assertIn("--network-family-autoselection-attempt-timeout=2000", cfg, "pm2 설정과 같은 값")

    def test_missing_notify_script_is_skipped(self):
        for app in ("fin", "fit"):
            (self.base / f"pleiades-{app}" / "deploy" / "notify-deploy.cjs").unlink()
        r = self.run_cmd()
        self.assertEqual(r.returncode, 0)
        self.assertIn("알림 스크립트가 없다 — 건너뜀", r.stdout)


if __name__ == "__main__":
    unittest.main()
