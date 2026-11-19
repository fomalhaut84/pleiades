"""deploy/ssh-deploy.sh · .github/workflows/deploy.yml — Release 발행 → 서버 배포 (#242).

실행: python3 -m unittest discover -s deploy
release-inplace.sh 는 스텁으로 바꾼다(가짜 체크아웃 두 개). 핵심 계약: forced command 는 "deploy vX.Y.Z" 하나만 받는다 ·
fin 이 통과하지 않으면 fit 을 하지 않는다 · workflow 는 저장소 코드를 checkout 하지 않고 secrets 는 environment 에만.
"""

import fnmatch
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

    def test_stderr_home_paths_are_redacted_and_code_survives_the_pipe(self):
        # 공개 Actions 로그로 가는 stderr 도 홈 경로를 가린다 — 파이프 뒤에도 앱의 종료 코드를 지킨다
        stub = self.base / "pleiades-fin" / "deploy" / "release-inplace.sh"
        stub.write_text('#!/bin/bash\necho "boom /home/svc/x and $HOME/y" >&2\nexit 4\n')
        r = self.run_cmd("deploy v1.0.3")
        self.assertEqual(r.returncode, 4)
        self.assertNotIn("/home/svc", r.stdout + r.stderr)
        self.assertNotIn(str(self.base), r.stdout + r.stderr)
        self.assertIn("boom ~/x and ~/y", r.stdout)

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


ADV_STUB = """#!/bin/bash
echo "adv $1 $2 stdin=$( [ -t 0 ] && echo tty || echo none )" >> "$STUB_LOG"
echo "=== 판정 양식 adv ==="
[[ ${STUB_RC_adv:-0} -eq 0 ]] && echo "결과: 통과" || echo "결과: 중단 — C3 — 빌드 실패 (/home/svc/x)"
exit "${STUB_RC_adv:-0}"
"""
NOTIFY_STUB = "require('fs').appendFileSync(process.env.STUB_LOG, 'notify ' + process.argv.slice(2).join('|') + '\\n')\n"
INPUTS = HERE / "advisor" / "auto-inputs.txt"
NODE_DIR = str(Path(__import__("shutil").which("node") or "/usr/bin/node").parent)


class AdvAuto(unittest.TestCase):
    """012 4b-5 (#744) — 두 앱 뒤 통합 층은 켜져 있고 입력이 바뀌었을 때만 · 실패는 rc 를 바꾸지 않는다(G-R4)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name)
        for app in ("fin", "fit"):
            d = self.base / f"pleiades-{app}" / "deploy"
            d.mkdir(parents=True)
            (d / "release-inplace.sh").write_text(RELEASE_STUB)
        (self.base / "pleiades-fin" / "deploy" / "notify-deploy.cjs").write_text(NOTIFY_STUB)
        self.log = self.base / "calls"
        self.log.write_text("")
        self.priv = self.base / "pleiades-private"
        self.priv.mkdir()
        self.adv = self.base / "pleiades-adv"
        self.adv.mkdir()
        self.git("init", "-q")
        self.write("deploy/advisor/adv-inplace.sh", ADV_STUB)
        self.write("deploy/advisor/auto-inputs.txt", INPUTS.read_text())
        self.write("apps/advisor/src/main.ts", "1")
        self.write("README.md", "1")
        self.commit_tag("v1.0.0")
        self.write("README.md", "2")              # 입력 밖
        self.commit_tag("v1.0.1")
        self.write("apps/advisor/src/main.ts", "2")  # 입력 안
        self.commit_tag("v1.0.2")
        self.git("checkout", "-q", "v1.0.0")
        self.last_ok("v1.0.0")

    def tearDown(self):
        self._tmp.cleanup()

    def git(self, *args: str) -> str:
        return subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false",
                               "-c", "tag.gpgsign=false", "-C", str(self.adv), *args],
                              check=True, capture_output=True, text=True).stdout

    def write(self, rel: str, text: str) -> None:
        f = self.adv / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text)

    def commit_tag(self, tag: str) -> None:
        self.git("add", "-A")
        self.git("commit", "-q", "-m", tag)
        self.git("tag", tag)

    def last_ok(self, tag: str) -> None:
        (self.priv / "inplace-adv-last-ok").write_text(tag + "\n")

    def run_cmd(self, tag: str, **extra: str) -> subprocess.CompletedProcess:
        env = {"PATH": f"{NODE_DIR}:{BASE_PATH}", "HOME": str(self.base), "PLEIADES_TEST": "1",
               "PLEIADES_CHECKOUT_BASE": str(self.base), "STUB_LOG": str(self.log), "SSH_ORIGINAL_COMMAND": f"deploy {tag}", **extra}
        return subprocess.run(["bash", str(SCRIPT)], capture_output=True, text=True, env=env, timeout=60)

    def calls(self) -> list[str]:
        return [line for line in self.log.read_text().splitlines() if line]

    def adv_calls(self) -> list[str]:
        return [c for c in self.calls() if c.startswith("adv ")]

    def test_changed_input_deploys_after_both_apps(self):
        r = self.run_cmd("v1.0.2")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        runs = [c for c in self.calls() if not c.startswith("notify ")]
        self.assertEqual(runs, ["fin v1.0.2 --yes stdin=none", "fit v1.0.2 --yes stdin=none", "adv v1.0.2 --yes stdin=none"])
        self.assertIn("adv 배포 — 입력 변경 있음(v1.0.0 → v1.0.2)", r.stdout)
        self.assertIn("notify adv|ok|v1.0.2|통과", self.calls())

    def test_unchanged_input_is_skipped(self):
        r = self.run_cmd("v1.0.1")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.adv_calls(), [])
        self.assertIn("adv 건너뜀 — 입력 변경 없음 · v1.0.0 유지", r.stdout)
        self.assertFalse([c for c in self.calls() if c.startswith("notify adv")], "건너뜀은 알리지 않는다")

    # #841 — 선언 입력은 글롭 한 줄 · 셸이 펼치지 않고 git pathspec 으로 넘어가 새 앱의 선언도 배포를 부른다
    def test_new_app_declaration_glob_deploys(self):
        self.git("checkout", "-q", "v1.0.0")
        self.write("apps/newapp/domain.json", "{}")
        self.commit_tag("v4.0.0")
        r = self.run_cmd("v4.0.0")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("adv 배포 — 입력 변경 있음(v1.0.0 → v4.0.0)", r.stdout)
        self.git("checkout", "-q", "v1.0.0")
        self.write("apps/newapp/other.json", "{}")   # 선언 밖 앱 파일
        self.commit_tag("v4.0.1")
        self.last_ok("v1.0.0")
        self.log.write_text("")
        r = self.run_cmd("v4.0.1")
        self.assertIn("adv 건너뜀 — 입력 변경 없음 · v1.0.0 유지", r.stdout)

    # 회귀: 9-1 major — 릴리즈마다 버전 커밋이 루트 · packages 의 package 파일을 바꾼다. 그것만이면 건너뛴다
    def test_version_bump_only_is_skipped_but_dependency_change_deploys(self):
        pkg = '{\n  "name": "pleiades",\n  "version": "%s",\n  "dependencies": {\n    "ws": "%s"\n  }\n}\n'
        lock = '{\n  "name": "pleiades",\n  "version": "%s",\n  "packages": {\n    "": {\n      "version": "%s"\n    },\n' \
               '    "node_modules/ws": {\n      "version": "%s",\n      "resolved": "https://r/ws-%s.tgz"\n    }\n  }\n}\n'
        def release(tag: str, v: str, ws: str) -> None:
            self.git("checkout", "-q", "v1.0.0")
            for rel in ("package.json", "packages/chat/package.json"):
                self.write(rel, pkg % (v, "^" + ws))
            for rel in ("package-lock.json", "packages/notify/package-lock.json"):
                self.write(rel, lock % (v, v, ws, ws))
            self.commit_tag(tag)
        release("v3.0.0", "1.0.0", "8.0.0")
        self.git("checkout", "-q", "v3.0.0")
        self.last_ok("v3.0.0")
        release("v3.0.1", "1.0.1", "8.0.0")   # 버전 줄만
        release("v3.0.2", "1.0.2", "8.1.0")   # 의존도
        self.git("checkout", "-q", "v3.0.0")
        r = self.run_cmd("v3.0.1")
        self.assertIn("adv 건너뜀 — 입력 변경 없음 · v3.0.0 유지", r.stdout)
        r = self.run_cmd("v3.0.2")
        self.assertIn("adv 배포 — 입력 변경 있음(v3.0.0 → v3.0.2)", r.stdout)
        self.assertEqual(self.adv_calls(), ["adv v3.0.2 --yes stdin=none"])

    def test_malformed_last_ok_is_not_echoed_or_used(self):
        self.last_ok("--output=/tmp/x /home/svc")
        r = self.run_cmd("v1.0.1")
        self.assertIn("adv 배포 — 판정 불능(마지막 통과 기록 형식)", r.stdout)
        self.assertNotIn("/home/svc", r.stdout)

    def test_inputs_list_trims_only_line_ends(self):
        self.git("checkout", "-q", "v1.0.0")
        self.write("deploy/advisor/auto-inputs.txt", "  README.md   # 끝 주석\n\t\n")
        self.write("README.md", "9")
        self.commit_tag("v1.2.0")
        self.git("checkout", "-q", "v1.0.0")
        r = self.run_cmd("v1.2.0")
        self.assertIn("adv 배포 — 입력 변경 있음", r.stdout)

    def test_compares_from_last_ok_not_from_previous_release(self):
        # 건너뛴 릴리즈의 변경도 다음 판정에 들어간다 — 마지막 통과(v1.0.0)부터 본다(v1.0.2 → v1.0.3 은 입력 밖)
        self.git("checkout", "-q", "v1.0.2")
        self.write("README.md", "3")
        self.commit_tag("v1.0.3")
        self.git("checkout", "-q", "v1.0.0")
        r = self.run_cmd("v1.0.3")
        self.assertEqual(self.adv_calls(), ["adv v1.0.3 --yes stdin=none"], r.stdout)

    def test_every_listed_input_triggers(self):
        specs = [l.strip() for l in INPUTS.read_text().splitlines() if l.strip() and not l.strip().startswith("#")]
        for i, spec in enumerate(specs):
            tag = f"v2.0.{i}"
            rel = spec + "probe.txt" if spec.endswith("/") else spec
            self.git("checkout", "-q", "v1.0.0")
            self.write(rel, f"change {i}")
            self.commit_tag(tag)
            self.git("checkout", "-q", "v1.0.0")
            self.log.write_text("")
            r = self.run_cmd(tag)
            self.assertEqual(self.adv_calls(), [f"adv {tag} --yes stdin=none"], spec + r.stdout)

    def test_not_started_or_stopped_or_missing_checkout_is_left_alone(self):
        (self.priv / "inplace-adv-last-ok").unlink()
        r = self.run_cmd("v1.0.2")
        self.assertIn("adv 건너뜀 — 첫 배포 전", r.stdout)
        self.last_ok("v1.0.0")
        (self.priv / "inplace-adv-stopped").write_text("x")
        r = self.run_cmd("v1.0.2")
        self.assertIn("adv 건너뜀 — 정지됨(stop) · 마지막 통과 v1.0.0 유지", r.stdout)
        (self.priv / "inplace-adv-stopped").unlink()
        (self.adv / "deploy" / "advisor" / "adv-inplace.sh").unlink()
        r = self.run_cmd("v1.0.2")
        self.assertIn("adv 건너뜀 — 체크아웃 없음(~/pleiades-adv)", r.stdout)
        self.assertEqual(self.adv_calls(), [])
        self.assertEqual(r.returncode, 0)

    def test_app_failure_never_reaches_adv(self):
        for var in ("STUB_RC_fin", "STUB_RC_fit"):
            self.log.write_text("")
            r = self.run_cmd("v1.0.2", **{var: "4"})
            self.assertEqual(r.returncode, 4)
            self.assertEqual(self.adv_calls(), [], var)
            self.assertNotIn("## adv", r.stdout, var)

    def test_adv_failure_keeps_exit_code_and_is_reported(self):
        # G-R4 — 통합 층 실패가 두 앱 결과를 바꾸지 않는다 · 대신 줄과 알림으로 드러난다
        r = self.run_cmd("v1.0.2", STUB_RC_adv="4")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("adv 실패 rc 4 — 두 앱 배포 결과는 그대로다", r.stdout)
        notes = [c for c in self.calls() if c.startswith("notify adv")]
        self.assertEqual(len(notes), 1)
        self.assertTrue(notes[0].startswith("notify adv|fail|v1.0.2|rc 4 · 중단 — C3"), notes[0])
        self.assertNotIn("/home/svc", r.stdout + notes[0])

    def test_unknown_state_deploys(self):
        # 판정하지 못하면 배포한다 — 끝나지 않은 시도 · 같은 태그 · 태그를 못 받음 · 목록 없음
        (self.priv / "inplace-adv-pending").write_text("v1.0.1\n")
        r = self.run_cmd("v1.0.1")
        self.assertIn("adv 배포 — 끝나지 않은 시도가 있다", r.stdout)
        (self.priv / "inplace-adv-pending").unlink()
        self.last_ok("v1.0.1")
        r = self.run_cmd("v1.0.1")
        self.assertIn("adv 배포 — 같은 태그 — 상태 확인", r.stdout)
        self.last_ok("v1.0.0")
        r = self.run_cmd("v9.9.9")
        self.assertIn("adv 배포 — 판정 불능(태그를 받지 못했다)", r.stdout)
        self.git("rm", "-q", "deploy/advisor/auto-inputs.txt")
        self.commit_tag("v1.1.0")
        self.git("checkout", "-q", "v1.0.0")
        r = self.run_cmd("v1.1.0")
        self.assertIn("adv 배포 — 판정 불능(입력 목록 없음)", r.stdout)
        self.assertEqual(len(self.adv_calls()), 4)

    def test_does_not_move_the_third_checkout(self):
        # 판정은 git fetch · diff · show 만 — 체크아웃을 옮기는 것은 adv-inplace.sh 의 일이다
        head = self.git("rev-parse", "HEAD")
        self.run_cmd("v1.0.1")
        self.run_cmd("v1.0.2")
        self.assertEqual(self.git("rev-parse", "HEAD"), head)
        self.assertEqual(self.git("status", "--porcelain"), "")


GLOB_CHARS = re.compile(r"[*?\[]")


class AutoInputs(unittest.TestCase):
    """auto-inputs.txt 가 통합 층이 자기 체크아웃에서 읽는 곳을 덮는다 — 빠지면 그 변경이 운영에 들어가지 않는다."""

    def setUp(self):
        self.specs = [l.strip() for l in INPUTS.read_text().splitlines() if l.strip() and not l.strip().startswith("#")]
        self.src = HERE.parent / "apps" / "advisor" / "src"

    def covered(self, rel: str) -> bool:
        # 글롭 줄은 git pathspec(마법 없음)과 같은 의미 = fnmatch(`*` 가 `/` 를 넘는다) — pathlib.glob 로 바꾸지 않는다(015 AU2:45 · #841)
        return any(rel == s or (s.endswith("/") and rel.startswith(s)) or (GLOB_CHARS.search(s) and fnmatch.fnmatchcase(rel, s))
                   for s in self.specs)

    def test_domain_declarations_and_model_pins(self):
        # #841 — 통합 층은 apps/*/domain.json 을 스캔한다(domains.ts DECLARATION_FILE). 저장소의 선언 전부가 입력이어야 한다
        self.assertIn('DECLARATION_FILE = "domain.json"', (self.src / "domains.ts").read_text())
        decls = sorted(p.parent.name for p in (HERE.parent / "apps").glob("*/domain.json"))
        self.assertGreaterEqual(len(decls), 2)
        for d in decls:
            self.assertTrue(self.covered(f"apps/{d}/domain.json"), d)
        self.assertTrue(self.covered("apps/newapp/domain.json"), "새 앱의 선언도 덮는다(글롭)")
        pins = re.findall(r'dir: "(\w+)"', (self.src / "cli.ts").read_text())
        self.assertTrue(set(pins) <= set(decls), (pins, decls))   # 모델 핀 ⊆ 발견
        for d in pins:
            self.assertTrue(self.covered(f"apps/{d}/src/lib/ai/models.ts"), d)

    def test_code_dependencies_and_deploy_script(self):
        pkg = __import__("json").loads((HERE.parent / "apps" / "advisor" / "package.json").read_text())
        for spec in pkg["dependencies"].values():
            self.assertTrue(spec.startswith("file:../../packages/"), spec)   # 새 의존 형식이면 목록을 다시 본다
            self.assertTrue(self.covered(spec.replace("file:../../", "") + "/"), spec)
        for rel in ("apps/advisor/src/main.ts", "apps/advisor/package-lock.json", "package.json", "package-lock.json",
                    "deploy/advisor/adv-inplace.sh", "deploy/advisor/pleiades-adv.config.cjs"):
            self.assertTrue(self.covered(rel), rel)

    def test_every_spec_exists(self):
        root = HERE.parent
        for s in self.specs:
            if GLOB_CHARS.search(s):   # 글롭은 지금 하나 이상 맞아야 한다(#841)
                tracked = subprocess.run(["git", "-C", str(root), "ls-files"], capture_output=True, text=True, check=True).stdout.split()
                hits = [t for t in tracked if fnmatch.fnmatchcase(t, s)]
                self.assertTrue(hits, s)
            else:
                self.assertTrue((root / s).exists(), s)

    def test_app_code_is_not_an_input(self):
        # 도구 목록 · 지식은 도는 두 앱에서 질문마다 받는다 — 두 앱 코드 전체를 넣으면 거의 모든 릴리즈가 배포된다
        self.assertFalse(self.covered("apps/finance/src/mcp/server.ts"))
        self.assertFalse(self.covered("apps/fitness/src/app/page.tsx"))
        self.assertFalse(self.covered("apps/hermes/src/server.ts"))   # 글롭이 선언 밖 앱 코드를 덮지 않는다(#841)
        self.assertFalse(self.covered("apps/finance/domain.json.bak"))


HRM_STUB = """#!/bin/bash
echo "hrm $1 $2 stdin=$( [ -t 0 ] && echo tty || echo none )" >> "$STUB_LOG"
echo "=== 판정 양식 hrm ==="
[[ ${STUB_RC_hrm:-0} -eq 0 ]] && echo "결과: 통과" || echo "결과: 중단 — C3 — 빌드 실패 (/home/svc/x)"
exit "${STUB_RC_hrm:-0}"
"""
HRM_INPUTS = HERE / "hermes" / "auto-inputs.txt"


class HrmAuto(unittest.TestCase):
    """014 H-4 (#829) — 두 앱 · 통합 층 뒤 hermes 는 켜져 있고 입력이 바뀌었을 때만 · 실패는 rc 를 바꾸지 않는다(G-R4)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name)
        for app in ("fin", "fit"):
            d = self.base / f"pleiades-{app}" / "deploy"
            d.mkdir(parents=True)
            (d / "release-inplace.sh").write_text(RELEASE_STUB)
        (self.base / "pleiades-fin" / "deploy" / "notify-deploy.cjs").write_text(NOTIFY_STUB)
        self.log = self.base / "calls"
        self.log.write_text("")
        self.priv = self.base / "pleiades-private"
        self.priv.mkdir()
        # 두 곁가지 체크아웃 — 같은 이력(같은 저장소의 다른 체크아웃)
        self.adv = self.base / "pleiades-adv"
        self.hrm = self.base / "pleiades-hermes"
        self.repo(self.hrm)
        self.git(self.hrm, "init", "-q")
        self.write("deploy/advisor/adv-inplace.sh", ADV_STUB)
        self.write("deploy/advisor/auto-inputs.txt", INPUTS.read_text())
        self.write("deploy/hermes/hrm-inplace.sh", HRM_STUB)
        self.write("deploy/hermes/auto-inputs.txt", HRM_INPUTS.read_text())
        self.write("apps/hermes/src/main.ts", "1")
        self.write("apps/advisor/src/main.ts", "1")
        self.write("README.md", "1")
        self.commit_tag("v1.0.0")
        self.write("README.md", "2")                # 둘 다 입력 밖
        self.commit_tag("v1.0.1")
        self.write("apps/hermes/src/main.ts", "2")  # hermes 입력만
        self.commit_tag("v1.0.2")
        self.write("packages/notify/src/x.ts", "1")  # 둘 다 입력(packages/ · packages/notify/)
        self.commit_tag("v1.0.3")
        self.git(self.hrm, "checkout", "-q", "v1.0.0")
        subprocess.run(["git", "clone", "-q", str(self.hrm), str(self.adv)], check=True, capture_output=True)
        self.git(self.adv, "checkout", "-q", "v1.0.0")
        for key in ("adv", "hrm"):
            (self.priv / f"inplace-{key}-last-ok").write_text("v1.0.0\n")

    def tearDown(self):
        self._tmp.cleanup()

    @staticmethod
    def repo(d: Path) -> None:
        d.mkdir()

    def git(self, d: Path, *args: str) -> str:
        return subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false",
                               "-c", "tag.gpgsign=false", "-C", str(d), *args],
                              check=True, capture_output=True, text=True).stdout

    def write(self, rel: str, text: str) -> None:
        f = self.hrm / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text)

    def commit_tag(self, tag: str) -> None:
        self.git(self.hrm, "add", "-A")
        self.git(self.hrm, "commit", "-q", "-m", tag)
        self.git(self.hrm, "tag", tag)

    def run_cmd(self, tag: str, **extra: str) -> subprocess.CompletedProcess:
        env = {"PATH": f"{NODE_DIR}:{BASE_PATH}", "HOME": str(self.base), "PLEIADES_TEST": "1",
               "PLEIADES_CHECKOUT_BASE": str(self.base), "STUB_LOG": str(self.log), "SSH_ORIGINAL_COMMAND": f"deploy {tag}", **extra}
        return subprocess.run(["bash", str(SCRIPT)], capture_output=True, text=True, env=env, timeout=60)

    def runs(self) -> list[str]:
        return [c for c in self.log.read_text().splitlines() if c and not c.startswith("notify ")]

    def hrm_calls(self) -> list[str]:
        return [c for c in self.runs() if c.startswith("hrm ")]

    def test_changed_input_deploys_after_apps_and_adv(self):
        r = self.run_cmd("v1.0.3")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.runs(), ["fin v1.0.3 --yes stdin=none", "fit v1.0.3 --yes stdin=none",
                                       "adv v1.0.3 --yes stdin=none", "hrm v1.0.3 --yes stdin=none"])
        self.assertLess(r.stdout.index("## adv"), r.stdout.index("## hrm"))
        self.assertIn("hrm 배포 — 입력 변경 있음(v1.0.0 → v1.0.3)", r.stdout)
        self.assertIn("notify hrm|ok|v1.0.3|통과", self.log.read_text().splitlines())

    def test_inputs_are_per_side_app(self):
        # v1.0.2 는 hermes 코드만 바꿨다 — 통합 층은 건너뛰고 hermes 만 배포한다
        r = self.run_cmd("v1.0.2")
        self.assertIn("adv 건너뜀 — 입력 변경 없음 · v1.0.0 유지", r.stdout)
        self.assertEqual(self.hrm_calls(), ["hrm v1.0.2 --yes stdin=none"])

    def test_unchanged_input_is_skipped_and_not_notified(self):
        r = self.run_cmd("v1.0.1")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("hrm 건너뜀 — 입력 변경 없음 · v1.0.0 유지", r.stdout)
        self.assertEqual(self.hrm_calls(), [])
        self.assertNotIn("notify hrm", self.log.read_text())

    def test_every_listed_input_triggers(self):
        specs = [l.strip() for l in HRM_INPUTS.read_text().splitlines() if l.strip() and not l.strip().startswith("#")]
        for i, spec in enumerate(specs):
            tag = f"v2.0.{i}"
            rel = spec + "probe.txt" if spec.endswith("/") else spec
            self.git(self.hrm, "checkout", "-q", "v1.0.0")
            self.write(rel, f"change {i}")
            self.commit_tag(tag)
            self.git(self.hrm, "checkout", "-q", "v1.0.0")
            self.log.write_text("")
            r = self.run_cmd(tag)
            self.assertEqual(self.hrm_calls(), [f"hrm {tag} --yes stdin=none"], spec + r.stdout)

    def test_not_started_or_stopped_or_missing_checkout_is_left_alone(self):
        (self.priv / "inplace-hrm-last-ok").unlink()
        r = self.run_cmd("v1.0.2")
        self.assertIn("hrm 건너뜀 — 첫 배포 전(첫 배포는 수동 · 런북 hermes.md)", r.stdout)
        (self.priv / "inplace-hrm-last-ok").write_text("v1.0.0\n")
        (self.priv / "inplace-hrm-stopped").write_text("x")
        r = self.run_cmd("v1.0.2")
        self.assertIn("hrm 건너뜀 — 정지됨(stop) · 마지막 통과 v1.0.0 유지", r.stdout)
        (self.priv / "inplace-hrm-stopped").unlink()
        (self.hrm / "deploy" / "hermes" / "hrm-inplace.sh").unlink()
        r = self.run_cmd("v1.0.2")
        self.assertIn("hrm 건너뜀 — 체크아웃 없음(~/pleiades-hermes)", r.stdout)
        self.assertEqual(self.hrm_calls(), [])
        self.assertEqual(r.returncode, 0)

    def test_hrm_failure_keeps_exit_code_and_is_reported(self):
        r = self.run_cmd("v1.0.2", STUB_RC_hrm="4")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("hrm 실패 rc 4 — 두 앱 배포 결과는 그대로다", r.stdout)
        notes = [c for c in self.log.read_text().splitlines() if c.startswith("notify hrm")]
        self.assertEqual(len(notes), 1)
        self.assertTrue(notes[0].startswith("notify hrm|fail|v1.0.2|rc 4 · 중단 — C3"), notes[0])
        self.assertNotIn("/home/svc", r.stdout + notes[0])

    def test_adv_failure_does_not_stop_hrm(self):
        r = self.run_cmd("v1.0.3", STUB_RC_adv="4")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("adv 실패 rc 4", r.stdout)
        self.assertEqual(self.hrm_calls(), ["hrm v1.0.3 --yes stdin=none"])

    def test_unknown_side_key_is_skipped(self):
        # #829 9-1 info — 모르는 키는 "체크아웃 없음(~/)" 같은 엉뚱한 안내 대신 그렇다고 적고 건너뛴다
        script = (f"source {SCRIPT}; OUT=$(mktemp); side_auto xyz {self.base} v1.0.3; rc=$?; rm -f \"$OUT\"; exit $rc")
        r = subprocess.run(["bash", "-c", script], capture_output=True, text=True, timeout=30,
                           env={"PATH": f"{NODE_DIR}:{BASE_PATH}", "HOME": str(self.base), "STUB_LOG": str(self.log)})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("xyz 건너뜀 — 모르는 곁가지 키", r.stdout)
        self.assertEqual(self.hrm_calls(), [])

    def test_app_failure_never_reaches_side_apps(self):
        r = self.run_cmd("v1.0.3", STUB_RC_fit="4")
        self.assertEqual(r.returncode, 4)
        self.assertNotIn("## hrm", r.stdout)
        self.assertEqual(self.hrm_calls(), [])


class HrmAutoInputs(unittest.TestCase):
    """deploy/hermes/auto-inputs.txt 가 hermes 가 자기 체크아웃에서 읽는 곳을 덮는다 — 빠지면 그 변경이 운영에 들어가지 않는다."""

    def setUp(self):
        self.specs = [l.strip() for l in HRM_INPUTS.read_text().splitlines() if l.strip() and not l.strip().startswith("#")]

    def covered(self, rel: str) -> bool:
        return any(rel == s or (s.endswith("/") and rel.startswith(s)) for s in self.specs)

    def test_code_dependencies_and_deploy_scripts(self):
        pkg = __import__("json").loads((HERE.parent / "apps" / "hermes" / "package.json").read_text())
        for spec in pkg.get("dependencies", {}).values():
            if spec.startswith("file:"):
                self.assertTrue(spec.startswith("file:../../packages/"), spec)   # 새 의존 형식이면 목록을 다시 본다
                self.assertTrue(self.covered(spec.replace("file:../../", "") + "/"), spec)
        for rel in ("apps/hermes/src/x.ts", "apps/hermes/package-lock.json", "package.json", "package-lock.json",
                    "deploy/hermes/hrm-inplace.sh", "deploy/hermes/hermes-key.sh", "deploy/hermes/pleiades-hrm.config.cjs"):
            self.assertTrue(self.covered(rel), rel)

    def test_every_spec_exists(self):
        root = HERE.parent
        for s in self.specs:
            if GLOB_CHARS.search(s):   # 글롭은 지금 하나 이상 맞아야 한다(#841)
                tracked = subprocess.run(["git", "-C", str(root), "ls-files"], capture_output=True, text=True, check=True).stdout.split()
                hits = [t for t in tracked if fnmatch.fnmatchcase(t, s)]
                self.assertTrue(hits, s)
            else:
                self.assertTrue((root / s).exists(), s)

    def test_other_apps_are_not_inputs(self):
        # hermes 가 쓰지 않는 곳 — 넣으면 거의 모든 릴리즈가 hermes 를 다시 띄운다
        for rel in ("packages/chat/src/index.ts", "apps/finance/src/x.ts", "apps/advisor/src/main.ts", "deploy/deploy.sh"):
            self.assertFalse(self.covered(rel), rel)


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

    def test_prerelease_is_skipped_and_key_file_is_removed(self):
        self.assertIn("!github.event.release.prerelease", self.text)
        self.assertIn("trap 'rm -f ~/.ssh/deploy' EXIT", self.text)

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
