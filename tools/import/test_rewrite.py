"""커밋 메시지 치환(rewrite.py) · 게이트(gate.py) 표 (#104 · 006 §4-2).

실행: python3 -m unittest discover -s tools/import
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import gate  # noqa: E402
from rewrite import rewrite, rewrite_bytes  # noqa: E402

ZW = "​"


class RewriteTable(unittest.TestCase):
    """006 §4-2 치환 표 — (앱, 원문, 기대)."""

    CASES = [
        # 서비스 이슈/PR URL
        ("fin", "see https://github.com/fomalhaut84/myFinance/pull/494", "see fin#494"),
        ("fit", "http://www.github.com/fomalhaut84/myFitness/issues/108 done", "fit#108 done"),
        ("fin", "https://github.com/FOMALHAUT84/MYFINANCE/issues/3#issuecomment-9", "fin#3#issuecomment-9"),
        # 기타 GitHub URL — 소유자 제거
        ("fin", "https://github.com/someone/other/issues/7", "other#7"),
        ("fit", "https://github.com/fomalhaut84/pleiades/discussions/2", "pleiades#2"),
        # 호스트 없는 URL 형식
        ("fin", "fomalhaut84/myFinance/pull/494", "fin#494"),
        ("fin", "www.github.com/fomalhaut84/pleiades/issues/51", "pleiades#51"),
        # 저장소 한정 (실측 3 — 대소문자 무시)
        ("fin", "Closes fomalhaut84/myFinance#494", "Closes fin#494"),
        ("fit", "ref fomalhaut84/myFitness#108", "ref fit#108"),
        ("fin", "Refs fomalhaut84/pleiades#51", "Refs pleiades#51"),
        ("fit", "FOMALHAUT84/MYFITNESS#9", "fit#9"),
        ("fit", "someone/lib#4", "lib#4"),
        # 한정 없는 #N — 앱 접두
        ("fin", "fix: 합계 (#82)", "fix: 합계 (fin#82)"),
        ("fit", "#1 and #22.", "fit#1 and fit#22."),
        ("fin", "Merge pull request #505 from x", "Merge pull request fin#505 from x"),
        # /#N · 기타 구분자 (렌더가 링크하는 형식)
        ("fin", "abc/#383", "abc/ fin#383"),
        ("fit", "fin/#12", "fin/ fit#12"),
        ("fin", "x:#5 .#6 fin-#7", "x:fin#5 .fin#6 fin-fin#7"),
        # GH-N
        ("fin", "GH-12 and gh-13", "fin#12 and fin#13"),
        ("fit", "(gh-3)", "(fit#3)"),
        # @멘션 — 제로폭 무해화
        ("fin", "thanks @octocat", f"thanks @{ZW}octocat"),
        ("fit", "bump @types/node", f"bump @{ZW}types/node"),
        ("fin", "Co-authored-by: A <a@b.com>", "Co-authored-by: A <a@b.com>"),
        # 바꾸지 않는 것
        ("fin", "color #fff and C# code", "color #fff and C# code"),
        ("fin", "abc#12 word-joined", "abc#12 word-joined"),
        ("fit", "", ""),
    ]

    def test_table(self):
        for app, src, want in self.CASES:
            with self.subTest(src=src):
                self.assertEqual(rewrite(src, app), want)

    def test_idempotent(self):
        for app, src, _ in self.CASES:
            with self.subTest(src=src):
                once = rewrite(src, app)
                self.assertEqual(rewrite(once, app), once)

    def test_output_passes_gate(self):
        for app, src, _ in self.CASES:
            with self.subTest(src=src):
                self.assertEqual(gate.findings(rewrite(src, app)), [])

    def test_bytes_roundtrip_keeps_invalid_utf8(self):
        raw = b"fix #3 \xff\xfe tail"
        self.assertEqual(rewrite_bytes(raw, "fit"), b"fix fit#3 \xff\xfe tail")

    def test_unknown_app_rejected(self):
        with self.assertRaises(ValueError):
            rewrite("#1", "calendar")


class GateTable(unittest.TestCase):
    """게이트는 callback 과 별도 구현 — 원문 형식이 하나라도 남으면 잡는다."""

    DIRTY = [
        ("fomalhaut84/myFinance#494", "i"),
        ("See Owner/Repo#1", "i"),
        ("https://github.com/fomalhaut84/myFitness/pull/5", "ii"),
        ("github.com/a/b/discussions/9", "ii"),
        ("a/b/issues/3", "iii"),
        ("GH-12", "iv"),
        ("fix #82", "v"),
        ("abc/#383", "v"),
        ("@octocat", "mention"),
    ]
    CLEAN = ["fin#494 fit#3 pleiades#51", "color #fff", "a@b.com", f"@{ZW}octocat", "abc#12"]

    def test_dirty(self):
        for text, rule in self.DIRTY:
            with self.subTest(text=text):
                self.assertIn(rule, {f.rule for f in gate.findings(text)})

    def test_clean(self):
        for text in self.CLEAN:
            with self.subTest(text=text):
                self.assertEqual(gate.findings(text), [])

    def test_cli_exit_codes(self):
        import subprocess
        script = Path(__file__).resolve().parent / "gate.py"
        ok = subprocess.run([sys.executable, str(script)], input=b"fin#1\n", capture_output=True, check=False)
        bad = subprocess.run([sys.executable, str(script)], input=b"x\nfix #2\n", capture_output=True, check=False)
        self.assertEqual(ok.returncode, 0)
        self.assertEqual(bad.returncode, 1)
        self.assertIn(b"v", bad.stderr)


if __name__ == "__main__":
    unittest.main()
