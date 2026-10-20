"""루트 deploy/ — 서버 배포 스크립트 · pm2 설정 · 상태 경로 · .env 템플릿 (#176 · 007 T-1b).

실행: python3 -m unittest discover -s deploy
서버 경로(pm2·빌드)는 로컬에서 돌리지 않는다 — deploy.sh 는 Darwin 에서 --dry-run 만 허용한다(I-3).
"""

import json
import platform
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
SCRIPT = HERE / "deploy.sh"
CONFIG = HERE / "pleiades.config.cjs"
PRECHECK_NAME = re.compile(r"pleiades-(fin|fit)-[a-z]+")  # tools/local/precheck.py 와 같은 꼴
DIRS = {"fin": "finance", "fit": "fitness"}
FIN_PORTS = {"PORT": "4510", "MCP_PORT": "4511"}
FIT_PORTS = {"PORT": "4520", "MCP_PORT": "4521"}


def _git(root: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True)


class FakeRoot:
    """pleiades 체크아웃 흉내 — deploy/ 사본 · 루트 package.json · 앱 .env · git 저장소."""

    def __init__(self, *, name="pleiades", fin=FIN_PORTS, fit=FIT_PORTS, mcp_url_port="4511", tag="v0.1.0"):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        shutil.copytree(HERE, self.root / "deploy", ignore=shutil.ignore_patterns("__pycache__", "test_*.py"))
        (self.root / "package.json").write_text(json.dumps({"name": name, "private": True}))
        for app, ports in (("fin", fin), ("fit", fit)):
            d = self.root / "apps" / DIRS[app]
            d.mkdir(parents=True)
            if ports is not None:
                (d / ".env").write_text("".join(f"{k}={v}\n" for k, v in ports.items()))
        cfg = self.root / "apps/finance/src/lib/ai"
        cfg.mkdir(parents=True)
        (cfg / "mcp-config.json").write_text(json.dumps(
            {"mcpServers": {"myfinance": {"type": "http", "url": f"http://127.0.0.1:{mcp_url_port}/mcp"}}}))
        _git(self.root, "init", "-q")
        _git(self.root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "x")
        if tag:
            _git(self.root, "tag", tag)

    def close(self):
        self.tmp.cleanup()


def load_config(root: Path, app: str, env: dict | None = None) -> subprocess.CompletedProcess:
    cwd = root / "apps" / DIRS[app] if app in DIRS else root
    code = f"process.stdout.write(JSON.stringify(require({json.dumps(str(root / 'deploy/pleiades.config.cjs'))})))"
    return subprocess.run(["node", "-e", code], cwd=cwd, capture_output=True, text=True,
                          env={"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", **(env or {})})


def deploy(root: Path, *args: str, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(["bash", str(root / "deploy/deploy.sh"), *args], cwd=root, capture_output=True, text=True,
                          env={"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", **(env or {})})


class Config(unittest.TestCase):
    def setUp(self):
        self.fake = FakeRoot()
        self.root = self.fake.root

    def tearDown(self):
        self.fake.close()

    def apps(self, app, env=None):
        r = load_config(self.root, app, env)
        self.assertEqual(r.returncode, 0, r.stderr)
        return {a["name"]: a for a in json.loads(r.stdout)["apps"]}

    def test_fin_defines_three_roles_in_its_own_dir(self):
        apps = self.apps("fin")
        self.assertEqual(set(apps), {"pleiades-fin-web", "pleiades-fin-bot", "pleiades-fin-mcp"})
        for a in apps.values():
            self.assertEqual(Path(a["cwd"]).resolve(), (self.root / "apps/finance").resolve())
        self.assertEqual(apps["pleiades-fin-web"]["args"], "start -p 4510")
        self.assertEqual(str(apps["pleiades-fin-web"]["env"]["PORT"]), "4510")
        self.assertEqual(apps["pleiades-fin-mcp"]["env"]["MCP_PORT"], "4511")
        self.assertEqual(apps["pleiades-fin-mcp"]["env"]["MCP_TRANSPORT"], "http")

    def test_fit_sets_tz_and_shares_mcp_port_with_bot(self):
        apps = self.apps("fit")
        self.assertEqual(set(apps), {"pleiades-fit-web", "pleiades-fit-bot", "pleiades-fit-mcp"})
        for a in apps.values():
            self.assertEqual(a["env"]["TZ"], "Asia/Seoul")
            self.assertEqual(Path(a["cwd"]).resolve(), (self.root / "apps/fitness").resolve())
        self.assertEqual(apps["pleiades-fit-bot"]["env"]["MCP_PORT"], "4521")
        self.assertEqual(apps["pleiades-fit-mcp"]["env"]["MCP_PORT"], "4521")

    def test_fit_mcp_gets_web_url_from_port(self):
        # 회귀: PR #179 Codex P2 — MCP 의 웹 API 기본값은 localhost:4200 고정이라 다른 PORT 에서 Garmin 경유 도구가 끊긴다
        self.assertEqual(self.apps("fit")["pleiades-fit-mcp"]["env"]["APP_BASE_URL"], "http://localhost:4520")
        self.assertEqual(self.apps("fit", {"APP_BASE_URL": "http://127.0.0.1:9"})["pleiades-fit-mcp"]["env"]["APP_BASE_URL"],
                         "http://127.0.0.1:9")

    def test_only_the_cwd_app_is_defined(self):
        # run.sh 의 check_env 는 cwd 앱만 검사한다 — 다른 앱 정의가 섞이면 검사 밖 env 로 뜬다 (#171)
        self.assertTrue(all(n.startswith("pleiades-fin-") for n in self.apps("fin")))

    def test_names_match_precheck_allowlist(self):
        for app in DIRS:
            for name in self.apps(app):
                self.assertRegex(name, PRECHECK_NAME)

    def test_shell_env_wins_over_dotenv(self):
        # dotenv 는 이미 있는 process.env 를 덮지 않는다 — check_env.effective_env 와 같은 우선순위
        apps = self.apps("fin", {"PORT": "4530"})
        self.assertEqual(apps["pleiades-fin-web"]["args"], "start -p 4530")

    def test_refuses_without_ports(self):
        for missing in ("PORT", "MCP_PORT"):
            with self.subTest(missing=missing):
                env = {k: v for k, v in FIN_PORTS.items() if k != missing}
                (self.root / "apps/finance/.env").write_text("".join(f"{k}={v}\n" for k, v in env.items()))
                r = load_config(self.root, "fin")
                self.assertNotEqual(r.returncode, 0)
                self.assertIn(missing, r.stderr)

    def test_refuses_bad_or_equal_ports(self):
        for env in ({"PORT": "abc"}, {"MCP_PORT": "45 11"}, {"PORT": "4511"}, {"PORT": "0"}):
            with self.subTest(env=env):
                self.assertNotEqual(load_config(self.root, "fin", env).returncode, 0)

    def test_refuses_outside_app_dir(self):
        r = load_config(self.root, "none")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("apps/", r.stderr)

    def test_filename_is_not_an_ecosystem_file(self):
        # I-19 정규식(훅)과 분리 — 인계 2026-10-19 결정
        self.assertNotRegex(CONFIG.name, r"ecosystem\.config\.[cm]?js$")


@unittest.skipUnless(shutil.which("git") and shutil.which("node"), "git·node 필요")
class DeployDryRun(unittest.TestCase):
    def setUp(self):
        self.fake = FakeRoot()
        self.root = self.fake.root

    def tearDown(self):
        self.fake.close()

    def test_usage(self):
        self.assertEqual(deploy(self.root).returncode, 2)

    def test_unknown_app_or_flag(self):
        self.assertNotEqual(deploy(self.root, "web", "--dry-run").returncode, 0)
        self.assertNotEqual(deploy(self.root, "fin", "--dry-run", "--force").returncode, 0)

    def test_fin_plan(self):
        r = deploy(self.root, "fin", "--dry-run")
        self.assertEqual(r.returncode, 0, r.stderr)
        out = r.stdout
        self.assertIn("v0.1.0", out)
        for step in ("npm ci", "prisma migrate status", "next build", "build:mcp:staged", "build:bot",
                     "pleiades-fin-mcp", "pleiades-fin-web", "pleiades-fin-bot", "pm2 save"):
            self.assertIn(step, out)
        self.assertNotIn("migrate deploy", out)
        self.assertNotIn("startOrReload", out)  # #170 — 웹도 restart
        self.assertLess(out.index("pleiades-fin-mcp"), out.index("pleiades-fin-web"))
        self.assertLess(out.index("pleiades-fin-web"), out.index("pleiades-fin-bot"))

    def test_fit_plan(self):
        r = deploy(self.root, "fit", "--dry-run")
        self.assertEqual(r.returncode, 0, r.stderr)
        for step in ("prisma generate", "build:staged", "pleiades-fit-mcp", "4521"):
            self.assertIn(step, r.stdout)

    def test_build_only_has_no_pm2(self):
        r = deploy(self.root, "fin", "--dry-run", "--build-only")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn("pm2", r.stdout)
        self.assertIn("build:bot", r.stdout)

    def test_build_only_needs_no_service_db(self):
        # 회귀: #176 사전 리뷰 major 1 — T-4 는 더미 DB 라 migrate status·fin prerender 가 실패한다(007 T-4 · Q84 ①)
        r = deploy(self.root, "fin", "--dry-run", "--build-only")
        self.assertNotIn("migrate status", r.stdout)
        self.assertNotIn("next build", r.stdout.replace("next build 생략", ""))
        self.assertIn("build:mcp:staged", r.stdout)
        r = deploy(self.root, "fit", "--dry-run", "--build-only")
        self.assertNotIn("migrate status", r.stdout)
        self.assertIn("build:staged", r.stdout)

    def test_full_plan_checks_occupancy_first_and_stability(self):
        out = deploy(self.root, "fin", "--dry-run").stdout
        self.assertLess(out.index("점유 검사"), out.index("npm ci"))
        for name in ("pleiades-fin-mcp", "pleiades-fin-web", "pleiades-fin-bot"):
            self.assertIn(f"pm2 상태 확인 {name}", out)

    def test_refuses_untagged_head_unless_allowed(self):
        _git(self.root, "tag", "-d", "v0.1.0")
        self.assertNotEqual(deploy(self.root, "fin", "--dry-run").returncode, 0)
        self.assertEqual(deploy(self.root, "fin", "--dry-run", "--allow-untagged").returncode, 0)

    def test_refuses_non_release_tag(self):
        _git(self.root, "tag", "-d", "v0.1.0")
        _git(self.root, "tag", "fin-v1")
        self.assertNotEqual(deploy(self.root, "fin", "--dry-run").returncode, 0)

    def test_refuses_outside_pleiades_checkout(self):
        self.fake.close()
        self.fake = FakeRoot(name="myfinance")
        self.assertNotEqual(deploy(self.fake.root, "fin", "--dry-run").returncode, 0)

    def test_refuses_missing_ports(self):
        self.fake.close()
        self.fake = FakeRoot(fin=None)
        r = deploy(self.fake.root, "fin", "--dry-run")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("PORT", r.stderr)

    def test_refuses_preflight_equal_to_mcp_port(self):
        r = deploy(self.root, "fin", "--dry-run", env={"PLEIADES_PREFLIGHT_PORT": "4511"})
        self.assertNotEqual(r.returncode, 0)

    def test_fin_mcp_port_must_match_advisor_config(self):
        # fin advisor 는 src/lib/ai/mcp-config.json 의 url 포트를 쓴다(007 ⑫) — MCP_PORT 와 다르면 AI 가 끊긴다
        self.fake.close()
        self.fake = FakeRoot(mcp_url_port="4210")
        r = deploy(self.fake.root, "fin", "--dry-run")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("mcp-config", r.stderr)

    @unittest.skipUnless(platform.system() == "Darwin", "로컬(Darwin) 차단 확인")
    def test_local_machine_allows_only_dry_run(self):
        for extra in ((), ("--build-only",)):
            with self.subTest(extra=extra):
                r = deploy(self.root, "fin", *extra)
                self.assertNotEqual(r.returncode, 0)
                self.assertIn("I-3", r.stderr)


PM2_STUB = r"""#!/usr/bin/env node
// pm2 흉내 — 상태는 $STUB/state.json · 호출은 $STUB/log
const fs = require('fs'), path = require('path')
const dir = process.env.STUB, file = path.join(dir, 'state.json')
const st = { online: {}, restarts: {}, reg: {}, ...(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {}) }
const argv = process.argv.slice(2)
fs.appendFileSync(path.join(dir, 'log'), 'pm2 ' + argv.join(' ') + '\n')
const preset = Object.fromEntries((process.env.STUB_PRESET || '').split(',').filter(Boolean).map((p) => p.split('=')))
const flap = (process.env.STUB_FLAP || '').split(',')
const only = argv[argv.indexOf('--only') + 1]
if (argv[0] === 'jlist') {
  const names = new Set([...Object.keys(preset), ...Object.keys(st.online)])
  const list = [...names].map((name) => {
    if (flap.includes(name)) st.restarts[name] = (st.restarts[name] || 0) + 1
    const args = name.endsWith('-web') && st.reg[name] ? ['start', '-p', st.reg[name]] : []
    return { name, pm2_env: { status: st.online[name] ? 'online' : preset[name] || 'stopped', restart_time: st.restarts[name] || 0, args } }
  })
  process.stdout.write(JSON.stringify(list))
} else if (['start', 'startOrRestart'].includes(argv[0])) {
  st.online[only] = true
  // pm2 는 이미 등록된 앱의 args 를 유지한다(PR #177 Codex P2) — 처음 등록할 때만 새 포트
  if (only.endsWith('-web') && !st.reg[only]) st.reg[only] = process.env.STUB_WEB_NEW || '4510'
} else if (argv[0] === 'stop') delete st.online[argv[1]]
else if (argv[0] === 'delete') { delete st.online[argv[1]]; delete st.reg[argv[1]] }
fs.writeFileSync(file, JSON.stringify(st))
"""

CURL_STUB = r"""#!/usr/bin/env node
// curl 흉내 — 포트가 "들으면" 0, 아니면 7. 듣는 포트 = STUB_FOREIGN · 이름→포트(STUB_BIND) 중 online · pre-flight 표지
const fs = require('fs'), path = require('path')
const dir = process.env.STUB
const port = process.argv.find((a) => a.startsWith('http://')).split(':')[2].split('/')[0]
const st = { online: {}, reg: {}, ...(fs.existsSync(path.join(dir, 'state.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'state.json'))) : {}) }
const foreign = (process.env.STUB_FOREIGN || '').split(',')
if (foreign.includes(port)) process.exit(Number(process.env.STUB_FOREIGN_RC || 0))  // 52 = 빈 응답 · 연결은 됐다
const bound = (process.env.STUB_BIND || '').split(',').filter(Boolean).map((p) => p.split('='))
const up = bound.some(([n, p]) => st.online[n] && (n.endsWith('-web') ? st.reg[n] : p) === port) ||
  (port === process.env.STUB_PREFLIGHT && fs.existsSync(path.join(dir, 'preflight-up')))
process.exit(up ? 0 : 7)
"""

LOGGING_STUB = """#!/bin/bash
echo "$(basename "$0") $*" >> "$STUB/log"
if [[ "$(basename "$0") $1 $2 $3" == "npx prisma migrate status" ]]; then
  printf '%s\\n' "${STUB_MIGRATE_OUT-Database schema is up to date!}"
  exit "${STUB_MIGRATE_RC:-0}"
fi
"""


@unittest.skipUnless(shutil.which("git") and shutil.which("node"), "git·node 필요")
class ServerPathWithStubs(unittest.TestCase):
    """서버 경로의 판정 로직 — uname·npm·npx·pm2·curl·sleep 을 PATH 스텁으로 바꿔 실제 프로세스·포트를 쓰지 않는다."""

    def setUp(self):
        self.fake = FakeRoot()
        self.root = self.fake.root
        self.stub = self.root / "_stub"
        self.stub.mkdir()
        for name, body in (("pm2", PM2_STUB), ("curl", CURL_STUB), ("npm", LOGGING_STUB), ("npx", LOGGING_STUB),
                           ("uname", "#!/bin/sh\necho Linux\n"), ("sleep", "#!/bin/sh\nexec /bin/sleep 0.05\n")):
            (self.stub / name).write_text(body)
            (self.stub / name).chmod(0o755)
        mcp = self.root / "apps/finance/dist/mcp"
        mcp.mkdir(parents=True)
        (mcp / "server.staged.cjs").write_text(
            "require('fs').writeFileSync(process.env.STUB + '/preflight-up', '');"
            "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000)\n")

    def tearDown(self):
        self.fake.close()

    def run_fin(self, **env):
        base = {"PATH": f"{self.stub}:/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", "STUB": str(self.stub),
                "STUB_PREFLIGHT": "4299", "STUB_BIND": "pleiades-fin-mcp=4511,pleiades-fin-web=4510"}
        r = deploy(self.root, "fin", env={**base, **env})
        log = (self.stub / "log").read_text() if (self.stub / "log").exists() else ""
        return r, log

    def test_happy_path_order(self):
        r, log = self.run_fin()
        self.assertEqual(r.returncode, 0, r.stderr)
        calls = [l for l in log.splitlines() if not l.startswith("pm2 jlist")]
        order = [c for c in calls if c.startswith(("pm2 start", "pm2 save", "pm2 delete"))]
        self.assertEqual([c.split(" --only ")[-1].split()[0] if "--only" in c else c for c in order], [
            "pleiades-fin-mcp", "pm2 save --force", "pleiades-fin-web", "pm2 delete pleiades-fin-bot",
            "pleiades-fin-bot", "pm2 save --force"])
        self.assertLess(log.index("npx prisma migrate status"), log.index("npx --no-install next build"))
        self.assertLess(log.index("npm run build:mcp:activate"), log.index("pm2 startOrRestart"))

    def test_pending_migration_stops_before_build(self):
        for env in ({"STUB_MIGRATE_RC": "1"},
                    {"STUB_MIGRATE_OUT": "Following migration have not yet been applied:"}):
            with self.subTest(env=env):
                (self.stub / "log").unlink(missing_ok=True)
                r, log = self.run_fin(**env)
                self.assertNotEqual(r.returncode, 0)
                self.assertNotIn("next build", log)
                self.assertNotIn("pm2 start", log)

    def test_old_service_online_stops_before_anything(self):
        # 회귀: #176 사전 리뷰 major 2 — T-5c ④ 를 빠뜨리면 옛 MCP 가 같은 포트로 health 에 대신 응답한다
        r, log = self.run_fin(STUB_PRESET="myfinance-mcp=online")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("myfinance-mcp", r.stderr)
        self.assertNotIn("npm ci", log)

    def test_foreign_listener_on_service_port_stops(self):
        for port in ("4511", "4510"):
            with self.subTest(port=port):
                (self.stub / "log").unlink(missing_ok=True)
                r, log = self.run_fin(STUB_FOREIGN=port)
                self.assertNotEqual(r.returncode, 0)
                self.assertIn(port, r.stderr)
                self.assertNotIn("npm ci", log)

    def test_own_online_process_may_hold_its_port(self):
        # 재배포 — 포트를 잡은 것이 online 인 pleiades-fin-* 자신이면 진행한다
        self.seed(web_port="4510")
        r, log = self.run_fin()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn("pm2 delete pleiades-fin-web", log)

    def seed(self, *, web_port: str) -> None:
        (self.stub / "state.json").write_text(json.dumps({
            "online": {"pleiades-fin-mcp": True, "pleiades-fin-web": True}, "restarts": {},
            "reg": {"pleiades-fin-web": web_port}}))

    def test_non_http_listener_counts_as_occupied(self):
        # 회귀: PR #177 Codex P2 — HTTP 가 아니거나 빈 응답(curl 52)인 리스너를 "비었다" 로 읽었다
        r, log = self.run_fin(STUB_FOREIGN="4511", STUB_FOREIGN_RC="52")
        self.assertNotEqual(r.returncode, 0)
        self.assertNotIn("npm ci", log)

    def test_web_port_change_recreates_web(self):
        # 회귀: PR #177 Codex P2 — startOrRestart 는 등록된 args(-p 옛 포트)를 유지한다
        self.seed(web_port="4500")
        r, log = self.run_fin()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertLess(log.index("pm2 delete pleiades-fin-web"), log.index("--only pleiades-fin-web"))

    def test_web_not_listening_on_configured_port_fails(self):
        r, log = self.run_fin(STUB_WEB_NEW="4999")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("pm2 stop pleiades-fin-web", log)
        self.assertNotIn("pleiades-fin-bot", log)

    def test_crash_looping_mcp_is_stopped_and_web_untouched(self):
        r, log = self.run_fin(STUB_FLAP="pleiades-fin-mcp")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("pm2 stop pleiades-fin-mcp", log)
        self.assertNotIn("pleiades-fin-web", log.split("pm2 stop pleiades-fin-mcp")[1])
        self.assertIn("새 빌드", r.stderr)  # 회귀: major 3 — "운영 무변경" 이 아니다

    def test_preflight_failure_keeps_old_mcp_dist(self):
        (self.root / "apps/finance/dist/mcp/server.staged.cjs").write_text("process.exit(1)\n")
        r, log = self.run_fin()
        self.assertNotEqual(r.returncode, 0)
        self.assertNotIn("build:mcp:activate", log)
        self.assertNotIn("pm2 start", log)
        self.assertIn("새 빌드", r.stderr)
        self.assertFalse((self.root / "apps/finance/dist/mcp/server.staged.cjs").exists())


class ScriptText(unittest.TestCase):
    TEXT = SCRIPT.read_text()
    CODE = "\n".join(l for l in TEXT.splitlines() if not l.lstrip().startswith("#"))

    def test_no_tree_cleanup_or_tag_push(self):
        # 007 4-1 정정 1 · [A2] 2-B — P-2 심링크를 지우는 명령 · I-16
        for bad in (r"git\s+clean", r"add\s+-A", r"--tags", r"checkout\s+-f", r"git\s+(fetch|pull|reset|stash)"):
            self.assertNotRegex(self.CODE, bad)

    def test_no_migrate_deploy_and_no_service_files(self):
        # 정정 5 — 첫 전환은 검사만 · I-19 — 서비스 배포 파일 실행 금지
        self.assertNotRegex(self.CODE, r"migrate\s+deploy")
        self.assertNotIn("ecosystem.config", self.CODE)
        self.assertNotRegex(self.CODE, r"apps/[^/\s]+/deploy/")


class GitignoreStatePaths(unittest.TestCase):
    # 007 4-2 정정 1 — 끝 `/` 없는 경로라야 P-2 심링크도 무시된다
    PATHS = ["apps/finance/reports", "apps/finance/logs", "apps/finance/backups", "apps/fitness/.garmin-tokens",
             "apps/fitness/.omron-tokens", "apps/fitness/.runtime", "apps/fitness/logs"]

    def test_symlink_paths_are_ignored_by_root_gitignore(self):
        # 스크래치 저장소에 루트 .gitignore 만 두고 심링크를 만든다 — 실제 디렉터리는 앱 .gitignore 가 먼저 잡는다
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _git(root, "init", "-q")
            shutil.copy(REPO / ".gitignore", root / ".gitignore")
            for p in self.PATHS:
                (root / p).parent.mkdir(parents=True, exist_ok=True)
                (root / p).symlink_to("/nonexistent/pleiades-state")
            status = subprocess.run(["git", "-C", tmp, "status", "--porcelain", "--untracked-files=all"],
                                    capture_output=True, text=True, check=True).stdout
            self.assertEqual(status.strip(), "?? .gitignore")
            for p in self.PATHS:
                with self.subTest(path=p):
                    r = subprocess.run(["git", "-C", tmp, "check-ignore", "-v", p], capture_output=True, text=True)
                    self.assertTrue(r.stdout.startswith(".gitignore:"), r.stdout)


class EnvTemplates(unittest.TestCase):
    KEY = re.compile(r"^([A-Z_][A-Z0-9_]*)=(.*)$")
    OPTIONAL = re.compile(r"^# ([A-Z_][A-Z0-9_]*)=")  # 선택 키 — 값을 넣을 때만 주석을 푼다
    # 코드가 `process.env.X ?? 기본값` — 빈 값('')이면 기본값이 아니라 '' 가 쓰인다(#178 실측)
    DEFAULT_BEARING = {
        "finance": {"MCP_CONFIG_PATH", "MYFINANCE_ROOT", "MCP_TRANSPORT", "MCP_LOG_DIR", "MCP_LOG_LEVEL",
                    "MCP_LOG_RETENTION_DAYS"},
        "fitness": {"SYNC_CRON", "REPORT_CRON", "MORNING_REPORT_CRON", "EVENING_REPORT_CRON", "AUTO_ADJUST_CRON",
                    "AUTO_ADJUST_MAINTENANCE_CRON", "MCP_TRANSPORT", "MCP_LOG_DIR", "MCP_LOG_LEVEL",
                    "MCP_LOG_RETENTION_DAYS", "APP_BASE_URL"},
    }

    def parse(self, path: Path) -> tuple[dict[str, str], set[str]]:
        active, optional = {}, set()
        for line in path.read_text().splitlines():
            m = self.OPTIONAL.match(line)
            if m:
                optional.add(m.group(1))
                continue
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            m = self.KEY.match(line)
            self.assertIsNotNone(m, f"{path.name}: {line!r}")
            active[m.group(1)] = m.group(2)
        return active, optional

    def example_keys(self, d: str) -> set[str]:
        return {m.group(1) for line in (REPO / f"apps/{d}/.env.example").read_text().splitlines()
                if (m := self.KEY.match(line))}

    def test_templates_have_no_values(self):
        for d in DIRS.values():
            with self.subTest(app=d):
                active, _ = self.parse(HERE / f"env/{d}.env.template")
                self.assertEqual({k: v for k, v in active.items() if v}, {})

    def test_templates_cover_app_examples_and_ports(self):
        for d in DIRS.values():
            with self.subTest(app=d):
                active, optional = self.parse(HERE / f"env/{d}.env.template")
                self.assertLessEqual(self.example_keys(d), set(active) | optional)
                self.assertLessEqual({"PORT", "MCP_PORT", "DATABASE_URL"}, set(active))

    def test_default_bearing_keys_are_commented_out(self):
        # 회귀: #178 — `KEY=` 로 두면 fit 크론 '' → node-cron 오류(봇 crash-loop) · MCP_TRANSPORT '' 등
        for d, keys in self.DEFAULT_BEARING.items():
            with self.subTest(app=d):
                active, optional = self.parse(HERE / f"env/{d}.env.template")
                self.assertFalse(keys & set(active), keys & set(active))
                self.assertLessEqual(keys, optional)

    def test_platform_keys_stay_in_root_env(self):
        # 플랫폼 키는 루트 .env 한 곳(PLEIADES_ENV_FILE) — 앱 .env 에 두면 루트 값을 가린다 (#143)
        for d in DIRS.values():
            with self.subTest(app=d):
                active, optional = self.parse(HERE / f"env/{d}.env.template")
                self.assertFalse([k for k in set(active) | optional if k.startswith(("NOTIFY_", "DISCORD_"))])


if __name__ == "__main__":
    unittest.main()
