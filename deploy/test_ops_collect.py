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

    def run_c(self, *args, now=NOW, config=None, timeout=60, **env):
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
            "OPS_CONFIG": json.dumps({"summaryAt": "23:59", "disk": {"warn": 101, "crit": 102}, **(config or {})}),
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
    def test_requires_dry_run(self):
        r = self.run_c(f"--pm2-bin={self.bin}")
        self.assertEqual(r.returncode, 2)
        self.assertIn("--dry-run 만", r.stderr)
        self.assertEqual(self.pm2_calls(), [])

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
        for word in ("fetch(", "https", "discord.com", "webhook"):
            self.assertNotIn(word, src)  # PR-1 은 외부로 나가는 것 0
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
        self.ok(now=time.strftime("%Y-%m-%dT%H:%M:%S%z"), config={"summaryAt": "23:59:59"})
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
        # 침묵: fin bot out 이 N시간 늘지 않음 · fin web out 은 기본 꺼짐
        self.ok(now="2026-11-10T15:00:00+09:00", config={"burstLimit": 20})
        text = "\n".join(self.posts())
        self.assertIn("silent:fin-bot", text)
        self.assertNotIn("silent:fin-web", text)


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
