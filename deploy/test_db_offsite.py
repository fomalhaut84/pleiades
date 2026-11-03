"""deploy/db-offsite-pull.sh — 라즈베리파이의 암호화 사본 가져오기 (#441).

실행: python3 -m unittest discover -s deploy
rsync·curl 은 PATH 스텁으로 바꾼다 — 서버·Discord 를 쓰지 않는다. rsync 스텁은 필터를 실제처럼 앞에서부터 평가한다.
핵심 계약: 서버 쪽 파일을 지우거나 가진 파일을 바꾸지 않는다 · 검증 전 파일을 보관 위치에 두지 않는다 ·
최신 파일이 없으면 실패이고 옛 사본을 지우지 않는다 · 웹훅이 출력에 없다.
"""

import os
import shutil
import stat
import subprocess
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "db-offsite-pull.sh"
HEADER = b"age-encryption.org/v1\nbody"
KST = timezone(timedelta(hours=9))


def day(offset=0):
    return (datetime.now(KST) + timedelta(days=offset)).strftime("%Y%m%d")


def fname(app, offset=0, hm="0420"):
    return f"{app}-{day(offset)}-{hm}.dump.age"
RSYNC_STUB = r"""#!/usr/bin/env python3
import fnmatch, os, shutil, sys
args = sys.argv[1:]
open(os.environ["CALLS"], "a").write("rsync " + " ".join(args) + "\n")
if os.environ.get("FAKE_RSYNC_FAIL"):
    sys.stderr.write("rsync error at secret-host\n")
    sys.exit(12)
rules = [(a.split("=", 1)[0], a.split("=", 1)[1]) for a in args if a.startswith(("--include=", "--exclude="))]
src = os.environ["FAKE_REMOTE"]
dest = args[-1]
for name in os.listdir(src):
    for kind, pat in rules:
        if fnmatch.fnmatch(name, pat.lstrip("/")):
            if kind == "--include":
                shutil.copy2(os.path.join(src, name), dest)
            break
"""
TIMEOUT_STUB = """#!/bin/bash
echo "timeout $1" >> "$CALLS"
[ -n "${FAKE_TIMEOUT:-}" ] && exit 124
shift
exec "$@"
"""
CURL_STUB = """#!/bin/bash
echo "curl $*" >> "$CALLS"
cat >/dev/null
[ -n "${FAKE_CURL_FAIL:-}" ] && { echo "curl: failed $*" >&2; exit 22; }
exit 0
"""


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="db-offsite-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.base = self.tmp / "offsite"
        self.base.mkdir()
        self.dest = self.tmp / "store"
        self.remote = self.tmp / "remote"
        self.remote.mkdir()
        self.bin = self.tmp / "bin"
        self.bin.mkdir()
        self.calls = self.tmp / "calls"
        self.calls.touch()
        key = self.tmp / "key"
        key.write_text("k")
        (self.base / "config").write_text(
            f"HOST=server.invalid\nPORT=2222\nREMOTE_USER=svc\nSSH_KEY={key}\nDEST={self.dest}\n"
            "DISCORD_WEBHOOK=https://example.invalid/WEBHOOKSECRET\n"
        )
        for n, body in (("rsync", RSYNC_STUB), ("curl", CURL_STUB), ("timeout", TIMEOUT_STUB)):
            p = self.bin / n
            p.write_text(body)
            p.chmod(p.stat().st_mode | stat.S_IXUSR)

    def run_script(self, *args, **env):
        e = {
            "PATH": f"{self.bin}:/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin",
            "HOME": str(self.tmp),
            "CALLS": str(self.calls),
            "PLEIADES_TEST": "1",
            "PLEIADES_OFFSITE_BASE": str(self.base),
            "FAKE_REMOTE": str(self.remote),
        }
        e.update(env)
        return subprocess.run(["bash", str(SCRIPT), *args], capture_output=True, text=True, env=e, timeout=60)

    def put(self, directory, name, body=HEADER, age_days=0):
        directory.mkdir(exist_ok=True)
        p = directory / name
        p.write_bytes(body)
        t = time.time() - age_days * 86400
        os.utime(p, (t, t))
        return p

    def fresh_remote(self):
        self.put(self.remote, fname("fin"))
        self.put(self.remote, fname("fit"))

    def stored(self):
        return sorted(n.name for n in self.dest.iterdir() if not n.name.startswith(".")) if self.dest.exists() else []


class Pull(Base):
    def test_new_files_are_stored_privately(self):
        self.fresh_remote()
        r = self.run_script()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.stored(), [fname("fin"), fname("fit")])
        self.assertEqual(stat.S_IMODE((self.dest / self.stored()[0]).stat().st_mode), 0o600)
        self.assertIn("새 파일 2", r.stdout)
        self.assertFalse((self.dest / ".incoming").exists())
        self.assertFalse((self.dest / ".lock").exists())

    def test_rsync_never_deletes_and_verifies_host(self):
        self.fresh_remote()
        self.run_script()
        call = self.calls.read_text()
        self.assertNotIn("--delete", call)
        self.assertIn("StrictHostKeyChecking=yes", call)
        self.assertIn("BatchMode=yes", call)
        self.assertIn("-p 2222", call)
        self.assertIn("IdentitiesOnly=yes", call)
        self.assertNotIn(" -rt ", call)
        self.assertIn("svc@server.invalid:/", call)

    def test_existing_copy_is_not_replaced_by_server(self):
        self.fresh_remote()
        kept = self.put(self.dest, fname("fin"), b"age-encryption.org/v1\noriginal")
        self.put(self.remote, fname("fin"), b"age-encryption.org/v1\nswapped")
        r = self.run_script()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(kept.read_bytes(), b"age-encryption.org/v1\noriginal")
        self.assertIn("새 파일 1", r.stdout)

    def test_foreign_remote_file_is_not_fetched(self):
        self.fresh_remote()
        self.put(self.remote, "notes.txt")
        self.put(self.remote, fname("fin").replace(".age", ""))
        self.assertEqual(self.run_script().returncode, 0)
        self.assertEqual(len(self.stored()), 2)

    def test_unencrypted_file_is_rejected_and_not_stored(self):
        self.fresh_remote()
        self.put(self.remote, fname("fit"), b"PGDMP plain dump")
        r = self.run_script()
        self.assertEqual(r.returncode, 1)
        self.assertIn("badfile", r.stdout)
        self.assertEqual(self.stored(), [], "나쁜 파일이 있으면 그 실행에서는 아무것도 보관하지 않는다")

    def test_bad_name_matching_filter_is_rejected(self):
        self.fresh_remote()
        self.put(self.remote, "fin-evil.dump.age")
        r = self.run_script()
        self.assertEqual(r.returncode, 1)
        self.assertIn("badfile", r.stdout)


class Hostile(Base):
    """회귀: PR 전 리뷰 critical — 침해된 서버가 보낸 파일로 정상 사본이 밀려났다."""

    def test_transfer_total_is_bounded_below_required_free_space(self):
        # 회귀: PR #447 Codex P2 — 파일별 상한뿐이라 서버가 파이 디스크를 채울 수 있었다
        self.fresh_remote()
        self.run_script()
        call = self.calls.read_text()
        self.assertIn("timeout 300", call)
        self.assertIn("--bwlimit=2048", call)
        self.assertIn("--max-size=500M", call)
        src = SCRIPT.read_text()
        self.assertIn("MIN_FREE_KB=$((1024 * 1024))", src)
        self.assertLess(2048 * 300, 1024 * 1024)

    def test_transfer_timeout_fails_and_keeps_copies(self):
        good = self.put(self.dest, fname("fin", -1))
        r = self.run_script(FAKE_TIMEOUT="1")
        self.assertEqual(r.returncode, 1)
        self.assertIn("rsync(rc=124)", r.stdout)
        self.assertTrue(good.exists())
        self.assertFalse((self.dest / ".incoming").exists())

    def seed_good(self, app="fin", count=20, start=1):
        return [self.put(self.dest, fname(app, -d)) for d in range(start, start + count)]

    def test_future_names_cannot_push_out_good_copies(self):
        good = self.seed_good()
        self.put(self.remote, fname("fit"))
        for i in range(30):
            self.put(self.remote, f"fin-99991231-{i:04d}.dump.age")
        r = self.run_script()
        self.assertEqual(r.returncode, 1)
        self.assertIn("badfile", r.stdout)
        self.assertTrue(all(p.exists() for p in good))
        self.assertFalse([n for n in self.stored() if "9999" in n])

    def test_tomorrow_is_rejected(self):
        self.fresh_remote()
        self.put(self.remote, fname("fin", 1))
        self.assertIn("badfile", self.run_script().stdout)

    def test_too_many_new_files_stores_nothing(self):
        for d in range(0, 17):
            self.put(self.remote, fname("fin", -(d % 15), f"{d:02d}00"))
        self.put(self.remote, fname("fit"))
        r = self.run_script()
        self.assertEqual(r.returncode, 1)
        self.assertIn("toomany", r.stdout)
        self.assertEqual(self.stored(), [])

    def test_old_names_are_ignored_not_stored(self):
        self.fresh_remote()
        self.put(self.remote, fname("fin", -20))
        r = self.run_script()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("옛 이름 무시 1", r.stdout)
        self.assertNotIn(fname("fin", -20), self.stored())

    def test_old_name_with_new_mtime_is_not_fresh(self):
        # 회귀: PR 전 리뷰 major — 서버가 정한 mtime 을 믿어 거짓 통과했다
        self.put(self.remote, fname("fit"))
        self.put(self.dest, fname("fin", -5))
        r = self.run_script()
        self.assertEqual(r.returncode, 1)
        self.assertIn("fin(stale)", r.stdout)

    def test_small_new_file_warns_and_keeps_old_copies(self):
        for d in range(1, 36):
            self.put(self.dest, fname("fin", -d), HEADER + b"x" * 100000)
        self.fresh_remote()
        r = self.run_script()
        self.assertEqual(r.returncode, 1)
        self.assertIn("fin(shrink)", r.stdout)
        self.assertEqual(len([n for n in self.stored() if n.startswith("fin-")]), 36)

    def test_shrink_protection_survives_following_days(self):
        for d in range(1, 36):
            self.put(self.dest, fname("fin", -d), HEADER + b"x" * 100000)
        self.put(self.dest, fname("fin", -1, "0500"))
        self.fresh_remote()
        self.assertIn("fin(shrink)", self.run_script().stdout)

    def test_accept_shrink_resumes_pruning(self):
        for d in range(1, 36):
            self.put(self.dest, fname("fin", -d), HEADER + b"x" * 100000)
        self.assertEqual(self.run_script("--accept-shrink", "fin").returncode, 0)
        marker = self.dest / ".accept-shrink-fin"
        marker.write_text(f"{day(-1)}-2359\n")
        self.fresh_remote()
        r = self.run_script()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertLess(len([n for n in self.stored() if n.startswith("fin-")]), 36)

    def test_accept_shrink_needs_known_app(self):
        self.assertEqual(self.run_script("--accept-shrink", "x").returncode, 2)


class Retention(Base):
    def seed(self, count, start=1):
        return [self.put(self.dest, fname("fin", -d)) for d in range(start, start + count)]

    def fin_names(self):
        return [n for n in self.stored() if n.startswith("fin-")]

    def test_deletes_at_most_what_arrived(self):
        self.seed(40)
        before = len(self.fin_names())
        self.fresh_remote()
        self.assertEqual(self.run_script().returncode, 0)
        self.assertEqual(len(self.fin_names()), before)

    def test_deletes_at_most_two_per_run(self):
        self.seed(40, start=3)
        self.fresh_remote()
        self.put(self.remote, fname("fin", -1))
        self.put(self.remote, fname("fin", -2))
        self.assertEqual(self.run_script().returncode, 0)
        self.assertEqual(len(self.fin_names()), 41)

    def test_no_new_file_deletes_nothing(self):
        self.seed(35)
        self.put(self.dest, fname("fin"))
        self.put(self.remote, fname("fit"))
        self.assertEqual(self.run_script().returncode, 0)
        self.assertEqual(len(self.fin_names()), 36)

    def test_monthly_anchor_survives(self):
        names = [
            "fin-20250115-0420.dump.age",
            "fin-20250116-0420.dump.age",
            "fin-20250215-0420.dump.age",
            "fin-20250216-0420.dump.age",
        ]
        for n in names:
            self.put(self.dest, n)
        self.seed(30)
        self.fresh_remote()
        self.put(self.remote, fname("fin", -31))
        self.assertEqual(self.run_script().returncode, 0)
        kept = self.fin_names()
        self.assertIn("fin-20250115-0420.dump.age", kept)
        self.assertIn("fin-20250215-0420.dump.age", kept)
        self.assertNotIn("fin-20250116-0420.dump.age", kept)

    def test_foreign_files_stay(self):
        self.seed(35)
        self.put(self.dest, "notes.txt")
        self.fresh_remote()
        self.assertEqual(self.run_script().returncode, 0)
        self.assertIn("notes.txt", self.stored())

    def test_stale_source_fails_and_keeps_old_copies(self):
        self.put(self.remote, fname("fit"))
        self.seed(35, start=3)
        r = self.run_script()
        self.assertEqual(r.returncode, 1)
        self.assertIn("fin(stale)", r.stdout)
        self.assertEqual(len(self.fin_names()), 35)
        self.assertIn("fin(stale)", self.calls.read_text())


class Failures(Base):
    def test_rsync_failure_alerts_with_code_only(self):
        self.seed_copy = self.put(self.dest, fname("fin", -3))
        r = self.run_script(FAKE_RSYNC_FAIL="1")
        self.assertEqual(r.returncode, 1)
        self.assertIn("실패 — rsync(rc=12)", r.stdout)
        self.assertNotIn("secret-host", r.stdout + r.stderr)
        self.assertTrue(self.seed_copy.exists())
        self.assertIn("rsync", [l for l in self.calls.read_text().splitlines() if l.startswith("curl")][0])

    def test_webhook_never_printed_when_alert_fails(self):
        r = self.run_script(FAKE_RSYNC_FAIL="1", FAKE_CURL_FAIL="1")
        self.assertEqual(r.returncode, 1)
        self.assertIn("알림 실패", r.stdout)
        self.assertNotIn("WEBHOOKSECRET", r.stdout + r.stderr)

    def test_missing_config(self):
        (self.base / "config").unlink()
        r = self.run_script()
        self.assertEqual(r.returncode, 1)
        self.assertIn("config", r.stdout)

    def test_webhook_not_on_curl_command_line(self):
        self.run_script(FAKE_RSYNC_FAIL="1")
        self.assertNotIn("WEBHOOKSECRET", self.calls.read_text())

    def test_bad_port_or_key_path_is_config_failure(self):
        cfg = self.base / "config"
        original = cfg.read_text()
        cfg.write_text(original.replace("PORT=2222", "PORT=abc"))
        self.assertIn("config", self.run_script().stdout)
        cfg.write_text(original.replace(f"SSH_KEY={self.tmp}/key", f"SSH_KEY='{self.tmp}/ke y'"))
        (self.tmp / "ke y").write_text("k")
        self.assertIn("config", self.run_script().stdout)

    def test_missing_key_is_config_failure(self):
        cfg = self.base / "config"
        cfg.write_text(cfg.read_text().replace(str(self.tmp / "key"), str(self.tmp / "nokey")))
        self.assertIn("config", self.run_script().stdout)

    def test_fresh_lock_blocks_and_keeps_lock(self):
        (self.dest / ".lock").mkdir(parents=True)
        self.fresh_remote()
        r = self.run_script()
        self.assertEqual(r.returncode, 1)
        self.assertIn("locked", r.stdout)
        self.assertTrue((self.dest / ".lock").exists())

    def test_stale_lock_is_replaced(self):
        lock = self.dest / ".lock"
        lock.mkdir(parents=True)
        t = time.time() - 7 * 3600
        os.utime(lock, (t, t))
        self.fresh_remote()
        self.assertEqual(self.run_script().returncode, 0)


class Modes(Base):
    def test_test_alert(self):
        r = self.run_script("--test-alert")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("알림 보냄", r.stdout)
        self.assertNotIn("rsync", self.calls.read_text())

    def test_unknown_argument(self):
        self.assertEqual(self.run_script("--nope").returncode, 2)

    def test_refused_on_local_machine(self):
        if os.uname().sysname != "Darwin":
            self.skipTest("Darwin 전용")
        e = {k: v for k, v in os.environ.items() if k != "PLEIADES_TEST"}
        e["PLEIADES_OFFSITE_BASE"] = str(self.base)
        r = subprocess.run(["bash", str(SCRIPT)], capture_output=True, text=True, env=e, timeout=30)
        self.assertEqual(r.returncode, 1)
        self.assertIn("중단", r.stderr)


if __name__ == "__main__":
    unittest.main()
