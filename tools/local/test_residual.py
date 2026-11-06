"""옛 채널 잔여 고정 (009 D-5 B8 · #523 · 설계 `_workspace/009/d5/02_writer_d5_r4.md` §7 · 009 §6 D-5 5-1 재정의).

`git grep --text -il -E <PATTERN>` 이 찾은 추적 파일마다 ① 경로 허용이거나 ② 줄 허용(그 파일의 일치 줄이 전부
허용 규칙에 맞음)이어야 통과한다. 허용 밖에 낱말이 새로 생기면 실패한다 — 이 파일에 규칙을 더하기 전에 §7 분류를 먼저 본다.

실행: python3 -m unittest discover -s tools/local
되돌리기: 이 파일 삭제(**즉시**).
"""

from __future__ import annotations

import re
import subprocess
import unittest
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATTERN = r"telegram|grammy|텔레그램"
HIT = re.compile(PATTERN, re.I)

# ── ① 경로 허용 ─────────────────────────────────────────────────────────
HISTORY = (  # 이력 문서(§7 N12)
    "_workspace/**",
    "docs/specs/**",
    "docs/research/**",
    "docs/handoff/**",
    "docs/artifacts/**",
    "CLAUDE.md",
    "README.md",
    "apps/*/docs/**",
)
ONE_OFF_RUNBOOKS = (  # 일회 런북 — 머리에 소진 블록(test_one_off_runbooks_carry_exhaustion_block)
    "docs/runbooks/007-t2-server-check.md",
    "docs/runbooks/007-t4-build-rehearsal.md",
    "docs/runbooks/007-t5-fin-cutover.md",
    "docs/runbooks/007-t9-fit-cutover.md",
    "docs/runbooks/007-t10-discord.md",
)
EXPLICIT = (
    # DB 스키마 · 마이그레이션(S-8 · 컬럼명은 바꾸지 않는다)
    "apps/fitness/prisma/schema.prisma",
    "apps/fitness/prisma/migrations/20260716054043_workout_adjustment/migration.sql",
    # R11 — 옛 알림 본문이 왜 HTML 인지 설명(동작·문구 무변경)
    "packages/notify/src/discord-md.ts",
    "apps/finance/src/app/alerts/history/client-utils.ts",
    # 금지어 테스트
    "packages/chat/src/contract.test.ts",
    "packages/notify/src/index.test.ts",
    "apps/finance/src/lib/ai/__tests__/system-prompt.test.ts",
    # 룰 이력 · 소진 하네스
    ".claude/rules/isolation.md",
    ".claude/agents/dual-repo-operator.md",
    ".claude/skills/dual-repo-change/SKILL.md",
    # 앱 하네스 잔여(Q4 a — AI 가 읽는 거짓 문구만 고쳤다)
    "apps/finance/.claude/agents/release-manager.md",
    "apps/finance/.claude/skills/codex-response-patterns/SKILL.md",
    "apps/finance/.claude/skills/milestone-workflow/SKILL.md",
    "apps/finance/.claude/skills/release-publisher/SKILL.md",
    "apps/finance/README.md",
)
SELF = "tools/local/test_residual.py"

# ── ② 줄 허용 ───────────────────────────────────────────────────────────
KEY = r"TELEGRAM_[A-Z0-9_]*"  # 옛 env 키 이름(대문자) — 셸 정리 목록 · redact · 테스트 픽스처
QUOTED_VALUE = r"""['"]telegram['"]"""  # 옛 스위치 값 픽스처('telegram')
DB_COLUMN = r"telegram(?:MessageId|ChatId)"  # fit 컬럼명(S-8)
NEGATIVE = r"assertNotIn\(|\.not\.to(?:Match|Contain)\(|\)\.toEqual\(\[\]\)"  # 금지어 단언
LITERAL = r"""(['"])(?:\\.|(?!\1).)*\1|/(?:\\.|[^/\s])+/[a-z]*"""  # 단언의 인자(문자열 · 정규식 리터럴)

TESTS = (
    "apps/*/src/**/__tests__/**",
    "apps/*/src/**/*.test.ts",
    "packages/*/src/**/*.test.ts",
    "deploy/test_*.py",
    "tools/local/test_*.py",
)


@dataclass(frozen=True)
class LineRule:
    paths: tuple[str, ...]
    when: str | None = None  # 이 줄에만 적용한다(없으면 모든 줄)
    strip: str | None = None  # 이것을 지운 뒤 낱말이 남지 않아야 허용(없으면 `when` 에 맞는 줄 전체 허용)
    why: str = ""


LINE_RULES = (
    LineRule(("deploy/release-inplace.sh",), when=r"^PLEIADES_KEYS='", strip=KEY, why="셸 정리 목록(5-2)"),
    LineRule(("docs/runbooks/release-inplace.md",), when=r"^KEYS='", strip=KEY, why="셸 정리 목록 런북 사본(5-2)"),
    LineRule(("apps/finance/src/mcp/logger.ts",), strip=KEY, why="redact — 서버 토큰 revoke 까지 가린다"),
    LineRule(("apps/fitness/src/**",), strip=DB_COLUMN, why="DB 컬럼명(S-8)"),
    LineRule(TESTS, strip=f"{KEY}|{QUOTED_VALUE}|{DB_COLUMN}", why="옛 env 픽스처 — 남아 있어도 읽지 않는다"),
    LineRule(TESTS, when=NEGATIVE, strip=LITERAL, why="금지어 단언 — 낱말은 인자 리터럴 안에만"),
    LineRule(("deploy/test_t2_check.py",), strip=r"https://api\.telegram\.org", why="크론 비밀 비출력 픽스처"),
)


def glob_re(glob: str) -> re.Pattern[str]:
    """`**` = 아무 경로 · `*` = `/` 를 넘지 않는 이름 조각."""
    out = []
    i = 0
    while i < len(glob):
        if glob.startswith("**/", i):
            out.append("(?:.*/)?")  # 디렉터리 0개 이상
            i += 3
        elif glob.startswith("**", i):
            out.append(".*")
            i += 2
        elif glob[i] == "*":
            out.append("[^/]*")
            i += 1
        else:
            out.append(re.escape(glob[i]))
            i += 1
    return re.compile("".join(out) + r"\Z")


def matches(path: str, globs: tuple[str, ...]) -> bool:
    return any(glob_re(g).match(path) for g in globs)


def path_allowed(path: str) -> bool:
    return path == SELF or matches(path, HISTORY) or path in ONE_OFF_RUNBOOKS or path in EXPLICIT


def line_allowed(path: str, line: str) -> bool:
    for rule in LINE_RULES:
        if not matches(path, rule.paths):
            continue
        if rule.when and not re.search(rule.when, line):
            continue
        if rule.strip is None or not HIT.search(re.sub(rule.strip, "", line)):
            return True
    return False


def hit_files() -> list[str]:
    """낱말이 든 추적 파일(작업 트리 내용) — 새 파일은 `git add` 뒤에 잡힌다."""
    r = subprocess.run(
        ["git", "-C", str(ROOT), "grep", "-z", "--text", "-i", "-l", "-E", "-e", PATTERN],
        capture_output=True, text=True, check=False,
    )
    if r.returncode not in (0, 1):  # 1 = 일치 없음
        raise RuntimeError(r.stderr)
    return [p for p in r.stdout.split("\0") if p]  # -z — 비 ASCII 경로가 따옴표로 감싸이지 않는다


def violations() -> list[str]:
    bad = []
    for path in hit_files():
        if path_allowed(path):
            continue
        for line in (ROOT / path).read_text(encoding="utf-8", errors="replace").splitlines():
            if HIT.search(line) and not line_allowed(path, line):
                bad.append(f"{path}: {line.strip()[:160]}")
    return bad


class ResidualTest(unittest.TestCase):
    def test_no_residual_outside_allow_list(self):
        self.assertEqual(violations(), [], "§7 허용 밖의 옛 채널 낱말")

    def test_explicit_allow_entries_still_match(self):
        # 정리된 파일이 허용 목록에 남지 않게 한다(목록이 낡으면 다음 잔여를 가린다)
        hits = set(hit_files())
        fixed = [p for rule in LINE_RULES for p in rule.paths if "*" not in p]
        stale = [p for p in (*ONE_OFF_RUNBOOKS, *EXPLICIT, *fixed) if p not in hits]
        self.assertEqual(stale, [])

    def test_one_off_runbooks_carry_exhaustion_block(self):
        for p in ONE_OFF_RUNBOOKS:
            head = (ROOT / p).read_text(encoding="utf-8").splitlines()[:4]
            self.assertTrue(any(l.startswith("> **소진 (") for l in head), p)
        t10 = (ROOT / "docs/runbooks/007-t10-discord.md").read_text(encoding="utf-8")
        self.assertIn("R2(`v1.9.0`) 뒤 실행 금지", t10)

    # 규칙 자체 — 허용이 너무 넓어지지 않는지
    def test_rules_reject_prose_next_to_allowed_tokens(self):
        self.assertTrue(line_allowed("apps/finance/src/mcp/logger.ts", "  'DATABASE_URL', 'TELEGRAM_BOT_TOKEN',"))
        self.assertFalse(line_allowed("apps/finance/src/mcp/logger.ts", "// 텔레그램 토큰 TELEGRAM_BOT_TOKEN"))
        self.assertTrue(line_allowed("apps/fitness/src/x.ts", "telegramMessageId: id,"))
        self.assertFalse(line_allowed("apps/fitness/src/x.ts", "telegramMessageId: id, // 텔레그램 메시지"))
        self.assertFalse(line_allowed("apps/finance/src/x.ts", "vi.stubEnv('TELEGRAM_BOT_TOKEN', '1:x')"))  # 테스트 밖
        self.assertTrue(line_allowed("deploy/test_x.py", 'self.assertNotIn("telegram", out)'))
        self.assertTrue(line_allowed("packages/x/src/a.test.ts", "expect(src).not.toMatch(/from\\s+['\"]grammy['\"]/)"))
        # 회귀: B8 9-1 info — 단언 줄이어도 낱말이 인자 밖(호출 이름 · 주석)이면 거부
        self.assertFalse(line_allowed("deploy/test_x.py", 'self.assertNotIn("x", out)  # 텔레그램'))
        self.assertFalse(line_allowed("apps/a/src/__tests__/b.ts", "expect(sendTelegram()).toEqual([])"))
        self.assertTrue(line_allowed("deploy/release-inplace.sh", "PLEIADES_KEYS='A|TELEGRAM_[A-Z_]*|B'"))
        self.assertFalse(line_allowed("deploy/x.sh", 'echo telegram'))
        self.assertFalse(line_allowed("deploy/release-inplace.sh", "# TELEGRAM_BOT_TOKEN 정리"))

    def test_glob(self):
        self.assertTrue(matches("apps/finance/docs/a/b.md", ("apps/*/docs/**",)))
        self.assertFalse(matches("apps/finance/src/docs.ts", ("apps/*/docs/**",)))
        self.assertFalse(matches("deploy/sub/test_x.py", ("deploy/test_*.py",)))
        # 회귀: B8 9-1 major — `**/` 는 디렉터리 0개도 받는다
        self.assertTrue(matches("packages/notify/src/index.test.ts", TESTS))
        self.assertTrue(matches("apps/x/src/__tests__/a.ts", TESTS))


if __name__ == "__main__":
    unittest.main()
