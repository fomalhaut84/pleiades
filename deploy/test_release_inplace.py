"""deploy/release-inplace.sh — 제자리 재배포 실행기(#278 · 런북 release-inplace.md A~C5).

실행: python3 -m unittest discover -s deploy
서버 명령(pm2 · curl · uname)과 deploy.sh 는 PATH 스텁·PLEIADES_DEPLOY_SH 로 바꾼다 — 실제 서버·네트워크를 쓰지 않는다.
git 은 진짜다(임시 bare 원격 + 태그). 핵심 계약: 바꾸기 전 중단(A·B·C1)은 checkout·배포를 하지 않는다 ·
화면에는 판정 양식만(홈 경로·로그 원문 없음) · 실행 중 checkout 이 스크립트 자신을 바꿔도 이어서 돈다.
"""

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "release-inplace.sh"
BASE_PATH = "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"
NODE_DIR = str(Path(shutil.which("node") or "/usr/bin/node").parent)

CONFIG = """module.exports = { apps: ['fin', 'fit'].flatMap((a) => [
  { name: `pleiades-${a}-web`, env: { PORT: a === 'fin' ? '4100' : '4200' } },
  { name: `pleiades-${a}-mcp`, env: { MCP_PORT: a === 'fin' ? '4210' : '4301' } },
  { name: `pleiades-${a}-bot`, env: {} },
]) }
"""

# pm2 흉내 — jlist 는 6 프로세스. STUB_ENV=diff 면 하나가 다른 PLEIADES_ENV_FILE · STUB_CWD 면 그 cwd
PM2_STUB = r"""#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const argv = process.argv.slice(2)
fs.appendFileSync(path.join(process.env.STUB, 'log'), 'pm2 ' + argv.join(' ') + '\n')
if (argv[0] === 'jlist') {
  const cwd = (a) => process.env.STUB_CWD || (process.env.ROOT_DIR + '/apps/' + (a === 'fin' ? 'finance' : 'fitness'))
  const list = []
  for (const a of ['fin', 'fit']) for (const r of ['mcp', 'web', 'bot']) {
    const name = `pleiades-${a}-${r}`
    const v = process.env.STUB_ENV === 'diff' && name === 'pleiades-fit-bot' ? '/elsewhere' : process.env.HOME + '/pleiades-platform.env'
    list.push({ name, pid: 424242, pm2_env: { status: process.env.STUB_STATUS || 'online', pm_cwd: cwd(a), PLEIADES_ENV_FILE: v } })
  }
  process.stdout.write('[PM2][WARN] noise\n' + JSON.stringify(list))
} else if (argv[0] === 'logs') {
  console.log(process.env.STUB_409 ? '409 Conflict: terminated by other getUpdates' : 'bot ok')
}
"""

CURL_STUB = """#!/bin/bash
echo "curl $*" >> "$STUB/log"
case "$*" in
  */health*) printf '%s' "${STUB_MCP_CODE:-200}" ;;
  *) printf '%s' "${STUB_WEB_CODE:-307}" ;;
esac
"""

# deploy.sh 흉내 — 호출 기록 · 창 안 오류 로그 2줄(경고 1) · 비밀 한 줄(화면에 나오면 안 된다)
DEPLOY_STUB = """#!/bin/bash
echo "deploy $*" >> "$STUB/log"
[[ " $* " == *" --dry-run "* ]] && { echo "plan"; exit 0; }
ts=$(date '+%F %T')
mkdir -p "$HOME/.pm2/logs"
echo "$ts: ⚠ Warning: Next.js inferred your workspace root" >> "$HOME/.pm2/logs/pleiades-fin-web-error-108.log"
echo "$ts: TypeError: boom" >> "$HOME/.pm2/logs/pleiades-fin-web-error-114.log"
echo "DATABASE_URL=postgresql://svc:DEPLOYSECRET@localhost/db"
rc=${STUB_DEPLOY_RC:-0}
if [[ $rc -eq 0 ]]; then echo "=== 완료: $1 · $(git describe --tags --exact-match HEAD) ==="; fi
[[ $rc -eq 1 ]] && echo "deploy.sh: 중단 — 빌드 실패 (/home/svc/pleiades-fin)" >&2
exit "$rc"
"""


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True,
                          env={**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
                               "GIT_COMMITTER_EMAIL": "t@t"}).stdout.strip()


class Server:
    """가짜 서버 — HOME · 원격(bare) · 체크아웃(v1.0.0) · 스텁."""

    def __init__(self, tmp: Path):
        self.tmp = tmp
        self.home = tmp / "home"
        (self.home / ".pm2" / "logs").mkdir(parents=True)
        (self.home / ".pm2" / "dump.pm2").write_text("[]")
        plat = self.home / "pleiades-platform.env"
        plat.write_text("")
        plat.chmod(0o600)
        self.stub = tmp / "stub"
        self.stub.mkdir()
        for name, body in {"pm2": PM2_STUB, "curl": CURL_STUB, "uname": "#!/bin/sh\necho Linux\n", "deploy.sh": DEPLOY_STUB}.items():
            p = self.stub / name
            p.write_text(body)
            p.chmod(0o755)
        (self.stub / "log").write_text("")

        work = tmp / "work"
        work.mkdir()
        git(work, "init", "-q", "-b", "main")
        (work / "package.json").write_text('{"name":"pleiades"}')
        (work / "deploy").mkdir()
        shutil.copy(SCRIPT, work / "deploy" / "release-inplace.sh")
        (work / "deploy" / "pleiades.config.cjs").write_text(CONFIG)
        for d in ("finance", "fitness"):
            (work / "apps" / d / "prisma" / "migrations").mkdir(parents=True)
            (work / "apps" / d / "prisma" / "migrations" / ".keep").write_text("")
        (work / "apps" / "finance" / "src" / "lib" / "ai").mkdir(parents=True)
        (work / "apps" / "finance" / "src" / "lib" / "ai" / "mcp-config.json").write_text("{}")
        (work / "apps" / "finance" / "a.ts").write_text("1")
        git(work, "add", "-A")
        git(work, "commit", "-qm", "v1.0.0")
        git(work, "tag", "v1.0.0")
        self.work = work
        self.origin = tmp / "origin.git"
        git(tmp, "clone", "-q", "--bare", str(work), str(self.origin))
        self.root = tmp / "pleiades-fin"
        git(tmp, "clone", "-q", "--no-tags", str(self.origin), str(self.root))
        git(self.root, "fetch", "-q", "--no-tags", "origin", "tag", "v1.0.0")
        git(self.root, "checkout", "-q", "v1.0.0")

    def release(self, tag: str, change: str = "code") -> None:
        """원격에 새 태그 — change: code · migration · mcp · self(스크립트 자신을 바꾼다)"""
        w = self.work
        if change == "code":
            (w / "apps" / "finance" / "a.ts").write_text(tag)
        elif change == "migration":
            (w / "apps" / "finance" / "prisma" / "migrations" / "20261027_x").mkdir()
            (w / "apps" / "finance" / "prisma" / "migrations" / "20261027_x" / "migration.sql").write_text("select 1;")
        elif change == "mcp":
            (w / "apps" / "finance" / "src" / "lib" / "ai" / "mcp-config.json").write_text('{"x":1}')
        elif change == "self":
            s = w / "deploy" / "release-inplace.sh"
            # 읽던 자리 뒤에 다른 내용이 오면 bash 가 그것을 실행한다 — 보호가 없으면 SELFCHANGED 가 찍힌다
            s.write_text("#!/usr/bin/env bash\n" + "# pad\n" * 400 + 'echo SELFCHANGED; exit 99\n')
            (w / "apps" / "finance" / "a.ts").write_text(tag)
        git(w, "add", "-A")
        git(w, "commit", "-qm", tag)
        git(w, "tag", tag)
        git(w, "push", "-q", str(self.origin), "main", tag)

    def env(self, **extra: str) -> dict:
        return {"PATH": f"{self.stub}:{NODE_DIR}:{BASE_PATH}", "HOME": str(self.home), "STUB": str(self.stub),
                "ROOT_DIR": str(self.root.resolve()), "PLEIADES_DEPLOY_SH": str(self.stub / "deploy.sh"),
                "PLEIADES_PRIVATE_DIR": str(self.tmp / "private"), "PLEIADES_BACKUP_DIR": str(self.tmp / "backup"),
                "DATABASE_URL": "postgresql://shell:SHELLSECRET@x/db", **extra}

    def run(self, *args: str, stdin: str = "", **extra: str) -> subprocess.CompletedProcess:
        return subprocess.run(["bash", str(self.root / "deploy" / "release-inplace.sh"), *args], input=stdin,
                              capture_output=True, text=True, env=self.env(**extra), timeout=60)

    def head(self) -> str:
        return git(self.root, "describe", "--tags", "--exact-match", "HEAD")

    def calls(self) -> str:
        return (self.stub / "log").read_text()


class ReleaseInplace(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.srv = Server(Path(self._tmp.name).resolve())

    def tearDown(self):
        self._tmp.cleanup()

    def assertStoppedBeforeChange(self, r: subprocess.CompletedProcess, why: str):
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("결과: 중단", r.stdout)
        self.assertIn(why, r.stdout)
        self.assertEqual(self.srv.head(), "v1.0.0")
        self.assertNotIn("deploy ", self.srv.calls())

    def test_usage(self):
        self.assertEqual(self.srv.run().returncode, 2)
        self.assertEqual(self.srv.run("xxx", "v1.0.1").returncode, 2)
        self.assertEqual(self.srv.run("fin", "1.0.1").returncode, 2)
        self.assertEqual(self.srv.run("fin", "v1.0.1", "--force").returncode, 2)

    def test_happy_path_prints_only_the_form(self):
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--yes")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.srv.head(), "v1.0.1")
        out = r.stdout
        self.assertIn("결과: 통과", out)
        self.assertIn("P v1.0.0 → V v1.0.1", out)
        self.assertIn("A  마이그레이션 0 · mcp-config 변경 0", out)
        self.assertIn("B  직전 태그 · 깨끗 · dump 사본: 예", out)
        self.assertIn("C1 셸 키 0 · platform 600 · 도는 pleiades-* same 6 · DIFF/MISSING 0", out)
        self.assertIn("C2 v1.0.1 · 깨끗: 예", out)
        self.assertRegex(out, r"C4 plan rc 0 · 기본 실행 rc 0 · \d+s · 완료 안내: 예")
        self.assertIn("online 3/3 · mcp 200 · 409 0", out)
        # 회귀: #276 — 오류 로그 파일명에 pm2 id 가 붙는다. 창 안 2줄(경고 1)을 두 파일에서 센다
        self.assertIn("web 2(경고 1)", out)
        # 화면에는 홈 경로·로그 원문·셸 비밀이 없다
        self.assertNotIn(str(self.srv.home), out + r.stderr)
        self.assertNotIn("DEPLOYSECRET", out + r.stderr)
        self.assertNotIn("SHELLSECRET", out + r.stderr)
        self.assertNotIn("424242", out)
        self.assertTrue((self.srv.tmp / "backup").exists())
        logs = list((self.srv.tmp / "private").glob("inplace-fin-2*.log"))
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].stat().st_mode & 0o777, 0o600)

    def test_shell_secrets_do_not_reach_deploy(self):
        # C1: 셸 값이 .env 를 가리면 안 된다 — deploy.sh 는 비운 셸에서 돈다
        self.srv.release("v1.0.1")
        (self.srv.stub / "deploy.sh").write_text('#!/bin/bash\nenv > "$STUB/deploy-env"\n'
                                                  '[[ " $* " == *" --dry-run "* ]] && exit 0\n'
                                                  'echo "=== 완료: $1 · $(git describe --tags --exact-match HEAD) ==="\n')
        r = self.srv.run("fin", "v1.0.1", "--yes")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        denv = (self.srv.stub / "deploy-env").read_text()
        self.assertNotIn("SHELLSECRET", denv)
        self.assertIn(f"PLEIADES_ENV_FILE={self.srv.home}/pleiades-platform.env", denv)

    def test_migration_tag_stops_before_checkout(self):
        self.srv.release("v1.0.1", "migration")
        self.assertStoppedBeforeChange(self.srv.run("fin", "v1.0.1", "--yes"), "마이그레이션이 든 태그")

    def test_fit_migration_and_lock_and_env_example_are_seen(self):
        # 회귀: #278 — 'apps/*/…' 와일드카드 pathspec 은 늘 0 이었다. 앱 경로를 직접 대조한다
        w = self.srv.work
        (w / "apps" / "fitness" / "package-lock.json").write_text("{}")
        (w / "apps" / "fitness" / ".env.example").write_text("NEW_KEY=")
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--dry-run")
        self.assertIn("deploy/·.env.example 변경 1", r.stdout)
        self.assertIn("lock apps/fitness/package-lock.json", r.stdout)
        self.srv.work = w
        (w / "apps" / "fitness" / "prisma" / "migrations" / "20261027_y").mkdir()
        (w / "apps" / "fitness" / "prisma" / "migrations" / "20261027_y" / "migration.sql").write_text("select 1;")
        self.srv.release("v1.0.2", "code")
        r = self.srv.run("fin", "v1.0.2", "--yes")
        self.assertIn("A  마이그레이션 1", r.stdout)
        self.assertEqual(r.returncode, 1)

    def test_mcp_config_change_stops(self):
        self.srv.release("v1.0.1", "mcp")
        self.assertStoppedBeforeChange(self.srv.run("fin", "v1.0.1", "--yes"), "mcp-config.json")

    def test_dirty_checkout_stops(self):
        self.srv.release("v1.0.1")
        (self.srv.root / "apps" / "finance" / "a.ts").write_text("local edit")
        self.assertStoppedBeforeChange(self.srv.run("fin", "v1.0.1", "--yes"), "깨끗하지 않다")

    def test_head_not_on_tag_stops(self):
        self.srv.release("v1.0.1")
        git(self.srv.root, "checkout", "-q", "--detach", "HEAD")
        (self.srv.root / "x").write_text("")
        git(self.srv.root, "add", "x")
        git(self.srv.root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "x")
        r = self.srv.run("fin", "v1.0.1", "--yes")
        self.assertEqual(r.returncode, 1)
        self.assertIn("HEAD 가 태그가 아니다", r.stdout)

    def test_same_tag_stops(self):
        r = self.srv.run("fin", "v1.0.0", "--yes")
        self.assertEqual(r.returncode, 1)
        self.assertIn("이미 v1.0.0", r.stdout)

    def test_running_env_diff_stops(self):
        self.srv.release("v1.0.1")
        self.assertStoppedBeforeChange(self.srv.run("fin", "v1.0.1", "--yes", STUB_ENV="diff"), "PLEIADES_ENV_FILE")

    def test_platform_env_permission_stops(self):
        self.srv.release("v1.0.1")
        (self.srv.home / "pleiades-platform.env").chmod(0o644)
        self.assertStoppedBeforeChange(self.srv.run("fin", "v1.0.1", "--yes"), "600 이 아니다")

    def test_processes_from_other_checkout_stop(self):
        self.srv.release("v1.0.1")
        self.assertStoppedBeforeChange(self.srv.run("fin", "v1.0.1", "--yes", STUB_CWD="/srv/other"), "다른 체크아웃")

    def test_dry_run_changes_nothing(self):
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--dry-run")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("결과: dry-run", r.stdout)
        self.assertEqual(self.srv.head(), "v1.0.0")
        self.assertNotIn("deploy ", self.srv.calls())
        self.assertFalse((self.srv.tmp / "backup").exists())

    def test_darwin_allows_only_dry_run(self):
        self.srv.release("v1.0.1")
        (self.srv.stub / "uname").write_text("#!/bin/sh\necho Darwin\n")
        self.assertStoppedBeforeChange(self.srv.run("fin", "v1.0.1", "--yes"), "--dry-run 만")
        self.assertEqual(self.srv.run("fin", "v1.0.1", "--dry-run").returncode, 0)

    def test_without_yes_asks_and_no_means_no(self):
        self.srv.release("v1.0.1")
        self.assertStoppedBeforeChange(self.srv.run("fin", "v1.0.1", stdin="n\n"), "사용자 취소")
        r = self.srv.run("fin", "v1.0.1", stdin="y\n")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.srv.head(), "v1.0.1")

    def test_deploy_failure_points_to_r8_with_previous_tag(self):
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--yes", STUB_DEPLOY_RC="1")
        self.assertEqual(r.returncode, 4)
        self.assertIn("기본 실행 rc 1", r.stdout)
        self.assertIn("빌드 실패", r.stdout)
        self.assertIn("R-8: deploy/release-inplace.sh fin v1.0.0", r.stdout)
        self.assertNotIn("/home/svc", r.stdout)  # deploy.sh 중단 문구의 다른 계정 홈도 ~ 로
        self.assertNotIn(str(self.srv.home), r.stdout)

    def test_deploy_exit3_is_its_own_code(self):
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--yes", STUB_DEPLOY_RC="3")
        self.assertEqual(r.returncode, 3)
        self.assertIn("옛 서비스가 online", r.stdout)

    def test_c5_failure_points_to_r8(self):
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--yes", STUB_MCP_CODE="502")
        self.assertEqual(r.returncode, 4)
        self.assertIn("mcp 502", r.stdout)
        self.assertIn("R-8: deploy/release-inplace.sh fin v1.0.0", r.stdout)

    def test_c5_counts_409(self):
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--yes", STUB_409="1")
        self.assertEqual(r.returncode, 4)
        self.assertIn("409 1", r.stdout)

    def test_rollback_is_the_same_command_with_previous_tag(self):
        self.srv.release("v1.0.1")
        self.assertEqual(self.srv.run("fin", "v1.0.1", "--yes").returncode, 0)
        r = self.srv.run("fin", "v1.0.0", "--yes")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("P v1.0.1 → V v1.0.0", r.stdout)
        self.assertEqual(self.srv.head(), "v1.0.0")

    def test_checkout_replacing_this_script_does_not_change_the_run(self):
        # C2 의 checkout 이 실행 중인 스크립트를 바꾼다 — 본문은 이미 다 읽은 함수라 이어서 돈다
        self.srv.release("v1.0.1", "self")
        r = self.srv.run("fin", "v1.0.1", "--yes")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn("SELFCHANGED", r.stdout + r.stderr)
        self.assertIn("결과: 통과", r.stdout)

    def test_private_dir_inside_checkout_is_refused(self):
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--yes", PLEIADES_PRIVATE_DIR=str(self.srv.root / "logs-here"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("체크아웃 안", r.stdout)
        self.assertEqual(self.srv.head(), "v1.0.0")


if __name__ == "__main__":
    unittest.main()
