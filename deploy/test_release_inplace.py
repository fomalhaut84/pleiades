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
  if (process.env.STUB_JLIST === 'garbage') { process.stdout.write('[PM2][WARN] x\n[{"name": broken'); process.exit(0) }
  for (const a of ['fin', 'fit']) for (const r of ['mcp', 'web', 'bot']) {
    const name = `pleiades-${a}-${r}`
    if (process.env.STUB_MISSING === name) continue
    const v = process.env.STUB_ENV === 'diff' && name === 'pleiades-fit-bot' ? '/elsewhere' : process.env.HOME + '/pleiades-platform.env'
    list.push({ name, pid: 424242, pm2_env: { status: process.env.STUB_STATUS || 'online', pm_cwd: cwd(a), PLEIADES_ENV_FILE: v } })
  }
  process.stdout.write('[PM2][WARN] noise\n' + JSON.stringify(list))
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
# 진짜 deploy.sh 처럼 dry-run 도 완료 줄을 찍는다 — 같은 로그에서 찾으면 늘 참(#278 사전 리뷰 M2)
if [[ " $* " == *" --dry-run "* ]]; then
  echo "=== 완료: $1 · $(git describe --tags --exact-match HEAD) ==="
  exit "${STUB_PLAN_RC:-0}"
fi
ts=$(date '+%F %T')
mkdir -p "$HOME/.pm2/logs"
# 회귀: M4 — 금액 같은 숫자 409 는 세지 않는다 · 재기동 전(옛) 409 줄도
echo "2020-01-01 00:00:00: 409 Conflict: terminated by other getUpdates" >> "$HOME/.pm2/logs/pleiades-fin-bot-out-109.log"
echo "$ts: 매수 14090원 · id 4091" >> "$HOME/.pm2/logs/pleiades-fin-bot-out-114.log"
[[ -n "${STUB_409:-}" ]] && echo "$ts: GrammyError: Call to 'getUpdates' failed! (409: Conflict: terminated by other getUpdates request)" >> "$HOME/.pm2/logs/pleiades-fin-bot-error-114.log"
# 회귀: I10 — 실행 중인 스크립트를 같은 inode 에 덮어쓴다(truncate + write). 보호가 없으면 bash 가 새 내용을 읽는다
[[ -n "${STUB_SELF_OVERWRITE:-}" ]] && printf '%s\n' '#!/usr/bin/env bash' "$(printf '# pad%.0s\n' $(seq 4000))" 'echo SELFCHANGED; exit 99' > "$ROOT_DIR/deploy/release-inplace.sh"
[[ -n "${STUB_SLEEP:-}" ]] && sleep "$STUB_SLEEP"
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
        git_stub = f'#!/bin/bash\n[[ -n "$STUB_DIFF_FAIL" && " $* " == *" diff "* ]] && exit 128\nexec {shutil.which("git")} "$@"\n'
        for name, body in {"pm2": PM2_STUB, "curl": CURL_STUB, "uname": "#!/bin/sh\necho Linux\n", "deploy.sh": DEPLOY_STUB,
                           "git": git_stub}.items():
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
                "DATABASE_URL": "postgresql://shell:SHELLSECRET@x/db", "PLEIADES_TEST": "1", **extra}

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
        self.assertIn("R-8: release-inplace.sh fin v1.0.0", r.stdout)
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
        self.assertIn("R-8: release-inplace.sh fin v1.0.0", r.stdout)

    def test_c5_counts_409(self):
        # 회귀: M4 — 재기동 뒤 getUpdates 충돌만 센다(옛 409 줄 · 금액 14090 은 0)
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--yes")
        self.assertIn("409 0", r.stdout)
        self.assertEqual(r.returncode, 0, r.stdout)
        git(self.srv.root, "checkout", "-q", "v1.0.0")
        r = self.srv.run("fin", "v1.0.1", "--yes", STUB_409="1")
        self.assertEqual(r.returncode, 4)
        self.assertIn("409 1", r.stdout)

    def test_done_line_comes_from_the_real_run_only(self):
        # 회귀: M2 — dry-run 의 완료 줄로 "완료 안내: 예" 가 되면 안 된다
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--yes", STUB_DEPLOY_RC="1")
        self.assertIn("완료 안내: 아니오", r.stdout)

    def test_plan_failure_reverts_checkout(self):
        # 회귀: M6 — 빌드 전 실패는 직전 태그로 checkout 만 되돌리고 1
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--yes", STUB_PLAN_RC="2")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("v1.0.0 로 checkout 되돌림", r.stdout)
        self.assertEqual(self.srv.head(), "v1.0.0")

    def test_git_diff_failure_does_not_pass_the_gate(self):
        # 회귀: M3 — diff 실패를 "마이그레이션 0" 으로 세지 않는다
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--yes", STUB_DIFF_FAIL="1")
        self.assertEqual(r.returncode, 1)
        self.assertIn("git diff 실패", r.stdout)
        self.assertNotIn("마이그레이션 0", r.stdout)
        self.assertEqual(self.srv.head(), "v1.0.0")

    def test_rollback_after_partial_failure_is_not_blocked(self):
        # 회귀: M5 — deploy.sh 가 봇을 delete 한 뒤 실패해 2 개만 남아도 R-8 은 돈다
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--yes", STUB_MISSING="pleiades-fin-bot")
        self.assertIn("pleiades-fin 프로세스 2/3", r.stdout)
        self.assertNotIn("다른 체크아웃", r.stdout)

    def test_unparseable_pm2_stops_before_change(self):
        self.srv.release("v1.0.1")
        self.assertStoppedBeforeChange(self.srv.run("fin", "v1.0.1", "--yes", STUB_JLIST="garbage"), "PLEIADES_ENV_FILE")

    def test_overwriting_the_running_script_in_place_does_not_change_the_run(self):
        # 회귀: I10 — 같은 inode 덮어쓰기(새 inode 인 git checkout 보다 엄격하다)
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--yes", STUB_SELF_OVERWRITE="1")
        self.assertNotIn("SELFCHANGED", r.stdout + r.stderr)
        self.assertNotEqual(r.returncode, 99)

    def test_signal_does_not_leave_the_probe_running(self):
        # 회귀: M1 — SIGTERM 으로 끝나도 프로브(curl 루프)가 남지 않는다
        import signal
        import time
        self.srv.release("v1.0.1")
        p = subprocess.Popen(["bash", str(self.srv.root / "deploy" / "release-inplace.sh"), "fin", "v1.0.1", "--yes"],
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=self.srv.env(STUB_SLEEP="3"))
        for _ in range(100):
            if "deploy fin\n" in self.srv.calls():
                break
            time.sleep(0.1)
        p.send_signal(signal.SIGTERM)
        p.communicate(timeout=30)
        time.sleep(0.5)
        n = self.srv.calls().count("curl ")
        time.sleep(4.5)
        self.assertEqual(self.srv.calls().count("curl "), n, "프로브가 계속 돈다")

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

    # 회귀: PR #283 Codex P2 — C4·C5 실패 뒤 HEAD 는 이미 V 라 같은 태그 재시도가 "이미 V" 로 막혔다
    def test_retry_same_tag_after_failed_deploy(self):
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--yes", STUB_DEPLOY_RC="1")
        self.assertEqual(r.returncode, 4)
        self.assertIn("재시도: release-inplace.sh fin v1.0.1 --retry", r.stdout)
        r = self.srv.run("fin", "v1.0.1", "--yes")
        self.assertEqual(r.returncode, 1)
        self.assertIn("--retry", r.stdout)
        before = self.srv.calls().count("deploy fin\n")
        r = self.srv.run("fin", "v1.0.1", "--yes", "--retry")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("재시도 — HEAD 이미 v1.0.1", r.stdout)
        self.assertEqual(self.srv.calls().count("deploy fin\n"), before + 1)

    def test_failed_rollback_can_be_retried_and_points_to_last_ok(self):
        self.srv.release("v1.0.1")
        self.assertEqual(self.srv.run("fin", "v1.0.1", "--yes").returncode, 0)
        r = self.srv.run("fin", "v1.0.0", "--yes", STUB_DEPLOY_RC="1")   # R-8 이 일시 실패
        self.assertEqual(r.returncode, 4)
        self.assertIn("재시도: release-inplace.sh fin v1.0.0 --retry", r.stdout)
        r = self.srv.run("fin", "v1.0.0", "--yes", "--retry")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("마지막 통과 v1.0.1", r.stdout)

    # 회귀: PR #286 Codex P2 — 첫 배포가 실패하고 재시도도 실패해도 R-8 은 직전 태그를 가리킨다
    def test_first_deploy_failure_keeps_previous_tag_for_r8(self):
        self.srv.release("v1.0.1")
        self.assertEqual(self.srv.run("fin", "v1.0.1", "--yes", STUB_DEPLOY_RC="1").returncode, 4)
        r = self.srv.run("fin", "v1.0.1", "--yes", "--retry", STUB_DEPLOY_RC="1")
        self.assertEqual(r.returncode, 4)
        self.assertIn("R-8: release-inplace.sh fin v1.0.0", r.stdout)
        self.assertNotIn("<마지막 정상 태그>", r.stdout)
        self.assertIn("마지막 통과 v1.0.0", r.stdout)

    def test_retry_requires_head_at_the_tag(self):
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--yes", "--retry")
        self.assertEqual(r.returncode, 1)
        self.assertEqual(self.srv.head(), "v1.0.0")

    # 회귀: PR #283 Codex P2 — 첫 배포는 체크아웃에 이 스크립트가 없다 → 새 태그에서 꺼낸 판을 밖에서 --checkout
    def test_bootstrap_runs_from_outside_the_checkout(self):
        self.srv.release("v1.0.1")
        git(self.srv.root, "fetch", "-q", "--no-tags", "origin", "tag", "v1.0.1")
        outside = self.srv.tmp / "private-bin"
        outside.mkdir()
        (outside / "release-inplace.sh").write_text(git(self.srv.root, "show", "v1.0.1:deploy/release-inplace.sh") + "\n")
        r = subprocess.run(["bash", str(outside / "release-inplace.sh"), "fin", "v1.0.1", "--yes", "--checkout", str(self.srv.root)],
                           capture_output=True, text=True, env=self.srv.env(), timeout=60)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.srv.head(), "v1.0.1")

    # 회귀: #242 보안 리뷰 major · PR #291 Codex P2 — 두 배포가 겹치지 않는다 · 넘겨받기 경합 없이
    def test_flock_lock_blocks_a_concurrent_deploy(self):
        # flock(1) 흉내 — 물려받은 fd 에 fcntl.flock(LOCK_EX|LOCK_NB). 진짜 flock 처럼 락은 부모가 연 파일 설명에 남는다
        import time
        flock = self.srv.stub / "flock"
        flock.write_text("#!/usr/bin/env python3\nimport fcntl, sys\n"
                         "try:\n    fcntl.flock(int(sys.argv[2]), fcntl.LOCK_EX | fcntl.LOCK_NB)\n"
                         "except OSError:\n    sys.exit(1)\n")
        flock.chmod(0o755)
        self.srv.release("v1.0.1")
        first = subprocess.Popen(["bash", str(self.srv.root / "deploy" / "release-inplace.sh"), "fin", "v1.0.1", "--yes"],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=self.srv.env(STUB_SLEEP="4"))
        for _ in range(100):
            if "deploy fin\n" in self.srv.calls():
                break
            time.sleep(0.1)
        r = self.srv.run("fin", "v1.0.1", "--yes")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("다른 배포", r.stdout)
        out, _ = first.communicate(timeout=60)
        self.assertEqual(first.returncode, 0, out)
        # 끝나면 커널이 푼다 — 다음 배포는 잡는다(같은 태그라 할 일 없음으로 끝난다)
        r = self.srv.run("fin", "v1.0.1", "--yes")
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_mkdir_fallback_never_takes_over(self):
        # flock 이 없을 때(macOS)의 mkdir 락은 남은 락을 넘겨받지 않는다 — 지우는 경합(PR #291 Codex P2)을 만들지 않는다
        self.srv.release("v1.0.1")
        lock = self.srv.tmp / "private" / "deploy.lock.d"
        lock.mkdir(parents=True)
        self.assertStoppedBeforeChange(self.srv.run("fin", "v1.0.1", "--yes"), "다른 배포")
        (lock / "pid").write_text("999999")   # 죽은 pid 여도
        self.assertStoppedBeforeChange(self.srv.run("fin", "v1.0.1", "--yes"), "다른 배포")
        lock.rmdir() if not any(lock.iterdir()) else [f.unlink() for f in lock.iterdir()] and lock.rmdir()
        r = self.srv.run("fin", "v1.0.1", "--yes")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertFalse(lock.exists(), "끝나면 락을 푼다")

    def test_dry_run_takes_no_lock(self):
        self.srv.release("v1.0.1")
        lock = self.srv.tmp / "private" / "deploy.lock.d"
        lock.mkdir(parents=True)
        self.assertEqual(self.srv.run("fin", "v1.0.1", "--dry-run").returncode, 0)

    # 회귀: #242 보안 리뷰 major — 손으로 먼저 배포한 태그를 Actions 가 다시 받으면 실패가 아니라 할 일 없음
    def test_already_deployed_tag_is_a_noop(self):
        self.srv.release("v1.0.1")
        self.assertEqual(self.srv.run("fin", "v1.0.1", "--yes").returncode, 0)
        before = self.srv.calls().count("deploy fin\n")
        r = self.srv.run("fin", "v1.0.1", "--yes")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("이미 v1.0.1 배포됨", r.stdout)
        self.assertEqual(self.srv.calls().count("deploy fin\n"), before)

    def test_private_dir_inside_checkout_is_refused(self):
        self.srv.release("v1.0.1")
        r = self.srv.run("fin", "v1.0.1", "--yes", PLEIADES_PRIVATE_DIR=str(self.srv.root / "logs-here"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("체크아웃 안", r.stdout)
        self.assertEqual(self.srv.head(), "v1.0.0")


if __name__ == "__main__":
    unittest.main()
