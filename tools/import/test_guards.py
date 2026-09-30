"""가드 A·B·C · 스크래치 검사 · STATE.json · VERSIONS 고정 (#104 · 006 §4-2).

가짜 저장소를 임시 디렉터리에 만들어 force-push · squash 를 재현한다 — 네트워크 없음.
실행: python3 -m unittest discover -s tools/import
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import guards as g  # noqa: E402

A = "a" * 40
B = "b" * 40
CB = "c" * 64
ENTRY = {"service_repo": "myFitness", "service_dev": A, "rewritten_tip": B,
         "filter_repo": "a40bce548d2c", "callback_sha": CB, "git": "git version 2.50.1 (Apple Git-155)"}


def git(repo, *args):
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, check=True, env=env).stdout.strip()


def commit(repo, name):
    Path(repo, name).write_text(name)
    git(repo, "add", name)
    git(repo, "commit", "-q", "-m", name)
    return git(repo, "rev-parse", "HEAD")


class Repo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = self.tmp.name
        git(self.repo, "init", "-q", "-b", "dev")

    def tearDown(self):
        self.tmp.cleanup()


class GuardA(Repo):
    """서비스 dev 가 force-push 되면 마지막 수용 SHA 가 조상이 아니다."""

    def test_fast_forward_passes(self):
        c1 = commit(self.repo, "1")
        c3 = (commit(self.repo, "2"), commit(self.repo, "3"))[-1]
        g.guard("a", self.repo, c1, c3)

    def test_force_push_fails(self):
        c1 = commit(self.repo, "1")
        c2 = commit(self.repo, "2")
        git(self.repo, "reset", "-q", "--hard", c1)
        git(self.repo, "commit", "-q", "--amend", "-m", "rewritten")
        with self.assertRaises(g.GuardError):
            g.guard("a", self.repo, c2, "HEAD")

    def test_missing_object_fails(self):
        commit(self.repo, "1")
        with self.assertRaises(g.GuardError):
            g.guard("a", self.repo, "f" * 40, "HEAD")


class GuardC(Repo):
    """이전 동기화 PR 이 squash 되면 재작성 tip 이 dev 의 조상이 아니다 (#75 · fit#501 전례)."""

    def _import_branch(self):
        base = commit(self.repo, "base")
        git(self.repo, "checkout", "-q", "-b", "import")
        tip = commit(self.repo, "svc")
        git(self.repo, "checkout", "-q", "dev")
        return base, tip

    def test_merge_commit_passes(self):
        _, tip = self._import_branch()
        git(self.repo, "merge", "-q", "--no-ff", "-m", "sync", "import")
        g.guard("c", self.repo, tip, "dev")

    def test_squash_fails(self):
        _, tip = self._import_branch()
        git(self.repo, "merge", "-q", "--squash", "import")
        git(self.repo, "commit", "-q", "-m", "squashed")
        with self.assertRaises(g.GuardError) as cm:
            g.guard("c", self.repo, tip, "dev")
        self.assertIn("-s ours", str(cm.exception))


class GuardB(Repo):
    def test_incremental_passes_and_drift_fails(self):
        prev = commit(self.repo, "1")
        new = commit(self.repo, "2")
        g.guard("b", self.repo, prev, new)
        git(self.repo, "checkout", "-q", "--orphan", "other")
        drift = commit(self.repo, "x")
        with self.assertRaises(g.GuardError):
            g.guard("b", self.repo, prev, drift)


class Scratch(unittest.TestCase):
    def test_inside_root_fails(self):
        with self.assertRaises(g.GuardError):
            g.check_scratch(str(g.ROOT / "_workspace"))
        with self.assertRaises(g.GuardError):
            g.check_scratch(str(g.ROOT))

    def test_outside_passes(self):
        with tempfile.TemporaryDirectory() as d:
            g.check_scratch(d)

    def test_symlink_into_root_fails(self):
        with tempfile.TemporaryDirectory() as d:
            link = Path(d, "link")
            link.symlink_to(g.ROOT)
            with self.assertRaises(g.GuardError):
                g.check_scratch(str(link))

    def test_sibling_prefix_is_outside(self):
        with tempfile.TemporaryDirectory() as d:
            g.check_scratch(d, root=Path(d + "-other"))


class State(unittest.TestCase):
    def test_valid_and_immutable_update(self):
        s0 = {"version": 1}
        s1 = g.with_app(s0, "fit", ENTRY)
        self.assertEqual(s0, {"version": 1})
        self.assertEqual(s1["fit"]["rewritten_tip"], B)
        s2 = g.with_app(s1, "fit", {"rewritten_tip": A})
        self.assertEqual((s1["fit"]["rewritten_tip"], s2["fit"]["rewritten_tip"]), (B, A))

    def test_invalid_rejected(self):
        bad = [
            {"fit": ENTRY},
            {"version": 1, "cal": ENTRY},
            {"version": 1, "fit": {**ENTRY, "service_dev": "abc"}},
            {"version": 1, "fit": {**ENTRY, "service_repo": "pleiades"}},
            {"version": 1, "fit": {k: v for k, v in ENTRY.items() if k != "git"}},
            {"version": 1, "fit": {**ENTRY, "extra": "x"}},
            {"version": True, "fit": ENTRY},
            {"version": 1, "fin": ENTRY},  # fin 항목에 myFitness
            [],
        ]
        for s in bad:
            with self.subTest(state=s):
                with self.assertRaises(g.UsageError):
                    g.validate_state(s)

    def test_cli_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            path = str(Path(d, "STATE.json"))
            self.assertEqual(g.run(["state-get", path, "fit", "rewritten_tip"]), "")
            g.run(["state-set", path, "fit", *[f"{k}={v}" for k, v in ENTRY.items()]])
            self.assertEqual(g.run(["state-get", path, "fit", "rewritten_tip"]), B)
            self.assertEqual(json.loads(Path(path).read_text())["version"], 1)
            with self.assertRaises(g.UsageError):
                g.run(["state-set", path, "fit", "service_dev=nothex"])
            self.assertEqual(g.run(["state-get", path, "fit", "service_dev"]), A)  # 실패한 쓰기는 파일을 바꾸지 않는다

    def test_schema_file_matches_validator_keys(self):
        schema = json.loads((HERE / "STATE.schema.json").read_text())
        self.assertEqual(set(schema["$defs"]["app"]["required"]), set(g.STATE_KEYS))


class VersionsPin(unittest.TestCase):
    """callback 을 바꾸면 VERSIONS 도 바꿔야 한다 — 모르고 바꾸면 M-1 이후 가드 B 가 깨진다."""

    def test_callback_hash_pinned(self):
        pinned = dict(line.split(": ", 1) for line in (HERE / "VERSIONS").read_text().splitlines()
                      if ": " in line and not line.startswith("#"))
        self.assertEqual(pinned["callback"], g.callback_sha(),
                         "rewrite.py 또는 msg_*.callback 이 바뀌었다 — 의도했다면 VERSIONS 의 callback 을 갱신한다")

    def test_callbacks_differ_only_by_app(self):
        fin = (HERE / "msg_fin.callback").read_text()
        self.assertEqual(fin.replace('"fin"', '"fit"'), (HERE / "msg_fit.callback").read_text())


class Cli(unittest.TestCase):
    def test_exit_codes(self):
        script = str(HERE / "guards.py")
        run = lambda *a: subprocess.run([sys.executable, script, *a], capture_output=True, check=False).returncode  # noqa: E731
        self.assertEqual(run("scratch", str(g.ROOT)), 1)
        self.assertEqual(run("scratch", tempfile.gettempdir()), 0)
        self.assertEqual(run("nope"), 2)
        self.assertEqual(run(), 2)


if __name__ == "__main__":
    unittest.main()
