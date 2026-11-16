"""deploy/advisor/adv-inplace.sh — 통합 층 수동 배포·정지(012 4b-3b · #699 · 설계 _workspace/239/4b3/02_writer_4b3_r3.md).

실행: python3 -m unittest deploy.test_adv_inplace   (deploy 전체: python3 -m unittest discover -s deploy)
서버 명령(pm2 · npm · npx · uname · flock)은 PATH 스텁으로 바꾼다 — 실제 서버·네트워크·pm2 를 쓰지 않는다.
git 은 진짜다(임시 bare 원격 + 태그). HOME 을 임시 디렉터리로 바꾸고 체크아웃을 $HOME/pleiades-adv 에 만든다
(스크립트가 PLEIADES_PRIVATE_DIR 설정을 거부하므로 비공개 위치는 $HOME/pleiades-private 고정).

핵심 계약:
- G-R1 env 고정 · 두 앱 배포와 같은 락·기록 위치 · 락 뒤 fin·fit env 대조(n_same > 0 · DIFF 0)
- G-R2 pm2 이름 pleiades-adv-bot 하나
- G-R3 락 fd 9 를 자식이 물려받지 않는다(동적 — 스텁이 /dev/fd/9 를 보면 기록)
- A 규칙 3줄(r4) · stop 은 락만 · 데몬 없으면 pm2 무호출
"""

import fcntl
import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "advisor" / "adv-inplace.sh"
CONFIG = HERE / "advisor" / "pleiades-adv.config.cjs"
RELEASE = HERE / "release-inplace.sh"
BASE_PATH = "/usr/bin:/bin"  # 실제 claude·pm2 가 있을 수 있는 homebrew·local 은 넣지 않는다
REAL_NODE = shutil.which("node") or "/usr/bin/node"

FD9 = '[ -e /dev/fd/9 ] && echo "fd9 $(basename "$0") $*" >> "$STUB/fd9"\n'

# node — /dev/fd/9 를 기록한 뒤 진짜 node 로(보충 R2-4). pm2 스텁도 이것을 통해 돈다(#!/usr/bin/env node)
NODE_STUB = "#!/bin/bash\n" + FD9 + f'exec {REAL_NODE} "$@"\n'

# pm2 흉내 — 상태는 $STUB/pm2 디렉터리. fin·fit 6 프로세스 + adv(start 가 만들고 delete 가 지운다)
PM2_STUB = r"""#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const S = process.env.STUB, argv = process.argv.slice(2)
fs.appendFileSync(path.join(S, 'log'), 'pm2 ' + argv.join(' ') + '\n')
const advFile = path.join(S, 'adv.json')
const plat = process.env.HOME + '/pleiades-platform.env'
if (argv[0] === 'jlist') {
  const list = []
  if (process.env.STUB_NO_APPS !== '1') for (const a of ['fin', 'fit']) for (const r of ['web', 'bot', 'mcp']) {
    const name = `pleiades-${a}-${r}`
    const v = process.env.STUB_FIN_DIFF === '1' && name === 'pleiades-fin-bot' ? '/elsewhere' : plat
    list.push({ name, pm2_env: { status: 'online', pm_cwd: '/x', PLEIADES_ENV_FILE: v } })
  }
  if (fs.existsSync(advFile)) list.push(JSON.parse(fs.readFileSync(advFile, 'utf8')))
  process.stdout.write('[PM2][WARN] noise\n' + JSON.stringify(list))
} else if (argv[0] === 'start') {
  if (process.env.STUB_START_FAIL === '1') process.exit(1)
  const cfg = require(path.resolve(argv[1]))
  const app = cfg.apps.find((a) => a.name === argv[argv.indexOf('--only') + 1])
  const env = { ...(process.env.STUB_ADV_ENV === 'diff' ? { PLEIADES_ENV_FILE: '/elsewhere' } : { PLEIADES_ENV_FILE: process.env.PLEIADES_ENV_FILE }) }
  if (process.env.PLEIADES_PRIVATE_DIR !== undefined) env.PLEIADES_PRIVATE_DIR = process.env.PLEIADES_PRIVATE_DIR
  fs.writeFileSync(advFile, JSON.stringify({ name: app.name, pm2_env: { status: process.env.STUB_ADV_STATUS || 'online', pm_cwd: app.cwd, ...env } }))
  fs.writeFileSync(path.join(S, 'start_path'), process.env.PATH)
  if (process.env.STUB_ALIVE === '1') {
    fs.mkdirSync(path.join(app.cwd, 'logs'), { recursive: true })
    fs.writeFileSync(path.join(app.cwd, 'logs', 'alive-adv.json'), '{}')
  }
} else if (argv[0] === 'delete') {
  fs.rmSync(advFile, { force: true })
}
"""

# npm — build 가 가짜 dist/advisor.cjs 를 만든다(probe 출력 · rc 는 STUB_PROBE_RC)
NPM_STUB = "#!/bin/bash\n" + FD9 + r"""echo "npm $* @$(basename "$PWD")" >> "$STUB/log"
[[ -n "${STUB_NPM_FAIL:-}" && "$*" == *"$STUB_NPM_FAIL"* ]] && exit 1
if [[ "$*" == "run build" ]]; then
  mkdir -p dist
  printf '%s\n' 'console.log("배포 락: busy"); console.log("fin: 준비됨 · 읽기 도구 3 · 지식 10 B"); process.exit(Number(process.env.STUB_PROBE_RC || 0))' > dist/advisor.cjs
fi
exit 0
"""
NPX_STUB = "#!/bin/bash\n" + FD9 + 'echo "npx $*" >> "$STUB/log"\nexit 0\n'
# flock(1) 흉내 — 물려받은 fd 에 fcntl.flock(LOCK_EX|LOCK_NB). 진짜처럼 락은 부모가 연 파일 설명에 남는다
FLOCK_STUB = ("#!/usr/bin/env python3\nimport fcntl, sys\n"
              "try:\n    fcntl.flock(int(sys.argv[2]), fcntl.LOCK_EX | fcntl.LOCK_NB)\n"
              "except OSError:\n    sys.exit(1)\n")
CLAUDE_STUB = "#!/bin/bash\n" + FD9 + 'echo "claude $*" >> "$STUB/log"\n[[ "$1" == --version ]] && echo "2.1.311 (Claude Code)"\nexit 0\n'


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True,
                          env={**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
                               "GIT_COMMITTER_EMAIL": "t@t"}).stdout.strip()


class Server:
    """가짜 서버 — HOME · 원격(bare) · 두 앱 체크아웃(v1.0.0) · 셋째 체크아웃(dev) · 비공개 위치 · 스텁."""

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
        for name, body in {"node": NODE_STUB, "pm2": PM2_STUB, "npm": NPM_STUB, "npx": NPX_STUB, "flock": FLOCK_STUB,
                           "uname": "#!/bin/sh\necho ${STUB_UNAME:-Linux}\n"}.items():
            p = self.stub / name
            p.write_text(body)
            p.chmod(0o755)
        (self.stub / "log").write_text("")
        claude = self.home / ".local" / "bin" / "claude"
        claude.parent.mkdir(parents=True)
        claude.write_text(CLAUDE_STUB)
        claude.chmod(0o755)
        # pm2 데몬이 떠 있다는 표시 — stop 은 이것이 없으면 pm2 를 부르지 않는다
        (self.home / ".pm2").mkdir()
        (self.home / ".pm2" / "rpc.sock").write_text("")

        work = tmp / "work"
        work.mkdir()
        git(work, "init", "-q", "-b", "dev")
        (work / "package.json").write_text('{"name":"pleiades"}')
        (work / "deploy" / "advisor").mkdir(parents=True)
        shutil.copy(SCRIPT, work / "deploy" / "advisor" / "adv-inplace.sh")
        shutil.copy(CONFIG, work / "deploy" / "advisor" / "pleiades-adv.config.cjs")
        (work / "apps" / "advisor").mkdir(parents=True)
        (work / "apps" / "advisor" / "a.ts").write_text("0")
        (work / ".gitignore").write_text("node_modules/\ndist/\nlogs/\n")
        git(work, "add", "-A")
        git(work, "commit", "-qm", "v1.0.0")
        git(work, "tag", "v1.0.0")
        self.work = work
        self.origin = tmp / "origin.git"
        git(tmp, "clone", "-q", "--bare", str(work), str(self.origin))
        for a in ("fin", "fit"):
            d = self.home / f"pleiades-{a}"
            git(tmp, "clone", "-q", "--no-tags", str(self.origin), str(d))
            git(d, "fetch", "-q", "--no-tags", "origin", "tag", "v1.0.0")
            git(d, "checkout", "-q", "v1.0.0")
        # 셋째 체크아웃 — clone 직후(HEAD = dev · 태그 없음)
        self.root = self.home / "pleiades-adv"
        git(tmp, "clone", "-q", "--no-tags", str(self.origin), str(self.root))

    def release(self, tag: str) -> None:
        (self.work / "apps" / "advisor" / "a.ts").write_text(tag)
        git(self.work, "add", "-A")
        git(self.work, "commit", "-qm", tag)
        git(self.work, "tag", tag)
        git(self.work, "push", "-q", str(self.origin), "dev", tag)

    def env(self, **extra: str) -> dict:
        e = {"PATH": f"{self.stub}:{BASE_PATH}", "HOME": str(self.home), "STUB": str(self.stub),
             "DATABASE_URL": "postgresql://shell:SHELLSECRET@x/db", "PLEIADES_TEST": "1", "ADV_SETTLE_SECS": "0", **extra}
        return {k: v for k, v in e.items() if v is not None}

    def run(self, *args: str, script: Path | None = None, **extra: str) -> subprocess.CompletedProcess:
        s = script or (self.root / "deploy" / "advisor" / "adv-inplace.sh")
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
        p = self.private / "inplace-adv-last-ok"
        return p.read_text().strip() if p.exists() else ""

    def alive(self) -> Path:
        return self.root / "apps" / "advisor" / "logs" / "alive-adv.json"


class Static(unittest.TestCase):
    """정적 계약 — 이름(G-R2) · 키 문자열(G-R1) · 서브셸(G-R3 보조) · 금지 명령."""

    def setUp(self):
        self.src = SCRIPT.read_text()

    def test_config_defines_only_the_adv_bot(self):
        out = subprocess.run([REAL_NODE, "-e", f"console.log(JSON.stringify(require({json.dumps(str(CONFIG))}).apps))"],
                             capture_output=True, text=True, check=True).stdout
        apps = json.loads(out)
        self.assertEqual([a["name"] for a in apps], ["pleiades-adv-bot"])
        a = apps[0]
        self.assertEqual(a["kill_timeout"], 15000)   # pm2 기본 1600 ms — B7 종료 유예 10 s 를 못 준다
        self.assertEqual(a["script"], "dist/advisor.cjs")
        self.assertEqual(a["args"], "bot")
        self.assertTrue(a["cwd"].endswith("/apps/advisor"))
        self.assertTrue(os.path.isabs(a["cwd"]))
        self.assertNotIn("PLEIADES_ENV_FILE", a.get("env", {}))   # 셸 env(스크립트가 고정)에서만 온다
        cfg = CONFIG.read_text()
        self.assertNotIn("pleiades-fin-", cfg)
        self.assertNotIn("pleiades-fit-", cfg)

    def test_keys_string_matches_release_inplace(self):
        pick = lambda s: re.search(r"^PLEIADES_KEYS='([^']*)'$", s, re.M).group(1)
        self.assertEqual(pick(self.src), pick(RELEASE.read_text()))

    def test_env_file_literal(self):
        self.assertIn('export PLEIADES_ENV_FILE="$HOME/pleiades-platform.env"', self.src)

    def test_body_after_lock_runs_in_a_subshell_without_fd9(self):
        self.assertRegex(self.src, r"\n\s*\) 9>&-\n")
        self.assertIn("take_lock", self.src)

    def test_forbidden(self):
        code = "\n".join(l for l in self.src.splitlines() if not l.lstrip().startswith("#"))
        for bad in (r"\bssh\b", r"--tags\b", r"pm2 (kill|resurrect)", r"delete all", r"stop all", r"git[^\n]* clean\b",
                    r"release-inplace\.sh", r"pleiades\.config\.cjs", r"pm2[^\n]* restart"):
            self.assertIsNone(re.search(bad, code), bad)
        self.assertEqual(set(re.findall(r"pleiades-(?:fin|fit|adv)-[a-z]+", code)) - {"pleiades-adv-bot"}, set())


class AdvInplace(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.srv = Server(Path(self._tmp.name).resolve())

    def tearDown(self):
        self._tmp.cleanup()

    def assertForm(self, r: subprocess.CompletedProcess, rc: int, *needles: str):
        self.assertEqual(r.returncode, rc, r.stdout + r.stderr)
        self.assertEqual(r.stdout.count("=== 판정 양식"), 1, r.stdout)   # 양식은 한 실행에 한 번(r4 문안 1)
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
        for args in ((), ("1.0.1",), ("v1.0.1", "--force"), ("stop", "--dry-run"), ("stop", "v1.0.1")):
            self.assertEqual(self.srv.run(*args).returncode, 2, args)

    def test_local_darwin_only_dry_run(self):
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(STUB_UNAME="Darwin"), "--dry-run 만")
        self.assertForm(self.srv.run("stop", "--yes", STUB_UNAME="Darwin"), 1, "--dry-run 만")

    def test_rejects_other_checkout_location(self):
        other = self.srv.tmp / "elsewhere"
        git(self.srv.tmp, "clone", "-q", "--no-tags", str(self.srv.origin), str(other))
        self.srv.release("v1.0.1")
        r = self.srv.run("v1.0.1", "--yes", script=other / "deploy" / "advisor" / "adv-inplace.sh")
        self.assertForm(r, 1, "~/pleiades-adv")
        self.assertNotIn("npm ", self.srv.calls())

    def test_rejects_private_dir_override(self):
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(PLEIADES_PRIVATE_DIR=str(self.srv.private)), "PLEIADES_PRIVATE_DIR")
        self.assertForm(self.srv.run("stop", "--yes", PLEIADES_PRIVATE_DIR=str(self.srv.private)), 1, "PLEIADES_PRIVATE_DIR")
        self.assertEqual(self.srv.calls(), "")

    def test_platform_file_must_be_600(self):
        self.srv.plat.chmod(0o644)
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(), "600")

    def test_needs_both_app_records_in_the_same_private_dir(self):
        (self.srv.private / "inplace-fit-last-ok").unlink()
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(), "inplace-fit-last-ok")

    def test_app_record_mismatch_is_a_warning(self):
        (self.srv.private / "inplace-fin-last-ok").write_text("v0.9.0\n")
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0, "(주의)", "결과: 통과")

    def test_lock_held_by_another_deploy(self):
        self.srv.release("v1.0.1")
        with open(self.srv.private / "deploy.lock", "a") as f:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertUnchanged(self.deploy(), "다른 배포")
            self.assertUnchanged(self.srv.run("stop", "--yes"), "다른 배포")
            # dry-run 은 락을 잡지 않는다
            self.assertForm(self.srv.run("v1.0.1", "--dry-run"), 0, "dry-run")

    def test_fin_env_diff_stops_before_change(self):
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(STUB_FIN_DIFF="1"), "C1")
        self.assertNotIn("pm2 delete", self.srv.calls())

    def test_no_app_processes_stops_before_change(self):
        # 데몬이 비었거나 새로 떴다 — 여기서 save --force 하면 두 앱 resurrect 목록이 지워진다(r4 정정 3)
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(STUB_NO_APPS="1"), "C1")
        self.assertNotIn("pm2 save", self.srv.calls())

    def test_no_daemon_stops_before_any_pm2_call(self):
        # pm2 jlist 는 데몬이 없으면 빈 데몬을 띄운다 — 부르기 전에 멈춘다
        (self.srv.home / ".pm2" / "rpc.sock").unlink()
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(), "데몬")
        self.assertNotIn("pm2", self.srv.calls())

    def test_claude_not_found(self):
        shutil.rmtree(self.srv.home / ".local")
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(), "claude")

    # ── 배포 ────────────────────────────────────────────────────────────
    def test_first_run_from_branch_head(self):
        self.srv.release("v1.0.1")
        r = self.deploy()
        self.assertForm(r, 0, "결과: 통과", "첫 실행", "pleiades-adv-bot", "2.1.311")
        self.assertEqual(self.srv.head(), "v1.0.1")
        self.assertEqual(self.srv.last_ok(), "v1.0.1")
        self.assertFalse((self.srv.private / "inplace-adv-pending").exists())
        calls = self.srv.calls()
        self.assertIn("pm2 start", calls)
        self.assertRegex(calls, r"pm2 start \S+pleiades-adv\.config\.cjs --only pleiades-adv-bot --update-env\n")
        self.assertIn("pm2 save --force", calls)
        order = [l.split(" @")[0] for l in calls.splitlines() if l.startswith(("npm", "npx"))]
        self.assertEqual(order, ["npm ci", "npm --prefix packages/chat ci", "npx --no-install tsc -p packages/chat", "npm ci",
                                 "npm run build"])
        # claude 디렉터리가 PATH 앞에(B10)
        self.assertTrue((self.srv.stub / "start_path").read_text().startswith(str(self.srv.home / ".local" / "bin") + ":"))
        # 원본 로그는 600 · 비공개 위치
        logs = list(self.srv.private.glob("inplace-adv-*.log"))
        self.assertTrue(logs)
        self.assertEqual(oct(logs[0].stat().st_mode & 0o777), "0o600")

    def test_children_never_inherit_lock_fd(self):
        # G-R3 동적(정정 9) — 배포·stop 경로 전체에서 /dev/fd/9 를 본 자식이 없다
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(STUB_ALIVE="1"), 0, "결과: 통과")
        self.assertForm(self.srv.run("stop", "--yes"), 0, "결과: 통과")
        self.assertIn("pm2 jlist", self.srv.calls())   # 스텁이 실제로 불렸다
        self.assertEqual(self.srv.fd9(), "")

    def test_fd9_probe_detects_leak(self):
        # 시험 자체의 반증 — fd 9 를 연 채 스텁을 부르면 기록된다
        subprocess.run(["bash", "-c", f'exec 9>>"{self.srv.tmp}/x"; npx hi'], env=self.srv.env(), check=True)
        self.assertIn("fd9 npx", self.srv.fd9())

    def test_probe_line_marks_own_lock(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0, "배포 락: busy(이 실행의 락)", "fin: 준비됨")

    def test_probe_failure_is_rc4(self):
        self.srv.release("v1.0.1")
        r = self.deploy(STUB_PROBE_RC="1")
        self.assertForm(r, 4, "C4", "stop")
        self.assertNotIn("pm2 start", self.srv.calls())
        self.assertEqual(self.srv.last_ok(), "")
        self.assertEqual((self.srv.private / "inplace-adv-pending").read_text().strip(), "v1.0.1")

    def test_build_failure_is_rc4_then_rerun_succeeds(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(STUB_NPM_FAIL="run build"), 4, "C3")
        self.assertEqual(self.srv.head(), "v1.0.1")
        # 규칙 3 — HEAD = V · pending = V → C3 부터 다시
        r = self.deploy()
        self.assertForm(r, 0, "결과: 통과")
        self.assertEqual(self.srv.last_ok(), "v1.0.1")

    def test_already_deployed(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0, "결과: 통과")
        n = self.srv.calls().count("npm ")
        r = self.deploy()
        self.assertForm(r, 0, "이미 배포됨")
        self.assertEqual(self.srv.calls().count("npm "), n)

    def test_upgrade_and_rollback_to_previous_tag(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy("v1.0.1"), 0, "결과: 통과")
        self.srv.release("v1.0.2")
        self.assertForm(self.deploy("v1.0.2", STUB_NPM_FAIL="run build"), 4)
        # 실패한 W 뒤 직전 태그로 되돌리기(r4 정정 1)
        r = self.deploy("v1.0.1")
        self.assertForm(r, 0, "결과: 통과")
        self.assertEqual(self.srv.head(), "v1.0.1")
        self.assertEqual(self.srv.last_ok(), "v1.0.1")

    def test_non_tag_head_after_a_deploy_is_refused(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0)
        git(self.srv.root, "checkout", "-q", "dev")
        self.srv.release("v1.0.2")
        (self.srv.stub / "log").write_text("")   # 앞 배포의 호출은 세지 않는다
        self.assertUnchanged(self.deploy("v1.0.2"), "HEAD 가 태그가 아니다")

    def test_dirty_checkout_refused(self):
        (self.srv.root / "apps" / "advisor" / "a.ts").write_text("dirty")
        self.srv.release("v1.0.1")
        self.assertUnchanged(self.deploy(), "깨끗")

    def test_unknown_tag_refused(self):
        self.assertUnchanged(self.deploy("v9.9.9"), "태그")

    def test_existing_adv_with_other_env_is_fixed_by_redeploy(self):
        # 정정 R2-1 — adv 자신의 DIFF 는 정보 줄 · 이 실행이 재기동으로 고친다(W1 복구 경로)
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(STUB_ADV_ENV="diff"), 4, "C6")
        r = self.deploy()
        self.assertForm(r, 0, "결과: 통과", "재기동으로 고친다")
        self.assertIn("pm2 delete pleiades-adv-bot", self.srv.calls())

    def test_same_tag_rerun_fixes_adv_started_outside_the_script(self):
        # W1 복구 경로 — 통과한 태그로 다시 불러도 adv 가 DIFF·없음·online 아님이면 "이미 배포됨" 으로 끝내지 않는다
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0, "결과: 통과")
        adv = self.srv.stub / "adv.json"
        for broken in ("diff", "absent", "errored"):
            if broken == "absent":
                adv.unlink()
            else:
                p = json.loads(adv.read_text())
                if broken == "diff":
                    p["pm2_env"]["PLEIADES_ENV_FILE"] = "/elsewhere"
                else:
                    p["pm2_env"]["status"] = "errored"
                adv.write_text(json.dumps(p))
            r = self.deploy()
            self.assertForm(r, 0, "결과: 통과")
            self.assertNotIn("이미 배포됨", r.stdout, broken)
            self.assertEqual(json.loads(adv.read_text())["pm2_env"]["PLEIADES_ENV_FILE"], str(self.srv.plat))
        # 고친 뒤에는 이미 배포됨
        self.assertForm(self.deploy(), 0, "이미 배포됨")

    def test_not_online_is_rc4(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(STUB_ADV_STATUS="errored"), 4, "C6")
        self.assertEqual(self.srv.last_ok(), "")

    def test_start_failure_is_rc4(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(STUB_START_FAIL="1"), 4, "C5")

    def test_bot_key_present_requires_alive_marker(self):
        self.srv.plat.write_text("DISCORD_BOT_TOKEN_ADVISOR=TOKENSECRET\n")
        self.srv.release("v1.0.1")
        r = self.deploy()
        self.assertForm(r, 4, "생존 표지")
        self.assertNotIn("TOKENSECRET", r.stdout + r.stderr)
        r = self.deploy(STUB_ALIVE="1")
        self.assertForm(r, 0, "결과: 통과", "생존 표지 갱신: 예")

    def test_bot_key_absent_is_info(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0, "키 없음")

    def test_dry_run_changes_nothing(self):
        self.srv.release("v1.0.1")
        r = self.srv.run("v1.0.1", "--dry-run")
        self.assertForm(r, 0, "dry-run — 바꾸지 않았다")
        self.assertEqual(self.srv.head(), "(비태그)")
        self.assertNotIn("npm ", self.srv.calls())
        self.assertNotIn("pm2 start", self.srv.calls())

    # ── stop ────────────────────────────────────────────────────────────
    def test_stop_normal(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(STUB_ALIVE="1"), 0)
        self.assertTrue(self.srv.alive().exists())
        before = self.srv.calls()
        r = self.srv.run("stop", "--yes")
        self.assertForm(r, 0, "결과: 통과")
        new = self.srv.calls()[len(before):]
        self.assertEqual(new.count("pm2 delete pleiades-adv-bot"), 1)
        self.assertEqual(new.count("pm2 save --force"), 1)
        self.assertTrue((self.srv.private / "inplace-adv-stopped").exists())
        self.assertFalse(self.srv.alive().exists())
        self.assertEqual(self.srv.last_ok(), "v1.0.1")
        # 정지 뒤 같은 태그로 다시 켜기(r4 정정 2) — "이미 배포됨" 이 아니다
        r = self.deploy()
        self.assertForm(r, 0, "결과: 통과")
        self.assertNotIn("이미 배포됨", r.stdout)
        self.assertFalse((self.srv.private / "inplace-adv-stopped").exists())

    def test_stop_without_daemon_calls_no_pm2(self):
        (self.srv.home / ".pm2" / "rpc.sock").unlink()
        r = self.srv.run("stop", "--yes")
        self.assertForm(r, 0, "데몬 없음")
        self.assertNotIn("pm2", self.srv.calls())
        self.assertTrue((self.srv.private / "inplace-adv-stopped").exists())

    def test_stop_when_adv_absent_changes_no_pm2(self):
        r = self.srv.run("stop", "--yes")
        self.assertForm(r, 0, "adv 없음")
        self.assertNotIn("pm2 delete", self.srv.calls())
        self.assertNotIn("pm2 save", self.srv.calls())

    # 회귀: PR 9-1 major — delete 뒤 start 실패면 dump 에 옛 adv 가 남아 재부팅 때 되살아난다
    def test_start_failure_after_delete_saves_the_list(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0)
        self.srv.release("v1.0.2")
        before = self.srv.calls()
        self.assertForm(self.deploy("v1.0.2", STUB_START_FAIL="1"), 4, "C5")
        new = self.srv.calls()[len(before):]
        self.assertIn("pm2 delete pleiades-adv-bot", new)
        self.assertIn("pm2 save --force", new)

    def dump(self, with_adv: bool) -> None:
        names = ["pleiades-fin-bot"] + (["pleiades-adv-bot"] if with_adv else [])
        (self.srv.home / ".pm2" / "dump.pm2").write_text(json.dumps([{"name": n} for n in names]))

    def test_stop_saves_when_dump_still_has_adv(self):
        self.dump(with_adv=True)
        r = self.srv.run("stop", "--yes")
        self.assertForm(r, 0, "결과: 통과", "dump")
        self.assertEqual(self.srv.calls().count("pm2 save --force"), 1)
        self.assertNotIn("pm2 delete", self.srv.calls())

    def test_stop_does_not_save_dump_on_empty_daemon(self):
        # 빈 데몬(두 앱 없음) 위에서는 dump 에 adv 가 있어도 save 하지 않는다 — 두 앱 resurrect 목록을 지운다
        self.dump(with_adv=True)
        r = self.srv.run("stop", "--yes", STUB_NO_APPS="1")
        self.assertForm(r, 4, "dump")
        self.assertNotIn("pm2 save", self.srv.calls())

    # 회귀: PR #700 Codex P2 — 데몬에 adv 만 있고 두 앱은 아직 복구 전이면 delete 뒤 save 가 두 앱 resurrect 목록을 지운다
    def test_stop_with_only_adv_in_daemon_does_not_save(self):
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0)
        before = self.srv.calls()
        r = self.srv.run("stop", "--yes", STUB_NO_APPS="1")
        self.assertForm(r, 4, "save 하지 않았다")
        new = self.srv.calls()[len(before):]
        self.assertIn("pm2 delete pleiades-adv-bot", new)
        self.assertNotIn("pm2 save", new)

    def test_stop_without_daemon_but_adv_in_dump_is_rc4(self):
        (self.srv.home / ".pm2" / "rpc.sock").unlink()
        self.dump(with_adv=True)
        r = self.srv.run("stop", "--yes")
        self.assertForm(r, 4, "dump")
        self.assertNotIn("pm2", self.srv.calls())

    def test_quoted_empty_bot_key_counts_as_absent(self):
        self.srv.plat.write_text('DISCORD_BOT_TOKEN_ADVISOR=""\n')
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(), 0, "키 없음")

    def test_alive_marker_from_old_bot_does_not_pass(self):
        # 9-1 info — 옛 봇이 delete 전에 쓴 표지로 거짓 통과하지 않는다(delete 뒤 표지를 지운다)
        self.srv.release("v1.0.1")
        self.assertForm(self.deploy(STUB_ALIVE="1"), 0)
        self.srv.plat.write_text("DISCORD_BOT_TOKEN_ADVISOR=x\n")
        self.srv.release("v1.0.2")
        r = self.deploy("v1.0.2")   # 새 봇은 표지를 쓰지 않는다
        self.assertForm(r, 4, "생존 표지")

    def test_stop_ignores_app_records_and_env(self):
        # 정정 R2-1 — stop 은 PLEIADES_PRIVATE_DIR 거부 + 락만 · 두 앱 기록·env 대조 없이도 "즉시"
        for a in ("fin", "fit"):
            (self.srv.private / f"inplace-{a}-last-ok").unlink()
        self.srv.plat.chmod(0o644)
        self.assertForm(self.srv.run("stop", "--yes", STUB_FIN_DIFF="1"), 0, "결과: 통과")

    def test_stop_asks_without_yes(self):
        r = self.srv.run("stop")
        self.assertForm(r, 1, "취소")
        self.assertFalse((self.srv.private / "inplace-adv-stopped").exists())


if __name__ == "__main__":
    unittest.main()
