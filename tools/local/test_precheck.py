"""run.sh 가 감싸는 명령의 사전 검사 (#104 · PR #110 Codex P1 ×2 · 006 L-1 · I-3 · I-19 · #171 로컬 pm2 예외).

실행: python3 -m unittest discover -s tools/local
"""

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import precheck as p  # noqa: E402

ROOT = "/Users/tester/workspace/pleiades"
HOME = "/Users/tester"
CWD = f"{ROOT}/apps/finance"


def reasons(*argv):
    return p.problems(list(argv), cwd=CWD, root=ROOT, home=HOME)


class Deny(unittest.TestCase):
    CASES = [
        # 회귀: PR #110 Codex P1 — 감싼 명령이 훅을 비껴간다
        ("./deploy/deploy.sh", "dev"),
        ("pm2", "start", "ecosystem.config.js"),
        ("ssh", "host"),
        ("npx", "pm2", "start", "ecosystem.config.js"),
        ("node", "ecosystem.config.js"),
        ("npm", "exec", "-c", "ssh host"),
        ("npx", "-c", "git -C ../../repos/myFinance status"),
        # 회귀: PR #110 Codex P1 — 파괴 SQL 은 공백·주석·대소문자를 정규화해서 본다
        ("psql", "-c", "DROP  DATABASE user_db"),
        ("npx", "prisma", "db", "execute", "--stdin", "-c", "DROP /* cleanup */ DATABASE user_db"),
        ("npx", "prisma", "db", "execute", "--sql", "drop\n\tdatabase x"),
        ("npx", "prisma", "db", "execute", "--sql", "DROP SCHEMA public CASCADE"),
        ("npx", "prisma", "migrate", "reset"),
        ("npx", "prisma", "migrate", "dev"),
        ("npx", "prisma", "db", "push", "--force-reset"),
        ("npx", "prisma", "db", "push", "--accept-data-loss"),
        ("npx", "dropdb", "x"),
        # 앱 명령이 아니다
        ("bash", "-c", "echo hi"),
        ("createdb", "pleiades_fin"),
        ("env", "npm", "run", "dev"),
        # #171 로컬 pm2 예외 — run.sh 안에서도 좁은 형태만
        ("pm2", "ls"),  # 전역 pm2 — run.sh 는 npx 경유만
        ("npx", "pm2", "startup"),  # launchd 서비스 등록
        ("npx", "pm2", "deploy", "production"),  # ssh 배포
        ("npx", "pm2", "link", "a", "b"),  # 원격 모니터링
        ("npx", "pm2", "install", "pm2-logrotate"),
        ("npx", "pm2", "pull", "fin-web"),  # 앱 디렉터리에서 git pull
        ("npx", "pm2", "start", "dist/bot.js"),  # start 는 루트 설정 파일만
        ("npx", "pm2", "start", "../../apps/finance/ecosystem.config.js"),
        ("npx", "pm2", "startOrReload", "ecosystem.config.js"),
        ("npx", "pm2", "start", "/tmp/deploy/pleiades.config.cjs"),  # 이름만 같은 다른 파일
        ("npx", "pm2", "reload", "ecosystem.config.js"),
        ("npx", "pm2"),  # 서브커맨드 없음
        ("npx", "-p", "pm2", "pm2", "ls"),
        ("npx", "pm2-runtime", "start", "../../deploy/pleiades.config.cjs"),
        ("npx", "pm2@latest", "ls"),  # 버전은 정확한 값만
    ]

    def test_denied(self):
        for argv in self.CASES:
            with self.subTest(argv=argv):
                self.assertNotEqual(reasons(*argv), [])


class Allow(unittest.TestCase):
    CASES = [
        ("npx", "prisma", "migrate", "deploy"),
        ("npx", "prisma", "generate"),
        ("npm", "run", "dev"),
        ("npm", "run", "build"),
        ("npm", "ci"),
        ("npm", "run", "test:run"),
        ("node", "dist/bot.js"),
        ("npx", "tsc", "--noEmit"),
        ("npx", "prisma", "db", "execute", "--sql", "SELECT 1 -- drop database later"),
        # #171 로컬 pm2 예외 — 루트 설정 파일 · 전용 데몬(PM2_HOME 은 run.sh 가 고정)
        ("npx", "pm2", "start", "../../deploy/pleiades.config.cjs"),
        ("npx", "-y", "pm2@6.0.13", "start", f"{ROOT}/deploy/pleiades.config.cjs", "--only", "fin-web"),
        ("npx", "pm2", "startOrReload", "../../deploy/pleiades.config.cjs", "--update-env"),
        ("npx", "pm2", "ls"),
        ("npx", "pm2", "jlist"),
        ("npx", "pm2", "describe", "fin-bot"),
        ("npx", "pm2", "logs", "fin-bot", "--nostream", "--lines", "50"),
        ("npx", "pm2", "restart", "fin-web"),
        ("npx", "pm2", "stop", "all"),
        ("npx", "pm2", "delete", "all"),
        ("npx", "pm2", "save"),
        ("npx", "pm2", "resurrect"),
        ("npx", "pm2", "kill"),
        ("npx", "pm2", "--version"),
    ]

    def test_allowed(self):
        for argv in self.CASES:
            with self.subTest(argv=argv):
                self.assertEqual(reasons(*argv), [])


if __name__ == "__main__":
    unittest.main()
