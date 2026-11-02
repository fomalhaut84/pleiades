"""deploy/backup-check.sh — 서버 DB 백업 현황을 읽기만 하는 스크립트 (#441).

실행: python3 -m unittest discover -s deploy
서버 명령(uname·crontab·sudo·systemctl·df·pg_dump)은 PATH 스텁으로 바꾼다 — 실제 서버를 쓰지 않는다.
핵심 계약: 경로·파일 이름·crontab 원문·DB 이름이 출력(오류 포함)에 없다 · 상태를 바꾸는 명령을 부르지 않는다 ·
확인하지 못한 것을 "없음" 이나 "정상" 으로 적지 않는다.
"""

import os
import re
import shutil
import stat
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "backup-check.sh"
BASE_PATH = "/usr/bin:/bin"


def stub(bin_dir, name, body):
    p = bin_dir / name
    p.write_text("#!/bin/bash\n" + f'echo "{name} $*" >> "$CALLS"\n' + body + "\n")
    p.chmod(p.stat().st_mode | stat.S_IXUSR)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="backup-check-"))
        self.addCleanup(self.cleanup)
        self.bin = self.tmp / "bin"
        self.bin.mkdir()
        self.home = self.tmp / "home"
        self.home.mkdir()
        self.backup = self.tmp / "backup"
        self.backup.mkdir()
        self.etc = self.tmp / "etc"
        (self.etc / "cron.d").mkdir(parents=True)
        (self.etc / "cron.daily").mkdir()
        self.pgdata = self.tmp / "pg"
        self.pgdata.mkdir()
        self.calls = self.tmp / "calls"
        self.calls.touch()
        self.crontab = ""
        self.crontab_error = ""
        self.root_crontab = ""
        self.pg_crontab = ""
        self.sudo_ok = True
        self.os_name = "Linux"
        self.timers = ""
        self.timers_fail = False
        self.user_timers = ""
        self.user_timers_fail = False
        self.same_disk = True
        self.locked = []

    def cleanup(self):
        for p in self.locked:
            p.chmod(0o700)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def write_stubs(self):
        stub(self.bin, "uname", f"echo {self.os_name}")
        ct = self.tmp / "crontab.txt"
        ct.write_text(self.crontab)
        rc = self.tmp / "root.txt"
        rc.write_text(self.root_crontab)
        pc = self.tmp / "postgres.txt"
        pc.write_text(self.pg_crontab)
        if self.crontab_error:
            cron_body = f'echo "{self.crontab_error}" >&2; exit 1'
        else:
            cron_body = f'[ -s "{ct}" ] || {{ echo "no crontab for me" >&2; exit 1; }}; cat "{ct}"'
        stub(self.bin, "crontab", cron_body)
        sudo_rc = 0 if self.sudo_ok else 1
        stub(self.bin, "sudo", f'''[ {sudo_rc} -eq 0 ] || exit 1
shift  # -n
case "$*" in
  *psql*"show data_directory"*) echo "{self.pgdata}"; exit 0 ;;
  *psql*) echo 512.5; exit 0 ;;
  "crontab -u postgres -l") f="{pc}" ;;
  "crontab -l") f="{rc}" ;;
  *) exec "$@" ;;
esac
[ -s "$f" ] || {{ echo "no crontab for x" >&2; exit 1; }}
cat "$f"''')
        tm = self.tmp / "timers.txt"
        tm.write_text(self.timers)
        um = self.tmp / "user-timers.txt"
        um.write_text(self.user_timers)
        fail = "exit 1" if self.timers_fail else ""
        user = "exit 1" if self.user_timers_fail else f'cat "{um}"; exit 0'
        stub(self.bin, "systemctl", f'''{fail}
case "$*" in
  *--user*) {user} ;;
esac
cat "{tm}"''')
        pg_dev = "/dev/a" if self.same_disk else "/dev/b"
        stub(self.bin, "df", f'''case "$*" in
  *{self.pgdata}*) dev={pg_dev} ;;
  *) dev=/dev/a ;;
esac
echo "Filesystem 1024-blocks Used Available Capacity Mounted"
echo "$dev 100000000 60000000 40000000 60% /"''')
        stub(self.bin, "pg_dump", 'echo "pg_dump (PostgreSQL) 16.4"')

    def env(self, **over):
        e = {
            "PATH": f"{self.bin}:{BASE_PATH}",
            "HOME": str(self.home),
            "CALLS": str(self.calls),
            "BACKUP_CHECK_ETC": str(self.etc),
            "BACKUP_CHECK_VAR_BACKUPS": str(self.tmp / "var-backups"),
            "BACKUP_CHECK_PGDATA": str(self.pgdata),
        }
        e.update(over)
        return {k: v for k, v in e.items() if v is not None}

    def run_script(self, *args, backup=None, env=None):
        self.write_stubs()
        return subprocess.run(
            ["/bin/bash", str(SCRIPT), "--backup-dir", str(backup or self.backup), *args],
            capture_output=True, text=True, env=self.env(**(env or {})), timeout=60,
        )

    def dump(self, rel, days=0, mode=0o600, root=None, size=2048):
        p = (root or self.backup) / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b"x" * size)
        p.chmod(mode)
        t = time.time() - days * 86400 - 60
        os.utime(p, (t, t))
        return p

    def lock(self, path):
        if os.geteuid() == 0:
            self.skipTest("root 는 권한 오류가 나지 않는다")
        path.chmod(0o000)
        self.locked.append(path)


class Verdicts(Base):
    def test_nothing_found_is_not_stated_as_absent(self):
        r = self.run_script()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("정기 등록: 탐지 범위에서 못 찾음", r.stdout)
        self.assertIn("fin: 덤프 못 찾음 · fit: 덤프 못 찾음", r.stdout)

    def test_cutover_only_dump_is_not_recent(self):
        self.dump("pleiades-cutover/fin-20261021-1746/fin.dump", days=12)
        self.dump("pleiades-cutover/fit-20261022-1200/fit.dump", days=11)
        r = self.run_script()
        self.assertIn("fin 1 (최신 12일 전)", r.stdout)
        self.assertIn("fit 1 (최신 11일 전)", r.stdout)
        self.assertIn("fin: 최근 덤프 없음 · fit: 최근 덤프 없음", r.stdout)

    def test_schedule_and_fresh_dump(self):
        self.crontab = "0 3 * * * /opt/x/backup-db.sh\n"
        self.dump("daily/fin-20261102.dump", days=1)
        r = self.run_script()
        self.assertIn("계정 crontab 1", r.stdout)
        self.assertIn("정기 등록: 후보 1 — 내용은 사람이 확인", r.stdout)
        self.assertIn("fin: 최근 덤프 있음", r.stdout)

    def test_two_days_old_is_not_fresh(self):
        self.dump("a/fin.dump", days=2)
        self.assertIn("fin: 최근 덤프 없음", self.run_script().stdout)

    def test_newest_dump_wins_per_app(self):
        self.dump("old/fin.dump", days=30)
        self.dump("new/fin.dump", days=1)
        self.assertIn("fin 2 (최신 1일 전)", self.run_script().stdout)

    def test_fresh_unclassified_dump_is_flagged_on_verdict(self):
        self.dump("all/cluster.dump", days=1)
        r = self.run_script()
        self.assertIn("미분류 1 (최신 1일 전)", r.stdout)
        self.assertIn("fin: 덤프 못 찾음(미분류 최근 있음 — 확인 필요)", r.stdout)

    def test_root_and_postgres_crontab_add_up(self):
        self.crontab = "0 1 * * * /x/backup.sh\n"
        self.root_crontab = "0 2 * * * pg_basebackup -D /x\n"
        self.pg_crontab = "0 3 * * * pg_dump -d x\n"
        r = self.run_script()
        self.assertIn("계정 crontab 1 · root 1 · postgres 1", r.stdout)
        self.assertIn("후보 3", r.stdout)

    def test_etc_cron_and_timer_entries_count(self):
        (self.etc / "cron.d" / "db").write_text("0 3 * * * postgres pg_dump x\n")
        self.timers = "Mon 2026-11-03 03:00:00 KST 7h left - - restic-db.timer restic-db.service\n"
        r = self.run_script()
        self.assertIn("/etc 항목 1", r.stdout)
        self.assertIn("systemd 타이머 1", r.stdout)
        self.assertIn("후보 2", r.stdout)


class Counting(Base):
    def test_commented_cron_line_is_not_a_schedule(self):
        self.crontab = "# 0 3 * * * pg_dump x\n"
        self.assertIn("계정 crontab 0", self.run_script().stdout)

    def test_common_script_names_are_candidates(self):
        self.crontab = "0 1 * * * /x/db_backup.sh\n0 2 * * * /x/backup.sh\n"
        self.assertIn("계정 crontab 2", self.run_script().stdout)

    def test_system_entries_do_not_count(self):
        (self.etc / "cron.daily" / "dpkg").write_text("/usr/libexec/dpkg/dpkg-db-backup\n")
        (self.etc / "cron.daily" / "passwd").write_text("cd /var/backups || exit 0\n")
        self.timers = "Mon 2026-11-03 00:00:00 KST 7h left - - dpkg-db-backup.timer dpkg-db-backup.service\n"
        r = self.run_script()
        self.assertIn("/etc 항목 0", r.stdout)
        self.assertIn("systemd 타이머 0", r.stdout)

    def test_prisma_and_node_modules_sql_are_not_dumps(self):
        self.dump("pleiades-fin/apps/finance/prisma/migrations/1_init/migration.sql", root=self.home)
        self.dump("pleiades-fin/node_modules/x/seed.sql", root=self.home)
        self.assertIn("덤프  전체 0", self.run_script().stdout)

    def test_non_dump_files_with_app_names_are_not_dumps(self):
        # 회귀: #441 사전 리뷰 major 7 — .env 사본과 소스 sql 이 "최근 덤프 있음" 이 됐다
        self.dump("pleiades-fin/apps/finance/.env.backup", root=self.home)
        self.dump("pleiades-fit/apps/fitness/fix.sql", root=self.home)
        r = self.run_script()
        self.assertIn("덤프  전체 0", r.stdout)
        self.assertIn("fin: 덤프 못 찾음 · fit: 덤프 못 찾음", r.stdout)

    def test_weak_extension_in_backup_location_counts(self):
        self.dump("x/fin.sql")
        self.dump("backups/fit.bak", root=self.home)
        r = self.run_script()
        self.assertIn("fin 1", r.stdout)
        self.assertIn("fit 1", r.stdout)

    def test_compressed_and_directory_dumps_count(self):
        self.dump("a/fin.dump.zst")
        self.dump("b/fin.sql.bz2")
        self.dump("fit-20261102/toc.dat")
        r = self.run_script()
        self.assertIn("fin 2", r.stdout)
        self.assertIn("fit 1", r.stdout)

    def test_empty_dump_is_not_a_backup(self):
        # 회귀: #441 사전 리뷰 major 6 — 실패한 pg_dump 의 빈 파일이 "최근 덤프 있음" 이 됐다
        self.dump("a/fin.dump", size=0)
        r = self.run_script()
        self.assertIn("너무 작은 파일 1", r.stdout)
        self.assertIn("fin: 덤프 못 찾음", r.stdout)

    def test_file_name_beats_parent_directory(self):
        self.dump("fin/myfitness.dump", days=1)
        self.dump("x/myfinancedb.dump", days=1)
        r = self.run_script()
        self.assertIn("fin 1", r.stdout)
        self.assertIn("fit 1", r.stdout)

    def test_home_dump_is_found(self):
        self.dump("old/fin.dump", days=3, root=self.home)
        self.assertIn("fin 1 (최신 3일 전)", self.run_script().stdout)

    def test_backup_dir_inside_home_counts_once(self):
        nested = self.home / "bk"
        self.dump("fin.dump", root=nested)
        self.assertIn("덤프  전체 1", self.run_script(backup=nested).stdout)

    def test_symlinked_backup_dir_is_followed(self):
        # 회귀: #441 사전 리뷰 major 5
        real = self.tmp / "volume"
        self.dump("a/fin.dump", root=real)
        link = self.tmp / "link"
        link.symlink_to(real)
        self.assertIn("fin 1", self.run_script(backup=link).stdout)

    def test_postgres_home_dump_is_found_but_wal_history_is_not(self):
        self.dump("backups/fin.dump", root=self.pgdata)
        self.dump("16/main/pg_wal/0001.backup", root=self.pgdata)
        r = self.run_script()
        self.assertIn("덤프  전체 1", r.stdout)
        self.assertIn("fin 1", r.stdout)

    def test_unset_home_still_checks_backup_dir(self):
        self.dump("a/fin.dump")
        self.assertIn("fin 1", self.run_script(env={"HOME": None}).stdout)


class Unknowns(Base):
    def test_without_sudo_marks_unknown_and_never_prompts(self):
        self.sudo_ok = False
        r = self.run_script()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("root 미확인 · postgres 미확인", r.stdout)
        self.assertIn("DB 합계 미확인", r.stdout)
        self.assertIn("후보 못 찾음(일부 미확인", r.stdout)
        for line in self.calls.read_text().splitlines():
            if line.startswith("sudo "):
                self.assertTrue(line.startswith("sudo -n "), line)

    def test_crontab_failure_is_not_zero(self):
        # 회귀: #441 사전 리뷰 major 10
        self.crontab_error = "cron denied"
        r = self.run_script()
        self.assertIn("계정 crontab 미확인", r.stdout)
        self.assertIn("후보 못 찾음(일부 미확인", r.stdout)

    def test_systemctl_failure_is_not_zero(self):
        self.timers_fail = True
        r = self.run_script()
        self.assertIn("systemd 타이머 미확인", r.stdout)
        self.assertIn("후보 못 찾음(일부 미확인", r.stdout)

    def test_user_timer_failure_is_not_zero(self):
        # 회귀: PR #442 Codex P2 — 사용자 타이머를 못 봤는데 "못 찾음" 으로 단정했다
        self.user_timers_fail = True
        r = self.run_script()
        self.assertIn("systemd 타이머 0 (사용자 타이머 미확인)", r.stdout)
        self.assertIn("후보 못 찾음(일부 미확인", r.stdout)

    def test_user_timer_failure_keeps_system_candidates(self):
        self.timers = "Mon 2026-11-03 03:00:00 KST 7h left - - restic-db.timer restic-db.service\n"
        self.user_timers_fail = True
        r = self.run_script()
        self.assertIn("systemd 타이머 1 (사용자 타이머 미확인)", r.stdout)
        self.assertIn("후보 1", r.stdout)

    def test_user_timer_candidates_count(self):
        self.user_timers = "Mon 2026-11-03 03:00:00 KST 7h left - - db-backup.timer db-backup.service\n"
        self.assertIn("systemd 타이머 1", self.run_script().stdout)

    def test_unreadable_cron_file_is_not_a_candidate(self):
        # 회귀: #441 사전 리뷰 major 3 — 읽지 못한 파일이 "등록 있음" 이 됐다
        f = self.etc / "cron.d" / "SECRETCRON"
        f.write_text("/bin/true\n")
        self.lock(f)
        self.sudo_ok = False
        r = self.run_script()
        self.assertIn("/etc 항목 0 (읽기 실패 1)", r.stdout)
        self.assertIn("후보 못 찾음(일부 미확인", r.stdout)
        self.assertEqual(r.stderr, "")
        self.assertNotIn("SECRETCRON", r.stdout)

    def test_locked_directory_is_not_stated_as_no_dump(self):
        # 회귀: #441 사전 리뷰 major 4 · 2 — 잠긴 위치가 "덤프 없음" 이 되고 경로가 stderr 로 샜다
        d = self.backup / "SECRETDIR"
        self.dump("fin-SECRETNAME.dump", root=d)
        self.lock(d)
        self.sudo_ok = False
        r = self.run_script()
        self.assertIn("fin: 덤프 못 찾음(일부 미확인)", r.stdout)
        self.assertEqual(r.stderr, "")
        self.assertNotIn("SECRET", r.stdout)

    def test_missing_backup_dir(self):
        shutil.rmtree(self.backup)
        r = self.run_script()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("백업 위치 없음", r.stdout)


class FormDetails(Base):
    def test_group_or_world_readable_dump_is_counted(self):
        self.dump("a/fin.dump", mode=0o644)
        self.dump("b/fit.dump", mode=0o600)
        self.assertIn("남이 읽을 수 있는 파일 1", self.run_script().stdout)

    def test_size_and_disk_and_tools(self):
        self.dump("a/fin.dump", size=3 * 1048576)
        r = self.run_script()
        self.assertIn("합계 3 MB", r.stdout)
        self.assertIn("사용률 60%", r.stdout)
        self.assertIn("여유 38 GB", r.stdout)
        self.assertIn("같은 디스크: 예", r.stdout)
        self.assertIn("pg_dump 16", r.stdout)
        self.assertIn("DB 합계 512 MB", r.stdout)

    def test_other_disk(self):
        self.same_disk = False
        self.assertIn("같은 디스크: 아니오", self.run_script().stdout)

    def test_output_has_no_paths_names_or_cron_text(self):
        self.crontab = "0 3 * * * PGPASSWORD=CRONSECRET pg_dump -d secretdbname > /private/x.dump\n"
        self.dump("secretfolder/fin-secretname.dump")
        r = self.run_script()
        out = r.stdout + r.stderr
        for bad in ("CRONSECRET", "secretdbname", "secretfolder", "secretname", str(self.tmp), "/dev/a"):
            self.assertNotIn(bad, out)

    def test_form_is_delimited(self):
        out = self.run_script().stdout
        self.assertTrue(out.startswith("=== 백업 점검 판정 양식"))
        self.assertTrue(out.rstrip().endswith("=== 끝 ==="))


class ReadOnly(Base):
    def test_only_read_commands_are_called(self):
        self.dump("a/fin.dump")
        self.run_script()
        calls = self.calls.read_text()
        self.assertNotRegex(calls, r"pg_dump (?!--version)")
        self.assertNotRegex(calls, r"crontab .*-[er]\b")
        self.assertIn("pg_dump --version", calls)
        for line in calls.splitlines():
            if line.startswith("sudo "):
                cmd = line.split()[2]
                self.assertIn(cmd, {"true", "test", "find", "ls", "date", "cat", "df", "crontab", "-u"}, line)

    def test_script_has_no_write_commands(self):
        src = "\n".join(l for l in SCRIPT.read_text().splitlines() if not l.lstrip().startswith("#"))
        for pat in (r"\brm\b", r"\bmv\b", r"\bcp\b", r"\bmkdir\b", r"\btee\b", r"\bchmod\b", r"\bchown\b",
                    r"\btouch\b", r"\bdd\b", r"\btruncate\b", r"(?<!-)\bln\b", r"\bsed -i\b", r"(?<!\.)\bpm2\b",
                    r"\bssh\b", r"-delete\b", r"(?<![2&])>(?!&|\s*/dev/null)"):
            self.assertIsNone(re.search(pat, src), pat)

    def test_darwin_is_refused(self):
        self.os_name = "Darwin"
        r = self.run_script()
        self.assertEqual(r.returncode, 1)
        self.assertIn("서버 전용", r.stderr)
        self.assertEqual(r.stdout, "")

    def test_unknown_argument(self):
        self.assertEqual(self.run_script("--nope").returncode, 2)


if __name__ == "__main__":
    unittest.main()
