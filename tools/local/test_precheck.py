"""run.sh 가 감싸는 명령의 사전 검사 (#104 · PR #110 Codex P1 ×2 · 006 L-1 · I-3 · I-19).

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
    ]

    def test_allowed(self):
        for argv in self.CASES:
            with self.subTest(argv=argv):
                self.assertEqual(reasons(*argv), [])


if __name__ == "__main__":
    unittest.main()
