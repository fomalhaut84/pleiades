"""deploy/db-backup.cjs — fin·fit DB 일일 백업 (#441).

실행: python3 -m unittest discover -s deploy
pg_dump·pg_restore 는 PATH 스텁으로 바꾼다 — 실제 DB·서버·Discord 를 쓰지 않는다.
핵심 계약: 비밀번호가 명령줄·출력에 없다 · 검증 전 덤프를 정식 이름으로 두지 않는다 ·
실패한 앱의 옛 백업을 지우지 않는다 · 실패는 종료 코드와 알림으로 드러난다.
"""

import http.server
import os
import shutil
import socket
import stat
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "db-backup.cjs"
DOTENV = HERE.parent / "apps" / "finance" / "node_modules" / "dotenv"
NODE = shutil.which("node") or "/usr/bin/node"
WEEKDAY = "2026-11-02T04:20:00"  # 월
SUNDAY = "2026-11-08T04:20:00"


class Base(unittest.TestCase):
    def setUp(self):
        self.assertTrue(DOTENV.exists(), "apps/finance npm ci 필요(dotenv) — 건너뛰면 이 테스트가 아무것도 증명하지 않는다")
        self.tmp = Path(tempfile.mkdtemp(prefix="db-backup-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.home = self.tmp / "home"
        self.root = self.tmp / "backup"
        self.root.mkdir(mode=0o700)
        self.bin = self.tmp / "bin"
        self.bin.mkdir()
        self.calls = self.tmp / "calls"
        self.calls.touch()
        for name, d, db in (("fin", "finance", "findb"), ("fit", "fitness", "fitdb")):
            app = self.home / f"pleiades-{name}" / "apps" / d
            (app / "node_modules").mkdir(parents=True)
            (app / "node_modules" / "dotenv").symlink_to(DOTENV)
            (app / ".env").write_text(f'DATABASE_URL="postgresql://u:S3CRETPW@127.0.0.1:5432/{db}?schema=public"\n')
        self.platform = self.tmp / "platform.env"
        self.platform.write_text("NOTIFY_DEPLOY_CHANNEL=discord\nDISCORD_WEBHOOK_DEPLOY=https://example.invalid/WEBHOOKSECRET\n")
        self.write_stubs()

    def write_stubs(self):
        (self.bin / "pg_dump").write_text('''#!/bin/bash
echo "pg_dump $* db=$PGDATABASE host=$PGHOST pw=${PGPASSWORD:+set}" >> "$CALLS"
out=; while [ $# -gt 0 ]; do [ "$1" = "-f" ] && out=$2; shift; done
case ",$FAKE_FAIL," in *",$PGDATABASE,"*) echo "pg_dump: error: connection to $PGDATABASE failed" >&2; : > "$out"; exit 1 ;; esac
case ",$FAKE_SMALL," in *",$PGDATABASE,"*) : > "$out"; exit 0 ;; esac
head -c "${FAKE_SIZE:-4096}" /dev/zero > "$out"
''')
        (self.bin / "pg_restore").write_text('''#!/bin/bash
echo "pg_restore $*" >> "$CALLS"
[ -n "${FAKE_NO_TABLES:-}" ] && { echo "; empty"; exit 0; }
[ "$1" = "-f" ] && { [ -n "${FAKE_TRUNCATED:-}" ] && exit 1; exit 0; }
for i in 1 2 3; do echo "$i; 0 0 TABLE DATA public t$i u"; done
[ -n "${FAKE_LIST_EXIT:-}" ] && exit 1
exit 0
''')
        (self.bin / "age").write_text('''#!/bin/bash
echo "age $*" >> "$CALLS"
[ -n "${FAKE_AGE_FAIL:-}" ] && exit 1
out=; in=; while [ $# -gt 0 ]; do case "$1" in -o) out=$2; shift ;; -R) shift ;; *) in=$1 ;; esac; shift; done
[ -n "${FAKE_AGE_SHORT:-}" ] && { echo short > "$out"; exit 0; }
{ echo age-encryption.org/v1; cat "$in"; } > "$out"
''')
        for n in ("pg_dump", "pg_restore", "age"):
            p = self.bin / n
            p.chmod(p.stat().st_mode | stat.S_IXUSR)

    def run_script(self, *args, now=WEEKDAY, **env):
        e = {
            "PATH": f"{self.bin}:{Path(NODE).parent}:/usr/bin:/bin",
            "HOME": str(self.home),
            "CALLS": str(self.calls),
            "PLEIADES_TEST": "1",
            "NOTIFY_DRY_RUN": "1",
            "PLEIADES_BACKUP_ROOT": str(self.root),
            "PLEIADES_ENV_FILE": str(self.platform),
            "BACKUP_NOW": now,
            "BACKUP_MIN_FREE_MB": "0",
        }
        e.update(env)
        return subprocess.run([NODE, str(SCRIPT), *args], capture_output=True, text=True, env=e, timeout=60)

    def dumps(self, sub="daily", prefix=""):
        d = self.root / sub
        return sorted(n.name for n in d.iterdir() if n.name.startswith(prefix)) if d.exists() else []

    def seed(self, sub, names):
        d = self.root / sub
        d.mkdir(exist_ok=True)
        for n in names:
            (d / n).write_bytes(b"old")


class Success(Base):
    def test_both_apps_dumped_verified_and_named(self):
        r = self.run_script()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.dumps(), ["fin-20261102-0420.dump", "fit-20261102-0420.dump"])
        self.assertIn("통과: fin 테이블 3", r.stdout)
        self.assertIn("결과: 통과", r.stdout)
        calls = self.calls.read_text()
        self.assertIn("db=findb host=127.0.0.1 pw=set", calls)
        self.assertIn("db=fitdb", calls)
        self.assertEqual(calls.count("pg_restore -l"), 2)
        self.assertEqual(calls.count("pg_restore -f /dev/null"), 2)
        self.assertEqual(calls.count("pg_dump -w -Fc"), 2)

    def test_password_never_on_command_line_or_output(self):
        r = self.run_script()
        for text in (self.calls.read_text(), r.stdout, r.stderr):
            self.assertNotIn("S3CRETPW", text)
            self.assertNotIn("WEBHOOKSECRET", text)

    def test_files_are_private(self):
        self.run_script()
        for n in self.dumps():
            self.assertEqual(stat.S_IMODE((self.root / "daily" / n).stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE((self.root / "daily").stat().st_mode), 0o700)

    def test_inherited_pg_env_is_ignored(self):
        self.run_script(PGHOST="other-cluster", PGDATABASE="otherdb")
        self.assertNotIn("other", self.calls.read_text())

    def test_lock_is_released(self):
        self.run_script()
        self.assertFalse((self.root / ".lock").exists())

    def test_weekday_success_sends_no_alert(self):
        self.assertNotIn("dry-run", self.run_script().stdout)


class Weekly(Base):
    def test_sunday_links_weekly_and_reports_success(self):
        r = self.run_script(now=SUNDAY)
        self.assertEqual(self.dumps("weekly"), ["fin-20261108-0420.dump", "fit-20261108-0420.dump"])
        self.assertIn("✅ 주간 DB 백업 정상", r.stdout)
        a = (self.root / "daily" / "fin-20261108-0420.dump").stat().st_ino
        b = (self.root / "weekly" / "fin-20261108-0420.dump").stat().st_ino
        self.assertEqual(a, b)

    def test_weekly_keeps_eight(self):
        self.seed("weekly", [f"fin-202601{d:02d}-0420.dump" for d in range(1, 11)])
        self.run_script(now=SUNDAY)
        names = self.dumps("weekly", "fin-")
        self.assertEqual(len(names), 8)
        self.assertIn("fin-20261108-0420.dump", names)
        self.assertNotIn("fin-20260101-0420.dump", names)

    def test_weekly_copy_survives_daily_pruning(self):
        self.seed("daily", [f"fin-202612{d:02d}-0420.dump" for d in range(1, 15)])
        self.run_script(now=SUNDAY)
        self.assertFalse((self.root / "daily" / "fin-20261108-0420.dump").exists())
        self.assertTrue((self.root / "weekly" / "fin-20261108-0420.dump").exists())

    def test_second_sunday_run_keeps_one_weekly_per_date(self):
        self.run_script(now=SUNDAY)
        self.run_script(now="2026-11-08T05:00:00")
        self.assertEqual(self.dumps("weekly", "fin-"), ["fin-20261108-0420.dump"])

    def test_day_of_week_and_name_are_kst_whatever_the_server_zone(self):
        r = self.run_script(now="2026-11-07T19:20:00Z", TZ="UTC")
        self.assertEqual(r.returncode, 0)
        self.assertIn("fin-20261108-0420.dump", self.dumps())
        self.assertIn("fin-20261108-0420.dump", self.dumps("weekly"))


class Retention(Base):
    def test_daily_keeps_fourteen_newest(self):
        self.seed("daily", [f"fin-202610{d:02d}-0420.dump" for d in range(1, 21)])
        self.run_script()
        names = self.dumps("daily", "fin-")
        self.assertEqual(len(names), 14)
        self.assertIn("fin-20261102-0420.dump", names)
        self.assertNotIn("fin-20261006-0420.dump", names)

    def test_foreign_files_are_never_deleted(self):
        names = [f"fin-202610{d:02d}-0420.dump" for d in range(1, 21)] + ["fin-keep.dump", "notes.txt", "fit.dump"]
        self.seed("daily", names)
        self.run_script()
        for keep in ("fin-keep.dump", "notes.txt", "fit.dump"):
            self.assertTrue((self.root / "daily" / keep).exists(), keep)

    def test_failed_app_keeps_old_backups(self):
        old = [f"fin-202610{d:02d}-0420.dump" for d in range(1, 21)]
        self.seed("daily", old)
        self.run_script(FAKE_FAIL="findb")
        self.assertEqual(self.dumps("daily", "fin-"), sorted(old))


class Failures(Base):
    def test_one_failure_does_not_stop_the_other(self):
        r = self.run_script(FAKE_FAIL="findb")
        self.assertEqual(r.returncode, 1)
        self.assertEqual(self.dumps(), ["fit-20261102-0420.dump"])
        self.assertIn("결과: 실패 — fin(pg_dump)", r.stdout)
        self.assertIn("(dry-run) ⚠️ DB 백업 실패: fin(pg_dump)", r.stdout)

    def test_alert_has_no_db_error_detail(self):
        r = self.run_script(FAKE_FAIL="findb")
        alert = [l for l in r.stdout.splitlines() if "dry-run" in l][0]
        self.assertNotIn("findb", alert)
        self.assertNotIn("connection", alert)

    def test_failed_dump_leaves_no_temp_file(self):
        self.run_script(FAKE_FAIL="findb")
        self.assertEqual([n for n in os.listdir(self.root / "daily") if n.startswith(".tmp")], [])

    def test_empty_dump_is_rejected(self):
        r = self.run_script(FAKE_SMALL="findb")
        self.assertEqual(r.returncode, 1)
        self.assertIn("fin(small)", r.stdout)
        self.assertEqual(self.dumps("daily", "fin-"), [])

    def test_unreadable_listing_is_rejected(self):
        r = self.run_script(FAKE_NO_TABLES="1")
        self.assertEqual(r.returncode, 1)
        self.assertIn("fin(verify)", r.stdout)
        self.assertEqual(self.dumps(), [])

    def test_listing_exit_failure_is_rejected(self):
        r = self.run_script(FAKE_LIST_EXIT="1")
        self.assertIn("fin(verify)", r.stdout)
        self.assertEqual(self.dumps(), [])

    def test_truncated_dump_is_rejected_after_full_read(self):
        r = self.run_script(FAKE_TRUNCATED="1")
        self.assertEqual(r.returncode, 1)
        self.assertIn("fin(verify)", r.stdout)
        self.assertEqual(self.dumps(), [])

    def test_shrunken_dump_warns_and_keeps_old_backups(self):
        old = [f"fin-202610{d:02d}-0420.dump" for d in range(1, 21)]
        self.seed("daily", old)
        for n in old:
            (self.root / "daily" / n).write_bytes(b"x" * 100000)
        r = self.run_script()
        self.assertEqual(r.returncode, 0)
        self.assertIn("크기 급감: fin", r.stdout)
        self.assertEqual(len(self.dumps("daily", "fin-")), 21)

    def test_same_minute_retry_keeps_existing_dump(self):
        # 회귀: PR #443 Codex P2 — 같은 분에 다시 돌면 줄어든 덤프가 건강한 덤프를 덮어써 크기 기준까지 사라졌다
        healthy = "fin-20261102-0420.dump"
        self.seed("daily", [healthy])
        (self.root / "daily" / healthy).write_bytes(b"x" * 100000)
        r = self.run_script()
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("fin(exists)", r.stdout)
        self.assertEqual((self.root / "daily" / healthy).stat().st_size, 100000)
        self.assertIn("fit-20261102-0420.dump", self.dumps())
        self.assertEqual([n for n in self.dumps() if n.startswith(".tmp-")], [])

    def seed_large_fin(self):
        old = [f"fin-202610{d:02d}-0420.dump" for d in range(1, 21)]
        self.seed("daily", old)
        for n in old:
            (self.root / "daily" / n).write_bytes(b"x" * 100000)
        return old

    def test_shrink_protection_survives_following_days(self):
        # 회귀: PR #443 Codex P1 — 줄어든 덤프가 기준이 되어 다음 날 옛 덤프를 지웠다
        old = self.seed_large_fin()
        self.run_script(now="2026-11-02T04:20:00")
        r = self.run_script(now="2026-11-03T04:20:00")
        self.assertIn("크기 급감: fin", r.stdout)
        names = self.dumps("daily", "fin-")
        for n in old:
            self.assertIn(n, names)
        self.assertEqual(len(names), 22)

    def test_recovered_size_resumes_pruning(self):
        self.seed_large_fin()
        self.run_script(now="2026-11-02T04:20:00")
        r = self.run_script(now="2026-11-03T04:20:00", FAKE_SIZE="100000")
        self.assertNotIn("크기 급감: fin", r.stdout)
        self.assertEqual(len(self.dumps("daily", "fin-")), 14)

    def test_accept_shrink_requires_explicit_app_and_resumes_pruning(self):
        self.seed_large_fin()
        self.run_script(now="2026-11-02T04:20:00")
        self.assertEqual(self.run_script("--accept-shrink", "nope").returncode, 2)
        self.assertEqual(self.run_script("--accept-shrink").returncode, 2)
        r = self.run_script("--accept-shrink", "fin", now="2026-11-02T09:00:00")
        self.assertEqual(r.returncode, 0)
        self.assertEqual(stat.S_IMODE((self.root / ".accept-shrink-fin").stat().st_mode), 0o600)
        self.assertEqual(len(self.dumps("daily", "fin-")), 21)
        r = self.run_script(now="2026-11-03T04:20:00")
        self.assertNotIn("크기 급감: fin", r.stdout)
        self.assertEqual(len(self.dumps("daily", "fin-")), 14)

    def test_accept_shrink_of_one_app_keeps_the_other_protected(self):
        old = [f"fit-202610{d:02d}-0420.dump" for d in range(1, 21)]
        self.seed("daily", old)
        for n in old:
            (self.root / "daily" / n).write_bytes(b"x" * 100000)
        self.run_script("--accept-shrink", "fin", now="2026-11-02T09:00:00")
        r = self.run_script(now="2026-11-03T04:20:00")
        self.assertIn("크기 급감: fit", r.stdout)

    def test_missing_env_is_reported(self):
        (self.home / "pleiades-fin" / "apps" / "finance" / ".env").unlink()
        r = self.run_script()
        self.assertEqual(r.returncode, 1)
        self.assertIn("fin(env)", r.stdout)

    def test_bad_url_is_reported_without_echoing_it(self):
        (self.home / "pleiades-fin" / "apps" / "finance" / ".env").write_text('DATABASE_URL="not a url S3CRETPW"\n')
        r = self.run_script()
        self.assertIn("fin(env)", r.stdout)
        self.assertNotIn("S3CRETPW", r.stdout + r.stderr)

    def test_other_schema_is_refused(self):
        (self.home / "pleiades-fit" / "apps" / "fitness" / ".env").write_text(
            'DATABASE_URL="postgresql://u:S3CRETPW@127.0.0.1:5432/fitdb?schema=other"\n')
        r = self.run_script()
        self.assertIn("fit(env)", r.stdout)
        self.assertNotIn("S3CRETPW", r.stdout + r.stderr)

    def test_missing_backup_location(self):
        r = self.run_script(PLEIADES_BACKUP_ROOT=str(self.tmp / "none"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("전체(백업 위치 없음 또는 접근 불가)", r.stdout)

    def test_low_disk_stops_before_dump(self):
        r = self.run_script(BACKUP_MIN_FREE_MB="999999999999")
        self.assertEqual(r.returncode, 1)
        self.assertIn("디스크 여유 부족", r.stdout)
        self.assertNotIn("pg_dump", self.calls.read_text())
        self.assertFalse((self.root / ".lock").exists())

    def test_fresh_lock_blocks_and_alerts(self):
        (self.root / ".lock").mkdir()
        r = self.run_script()
        self.assertEqual(r.returncode, 1)
        self.assertIn("이전 실행이 아직 돈다", r.stdout)
        self.assertNotIn("pg_dump", self.calls.read_text())
        self.assertTrue((self.root / ".lock").exists())

    def test_stale_lock_is_replaced(self):
        lock = self.root / ".lock"
        lock.mkdir()
        old = time.time() - 7 * 3600
        os.utime(lock, (old, old))
        self.assertEqual(self.run_script().returncode, 0)

    def test_stale_temp_file_is_removed(self):
        self.seed("daily", [".tmp-fin-999"])
        self.run_script()
        self.assertFalse((self.root / "daily" / ".tmp-fin-999").exists())

    def test_alert_failure_is_reported(self):
        self.platform.write_text("NOTIFY_DEPLOY_CHANNEL=off\n")
        r = self.run_script(FAKE_FAIL="findb")
        self.assertEqual(r.returncode, 1)
        self.assertIn("알림 실패: 웹훅 없음", r.stdout)


class Offsite(Base):
    def turn_on(self):
        ops = self.home / "pleiades-ops"
        ops.mkdir(exist_ok=True)
        (ops / "offsite-recipient.txt").write_text("age1public\n")

    def test_off_without_recipient_file(self):
        r = self.run_script()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertFalse((self.root / "offsite").exists())
        self.assertNotIn("age ", self.calls.read_text())

    def test_encrypted_copy_is_private_and_uses_public_key_only(self):
        self.turn_on()
        r = self.run_script()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.dumps("offsite"), ["fin-20261102-0420.dump.age", "fit-20261102-0420.dump.age"])
        f = self.root / "offsite" / "fin-20261102-0420.dump.age"
        self.assertEqual(stat.S_IMODE(f.stat().st_mode), 0o600)
        self.assertIn("age -R", self.calls.read_text())
        self.assertNotIn("age -d", self.calls.read_text())
        self.assertNotIn("-i ", self.calls.read_text().split("age -R", 1)[1].splitlines()[0])

    def test_age_failure_alerts_but_keeps_the_daily_dump(self):
        self.turn_on()
        r = self.run_script(FAKE_AGE_FAIL="1")
        self.assertEqual(r.returncode, 1)
        self.assertIn("fin(offsite)", r.stdout)
        self.assertIn("fit(offsite)", r.stdout)
        self.assertIn("통과: fin", r.stdout)
        self.assertEqual(self.dumps("daily"), ["fin-20261102-0420.dump", "fit-20261102-0420.dump"])
        self.assertEqual(self.dumps("offsite"), [])

    def test_truncated_encryption_is_rejected(self):
        self.turn_on()
        r = self.run_script(FAKE_AGE_SHORT="1")
        self.assertEqual(r.returncode, 1)
        self.assertIn("fin(offsite)", r.stdout)
        self.assertEqual(self.dumps("offsite"), [])

    def test_offsite_keeps_fourteen_and_foreign_files(self):
        self.turn_on()
        self.seed("offsite", [f"fin-202610{d:02d}-0420.dump.age" for d in range(1, 21)] + ["notes.txt"])
        self.assertEqual(self.run_script().returncode, 0)
        names = self.dumps("offsite", "fin-")
        self.assertEqual(len(names), 14)
        self.assertIn("fin-20261102-0420.dump.age", names)
        self.assertIn("notes.txt", self.dumps("offsite"))

    def test_shrink_keeps_offsite_copies(self):
        self.turn_on()
        old = [f"fin-202610{d:02d}-0420.dump" for d in range(1, 21)]
        self.seed("daily", old)
        for n in old:
            (self.root / "daily" / n).write_bytes(b"x" * 100000)
        self.seed("offsite", [f"{n}.age" for n in old])
        self.assertIn("크기 급감", self.run_script().stdout)
        self.assertEqual(len(self.dumps("offsite", "fin-")), 21)


class _Hook(http.server.BaseHTTPRequestHandler):
    status = 204
    bodies = []

    def do_POST(self):
        _Hook.bodies.append(self.rfile.read(int(self.headers.get("content-length", 0))).decode())
        self.send_response(_Hook.status)
        self.end_headers()

    def log_message(self, *a):
        pass


class RealSend(Base):
    def serve(self, status):
        _Hook.status = status
        _Hook.bodies = []
        srv = http.server.HTTPServer(("127.0.0.1", 0), _Hook)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        self.hook(f"http://127.0.0.1:{srv.server_port}/WEBHOOKSECRET")

    def hook(self, url):
        self.platform.write_text(f"NOTIFY_DEPLOY_CHANNEL=discord\nDISCORD_WEBHOOK_DEPLOY={url}\n")

    def test_failure_is_posted_with_codes_only(self):
        self.serve(204)
        r = self.run_script(FAKE_FAIL="findb", NOTIFY_DRY_RUN="0")
        self.assertEqual(r.returncode, 1)
        self.assertEqual(len(_Hook.bodies), 1)
        self.assertIn("fin(pg_dump)", _Hook.bodies[0])
        self.assertNotIn("findb", _Hook.bodies[0])
        self.assertIn('"parse":[]', _Hook.bodies[0].replace(" ", ""))

    def test_http_error_is_reported_without_url(self):
        self.serve(500)
        r = self.run_script("--test-alert", NOTIFY_DRY_RUN="0")
        self.assertEqual(r.returncode, 1)
        self.assertIn("HTTP 500", r.stdout)
        self.assertNotIn("WEBHOOKSECRET", r.stdout + r.stderr)

    def test_unreachable_webhook_is_reported_without_url(self):
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        self.hook(f"http://127.0.0.1:{port}/WEBHOOKSECRET")
        r = self.run_script("--test-alert", NOTIFY_DRY_RUN="0")
        self.assertEqual(r.returncode, 1)
        self.assertIn("알림 실패", r.stdout)
        self.assertNotIn("WEBHOOKSECRET", r.stdout + r.stderr)


class Modes(Base):
    def test_test_alert_only_alerts(self):
        r = self.run_script("--test-alert")
        self.assertEqual(r.returncode, 0)
        self.assertIn("DB 백업 알림 시험", r.stdout)
        self.assertEqual(self.calls.read_text(), "")

    def test_test_alert_without_webhook_fails(self):
        self.platform.write_text("")
        self.assertEqual(self.run_script("--test-alert").returncode, 1)

    def test_unknown_argument(self):
        self.assertEqual(self.run_script("--nope").returncode, 2)

    @unittest.skipUnless(os.uname().sysname == "Darwin", "Darwin 전용")
    def test_refused_on_local_machine(self):
        r = self.run_script(PLEIADES_TEST="0")
        self.assertEqual(r.returncode, 1)
        self.assertIn("서버 전용", r.stderr)


if __name__ == "__main__":
    unittest.main()
