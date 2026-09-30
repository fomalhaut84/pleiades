"""import_app.sh 끝까지 — 가짜 서비스 저장소 · 가짜 pleiades 로 first → sync → squash(가드 C) → force-push(가드 A) (#104).

네트워크 없음(SOURCE_URL = 로컬 경로). git-filter-repo 가 있어야 돈다 — `FILTER_REPO=<venv>/bin/git-filter-repo` 가 없으면 건너뛴다.
실행: FILTER_REPO=… python3 -m unittest discover -s tools/import
"""

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import gate  # noqa: E402

FR = os.environ.get("FILTER_REPO", "")
ENV = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
       "GIT_COMMITTER_EMAIL": "t@t", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True,
                          check=True, env=ENV).stdout.strip()


def commit(repo, name, msg):
    Path(repo, name).write_text(msg)
    git(repo, "add", name)
    git(repo, "commit", "-q", "-m", msg)


@unittest.skipUnless(FR and os.access(FR, os.X_OK), "FILTER_REPO 없음 — venv 에 git-filter-repo==2.47.0")
class ImportApp(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = Path(self.tmp.name)
        self.svc, self.root, self.scratch = t / "svc", t / "pleiades", t / "scratch"
        self.scratch.mkdir()
        git(t, "init", "-q", "-b", "dev", str(self.svc))
        commit(self.svc, "a.txt", "feat: first (#1)")
        commit(self.svc, "b.txt", "fix: Closes fomalhaut84/myFitness#2 thanks @octocat")
        git(t, "init", "-q", "-b", "dev", str(self.root))
        (self.root / "tools" / "import").mkdir(parents=True)
        commit(self.root, "README", "init")
        git(self.root, "checkout", "-q", "-b", "chore/1-import")

    def tearDown(self):
        self.tmp.cleanup()

    def run_import(self, mode, base="dev"):
        env = {**ENV, "ISSUE": "1", "SCRATCH": str(self.scratch), "FILTER_REPO": FR, "SOURCE_URL": str(self.svc),
               "PLEIADES_ROOT": str(self.root), "BASE_REF": base}
        return subprocess.run(["bash", str(HERE / "import_app.sh"), "fit", mode], capture_output=True, text=True,
                              env=env, check=False)

    def merge_pr(self, squash=False):
        """사용자가 PR 을 머지하는 것을 흉내 낸다."""
        branch = git(self.root, "branch", "--show-current")
        git(self.root, "checkout", "-q", "dev")
        if squash:
            git(self.root, "merge", "-q", "--squash", branch)
            git(self.root, "commit", "-q", "-m", "squashed")
        else:
            git(self.root, "merge", "-q", "--no-ff", "-m", "merge PR", branch)
        git(self.root, "checkout", "-q", "-b", f"chore/1-sync-{os.urandom(2).hex()}")

    def test_first_then_sync(self):
        r = self.run_import("first")
        self.assertEqual(r.returncode, 0, r.stderr)
        merge = git(self.root, "log", "-1", "--format=%B", "HEAD^")
        self.assertIn(f"Service-Dev: {git(self.svc, 'rev-parse', 'dev')}", merge)
        self.assertIn("Service-Repo: myFitness", merge)
        self.assertEqual(git(self.root, "rev-parse", "HEAD^:apps/fitness"), git(self.svc, "rev-parse", "dev^{tree}"))
        imported = git(self.root, "log", "--format=%B", "HEAD^^2")
        self.assertEqual(gate.findings(imported), [])
        self.assertIn("fit#2", imported)
        self.assertEqual(git(self.root, "for-each-ref", "refs/import"), "")  # 임시 ref 정리
        self.assertEqual(git(self.root, "tag"), "")  # 태그를 따라오지 않는다 (I-16)

        self.merge_pr()
        self.assertEqual(self.run_import("sync").returncode, 0)  # 새 커밋 없음 → 최신
        commit(self.svc, "c.txt", "feat: third (#3)")
        r = self.run_import("sync")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(git(self.root, "rev-parse", "HEAD^:apps/fitness"), git(self.svc, "rev-parse", "dev^{tree}"))

    def test_squashed_sync_stops_at_guard_c(self):
        self.assertEqual(self.run_import("first").returncode, 0)
        self.merge_pr(squash=True)
        commit(self.svc, "c.txt", "feat: third")
        r = self.run_import("sync")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("가드 C", r.stderr)

    def test_service_force_push_stops_at_guard_a(self):
        self.assertEqual(self.run_import("first").returncode, 0)
        self.merge_pr()
        git(self.svc, "reset", "-q", "--hard", "HEAD~1")
        commit(self.svc, "x.txt", "rewritten history")
        r = self.run_import("sync")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("가드 A", r.stderr)

    def test_refuses_on_dev_and_inside_root_scratch(self):
        git(self.root, "checkout", "-q", "dev")
        self.assertIn("작업 브랜치", self.run_import("first").stderr)
        git(self.root, "checkout", "-q", "chore/1-import")
        env = {**ENV, "ISSUE": "1", "SCRATCH": str(HERE), "FILTER_REPO": FR, "SOURCE_URL": str(self.svc),
               "PLEIADES_ROOT": str(self.root)}
        r = subprocess.run(["bash", str(HERE / "import_app.sh"), "fit", "first"], capture_output=True, text=True,
                           env=env, check=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("I-21", r.stderr)


if __name__ == "__main__":
    unittest.main()
