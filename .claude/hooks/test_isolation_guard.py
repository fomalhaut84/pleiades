"""isolation_guard 허용·거부 표 (#102 · .claude/rules/isolation.md).

실행: python3 -m unittest discover -s .claude/hooks
"""

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import isolation_guard as g  # noqa: E402

HOME = "/Users/tester"
ROOT = f"{HOME}/workspace/pleiades"
SCRIPT = Path(__file__).resolve().parent / "isolation_guard.py"


def rules(command, cwd=ROOT):
    """거부 사유의 불변식 번호 집합. 빈 집합 = 허용."""
    return {v.rule for v in g.check(command, cwd=cwd, root=ROOT, home=HOME)}


class DenyTable(unittest.TestCase):
    """막혀야 하는 명령 — (명령, cwd, 기대 규칙)."""

    CASES = [
        # I-1 gh api — 서비스 경로 쓰기
        ("gh api -X POST repos/fomalhaut84/myFinance/issues -f title=x", ROOT, "I-1"),
        ("gh api repos/fomalhaut84/myFitness/issues/1/comments -f body=hi", ROOT, "I-1"),
        ("gh api repos/fomalhaut84/myFitness/issues/1/comments -F body=@f.md", ROOT, "I-1"),
        ("gh api --method PATCH repos/fomalhaut84/myFinance/pulls/3", ROOT, "I-1"),
        ("gh api --method=DELETE repos/fomalhaut84/myFinance/git/refs/heads/x", ROOT, "I-1"),
        ("gh api -XPOST repos/fomalhaut84/myFinance/labels", ROOT, "I-1"),
        ("gh api /repos/FOMALHAUT84/MYFITNESS/issues --input body.json", ROOT, "I-1"),
        ("gh api repos/fomalhaut84/myFinance/issues --raw-field title=x", ROOT, "I-1"),
        ("gh api repos/fomalhaut84/myFinance/issues --field=title=x", ROOT, "I-1"),
        # I-1 graphql mutation — 경로 없이 node id 로 쓸 수 있다
        ("gh api graphql -f query='mutation { addComment(input:{}) { clientMutationId } }'", ROOT, "I-1"),
        # I-1 gh 서브커맨드 — 서비스 저장소 쓰기 동사
        ("gh issue create -R fomalhaut84/myFinance --title x --body y", ROOT, "I-1"),
        ("gh pr comment 12 --repo fomalhaut84/myFitness --body x", ROOT, "I-1"),
        ("gh pr close 12 --repo=fomalhaut84/myFitness", ROOT, "I-1"),
        ("gh label create pleiades -Rfomalhaut84/myFinance", ROOT, "I-1"),
        ("gh release create v1 -R fomalhaut84/myFitness", ROOT, "I-1"),
        ("gh pr comment https://github.com/fomalhaut84/myFinance/pull/5 --body x", ROOT, "I-1"),
        ("gh issue edit 3 -R https://github.com/fomalhaut84/myFinance --add-label x", ROOT, "I-1"),
        # I-1 git 쓰기 — 서비스 URL
        ("git push https://github.com/fomalhaut84/myFinance.git HEAD:dev", ROOT, "I-1"),
        ("git push git@github.com:fomalhaut84/myFitness.git x", ROOT, "I-1"),
        ("git remote add svc https://github.com/fomalhaut84/myFitness.git", ROOT, "I-1"),
        # I-11 repos/* · 원본에서 git
        (f"git -C {ROOT}/repos/myFinance status -s", ROOT, "I-11"),
        ("git -C repos/myFitness log --oneline -3", ROOT, "I-11"),
        (f"git -C ~/workspace/myFinance branch --show-current", ROOT, "I-11"),
        ("git status", f"{ROOT}/repos/myFitness", "I-11"),
        ("git log", f"{HOME}/workspace/myFitness/src", "I-11"),
        ("cd repos/myFinance && git status", ROOT, "I-11"),
        (f"git --git-dir={HOME}/workspace/myFinance/.git log", ROOT, "I-11"),
        # I-3 서버
        ("ssh user@server 'pm2 list'", ROOT, "I-3"),
        ("scp a.txt user@server:/tmp", ROOT, "I-3"),
        # I-19 배포 스크립트 실행
        ("./apps/finance/deploy/deploy.sh dev", ROOT, "I-19"),
        ("bash apps/fitness/deploy/deploy.sh", ROOT, "I-19"),
        ("./deploy/deploy.sh dev", f"{ROOT}/apps/finance", "I-19"),
        ("sh deploy/deploy.sh", f"{ROOT}/apps/fitness", "I-19"),
        ("pm2 start ecosystem.config.js", f"{ROOT}/apps/finance", "I-19"),
        ("source apps/finance/deploy/env.sh", ROOT, "I-19"),
        # I-21 pleiades 안 filter-repo
        ("git filter-repo --to-subdirectory-filter apps/fitness", ROOT, "I-21"),
        ("git-filter-repo --force --path x", f"{ROOT}/_workspace", "I-21"),
        ("venv/bin/git-filter-repo --force", ROOT, "I-21"),
        ('cd "$T/fit" && git-filter-repo --force', ROOT, "I-21"),  # cwd 를 알 수 없으면 막는다
        # 합성 · 중첩 — 조각마다 판정
        ("echo ok && gh issue create -R fomalhaut84/myFinance -t x -b y", ROOT, "I-1"),
        ("true; ssh host", ROOT, "I-3"),
        ("echo $(git -C repos/myFinance rev-parse HEAD)", ROOT, "I-11"),
        ("bash -c 'gh pr merge 3 -R fomalhaut84/myFitness'", ROOT, "I-1"),
        ("env GH_TOKEN=x gh issue close 1 -R fomalhaut84/myFinance", ROOT, "I-1"),
        ("FOO=1 ssh host", ROOT, "I-3"),
        ("ls\ngh issue comment 1 -R fomalhaut84/myFitness -b x", ROOT, "I-1"),
        # 회귀: #102 사전 리뷰 critical 1 (백슬래시 줄 이어쓰기)
        ("gh api repos/fomalhaut84/myFinance/issues \\\n  -f title=x", ROOT, "I-1"),
        ("gh issue create \\\n  -R fomalhaut84/myFinance \\\n  --title x --body y", ROOT, "I-1"),
        ("gh api \\\n  -X POST \\\n  repos/fomalhaut84/myFinance/issues", ROOT, "I-1"),
        ("git -C \\\n  repos/myFinance status", ROOT, "I-11"),
        # 회귀: #102 사전 리뷰 major 2 (셸 키워드)
        ("for r in a b; do git -C repos/myFinance status; done", ROOT, "I-11"),
        ("while read l; do ssh host; done < f", ROOT, "I-3"),
        ("if true; then ssh host; fi", ROOT, "I-3"),
        ("if false; then :; else ssh host; fi", ROOT, "I-3"),
        ("{ ssh host; }", ROOT, "I-3"),
        ("! ssh host", ROOT, "I-3"),
        # 회귀: #102 사전 리뷰 major 3 (인자 있는 래퍼 · 셸 플래그 묶음)
        ("timeout 5 ssh host", ROOT, "I-3"),
        ("timeout -s KILL 5 ssh host", ROOT, "I-3"),
        ("sudo -u x ssh host", ROOT, "I-3"),
        ("nice -n 5 ssh host", ROOT, "I-3"),
        ("echo host | xargs ssh", ROOT, "I-3"),
        ("xargs -n 1 ssh < hosts", ROOT, "I-3"),
        ("bash -lc 'ssh host'", ROOT, "I-3"),
        ("zsh -lc 'gh issue create -R fomalhaut84/myFinance -t x'", ROOT, "I-1"),
        ("bash -euc 'git -C repos/myFitness log'", ROOT, "I-11"),
        ("bash -o pipefail apps/finance/deploy/deploy.sh", ROOT, "I-19"),
        # 회귀: #102 사전 리뷰 major 4 ($HOME 류)
        ('git -C "$HOME/workspace/myFinance" status', ROOT, "I-11"),
        ("cd $HOME/workspace/myFinance && git log", ROOT, "I-11"),
        ('git -C "${HOME}/workspace/myFitness" log', ROOT, "I-11"),
        ('git -C "$CLAUDE_PROJECT_DIR/repos/myFinance" log', ROOT, "I-11"),
        # 회귀: #102 사전 리뷰 major 6 (GH_REPO · GIT_DIR · 전체 API URL)
        ("GH_REPO=fomalhaut84/myFinance gh issue create -t x -b y", ROOT, "I-1"),
        ("export GH_REPO=fomalhaut84/myFitness && gh pr close 3", ROOT, "I-1"),
        ("gh api https://api.github.com/repos/fomalhaut84/myFinance/issues -f title=x", ROOT, "I-1"),
        (f"GIT_DIR={HOME}/workspace/myFinance/.git git log", ROOT, "I-11"),
        # 회귀: #102 사전 리뷰 major 7 (따옴표 안 명령 치환)
        ('echo "HEAD=$(git -C repos/myFinance rev-parse HEAD)"', ROOT, "I-11"),
        ('echo "x `ssh host` y"', ROOT, "I-3"),
        ("echo $(echo $(ssh host))", ROOT, "I-3"),
        # 회귀: #102 사전 리뷰 info (파일 입력 graphql · pushd · 셸로 넘기는 heredoc)
        ("gh api graphql -F query=@mut.graphql", ROOT, "I-1"),
        ("gh api graphql --input q.json", ROOT, "I-1"),
        ("pushd repos/myFinance && git log", ROOT, "I-11"),
        ("bash <<'X'\nssh host\nX", ROOT, "I-3"),
        # 회귀: #102 사전 리뷰 probe (반복문 변수 경로)
        ("for r in myFinance myFitness; do git -C repos/$r status; done", ROOT, "I-11"),
        ("for d in repos/*; do git -C $d status; done", ROOT, "I-11"),
        ('for d in a ~/workspace/myFitness; do git -C "$d" log; done', ROOT, "I-11"),
        ("cd repos/$X && git status", ROOT, "I-11"),
        # 회귀: #102 사전 리뷰 2회차 critical 1 · major 1 (따옴표 없는 치환이 조각을 쪼갬)
        ("cd $(git rev-parse --show-toplevel) && git filter-repo --force", ROOT, "I-21"),
        ("cd `echo /x` && git-filter-repo --force", "/tmp", "I-21"),
        ("gh issue comment 3 --body $(cat b.txt) -R fomalhaut84/myFinance", ROOT, "I-1"),
        ("gh issue create --title $(date +%F) --repo fomalhaut84/myFinance -b x", ROOT, "I-1"),
        ("gh api repos/fomalhaut84/myFinance/issues/$(cat n)/comments -f body=x", ROOT, "I-1"),
        ("git -C $(pwd)/repos/myFinance status", ROOT, "I-11"),
        ("git -C `pwd`/repos/myFinance status", ROOT, "I-11"),
        # 회귀: #102 사전 리뷰 2회차 info (저비용분)
        ("git push https://user:tok@github.com/fomalhaut84/myFinance.git HEAD", ROOT, "I-1"),
        ("npx pm2 start ecosystem.config.js", f"{ROOT}/apps/finance", "I-19"),
        ("npx -y pm2 list", ROOT, "I-3"),
        ("pm2-runtime start x.js", ROOT, "I-3"),
        ("sh -s < apps/finance/deploy/deploy.sh", ROOT, "I-19"),
        ("bash < apps/fitness/deploy/deploy.sh", ROOT, "I-19"),
        # 회귀: PR #106 Codex P1 (조건·파이프 경계에서 cwd 추적)
        ("cd /definitely-missing || git filter-repo --force", ROOT, "I-21"),
        ("cd /tmp/s; git filter-repo --force", ROOT, "I-21"),
        ("cd /tmp/s | git-filter-repo --force", ROOT, "I-21"),
        ("(cd /tmp/s) && git filter-repo --force", ROOT, "I-21"),
        ("cd /tmp/s & git filter-repo --force", ROOT, "I-21"),
        # 회귀: PR #106 Codex P1 (env -C · --chdir)
        ("env -C repos/myFinance git status", ROOT, "I-11"),
        ("env --chdir=repos/myFinance git status", ROOT, "I-11"),
        ("env -C ~/workspace/myFitness git log", ROOT, "I-11"),
        ("env -C $ROOT_UNKNOWN git-filter-repo --force", "/tmp", "I-21"),
        # 회귀: PR #106 Codex P1 (경로·래퍼가 붙은 셸로 넘기는 heredoc)
        ("/bin/bash <<EOF\nssh host\nEOF", ROOT, "I-3"),
        ("command bash <<EOF\ngh issue create -R fomalhaut84/myFinance -t x\nEOF", ROOT, "I-1"),
        ("sudo -u x /usr/bin/env bash <<'X'\nssh host\nX", ROOT, "I-3"),
        ("cat <<'EOF' | sh\nssh host\nEOF", ROOT, "I-3"),
        # 회귀: PR #106 Codex P1 2회차 (&&/|| 목록을 지나도 실패한 cd 의 후보를 잃지 않는다)
        ("cd /definitely-missing && true; git filter-repo --force", ROOT, "I-21"),
        ("cd /missing && true && true; git filter-repo --force", ROOT, "I-21"),
        ("cd /missing && true || git filter-repo --force", ROOT, "I-21"),
        # 회귀: PR #106 Codex P1 2회차 (래퍼의 긴 옵션 값)
        ("printf 'host\\n' | xargs --max-args 1 ssh", ROOT, "I-3"),
        ("sudo --user nobody ssh host", ROOT, "I-3"),
        ("sudo --user=nobody ssh host", ROOT, "I-3"),
        ("nice --adjustment 5 ssh host", ROOT, "I-3"),
        ("timeout --signal KILL 5 ssh host", ROOT, "I-3"),
        ("xargs --delimiter , ssh < f", ROOT, "I-3"),
        ("env -S 'ssh host'", ROOT, "I-3"),
        ("env --split-string='git -C repos/myFinance status'", ROOT, "I-11"),
        ("sudo -D repos/myFinance git status", ROOT, "I-11"),
    ]

    def test_denied(self):
        for command, cwd, rule in self.CASES:
            with self.subTest(command=command, cwd=cwd):
                self.assertIn(rule, rules(command, cwd))


class AllowTable(unittest.TestCase):
    """통과해야 하는 명령 — 읽기 · pleiades 자신 · 스크래치."""

    CASES = [
        # 서비스 읽기 (I-13 허용)
        ("gh api repos/fomalhaut84/myFinance/branches/dev", ROOT),
        ("gh api -X GET repos/fomalhaut84/myFinance/issues -f state=open", ROOT),
        ("gh api --method GET repos/fomalhaut84/myFitness/pulls", ROOT),
        ("gh api repos/fomalhaut84/myFinance/issues --jq '.[].title'", ROOT),
        ("gh api graphql -f query='query { viewer { login } }'", ROOT),
        ("gh issue list -R fomalhaut84/myFinance --label pleiades", ROOT),
        ("gh pr view 12 -R fomalhaut84/myFitness", ROOT),
        ("gh pr diff 12 --repo fomalhaut84/myFitness", ROOT),
        ("gh pr checks 12 -R fomalhaut84/myFitness", ROOT),
        ("gh repo view fomalhaut84/myFinance", ROOT),
        ("git ls-remote --exit-code https://github.com/fomalhaut84/myFinance.git refs/heads/dev", ROOT),
        ("git clone -q --no-tags --single-branch --branch dev https://github.com/fomalhaut84/myFitness.git /tmp/s/fit", ROOT),
        # pleiades 자신 — 쓰기 포함
        ("gh issue create -R fomalhaut84/pleiades --title x --body y", ROOT),
        ("gh pr comment 105 -R fomalhaut84/pleiades --body '@codex review'", ROOT),
        ("gh api -X POST repos/fomalhaut84/pleiades/issues -f title=x", ROOT),
        ("gh pr create --base dev --head chore/102-x --title t --body b", ROOT),
        ("git status -sb && git push -u origin chore/102-x", ROOT),
        ("git -C apps/finance log --oneline -- package.json", ROOT),
        ("git log", f"{ROOT}/apps/fitness"),
        # 스크래치 · 문자열 속 언급
        ("cd /tmp/scratch/fit && git-filter-repo --force --to-subdirectory-filter apps/fitness", ROOT),
        ("git filter-repo --force", "/tmp/scratch/fit"),
        ("git -C /tmp/scratch/fit log --format=%B dev", ROOT),
        ("echo 'ssh 은 금지(I-3)' && grep -n 'git -C repos' CLAUDE.md", ROOT),
        ("cat apps/finance/deploy/deploy.sh", ROOT),
        ("rg -n ecosystem.config.js apps/", ROOT),
        ("ls repos/", ROOT),
        ("cat repos/myFinance/package.json", ROOT),
        ("python3 -m unittest discover -s .claude/hooks", ROOT),
        ("cat <<'EOF' > /tmp/body.md\nssh host\ngit -C repos/myFinance status\ngh issue create -R fomalhaut84/myFinance\nEOF\ngh pr edit 3 --body-file /tmp/body.md", ROOT),
        ("gh pr create -R fomalhaut84/pleiades --body \"금지: gh issue create -R fomalhaut84/myFinance\"", ROOT),
        # 이름이 비슷한 다른 저장소
        ("gh issue create -R fomalhaut84/myFinanceTools --title x", ROOT),
        ("gh issue create -R someone/myFinance --title x", ROOT),
        # 회귀: #102 사전 리뷰 major 5 (gh 전역 -R 뒤의 읽기 동사 — 오탐)
        ("gh -R fomalhaut84/myFinance issue list", ROOT),
        ("gh --repo fomalhaut84/myFitness pr view 3", ROOT),
        ("gh --repo=fomalhaut84/myFitness pr checks 3", ROOT),
        # 작은따옴표 안 $( ) · 백틱은 실행되지 않는다 — 오탐 금지
        ("grep -n '$(git -C repos/myFinance' CLAUDE.md", ROOT),
        ("gh pr create -R fomalhaut84/pleiades --title t --body 'run `ssh host` never'", ROOT),
        ("for f in a b; do echo $f; done", ROOT),
        ("timeout 60 npm test", ROOT),
        ("gh api graphql -f query='query { viewer { login } }' --jq .data", ROOT),
        ("GH_REPO=fomalhaut84/pleiades gh issue create -t x -b y", ROOT),
        ('git -C "$HOME/workspace/pleiades" status', ROOT),
        ("for f in apps/finance apps/fitness; do git -C $f log -1; done", ROOT),
        ("git -C $UNKNOWN log", ROOT),
        ("command -v ssh", ROOT),
        ("git status # then `ssh host`", ROOT),
        ("echo $(date) && git log -1", ROOT),
        ("git commit -m \"chore: $(date +%F)\"", ROOT),
        # cwd 추적이 보수적이되 정상 흐름은 막지 않는다
        ("cd /tmp/s && git filter-repo --force", ROOT),
        ("(cd repos/myFinance && ls); git status", ROOT),
        ("env -C apps/finance git log -1", ROOT),
        ("python3 - <<'EOF'\nimport os  # ssh host\nEOF", ROOT),
    ]

    def test_allowed(self):
        for command, cwd in self.CASES:
            with self.subTest(command=command, cwd=cwd):
                self.assertEqual(rules(command, cwd), set())


class HookProtocol(unittest.TestCase):
    """Claude Code PreToolUse 규약 — stdin JSON · exit 2 = 차단(stderr 가 Claude 에게 간다)."""

    def run_hook(self, payload, env_extra=None):
        env = {**os.environ, "CLAUDE_PROJECT_DIR": ROOT, "HOME": HOME, **(env_extra or {})}
        return subprocess.run(
            [sys.executable, str(SCRIPT)],
            input=payload if isinstance(payload, str) else json.dumps(payload),
            capture_output=True, text=True, env=env, check=False,
        )

    def test_deny_exits_2_with_rule_and_pointer(self):
        r = self.run_hook({"tool_name": "Bash", "cwd": ROOT,
                           "tool_input": {"command": "gh issue create -R fomalhaut84/myFinance -t x -b y"}})
        self.assertEqual(r.returncode, 2)
        self.assertIn("I-1", r.stderr)
        self.assertIn(".claude/rules/isolation.md", r.stderr)

    def test_allow_exits_0_silently(self):
        r = self.run_hook({"tool_name": "Bash", "cwd": ROOT, "tool_input": {"command": "git status"}})
        self.assertEqual((r.returncode, r.stderr), (0, ""))

    def test_non_bash_tool_is_ignored(self):
        r = self.run_hook({"tool_name": "Read", "cwd": ROOT, "tool_input": {"file_path": "x"}})
        self.assertEqual(r.returncode, 0)

    def test_bad_input_is_reported_not_blocking(self):
        # 회귀: #102 사전 리뷰 major 9 — 형식이 틀린 입력도 트레이스백이 아니라 정돈된 메시지
        for payload in ("not json", "[]", json.dumps({"tool_name": "Bash", "tool_input": "x"}),
                        json.dumps({"tool_name": "Bash", "tool_input": {"command": ["ssh"]}})):
            with self.subTest(payload=payload):
                r = self.run_hook(payload)
                self.assertEqual(r.returncode, 1)  # 비차단 오류 — 사용자에게 보인다
                self.assertIn("isolation_guard", r.stderr)
                self.assertNotIn("Traceback", r.stderr)


if __name__ == "__main__":
    unittest.main()
