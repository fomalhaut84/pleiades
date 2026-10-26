"""deploy/ssh-deploy.sh · .github/workflows/deploy.yml — Release 발행 → 서버 배포 (#242).

실행: python3 -m unittest discover -s deploy
release-inplace.sh 는 스텁으로 바꾼다(가짜 체크아웃 두 개). 핵심 계약: forced command 는 "deploy vX.Y.Z" 하나만 받는다 ·
fin 이 통과하지 않으면 fit 을 하지 않는다 · workflow 는 저장소 코드를 checkout 하지 않고 secrets 는 environment 에만.
"""

import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "ssh-deploy.sh"
WORKFLOW = HERE.parent / ".github" / "workflows" / "deploy.yml"
BASE_PATH = "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"

RELEASE_STUB = """#!/bin/bash
echo "$1 $2 $3 stdin=$( [ -t 0 ] && echo tty || echo none )" >> "$STUB_LOG"
echo "=== 판정 양식 $1 ==="
rc_var="STUB_RC_$1"
exit "${!rc_var:-0}"
"""


class SshDeploy(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name)
        for app in ("fin", "fit"):
            d = self.base / f"pleiades-{app}" / "deploy"
            d.mkdir(parents=True)
            (d / "release-inplace.sh").write_text(RELEASE_STUB)
        self.log = self.base / "calls"
        self.log.write_text("")

    def tearDown(self):
        self._tmp.cleanup()

    def run_cmd(self, cmd: str | None, **extra: str) -> subprocess.CompletedProcess:
        env = {"PATH": BASE_PATH, "HOME": str(self.base), "PLEIADES_TEST": "1", "PLEIADES_CHECKOUT_BASE": str(self.base),
               "STUB_LOG": str(self.log), **extra}
        if cmd is not None:
            env["SSH_ORIGINAL_COMMAND"] = cmd
        return subprocess.run(["bash", str(SCRIPT)], capture_output=True, text=True, env=env, timeout=30)

    def calls(self) -> list[str]:
        return [line for line in self.log.read_text().splitlines() if line]

    def test_deploys_fin_then_fit_with_yes(self):
        r = self.run_cmd("deploy v1.0.3")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.calls(), ["fin v1.0.3 --yes stdin=none", "fit v1.0.3 --yes stdin=none"])
        self.assertIn("=== 판정 양식 fin ===", r.stdout)
        self.assertIn("=== 판정 양식 fit ===", r.stdout)

    def test_fin_failure_skips_fit_and_keeps_code(self):
        for code in ("1", "3", "4"):
            self.log.write_text("")
            r = self.run_cmd("deploy v1.0.3", STUB_RC_fin=code)
            self.assertEqual(r.returncode, int(code))
            self.assertEqual(self.calls(), ["fin v1.0.3 --yes stdin=none"])
            self.assertIn("fit 은 하지 않았다", r.stdout)

    def test_fit_failure_returns_its_code(self):
        r = self.run_cmd("deploy v1.0.3", STUB_RC_fit="4")
        self.assertEqual(r.returncode, 4)
        self.assertEqual(len(self.calls()), 2)

    def test_rejects_everything_else(self):
        # forced command 는 셸이 아니다 — 명령 주입·인자 추가·다른 명령·대화형 셸을 모두 거부한다
        for cmd in (None, "", "deploy", "deploy 1.0.3", "deploy v1.0", "deploy v1.0.3 --retry", "deploy v1.0.3; rm -rf ~",
                    "deploy v1.0.3 && id", "deploy $(id)", "deploy v1.0.3\nid", "bash", "deploy  v1.0.3", " deploy v1.0.3",
                    "rollback v1.0.2", "deploy v1.0.3 fin"):
            self.log.write_text("")
            r = self.run_cmd(cmd)
            self.assertEqual(r.returncode, 2, repr(cmd))
            self.assertEqual(self.calls(), [], repr(cmd))

    def test_checkout_base_override_only_in_tests(self):
        r = subprocess.run(["bash", str(SCRIPT)], capture_output=True, text=True, timeout=30,
                           env={"PATH": BASE_PATH, "HOME": str(self.base / "nohome"), "SSH_ORIGINAL_COMMAND": "deploy v1.0.3",
                                "PLEIADES_CHECKOUT_BASE": str(self.base), "STUB_LOG": str(self.log)})
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_running_script_overwritten_in_place_does_not_change_the_run(self):
        # fin 의 checkout 이 이 파일(fin 체크아웃 안)을 바꾼다 — 같은 inode 덮어쓰기로 엄격히
        copy = self.base / "pleiades-fin" / "deploy" / "ssh-deploy.sh"
        copy.write_text(SCRIPT.read_text())
        overwrite = f'printf "%s\\n" "#!/usr/bin/env bash" "$(printf "# pad%.0s\\n" $(seq 4000))" "echo SELFCHANGED; exit 99" > {copy}\n'
        stub = self.base / "pleiades-fin" / "deploy" / "release-inplace.sh"
        stub.write_text(RELEASE_STUB.replace('echo "=== 판정 양식 $1 ==="', overwrite + 'echo "=== 판정 양식 $1 ==="'))
        r = subprocess.run(["bash", str(copy)], capture_output=True, text=True, timeout=30,
                           env={"PATH": BASE_PATH, "HOME": str(self.base), "PLEIADES_TEST": "1",
                                "PLEIADES_CHECKOUT_BASE": str(self.base), "STUB_LOG": str(self.log),
                                "SSH_ORIGINAL_COMMAND": "deploy v1.0.3"})
        self.assertNotIn("SELFCHANGED", r.stdout + r.stderr)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


class Workflow(unittest.TestCase):
    def setUp(self):
        self.text = WORKFLOW.read_text()

    def test_triggers_only_on_published_release(self):
        self.assertRegex(self.text, r"on:\s*\n\s+release:\s*\n\s+types: \[published\]")
        self.assertNotIn("pull_request", self.text)
        self.assertNotIn("workflow_dispatch", self.text)

    def test_never_checks_out_repository_code(self):
        # 러너에서 저장소 코드를 돌리지 않는다 — secrets 와 같은 job 에서 PR 코드가 돌 길이 없다
        self.assertNotIn("actions/checkout", self.text)
        self.assertNotRegex(self.text, r"uses:\s")

    def test_secrets_only_via_production_environment_and_no_token_permissions(self):
        self.assertIn("environment: production", self.text)
        self.assertIn("permissions: {}", self.text)
        used = set(re.findall(r"secrets\.([A-Z_]+)", self.text))
        self.assertEqual(used, {"DEPLOY_SSH_KEY", "DEPLOY_HOST", "DEPLOY_USER", "DEPLOY_KNOWN_HOSTS", "DEPLOY_PORT"})

    def test_strict_host_key_and_single_command(self):
        self.assertIn("StrictHostKeyChecking=yes", self.text)
        self.assertIn("BatchMode=yes", self.text)
        self.assertIn('"deploy $TAG"', self.text)
        self.assertIn("^v[0-9]+\\.[0-9]+\\.[0-9]+$", self.text)

    def test_untrusted_release_fields_are_not_interpolated_into_scripts(self):
        # 표현식 주입 — run: 안에 ${{ github.event.* }} 를 직접 쓰지 않고 env 로만 넘긴다
        for block in re.findall(r"run: \|\n((?:\s{10}.*\n)+)", self.text):
            self.assertNotIn("${{", block)

    def test_serialized(self):
        self.assertIn("group: deploy", self.text)
        self.assertIn("cancel-in-progress: false", self.text)


if __name__ == "__main__":
    unittest.main()
