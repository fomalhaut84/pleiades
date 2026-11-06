"""deploy/notify-deploy.cjs · ssh-deploy.sh 알림 연결 — 자동 배포 완료·중단 알림 (#304 · 009 D-5 B1 #502).

실행: python3 -m unittest discover -s deploy
Discord 에는 보내지 않는다(PLEIADES_TEST=1 NOTIFY_DRY_RUN=1 · fetch 스텁). 핵심 계약: 웹훅을 출력하지 않는다 ·
늘 Discord 배포 채널(스위치를 읽지 않는다 · 옛 채널 대체 없음) · 웹훅이 비면 보내지 않고 0 · ssh-deploy 는 앱마다 결과를 넘긴다.
"""

import json
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

    def platform(self, text: str) -> str:
        f = self.root / "platform.env"
        f.write_text(text)
        return str(f)

    HOOK = 'DISCORD_WEBHOOK_DEPLOY="https://discord.com/api/webhooks/1/SECRETHOOK"\n'

    def test_sends_to_deploy_webhook_and_hides_it(self):
        r = self.run_notify("fin", "fail", "v1.0.7", "rc 1 · 중단 — C4 *빌드* <확인 실패>", PLEIADES_ENV_FILE=self.platform(self.HOOK))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("(dry-run) Discord 배포 채널", r.stdout)
        self.assertIn("⚠️ **fin v1.0.7 배포 중단**", r.stdout)
        self.assertIn("\\*빌드\\*", r.stdout)   # 마크다운 escape
        self.assertIn("\\<확인 실패\\>", r.stdout)
        self.assertIn("Actions 실행 요약", r.stdout)
        self.assertIn("https://github.com/fomalhaut84/pleiades/releases/tag/v1.0.7", r.stdout)
        self.assertNotIn("SECRETHOOK", r.stdout + r.stderr)

    def test_ok_message(self):
        r = self.run_notify("fit", "ok", "v1.0.5", "소요 129s · 프로브 오류 응답 0", PLEIADES_ENV_FILE=self.platform(self.HOOK))
        self.assertIn("✅ **fit v1.0.5 배포 완료**", r.stdout)
        self.assertIn("소요 129s", r.stdout)
        self.assertNotIn("Actions 실행 요약", r.stdout)

    # 회귀: #502 — 스위치를 읽지 않는다(R2 뒤 앱과 같다) · 옛 채널 키가 있어도 옛 채널로 가지 않는다
    def test_switch_is_ignored_and_legacy_channel_is_never_used(self):
        self.env_file("finance", "TELEGRAM_BOT_TOKEN=1:SECRETTOKEN\nTELEGRAM_ADMIN_CHAT_IDS=9\n")
        r = self.run_notify("fin", "ok", "v1.0.7", "x", PLEIADES_ENV_FILE=self.platform('NOTIFY_DEPLOY_CHANNEL=""\n' + self.HOOK))
        self.assertIn("(dry-run) Discord 배포 채널", r.stdout)
        self.assertNotIn("수신자", r.stdout)
        self.assertNotIn("SECRETTOKEN", r.stdout + r.stderr)
        self.assertNotIn("telegram", (self.root / "deploy" / "notify-deploy.cjs").read_text().lower())

    # 회귀: #502 사전 리뷰 info — 읽기 실패와 키 없음을 다른 문구로
    def test_missing_webhook_does_not_fail_the_deploy(self):
        cases = (({"PLEIADES_ENV_FILE": self.platform("DISCORD_WEBHOOK_DEPLOY=\n")}, "DISCORD_WEBHOOK_DEPLOY 가 비어 있다"),
                 ({"PLEIADES_ENV_FILE": str(self.root / "none.env")}, "플랫폼 설정을 읽지 못했다"),
                 ({}, "플랫폼 설정 위치가 없다"))
        for pf, why in cases:
            with self.subTest(env=pf):
                r = self.run_notify("fin", "ok", "v1.0.5", "x", **pf)
                self.assertEqual(r.returncode, 0)
                self.assertIn(f"보내지 않았다 — {why}", r.stdout)

    def test_bad_arguments_send_nothing(self):
        pf = self.platform(self.HOOK)
        for args in (("xxx", "ok", "v1.0.5"), ("fin", "maybe", "v1.0.5"), ("fin", "ok", "1.0.5"), ("fin", "ok", "v1.0.5; rm")):
            r = self.run_notify(*args, PLEIADES_ENV_FILE=pf)
            self.assertEqual(r.returncode, 0)
            self.assertIn("보내지 않았다", r.stdout)

    def test_test_mode_never_reads_home_platform_file(self):
        home = self.root / "home"
        home.mkdir()
        (home / "pleiades-platform.env").write_text(self.HOOK)
        r = self.run_notify("fin", "ok", "v1.0.7", "x", HOME=str(home))
        self.assertIn("플랫폼 설정 위치가 없다", r.stdout)

    def run_real(self, stub: str) -> subprocess.CompletedProcess:
        (self.root / "stub.cjs").write_text(stub)
        env = {"PATH": f"{NODE_DIR}:{BASE_PATH}", "NODE_OPTIONS": "--require=" + str(self.root / "stub.cjs"),
               "PLEIADES_ENV_FILE": self.platform(self.HOOK), "CALLS": str(self.root / "calls")}
        return subprocess.run(["node", str(self.root / "deploy" / "notify-deploy.cjs"), "fin", "ok", "v1.0.5", "x"],
                              capture_output=True, text=True, env=env, timeout=30)

    def test_real_send_posts_once_without_mentions(self):
        r = self.run_real("globalThis.fetch = async (u, o) => { require('fs').appendFileSync(process.env.CALLS, o.body + '\\n'); return { ok: true, status: 204, body: null } }\n")
        self.assertEqual(r.returncode, 0)
        self.assertIn("fin 보냄 Discord 배포 채널", r.stdout)
        bodies = (self.root / "calls").read_text().splitlines()
        self.assertEqual(len(bodies), 1)
        self.assertEqual(json.loads(bodies[0])["allowed_mentions"], {"parse": []})

    def test_http_error_reports_status_only(self):
        r = self.run_real("globalThis.fetch = async () => ({ ok: false, status: 404, body: null })\n")
        self.assertEqual(r.returncode, 0)
        self.assertIn("Discord 배포 채널 실패 HTTP 404", r.stdout)
        self.assertNotIn("SECRETHOOK", r.stdout + r.stderr)

    def test_real_send_failure_hides_webhook(self):
        r = self.run_real("globalThis.fetch = async (u) => { throw new TypeError('fetch failed ' + u) }\n")
        self.assertEqual(r.returncode, 0)
        self.assertIn("실패 TypeError", r.stdout)
        self.assertNotIn("SECRETHOOK", r.stdout + r.stderr)


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
