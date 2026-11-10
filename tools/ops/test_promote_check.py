"""공개 승격 검사기 (#253 · 008 §5-2 P-2·P-3 · Q93) — 허용·거부 표.

실행: python3 -m unittest discover -s tools/ops

토큰 모양 값은 조각을 이어 만든다 — 실제 비밀이 아니어도 GitHub push protection 이 막을 수 있다(I-18).
"""

import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import promote_check as pc  # noqa: E402


def codes(text, deny=()):
    return sorted({f.code for f in pc.check(text, deny_values=list(deny))})


TG_TOKEN = "123456789" + ":" + "AA" + "x" * 33
DISCORD_TOKEN = "M" + "x" * 23 + "." + "y" * 6 + "." + "z" * 27
JWT = "ey" + "J" + "a" * 20 + "." + "b" * 20 + "." + "c" * 20
GH_TOKEN = "gh" + "p_" + "A1" * 18
SK_TOKEN = "s" + "k-" + "ant-" + "Ab1" * 10
AWS_KEY = "AK" + "IA" + "ABCDEFGHIJ234567"
SLACK = "xo" + "xb-" + "1234-abcd"
GENERIC = "gK7" * 12  # 36자 · 영문 대소 + 숫자 · 16진수가 아니다(SHA 는 허용 필드)


class AllowTest(unittest.TestCase):
    """P-2 허용 필드는 통과한다."""

    ALLOWED = [
        "fin 봇 · 심각도 높음 · 2026-11-10 09시 · 3회",
        "배포 태그 v1.10.0 에서 재현",
        "오류 클래스 TypeError · 코드 ECONNRESET",
        "apps/finance/src/bot/utils/error.ts:42 에서 던진다",
        "커밋 508a306 와 71c15fbc75400866c163e6b60d5df594059e5480 이후",
        "09:44 에 발행했고 16:30 에 확인",
        "원인 추정: 캐시 부분 일치 · 해결 방안: `=X` 제외",
        "참조 fin#494 · matrix#3 · #540",
        "https://github.com/fomalhaut84/pleiades/pull/562",
        "환경 변수 `DISCORD_WEBHOOK_URL=` 는 비어 있다",
        "Discord 웹훅 경로는 `/webhooks/<id>/<token>` 모양이다",
        "@codex review 를 요청",
        "테스트 1620 건 · 983 건 통과 · 126 GB",
        "deploy/release-inplace.sh · package.json · next.config.ts",
        "캐시의 `AMD=X`(USD/AMD) · KRW=X 환율",
        # 회귀: #253 사전 리뷰 major — 하이픈으로 이은 인계 파일 이름은 토큰이 아니다
        "docs/handoff/2026-11-09-releases-010-a1-t8-move.md 참고",
        "fe80 같은 단어와 a::b 같은 표기",
        "마이그레이션 `20261019090100` 이 남긴 점프",
        # 회귀: PR #563 Codex P2 — 경로·호스트 판정을 넓혀도 라우트·파일 이름은 통과한다
        "`/api/alerts/retry` 라우트 · /settings 페이지 · USD/AMD",
        "README.md · error.ts · deploy.yml · v1.5.4 · e.g. 예시",
    ]

    def test_allowed(self):
        for text in self.ALLOWED:
            with self.subTest(text=text):
                self.assertEqual(codes(text), [])


class BlockTest(unittest.TestCase):
    """P-2 금지 항목은 사유 코드로 막는다."""

    BLOCKED = [
        ("/Users/someone/workspace/x 에서", "ABS_PATH"),
        ("/home/deploy/app/logs 를 보면", "ABS_PATH"),
        ("~/pleiades-fin 체크아웃", "ABS_PATH"),
        ("서버 10.0.0.12 에 접속", "IPV4"),
        ("주소 fe80::1ff:fe23:4567:890a", "IPV6"),
        ("문의 someone@example.com", "EMAIL"),
        ("https://internal.example.net/health 가 500", "HOST"),
        ("api.myservice.io 가 응답하지 않음", "HOST"),
        ("NOTIFY_ADMIN_CHANNEL=discord 로 바꿨다", "ENV_VALUE"),
        ("TOKEN_SUFFIX=Xyz 로", "ENV_VALUE"),
        ("채널 123456789012345678 에서", "LONG_NUMBER"),
        ("채팅 -1001234567890 에서", "LONG_NUMBER"),
        ("숫자 20261399999999 는 날짜가 아니다", "LONG_NUMBER"),
        (f"token {TG_TOKEN}", "TOKEN"),
        (f"token {DISCORD_TOKEN}", "TOKEN"),
        (f"jwt {JWT}", "TOKEN"),
        (f"pat {GH_TOKEN}", "TOKEN"),
        (f"key {SK_TOKEN}", "TOKEN"),
        (f"aws {AWS_KEY}", "TOKEN"),
        (f"slack {SLACK}", "TOKEN"),
        (f"value {GENERIC}", "TOKEN"),
        ("https://discord.com/api/webhooks/123/" + "abcDEF" * 6, "TOKEN"),
        ("2026-11-10T09:44:12.123Z error: boom", "LOG_LINE"),
        ("[2026-11-10 09:44:12] boom", "LOG_LINE"),
        ("0|pleiades-fin-bot  | boom", "LOG_LINE"),
        ("[ERROR] boom", "LOG_LINE"),
        ("발생 시각 09:44:12", "TIMESTAMP_SECONDS"),
        # 회귀: #253 사전 리뷰 critical — 한글 조사·문장 끝 마침표가 붙어도 잡는다(유니코드 \\w 경계)
        ("서버 10.0.0.5에서", "IPV4"),
        ("서버 10.0.0.5.", "IPV4"),
        ("채널 123456789012345678번", "LONG_NUMBER"),
        ("채널 123456789012345678.", "LONG_NUMBER"),
        ("evil-server.net에 접속", "HOST"),
        (f"값 {GENERIC}를 넣었다", "TOKEN"),
        (f"키 {AWS_KEY}를", "TOKEN"),
        (f"토큰 {TG_TOKEN}이", "TOKEN"),
        ("경로/home/x 아래", "ABS_PATH"),
        # 회귀: PR #563 Codex P2 — 고정 목록 밖 최상위 디렉터리 · 목록 밖 TLD · 허용 접미에서 끊기는 호스트
        ("/data/private/app.log 에", "ABS_PATH"),
        ("/workspace/pleiades/app 아래", "ABS_PATH"),
        ("api.secret.uk 가 느리다", "HOST"),
        ("github.com.evil.uk 로", "HOST"),
        ("문의 someone@example.com으로", "EMAIL"),
        # 회귀: #253 사전 리뷰 major — 따옴표 env 값 · 스킴 무관 URL · userinfo · 사설 TLD · 짧은 IPv6
        ('DATABASE_URL="x" 로', "ENV_VALUE"),
        ("SECRET_NAME='x' 로", "ENV_VALUE"),
        ("postgresql://admin:pw@localhost:5432/fin", "URL_USERINFO"),
        ("redis://cache01:6379 로", "HOST"),
        ("myserver.local 에서", "HOST"),
        ("api.internal 이 느리다", "HOST"),
        ("주소 fe80::1 로", "IPV6"),
    ]

    def test_blocked(self):
        for text, code in self.BLOCKED:
            with self.subTest(text=text):
                self.assertIn(code, codes(text))

    def test_deny_values_case_insensitive(self):
        self.assertEqual(codes("DB 는 Secret_Db 이다", deny=["secret_db"]), ["DENY"])
        self.assertEqual(codes("무관한 문장", deny=["secret_db"]), [])

    def test_too_long(self):
        self.assertEqual(codes("가" * pc.DEFAULT_MAX_CHARS), [])
        self.assertIn("TOO_LONG", {f.code for f in pc.check("가" * (pc.DEFAULT_MAX_CHARS + 1))})
        self.assertEqual(pc.check("가" * 10, max_chars=5)[0].code, "TOO_LONG")

    def test_too_long_skips_pattern_scan(self):
        # 회귀: #253 사전 리뷰 major(성능) — 상한을 넘으면 패턴 검사 없이 TOO_LONG 만
        found = pc.check("a@b.cc " + "a" * 50, max_chars=10)
        self.assertEqual([f.code for f in found], ["TOO_LONG"])

    def test_deny_across_lines(self):
        self.assertIn("DENY", codes("앞 hid\nden_db 뒤", deny=["hidden_db"]))

    def test_position(self):
        (f,) = pc.check("첫 줄\n둘째 someone@example.com")
        self.assertEqual((f.code, f.line, f.col), ("EMAIL", 2, 4))


class DenyFileTest(unittest.TestCase):
    def test_load_skips_blank_and_comment(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "deny.local"
            p.write_text("# 주석\n\nalpha\n  beta  \n", encoding="utf-8")
            self.assertEqual(pc.load_deny(p), ["alpha", "beta"])

    def test_bom_is_stripped(self):
        # 회귀: #253 사전 리뷰 major — BOM 이 첫 값에 붙으면 그 값이 영영 안 걸렸다
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "deny.local"
            p.write_bytes("\ufeffalpha\n".encode("utf-8"))
            self.assertEqual(pc.load_deny(p), ["alpha"])

    def test_unreadable_raises(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "deny.local"
            p.write_bytes(b"\xff\xfe\x00bad")
            with self.assertRaises(pc.DenyFileError):
                pc.load_deny(p)
            with self.assertRaises(pc.DenyFileError):
                pc.load_deny(Path(d))  # 디렉터리

    def test_missing_file_is_none(self):
        self.assertIsNone(pc.load_deny(Path("/nonexistent/deny.local")))

    def test_env_overrides_default(self):
        with mock.patch.dict(os.environ, {pc.DENY_ENV: "/x/y"}):
            self.assertEqual(pc.deny_path(), Path("/x/y"))
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(pc.deny_path(), HERE / "deny.local")


class CliTest(unittest.TestCase):
    def run_cli(self, argv, stdin="", deny_text=None, deny_bytes=None):
        out, err = io.StringIO(), io.StringIO()
        with tempfile.TemporaryDirectory() as d:
            deny = Path(d) / "deny.local"
            if deny_text is not None:
                deny.write_text(deny_text, encoding="utf-8")
            if deny_bytes is not None:
                deny.write_bytes(deny_bytes)
            with mock.patch.dict(os.environ, {pc.DENY_ENV: str(deny)}), \
                    mock.patch("sys.stdin", io.StringIO(stdin)), \
                    redirect_stdout(out), redirect_stderr(err):
                rc = pc.main(argv)
        return rc, out.getvalue(), err.getvalue()

    def test_pass_exit0(self):
        rc, out, _ = self.run_cli(["-"], stdin="정상 본문", deny_text="")
        self.assertEqual(rc, 0)
        self.assertIn("통과", out)

    def test_block_exit1_never_echoes_value(self):
        secret = "someone@example.com"
        rc, out, err = self.run_cli(["-"], stdin=f"x {secret} {TG_TOKEN} hidden_db", deny_text="hidden_db\n")
        self.assertEqual(rc, 1)
        for v in (secret, TG_TOKEN, "hidden_db", "someone"):
            self.assertNotIn(v, out + err)
        self.assertIn("EMAIL", out)
        self.assertIn("DENY", out)

    def test_missing_deny_file_warns_but_checks(self):
        rc, out, err = self.run_cli(["-"], stdin="정상 본문", deny_text=None)
        self.assertEqual(rc, 0)
        self.assertIn("금지 값 파일", err)

    def test_file_input_and_max_chars(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "body.md"
            p.write_text("가" * 20, encoding="utf-8")
            rc, out, _ = self.run_cli([str(p), "--max-chars", "10"], deny_text="")
        self.assertEqual(rc, 1)
        self.assertIn("TOO_LONG", out)

    def test_deny_read_error_exit2(self):
        # 회귀: #253 사전 리뷰 major — 읽기 오류가 traceback · exit 1(=차단)로 끝났다
        rc, _, err = self.run_cli(["-"], stdin="본문", deny_text=None, deny_bytes=b"\xff\xfe\x00bad")
        self.assertEqual(rc, 2)
        self.assertNotIn("Traceback", err)

    def test_short_deny_values_skipped(self):
        rc, out, err = self.run_cli(["-"], stdin="a b c", deny_text="a\nlongvalue\n")
        self.assertEqual(rc, 0)
        self.assertIn("짧은 금지 값 1개", err)
        self.assertNotIn("a\n", err)

    def test_warning_hides_path(self):
        _, _, err = self.run_cli(["-"], stdin="본문", deny_text=None)
        self.assertNotIn("/", err)

    def test_max_chars_must_be_positive(self):
        with self.assertRaises(SystemExit) as cm, redirect_stderr(io.StringIO()):
            pc.main(["-", "--max-chars", "0"])
        self.assertEqual(cm.exception.code, 2)

    def test_unreadable_input_exit2(self):
        rc, _, err = self.run_cli(["/nonexistent/body.md"], deny_text="")
        self.assertEqual(rc, 2)
        self.assertTrue(err)


if __name__ == "__main__":
    unittest.main()
