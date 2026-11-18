"""deploy/ops/collect.cjs — 008 단계 1 수집기 --dry-run (#568).

실행: python3 -m unittest discover -s deploy
테스트는 deploy/ 최상위에 둔다 — deploy/ops/ 아래 두면 discover 가 조용히 0건이다(008 §2 확정 블록 · E-15 ①).
pm2 는 스텁 JS(셔뱅이 깨져 있어 node 로 불릴 때만 돈다) · 데몬은 임시 UNIX 소켓 · health 는 임시 HTTP 서버다.
서버·pm2 데몬·Discord 를 쓰지 않는다. 핵심 계약: 데몬이 없으면 pm2 를 부르지 않는다 · 배포 잠금을 열지 않는다 ·
배포 표지 동안 상태 변화를 보류한다 · 원문(jlist · 로그 · .env 값)을 파일·출력에 쓰지 않는다 · 외부로 나가는 것 0.
"""

import http.server
import json
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "ops" / "collect.cjs"
DOTENV = HERE.parent / "apps" / "finance" / "node_modules" / "dotenv"
NODE = shutil.which("node") or "/usr/bin/node"
NOW = "2026-11-10T08:00:00+09:00"  # 일일 요약(09:05) 전
SECRET = "SECRETVALUE123"
APPS = {"fin": "finance", "fit": "fitness"}
NAMES = [f"pleiades-{a}-{r}" for a in APPS for r in ("web", "bot", "mcp")]

STUB_PM2 = r"""#!/nonexistent/node-must-be-execPath
const fs = require('fs')
fs.appendFileSync(process.env.STUB_CALLS, JSON.stringify({ argv: process.argv.slice(2), exec: process.execPath }) + '\n')
process.stdout.write(fs.readFileSync(process.env.STUB_JLIST, 'utf8'))
"""


FETCH_STUB = r"""
const fs = require('fs')
const path = require('path')
globalThis.fetch = async (url, opts) => {
  const log = path.join(path.dirname(__filename), 'fetch.jsonl')
  fs.appendFileSync(log, JSON.stringify({ url: String(url), body: JSON.parse(opts.body) }) + '\n')
  const n = fs.readFileSync(log, 'utf8').trim().split('\n').length
  const codes = (process.env.STUB_FETCH_STATUS || '204').split(',')
  const st = Number(codes[Math.min(n - 1, codes.length - 1)])
  if (st === 0) throw Object.assign(new Error('connect failed ' + url), { name: 'TypeError' })
  return { ok: st >= 200 && st < 300, status: st, body: null }
}
"""


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        spec = self.server.spec.get(self.path, (200, ""))
        if spec == "hang":
            time.sleep(3)
            return
        code, body = spec
        self.send_response(code)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, *a):
        pass


class Base(unittest.TestCase):
    def setUp(self):
        self.assertTrue(DOTENV.exists(), "apps/finance npm ci 필요(dotenv) — 건너뛰면 이 테스트가 아무것도 증명하지 않는다")
        # UNIX 소켓 경로 길이 제한(macOS 104) 때문에 짧은 임시 경로
        self.tmp = Path(tempfile.mkdtemp(prefix="ops", dir="/tmp"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.home = self.tmp / "h"
        self.pm2 = self.tmp / "p"
        (self.pm2 / "logs").mkdir(parents=True)
        self.private = self.home / "pleiades-private"
        self.ops = self.private / "ops"
        self.calls = self.tmp / "calls"
        self.calls.touch()
        self.jlist = self.tmp / "jlist.json"
        self.bin = self.tmp / "pm2bin"
        self.bin.write_text(STUB_PM2)  # 실행 비트 없음 · 셔뱅 깨짐 — process.execPath 로만 돈다(E-2)
        self.servers = {}
        for app, d in APPS.items():
            app_dir = self.home / f"pleiades-{app}" / "apps" / d
            (app_dir / "node_modules").mkdir(parents=True)
            (app_dir / "node_modules" / "dotenv").symlink_to(DOTENV)
            web = self.serve({"/": (307, "")})
            mcp = self.serve({"/health": (200, '{"ok":true}')})
            self.servers[app] = {"web": web, "mcp": mcp}
            (app_dir / ".env").write_text(
                f'PORT={web.server_address[1]}\nMCP_PORT={mcp.server_address[1]}\nDISCORD_BOT_TOKEN="{SECRET}"\n'
            )
        self.set_procs({n: ("online", 0) for n in NAMES})
        for n in NAMES:
            self.log(f"{n}-error-0.log", "")
            self.log(f"{n}-out-0.log", "")
        self.daemon = None
        self.start_daemon()

    def serve(self, spec):
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        srv.spec = spec
        srv.daemon_threads = True
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        return srv

    def start_daemon(self):
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.bind(str(self.pm2 / "rpc.sock"))
        s.listen(8)
        self.daemon = s
        self.daemon_hits = 0

        def loop():
            while True:
                try:
                    c, _ = s.accept()
                except OSError:
                    return
                self.daemon_hits += 1
                c.close()

        threading.Thread(target=loop, daemon=True).start()
        self.addCleanup(self.stop_daemon)

    def stop_daemon(self):
        if self.daemon:
            self.daemon.close()
            self.daemon = None
        (self.pm2 / "rpc.sock").unlink(missing_ok=True)

    def set_procs(self, procs, extra=None):
        rows = [
            {"name": n, "pm_id": i, "pm2_env": {"status": st, "restart_time": rt, "pm_uptime": 1, "pm_cwd": "/srv/x", "SECRET_ENV": SECRET}}
            for i, (n, (st, rt)) in enumerate(procs.items())
        ]
        rows += extra or []
        self.jlist.write_text("[PM2][WARN] something\n" + json.dumps(rows))

    def log(self, name, text, append=False):
        p = self.pm2 / "logs" / name
        with open(p, "a" if append else "w") as f:
            f.write(text)
        return p

    def run_c(self, *args, now=NOW, config=None, timeout=60, prod_defaults=False, **env):
        e = {
            "PATH": "/usr/bin:/bin",
            "HOME": str(self.home),
            "PM2_HOME": str(self.pm2),
            "PLEIADES_TEST": "1",
            "STUB_CALLS": str(self.calls),
            "STUB_JLIST": str(self.jlist),
            "OPS_NOW": now,
            "OPS_DISK_HOME": str(self.home),
            "OPS_DISK_BACKUP": str(self.tmp),
            "OPS_CONFIG": json.dumps({"summaryAt": "23:59", "disk": {"warn": 101, "crit": 102}, **({} if prod_defaults else {"quietWarnings": False}), **(config or {})}),
        }
        e.update(env)
        argv = list(args) if args else ["--dry-run", f"--pm2-bin={self.bin}"]
        return subprocess.run([NODE, str(SCRIPT), *argv], capture_output=True, text=True, env=e, timeout=timeout)

    def ok(self, **kw):
        r = self.run_c(**kw)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r

    def posts(self):
        p = self.ops / "dry-run.log"
        # 템플릿은 마크다운 escape 를 한다(\\-) — 비교는 escape 를 벗겨서
        return p.read_text().replace("\\", "").splitlines() if p.exists() else []

    def fetch_stub(self):
        """global fetch 스텁 — 호출을 파일에 적고 STUB_FETCH_STATUS(쉼표 · 호출 순서 · 마지막 값 반복 · 0 = 예외)로 답한다."""
        stub = self.tmp / "fetch-stub.cjs"
        if not stub.exists():
            self.fetch_log = self.tmp / "fetch.jsonl"
            self.fetch_log.touch()
            stub.write_text(FETCH_STUB)
        return stub

    def fetches(self):
        log = self.tmp / "fetch.jsonl"
        return [json.loads(l) for l in log.read_text().splitlines()] if log.exists() else []

    def events(self):
        p = self.ops / "events.jsonl"
        return [json.loads(l) for l in p.read_text().splitlines()] if p.exists() else []

    def state(self):
        return json.loads((self.ops / "state.json").read_text())

    def pm2_calls(self):
        return [json.loads(l) for l in self.calls.read_text().splitlines()]

    def assert_no_raw(self, *extra):
        texts = [p.read_text() for p in self.ops.iterdir() if p.is_file()]
        for t in texts:
            for needle in (SECRET, "/srv/x", *extra):
                self.assertNotIn(needle, t)


class Cli(Base):
    def test_no_dry_run_without_webhook_defers_and_sends_nothing(self):
        # 게시 판(#725) — 플랫폼 설정이 없으면 웹훅이 없다: 폴백 없이 미룬다(commit 안 함) · 외부 호출 0
        self.ok(now="2026-11-10T07:55:00+09:00")  # 상태 없는 첫 회는 로그 끝에서 시작한다
        self.log("pleiades-fin-bot-error-0.log", "2026-11-10 07:59:00: [bot] TypeError: x\n", append=True)
        r = self.run_c(f"--pm2-bin={self.bin}", NODE_OPTIONS=f"--require={self.fetch_stub()}")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("기록 0 · 미룸 1 · 요약만 0 · 차단 0 · 웹훅 없음 (게시)", r.stdout)
        self.assertEqual(self.fetches(), [])
        self.assertTrue(self.state()["fps"][next(iter(self.state()["fps"]))]["deferred"])

    def test_dry_run_with_test_alert_rejected(self):
        self.assertEqual(self.run_c("--dry-run", "--test-alert").returncode, 2)

    def test_unknown_arg(self):
        self.assertEqual(self.run_c("--dry-run", "--post").returncode, 2)

    def test_config_constraint_p8_times_period_gt_p9(self):
        r = self.run_c(config={"lockStaleRuns": 1, "periodMin": 1, "maxRunMs": 60000})
        self.assertEqual(r.returncode, 2)
        self.assertIn("P-8×주기 > P-9", r.stderr)

    def test_healthy_run_records_nothing_and_writes_private_files(self):
        r = self.ok()
        self.assertIn("수집 통과 · 관측 0 · 기록 0", r.stdout)
        self.assertEqual(self.posts(), [])
        self.assertEqual(oct(self.ops.stat().st_mode & 0o777), "0o700")
        self.assertEqual(oct((self.ops / "state.json").stat().st_mode & 0o777), "0o600")
        self.assertFalse((self.ops / "collect.lock").exists())

    def test_static_no_deploy_lock_no_network_out(self):
        src = SCRIPT.read_text()
        self.assertNotIn("deploy.lock", src)  # E-3 — 배포가 flock -n 이다
        self.assertNotIn("flock", src.replace("flock -n 이라", ""))
        # 외부로 나가는 길은 웹훅 게시 하나다(#725) — 주소는 플랫폼 설정에서만 온다(코드에 박지 않는다)
        self.assertEqual(src.count("fetch("), 1)
        self.assertIn("await fetch(target, {", src)
        self.assertNotIn("discord.com", src)
        self.assertIn("allowed_mentions: { parse: [] }", src)
        # 외부 프로세스 호출은 pm2 jlist 하나뿐이다(Q97 — 코드가 지키는 규칙)
        self.assertEqual(src.count("spawnSync("), 1)
        self.assertIn("spawnSync(process.execPath, [bin, 'jlist']", src)
        self.assertEqual(src.count("child_process"), 1)
        self.assertIn("const { spawnSync } = require('child_process')", src)
        for mod in ("'https'", "'dgram'", "'tls'"):
            self.assertNotIn(mod, src)


class Pm2(Base):
    def test_jlist_via_exec_path_and_only_pleiades(self):
        other = [{"name": "other-app", "pm_id": 99, "pm2_env": {"status": "errored", "restart_time": 5}}]
        self.set_procs({n: ("online", 0) for n in NAMES}, extra=other)
        self.ok()
        calls = self.pm2_calls()
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["argv"], ["jlist"])
        self.assertEqual(Path(calls[0]["exec"]).resolve(), Path(NODE).resolve())
        self.assertEqual(self.posts(), [])  # pleiades 밖 errored 는 버린다(V15)
        self.assert_no_raw("other-app")

    def test_daemon_down_never_calls_pm2(self):
        self.stop_daemon()
        self.ok()
        self.assertEqual(self.pm2_calls(), [])  # E-1 — CLI 가 빈 데몬을 띄우지 않게
        posts = self.posts()
        self.assertEqual(len(posts), 1)
        self.assertIn("ops·pm2 · daemon · none", posts[0].replace("\\", ""))
        self.assertIn("🔴", posts[0])

    def test_missing_status_restart_and_reset(self):
        self.ok()
        procs = {n: ("online", 0) for n in NAMES}
        procs["pleiades-fin-bot"] = ("errored", 3)
        del procs["pleiades-fit-web"]
        self.set_procs(procs)
        self.ok(now="2026-11-10T08:05:00+09:00")
        text = "\n".join(self.posts()).replace("\\", "")
        self.assertIn("fin·bot · pm2 · status:errored", text)
        self.assertIn("fin·bot · pm2 · restart", text)
        self.assertIn("3회", text)
        self.assertIn("fit·web · pm2 · missing", text)
        # 감소 = 재등록 — 기준값만 바꾸고 게시하지 않는다
        procs["pleiades-fin-bot"] = ("online", 0)
        self.set_procs(procs)
        before = len(self.posts())
        self.ok(now="2026-11-10T08:10:00+09:00")
        self.assertFalse(any("restart" in p for p in self.posts()[before:]))
        self.assertEqual(self.state()["restarts"]["pleiades-fin-bot"], 0)

    def test_all_missing_is_one_post_with_note_outside_burst(self):
        self.ok()
        self.set_procs({})
        # 동시에 새 로그 지문을 burstLimit 보다 많이
        lines = "".join(f"2026-11-10 08:04:00: [x{i}] Boom{i}Error\n" for i in range(4))
        self.log("pleiades-fin-bot-error-0.log", lines, append=True)
        self.ok(now="2026-11-10T08:05:00+09:00", config={"burstLimit": 2})
        posts = [p.replace("\\", "") for p in self.posts()]
        allm = [p for p in posts if "all-missing" in p]
        self.assertEqual(len(allm), 1)
        self.assertIn("resurrect 전에", allm[0])
        self.assertFalse(any("pm2 · missing" in p for p in posts))
        self.assertTrue(any("새 지문 2+" in p for p in posts))

    def test_jlist_parse_failure_is_collector_warning_without_raw(self):
        self.jlist.write_text(f"garbage {SECRET} not json")
        self.ok()
        self.assertTrue(any("jlist-parse" in p for p in self.posts()))
        self.assert_no_raw()

    def test_pm2_bin_missing(self):
        r = self.run_c("--dry-run", f"--pm2-bin={self.tmp / 'none'}")
        self.assertEqual(r.returncode, 0)
        self.assertTrue(any("pm2-bin" in p for p in self.posts()))
        self.assertEqual(self.daemon_hits, 0)


class DeployWindow(Base):
    def test_pending_marker_holds_state_changes_until_gone(self):
        self.ok()
        self.private.joinpath("inplace-fin-pending").write_text("v1.10.1\n")
        procs = {n: ("online", 0) for n in NAMES}
        del procs["pleiades-fin-web"]
        procs["pleiades-fin-mcp"] = ("online", 1)
        self.set_procs(procs)
        self.servers["fin"]["mcp"].spec["/health"] = (502, "")
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertEqual(self.posts(), [])
        # 표지가 사라진 뒤 첫 수집에서 다시 판정 · 재시작 수는 기준값으로 흡수됐다
        self.private.joinpath("inplace-fin-pending").unlink()
        self.ok(now="2026-11-10T08:10:00+09:00")
        text = "\n".join(self.posts()).replace("\\", "")
        self.assertIn("fin·web · pm2 · missing", text)
        self.assertIn("fin·mcp · health · 5xx", text)
        self.assertNotIn("restart", text)

    def test_stale_marker_ends_hold_and_warns(self):
        self.ok()
        m = self.private / "inplace-fit-pending"
        m.write_text("v1.10.1\n")
        old = time.time() - 3600
        os.utime(m, (old, old))
        procs = {n: ("online", 0) for n in NAMES}
        del procs["pleiades-fit-bot"]
        self.set_procs(procs)
        # 실제 시각을 쓴다(표지 mtime 기준) — 첫 회(NOW 08:00)에서 6시간이 지나면 침묵 경보가 폭주 규칙에 묶이므로 상한을 넉넉히(#577)
        self.ok(now=time.strftime("%Y-%m-%dT%H:%M:%S%z"), config={"summaryAt": "23:59:59", "burstLimit": 50})
        text = "\n".join(self.posts()).replace("\\", "")
        self.assertIn("deploy-stale:fit", text)
        self.assertIn("fit·bot · pm2 · missing", text)

    def test_last_ok_change_absorbs_restart(self):
        self.ok()
        self.private.joinpath("inplace-fin-last-ok").write_text("v1.10.1\n")
        procs = {n: ("online", 0) for n in NAMES}
        procs["pleiades-fin-web"] = ("online", 1)
        self.set_procs(procs)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertEqual(self.posts(), [])

    def test_warnings_inside_c5_window_are_absorbed_failures_are_not(self):
        # 회귀: #587 P-7 — 배포 창 web 경고(C5 가 배포 알림에서 센 줄)가 배포 뒤 첫 관측으로 나왔다
        self.ok()
        self.private.joinpath("inplace-fin-window").write_text("2026-11-10 08:01:30\t2026-11-10 08:03:00\n")
        self.log("pleiades-fin-web-error-0.log",
                 "2026-11-10 08:00:30: ⚠ BeforeT0\n"  # 직전 수집 뒤 · t0 앞 — C5 가 세지 않았다(PR-1b 9-1 major)
                 "2026-11-10 08:02:00: ⚠ InsideWarn\n"
                 "2026-11-10 08:02:30: [web] TypeError: InsideFail\n"
                 "2026-11-10 08:03:01: [cron] ⚠ AfterT1\n", append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        posts = [p.replace("\\", "") for p in self.posts()]
        # 08:00:30 경고 1 · 창 안 실패 1 · 08:03:01 cron 경고 1 — 창 안 경고 1 만 흡수
        self.assertEqual(len(posts), 3, posts)
        self.assertTrue(any("🟠 실패 · fin·web · stderr · web · TypeError" in p for p in posts))
        self.assertTrue(any("cron" in p for p in posts))
        untagged = [p for p in posts if "🟡 경고 · fin·web · stderr · 지문" in p]
        self.assertEqual(len(untagged), 1)
        self.assertNotIn("2회", untagged[0])

    def test_held_deploy_defers_error_logs_and_failed_deploy_reports_them(self):
        # 회귀: PR-1b 9-1 major — 보류 중 흡수한 경고가 실패한 배포에서 어디에도 남지 않았다
        self.ok()
        pending = self.private / "inplace-fit-pending"
        pending.write_text("v1.10.2\n")
        self.log("pleiades-fit-web-error-0.log", "2026-11-10 08:02:00: ⚠ HeldWarn\n"
                 "2026-11-10 08:02:01: [web] RangeError: HeldFail\n", append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertEqual([p for p in self.posts() if "fit·web" in p], [])  # 보류 중 — 읽지 않는다
        # 통과 없이 끝났다(표지가 사라짐 · 창 파일 없음) → 둘 다 낸다
        pending.unlink()
        self.ok(now="2026-11-10T08:10:00+09:00")
        fit = [p.replace("\\", "") for p in self.posts() if "fit·web" in p]
        self.assertEqual(len(fit), 2, fit)
        # 통과한 배포 — 표지가 사라진 뒤 창 안 경고만 흡수
        pending.write_text("v1.10.3\n")
        self.log("pleiades-fit-web-error-0.log", "2026-11-10 08:12:00: [x] ⚠ PassWarn\n"
                 "2026-11-10 08:12:01: [web] SyntaxError: PassFail\n", append=True)
        self.ok(now="2026-11-10T08:15:00+09:00")
        pending.unlink()
        self.private.joinpath("inplace-fit-window").write_text("2026-11-10 08:11:00\t2026-11-10 08:13:00\n")
        self.ok(now="2026-11-10T08:20:00+09:00")
        later = [p.replace("\\", "") for p in self.posts() if "fit·web" in p][2:]
        self.assertEqual(len(later), 1, later)
        self.assertIn("SyntaxError", later[0])

    def test_first_run_during_hold_still_starts_at_end(self):
        # 회귀: PR #590 Codex P2 — 상태 없는 첫 회가 보류 중이면 기준 오프셋이 없어 보류 뒤 과거 로그를 0 부터 읽었다
        self.log("pleiades-fit-web-error-0.log", "2026-11-01 00:00:00: [web] OldError\n")
        self.private.mkdir(parents=True, exist_ok=True)
        pending = self.private / "inplace-fit-pending"
        pending.write_text("v1.10.2\n")
        self.ok()
        pending.unlink()
        self.log("pleiades-fit-web-error-0.log", "2026-11-10 08:06:00: [web] NewError\n", append=True)
        self.ok(now="2026-11-10T08:10:00+09:00")
        text = "\n".join(self.posts())
        self.assertIn("fit·web", text)
        self.assertEqual(sum("fit·web" in p for p in self.posts()), 1)
        self.assertNotIn("2회", [p for p in self.posts() if "fit·web" in p][0])

    def test_malformed_window_absorbs_nothing(self):
        self.ok()
        self.private.joinpath("inplace-fin-window").write_text("2026-11-10 08:03:00\t2026-11-10 08:01:00\n")  # t0 > t1
        self.log("pleiades-fin-web-error-0.log", "2026-11-10 08:02:00: ⚠ W\n", append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertEqual(len(self.posts()), 1)

    def test_never_opens_deploy_lock(self):
        # FIFO — 누가 열면 막힌다(쓰기·읽기 모두) → 시간 초과로 드러난다
        self.private.mkdir(parents=True, exist_ok=True)
        os.mkfifo(self.private / "deploy.lock")
        self.ok(timeout=20)


class Health(Base):
    def test_web_mcp_grades(self):
        self.ok()
        self.servers["fin"]["web"].spec["/"] = (500, "")
        self.servers["fit"]["mcp"].spec["/health"] = (200, '{"ok":false}')
        self.ok(now="2026-11-10T08:05:00+09:00")
        text = "\n".join(self.posts()).replace("\\", "")
        self.assertIn("fin·web · http · 5xx", text)
        self.assertIn("fit·mcp · health · 200-notok", text)

    def test_timeout_and_refused(self):
        self.servers["fin"]["mcp"].spec["/health"] = "hang"
        port = self.servers["fit"]["web"].server_address[1]
        self.servers["fit"]["web"].shutdown()
        self.servers["fit"]["web"].server_close()
        self.ok(config={"httpMs": 500})
        text = "\n".join(self.posts()).replace("\\", "")
        self.assertIn("fin·mcp · health · timeout", text)
        self.assertIn("fit·web · http · 000", text)
        self.assertNotIn(str(port), text)

    def test_env_unreadable(self):
        (self.home / "pleiades-fit" / "apps" / "fitness" / ".env").unlink()
        self.ok()
        self.assertTrue(any("env-read:fit" in p for p in self.posts()))

    def test_recovery_after_m_runs(self):
        self.servers["fin"]["web"].spec["/"] = (503, "")
        self.ok()
        self.servers["fin"]["web"].spec["/"] = (200, "")
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertFalse(any("🟢" in p for p in self.posts()))
        self.ok(now="2026-11-10T08:10:00+09:00", config={"recoverRuns": 2})
        rec = [p for p in self.posts() if "🟢" in p]
        self.assertEqual(len(rec), 1)
        self.assertIn("복구", rec[0])

    def test_unevaluated_run_breaks_recovery_streak(self):
        # 회귀: #577 · PR #576 Codex P2 — 정상 1 → 판정 못 한 회(.env 없음) → 정상 1 은 연속 2회가 아니다
        env = self.home / "pleiades-fin" / "apps" / "finance" / ".env"
        self.servers["fin"]["web"].spec["/"] = (503, "")
        self.ok()
        self.servers["fin"]["web"].spec["/"] = (200, "")
        self.ok(now="2026-11-10T08:05:00+09:00")
        saved = env.read_text()
        env.unlink()
        self.ok(now="2026-11-10T08:10:00+09:00")
        env.write_text(saved)
        self.ok(now="2026-11-10T08:15:00+09:00", config={"recoverRuns": 2})
        self.assertFalse(any("🟢" in p and "fin·web" in p for p in self.posts()))
        self.ok(now="2026-11-10T08:20:00+09:00", config={"recoverRuns": 2})
        self.assertEqual(len([p for p in self.posts() if "🟢" in p and "fin·web" in p]), 1)


class Alive(Base):
    """#589 봇 생존 표지 — apps/<dir>/logs/alive-<app>.json 수정 시각 · 연결 유지만 본다(응답 가능 여부는 보지 않는다)."""

    def marker(self, app, at):
        d = self.home / f"pleiades-{app}" / "apps" / APPS[app] / "logs"
        d.mkdir(exist_ok=True)
        p = d / f"alive-{app}.json"
        p.write_text('{"at":"x","state":"ack"}')
        t = datetime.fromisoformat(at).timestamp()
        os.utime(p, (t, t))
        return p

    def test_no_marker_is_not_judged(self):
        self.ok()
        self.ok(now="2026-11-10T09:00:00+09:00", config={"summaryAt": "23:59"})
        self.assertFalse(any("gateway" in p for p in self.posts()))

    def test_stale_marker_is_outage_and_fresh_marker_recovers(self):
        self.marker("fit", "2026-11-10T07:49:00+09:00")  # 11분 전
        self.marker("fin", "2026-11-10T07:55:00+09:00")  # 5분 전 — 정상
        self.ok()
        text = "\n".join(self.posts())
        self.assertIn("🔴", text)
        self.assertIn("fit·bot · gateway · stale", text)
        self.assertNotIn("fin·bot · gateway", text)
        self.marker("fit", "2026-11-10T08:04:30+09:00")
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.marker("fit", "2026-11-10T08:09:30+09:00")
        self.ok(now="2026-11-10T08:10:00+09:00", config={"recoverRuns": 2})
        rec = [p for p in self.posts() if "🟢" in p and "fit·bot · gateway" in p]
        self.assertEqual(len(rec), 1)

    def test_threshold_is_exclusive_and_configurable(self):
        self.marker("fin", "2026-11-10T07:50:00+09:00")  # 정확히 10분 — 아직 정상
        self.ok()
        self.assertFalse(any("gateway" in p for p in self.posts()))
        self.ok(now="2026-11-10T08:05:00+09:00", config={"aliveStaleMin": 20})
        self.assertFalse(any("gateway" in p for p in self.posts()))
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertTrue(any("fin·bot · gateway · stale" in p for p in self.posts()))

    def test_deleted_stale_marker_recovers_and_leaves_no_open_issue(self):
        # 회귀: #589 9-1 major — stale 인 채 표지를 지우면(런북 조치) ENOENT 를 건너뛰어 이상이 영영 열려 있었다
        p = self.marker("fit", "2026-11-10T07:00:00+09:00")
        self.ok()
        self.assertTrue(any("🔴" in x and "fit·bot · gateway · stale" in x for x in self.posts()))
        p.unlink()
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.ok(now="2026-11-10T08:10:00+09:00", config={"recoverRuns": 2})
        self.assertEqual(len([x for x in self.posts() if "🟢" in x and "fit·bot · gateway" in x]), 1)
        self.marker("fit", "2026-11-10T08:00:00+09:00")
        self.ok(now="2026-11-10T08:15:00+09:00")
        firsts = [x for x in self.posts() if "🔴" in x and "fit·bot · gateway · stale" in x]
        self.assertEqual(len(firsts), 2)  # 닫혔으므로 다시 첫 발생으로 나간다

    def test_unreadable_marker_does_not_close_open_stale(self):
        # 회귀: PR #591 Codex P2 — stat 이 EACCES 인 회도 gateway 를 판정한 것으로 쳐 거짓 복구가 나갔다
        if os.getuid() == 0:
            self.skipTest("root 는 권한 거부가 없다")
        p = self.marker("fin", "2026-11-10T07:00:00+09:00")
        self.ok()
        p.parent.chmod(0o000)
        self.addCleanup(p.parent.chmod, 0o700)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.ok(now="2026-11-10T08:10:00+09:00", config={"recoverRuns": 2})
        p.parent.chmod(0o700)
        self.assertFalse(any("🟢" in x and "fin·bot · gateway" in x for x in self.posts()))
        self.assertTrue(any("alive-read:fin" in x for x in self.posts()))

    def test_held_deploy_skips_alive_judgment(self):
        self.marker("fin", "2026-11-10T07:00:00+09:00")
        self.private.mkdir(parents=True, exist_ok=True)
        self.private.joinpath("inplace-fin-pending").write_text("v1.11.0\n")
        self.ok()
        self.assertFalse(any("gateway" in p for p in self.posts()))

    def test_marker_contents_never_reach_records(self):
        p = self.marker("fit", "2026-11-10T07:00:00+09:00")
        t = p.stat().st_mtime
        p.write_text(SECRET)
        os.utime(p, (t, t))
        self.ok()
        self.assert_no_raw()


class Logs(Base):
    E = "pleiades-fin-bot-error-0.log"

    def test_first_run_starts_at_end_then_reads_new(self):
        self.log(self.E, "2026-11-01 00:00:00: [bot] OldError\n")
        self.ok()
        self.assertEqual(self.posts(), [])
        self.log(self.E, "2026-11-10 08:01:00: [bot] TypeError: x\n", append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertEqual(len(self.posts()), 1)
        self.assertIn("TypeError", self.posts()[0])
        self.assertNotIn("OldError", "\n".join(self.posts()))

    def test_new_pm_id_file_from_zero_and_inode_and_shrink(self):
        self.ok()
        self.log("pleiades-fin-bot-error-7.log", "2026-11-10 08:01:00: [bot] FreshError boot\n")
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertTrue(any("FreshError" in p for p in self.posts()))
        # inode 교체 → 0 부터
        p = self.pm2 / "logs" / self.E
        p.unlink()
        self.log(self.E, "2026-11-10 08:06:00: [bot] InodeError\n")
        self.ok(now="2026-11-10T08:10:00+09:00")
        self.assertTrue(any("InodeError" in x for x in self.posts()))
        # 크기 감소(같은 inode · truncate) → 0 부터
        self.log(self.E, "2026-11-10 08:11:00: [b] AError\n2026-11-10 08:11:00: [b] AError\n", append=True)
        self.ok(now="2026-11-10T08:15:00+09:00")
        with open(p, "w") as f:
            f.write("2026-11-10 08:16:00: [b] ShrinkError\n")
        self.ok(now="2026-11-10T08:20:00+09:00")
        self.assertTrue(any("ShrinkError" in x for x in self.posts()))

    def test_first_resume_reconnect_is_normal_but_slow_and_new_session_are_not(self):
        # 회귀: #583 A — dry-run 첫 판정(11-10)에서 두 봇의 일상 RESUME 재접속이 '실패' 로 잡혔다
        self.ok()
        self.log(self.E, "2026-11-10 08:01:00: [discord-fin] gateway 재접속 1000ms 후 (RESUME)\n"
                 "2026-11-10 08:01:01: [discord-fin] gateway 세션 이어받음\n", append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertEqual(self.posts(), [])
        self.log(self.E, "2026-11-10 08:06:00: [discord-fin] gateway 재접속 5000ms 후 (RESUME)\n", append=True)
        self.ok(now="2026-11-10T08:10:00+09:00")
        self.assertEqual(len(self.posts()), 1)
        self.log("pleiades-fit-bot-error-0.log", "2026-11-10 08:11:00: [discord-fit] gateway 재접속 1000ms 후 (새 세션)\n", append=True)
        self.ok(now="2026-11-10T08:15:00+09:00")
        self.assertTrue(any("fit·bot" in p for p in self.posts()))

    def test_warn_vs_fail_gateway_skip_frames_errno_no_raw(self):
        self.ok()
        text = (
            "2026-11-10 08:01:00: [chat] gateway 준비 완료\n"
            "2026-11-10 08:01:01: [cron] ⚠ 경고 성격 ECONNRESET\n"
            "2026-11-10 08:01:02: [bot] TypeError: AAPL EMPTY ERROR 계좌 1234-5678 비밀메시지\n"
            "    at run (/home/u/pleiades-fin/apps/finance/dist/bot/standalone.cjs:123:45)\n"
            "2026-11-10 08:01:03: [web] RangeError boom\n"
            "    at x (/home/u/pleiades-fin/apps/finance/.next/server/chunks/815.js:1:2)\n"
        )
        self.log(self.E, text, append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        posts = [p.replace("\\", "") for p in self.posts()]
        self.assertEqual(len(posts), 3)  # gateway 정상 줄은 세지 않는다
        warn = [p for p in posts if "cron" in p][0]
        self.assertIn("🟡 경고", warn)
        self.assertIn("ECONNRESET", warn)
        fail = [p for p in posts if "TypeError" in p][0]
        self.assertIn("🟠 실패", fail)
        self.assertIn("dist/bot/standalone.cjs", fail)
        self.assertNotIn(":123", fail)  # 줄·열은 버린다(E-5)
        for bad in ("AAPL", "EMPTY", "1234", "비밀메시지", "/home/u"):
            self.assertNotIn(bad, fail)  # errno 밖 · 원문 · 절대 경로는 칸에 오지 않는다(E-6)
        chunk = [p for p in posts if "RangeError" in p][0]
        self.assertNotIn("chunks", chunk)
        self.assert_no_raw("비밀메시지", "1234-5678")

    def test_mcp_out_prefix_json_levels_and_parse_fail(self):
        self.ok()
        out = (
            '2026-11-10 08:01:00: {"level":"info","msg":"ok"}\n'
            '2026-11-10 08:01:01: {"level":"error","msg":"secret q","err":{"type":"PrismaClientKnownRequestError","code":"ETIMEDOUT"}}\n'
            '{"level":60,"msg":"fatal no prefix"}\n'
            "2026-11-10 08:01:02: {broken json\n"
            "2026-11-10 08:01:03: plain text line\n"
        )
        self.log("pleiades-fit-mcp-out-0.log", out, append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        posts = [p.replace("\\", "") for p in self.posts()]
        mcp = [p for p in posts if "fit·mcp · out" in p]
        self.assertEqual(len(mcp), 2)
        self.assertTrue(any("PrismaClientKnownRequestError · ETIMEDOUT" in p for p in mcp))
        self.assertTrue(any("json-parse:fit" in p for p in posts))
        self.assert_no_raw("secret q")

    def test_repeat_suppressed_then_counted(self):
        self.ok()
        line = "2026-11-10 08:01:00: [bot] TypeError: x\n"
        self.log(self.E, line, append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.log(self.E, line * 3, append=True)
        self.ok(now="2026-11-10T08:10:00+09:00")
        self.assertEqual(len(self.posts()), 1)  # 억제 창 안
        self.ok(now="2026-11-10T09:06:00+09:00")
        mine = [p for p in self.posts() if "TypeError" in p]
        self.assertEqual(len(mine), 2)
        self.assertIn("직전 게시 뒤 3회", mine[-1])

    def test_glob_empty_and_silence_per_role(self):
        (self.pm2 / "logs" / "pleiades-fit-mcp-out-0.log").unlink()
        self.ok()
        self.assertTrue(any("glob-empty:fit-mcp-out" in p for p in self.posts()))
        # 회귀: #587 — 기준 24시간. dry-run 판정에서 bot·mcp out 은 낮에도 6시간씩 조용했다
        self.ok(now="2026-11-10T15:00:00+09:00", config={"burstLimit": 20})
        self.assertNotIn("silent:", "\n".join(self.posts()))
        # 침묵: 24시간 — fit web·mcp 는 나고 · bot 역할은 끔(생존 표지가 본다 · #713) · fin web 은 기본 꺼짐 · fin mcp 는 72h(주말 · #713)
        self.ok(now="2026-11-11T08:05:00+09:00", config={"burstLimit": 20})
        text = "\n".join(self.posts())
        self.assertIn("silent:fit-mcp", text)
        for off in ("silent:fin-bot", "silent:fit-bot", "silent:fin-web", "silent:fin-mcp"):
            self.assertNotIn(off, text)
        self.ok(now="2026-11-13T08:00:00+09:00", config={"burstLimit": 20})
        self.assertNotIn("silent:fin-mcp", "\n".join(self.posts()))   # 정확히 72h — 아직
        self.ok(now="2026-11-13T08:10:00+09:00", config={"burstLimit": 20})
        self.assertIn("silent:fin-mcp", "\n".join(self.posts()))

    def test_known_stderr_kinds_and_deprecated_are_warnings(self):
        # 회귀: #587 — 세부 칸이 빈 web 줄(스캐너 Server Action · Recharts 크기)이 한 '실패' 지문으로 묶였다
        self.ok()
        fin_web = "pleiades-fin-web-error-0.log"
        fit_web = "pleiades-fit-web-error-0.log"
        self.log(fin_web, '2026-11-10 08:01:00: [Error: The Server Reference ID did not match the expected format. Received "x".\n'
                 '2026-11-10 08:01:01: Error: The Server Reference ID did not match the expected format. Received "y".\n'
                 "2026-11-10 08:01:02: [Error: 다른 원인 비밀메시지\n", append=True)
        self.log(fit_web, "2026-11-10 08:01:00: The width(-1) and height(-1) of chart should be greater than 0,\n", append=True)
        self.log(self.E, "2026-11-10 08:01:00: [Deprecated] historical() is deprecated\n", append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        posts = [p.replace("\\", "") for p in self.posts()]
        ref = [p for p in posts if "server-action-ref" in p]
        self.assertEqual(len(ref), 1)  # 두 줄(받은 값이 달라도) = 한 지문
        self.assertIn("🟡 경고 · fin·web · stderr · server-action-ref", ref[0])
        self.assertIn("2회", ref[0])
        self.assertTrue(any("🟡 경고 · fit·web · stderr · chart-size" in p for p in posts))
        self.assertTrue(any("🟡 경고 · fin·bot · stderr · Deprecated" in p for p in posts))
        # 표 밖은 그대로 실패 · 원문 없음
        self.assertTrue(any("🟠 실패 · fin·web · stderr · 지문" in p for p in posts))
        self.assert_no_raw("비밀메시지", "Received", "historical")


class StateAndLock(Base):
    def test_stale_lock_taken_over_and_reported(self):
        self.ops.mkdir(parents=True)
        lock = self.ops / "collect.lock"
        lock.mkdir()
        old = time.time() - 3600
        os.utime(lock, (old, old))
        self.ok()
        self.assertTrue(any("lock-stale" in p for p in self.posts()))
        self.assertFalse(lock.exists())

    def test_stale_lock_with_takeover_in_progress_refuses(self):
        # 회귀: #577 · PR #576 Codex P2 — 다른 실행이 넘겨받는 중(보조 잠금 신선)이면 지우지 않고 busy
        self.ops.mkdir(parents=True)
        lock = self.ops / "collect.lock"
        lock.mkdir()
        old = time.time() - 3600
        os.utime(lock, (old, old))
        (self.ops / "collect.lock.takeover").mkdir()
        r = self.run_c()
        self.assertEqual(r.returncode, 1)
        self.assertIn("이전 실행이 아직 돈다", r.stdout)
        self.assertEqual(lock.stat().st_mtime, old)
        self.assertTrue((self.ops / "collect.lock.takeover").exists())
        self.assertEqual(self.pm2_calls(), [])

    def test_stale_takeover_guard_cleared(self):
        self.ops.mkdir(parents=True)
        lock = self.ops / "collect.lock"
        guard = self.ops / "collect.lock.takeover"
        old = time.time() - 3600
        for d in (lock, guard):
            d.mkdir()
            os.utime(d, (old, old))
        self.ok()
        self.assertTrue(any("lock-stale" in p for p in self.posts()))
        self.assertFalse(lock.exists())
        self.assertFalse(guard.exists())

    def test_fresh_lock_refuses(self):
        self.ops.mkdir(parents=True)
        (self.ops / "collect.lock").mkdir()
        r = self.run_c()
        self.assertEqual(r.returncode, 1)
        self.assertIn("이전 실행이 아직 돈다", r.stdout)
        self.assertEqual(self.pm2_calls(), [])
        self.assertTrue((self.ops / "collect.lock").exists())

    def test_late_run_reported(self):
        self.ok()
        self.ok(now="2026-11-10T09:00:00+09:00")
        self.assertTrue(any("late" in p for p in self.posts()))

    def test_run_cap_defers_without_losing(self):
        self.stop_daemon()
        r = self.ok(config={"maxRunMs": 0, "lockStaleRuns": 1, "periodMin": 1})
        self.assertIn("기록 0 · 미룸 1", r.stdout)
        self.assertEqual(self.posts(), [])
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertEqual(len(self.posts()), 1)  # 다음 회에 첫 발생으로 나간다

    def test_daily_summary_once_kst_regardless_of_tz(self):
        self.stop_daemon()
        self.ok(config={"summaryAt": "09:05"})
        self.ok(now="2026-11-10T09:06:00+09:00", config={"summaryAt": "09:05"}, TZ="UTC")
        self.ok(now="2026-11-10T09:11:00+09:00", config={"summaryAt": "09:05"}, TZ="UTC")
        summaries = [p for p in self.posts() if "일일 요약" in p]
        self.assertEqual(len(summaries), 1)
        self.assertIn("열린 이상 1", summaries[0])
        self.assertTrue(summaries[0].startswith("11-10 09:06"))
        self.assertTrue(any(e["type"] == "summary" for e in self.events()))

    def test_events_are_summaries_only(self):
        self.stop_daemon()
        self.ok()
        ev = self.events()
        self.assertTrue(ev)
        for e in ev:
            self.assertEqual(set(e), {"at", "type", "fp", "app", "role", "src", "sev", "count"})

    def test_disk_thresholds(self):
        self.ok(config={"disk": {"warn": 0, "crit": 101}})
        text = "\n".join(self.posts()).replace("\\", "")
        self.assertIn("host·home · usage · >=0", text)
        self.assertIn("host·backup · usage", text)

    def test_disk_level_change_is_not_recovery(self):
        # 회귀: PR-1 9-1 major — 세부(임계 단계)만 바뀐 것을 복구로 알렸다
        self.ok(config={"disk": {"warn": 0, "crit": 101}})
        for i, m in enumerate(("05", "10", "15")):
            self.ok(now=f"2026-11-10T08:{m}:00+09:00", config={"disk": {"warn": 0, "crit": 1}})
        usage = [p for p in self.posts() if "host·home · usage" in p]
        self.assertTrue(any(">=1" in p for p in usage))
        self.assertFalse(any("🟢" in p for p in usage))

    def test_deferred_one_off_event_posted_next_run(self):
        # 회귀: PR-1 9-1 major — 한 회 상한에 걸린 일회성 로그 지문이 다시 관측되지 않으면 영영 안 나갔다
        self.ok()
        self.log("pleiades-fin-bot-error-0.log", "2026-11-10 08:01:00: [bot] OnceError\n", append=True)
        r = self.ok(now="2026-11-10T08:05:00+09:00", config={"maxRunMs": 0, "lockStaleRuns": 1, "periodMin": 1})
        self.assertIn("기록 0", r.stdout)
        self.ok(now="2026-11-10T08:10:00+09:00")
        self.assertEqual(len([p for p in self.posts() if "OnceError" in p]), 1)
        self.assertFalse(self.state()["fps"][[k for k, v in self.state()["fps"].items() if "OnceError" in v["material"]][0]]["deferred"])

    def test_merge_keeps_highest_severity(self):
        # PR #569 Codex P2 — 같은 지문의 경고·실패가 한 회에 오면 먼저 온 쪽 심각도를 썼다
        self.ok()
        self.log("pleiades-fin-bot-error-0.log", "2026-11-10 08:01:00: [bot] ⚠ TypeError warn\n2026-11-10 08:01:01: [bot] TypeError fail\n", append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        posts = [p for p in self.posts() if "TypeError" in p]
        self.assertEqual(len(posts), 1)
        self.assertIn("🟠 실패", posts[0])

    def test_deferred_counts_accumulate(self):
        # PR #569 Codex P2 — 첫 게시가 미뤄진 동안 다시 온 횟수가 덮였다
        self.ok()
        line = "2026-11-10 08:01:00: [bot] TypeError x\n"
        capped = {"maxRunMs": 0, "lockStaleRuns": 1, "periodMin": 1}
        self.log("pleiades-fin-bot-error-0.log", line * 3, append=True)
        self.ok(now="2026-11-10T08:05:00+09:00", config=capped)
        self.log("pleiades-fin-bot-error-0.log", line * 2, append=True)
        self.ok(now="2026-11-10T08:10:00+09:00")
        posts = [p for p in self.posts() if "TypeError" in p]
        self.assertEqual(len(posts), 1)
        self.assertIn("5회", posts[0])

    def test_unreadable_log_file_does_not_stop_run(self):
        # 회귀: PR-1 9-1 major — 읽지 못하는 파일 하나가 매 회 예외로 수집 전체를 멈췄다
        self.ok()
        p = self.log("pleiades-fin-bot-error-0.log", "2026-11-10 08:01:00: [bot] HiddenError\n", append=True)
        p.chmod(0)
        self.addCleanup(p.chmod, 0o644)
        self.stop_daemon()
        self.ok(now="2026-11-10T08:05:00+09:00")
        text = "\n".join(self.posts())
        self.assertIn("log-read:fin-bot-error", text)
        self.assertIn("daemon · none", text)  # 다른 수집은 그대로 돈다
        self.assertNotIn("HiddenError", text)

    def test_disk_unreadable(self):
        self.ok(OPS_DISK_BACKUP=str(self.tmp / "nope"))
        self.assertTrue(any("disk-read:backup" in p for p in self.posts()))


if __name__ == "__main__":
    unittest.main()


class Advisor(Base):
    """012 4b-3c(#704) — 통합 층 pleiades-adv-bot 감시. 활성 = inplace-adv-last-ok 있음 AND inplace-adv-stopped 없음."""

    ADV = "pleiades-adv-bot"
    E = "pleiades-adv-bot-error-9.log"

    def setUp(self):
        super().setUp()
        self.adv_dir = self.home / "pleiades-adv" / "apps" / "advisor"
        (self.adv_dir / "logs").mkdir(parents=True)
        self.private.mkdir(parents=True, exist_ok=True)

    def activate(self, on=True):
        (self.private / "inplace-adv-last-ok").write_text("v1.15.0\n")
        stopped = self.private / "inplace-adv-stopped"
        if on:
            stopped.unlink(missing_ok=True)
        else:
            stopped.write_text("x\n")

    def procs(self, adv=None, apps=True):
        p = {n: ("online", 0) for n in NAMES} if apps else {}
        if adv:
            p[self.ADV] = (adv, 0)
        self.set_procs(p)

    def text(self):
        return "\n".join(self.posts())

    def marker(self, at):
        p = self.adv_dir / "logs" / "alive-adv.json"
        p.write_text('{"at":"x","state":"ack"}')
        t = datetime.fromisoformat(at).timestamp()
        os.utime(p, (t, t))

    def test_never_deployed_is_not_judged_and_logs_untouched(self):
        self.log(self.E, "2026-11-10 07:59:00: [advisor] TypeError: x\n")
        self.ok()
        self.log(self.E, "2026-11-10 08:01:00: [advisor] RangeError: y\n", append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertNotIn("adv", self.text())
        self.assertNotIn(self.E, self.state()["files"])   # 활성 밖 앱은 오프셋도 남기지 않는다(R2-3)

    def test_active_missing_is_outage_online_is_quiet(self):
        self.activate()
        self.procs(adv="online")
        self.ok()
        self.assertEqual(self.posts(), [])
        self.procs(adv=None)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertIn("adv·bot · pm2 · missing", self.text())
        self.assertIn("🔴", self.text())

    def test_stopped_is_not_judged(self):
        self.activate(on=False)
        self.procs(adv=None)
        self.ok()
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertNotIn("adv", self.text())

    def test_all_missing_counts_only_domain_apps(self):
        # 정정 3 — adv 만 살아 있어도 fin·fit 6 개 부재는 all-missing 1 건
        self.activate()
        self.ok()
        self.procs(adv="online", apps=False)
        self.ok(now="2026-11-10T08:05:00+09:00")
        allm = [p for p in self.posts() if "all-missing" in p]
        self.assertEqual(len(allm), 1)

    def test_all_missing_not_raised_by_adv_absence_alone(self):
        self.activate()
        self.procs(adv="online")
        self.ok()
        self.procs(adv=None)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertFalse(any("all-missing" in p for p in self.posts()))

    def test_active_error_log_is_read(self):
        self.activate()
        self.procs(adv="online")
        self.log(self.E, "")
        self.ok()
        self.log(self.E, "2026-11-10 08:01:00: [advisor] TypeError: boom\n", append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertIn("adv·bot", self.text())
        self.assertIn("TypeError", self.text())

    def test_reactivation_starts_at_end(self):
        # r4 보충 2 — 정지 동안 쌓인 줄이 다시 켠 회에 한꺼번에 나오지 않는다
        self.activate(on=False)
        self.procs(adv=None)
        self.log(self.E, "")
        self.ok()
        self.log(self.E, "2026-11-10 08:01:00: [advisor] OldStoppedError\n", append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.activate()
        self.procs(adv="online")
        self.ok(now="2026-11-10T08:10:00+09:00")
        self.assertNotIn("OldStoppedError", self.text())
        self.log(self.E, "2026-11-10 08:12:00: [advisor] FreshAdvError\n", append=True)
        self.ok(now="2026-11-10T08:15:00+09:00")
        self.assertIn("FreshAdvError", self.text())
        self.assertNotIn("OldStoppedError", self.text())

    def test_stopped_with_log_file_present_keeps_domain_judgment(self):
        # R2-3 시험 — -stopped + adv 로그 파일이 있어도 예외 없이 fin·fit 판정 그대로
        self.activate(on=False)
        self.log(self.E, "2026-11-10 07:59:00: x\n")
        self.ok()
        procs = {n: ("online", 0) for n in NAMES}
        del procs["pleiades-fit-web"]
        self.set_procs(procs)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertIn("fit·web · pm2 · missing", self.text())
        self.assertNotIn("adv", self.text())

    def test_alive_marker_stale_when_active_only(self):
        self.activate()
        self.procs(adv="online")
        self.marker("2026-11-10T07:40:00+09:00")
        self.ok()
        self.assertIn("adv·bot · gateway · stale", self.text())
        before = len(self.posts())
        self.activate(on=False)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertFalse(any("adv" in p for p in self.posts()[before:]))

    def test_no_health_glob_or_silence_for_adv(self):
        self.activate()
        self.procs(adv="online")
        self.ok()
        self.ok(now="2026-11-12T08:05:00+09:00")   # 이틀 — 침묵이 있었다면 났다
        t = self.text()
        for bad in ("glob-empty:adv", "env-read:adv", "adv·mcp", "adv·web", "silent:adv"):
            self.assertNotIn(bad, t)

    def test_pending_marker_holds_adv(self):
        self.activate()
        self.procs(adv="online")
        self.ok()
        (self.private / "inplace-adv-pending").write_text("v1.15.1\n")
        os.utime(self.private / "inplace-adv-pending", (datetime.fromisoformat("2026-11-10T08:03:00+09:00").timestamp(),) * 2)
        self.procs(adv=None)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertNotIn("adv·bot · pm2", self.text())

    # 회귀: PR 9-1 major(#704) — 열린 adv 기록이 정지 뒤 영원히 열린 채 요약에 남았다
    def test_open_adv_records_close_quietly_when_stopped(self):
        self.activate()
        self.procs(adv="online")
        self.marker("2026-11-10T07:40:00+09:00")
        self.ok()
        self.procs(adv=None)
        self.ok(now="2026-11-10T08:05:00+09:00")
        opened = [e for e in self.state()["fps"].values() if e["app"] == "adv" and e["open"]]
        self.assertEqual(len(opened), 2)   # pm2 missing · gateway stale
        self.activate(on=False)
        before = len(self.posts())
        self.ok(now="2026-11-10T08:10:00+09:00")
        self.ok(now="2026-11-10T08:15:00+09:00")
        self.assertEqual([e for e in self.state()["fps"].values() if e["app"] == "adv" and (e["open"] or e["deferred"])], [])
        self.assertFalse(any("🟢" in p for p in self.posts()[before:]))   # 조용히 — 복구 게시 없음
        # 요약의 열린 이상에 adv 가 없다
        self.ok(now="2026-11-10T09:10:00+09:00", config={"summaryAt": "09:05"})
        summ = [p for p in self.posts() if "일일 요약" in p]
        self.assertTrue(summ)
        self.assertIn("열린 이상 0", summ[-1])
        # 다시 켜도 옛 이상의 복구가 뒤늦게 나가지 않는다
        self.activate()
        self.procs(adv="online")
        self.marker("2026-11-10T09:14:30+09:00")
        self.ok(now="2026-11-10T09:15:00+09:00")
        self.ok(now="2026-11-10T09:20:00+09:00")
        self.assertFalse(any("🟢" in p and "adv" in p for p in self.posts()))

    # 회귀: PR #705 Codex P2 — 수집기 자신의 adv 기록(app = ops)도 정지 때 닫는다
    def test_collector_adv_records_close_when_stopped(self):
        self.activate()
        self.procs(adv="online")
        self.ok()
        t = datetime.fromisoformat("2026-11-10T07:30:00+09:00").timestamp()   # 보류 상한(20분) 넘김
        for a in ("adv", "fin"):
            pend = self.private / f"inplace-{a}-pending"
            pend.write_text("v1.15.1\n")
            os.utime(pend, (t, t))
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertIn("deploy-stale:adv", self.text())
        self.assertIn("deploy-stale:fin", self.text())
        (self.private / "inplace-adv-pending").unlink()
        self.activate(on=False)
        self.ok(now="2026-11-10T08:10:00+09:00")
        opened = {e["src"] for e in self.state()["fps"].values() if e["kind"] == "state" and (e["open"] or e["deferred"])}
        self.assertNotIn("deploy-stale:adv", opened)
        self.assertIn("deploy-stale:fin", opened)   # 두 앱 쪽 수집기 기록은 그대로

    def test_adv_out_log_is_not_read(self):
        self.activate()
        self.procs(adv="online")
        self.log("pleiades-adv-bot-out-9.log", "")
        self.ok()
        self.log("pleiades-adv-bot-out-9.log", '2026-11-10 08:01:00: [advisor] key=abc status=answer TypeError\n', append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertNotIn("adv", self.text())


class Hermes(Base):
    """014 H-3(#802) — hermes pleiades-hrm-api 감시. 활성 = inplace-hrm-last-ok 있음 AND inplace-hrm-stopped 없음 · 상태 파일 판정."""

    HRM = "pleiades-hrm-api"
    E = "pleiades-hrm-api-error-3.log"

    def setUp(self):
        super().setUp()
        self.state_file = self.home / "pleiades-hermes-data" / "state" / "state.json"
        self.state_file.parent.mkdir(parents=True)
        self.private.mkdir(parents=True, exist_ok=True)

    def activate(self, on=True):
        (self.private / "inplace-hrm-last-ok").write_text("v1.20.0\n")
        stopped = self.private / "inplace-hrm-stopped"
        if on:
            stopped.unlink(missing_ok=True)
        else:
            stopped.write_text("x\n")

    def procs(self, hrm="online", apps=True):
        p = {n: ("online", 0) for n in NAMES} if apps else {}
        if hrm:
            p[self.HRM] = (hrm, 0)
        self.set_procs(p)

    def hstate(self, at="2026-11-10T07:59:50+09:00", **over):
        st = {"updatedAt": datetime.fromisoformat(at).astimezone().isoformat(), "queued": 0, "oldestQueuedAt": None, "dead": 0,
              "deadToday": 0, "blockedToday": 0, "linkDroppedToday": 0, "lastSentAt": None, "webhook": True, "paused": None,
              "registrySources": 1, "registryError": False, "expiringSoon": [], **over}
        self.state_file.write_text(json.dumps(st))

    def text(self):
        return "\n".join(self.posts())

    def test_never_deployed_is_not_judged(self):
        self.procs(hrm=None)
        self.log(self.E, "2026-11-10 07:59:00: [hermes] 대기열 쓰기 실패 source=x: Error\n")
        self.ok()
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertNotIn("hrm", self.text())
        self.assertNotIn(self.E, self.state()["files"])

    def test_healthy_is_quiet(self):
        self.activate()
        self.procs()
        self.hstate()
        self.ok()
        self.hstate(at="2026-11-10T08:04:55+09:00")
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertEqual(self.posts(), [])

    def test_missing_process_is_outage(self):
        self.activate()
        self.procs()
        self.hstate()
        self.ok()
        self.procs(hrm=None)
        self.hstate(at="2026-11-10T08:04:55+09:00")
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertIn("hrm·api · pm2 · missing", self.text())

    def test_hrm_absence_alone_is_not_all_missing(self):
        self.activate()
        self.procs(hrm=None)
        self.hstate()
        self.ok()
        self.assertFalse(any("all-missing" in p for p in self.posts()))

    def test_no_alive_marker_judgment_for_hrm(self):
        # hermes 는 gateway 봇이 아니다 — alive-hrm.json 이 없어도 · 오래돼도 gateway 판정이 없다
        self.activate()
        self.procs()
        self.hstate()
        self.ok()
        self.ok(now="2026-11-10T09:00:00+09:00", config={"hrmStaleMin": 600})
        t = self.text()
        self.assertNotIn("gateway", t)
        self.assertNotIn("alive-read:hrm", t)

    def test_state_stale_is_outage_and_recovers(self):
        self.activate()
        self.procs()
        self.hstate(at="2026-11-10T07:50:00+09:00")   # 10분 전 — 5분 넘게 멈췄다
        self.ok()
        self.assertIn("hrm·api · state · stale", self.text())
        self.assertIn("🔴", self.text())
        self.hstate(at="2026-11-10T08:04:55+09:00")
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.hstate(at="2026-11-10T08:09:55+09:00")
        self.ok(now="2026-11-10T08:10:00+09:00")
        self.assertIn("🟢", self.text())

    def test_state_unreadable_is_collector_warning(self):
        self.activate()
        self.procs()
        self.state_file.write_text("{")
        self.ok()
        self.assertIn("hrm-state-read", self.text())

    def test_webhook_none_secrets_registry_backlog(self):
        self.activate()
        self.procs()
        self.hstate(webhook=False, paused="webhook", registryError=True, queued=3,
                    oldestQueuedAt=datetime.fromisoformat("2026-11-10T07:20:00+09:00").astimezone().isoformat())
        self.ok()
        t = self.text()
        self.assertIn("hrm·api · webhook · none", t)
        self.assertIn("hrm·api · registry · error", t)
        self.assertIn("hrm·api · queue · backlog", t)
        self.hstate(at="2026-11-10T08:04:55+09:00", paused="secrets")
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertIn("hrm·api · webhook · secrets", self.text())

    def test_short_queue_is_not_backlog(self):
        self.activate()
        self.procs()
        self.hstate(queued=2, oldestQueuedAt=datetime.fromisoformat("2026-11-10T07:55:00+09:00").astimezone().isoformat())
        self.ok()
        self.assertNotIn("backlog", self.text())

    def test_dead_blocked_link_dropped_increase_are_events(self):
        self.activate()
        self.procs()
        self.hstate(dead=1, blockedToday=2, linkDroppedToday=0)
        self.ok()
        self.assertEqual(self.posts(), [])   # 첫 회는 기준값만
        self.hstate(at="2026-11-10T08:04:55+09:00", dead=3, blockedToday=3, linkDroppedToday=1)
        self.ok(now="2026-11-10T08:05:00+09:00")
        t = self.text()
        self.assertIn("hrm·api · dead", t)
        self.assertIn("hrm·api · blocked", t)
        self.assertIn("hrm·api · link-dropped", t)
        ev = [e for e in self.events() if e.get("type") == "obs" and e.get("app") == "hrm"]
        self.assertEqual({e["src"]: e["count"] for e in ev}, {"dead": 2, "blocked": 1, "link-dropped": 1})

    def test_today_counters_reset_on_new_day(self):
        self.activate()
        self.procs()
        self.hstate(blockedToday=5)
        self.ok()
        # 다음 날 — 오늘 수치 1 은 어제의 5 와 견주지 않는다(새 날 기준 0 → 1 증가)
        self.hstate(at="2026-11-11T08:04:55+09:00", blockedToday=1)
        self.ok(now="2026-11-11T08:05:00+09:00")
        ev = [e for e in self.events() if e.get("type") == "obs" and e.get("src") == "blocked"]
        self.assertEqual([e["count"] for e in ev], [1])

    def test_expiry_soon_is_warning_with_id_only(self):
        self.activate()
        self.procs()
        self.hstate(expiringSoon=["orders", "bad id!"])
        self.ok()
        t = self.text()
        self.assertIn("hrm·api · expiry · orders", t)
        self.assertNotIn("bad id", t)   # 허용 문자 밖 값은 칸에 오지 않는다

    def test_held_during_deploy(self):
        self.activate()
        self.procs(hrm=None)
        (self.private / "inplace-hrm-pending").write_text("v1.20.1\n")
        self.hstate(at="2026-11-10T07:40:00+09:00")
        self.ok()
        self.assertNotIn("hrm", self.text())

    def test_stopped_is_not_judged_and_reactivation_resets_baseline(self):
        self.activate()
        self.procs()
        self.hstate(dead=0)
        self.ok()
        self.activate(on=False)
        self.procs(hrm=None)
        self.hstate(at="2026-11-10T07:40:00+09:00", dead=5)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertNotIn("hrm", self.text())
        self.activate()
        self.procs()
        self.hstate(at="2026-11-10T08:09:55+09:00", dead=7)
        self.ok(now="2026-11-10T08:10:00+09:00")
        self.assertNotIn("hrm·api · dead", self.text())   # 정지 동안의 변화를 한꺼번에 내지 않는다

    def test_error_log_is_read_and_state_transition_lines_are_warnings(self):
        self.activate()
        self.procs()
        self.hstate()
        self.log(self.E, "")
        self.ok()
        self.log(self.E, "2026-11-10 08:01:00: [hermes] 대기열 쓰기 실패 source=orders: SqliteError\n"
                         "2026-11-10 08:02:00: [hermes] 게시 멈춤 — 웹훅 없음 · 형식 오류\n", append=True)
        self.hstate(at="2026-11-10T08:04:55+09:00")
        self.ok(now="2026-11-10T08:05:00+09:00")
        t = self.text()
        self.assertIn("hrm·api · stderr · hermes", t)
        self.assertIn("🟠", t)
        self.assertIn("hermes-paused", t)
        paused = [p for p in self.posts() if "hermes-paused" in p]
        self.assertTrue(all("🟡" in p for p in paused))


class Quiet2a(Base):
    """008 PR-2a(#713) — #622 재판정 보정: 스캐너·인증 탐색 분류 · 스택 연속 덩어리 · 경고는 일일 요약에만."""

    W = "pleiades-fin-web-error-0.log"
    E = "pleiades-fin-bot-error-0.log"

    def test_failed_to_find_server_action_is_scanner(self):
        self.ok()
        self.log(self.W, '2026-11-10 08:01:00: Error: Failed to find Server Action "abc". This request might be from an older or newer deployment.\n'
                 "Read more: https://nextjs.org/docs/messages/failed-to-find-server-action\n", append=True)   # 실측 SA+O — 뒷줄은 시각 없는 연속 줄
        self.ok(now="2026-11-10T08:05:00+09:00")
        posts = self.posts()
        self.assertTrue(any("🟡 경고 · fin·web · stderr · server-action-ref" in p for p in posts), posts)
        self.assertFalse(any("🟠" in p for p in posts), posts)

    def test_authjs_unknown_action_with_ansi_and_split_stack(self):
        # 08:11 실측 모양 — 색 코드로 시작하는 첫 줄 1 덩어리 + 같은 초 스택 10 줄 덩어리(pm2 가 따로 시각을 붙였다)
        self.ok()
        head = "2026-11-10 08:01:17: \x1b[31m[auth][error]\x1b[0m UnknownAction: Unsupported action. Read more at https://errors.authjs.dev#unknownaction\n"
        stack = "2026-11-10 08:01:17:     at a (/srv/x/node_modules/@auth/core/x.js:1:2)\n" + "".join(f"    at f{i} (/srv/x/.next/server/app/api/auth/[...nextauth]/route.js:{i}:1)\n" for i in range(9))
        self.log(self.W, head + stack + head.replace("08:01:17", "08:01:19") + stack.replace("08:01:17", "08:01:19"), append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        posts = self.posts()
        mine = [p for p in posts if "auth-unknown-action" in p]
        self.assertEqual(len(mine), 1, posts)
        self.assertIn("🟡 경고 · fin·web · stderr · auth-unknown-action", mine[0])
        self.assertIn("2회", mine[0])
        self.assertFalse(any("🟠" in p for p in posts), posts)   # 스택 덩어리가 따로 실패로 나오지 않는다
        self.assert_no_raw("errors.authjs.dev")

    def test_stack_chunk_at_other_second_still_counts(self):
        self.ok()
        self.log(self.W, "2026-11-10 08:01:00: [x] TypeError: boom\n2026-11-10 08:01:05:     at y (/srv/x/a.js:1:1)\n", append=True)
        self.ok(now="2026-11-10T08:05:00+09:00")
        self.assertEqual(sum("🟠" in p for p in self.posts()), 2)

    def test_warnings_go_to_daily_summary_only(self):
        q = {"quietWarnings": True}
        self.ok(config=q)
        self.log(self.E, "2026-11-10 08:01:00: [Deprecated] historical() is deprecated\n", append=True)
        self.log(self.E, "2026-11-10 08:02:00: [bot] TypeError: real\n", append=True)
        self.ok(now="2026-11-10T08:05:00+09:00", config=q)
        posts = self.posts()
        self.assertFalse(any("🟡" in p for p in posts), posts)
        self.assertTrue(any("🟠 실패 · fin·bot" in p for p in posts), posts)
        quiet = [e for e in self.events() if e.get("quiet")]
        self.assertEqual(len(quiet), 1)
        self.assertEqual(quiet[0]["sev"], "경고")
        # 같은 지문 반복도 조용히 · 미뤄진 채로 남지 않는다
        self.log(self.E, "2026-11-10 09:30:00: [Deprecated] again\n", append=True)
        self.ok(now="2026-11-10T09:35:00+09:00", config=q)
        self.assertFalse(any("🟡" in p for p in self.posts()))
        self.assertFalse(any(e["deferred"] for e in self.state()["fps"].values()))
        # 다음 날 요약에 경고 개수
        self.ok(now="2026-11-11T09:10:00+09:00", config={**q, "summaryAt": "09:05"})
        summ = [p for p in self.posts() if "일일 요약" in p]
        self.assertEqual(len(summ), 1)
        self.assertRegex(summ[0], r"경고 어제 [1-9]\d*종 [2-9]\d*회")   # Deprecated 2회 + 수집기 late 등
        self.assertIn("fin·bot·stderr e682dc78fef1 ×2", summ[0])   # 운영 Deprecated 지문과 같은 값

    def test_quiet_warnings_do_not_count_toward_burst(self):
        q = {"quietWarnings": True, "burstLimit": 2}
        self.ok(config=q)
        lines = "".join(f"2026-11-10 08:01:0{i}: [w{i}] Warning: thing{i}\n" for i in range(5))
        lines += "2026-11-10 08:02:00: [bot] TypeError: one\n"
        self.log(self.E, lines, append=True)
        self.ok(now="2026-11-10T08:05:00+09:00", config=q)
        posts = self.posts()
        self.assertFalse(any("새 지문" in p for p in posts), posts)
        self.assertTrue(any("TypeError" in p for p in posts), posts)

    def test_quiet_state_warning_open_and_recover_silently(self):
        q = {"quietWarnings": True, "recoverRuns": 1}
        self.ok(config=q)
        (self.pm2 / "logs" / "pleiades-fit-mcp-out-0.log").unlink()
        self.ok(now="2026-11-10T08:05:00+09:00", config=q)
        self.assertFalse(any("glob-empty" in p for p in self.posts()))
        self.log("pleiades-fit-mcp-out-0.log", "")
        self.ok(now="2026-11-10T08:10:00+09:00", config=q)
        self.assertFalse(any("🟢" in p for p in self.posts()))
        self.assertFalse(any(e["open"] for e in self.state()["fps"].values() if "glob-empty" in e["src"]))


class QuietSeverity(Base):
    """PR-2a 9-1 major(#713) — 지문 재료에 심각도가 없다: 조용히 처리한 지문에 더 높은 심각도가 오면 늦거나 묻혔다."""

    E = "pleiades-fin-bot-error-0.log"
    Q = {"quietWarnings": True}

    def test_failure_after_quiet_warning_is_posted_at_once(self):
        # 태그 없는 Warning 줄과 Error 줄은 세부가 같아 한 지문이다(#569)
        self.ok(config=self.Q)
        self.log(self.E, "2026-11-10 08:01:00: (node:1) Warning: thing\n", append=True)
        self.ok(now="2026-11-10T08:05:00+09:00", config=self.Q)
        self.assertEqual(self.posts(), [])
        self.log(self.E, "2026-11-10 08:06:00: (node:1) Error: real failure\n", append=True)
        self.ok(now="2026-11-10T08:10:00+09:00", config=self.Q)
        posts = self.posts()
        self.assertEqual(len(posts), 1, posts)
        self.assertIn("🟠 실패", posts[0])
        self.assertNotIn("직전 게시 뒤", posts[0])

    def test_pending_failures_not_swallowed_by_a_later_warning(self):
        self.ok(config=self.Q)
        self.log(self.E, "2026-11-10 08:01:00: (node:1) Error: one\n", append=True)
        self.ok(now="2026-11-10T08:05:00+09:00", config=self.Q)
        self.log(self.E, "2026-11-10 08:06:00: (node:1) Error: two\n", append=True)
        self.ok(now="2026-11-10T08:10:00+09:00", config=self.Q)
        # 반복 시점(60분 뒤) 직전 회의 관측은 경고
        self.log(self.E, "2026-11-10 09:06:00: (node:1) Warning: three\n", append=True)
        self.ok(now="2026-11-10T09:10:00+09:00", config=self.Q)
        rep = [p for p in self.posts() if "직전 게시 뒤" in p]
        self.assertEqual(len(rep), 1, self.posts())
        self.assertIn("🟠 실패", rep[0])
        self.assertEqual([e["sev"] for e in self.events() if e["type"] == "repeat"], ["실패"])  # 기록도 본문과 같은 심각도(#731)

    # 회귀: PR #714 Codex P2 — 폭주로 나간 지문의 조용함 표지가 지워지지 않아 5분마다 폭주가 다시 나갔다
    def test_burst_escalation_clears_quiet_state(self):
        q = {**self.Q, "burstLimit": 2}
        self.ok(config=q)
        tags = ["a", "b", "c"]
        self.log(self.E, "".join(f"2026-11-10 08:01:0{i}: [{t}] Warning: w\n" for i, t in enumerate(tags)), append=True)
        self.ok(now="2026-11-10T08:05:00+09:00", config=q)
        self.assertEqual(self.posts(), [])
        self.log(self.E, "".join(f"2026-11-10 08:06:0{i}: [{t}] Warning: x\n" for i, t in enumerate(tags)).replace("Warning: x", "Error: x"), append=True)
        self.ok(now="2026-11-10T08:10:00+09:00", config=q)
        self.assertEqual(sum("새 지문" in p for p in self.posts()), 1, self.posts())
        self.log(self.E, "".join(f"2026-11-10 08:11:0{i}: [{t}] Error: y\n" for i, t in enumerate(tags)), append=True)
        self.ok(now="2026-11-10T08:15:00+09:00", config=q)
        self.assertEqual(sum("새 지문" in p for p in self.posts()), 1, self.posts())   # 반복 간격 안 — 다시 폭주하지 않는다

    # 회귀: PR #714 Codex P2 — 요약의 경고 개수를 지금 심각도로 셌다
    def test_daily_warning_count_is_per_observation_severity(self):
        self.ok(config=self.Q)
        self.log(self.E, "2026-11-10 08:01:00: (node:1) Warning: w1\n2026-11-10 08:01:01: (node:1) Warning: w2\n", append=True)
        self.ok(now="2026-11-10T08:05:00+09:00", config=self.Q)
        self.log(self.E, "2026-11-10 08:06:00: (node:1) Error: e1\n", append=True)
        self.ok(now="2026-11-10T08:10:00+09:00", config=self.Q)   # 같은 지문 · 지금 심각도 = 실패
        self.ok(now="2026-11-11T09:10:00+09:00", config={**self.Q, "summaryAt": "09:05"})
        summ = [p for p in self.posts() if "일일 요약" in p][-1]
        mine = [e for e in self.state()["fps"].values() if e["app"] == "fin" and e["role"] == "bot"]
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]["warnDays"]["2026-11-10"], 2)   # 경고 관측만
        self.assertEqual(mine[0]["days"]["2026-11-10"], 3)

    def test_silence_is_summary_only_in_quiet_mode(self):
        # 사용자 결정(2026-11-16) — 침묵도 경고라 요약에만 · 열린 이상에는 남는다
        self.ok(config=self.Q)
        self.ok(now="2026-11-11T08:05:00+09:00", config=self.Q)
        self.assertFalse(any("silent:" in p for p in self.posts()))
        self.assertTrue(any(e["open"] and e["src"].startswith("silent:") for e in self.state()["fps"].values()))
        self.ok(now="2026-11-11T09:10:00+09:00", config={**self.Q, "summaryAt": "09:05"})
        summ = [p for p in self.posts() if "일일 요약" in p]
        self.assertTrue(summ and "silent:fit-mcp" in summ[-1], summ)

    def test_production_default_is_quiet(self):
        self.ok(prod_defaults=True)
        self.log(self.E, "2026-11-10 08:01:00: [Deprecated] historical()\n", append=True)
        r = self.ok(now="2026-11-10T08:05:00+09:00", prod_defaults=True)
        self.assertEqual(self.posts(), [])
        self.assertIn("요약만 1", r.stdout)


def expand(parts):
    return "".join(p if isinstance(p, str) else p[0] * p[1] for p in parts)


VECTORS = json.loads((HERE.parent / "tools" / "ops" / "token_vectors.json").read_text())
HOOK = "https://discord.com/api/" + "webhooks/1/" + "HOOKSECRETabcdef"  # 시험용 가짜 주소
ERR_LINE = "2026-11-10 07:59:00: [bot] TypeError: x\n"


class Post(Base):
    """게시 판(PR-2b · #725) — 웹훅 · 게시 전 검사 ①~③ · 차단 고정 문구 · 실패 = 미룸 · 시험 게시."""

    def setUp(self):
        super().setUp()
        self.platform = self.tmp / "platform.env"
        self.platform.write_text(f'DISCORD_WEBHOOK_OPS="{HOOK}"\nDISCORD_CHANNEL_ID_FINANCE=123456789012345678\n')
        self.E = "pleiades-fin-bot-error-0.log"
        self.ok(now="2026-11-10T07:55:00+09:00")  # 상태 없는 첫 회는 로그 끝에서 시작한다 — 먼저 한 번(dry-run · 외부 0)

    def live(self, *extra, status="204", **kw):
        env = {"PLEIADES_ENV_FILE": str(self.platform), "NODE_OPTIONS": f"--require={self.fetch_stub()}", "STUB_FETCH_STATUS": status}
        env.update(kw.pop("env", {}))
        return self.run_c(f"--pm2-bin={self.bin}", *extra, **env, **kw)

    def sent(self):
        return [f["body"]["content"] for f in self.fetches()]

    def posted_log(self):
        p = self.ops / "posted.log"
        return p.read_text().splitlines() if p.exists() else []

    def test_posts_first_once_with_mentions_off(self):
        self.log(self.E, ERR_LINE, append=True)
        r = self.live()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("기록 1 · 미룸 0 · 요약만 0 · 차단 0 (게시)", r.stdout)
        calls = self.fetches()
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["url"], HOOK + "?wait=true")  # 회귀: PR #726 Codex P2 — 저장 확인 뒤에만 commit
        self.assertEqual(calls[0]["body"]["allowed_mentions"], {"parse": []})
        self.assertIn("TypeError", calls[0]["body"]["content"])
        self.assertEqual(len(self.posted_log()), 1)
        self.assertFalse((self.ops / "dry-run.log").exists())
        self.live(now="2026-11-10T08:05:00+09:00")  # 같은 지문 · 새 줄 없음 → 다시 보내지 않는다
        self.assertEqual(len(self.fetches()), 1)
        self.assert_no_raw(HOOK, "HOOKSECRET")

    def test_dry_run_never_fetches_even_with_webhook(self):
        self.log(self.E, ERR_LINE, append=True)
        self.run_c("--dry-run", f"--pm2-bin={self.bin}", PLEIADES_ENV_FILE=str(self.platform), NODE_OPTIONS=f"--require={self.fetch_stub()}")
        self.assertEqual(self.fetches(), [])
        self.assertEqual(len(self.posts()), 1)

    def test_missing_webhook_defers_then_posts_when_set(self):
        self.platform.write_text("DISCORD_WEBHOOK_DEPLOY=x\n")  # 폴백 없음 — DEPLOY 로 보내지 않는다
        self.log(self.E, ERR_LINE, append=True)
        r = self.live()
        self.assertIn("웹훅 없음", r.stdout)
        self.assertEqual(self.fetches(), [])
        self.platform.write_text(f'DISCORD_WEBHOOK_OPS="{HOOK}"\n')
        r = self.live(now="2026-11-10T08:05:00+09:00")
        self.assertIn("기록 1", r.stdout)
        self.assertEqual(len(self.sent()), 1)
        self.assertIn("TypeError", self.sent()[0])

    def test_http_failure_defers_and_stops_run_then_retries(self):
        # 회귀 대상: 429·장애에 연달아 두드리지 않는다 — 첫 실패 뒤 남은 것은 이번 회에 보내지 않는다
        self.log(self.E, "2026-11-10 07:59:00: [a] TypeError: x\n2026-11-10 07:59:01: [b] RangeError: y\n", append=True)
        r = self.live(status="429")
        self.assertIn("기록 0 · 미룸 2", r.stdout)
        self.assertIn("게시 실패 HTTP 429", r.stdout)
        self.assertEqual(len(self.fetches()), 1)
        self.assertNotIn("HOOKSECRET", r.stdout + r.stderr)
        r = self.live(now="2026-11-10T08:05:00+09:00", status="429,204")
        self.assertIn("기록 2 · 미룸 0", r.stdout)

    def test_network_error_prints_name_only(self):
        self.log(self.E, ERR_LINE, append=True)
        r = self.live(status="0")
        self.assertIn("게시 실패 TypeError", r.stdout)
        self.assertNotIn("HOOKSECRET", r.stdout + r.stderr)
        self.assert_no_raw(HOOK, "HOOKSECRET")

    def test_secret_match_blocked_even_when_escape_splits_value(self):
        # md() 가 '-' 앞에 \\ 를 넣어 값이 본문에서 끊긴다 — 벗긴 본문으로도 대조해야 잡힌다
        env_file = self.home / "pleiades-fin" / "apps" / "finance" / ".env"
        env_file.write_text(env_file.read_text() + 'AUTH_SECRET="my-secret-tag"\n')
        self.log(self.E, "2026-11-10 07:59:00: [my-secret-tag] TypeError: x\n", append=True)
        r = self.live()
        self.assertIn("차단 1", r.stdout)
        [text] = self.sent()
        self.assertRegex(text, r"^\[ops\] 게시 차단 · 지문 [0-9a-f]{12} · 사유 secret-match$")
        self.assertTrue(any(e.get("blocked") == "secret-match" for e in self.events()))
        # 보낸 것과 posted.log 에 그 값이 없다(state.json 의 지문 재료는 PR-1 그대로 · 비공개 600)
        for t in [*self.sent(), *self.posted_log()]:
            self.assertNotIn("my-secret", t)
            self.assertNotIn("my\\-secret", t)  # escape 된 형태

    def test_short_and_non_secret_values_not_matched(self):
        # P-10 8자 미만 · 비밀 아닌 키(채널 ID · PORT)는 대조하지 않는다 — 거짓 차단
        env_file = self.home / "pleiades-fin" / "apps" / "finance" / ".env"
        env_file.write_text(env_file.read_text() + 'AUTH_PIN="bot"\nBASE_URL="TypeError"\n')
        self.log(self.E, ERR_LINE, append=True)
        r = self.live()
        self.assertIn("차단 0", r.stdout)
        self.assertIn("TypeError", self.sent()[0])

    def test_secret_load_failure_fail_closed_with_notice(self):
        (self.home / "pleiades-fit" / "apps" / "fitness" / ".env").unlink()
        self.log(self.E, ERR_LINE, append=True)
        r = self.live()
        self.assertIn("기록 0 · 미룸 2", r.stdout)  # 그 줄 + fit env-read
        self.assertIn("비밀 읽기 실패", r.stdout)
        self.assertEqual(self.sent(), ["[ops] 게시 보류 · 사유 secret-load · 미룸 2"])
        self.live(now="2026-11-10T08:05:00+09:00")  # P-1 안 — 알림을 되풀이하지 않는다
        self.assertEqual(len(self.sent()), 1)
        self.live(now="2026-11-10T09:01:00+09:00")
        self.assertEqual(len(self.sent()), 2)

    def test_quiet_warnings_still_not_posted(self):
        self.log(self.E, "2026-11-10 07:59:00: [Deprecated] historical()\n", append=True)
        r = self.live(prod_defaults=True)
        self.assertIn("요약만 1", r.stdout)
        self.assertEqual(self.fetches(), [])

    def test_shared_token_vectors_and_length(self):
        texts = [expand(v) for v in VECTORS["token"]] + [expand(v) for v in VECTORS["clean"]] + ["x" * 2001, "x" * 2000]
        r = subprocess.run([NODE, str(SCRIPT)], input=json.dumps(texts), capture_output=True, text=True,
                           env={"PATH": "/usr/bin:/bin", "PLEIADES_TEST": "1", "OPS_SELFCHECK": "1", "HOME": str(self.home)}, timeout=30)
        self.assertEqual(r.returncode, 0, r.stderr)
        got = json.loads(r.stdout)
        n = len(VECTORS["token"])
        self.assertEqual(got[:n], ["token"] * n)
        self.assertEqual(got[n:-2], [None] * len(VECTORS["clean"]))
        self.assertEqual(got[-2:], ["length", None])

    def test_secret_keys_cover_template_secrets(self):
        # ① 대조 키 = 서버 템플릿 키 중 비밀인 것 — 템플릿에 비밀 키를 더하면 이 목록을 함께 본다(#725)
        import re
        src = SCRIPT.read_text()
        pat = re.compile(re.search(r"const SECRET_KEY = /(.+?)/ ", src).group(1))
        root = HERE.parent
        keys = set()
        for f in (root / "deploy/env/finance.env.template", root / "deploy/env/fitness.env.template", root / ".env.example"):
            keys |= {m.group(1) for m in re.finditer(r"^#? ?([A-Z][A-Z0-9_]+)=", f.read_text(), re.M)}
        self.assertEqual(sorted(k for k in keys if pat.search(k)), sorted([
            "AUTH_PIN", "AUTH_SECRET", "DATABASE_URL", "DISCORD_BOT_TOKEN_FINANCE", "DISCORD_BOT_TOKEN_FITNESS",
            "DISCORD_WEBHOOK_ADMIN", "DISCORD_WEBHOOK_DEPLOY", "DISCORD_WEBHOOK_FINANCE", "DISCORD_WEBHOOK_FITNESS",
            "DISCORD_WEBHOOK_HERMES",  # #796 — 플랫폼 설정 템플릿(.env.example)의 hermes 웹훅
            "GARMIN_EMAIL", "GARMIN_PASSWORD", "MFDS_API_KEY", "OMRON_APP_KEY", "OMRON_EMAIL", "OMRON_PASSWORD",
            "OPENDART_API_KEY", "WHOOING_WEBHOOK_URL"]))
        self.assertTrue(pat.search("DISCORD_WEBHOOK_OPS"))

    def test_test_alert(self):
        before = (len(self.pm2_calls()), (self.ops / "state.json").read_text())
        env = {"PLEIADES_ENV_FILE": str(self.platform), "NODE_OPTIONS": f"--require={self.fetch_stub()}"}
        r = self.run_c("--test-alert", **env)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("시험 게시 통과", r.stdout)
        [text] = self.sent()
        self.assertIn("시험", text)
        self.assertEqual((len(self.pm2_calls()), (self.ops / "state.json").read_text()), before)  # 수집하지 않는다 · 상태 무변경
        r = self.run_c("--test-alert", **env, STUB_FETCH_STATUS="401")
        self.assertEqual(r.returncode, 1)
        self.assertIn("게시 실패 HTTP 401", r.stdout)
        self.platform.write_text("X=1\n")
        r = self.run_c("--test-alert", **env)
        self.assertEqual(r.returncode, 1)
        self.assertIn("웹훅 없음", r.stdout)
        self.platform.write_text(f'DISCORD_WEBHOOK_OPS="{HOOK}"\n')
        (self.home / "pleiades-fin" / "apps" / "finance" / ".env").unlink()
        r = self.run_c("--test-alert", **env)
        self.assertEqual(r.returncode, 1)
        self.assertIn("비밀 읽기 실패", r.stdout)
        self.assertEqual(len(self.fetches()), 2)  # 웹훅 없음 · 비밀 실패는 보내지 않는다

    # 회귀: PR-2b 9-1 major — dotenv 를 못 찾으면 "웹훅 없음" 이 아니라 그 사유를 낸다
    def test_dotenv_missing_is_not_reported_as_missing_webhook(self):
        self.log(self.E, ERR_LINE, append=True)
        for d in APPS.values():
            (self.home / f"pleiades-{'fin' if d == 'finance' else 'fit'}" / "apps" / d / "node_modules" / "dotenv").unlink()
        r = self.live()
        self.assertIn("dotenv 없음 (게시)", r.stdout)
        self.assertNotIn("웹훅 없음", r.stdout)
        self.assertEqual(self.fetches(), [])
        r = self.run_c("--test-alert", PLEIADES_ENV_FILE=str(self.platform), NODE_OPTIONS=f"--require={self.fetch_stub()}")
        self.assertEqual(r.returncode, 1)
        self.assertIn("dotenv 없음", r.stdout)

    def test_non_https_webhook_never_fetched(self):
        self.platform.write_text('DISCORD_WEBHOOK_OPS="http://example.com/hook"\n')
        self.log(self.E, ERR_LINE, append=True)
        r = self.live()
        self.assertIn("웹훅 형식 오류", r.stdout)
        self.assertEqual(self.fetches(), [])

    def test_body_rejected_400_becomes_fixed_phrase_and_commits(self):
        # 본문 때문에 거절된 글이 매 회 맨 앞에서 막지 않게(9-1 info) — 고정 문구로 한 번 · commit
        self.log(self.E, ERR_LINE, append=True)
        r = self.live(status="400,204")
        self.assertIn("기록 1 · 미룸 0 · 요약만 0 · 차단 1", r.stdout)
        self.assertRegex(self.sent()[1], r"^\[ops\] 게시 차단 · 지문 [0-9a-f]{12} · 사유 rejected$")
        self.live(now="2026-11-10T08:05:00+09:00")
        self.assertEqual(len(self.fetches()), 2)

    # 회귀: PR #730 Codex P2(#731) — 미뤄진 첫 발생의 실패가 다음 회 같은 지문 경고에 덮여 조용히 commit 됐다
    def test_deferred_failure_not_downgraded_by_later_warning(self):
        self.log(self.E, "2026-11-10 07:59:00: (node:1) Error: failure\n", append=True)
        r = self.live(status="429", prod_defaults=True)
        self.assertIn("미룸 1", r.stdout)
        self.log(self.E, "2026-11-10 08:01:00: (node:1) Warning: warning\n", append=True)
        r = self.live(now="2026-11-10T08:05:00+09:00", status="429,204", prod_defaults=True)
        self.assertIn("기록 1 · 미룸 0 · 요약만 0", r.stdout)
        self.assertIn("🟠", self.sent()[-1])
        self.assertIn("실패", self.sent()[-1])
