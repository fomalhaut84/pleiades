"""deploy/advisor-x1/{x1.cjs,run-x1.sh} — 011 실험 X1 (#632).

실행: python3 -m unittest discover -s deploy
테스트는 deploy/ 최상위에 둔다 — deploy/advisor-x1/ 아래 두면 discover 가 조용히 0건이다(test_ops_collect.py 와 같은 이유).
claude 는 스텁 node 스크립트 · 두 MCP 는 임시 HTTP 서버(하나는 SSE 응답) · Prisma 는 가짜 @prisma/client · 로그는 합성 파일이다.
실제 claude · 실제 MCP · 실제 DB · pm2 · 서버를 부르지 않는다(I-3 · I-8). 분류 상수·모델 핀·스키마는 저장소 소스를 복사해 쓴다(Q118).
핵심 계약: 사전 판정(S-1·S-3·S-4·S-5·Q131)이 하나라도 어긋나면 질문 0 · 인자 셋 · 누적 목표 · J2·J3 판정 · 재실행 1회 ·
판정 양식에 원문·값·경로가 없다.
"""

import fcntl
import http.server
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SRC = HERE / "advisor-x1"
NODE = shutil.which("node") or "/usr/bin/node"
NOW = "2026-11-15T03:00:00+09:00"  # 일요일 03:00 KST — 크론 창 안
DB_SECRET = "postgres://u:DBSECRET42@db/x"
DIRS = {"fin": "finance", "fit": "fitness"}
COPY = ["src/lib/ai/advisor-tools.ts", "src/lib/ai/models.ts", "src/lib/ai/mcp-config.json", "prisma/schema.prisma"]


def registered(app: str) -> list:
    src = (ROOT / "apps" / DIRS[app] / "src/lib/ai/advisor-tools.ts").read_text()
    if app == "fin":
        body = src[src.index("export const READ_TOOLS") : src.index("READ_ONLY_PROMPT_NOTICE")]
        return re.findall(r"'([a-z_]+)'", body)
    return re.findall(r'"mcp__myfitness__([a-z_]+)"', src)


REG = {a: registered(a) for a in DIRS}
FIN_READ = 25  # 011 §3-1 — fin 읽기 25 + 쓰기 34 · fit 읽기 27 + 쓰기 1
LEDGER = {
    "fin": ["HoldingStrategy", "Watchlist", "Transaction", "Category", "Asset", "Deposit", "Budget", "RecurringTransaction",
            "AlertConfig", "RSUSchedule", "StockOption", "StockOptionVesting", "CustomStrategy", "Holding", "Trade"],
    "fit": ["TrainingPlan", "TrainingWorkout"],
}
HELP = " ".join(["-p, --print", "--output-format", "--verbose", "--model", "--system-prompt", "--mcp-config", "--strict-mcp-config",
                 "--setting-sources", "--allowedTools", "--disallowedTools", "--tools", "--max-budget-usd", "--permission-mode",
                 "--no-session-persistence"])

STUB_CLAUDE = r"""#!NODE
const fs = require('fs'), path = require('path')
const sc = JSON.parse(fs.readFileSync(process.env.STUB_SCENARIO, 'utf8'))
const a = process.argv.slice(2)
const calls = process.env.STUB_CALLS
const log = (o) => fs.appendFileSync(calls, JSON.stringify(o) + '\n')
if (a[0] === '--version') {
  const f = calls + '.v', n = fs.existsSync(f) ? +fs.readFileSync(f, 'utf8') : 0
  fs.writeFileSync(f, String(n + 1))
  const vs = sc.versions || ['2.1.308']
  console.log(vs[Math.min(n, vs.length - 1)] + ' (Claude Code)'); process.exit(0)
}
if (a[0] === '--help') { console.log(sc.help); process.exit(0) }
const DIRS = { fin: 'finance', fit: 'fitness' }, PRE = { mcp__myfinance__: 'fin', mcp__myfitness__: 'fit' }
const kst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const appDir = (app) => path.join(process.env.STUB_HOME, `pleiades-${app}`, 'apps', DIRS[app])
const mcpLog = (app, tool, msg = 'tool_call') => {
  fs.mkdirSync(path.join(appDir(app), 'logs'), { recursive: true })
  fs.appendFileSync(path.join(appDir(app), 'logs', `mcp-${kst()}.log`), JSON.stringify({ level: 'info', time: new Date().toISOString(), tool, msg }) + '\n')
}
let stdin = ''
process.stdin.on('data', (d) => { stdin += d }).on('end', () => {
  const probe = stdin.includes('X1 탐침')
  const n = fs.readFileSync(calls, 'utf8').split('\n').filter(Boolean).map(JSON.parse).filter((x) => x.kind === 'ask').length
  const r = probe ? { tools: ['mcp__myfinance__get_portfolio'], sleepMs: 3000, ...(sc.probe || {}) } : (sc.replies || [])[n] || sc.default
  log({ kind: probe ? 'probe' : 'ask', argv: a, cwd: process.cwd(), cwdEntries: fs.readdirSync(process.cwd()), stdin,
    env: { DISABLE_AUTOUPDATER: process.env.DISABLE_AUTOUPDATER, SONNET: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL,
      HAIKU: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, TOOL_SEARCH: process.env.ENABLE_TOOL_SEARCH, DB: process.env.DATABASE_URL || null, LOCK: process.env.X1_LOCK_HELD || null } })
  const allow = (a[a.indexOf('--allowedTools') + 1] || '').split(',').filter(Boolean)
  const servers = [{ name: 'myfinance', status: 'connected' }, { name: 'myfitness', status: 'connected' }]
  const init = { type: 'system', subtype: 'init', tools: allow.slice(0, 3), mcp_servers: servers, plugins: [], ...(r.init || {}) }
  for (const k of r.dropInit || []) delete init[k]
  const first = (r.firstLine || JSON.stringify(init)) + '\n'
  if (r.initDelayMs) {  // init 이 늦게 오는 경우(탐침 시간 초과)
    setTimeout(() => { process.stdout.write(first); emit(r, n) }, r.initDelayMs)
  } else if (r.splitInit) {  // 첫 줄이 여러 청크로 오는 경우
    process.stdout.write(first.slice(0, 20))
    setTimeout(() => { process.stdout.write(first.slice(20)); setTimeout(() => emit(r, n), r.sleepMs || 0) }, 300)
  } else {
    process.stdout.write(first)
    setTimeout(() => emit(r, n), r.sleepMs || 0)
  }
})
function emit(r, n) {
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\n')
  ;(r.tools || []).forEach((t, i) => {
    fs.appendFileSync(calls + '.tool', t + '\n')
    out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't' + i, name: t }] } })
    out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't' + i, ...((r.err || []).includes(t) ? { is_error: true } : {}) }] } })
    const pre = Object.keys(PRE).find((p) => t.startsWith(p))
    if (pre && !r.noLog) mcpLog(PRE[pre], t.slice(pre.length))
  })
  for (const e of r.mcpLog || []) mcpLog(e.app, e.tool, e.msg)
  for (const e of r.pm2 || []) {
    const d = new Date(), p = (x) => String(x).padStart(2, '0')
    const ts = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    fs.appendFileSync(path.join(process.env.STUB_PM2, 'logs', e.file), `${ts}: ${e.text}\n`)
  }
  if (r.dbSet) {
    const f = path.join(appDir(r.dbSet.app), 'fake-db.json'), db = JSON.parse(fs.readFileSync(f, 'utf8'))
    db[r.dbSet.model] = r.dbSet.rows; fs.writeFileSync(f, JSON.stringify(db))
  }
  if (r.noResult) process.exit(1)
  const res = { type: 'result', subtype: r.subtype || 'success', is_error: !!r.isError, num_turns: r.turns || 3,
    result: 'ANSWER-SECRET-' + n, modelUsage: { [process.env.ANTHROPIC_DEFAULT_SONNET_MODEL]: {} } }
  if (r.cost !== null) res.total_cost_usd = r.cost === undefined ? 0.3 : r.cost
  out(res)
}
"""

FAKE_PRISMA = r"""
const fs = require('fs')
class PrismaClient {
  constructor() {
    if (process.env.DATABASE_URL !== fs.readFileSync('expected-url', 'utf8').trim()) throw new Error('url ' + process.env.DATABASE_URL)
    if (fs.existsSync('db-fail')) throw new TypeError('fail ' + process.env.DATABASE_URL)
    const db = JSON.parse(fs.readFileSync('fake-db.json', 'utf8'))
    return new Proxy(this, { get: (t, k) => {
      if (k === '$disconnect') return async () => {}
      const m = Object.keys(db).find((n) => n[0].toLowerCase() + n.slice(1) === k)
      return m ? { findMany: async () => db[m].map((r) => (r.updatedAt ? { ...r, updatedAt: new Date(r.updatedAt) } : r)) } : undefined
    } })
  }
}
module.exports = { PrismaClient }
"""
# fit 은 prisma-client 생성기(TS · src/generated/prisma/client.ts)라 앱 tsx 로 읽는다 — 가짜도 그 자리에 TS 로 둔다(회귀: PR #633 Codex P1)
FAKE_FIT_CLIENT = (
    "import { createRequire } from 'module'\n"
    "const fake: { PrismaClient: new () => unknown } = createRequire(process.cwd() + '/x.js')('./fake-prisma.cjs')\n"
    "export const PrismaClient = fake.PrismaClient\n"
)
TSX = ROOT / "apps" / "fitness" / "node_modules" / "tsx" / "dist" / "cli.mjs"


class Mcp(http.server.BaseHTTPRequestHandler):
    def reply(self, code, obj=None, headers=None):
        body = b""
        ctype = "application/json"
        if obj is not None:
            raw = json.dumps(obj)
            if self.server.sse:
                ctype, raw = "text/event-stream", f"event: message\ndata: {raw}\n\n"
            body = raw.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):  # noqa: N802
        msg = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.seen.append((msg.get("method"), self.headers.get("mcp-session-id"), self.headers.get("Accept")))
        if msg["method"] == "initialize":
            return self.reply(200, {"jsonrpc": "2.0", "id": msg["id"], "result": {"protocolVersion": "2025-03-26"}}, {"mcp-session-id": "sid-1"})
        if msg["method"] == "notifications/initialized":
            return self.reply(202)
        names = self.server.tools
        cursor = (msg.get("params") or {}).get("cursor")
        page = names[len(names) // 2 :] if cursor else names[: len(names) // 2]
        result = {"tools": [{"name": n} for n in page]}
        if not cursor:
            result["nextCursor"] = "p2"
        return self.reply(200, {"jsonrpc": "2.0", "id": msg["id"], "result": result})

    def do_DELETE(self):  # noqa: N802
        self.server.seen.append(("DELETE", self.headers.get("mcp-session-id"), None))
        self.reply(200)

    def log_message(self, *a):
        pass


class Base(unittest.TestCase):
    def setUp(self):
        self.assertTrue(TSX.exists(), "apps/fitness npm ci 필요(tsx) — 건너뛰면 fit Q131 경로를 증명하지 않는다")
        self.tmp = Path(tempfile.mkdtemp(prefix="x1", dir="/tmp")).resolve()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.home = self.tmp / "h"
        self.inst = self.home / "pleiades-advisor-x1"  # 체크아웃 밖 설치(Q115)
        self.inst.mkdir(parents=True)
        for f in ("x1.cjs", "judge.cjs", "run-x1.sh"):
            shutil.copy(SRC / f, self.inst / f)
        self.private = self.home / "pleiades-private"
        self.x1 = self.private / "advisor-x1"
        self.x1.mkdir(parents=True, mode=0o700)
        self.private.chmod(0o700)
        self.managed = self.tmp / "managed"
        self.managed.mkdir()
        self.pm2 = self.tmp / "pm2"
        (self.pm2 / "logs").mkdir(parents=True)
        for f in ("pleiades-fin-mcp-out.log", "pleiades-fin-bot-out.log", "pleiades-fit-bot-out.log"):
            (self.pm2 / "logs" / f).touch()
        self.calls = self.tmp / "calls.jsonl"
        self.calls.touch()
        self.scenario = self.tmp / "scenario.json"
        self.bin = self.tmp / "bin"
        self.bin.mkdir()
        (self.bin / "claude").write_text(STUB_CLAUDE.replace("NODE", NODE, 1))
        (self.bin / "claude").chmod(0o755)
        self.servers = {}
        for app, d in DIRS.items():
            srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Mcp)
            srv.tools, srv.seen, srv.sse, srv.daemon_threads = list(REG[app]), [], app == "fit", True
            threading.Thread(target=srv.serve_forever, daemon=True).start()
            self.addCleanup(srv.server_close)
            self.addCleanup(srv.shutdown)
            self.servers[app] = srv
            port = srv.server_address[1]
            a = self.app_dir(app)
            for rel in COPY:
                (a / rel).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(ROOT / "apps" / d / rel, a / rel)
            if app == "fin":  # deploy.sh 가 요구하는 상태 — mcp-config 포트 = MCP_PORT
                cfg = json.loads((a / COPY[2]).read_text())
                cfg["mcpServers"]["myfinance"]["url"] = f"http://127.0.0.1:{port}/mcp"
                (a / COPY[2]).write_text(json.dumps(cfg))
            (a / ".env").write_text(f'MCP_PORT={port}\nDATABASE_URL="{DB_SECRET}-{app}"\n')
            (a / "expected-url").write_text(f"{DB_SECRET}-{app}")
            (a / "fake-db.json").write_text(json.dumps({m: [{"id": 1, "v": "a", "updatedAt": "2026-11-01T00:00:00Z"}] for m in LEDGER[app]}))
            if app == "fin":  # prisma-client-js → @prisma/client
                pc = a / "node_modules" / "@prisma" / "client"
                pc.mkdir(parents=True)
                (pc / "index.js").write_text(FAKE_PRISMA)
            else:  # prisma-client → src/generated/prisma/client.ts (+ 앱 tsx)
                (a / "fake-prisma.cjs").write_text(FAKE_PRISMA)
                gen = a / "src" / "generated" / "prisma"
                gen.mkdir(parents=True)
                (gen / "client.ts").write_text(FAKE_FIT_CLIENT)
                (a / "node_modules" / ".bin").mkdir(parents=True)
                (a / "node_modules" / ".bin" / "tsx").symlink_to(TSX)
        self.questions({i: f"Q-SECRET-{i} 지출과 수면" for i in ("X1", "X2", "X3", "X4", "D1", "D2")})
        self.set_scenario()
        self.seed_probe()

    def seed_probe(self, ok=True, version="2.1.308"):
        # 본 실행은 같은 CLI 버전의 init 탐침 통과를 요구한다(#634 9-1 major 2) — 탐침 자체는 Probe 클래스가 시험한다
        f = self.x1 / "state.json"
        f.write_text(json.dumps({"runs": [], "probe": {"ok": ok, "version": version, "at": 0}}))
        f.chmod(0o600)

    def probes(self):
        return [c for c in map(json.loads, filter(None, self.calls.read_text().splitlines())) if c["kind"] == "probe"]

    def app_dir(self, app):
        return self.home / f"pleiades-{app}" / "apps" / DIRS[app]

    def questions(self, qs, mode=0o600):
        f = self.x1 / "questions.txt"
        f.write_text("".join(f"## {k}\n{v}\n\n" for k, v in qs.items()))
        f.chmod(mode)

    def set_scenario(self, replies=None, default=None, **kw):
        base = {"tools": ["mcp__myfinance__get_spending_summary", "mcp__myfitness__get_sleep"], "cost": 0.3}
        self.scenario.write_text(json.dumps({"help": HELP, "replies": replies or [], "default": default or base, **kw}))

    def env(self, **extra):
        env = {
            "HOME": str(self.home), "PATH": f"{self.bin}:{Path(NODE).parent}:/usr/bin:/bin", "PLEIADES_TEST": "1",
            "PLEIADES_LOCK": "mkdir", "X1_NOW": NOW, "X1_MANAGED_DIR": str(self.managed), "PM2_HOME": str(self.pm2),
            "STUB_SCENARIO": str(self.scenario), "STUB_CALLS": str(self.calls), "STUB_HOME": str(self.home), "STUB_PM2": str(self.pm2),
        }
        env.update(extra)
        return env

    def run_x1(self, *args, wrapper=True, **extra):
        cmd = ["bash", str(self.inst / "run-x1.sh"), *args] if wrapper else [NODE, str(self.inst / "x1.cjs"), *args]
        r = subprocess.run(cmd, env=self.env(**extra), capture_output=True, text=True, timeout=120)
        self.assertNotIn("ANSWER-SECRET", r.stdout)
        self.assertNotIn("Q-SECRET", r.stdout)
        self.assertNotIn("DBSECRET", r.stdout + r.stderr)
        self.assertNotIn(str(self.home), r.stdout)
        for srv in self.servers.values():
            self.assertNotIn(str(srv.server_address[1]), r.stdout)
        return r

    def asks(self):
        return [c for c in map(json.loads, filter(None, self.calls.read_text().splitlines())) if c["kind"] == "ask"]

    def assert_stopped(self, r, needle):
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("결과: 시작 안 함 — 질문 0", r.stdout)
        self.assertIn(needle, r.stdout)
        self.assertEqual(self.asks(), [])

    def state(self):
        return json.loads((self.x1 / "state.json").read_text())


class HappyPath(Base):
    def test_main_run_passes_and_keeps_contract(self):
        r = self.run_x1()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        asks = self.asks()
        self.assertEqual([c["stdin"].split("사용자 질문: ")[1].split(" ")[0] for c in asks],
                         [f"Q-SECRET-{i}" for i in ("X1", "X2", "X3", "X4", "D1", "D2")])  # 교차 먼저
        for c in asks:
            a = c["argv"]
            opt = lambda k: a[a.index(k) + 1]  # noqa: E731
            self.assertEqual(opt("--setting-sources"), "project")
            self.assertEqual(opt("--tools"), "")
            self.assertEqual(opt("--permission-mode"), "dontAsk")
            self.assertEqual(opt("--max-budget-usd"), "1")
            self.assertEqual(opt("--model"), "claude-sonnet-5")
            for k in ("--strict-mcp-config", "--no-session-persistence", "--print"):
                self.assertIn(k, a)
            allow, deny = opt("--allowedTools").split(","), opt("--disallowedTools").split(",")
            self.assertEqual(len(allow), FIN_READ + 27)
            self.assertEqual(len(deny), 34 + 1)
            self.assertNotIn("WebSearch", allow)  # §5-8 I-3
            self.assertIn("mcp__myfitness__generate_training_plan", deny)
            self.assertIn("mcp__myfinance__create_custom_strategy", deny)  # 중첩 호출 도구(W4)
            self.assertFalse(any("SECRET" in x for x in a), "질문은 stdin 으로만")
            self.assertEqual(c["cwdEntries"], [])  # 빈 임시 cwd
            self.assertTrue(c["cwd"].startswith(str(self.x1)))
            self.assertEqual(c["env"]["DISABLE_AUTOUPDATER"], "1")
            self.assertEqual(c["env"]["SONNET"], "claude-sonnet-5")
            self.assertEqual(c["env"]["HAIKU"], "claude-haiku-4-5-20251001")
            self.assertEqual(c["env"]["TOOL_SEARCH"], "false")  # 회귀: #632 9-1 major 2 — ToolSearch tool_use 가 J2 거짓 실패
            self.assertIsNone(c["env"]["DB"])
            self.assertIsNone(c["env"]["LOCK"])
            cfg = json.loads(Path(opt("--mcp-config")).read_text())
            self.assertEqual(sorted(cfg["mcpServers"]), ["myfinance", "myfitness"])
        out = r.stdout
        self.assertIn("init 통과 · 플러그인 0(내장 0 제외) · MCP 서버 2(연결 2) · 목록 밖 도구 0", out)  # 회귀: #634
        for line in ("S-4 CLI 후 2.1.308 → 같음", "J2 통과", "J3 통과", "누적 비용 $1.80", "fin 등록 59 = 읽기 25 + 쓰기 34 (MCP 아닌 항목 2 버림) · 차이 0",
                     "fit 등록 28 = 읽기 27 + 쓰기 1 · 차이 0 · 포트 기본값과 다름", "포트 mcp-config 와 같음", "원장 대조 다름 0/17",
                     "공유 로그 통과", "결과: 실행 끝", "X1 교차 · 완료 · $0.30", "D2 대조(fit) · 완료", "   X4 [예 / 부분 / 아니오]"):
            self.assertIn(line, out)
        # 원문은 비공개 파일에만 · 600
        runs = list((self.x1 / "runs").iterdir())
        self.assertEqual(len(runs), 1)
        ans = runs[0] / "answers.md"
        self.assertIn("ANSWER-SECRET-0", ans.read_text())
        self.assertIn("Q-SECRET-X1", ans.read_text())
        for f in runs[0].iterdir():
            self.assertEqual(f.stat().st_mode & 0o777, 0o700 if f.is_dir() else 0o600, f.name)
        self.assertEqual(self.state()["runs"][0]["j2"], "통과")
        # MCP: SSE·JSON 두 응답 · 페이지 넘김 · 세션 헤더 · 세션 닫기
        for srv in self.servers.values():
            methods = [m for m, _, _ in srv.seen]
            self.assertEqual(methods, ["initialize", "notifications/initialized", "tools/list", "tools/list", "DELETE"])
            self.assertTrue(all(s == "sid-1" for m, s, _ in srv.seen[1:]))
            self.assertIn("text/event-stream", srv.seen[0][2])
        self.assertFalse((self.private / "deploy.lock.d").exists(), "락은 끝나면 풀린다")

    def test_preflight_makes_no_model_call_and_ignores_window(self):
        r = self.run_x1("--preflight", X1_NOW="2026-11-15T12:00:00+09:00")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("창 밖", r.stdout)
        self.assertIn("결과: 사전 판정 통과 — 질문 0", r.stdout)
        self.assertEqual(self.asks(), [])
        self.assertEqual(len(self.probes()), 1)
        self.assertIn("init 탐침: 통과 · 플러그인 0(내장 0 제외) · MCP 서버 2(연결 2) · 목록 밖 도구 0 · 모델 응답 없음 · CLI 2.1.308", r.stdout)
        self.assertEqual(self.state()["runs"], [])
        self.assertTrue(self.state()["probe"]["ok"])


class S1Lock(Base):
    def test_busy_lock_starts_nothing(self):
        (self.private / "deploy.lock.d").mkdir()
        r = self.run_x1()
        self.assert_stopped(r, "S-1 배포 락: 다른 배포가 진행 중이다")
        self.assertEqual(self.servers["fin"].seen, [])

    @unittest.skipUnless(shutil.which("flock"), "flock 없음(macOS) — 서버 경로는 Linux 에서")
    def test_flock_busy_starts_nothing(self):
        with open(self.private / "deploy.lock", "a") as fh:
            fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
            r = self.run_x1(PLEIADES_LOCK="")
        self.assert_stopped(r, "S-1 배포 락: 다른 배포가 진행 중이다")

    def test_node_without_wrapper_refuses(self):
        r = self.run_x1(wrapper=False)
        self.assert_stopped(r, "run-x1.sh 를 거치지 않았다")

    def test_cron_window(self):
        for now, why in (("2026-11-15T10:00:00+09:00", "크론 창 밖"), ("2026-12-01T03:00:00+09:00", "매월 1일"),
                         ("2027-01-07T03:00:00+09:00", "분기 크론일"), ("2026-11-15T05:41:00+09:00", "크론 창 밖")):
            r = self.run_x1(X1_NOW=now)
            self.assert_stopped(r, why)

    def test_wrapper_contract(self):
        sh = (SRC / "run-x1.sh").read_text()
        self.assertIn('LOCK=$PRIVATE/deploy.lock', sh)
        self.assertIn("flock -n 9", sh)
        self.assertIn('"$HERE/x1.cjs" "$@" 9>&-', sh)  # 자식은 락 fd 를 물려받지 않는다
        self.assertIn('"$PRIVATE/deploy.lock"', (HERE / "release-inplace.sh").read_text())  # 같은 파일
        js = (SRC / "x1.cjs").read_text()
        for bad in ("'pm2'", "'git'", "shell: true", "deploy.lock"):
            self.assertNotIn(bad, js)


class S3Settings(Base):
    def put(self, path, obj):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(obj if isinstance(obj, str) else json.dumps(obj))

    def test_blocking_settings(self):
        cases = [
            (self.home / ".claude" / "settings.json", {"permissions": {"allow": ["mcp__myfinance__create_transaction"]}}, "user"),
            (self.home / ".claude" / "settings.local.json", {"permissions": {"allow": ["Bash(*)"]}}, "user-local"),
            (self.managed / "managed-settings.json", {"hooks": {"PreToolUse": [{}]}}, "관리형 파일"),
            (self.managed / "managed-settings.d" / "10.json", {"enabledPlugins": {"p@m": True}}, "관리형 조각"),
            (self.home / ".claude" / "settings.json", "{not json", "user"),
            (self.private / ".claude" / "settings.json", {"hooks": {"Stop": [{}]}}, "project(조상)"),
        ]
        for path, obj, scope in cases:
            with self.subTest(scope=scope):
                self.put(path, obj)
                r = self.run_x1()
                self.assert_stopped(r, f"S-3: 막는 항목 1({scope})")
                path.unlink()

    def test_user_plugin_reported_not_blocked(self):
        # 회귀: #634 — user 범위 플러그인은 --setting-sources project 로 읽지 않는다 → 보고만 · 관리형은 막는다(test_blocking_settings)
        self.put(self.home / ".claude" / "settings.json", {"enabledPlugins": {"p@m": True}})
        self.put(self.home / ".claude" / "settings.local.json", {"enabledPlugins": {"q@m": True}})
        r = self.run_x1("--preflight")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("user allow mcp 0 · 와일드카드 0 · 기타 0 · hooks 없음 · 플러그인 켬(보고만)", r.stdout)
        self.put(self.private / ".claude" / "settings.json", {"enabledPlugins": {"p@m": True}})
        self.assert_stopped(self.run_x1(), "S-3: 막는 항목 1(project(조상))")

    def test_harmless_settings_pass(self):
        self.put(self.home / ".claude" / "settings.json", {"permissions": {"allow": ["Bash(ls)"], "defaultMode": "acceptEdits"}, "autoUpdatesChannel": "stable"})
        self.put(self.managed / "managed-mcp.json", {"mcpServers": {}})
        r = self.run_x1("--preflight")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("user allow mcp 0 · 와일드카드 0 · 기타 1 · hooks 없음 · defaultMode acceptEdits", r.stdout)
        self.assertIn("관리형 managed-mcp.json 있음(보고만)", r.stdout)


class S4Cli(Base):
    def test_version_change_is_reported(self):
        self.set_scenario(versions=["2.1.308", "2.1.309"])
        r = self.run_x1()
        self.assertIn("S-4 CLI 후 2.1.309 → 다름", r.stdout)

    def test_missing_option_stops(self):
        self.set_scenario(help=HELP.replace("--setting-sources", ""))
        self.assert_stopped(self.run_x1(), "S-4: CLI help 에 없는 옵션 1(--setting-sources)")

    def test_pin_mismatch_stops(self):
        f = self.app_dir("fit") / COPY[1]
        f.write_text(f.read_text().replace('sonnet: "claude-sonnet-5"', 'sonnet: "claude-sonnet-9"'))
        self.assert_stopped(self.run_x1(), "S-4: 두 앱 모델 핀이 다르다")


class S5Tools(Base):
    def test_registered_tool_not_in_source_stops(self):
        self.servers["fin"].tools.append("drop_everything")
        self.assert_stopped(self.run_x1(), "S-5: fin 등록 ↔ 분류 차이(분류 없음 1 · 등록 없음 0)")

    def test_source_tool_not_registered_stops(self):
        self.servers["fit"].tools.remove("get_sleep")
        self.assert_stopped(self.run_x1(), "S-5: fit 등록 ↔ 분류 차이(분류 없음 0 · 등록 없음 1)")

    def test_prefix_and_server_key(self):
        f = self.app_dir("fin") / COPY[0]
        orig = f.read_text()
        f.write_text(orig.replace("const MCP_PREFIX = 'mcp__myfinance__'", "const MCP_PREFIX = 'mcp__finance__'"))
        self.assert_stopped(self.run_x1(), "S-5: fin 도구 접두가 mcp-config 서버 키(myfinance)와 다르다(I-4)")
        f.write_text(orig)
        c = self.app_dir("fit") / COPY[2]
        c.write_text(c.read_text().replace('"myfitness"', '"fitness"'))
        self.assert_stopped(self.run_x1(), "S-5: fit mcp-config.json 에 서버 키 myfitness 가 없다(I-4)")

    def test_commented_tool_stops(self):
        # 회귀: #632 9-1 major 1 — READ 에서 주석 처리돼 WRITE 에도 없는 도구가 허용 목록으로 새던 fail-open
        f = self.app_dir("fin") / COPY[0]
        orig = f.read_text()
        f.write_text(orig.replace("    'get_portfolio',\n", "    // 'get_portfolio',\n", 1))
        self.assert_stopped(self.run_x1(), "S-5: 분류 상수에 주석·템플릿 문자열")
        f.write_text(orig.replace("    'get_trades',\n", "    'get_trades', // don't — 주석 속 아포스트로피\n", 1))
        self.assert_stopped(self.run_x1(), "S-5: 분류 상수에 주석·템플릿 문자열")
        f.write_text(orig.replace("    'get_trades',\n", "    `get_trades`,\n", 1))
        self.assert_stopped(self.run_x1(), "S-5: 분류 상수에 주석·템플릿 문자열")

    def test_read_write_overlap_stops(self):
        f = self.app_dir("fin") / COPY[0]
        f.write_text(f.read_text().replace("  'delete_custom_strategy',", "  'delete_custom_strategy',\n  'get_portfolio',"))
        self.assert_stopped(self.run_x1(), "S-5: fin 읽기·쓰기 목록이 겹친다")

    def test_fin_port_mismatch_stops(self):
        e = self.app_dir("fin") / ".env"
        e.write_text(re.sub(r"MCP_PORT=\d+", "MCP_PORT=1", e.read_text()))
        self.assert_stopped(self.run_x1(), "S-5: fin MCP_PORT ≠ mcp-config 포트")


class S6Budget(Base):
    def test_target_reached_skips_rest(self):
        self.set_scenario(default={"tools": ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"], "cost": 1.0})
        r = self.run_x1()
        self.assertEqual(len(self.asks()), 3)
        self.assertIn("X4 교차 · 미실행(누적 목표 도달) · 누적 $3.00", r.stdout)
        self.assertIn("D2 대조(fit) · 미실행(누적 목표 도달)", r.stdout)
        self.assertIn("완료된 교차 3", r.stdout)

    def test_budget_exceeded_and_unknown_cost(self):
        self.set_scenario(replies=[{"tools": [], "subtype": "error_max_budget_usd", "cost": 1.02}, {"tools": [], "cost": None}])
        r = self.run_x1()
        self.assertIn("X1 교차 · 판정 불가 · $1.02", r.stdout)
        self.assertIn("X3 교차 · 미실행(비용 미상)", r.stdout)
        self.assertEqual(len(self.asks()), 2)
        self.assertIn("J3 실패 — 완료된 교차 1 중 두 도메인 성공 ≥1: 0", r.stdout)  # X2 는 도구 0
        self.assertIn("3 미만이면 J1 판정 불가", r.stdout)

    def test_timeout_kills_question(self):
        self.set_scenario(replies=[{"tools": [], "sleepMs": 4000}])
        r = self.run_x1(X1_Q_TIMEOUT_MS="500")
        self.assertIn("X1 교차 · 오류(timeout) · $?", r.stdout)
        self.assertIn("X2 교차 · 미실행(비용 미상)", r.stdout)

    def test_cli_failure_without_result(self):
        self.set_scenario(replies=[{"tools": [], "noResult": True}])
        r = self.run_x1()
        self.assertIn("X1 교차 · 오류(no-result) · $?", r.stdout)
        self.assertIn("X2 교차 · 미실행(비용 미상)", r.stdout)


class J2J3(Base):
    def test_session_outside_allowlist_fails_j2(self):
        self.set_scenario(replies=[{"tools": ["mcp__myfinance__create_transaction", "mcp__myfitness__get_sleep"]}])
        r = self.run_x1()
        self.assertIn("목록 밖 1 [mcp__myfinance__create_transaction]", r.stdout)
        self.assertIn("J2 실패 — init 위반 0 · init 형식 0 · 세션 목록 밖 1", r.stdout)
        self.assertIn("재실행: 남은 1회\n", r.stdout + "\n")
        self.assertEqual(self.state()["runs"][0]["j2"], "실패")

    def test_j3_needs_both_domains(self):
        self.set_scenario(replies=[{"tools": ["mcp__myfinance__get_portfolio"]},
                                   {"tools": ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"], "err": ["mcp__myfitness__get_sleep"]}])
        r = self.run_x1()
        self.assertIn("J3 실패 — 완료된 교차 4 중 두 도메인 성공 ≥1: 2", r.stdout)
        self.assertIn("fit 1(성공 0)", r.stdout)

    def test_shared_log_outside_fails(self):
        self.set_scenario(replies=[{"tools": ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"],
                                    "mcpLog": [{"app": "fit", "tool": "generate_training_plan", "msg": "tool_call_failed"}]}])
        r = self.run_x1()
        self.assertIn("공유 로그 실패", r.stdout)
        self.assertIn("J2 실패", r.stdout)

    def test_nested_call_fails(self):
        self.set_scenario(replies=[{"tools": ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"],
                                    "pm2": [{"file": "pleiades-fin-mcp-out.log", "text": "[advisor] ok caller=strategy:parse model=m cost=$0.1"}]}])
        r = self.run_x1()
        self.assertIn("중첩 strategy:parse 1", r.stdout)
        self.assertIn("J2 실패", r.stdout)

    def test_human_chat_in_window_is_mixed_not_fail(self):
        self.set_scenario(replies=[{"tools": ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"],
                                    "mcpLog": [{"app": "fin", "tool": "create_transaction"}],
                                    "pm2": [{"file": "pleiades-fin-bot-out.log", "text": "[advisor] ok caller=bot:ai_chat model=m"}]}])
        r = self.run_x1()
        self.assertIn("공유 로그 섞임", r.stdout)
        self.assertIn("J2 통과", r.stdout)
        self.assertIn("섞임: 세션 기록 0 이라 통과로 본다", r.stdout)

    def test_mixed_with_nested_warns(self):
        self.set_scenario(replies=[{"tools": ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"],
                                    "pm2": [{"file": "pleiades-fin-bot-out.log", "text": "[advisor] ok caller=bot:ai_chat model=m"},
                                            {"file": "pleiades-fin-mcp-out.log", "text": "[advisor] ok caller=strategy:parse model=m"}]}])
        r = self.run_x1()
        self.assertIn("공유 로그 섞임", r.stdout)
        self.assertIn("⚠ 섞인 창에 중첩 호출 1", r.stdout)

    def test_no_pm2_log_files_is_undecidable(self):
        # 회귀: #632 9-1 major 3 — 대상 pm2 로그 0개를 0 건(통과)으로 읽던 공허 통과
        for f in (self.pm2 / "logs").iterdir():
            f.unlink()
        r = self.run_x1()
        self.assertIn("공유 로그 판정 불가(로그 없음)", r.stdout)
        self.assertIn("중첩 strategy:parse ?", r.stdout)
        self.assertIn("같은 창 fin ai_chat ?", r.stdout)
        # 회귀: PR #633 Codex P2 — 중첩 근거가 없으면 J2 는 통과가 아니라 판정 불가 · 상태에도 통과로 남기지 않는다
        self.assertIn("J2 판정 불가", r.stdout)
        self.assertNotIn("J2 통과", r.stdout)
        self.assertEqual(self.state()["runs"][0]["j2"], "판정 불가")
        self.calls.write_text("")
        self.assert_stopped(self.run_x1("--rerun=resume"), "본 실행 J2 가 통과가 아니다")

    def test_unreadable_pm2_log_is_undecidable(self):
        # 회귀: PR #643 Codex P2 — 매칭 파일은 있는데 못 읽으면(권한 · 회전) 빈 로그(0 건)가 아니라 판정 불가
        if os.geteuid() == 0:
            self.skipTest("root 는 권한 000 을 읽는다")
        f = self.pm2 / "logs" / "pleiades-fin-mcp-out.log"
        f.chmod(0o000)
        self.addCleanup(f.chmod, 0o600)
        r = self.run_x1()
        self.assertIn("공유 로그 판정 불가(로그 읽기 실패)", r.stdout)
        self.assertIn("J2 판정 불가", r.stdout)
        self.assertEqual(self.state()["runs"][0]["j2"], "판정 불가")
        self.calls.write_text("")
        self.assert_stopped(self.run_x1("--rerun=resume"), "본 실행 J2 가 통과가 아니다")

    def test_unreadable_mcp_log_is_undecidable(self):
        # 회귀: PR #643 Codex P2 — MCP 로그도 같다
        if os.geteuid() == 0:
            self.skipTest("root 는 권한 000 을 읽는다")
        self.set_scenario(default={"tools": ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"], "noLog": True})
        logs = self.app_dir("fin") / "logs"
        logs.mkdir(parents=True, exist_ok=True)
        from datetime import datetime, timedelta, timezone
        f = logs / f"mcp-{(datetime.now(timezone.utc) + timedelta(hours=9)).date()}.log"
        f.write_text("")
        f.chmod(0o000)
        self.addCleanup(f.chmod, 0o600)
        r = self.run_x1()
        self.assertIn("공유 로그 판정 불가(로그 읽기 실패)", r.stdout)
        self.assertIn("J2 판정 불가", r.stdout)

    def test_mixed_without_nested_evidence_is_undecidable(self):
        # 회귀: PR #633 Codex P2 — 섞임 규칙(세션 0 이면 통과)은 중첩 근거가 있을 때만
        (self.pm2 / "logs" / "pleiades-fin-mcp-out.log").unlink()
        self.set_scenario(replies=[{"tools": ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"],
                                    "pm2": [{"file": "pleiades-fin-bot-out.log", "text": "[advisor] ok caller=bot:ai_chat model=m"}]}])
        r = self.run_x1()
        self.assertIn("J2 판정 불가", r.stdout)

    def test_missing_mcp_log_is_undecidable_not_pass(self):
        self.set_scenario(default={"tools": ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"], "noLog": True})
        r = self.run_x1()
        self.assertIn("공유 로그 판정 불가(로그 없음)", r.stdout)
        self.assertIn("J2 판정 불가", r.stdout)


class InitCheck(Base):
    """회귀: #634 — 질문마다 stream-json 첫 init 을 판정한다. 어긋나면 첫 tool_use 전에 끊고 이후 질문을 시작하지 않는다.
    회귀: #634 9-1 major 1 — 위반(플러그인 · 서버 · 목록 밖 도구 · init 전 hook)은 J2 실패 · 형식(init 없음 · 필드 · 상태)은 판정 불가 · 횟수 제외."""

    def cut(self, reply, label, replies_before=()):
        self.set_scenario(replies=[*replies_before, {"tools": ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"], "sleepMs": 3000, **reply}])
        r = self.run_x1()
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertEqual(len(self.asks()), len(replies_before) + 1)
        killed = Path(str(self.calls) + ".tool")
        tool_uses = len(killed.read_text().split()) if killed.exists() else 0
        # 앞선 정상 질문들의 tool_use(질문당 2)만 있어야 한다 — 끊긴 질문의 tool_use 가 하나라도 있으면 init 판정 전에 도구가 돌았다는 뜻
        self.assertEqual(tool_uses, 2 * len(replies_before), "init 판정 실패 질문은 첫 tool_use 전에 SIGKILL 돼야 한다")
        self.assertIn(label, r.stdout)
        return r

    def violation(self, reply, why):
        r = self.cut(reply, f"init 위반({why})")
        self.assertIn("X1 교차 · 실패(init)", r.stdout)
        self.assertIn("X2 교차 · 미실행(init 실패)", r.stdout)
        self.assertIn("D2 대조(fit) · 미실행(init 실패)", r.stdout)
        self.assertIn("J2 실패 — init 위반 1 · init 형식 0", r.stdout)
        self.assertEqual(self.state()["runs"][0]["j2"], "실패")
        self.assertTrue(self.state()["runs"][0]["counted"])
        return r

    def format_(self, reply, why):
        r = self.cut(reply, f"init 형식({why})")
        self.assertIn("X1 교차 · 오류(init 형식)", r.stdout)
        self.assertIn("X2 교차 · 미실행(init 형식)", r.stdout)
        self.assertIn("J2 판정 불가 — init 위반 0 · init 형식 1", r.stdout)
        self.assertIn("이번 실행은 세지 않는다", r.stdout)
        run = self.state()["runs"][0]
        self.assertEqual((run["j2"], run["counted"]), ("판정 불가", False))
        self.assertFalse(self.state()["probe"]["ok"])  # 회귀: #634 재리뷰 major 2 — 세지 않은 실행 뒤에는 --preflight 를 다시 요구
        self.calls.write_text("")
        self.set_scenario()
        self.assert_stopped(self.run_x1(), "init 탐침 통과가 없다")
        self.run_x1("--preflight")
        r2 = self.run_x1()  # 횟수에 안 들었으니 본 실행을 다시 할 수 있다
        self.assertIn("J2 통과", r2.stdout)
        return r

    def test_plugin_loaded(self):
        r = self.violation({"init": {"plugins": [{"name": "p", "path": "/x"}]}}, "플러그인")
        self.assertIn("플러그인 1(내장 0 제외) · MCP 서버 2(연결 2)", r.stdout)
        self.assertNotIn("/x", r.stdout)

    # 회귀: #645 — 서버 CLI 2.1.311 init 에 내장 플러그인 3(`…@builtin`)이 늘 실린다 · 그것만이면 통과
    BUILTIN = [{"name": "cc-plugin-agents-md", "source": "cc-plugin-agents-md@builtin"},
               {"name": "cc-plugin-telemetry", "source": "cc-plugin-telemetry@builtin"}]

    def test_builtin_plugins_only_pass(self):
        tools = ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"]
        self.set_scenario(default={"tools": tools, "init": {"plugins": self.BUILTIN}}, probe={"init": {"plugins": self.BUILTIN}})
        r = self.run_x1()
        self.assertIn("J2 통과", r.stdout)
        self.assertIn("플러그인 0(내장 2 제외)", r.stdout)
        self.assertNotIn("cc-plugin", r.stdout)

    def test_builtin_plus_other_plugin_is_violation(self):
        r = self.violation({"init": {"plugins": self.BUILTIN + [{"name": "dev", "source": "dev@market"}]}}, "플러그인")
        self.assertIn("플러그인 1(내장 2 제외)", r.stdout)

    def test_plugin_without_builtin_source_is_violation(self):
        self.violation({"init": {"plugins": [{"name": "x", "source": "x@builtin-ish"}, {"name": "y"}]}}, "플러그인")

    def test_plugin_errors_count_as_plugins(self):
        self.violation({"init": {"plugin_errors": [{"plugin": "p"}]}}, "플러그인")

    def test_extra_server(self):
        servers = [{"name": "myfinance", "status": "connected"}, {"name": "myfitness", "status": "connected"}, {"name": "other", "status": "connected"}]
        self.assertIn("MCP 서버 3(연결 2)", self.violation({"init": {"mcp_servers": servers}}, "MCP 서버").stdout)

    def test_mcp_server_errors_is_violation(self):
        self.violation({"init": {"mcp_server_errors": [{"name": "other"}]}}, "MCP 서버")

    def test_builtin_tool(self):
        self.assertIn("목록 밖 도구 1", self.violation({"init": {"tools": ["Bash", "mcp__myfinance__get_portfolio"]}}, "목록 밖 도구").stdout)

    def test_hook_before_init_is_violation(self):
        self.violation({"firstLine": json.dumps({"type": "system", "subtype": "hook_started", "hook_name": "SessionStart"})}, "init 전 hook")

    def test_no_init(self):
        self.format_({"firstLine": json.dumps({"type": "system", "subtype": "status"})}, "init 없음")

    def test_format_with_model_reply_is_counted(self):
        # 회귀: #634 재리뷰 major 2 — 첫 질문이어도 모델 응답이 왔으면 횟수에 든다
        r = self.cut({"firstLine": json.dumps({"type": "assistant", "message": {"content": []}})}, "init 형식(init 없음)")
        self.assertNotIn("이번 실행은 세지 않는다", r.stdout)
        self.assertTrue(self.state()["runs"][0]["counted"])

    def test_format_after_completed_question_is_counted(self):
        # 회귀: #634 재리뷰 major 2 — X1 완료 → X2 형식 실패 = 부분 결과가 있으니 횟수에 든다 · 재실행 규칙 적용
        ok = {"tools": ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"]}
        r = self.cut({"dropInit": ["plugins"]}, "X2 교차 · 오류(init 형식)", replies_before=(ok,))
        self.assertIn("X1 교차 · 완료", r.stdout)
        self.assertIn("J2 판정 불가", r.stdout)
        self.assertNotIn("이번 실행은 세지 않는다", r.stdout)
        run = self.state()["runs"][0]
        self.assertEqual((run["j2"], run["counted"]), ("판정 불가", True))
        self.assertTrue(self.state()["probe"]["ok"])
        self.calls.write_text("")
        self.assert_stopped(self.run_x1(), "본 실행은 이미 있다")
        self.assert_stopped(self.run_x1("--rerun=resume"), "본 실행 J2 가 통과가 아니다")

    def test_missing_plugins_field(self):
        self.format_({"dropInit": ["plugins"]}, "init 필드 없음")

    def test_error_fields_not_arrays(self):
        self.format_({"init": {"plugin_errors": "x"}}, "init 필드 형식")

    def test_disconnected_or_unknown_status_is_format(self):
        servers = [{"name": "myfinance", "status": "connected"}, {"name": "myfitness", "status": "pending"}]
        self.assertIn("MCP 서버 2(연결 1)", self.format_({"init": {"mcp_servers": servers}}, "MCP 미연결").stdout)

    def test_unknown_status(self):
        servers = [{"name": "myfinance", "status": "connected"}, {"name": "myfitness", "status": "warming"}]
        self.format_({"init": {"mcp_servers": servers}}, "알 수 없는 MCP 상태")

    def test_split_init_line_passes(self):
        self.set_scenario(default={"tools": ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"], "splitInit": True})
        r = self.run_x1()
        self.assertIn("J2 통과", r.stdout)
        self.assertEqual(r.stdout.count("init 통과"), 6)

    def test_second_question_init_violation(self):
        ok = {"tools": ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"]}
        r = self.cut({"init": {"plugins": [{"name": "p"}]}}, "X2 교차 · 실패(init)", replies_before=(ok,))
        self.assertIn("X1 교차 · 완료", r.stdout)
        self.assertIn("X3 교차 · 미실행(init 실패)", r.stdout)
        self.assertIn("J2 실패", r.stdout)


class Probe(Base):
    def test_main_probes_again_before_recording(self):
        # 회귀: #634 재리뷰 major 1 — 본 실행은 기록 직전에 같은 락 아래 탐침을 다시 한다 · 실패면 횟수에 안 든 채 멈춘다
        r = self.run_x1()
        self.assertEqual(len(self.probes()), 1)
        self.assertIn("init 탐침: 통과", r.stdout)
        self.calls.write_text("")
        (self.x1 / "state.json").unlink()
        self.seed_probe()
        self.set_scenario(probe={"init": {"plugins": [{"name": "p"}]}})
        self.assert_stopped(self.run_x1(), "init 탐침이 통과하지 않았다")
        self.assertEqual(self.state()["runs"], [])
        self.assertFalse(self.state()["probe"]["ok"])

    def test_probe_reports_user_and_allowlist_change(self):
        self.run_x1("--preflight")
        (self.home / ".claude").mkdir(exist_ok=True)
        (self.home / ".claude" / "settings.json").write_text(json.dumps({"enabledPlugins": {"p@m": True}}))
        r = self.run_x1("--preflight")
        self.assertIn("직전 탐침 대비 user 범위 다름 · 허용 목록 같음", r.stdout)

    def test_probe_timeout(self):
        self.set_scenario(probe={"initDelayMs": 5000})
        r = self.run_x1("--preflight", X1_PROBE_TIMEOUT_MS="300")
        self.assert_stopped(r, "init 탐침이 통과하지 않았다")
        self.assertIn("init 탐침: 형식(init 없음)", r.stdout)

    """회귀: #634 9-1 major 2 — 사전 판정이 같은 인자로 init 탐침을 하고, 본 실행은 같은 CLI 버전의 탐침 통과를 요구한다."""

    def test_probe_kills_on_init_and_records(self):
        r = self.run_x1("--preflight")
        self.assertEqual(r.returncode, 0, r.stdout)
        p = self.probes()
        self.assertEqual(len(p), 1)
        for k in ("--strict-mcp-config", "--no-session-persistence", "--setting-sources"):
            self.assertIn(k, p[0]["argv"])
        self.assertFalse(Path(str(self.calls) + ".tool").exists(), "탐침은 init 에서 끊는다")
        self.assertIn("모델 응답 없음", r.stdout)

    def test_probe_violation_stops_and_records_fail(self):
        self.set_scenario(probe={"init": {"plugins": [{"name": "p"}]}})
        self.assert_stopped(self.run_x1("--preflight"), "init 탐침이 통과하지 않았다")
        self.assertFalse(self.state()["probe"]["ok"])
        self.assert_stopped(self.run_x1(), "init 탐침 통과가 없다")

    def test_probe_model_reply_is_reported(self):
        self.set_scenario(probe={"firstLine": json.dumps({"type": "assistant", "message": {"content": []}})})
        r = self.run_x1("--preflight")
        self.assertIn("init 탐침: 형식(init 없음)", r.stdout)
        self.assertIn("모델 응답 있음", r.stdout)

    def test_main_needs_probe_of_same_version(self):
        (self.x1 / "state.json").unlink()
        self.assert_stopped(self.run_x1(), "같은 CLI 버전(2.1.308)의 init 탐침 통과가 없다")
        self.seed_probe(version="2.1.300")
        self.assert_stopped(self.run_x1(), "같은 CLI 버전(2.1.308)의 init 탐침 통과가 없다")
        self.seed_probe(ok=False)
        self.assert_stopped(self.run_x1(), "init 탐침 통과가 없다")
        self.run_x1("--preflight")
        r = self.run_x1()
        self.assertIn("결과: 실행 끝", r.stdout)


class Q131Ledger(Base):
    def test_ledger_change_fails_j2(self):
        self.set_scenario(replies=[{"tools": ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"],
                                    "dbSet": {"app": "fin", "model": "Holding", "rows": [{"id": 1, "v": "b", "updatedAt": "2026-11-01T00:00:00Z"}]}}])
        r = self.run_x1()
        self.assertIn("원장 대조 다름 1/17", r.stdout)  # 행 수·시각이 같아도 내용 지문이 다르면 잡는다
        self.assertIn("J2 실패", r.stdout)

    def test_db_failure_after_questions_fails_j2(self):
        self.set_scenario(replies=[{"tools": ["mcp__myfinance__get_portfolio", "mcp__myfitness__get_sleep"],
                                    "dbSet": {"app": "fin", "model": "Budget", "rows": "not-a-list"}}])
        r = self.run_x1()
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("원장 대조 다름 ?(실행 뒤 조회 실패)/17", r.stdout)
        self.assertIn("J2 실패", r.stdout)
        self.assertNotIn("질문 0", r.stdout)

    def test_db_failure_stops_without_leaking(self):
        (self.app_dir("fit") / "db-fail").touch()
        self.assert_stopped(self.run_x1(), "Q131: fit DB 조회 실패(TypeError)")

    def test_fit_needs_generated_client(self):
        # 회귀: PR #633 Codex P1 — fit 은 @prisma/client 에 모델이 없다. 생성 클라이언트가 없으면 @prisma/client 가 있어도 멈춘다
        a = self.app_dir("fit")
        shutil.rmtree(a / "src" / "generated")
        pc = a / "node_modules" / "@prisma" / "client"
        pc.mkdir(parents=True)
        (pc / "index.js").write_text(FAKE_PRISMA)
        self.assert_stopped(self.run_x1(), "Q131: fit DB 조회 실패")
        (a / "node_modules" / ".bin" / "tsx").unlink()
        self.assert_stopped(self.run_x1(), "Q131: fit tsx 없음")

    def test_missing_ledger_model_stops(self):
        s = self.app_dir("fit") / COPY[3]
        s.write_text(s.read_text().replace("model TrainingWorkout {", "model TrainingWorkoutX {"))
        self.assert_stopped(self.run_x1(), "Q131: fit 스키마에 원장 모델이 없다")


class Rerun(Base):
    def test_second_main_refused(self):
        self.run_x1()
        self.assert_calls_reset()
        self.assert_stopped(self.run_x1(), "재실행: 본 실행은 이미 있다")

    def assert_calls_reset(self):
        self.calls.write_text("")

    def test_prompt_rerun_once(self):
        self.run_x1()
        self.assert_calls_reset()
        self.assert_stopped(self.run_x1("--rerun=prompt"), "입력: knowledge.txt 없음")
        k = self.x1 / "knowledge.txt"
        k.write_text("KNOWLEDGE-K2 줄")
        k.chmod(0o600)
        r = self.run_x1("--rerun=prompt")
        self.assertEqual(r.returncode, 0, r.stdout)
        asks = self.asks()
        self.assertEqual(len(asks), 4)  # 교차만
        sp = asks[0]["argv"][asks[0]["argv"].index("--system-prompt") + 1]
        self.assertIn("KNOWLEDGE-K2", sp)
        self.assertNotIn("KNOWLEDGE-K2", r.stdout)
        self.assertIn("재실행: 남은 0회", r.stdout)
        self.assert_calls_reset()
        self.assert_stopped(self.run_x1("--rerun=resume"), "재실행: 이미 1회 했다")

    def test_budget_and_resume_select_questions(self):
        self.set_scenario(replies=[{"tools": [], "subtype": "error_max_budget_usd", "cost": 1.1},
                                   {"tools": [], "cost": 1.0}, {"tools": [], "cost": 1.0}])
        self.run_x1()  # X1 판정 불가 · X2 · X3 완료 · X4 미실행(누적 3.1)
        self.assertEqual(self.state()["runs"][0]["status"]["X4"], "미실행")
        self.assert_calls_reset()
        self.assert_stopped(self.run_x1("--rerun=budget"), "--max-budget 은 1 초과 2 이하")
        self.assert_stopped(self.run_x1("--rerun=resume", "--max-budget=1.5"), "--max-budget 은 --rerun=budget 에만")
        self.set_scenario()
        r = self.run_x1("--rerun=budget", "--max-budget=1.5")
        asks = self.asks()
        self.assertEqual([a["stdin"].split("사용자 질문: ")[1][:11] for a in asks], ["Q-SECRET-X1", "Q-SECRET-X4"])
        self.assertEqual(asks[0]["argv"][asks[0]["argv"].index("--max-budget-usd") + 1], "1.5")
        self.assertIn("재실행(budget)", r.stdout)

    def test_rerun_after_j2_fail_refused(self):
        self.set_scenario(replies=[{"tools": ["mcp__myfinance__delete_asset"]}])
        self.run_x1()
        self.assert_calls_reset()
        self.assert_stopped(self.run_x1("--rerun=prompt"), "본 실행 J2 가 통과가 아니다")

    def test_question_file_change_refused(self):
        self.run_x1()
        self.assert_calls_reset()
        self.questions({i: f"Q-SECRET-{i} 바뀜" for i in ("X1", "X2", "X3", "X4", "D1", "D2")})
        self.assert_stopped(self.run_x1("--rerun=resume"), "질문 파일이 본 실행과 다르다")


class Inputs(Base):
    def test_question_file_permissions_and_shape(self):
        self.questions({i: "q" for i in ("X1", "X2", "X3", "X4", "D1", "D2")}, mode=0o644)
        self.assert_stopped(self.run_x1(), "입력: questions.txt 권한이 600 이 아니다")
        self.questions({i: "q" for i in ("X1", "X2", "X3", "X4", "D1")})
        self.assert_stopped(self.run_x1(), "입력: D2 질문이 없다")
        (self.x1 / "questions.txt").write_text("머리 앞 글\n## X1\nq\n")
        self.assert_stopped(self.run_x1(), "첫 질문 머리(## X1) 앞에 글이 있다")

    def test_private_dir_permission_checked_not_changed(self):
        self.private.chmod(0o755)
        self.assert_stopped(self.run_x1(), "비공개 디렉터리 권한이 700 이 아니다")
        self.assertEqual(self.private.stat().st_mode & 0o777, 0o755)

    def test_exception_keeps_form_and_marks_state(self):
        r = self.run_x1(X1_TEST_THROW="X2")
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("X1 교차 · 완료", r.stdout)
        self.assertEqual(r.stdout.count("결과: 실패 — 예외 ETEST"), 1)
        self.assertEqual(self.state()["runs"][0]["j2"], "예외 종료")
        self.assertTrue(list((self.x1 / "runs").glob("*/form.txt")))
        self.calls.write_text("")
        self.assert_stopped(self.run_x1("--rerun=resume"), "본 실행 J2 가 통과가 아니다")

    def test_install_inside_git_refused(self):
        (self.inst / ".git").mkdir()
        self.assert_stopped(self.run_x1(), "설치: 스크립트가 체크아웃 안에 있다")

    def test_usage(self):
        r = subprocess.run(["bash", str(self.inst / "run-x1.sh"), "--rerun=all"], env=self.env(), capture_output=True, text=True)
        self.assertEqual(r.returncode, 2)


if __name__ == "__main__":
    unittest.main()
