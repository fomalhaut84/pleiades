"""deploy/t2-check.sh — T-2 서버 확인(U1~U13)을 한 번에 돌리는 읽기 전용 스크립트 (#186 · 007 §8).

실행: python3 -m unittest discover -s deploy
서버 명령(pm2·sudo·psql·nginx·ss·systemctl·curl·git ls-remote)은 PATH 스텁으로 바꾼다 — 실제 서버·네트워크를 쓰지 않는다.
핵심 계약: 토큰·비밀번호가 화면과 원본 파일 어디에도 나오지 않는다 · 상태를 바꾸는 명령을 부르지 않는다.
"""

import json
import os
import platform
import re
import shutil
import socket
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "t2-check.sh"
BASE_PATH = "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"
REAL_GIT = shutil.which("git") or "/usr/bin/git"
NODE_DIR = str(Path(shutil.which("node") or "/usr/bin/node").parent)

# 화면·파일 어디에도 나오면 안 되는 값
SECRETS = ("S3CRETPW", "SECRETVAL123", "PM2SECRET", "QUOTEDSECRET", "MIIBPEMSECRET", "TGSECRET",
           "CRONSECRET1", "CRONSECRET2", "CRONSECRET3", "CRONSECRET4")

PM2_STUB = r"""#!/usr/bin/env node
// pm2 흉내 — 호출은 $STUB/log. jlist 는 pm2_env 에 env(비밀)를 싣는다(실제 pm2 와 같다)
const fs = require('fs'), path = require('path')
const argv = process.argv.slice(2)
fs.appendFileSync(path.join(process.env.STUB, 'log'), 'pm2 ' + argv.join(' ') + '\n')
const proc = (name, cwd, args) => ({ name, pm2_env: { status: 'online', pm_cwd: cwd, pm_exec_path: cwd + '/x.js', args,
  restart_time: 0, TELEGRAM_BOT_TOKEN: 'PM2SECRET', env: { DATABASE_URL: 'postgresql://u:PM2SECRET@h/db' } } })
if (argv[0] === 'jlist') {
  if (process.env.STUB_JLIST === 'garbage') process.stdout.write('[{"name":"myfinance","TOKEN":"PM2SECRET" broken')
  // 경고 줄이 JSON 앞에 붙는다 — "[PM2]" 접두도 있다 (#186 사전 리뷰)
  else process.stdout.write('[PM2][WARN] In-memory PM2 is out-of-date, do:\n>>>> $ pm2 update\n' + JSON.stringify([
    proc('myfinance', process.env.FIN, 'start -p 4100'), proc('myfinance-bot', process.env.FIN, ['bot']),
    proc('myfitness', process.env.FIT, undefined), proc('other-app', '/srv/other', [])]))
} else if (argv[0] === 'ls') console.log('│ myfinance │ online │')
"""

# sudo 흉내 — STUB_SUDO=ok 면 -n·-u <user> 를 떼고 나머지를 실행, 아니면 실패
SUDO_STUB = """#!/bin/bash
echo "sudo $*" >> "$STUB/log"
[[ "${STUB_SUDO:-no}" == ok ]] || exit 1
while [[ $# -gt 0 ]]; do
  case "$1" in -n|-v) shift ;; -u) shift 2 ;; *) break ;; esac
done
[[ $# -eq 0 ]] || exec "$@"
"""

LOGGING_STUB = """#!/bin/bash
echo "$(basename "$0") $*" >> "$STUB/log"
"""

# crontab 은 인라인 비밀을 흔히 담는다 — 마스킹 대상 (#186 사전 리뷰 major)
CRONTAB_STUB = """#!/bin/bash
echo "crontab $*" >> "$STUB/log"
echo '0 3 * * * PGPASSWORD=CRONSECRET1 /srv/myFinance/scripts/backup-db.sh'
echo '* * * * * curl -s https://api.telegram.org/bot123456:CRONSECRET2/sendMessage'
echo '0 1 * * * pg_dump postgresql://svc:CRONSECRET3@localhost/db > /dev/null'
echo '0 2 * * * curl -H "Authorization: Bearer CRONSECRET4" https://x'
"""

# https.get 이 토큰 URL 을 담은 오류를 던진다 — U13 이 그 메시지를 싣지 않는지 (#186 사전 리뷰 info)
HTTPS_THROW = """require('https').get = (url) => { const e = new Error('boom ' + url); throw e }
"""

GIT_STUB = f"""#!/bin/bash
echo "git $*" >> "$STUB/log"
for a in "$@"; do [[ "$a" == ls-remote ]] && {{ echo "abc123	refs/heads/dev"; exit 0; }}; done
exec {REAL_GIT} "$@"
"""


def _git(root: Path, *args: str) -> None:
    subprocess.run([REAL_GIT, "-C", str(root), *args], check=True, capture_output=True)


class FakeServer:
    """서비스 계정 홈 흉내 — 서비스 체크아웃 2(git · 태그 · .env 비밀) · pm2 소켓 · 명령 스텁."""

    def __init__(self, *, pm2_socket=True, pm2_pid_alive=True, tg_token=False, db="ok"):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name).resolve()
        self.fin = self.home / "myFinance"
        self.fit = self.home / "myFitness"
        for d, name in ((self.fin, "myfinance_db"), (self.fit, "myfitness_db")):
            d.mkdir()
            name = name if db == "ok" else "bad%20name"
            (d / ".env").write_text(
                f'DATABASE_URL="postgresql://svc:S3CRETPW@localhost:5432/{name}?schema=public"\n'
                "API_KEY=SECRETVAL123 # 설명\n"
                "EMPTY=\n"
                'QUOTED=" QUOTEDSECRET "\n'
                'PEM="-----BEGIN KEY-----\nMIIBPEMSECRET=\n-----END KEY-----"\n'
                + ("TELEGRAM_BOT_TOKEN=123:TGSECRET\n" if tg_token else ""))
            (d / ".nvmrc").write_text("24\n")
            _git(d, "init", "-q")
            _git(d, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "x")
            _git(d, "tag", "v1.0.0")
        self.pm2_home = self.home / ".pm2"
        self.pm2_home.mkdir()
        self.sock = None
        if pm2_socket:
            self.sock = socket.socket(socket.AF_UNIX)
            self.sock.bind(str(self.pm2_home / "rpc.sock"))
        if pm2_pid_alive:
            pid = os.getpid()
        else:  # 소켓 파일만 남은 죽은 데몬(SIGKILL · OOM) — pm2 를 부르면 새 데몬이 뜬다 (#186 사전 리뷰 major)
            dead = subprocess.Popen(["true"])
            dead.wait()
            pid = dead.pid
        (self.pm2_home / "pm2.pid").write_text(str(pid))
        self.stub = self.home / "_stub"
        self.stub.mkdir()
        stubs = {"pm2": PM2_STUB, "sudo": SUDO_STUB, "git": GIT_STUB, "crontab": CRONTAB_STUB,
                 "uname": "#!/bin/sh\necho Linux\n", "https-throw.js": HTTPS_THROW}
        for name in ("psql", "pg_dump", "nginx", "ss", "systemctl", "curl", "claude"):
            stubs[name] = LOGGING_STUB
        for name, body in stubs.items():
            (self.stub / name).write_text(body)
            (self.stub / name).chmod(0o755)

    def env(self, **extra) -> dict:
        return {"PATH": f"{self.stub}:{NODE_DIR}:{BASE_PATH}", "HOME": str(self.home), "STUB": str(self.stub),
                "FIN": str(self.fin), "FIT": str(self.fit), "LANG": "C.UTF-8", **extra}

    def run(self, *args: str, **extra) -> subprocess.CompletedProcess:
        return subprocess.run(["bash", str(SCRIPT), *args], cwd=self.home, capture_output=True, text=True,
                              env=self.env(**extra), timeout=60)

    def log(self) -> str:
        p = self.stub / "log"
        return p.read_text() if p.exists() else ""

    def outputs(self) -> list[Path]:
        d = self.home / "pleiades-private"
        return sorted(d.glob("t2-*.txt")) if d.exists() else []

    def close(self):
        if self.sock:
            self.sock.close()
        self.tmp.cleanup()


@unittest.skipUnless(shutil.which("node") and shutil.which("git"), "node·git 필요")
class FullRun(unittest.TestCase):
    def setUp(self):
        self.srv = FakeServer()

    def tearDown(self):
        self.srv.close()

    def run_ok(self, *args, **extra):
        r = self.srv.run(*args, **extra)
        self.assertEqual(r.returncode, 0, r.stderr)
        outs = self.srv.outputs()
        self.assertEqual(len(outs), 1)
        return r, outs[0].read_text()

    def test_no_secret_reaches_screen_or_file(self):
        for sudo in ("no", "ok"):
            with self.subTest(sudo=sudo):
                for p in self.srv.outputs():
                    p.unlink()
                r, text = self.run_ok(STUB_SUDO=sudo)
                for s in SECRETS:
                    self.assertNotIn(s, r.stdout + r.stderr)
                    self.assertNotIn(s, text)

    def test_output_file_is_private_and_mirrors_screen(self):
        r, text = self.run_ok()
        out = self.srv.outputs()[0]
        self.assertEqual(stat.S_IMODE(out.stat().st_mode), 0o600)
        self.assertIn("U13", text)
        self.assertEqual(text.strip(), r.stdout.strip())

    def test_detects_dirs_from_pm2_and_db_names_from_env(self):
        _, text = self.run_ok()
        self.assertIn(f"FIN_DIR={self.srv.fin}", text)
        self.assertIn(f"FIT_DIR={self.srv.fit}", text)
        self.assertIn("FIN_DB=myfinance_db", text)
        self.assertIn("FIT_DB=myfitness_db", text)
        # pm2 필드 추출 — 문자열 args · 배열 args · args 없음 (PR #183 Codex P1)
        self.assertIn("start -p 4100", text)
        self.assertIn("other-app", text)

    def test_reports_env_keys_without_values(self):
        _, text = self.run_ok()
        self.assertRegex(text, r"API_KEY\t값있음")
        self.assertRegex(text, r"EMPTY\t빈값")
        self.assertRegex(text, r"QUOTED\t값있음")

    def test_checkout_tag_is_read_with_no_optional_locks(self):
        _, text = self.run_ok()
        self.assertIn("v1.0.0", text)
        for line in self.srv.log().splitlines():
            if line.startswith("git -C"):
                self.assertIn("--no-optional-locks", line)

    def test_pm2_is_only_read(self):
        self.run_ok()
        calls = {l.split()[1] for l in self.srv.log().splitlines() if l.startswith("pm2 ")}
        self.assertTrue(calls)
        self.assertLessEqual(calls, {"jlist", "ls"})

    def test_without_sudo_skips_root_commands_and_continues(self):
        r, text = self.run_ok(STUB_SUDO="no")
        self.assertIn("건너뜀", text)
        self.assertNotRegex(self.srv.log(), r"(?m)^psql .*-d ")
        self.assertIn("U13", text)

    def test_with_sudo_queries_both_service_dbs(self):
        self.run_ok(STUB_SUDO="ok")
        log = self.srv.log()
        self.assertRegex(log, r"psql .*-d myfinance_db")
        self.assertRegex(log, r"psql .*-d myfitness_db")

    def test_explicit_args_override_detection(self):
        other = self.srv.home / "elsewhere"
        shutil.copytree(self.srv.fin, other)
        _, text = self.run_ok("--fin-dir", str(other), "--fin-db", "chosen_db")
        self.assertIn(f"FIN_DIR={other}", text)
        self.assertIn("FIN_DB=chosen_db", text)

    def test_unparseable_jlist_is_not_echoed(self):
        r, text = self.run_ok(STUB_JLIST="garbage")
        self.assertIn("해석 실패", text)
        self.assertNotIn("PM2SECRET", r.stdout + r.stderr + text)
        self.assertIn("FIN_DIR 없음", text)

    def test_crontab_is_masked_but_readable(self):
        _, text = self.run_ok()
        self.assertIn("backup-db.sh", text)
        self.assertIn("PGPASSWORD=***", text)

    def test_bot_token_never_printed_even_when_request_throws(self):
        self.srv.close()
        self.srv = FakeServer(tg_token=True)
        r, text = self.run_ok(NODE_OPTIONS=f"--require {self.srv.stub / 'https-throw.js'}")
        self.assertNotIn("TGSECRET", r.stdout + r.stderr + text)
        self.assertIn("요청 실패", text)

    def test_detected_db_name_out_of_format_is_reported(self):
        self.srv.close()
        self.srv = FakeServer(db="bad")
        _, text = self.run_ok()
        self.assertIn("FIN_DB=<없음>", text)
        self.assertIn("형식 밖", text)

    def test_stale_pm2_socket_does_not_start_daemon(self):
        self.srv.close()
        self.srv = FakeServer(pm2_pid_alive=False)
        _, text = self.run_ok()
        self.assertNotIn("pm2 ", self.srv.log())
        self.assertIn("pm2 데몬", text)

    def test_missing_pm2_daemon_does_not_start_one(self):
        self.srv.close()
        self.srv = FakeServer(pm2_socket=False)
        _, text = self.run_ok()
        self.assertNotIn("pm2 ", self.srv.log())
        self.assertIn("pm2 데몬", text)


@unittest.skipUnless(shutil.which("node") and shutil.which("git"), "node·git 필요")
class Refusals(unittest.TestCase):
    def setUp(self):
        self.srv = FakeServer()

    def tearDown(self):
        self.srv.close()

    def refused(self, *args, needle, **extra):
        r = self.srv.run(*args, **extra)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn(needle, r.stderr)
        self.assertEqual(self.srv.outputs(), [])
        return r

    def test_output_inside_git_work_tree(self):
        r = self.refused("--out", str(self.srv.fin / "sub/t2.txt"), needle="작업트리")
        self.assertFalse((self.srv.fin / "sub").exists())

    def test_existing_output_file(self):
        out = self.srv.home / "t2.txt"
        out.write_text("old")
        self.refused("--out", str(out), needle="이미 있다")
        self.assertEqual(out.read_text(), "old")

    def test_dangling_symlink_output(self):
        link = self.srv.home / "t2.txt"
        link.symlink_to(self.srv.home / "target.txt")
        self.refused("--out", str(link), needle="이미 있다")
        self.assertFalse((self.srv.home / "target.txt").exists())

    def test_bad_db_name(self):
        self.refused("--fin-db", "x';drop", needle="DB 이름")

    def test_missing_dir(self):
        self.refused("--fit-dir", str(self.srv.home / "nope"), needle="디렉터리")

    def test_unknown_arg(self):
        r = self.srv.run("--bogus")
        self.assertNotEqual(r.returncode, 0)

    @unittest.skipUnless(platform.system() == "Darwin", "로컬(Darwin) 차단 확인")
    def test_local_machine_refused(self):
        (self.srv.stub / "uname").unlink()
        self.refused(needle="I-3")


@unittest.skipUnless(shutil.which("bash"), "bash 필요")
class EnvKeys(unittest.TestCase):
    def test_judges_blank_without_printing_values(self):
        with tempfile.TemporaryDirectory() as t:
            f = Path(t) / ".env"
            # 여러 줄 따옴표 값의 안쪽 줄은 키처럼 보여도 키가 아니다 (#186 사전 리뷰 critical)
            f.write_text("A=SECRETVAL123\nB=\nC= # blank\nD=\"a#b\"\nexport E='q # w'\nF=\" \" # intentional\n"
                         "G=\"\" # c\n# H=commented\n  I = spaced \n"
                         "P=\"-----BEGIN\nMIIBPEMSECRET=\nend-----\"\nQ='line1\nX1=SECRETVAL123\n'\nR=after\n")
            r = subprocess.run(["bash", "-c", f'source "{SCRIPT}"; envkeys "$1"', "_", str(f)],
                               capture_output=True, text=True, env={"PATH": BASE_PATH})
            self.assertEqual(r.returncode, 0, r.stderr)
            got = dict(l.split("\t") for l in r.stdout.splitlines())
            self.assertEqual(got, {"A": "값있음", "B": "빈값", "C": "빈값", "D": "값있음", "E": "값있음",
                                   "F": "값있음", "G": "빈값", "I": "값있음", "P": "값있음", "Q": "값있음",
                                   "R": "값있음"})
            self.assertNotIn("SECRETVAL123", r.stdout)
            self.assertNotIn("MIIB", r.stdout)


class ScriptText(unittest.TestCase):
    TEXT = SCRIPT.read_text()
    CODE = "\n".join(l for l in TEXT.splitlines() if not l.lstrip().startswith("#"))

    def test_syntax(self):
        r = subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_no_state_changing_commands(self):
        # 런북 "하지 않는다" — pm2 상태 변경·원문 출력 · getUpdates(409) · .env 원문 · 서비스 체크아웃 git 변경
        for bad in (r"pm2\s+(save|restart|reload|start|stop|delete|kill|update|resurrect|flush|reset|env|describe|prettylist)\b",
                    r"getUpdates", r"\bcat\b[^\n|]*\.env", r"\bsource\b[^\n]*\.env", r"\.\s+\S*\.env",
                    r"git\b[^\n]*\s(fetch|pull|checkout|reset|stash|clean|commit|push)\b", r"\bset\s+-[a-z]*x"):
            with self.subTest(bad=bad):
                self.assertNotRegex(self.CODE, bad)

    def test_every_checkout_git_call_skips_optional_locks(self):
        lines = [l for l in self.CODE.splitlines() if re.search(r"\bgit\s+-C\b", l)]
        self.assertTrue(lines)
        for l in lines:
            self.assertIn("--no-optional-locks", l)

    def test_raw_jlist_only_goes_to_field_filter(self):
        # 명령으로 쓰인 줄만 — 메시지 문자열 안의 "pm2 jlist" 는 제외
        calls = [l for l in self.CODE.splitlines() if re.search(r"(^|\$\(|[;&|]\s*)\s*pm2\s+jlist\b", l)]
        self.assertTrue(calls)
        for l in calls:
            self.assertRegex(l, r"pm2\s+jlist[^|]*\|\s*pm2_fields")


if __name__ == "__main__":
    unittest.main()
