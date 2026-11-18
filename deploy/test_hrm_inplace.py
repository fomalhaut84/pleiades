"""deploy/hermes/hrm-inplace.sh · hermes-key.sh · pleiades-hrm.config.cjs — hermes 수동 배포·정지(014 H-2 · #800).

실행: python3 -m unittest deploy.test_hrm_inplace   (deploy 전체: python3 -m unittest discover -s deploy)
test_adv_inplace.py 의 가짜 서버를 본뜬다 — 서버 명령(pm2 · npm · uname · flock)은 PATH 스텁 · git 은 진짜(임시 bare 원격 + 태그) ·
HOME 은 임시 디렉터리 · 체크아웃은 $HOME/pleiades-hermes.

핵심 계약(014 §3-A A1 · 012 §3-4):
- G-R1 env 고정 · 두 앱 배포와 같은 락·기록 위치 · 락 뒤 fin·fit·**adv** env 대조
- G-R2 pm2 이름 pleiades-hrm-api 하나 · G-R3 락 fd 9 를 자식이 물려받지 않는다
- 포트 가드(N15) · C4 check · C6 health + 상태 파일 갱신 · node 22.5+
"""

import fcntl  # noqa: F401  (flock 스텁이 쓴다 — test_adv_inplace 와 같은 환경 확인)
import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "hermes" / "hrm-inplace.sh"
KEY_SCRIPT = HERE / "hermes" / "hermes-key.sh"
CONFIG = HERE / "hermes" / "pleiades-hrm.config.cjs"
RELEASE = HERE / "release-inplace.sh"
BASE_PATH = "/usr/bin:/bin"
REAL_NODE = shutil.which("node") or "/usr/bin/node"

FD9 = '[ -e /dev/fd/9 ] && echo "fd9 $(basename "$0") $*" >> "$STUB/fd9"\n'

# node — fd9 기록 · 판 흉내(STUB_NODE_VERSION) 뒤 진짜 node
NODE_STUB = ("#!/bin/bash\n" + FD9 +
             'if [[ -n "${STUB_NODE_VERSION:-}" && "$1" == -p && "$2" == process.versions.node ]]; then echo "$STUB_NODE_VERSION"; exit 0; fi\n'
             f'exec {REAL_NODE} "$@"\n')

# pm2 흉내 — fin·fit 6 프로세스 + (선택) adv + hrm(start 가 만들고 delete 가 지운다) · start 가 상태 파일을 쓴다
PM2_STUB = r"""#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const S = process.env.STUB, argv = process.argv.slice(2)
fs.appendFileSync(path.join(S, 'log'), 'pm2 ' + argv.join(' ') + '\n')
const hrmFile = path.join(S, 'hrm.json')
const plat = process.env.HOME + '/pleiades-platform.env'
if (argv[0] === 'jlist') {
  const list = []
  if (process.env.STUB_NO_APPS !== '1') for (const a of ['fin', 'fit']) for (const r of ['web', 'bot', 'mcp']) {
    const name = `pleiades-${a}-${r}`
    const v = process.env.STUB_FIN_DIFF === '1' && name === 'pleiades-fin-bot' ? '/elsewhere' : plat
    list.push({ name, pm2_env: { status: 'online', pm_cwd: '/x', PLEIADES_ENV_FILE: v } })
  }
  if (process.env.STUB_ADV) list.push({ name: 'pleiades-adv-bot', pm2_env: { status: 'online', pm_cwd: '/y', PLEIADES_ENV_FILE: process.env.STUB_ADV === 'diff' ? '/elsewhere' : plat } })
  if (fs.existsSync(hrmFile)) list.push(JSON.parse(fs.readFileSync(hrmFile, 'utf8')))
  process.stdout.write('[PM2][WARN] noise\n' + JSON.stringify(list))
} else if (argv[0] === 'start') {
  if (process.env.STUB_START_FAIL === '1') process.exit(1)
  const cfg = require(path.resolve(argv[1]))
  const app = cfg.apps.find((a) => a.name === argv[argv.indexOf('--only') + 1])
  const env = { PLEIADES_ENV_FILE: process.env.STUB_HRM_ENV === 'diff' ? '/elsewhere' : process.env.PLEIADES_ENV_FILE }
  if (process.env.PLEIADES_PRIVATE_DIR !== undefined) env.PLEIADES_PRIVATE_DIR = process.env.PLEIADES_PRIVATE_DIR
  fs.writeFileSync(hrmFile, JSON.stringify({ name: app.name, pm2_env: { status: process.env.STUB_HRM_STATUS || 'online', pm_cwd: app.cwd, ...env } }))
  if (process.env.STUB_NO_STATE !== '1') {
    fs.mkdirSync(app.env.HERMES_STATE_DIR, { recursive: true })
    fs.writeFileSync(path.join(app.env.HERMES_STATE_DIR, 'state.json'), JSON.stringify({ webhook: process.env.STUB_WEBHOOK === '1' }))
  }
} else if (argv[0] === 'delete') {
  fs.rmSync(hrmFile, { force: true })
}
"""

# npm — build 가 가짜 dist/hermes.cjs 를 만든다(check · health · key 흉내)
NPM_STUB = "#!/bin/bash\n" + FD9 + r"""echo "npm $* @$(basename "$PWD")" >> "$STUB/log"
[[ -n "${STUB_NPM_FAIL:-}" && "$*" == *"$STUB_NPM_FAIL"* ]] && exit 1
if [[ "$*" == "run build" ]]; then
  mkdir -p dist
  cat > dist/hermes.cjs <<'JS'
const [cmd] = process.argv.slice(2)
if (cmd === 'check') {
  console.log('대기열: WAL 예 · queued 0 · dead 0'); console.log('레지스트리: 출처 0 · 오류 아니오')
  console.log('env PORT=' + process.env.PORT + ' state=' + (process.env.HERMES_STATE_DIR || '').endsWith('/pleiades-hermes-data/state'))
  process.exit(Number(process.env.STUB_CHECK_RC || 0))
}
if (cmd === 'health') { const c = process.env.STUB_HEALTH || '200'; console.log('health ' + c); process.exit(c === '200' ? 0 : 1) }
if (cmd === 'key') { console.log('key ' + process.argv.slice(3).join(' ') + ' reg=' + process.env.HERMES_REGISTRY); process.exit(0) }
JS
fi
exit 0
"""
FLOCK_STUB = ("#!/usr/bin/env python3\nimport fcntl, sys\n"
              "try:\n    fcntl.flock(int(sys.argv[2]), fcntl.LOCK_EX | fcntl.LOCK_NB)\n"
              "except OSError:\n    sys.exit(1)\n")


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True,
                          env={**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
                               "GIT_COMMITTER_EMAIL": "t@t"}).stdout.strip()


class Server:
    """가짜 서버 — HOME · 원격(bare) · 두 앱 체크아웃(v1.0.0 · 앱 .env 포트) · 넷째 체크아웃(dev) · 비공개 위치 · 스텁."""

    def __init__(self, tmp: Path):
        self.tmp = tmp
        self.home = tmp / "home"
        self.home.mkdir()
        self.plat = self.home / "pleiades-platform.env"
        self.plat.write_text("")
        self.plat.chmod(0o600)
        self.private = self.home / "pleiades-private"
        self.private.mkdir(mode=0o700)
        for a in ("fin", "fit"):
            (self.private / f"inplace-{a}-last-ok").write_text("v1.0.0\n")
        self.stub = tmp / "stub"
        self.stub.mkdir()
        for name, body in {"node": NODE_STUB, "pm2": PM2_STUB, "npm": NPM_STUB, "flock": FLOCK_STUB,
                           "uname": "#!/bin/sh\necho ${STUB_UNAME:-Linux}\n"}.items():
            p = self.stub / name
            p.write_text(body)
            p.chmod(0o755)
        (self.stub / "log").write_text("")
        (self.home / ".pm2").mkdir()
        (self.home / ".pm2" / "rpc.sock").write_text("")

        work = tmp / "work"
        work.mkdir()
        git(work, "init", "-q", "-b", "dev")
        (work / "package.json").write_text('{"name":"pleiades"}')
        (work / "deploy" / "hermes").mkdir(parents=True)
        for f in (SCRIPT, KEY_SCRIPT, CONFIG):
            shutil.copy(f, work / "deploy" / "hermes" / f.name)
        (work / "apps" / "hermes").mkdir(parents=True)
        (work / "apps" / "hermes" / "a.ts").write_text("0")
        (work / ".gitignore").write_text("node_modules/\ndist/\nlogs/\n.env\n")
        git(work, "add", "-A")
        git(work, "commit", "-qm", "v1.0.0")
        git(work, "tag", "v1.0.0")
        self.work = work
        self.origin = tmp / "origin.git"
        git(tmp, "clone", "-q", "--bare", str(work), str(self.origin))
        for a, d, port, mcp in (("fin", "finance", "4100", "4210"), ("fit", "fitness", "4200", "4301")):
            c = self.home / f"pleiades-{a}"
            git(tmp, "clone", "-q", "--no-tags", str(self.origin), str(c))
            git(c, "fetch", "-q", "--no-tags", "origin", "tag", "v1.0.0")
            git(c, "checkout", "-q", "v1.0.0")
            (c / "apps" / d).mkdir(parents=True, exist_ok=True)
            (c / "apps" / d / ".env").write_text(f'PORT={port}\nMCP_PORT="{mcp}"\n')
        self.root = self.home / "pleiades-hermes"
        git(tmp, "clone", "-q", "--no-tags", str(self.origin), str(self.root))

    def release(self, tag: str, port: str | None = None) -> None:
        (self.work / "apps" / "hermes" / "a.ts").write_text(tag)
        if port is not None:   # 새 태그의 pm2 정의 포트를 바꾼다
            cfg = self.work / "deploy" / "hermes" / "pleiades-hrm.config.cjs"
            cfg.write_text(re.sub(r"const PORT = '\d+'", f"const PORT = '{port}'", cfg.read_text()))
        git(self.work, "add", "-A")
        git(self.work, "commit", "-qm", tag)
        git(self.work, "tag", tag)
        git(self.work, "push", "-q", str(self.origin), "dev", tag)

    def env(self, **extra: str) -> dict:
        e = {"PATH": f"{self.stub}:{BASE_PATH}", "HOME": str(self.home), "STUB": str(self.stub),
             "DATABASE_URL": "postgresql://shell:SHELLSECRET@x/db", "PORT": "9999", "PLEIADES_TEST": "1", "HRM_SETTLE_SECS": "0",
             "STUB_NODE_VERSION": "24.12.0", **extra}  # 서버 node 판(U3) — 시험을 도는 node 판과 무관하게
        return {k: v for k, v in e.items() if v is not None}

    def run(self, *args: str, script: str = "hrm-inplace.sh", **extra: str) -> subprocess.CompletedProcess:
        s = self.root / "deploy" / "hermes" / script
        return subprocess.run(["bash", str(s), *args], input="", capture_output=True, text=True,
                              env=self.env(**extra), timeout=60)

    def head(self) -> str:
        r = subprocess.run(["git", "describe", "--tags", "--exact-match", "HEAD"], cwd=self.root, capture_output=True, text=True)
        return r.stdout.strip() or "(비태그)"

    def calls(self) -> str:
        return (self.stub / "log").read_text()

    def fd9(self) -> str:
        p = self.stub / "fd9"
        return p.read_text() if p.exists() else ""

    def last_ok(self) -> str:
        p = self.private / "inplace-hrm-last-ok"
        return p.read_text().strip() if p.exists() else ""


class Static(unittest.TestCase):
    """정적 계약 — pm2 정의 · 키 문자열(G-R1) · 서브셸(G-R3 보조) · 금지 명령 · 문법."""

    def setUp(self):
        self.src = SCRIPT.read_text()

    def test_config(self):
        out = subprocess.run([REAL_NODE, "-e", f"console.log(JSON.stringify(require({json.dumps(str(CONFIG))}).apps))"],
                             capture_output=True, text=True, check=True, env={**os.environ, "HOME": "/home/svc"}).stdout
        apps = json.loads(out)
        self.assertEqual([a["name"] for a in apps], ["pleiades-hrm-api"])   # D9 · G-R2
        a = apps[0]
        self.assertEqual(a["script"], "dist/hermes.cjs")
        self.assertTrue(os.path.isabs(a["cwd"]) and a["cwd"].endswith("/apps/hermes"))
        self.assertGreaterEqual(a["kill_timeout"], 17000)   # 진행 중 게시 한 걸음(15 s + 여유)을 기다린다
        self.assertIn("--disable-warning=ExperimentalWarning", a["node_args"])   # U3 — 서버 24.12 는 경고 1줄
        self.assertEqual(a["env"]["PORT"], "4700")   # U1
        self.assertNotIn("PLEIADES_ENV_FILE", a["env"])   # 셸 env(스크립트가 고정)에서만 온다
        self.assertEqual(a["env"]["HERMES_STATE_DIR"], "/home/svc/pleiades-hermes-data/state")   # 체크아웃 밖
        self.assertEqual(a["env"]["HERMES_REGISTRY"], "/home/svc/pleiades-hermes-data/sources.json")
        cfg = CONFIG.read_text()
        for bad in ("pleiades-fin-", "pleiades-fit-", "pleiades-adv-"):
            self.assertNotIn(bad, cfg)

    def test_port_not_reserved_locally_or_by_apps(self):
        # 로컬 check_env 예약 포트 · 서버 fin·fit 포트(U1)와 겹치지 않는다
        port = int(re.search(r"const PORT = '(\d+)'", CONFIG.read_text()).group(1))
        self.assertNotIn(port, {3000, 4100, 4200, 4210, 4301})

    def test_keys_string_matches_release_inplace(self):
        pick = lambda s: re.search(r"^PLEIADES_KEYS='([^']*)'$", s, re.M).group(1)
        self.assertEqual(pick(self.src), pick(RELEASE.read_text()))

    def test_env_file_literal(self):
        self.assertIn('export PLEIADES_ENV_FILE="$HOME/pleiades-platform.env"', self.src)

    def test_body_after_lock_runs_in_a_subshell_without_fd9(self):
        self.assertRegex(self.src, r"\n\s*\) 9>&-\n")
        self.assertIn("take_lock", self.src)

    def test_forbidden(self):
        for f in (SCRIPT, KEY_SCRIPT):
            code = "\n".join(l for l in f.read_text().splitlines() if not l.lstrip().startswith("#"))
            for bad in (r"\bssh\b", r"--tags\b", r"pm2 (kill|resurrect)", r"delete all", r"stop all", r"git[^\n]* clean\b",
                        r"release-inplace\.sh", r"adv-inplace\.sh", r"pleiades\.config\.cjs", r"pleiades-adv\.config", r"pm2[^\n]* restart"):
                self.assertIsNone(re.search(bad, code), f"{f.name}: {bad}")
            self.assertEqual(set(re.findall(r"pleiades-(?:fin|fit|adv|hrm)-[a-z]+", code)) - {"pleiades-hrm-api"}, set())

    def test_bash_syntax(self):
        for f in (SCRIPT, KEY_SCRIPT):
            r = subprocess.run(["bash", "-n", str(f)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertTrue(os.access(f, os.X_OK), f"{f.name} 실행 비트")


class HrmInplace(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.srv = Server(Path(self._tmp.name).resolve())

    def tearDown(self):
        self._tmp.cleanup()

    def assertForm(self, r: subprocess.CompletedProcess, rc: int, *needles: str):
        self.assertEqual(r.returncode, rc, r.stdout + r.stderr)
        self.assertEqual(r.stdout.count("=== 판정 양식"), 1, r.stdout)
        for n in needles:
            self.assertIn(n, r.stdout)
        self.assertNotIn(str(self.srv.home), r.stdout)
        self.assertNotIn("SHELLSECRET", r.stdout + r.stderr)

    def assertUnchanged(self, r: subprocess.CompletedProcess, why: str, head: str = "(비태그)"):
        self.assertForm(r, 1, "결과: 중단", why)
        self.assertEqual(self.srv.head(), head)
        self.assertNotIn("npm ", self.srv.calls())
        self.assertNotIn("pm2 start", self.srv.calls())

    def deploy(self, tag: str = "v1.0.1", **extra: str) -> subprocess.CompletedProcess:
        return self.srv.run(tag, "--yes", **extra)

    # ── 사용법 · 가드 ─────────────────────────────────────────────────────
    def test_usage(self):
        self.assertEqual(self.srv.run().returncode, 2)
        self.assertEqual(self.srv.run("1.0.0").returncode, 2)
        self.assertEqual(self.srv.run("stop", "--dry-run").returncode, 2)

    def test_local_darwin_only_dry_run(self):
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(STUB_UNAME="Darwin"), "--dry-run 만")
        self.assertForm(self.srv.run("v1.0.1", "--dry-run", STUB_UNAME="Darwin"), 0, "dry-run")

    def test_rejects_other_checkout_location(self):
        other = self.srv.home / "elsewhere"
        shutil.copytree(self.srv.root, other)
        r = subprocess.run(["bash", str(other / "deploy" / "hermes" / "hrm-inplace.sh"), "v1.0.1", "--yes"],
                           capture_output=True, text=True, env=self.srv.env(), timeout=60)
        self.assertForm(r, 1, "~/pleiades-hermes 가 아니다")

    def test_old_node_refused(self):
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(STUB_NODE_VERSION="20.18.0"), "node 20.18.0")

    def test_rejects_private_dir_override(self):
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(PLEIADES_PRIVATE_DIR=str(self.srv.tmp)), "PLEIADES_PRIVATE_DIR")

    def test_platform_file_must_be_600(self):
        self.srv.plat.chmod(0o644)
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(), "600 이 아니다")

    def test_needs_both_app_records(self):
        (self.srv.private / "inplace-fit-last-ok").unlink()
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(), "inplace-fit-last-ok 가 없다")

    def test_lock_held_by_another_deploy(self):
        self.srv.release("v1.0.1")
        with open(self.srv.private / "deploy.lock", "a") as f:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertUnchanged(self.deploy(), "다른 배포가")

    def test_fin_env_diff_stops_before_change(self):
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(STUB_FIN_DIFF="1"), "PLEIADES_ENV_FILE 이 이 셸과 다르거나")

    def test_adv_env_diff_stops_before_change(self):
        # ① 곁가지끼리도 묶인다 — adv 가 다른 env 면 hermes 를 띄우지 않는다
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(STUB_ADV="diff"), "fin·fit·adv")

    def test_no_app_processes_stops(self):
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(STUB_NO_APPS="1"), "두 앱 프로세스가 없다")

    def test_no_daemon_stops_before_any_pm2_call(self):
        (self.srv.home / ".pm2" / "rpc.sock").unlink()
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(), "pm2 데몬이 없다")
        self.assertNotIn("pm2 ", self.srv.calls())

    def test_port_collision_with_app_refused(self):
        # ② fin MCP_PORT 가 hermes 포트와 같으면 두 앱 배포가 die 한다(N15) — 띄우지 않는다
        (self.srv.home / "pleiades-fin" / "apps" / "finance" / ".env").write_text("PORT=4100\nMCP_PORT=4700\n")
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(), "fin MCP_PORT 과 겹친다")

    # 회귀: #800 9-1 major — C1c 는 checkout 전 정의를 본다. 새 태그가 포트를 겹치게 바꾸면 C4 에서 막는다
    def test_new_tag_port_collision_stops_before_start(self):
        self.srv.release("v1.0.1", port="4210")
        r = self.deploy()
        self.assertForm(r, 4, "C4 — 새 태그의 hermes 포트가 fin MCP_PORT 과 겹치거나", "hrm-inplace.sh stop(첫 실행")
        self.assertNotIn("pm2 start", self.srv.calls())
        self.assertNotIn("hermes.cjs check", self.srv.calls())

    def test_pre_flight_port_collision_refused(self):
        self.srv.release("v1.0.1", port="4399")
        self.assertForm(self.deploy(), 4, "fit pre-flight")

    def test_env_port_parsing(self):
        # export · 따옴표 · 줄 끝 주석 · CR 을 벗기고 견준다 — 놓치면 겹침을 못 본다(9-1 info)
        (self.srv.home / "pleiades-fin" / "apps" / "finance" / ".env").write_text("export PORT='4100'\r\nMCP_PORT=4700  # mcp\r\n")
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(), "fin MCP_PORT 과 겹친다")

    def test_node_22_12_refused(self):
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(STUB_NODE_VERSION="22.12.0"), "22.13 이상")

    def test_app_port_unreadable_refused(self):
        (self.srv.home / "pleiades-fit" / "apps" / "fitness" / ".env").write_text("PORT=4200\n")
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(), "fit 앱 .env 의 MCP_PORT 를 읽지 못했다")

    # ── 배포 ───────────────────────────────────────────────────────────────
    def test_first_run_from_branch_head(self):
        self.srv.release("v1.0.1")
        r = self.deploy(STUB_ADV="same", STUB_WEBHOOK="1")
        self.assertForm(r, 0, "결과: 통과", "A  첫 실행", "C2 v1.0.1", "C3 빌드: 예", "포트 가드: fin·fit 와 겹치지 않음",
                        "C4 대기열: WAL 예", "C4 env PORT=4700 state=true", "C5 pleiades-hrm-api 기동",
                        "health 200 · 상태 파일 갱신: 예", "웹훅: 있음", "adv 1")
        self.assertEqual(self.srv.head(), "v1.0.1")
        self.assertEqual(self.srv.last_ok(), "v1.0.1")
        calls = self.srv.calls()
        self.assertLess(calls.index("npm ci @pleiades-hermes"), calls.index("npm ci @hermes"))   # 루트 먼저(notify dist)
        self.assertIn("pm2 start", calls)
        self.assertIn("pm2 save --force", calls)
        self.assertFalse((self.srv.private / "inplace-hrm-pending").exists())
        self.assertTrue((self.srv.home / "pleiades-hermes-data").is_dir())
        self.assertEqual((self.srv.home / "pleiades-hermes-data").stat().st_mode & 0o777, 0o700)

    def test_children_never_inherit_lock_fd(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0, "결과: 통과")
        self.assertEqual(self.srv.fd9(), "")

    def test_no_webhook_is_info_not_failure(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0, "결과: 통과", "웹훅: 없음 — 받기만")

    def test_check_failure_is_rc4(self):
        self.srv.release("v1.0.1")
        r = self.deploy(STUB_CHECK_RC="1")
        self.assertForm(r, 4, "C4 — check rc 1", "hrm-inplace.sh stop(첫 실행")
        self.assertNotIn("pm2 start", self.srv.calls())

    def test_health_failure_is_rc4(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(STUB_HEALTH="503"), 4, "health 503", "C6 — 확인 실패")
        self.assertEqual(self.srv.last_ok(), "")

    def test_state_not_refreshed_is_rc4(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(STUB_NO_STATE="1"), 4, "상태 파일 갱신: 아니오", "C6 — 확인 실패")

    def test_not_online_or_other_env_is_rc4(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(STUB_HRM_STATUS="errored"), 4, "C6 pleiades-hrm-api errored")
        self.assertForm(self.deploy(STUB_HRM_ENV="diff"), 4, "PLEIADES_ENV_FILE DIFF")

    def test_start_failure_after_delete_saves_the_list(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0, "결과: 통과")
        self.srv.release("v1.0.2")
        (self.srv.stub / "log").write_text("")
        self.assertForm(self.deploy("v1.0.2", STUB_START_FAIL="1"), 4, "C5 — pm2 start 실패", "되돌리기 hrm-inplace.sh v1.0.1")
        calls = self.srv.calls()
        self.assertIn("pm2 delete pleiades-hrm-api", calls)
        self.assertIn("pm2 save --force", calls)

    def test_already_deployed(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0, "결과: 통과")
        (self.srv.stub / "log").write_text("")
        self.assertForm(self.deploy(), 0, "이미 v1.0.1 배포됨")
        self.assertNotIn("npm ", self.srv.calls())

    def test_upgrade_and_rollback(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0, "결과: 통과")
        self.srv.release("v1.0.2")
        self.assertForm(self.deploy("v1.0.2"), 0, "A  HEAD v1.0.1 → V v1.0.2 · 마지막 통과 v1.0.1", "결과: 통과")
        self.assertForm(self.deploy("v1.0.1"), 0, "결과: 통과")
        self.assertEqual((self.srv.head(), self.srv.last_ok()), ("v1.0.1", "v1.0.1"))

    def test_non_tag_head_after_a_deploy_is_refused(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0, "결과: 통과")
        git(self.srv.root, "checkout", "-q", "dev")
        (self.srv.stub / "log").write_text("")
        self.assertUnchanged(self.deploy(), "HEAD 가 태그가 아니다", head="(비태그)")

    def test_dry_run_changes_nothing(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.srv.run("v1.0.1", "--dry-run"), 0, "dry-run")
        self.assertEqual(self.srv.head(), "(비태그)")
        self.assertNotIn("npm ", self.srv.calls())
        self.assertFalse((self.srv.private / "deploy.lock").exists())

    # ── 정지 ───────────────────────────────────────────────────────────────
    def test_stop_normal(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0, "결과: 통과")
        self.assertForm(self.srv.run("stop", "--yes"), 0, "S  pleiades-hrm-api 삭제 · save: 예", "결과: 통과 — 정지",
                        "마지막 통과 v1.0.1 유지")
        self.assertTrue((self.srv.private / "inplace-hrm-stopped").exists())
        self.assertForm(self.deploy(), 0, "결과: 통과")   # 정지 뒤 같은 태그 = 다시 켜기(이미 배포됨 아님)
        self.assertFalse((self.srv.private / "inplace-hrm-stopped").exists())

    def test_stop_without_daemon_calls_no_pm2(self):
        (self.srv.home / ".pm2" / "rpc.sock").unlink()
        self.assertForm(self.srv.run("stop", "--yes"), 0, "데몬 없음 — pm2 무변경")
        self.assertNotIn("pm2 ", self.srv.calls())

    def test_stop_with_only_hrm_in_daemon_does_not_save(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0, "결과: 통과")
        (self.srv.stub / "log").write_text("")
        self.assertForm(self.srv.run("stop", "--yes", STUB_NO_APPS="1"), 4, "두 앱이 없는 데몬")
        self.assertNotIn("pm2 save", self.srv.calls())

    def test_stop_asks_without_yes(self):
        self.assertForm(self.srv.run("stop"), 1, "사용자 취소")


class KeyWrapper(unittest.TestCase):
    """hermes-key.sh — 레지스트리 자리(pm2 정의와 같다) · dist 없으면 멈춤 · 자리는 0700."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.srv = Server(Path(self._tmp.name).resolve())

    def tearDown(self):
        self._tmp.cleanup()

    def test_needs_dist(self):
        r = self.srv.run("list", script="hermes-key.sh")
        self.assertEqual(r.returncode, 1)
        self.assertIn("hrm-inplace.sh 로 먼저 배포한다", r.stderr)

    def test_passes_registry_path_from_config(self):
        self.srv.release("v1.0.1")
        self.assertEqual(self.srv.run("v1.0.1", "--yes").returncode, 0)
        r = self.srv.run("add", "orders", "--name", "주문", script="hermes-key.sh")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.strip(), f"key add orders --name 주문 reg={self.srv.home}/pleiades-hermes-data/sources.json")

    def test_usage(self):
        self.assertEqual(self.srv.run(script="hermes-key.sh").returncode, 2)


if __name__ == "__main__":
    unittest.main()
