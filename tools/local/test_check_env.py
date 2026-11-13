"""로컬 기동·migrate 전 실효 env 검사 (#104 · 006 §4-5 L-2·L-3·L-4·L-5·L-6·L-7 · I-4·I-7·I-14).

실행: python3 -m unittest discover -s tools/local
"""

import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import check_env as c  # noqa: E402

GOOD_FIT = {
    "DATABASE_URL": "postgresql://u:p@localhost:5432/pleiades_fit?schema=public",
    "PORT": "4600", "MCP_PORT": "4601",
    "CLAUDE_BIN": "/nonexistent/claude-disabled",
    "GARMIN_EMAIL": "", "GARMIN_PASSWORD": "", "MFDS_API_KEY": "",
}
OPTS: dict = {}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for app in ("finance", "fitness", "advisor"):
            (self.root / "apps" / app).mkdir(parents=True)
        shim = self.root / "bin" / "claude"
        shim.parent.mkdir()
        shim.write_text("#!/bin/sh\nexit 1\n")
        shim.chmod(shim.stat().st_mode | stat.S_IXUSR)

    def tearDown(self):
        self.tmp.cleanup()

    def problems(self, app, env, cwd=None, **opts):
        cwd = cwd or self.root / "apps" / {"fin": "finance", "fit": "fitness", "adv": "advisor"}[app]
        return c.problems(app, env, cwd=cwd, root=self.root, **{**OPTS, **opts})

    def keys(self, *a, **k):
        return {p.key for p in self.problems(*a, **k)}


class Fit(Base):
    def test_good_passes(self):
        self.assertEqual(self.problems("fit", GOOD_FIT), [])

    def test_violations(self):
        cases = [
            ({"DATABASE_URL": "postgresql://u:p@db.example.com:5432/pleiades_fit"}, "DATABASE_URL"),
            ({"DATABASE_URL": "postgresql://u:p@localhost:5433/pleiades_fit"}, "DATABASE_URL"),
            ({"DATABASE_URL": "postgresql://u:p@localhost:5432/myfitness"}, "DATABASE_URL"),
            ({"DATABASE_URL": "postgresql://u:p@localhost:5432/pleiades_fin"}, "DATABASE_URL"),
            ({"DATABASE_URL": ""}, "DATABASE_URL"),
            ({"PORT": "4200"}, "PORT"),
            ({"PORT": "3000"}, "PORT"),
            ({"PORT": ""}, "PORT"),
            ({"MCP_PORT": "4301"}, "MCP_PORT"),
            ({"MCP_PORT": "4600"}, "MCP_PORT"),
            ({"GARMIN_EMAIL": "me@x.com"}, "GARMIN_EMAIL"),
            ({"MFDS_API_KEY": "k"}, "MFDS_API_KEY"),
            ({"CLAUDE_BIN": ""}, "CLAUDE_BIN"),
            ({"CLAUDE_BIN": "/bin/sh"}, "CLAUDE_BIN"),
            ({"CLAUDE_BIN": "claude"}, "CLAUDE_BIN"),  # 상대 이름은 PATH 로 풀린다
            ({"DOTENV_CONFIG_PATH": "/x/.env"}, "DOTENV_CONFIG_PATH"),
            ({"DOTENV_CONFIG_OVERRIDE": "true"}, "DOTENV_CONFIG_OVERRIDE"),
        ]
        for patch, key in cases:
            with self.subTest(patch=patch):
                self.assertIn(key, self.keys("fit", {**GOOD_FIT, **patch}))

    # 009 D-5 B6 (pleiades#517): 앱이 TELEGRAM_* 를 읽지 않는다 — 남은 줄(서비스 토큰 모양이어도)은 검사 대상이 아니다
    def test_leftover_legacy_channel_keys_are_not_checked(self):
        leftover = {"TELEGRAM_BOT_TOKEN": "999:x", "TELEGRAM_ALLOWED_CHAT_IDS": "-100,555", "TELEGRAM_ADMIN_CHAT_IDS": "777"}
        self.assertEqual(self.problems("fit", {**GOOD_FIT, **leftover}), [])
        (self.root / "apps/finance/.env").write_text("TELEGRAM_BOT_TOKEN=999:other\n")  # 옛 '같은 봇' 검사도 없다
        self.assertEqual(self.problems("fit", {**GOOD_FIT, "TELEGRAM_BOT_TOKEN": "999:x"}), [])

    def test_wrong_cwd(self):
        self.assertIn("cwd", self.keys("fit", GOOD_FIT, cwd=self.root))

    def test_env_dot_files(self):
        (self.root / "apps/fitness/.env.local").write_text("X=1")
        (self.root / "apps/fitness/.env.example").write_text("X=1")
        self.assertEqual(self.keys("fit", GOOD_FIT), {".env.local"})

    def test_secret_values_never_printed(self):
        text = "\n".join(str(p) for p in self.problems("fit", {**GOOD_FIT, "MFDS_API_KEY": "topsecret",
                                                                  "GARMIN_PASSWORD": "hunter2"}))
        self.assertIn("MFDS_API_KEY", text)  # 위반은 잡히되 값은 나오지 않는다
        self.assertNotIn("topsecret", text)
        self.assertNotIn("hunter2", text)


class Fin(Base):
    GOOD = {"DATABASE_URL": "postgresql://u:p@127.0.0.1:5432/pleiades_fin", "PORT": "4500",
            "WHOOING_WEBHOOK_URL": ""}

    def test_good_with_shim_first(self):
        env = {**self.GOOD, "PATH": f"{self.root}/bin:/usr/bin:/bin"}
        self.assertEqual(self.problems("fin", env), [])

    def test_claude_not_shimmed(self):
        env = {**self.GOOD, "PATH": "/usr/bin:/bin"}
        self.assertIn("claude", self.keys("fin", env))

    def test_whooing_must_be_empty(self):
        env = {**self.GOOD, "PATH": f"{self.root}/bin", "WHOOING_WEBHOOK_URL": "https://x"}
        self.assertEqual(self.keys("fin", env), {"WHOOING_WEBHOOK_URL"})


class Adv(Base):
    """#679 · 012 4b-1 — 통합 층(apps/advisor): DB 없음 · 웹 포트 없음 · claude 는 shim(fin 과 같은 L-7)."""

    def env(self, **extra):
        return {"PATH": f"{self.root}/bin:/usr/bin:/bin", **extra}

    def test_good_passes_without_db_and_port(self):
        self.assertEqual(self.problems("adv", self.env()), [])

    def test_database_url_must_be_empty(self):
        # 통합 층은 DB 를 쓰지 않는다(012 Q135) — 로컬 pleiades_* 라도 두지 않는다
        for url in ("postgresql://u:p@localhost:5432/pleiades_fin", "postgresql://svc@prod/myfinance"):
            self.assertEqual(self.keys("adv", self.env(DATABASE_URL=url)), {"DATABASE_URL"})

    def test_claude_not_shimmed(self):
        self.assertIn("claude", self.keys("adv", {"PATH": "/usr/bin:/bin"}))

    def test_reserved_port_still_refused(self):
        self.assertIn("PORT", self.keys("adv", self.env(PORT="4100")))

    def test_platform_key_in_app_env_is_blocked(self):
        (self.root / "apps/advisor/.env").write_text("DISCORD_BOT_TOKEN_ADVISOR=x\n")
        self.assertIn("DISCORD_BOT_TOKEN_ADVISOR", self.keys("adv", self.env()))

    def test_wrong_cwd(self):
        self.assertIn("cwd", self.keys("adv", self.env(), cwd=self.root / "apps/finance"))


class RunSh(Base):
    """run.sh — L-1 파괴 명령 거부 · 셸 DATABASE_URL 제거 · 검사 통과 시에만 실행."""

    def run_sh(self, *cmd, **env):
        import subprocess
        (self.root / "apps/fitness/.env").write_text(
            "DATABASE_URL=postgresql://u:p@localhost:5432/pleiades_fit\nPORT=4600\nCLAUDE_BIN=/nonexistent/x\n")
        import shutil
        node = shutil.which("node")
        if node is None:
            self.skipTest("node 없음")
        full = {"PATH": f"{os.path.dirname(node)}:/usr/bin:/bin", "PLEIADES_ROOT": str(self.root), **env}
        return subprocess.run(["bash", str(HERE / "run.sh"), "fit", "--", *cmd], capture_output=True, text=True,
                              env=full, check=False)

    def test_runs_when_clean(self):
        r = self.run_sh("node", "-e", "console.log('ran in ' + require('path').basename(process.cwd()))")
        self.assertEqual((r.returncode, r.stdout.strip()), (0, "ran in fitness"), r.stderr)

    def test_shell_database_url_is_dropped(self):
        r = self.run_sh("node", "-e", "console.log(process.env.DATABASE_URL || 'unset')", DATABASE_URL="postgresql://svc@prod/myfitness")
        self.assertEqual(r.stdout.strip(), "unset", r.stderr)

    def test_pm2_home_is_pinned(self):
        """#171 — pm2 는 전용 데몬만: 호출자의 PM2_HOME(기본 ~/.pm2 포함)을 무시하고 <root>/.pm2-local 로 고정한다."""
        r = self.run_sh("node", "-e", "console.log(process.env.PM2_HOME)", PM2_HOME="/Users/someone/.pm2")
        self.assertEqual(r.stdout.strip(), str(self.root / ".pm2-local"), r.stderr)

    def test_pm2_always_env_checked(self):
        """회귀: PR #172 Codex P1 2회차·P2 3회차 — pm2 는 정리(kill·stop)도 env 검사를 거친다(검사 안 된 셸이 새 데몬을 띄우지 않게)."""
        fake = self.root / "fakebin"
        fake.mkdir()
        (fake / "npx").write_text('#!/bin/sh\necho "fake-npx $*"\n')
        (fake / "npx").chmod(0o755)
        import shutil
        node = shutil.which("node") or self.skipTest("node 없음")
        path = f"{fake}:{os.path.dirname(node)}:/usr/bin:/bin"
        for argv in (("kill",), ("stop", "pleiades-fit-bot"), ("ls",)):
            with self.subTest(argv=argv):
                r = self.run_sh("npx", "pm2", *argv, PATH=path, GARMIN_EMAIL="me@x.com")
                self.assertEqual(r.returncode, 1)
                self.assertNotIn("fake-npx", r.stdout)
        r = self.run_sh("npx", "pm2", "kill", PATH=path)
        self.assertEqual((r.returncode, r.stdout.strip()), (0, "fake-npx pm2 kill"), r.stderr)

    def test_destructive_prisma_refused(self):
        for cmd in (["npx", "prisma", "migrate", "reset"], ["npx", "prisma", "migrate", "dev"],
                    ["npx", "prisma", "db", "push", "--force-reset"], ["psql", "-c", "drop database x"],
                    ["./deploy/deploy.sh", "dev"], ["npx", "pm2", "start", "ecosystem.config.js"]):
            with self.subTest(cmd=cmd):
                r = self.run_sh(*cmd)
                self.assertEqual(r.returncode, 1)
                self.assertIn("run.sh: 중단", r.stderr)

    def test_discord_allowlists_are_read_from_process_env(self):
        hook = "https://discord.example/api/webhooks/1/verify"
        (self.root / ".env").write_text(f"DISCORD_CHANNEL_ID_FITNESS=100\nDISCORD_WEBHOOK_FITNESS={hook}\n")
        cmd = ("node", "-e", "console.log('ran')")
        self.assertEqual(self.run_sh(*cmd).returncode, 1)
        r = self.run_sh(*cmd, PLEIADES_VERIFY_DISCORD_IDS="100",
                        PLEIADES_VERIFY_DISCORD_WEBHOOK_SHA256=c.token_hash(hook).upper())  # 대문자 해시도 같은 값이다
        self.assertEqual((r.returncode, r.stdout.strip()), (0, "ran"), r.stderr)

    def test_adv_runs_in_advisor_dir(self):
        # #679 — run.sh adv: cwd = apps/advisor · 앱 .env 없이(DB·포트 없음) 통과
        import subprocess, shutil
        node = shutil.which("node")
        if node is None:
            self.skipTest("node 없음")
        full = {"PATH": f"{os.path.dirname(node)}:/usr/bin:/bin", "PLEIADES_ROOT": str(self.root)}
        r = subprocess.run(["bash", str(HERE / "run.sh"), "adv", "--", "node", "-e",
                            "console.log(require('path').basename(process.cwd()) + ' ' + (process.env.DATABASE_URL || 'unset'))"],
                           capture_output=True, text=True, env={**full, "DATABASE_URL": "postgresql://svc@prod/x"}, check=False)
        self.assertEqual((r.returncode, r.stdout.strip()), (0, "advisor unset"), r.stderr)

    def test_adv_pm2_is_refused(self):
        # #679 9-1 info — 통합 층은 로컬 pm2 리허설을 하지 않는다(012 §4-3 · I-3 예외는 fin·fit 만).
        # precheck APP_OF_DIR 에 advisor 가 없어 닫힌 쪽으로 거부된다 — 이 경로를 고정한다
        import subprocess
        r = subprocess.run(["bash", str(HERE / "run.sh"), "adv", "--", "npx", "pm2", "list", "pleiades-adv-bot"],
                           capture_output=True, text=True, env={"PATH": "/usr/bin:/bin", "PLEIADES_ROOT": str(self.root)}, check=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("pleiades-<app>-<역할>", r.stderr)

    def test_unknown_app_refused(self):
        import subprocess
        r = subprocess.run(["bash", str(HERE / "run.sh"), "xyz", "--", "node", "-v"], capture_output=True, text=True,
                           env={"PATH": "/usr/bin:/bin", "PLEIADES_ROOT": str(self.root)}, check=False)
        self.assertEqual(r.returncode, 1)

    def test_violation_blocks(self):
        r = self.run_sh("node", "-e", "console.log('should-not-run')", GARMIN_EMAIL="me@x.com")
        self.assertEqual(r.returncode, 1)
        self.assertNotIn("should-not-run", r.stdout)


class PlatformKeys(Base):
    """플랫폼 키(NOTIFY_* · DISCORD_WEBHOOK_*)는 루트 .env 에만 (#143)."""

    def test_platform_key_in_app_env_is_blocked(self):
        (self.root / "apps/fitness/.env").write_text('NOTIFY_ALLOWED_CHANNEL="discord"\nDISCORD_WEBHOOK_FITNESS=x\n')
        self.assertEqual(self.keys("fit", GOOD_FIT) & {"NOTIFY_ALLOWED_CHANNEL", "DISCORD_WEBHOOK_FITNESS"},
                         {"NOTIFY_ALLOWED_CHANNEL", "DISCORD_WEBHOOK_FITNESS"})

    def test_shell_platform_key_is_allowed(self):
        # 셸 export(일회성 덮어쓰기)는 막지 않는다 — 앱 .env 파일만 본다
        self.assertEqual(self.keys("fit", {**GOOD_FIT, "NOTIFY_ALLOWED_CHANNEL": "discord"}), set())


class Dotenv(Base):
    def test_shell_wins_over_file(self):
        (self.root / "apps/fitness/.env").write_text(
            '# c\nexport DATABASE_URL="postgresql://u:p@localhost:5432/pleiades_fit"\nPORT=4600\nQ=\'a b\'\n')
        eff = c.effective_env(self.root / "apps/fitness", {"PORT": "4200"})
        self.assertEqual(eff["DATABASE_URL"], "postgresql://u:p@localhost:5432/pleiades_fit")
        self.assertEqual(eff["PORT"], "4200")  # 셸 export 가 이긴다 (006 ㉕)
        self.assertEqual(eff["Q"], "a b")



class Discord(Base):
    """009 D-G(#328) — 실효 Discord 봇 토큰은 검증 봇 허용 목록(SHA-256)에 있어야 한다 · 값은 출력하지 않는다."""

    VERIFY = "verify.token.fin-aaaaaaaaaaaaaaaaaaaa"
    VERIFY_FIT = "verify.token.fit-bbbbbbbbbbbbbbbbbbbb"
    PROD = "PROD.SECRET.token-cccccccccccccccccccc"

    def hashes(self, *tokens):
        return {c.token_hash(t) for t in tokens}

    def dkeys(self, env, **opts):
        opts.setdefault("discord_hashes", self.hashes(self.VERIFY, self.VERIFY_FIT))
        return {p.key for p in self.problems("fit", {**GOOD_FIT, **env}, **opts)} - {"claude"}

    def root_env(self, text):
        (self.root / ".env").write_text(text)

    def test_no_discord_token_passes(self):
        self.assertEqual(self.dkeys({}), set())

    def test_root_env_verify_token_passes(self):
        self.root_env(f'DISCORD_BOT_TOKEN_FINANCE="{self.VERIFY}"\nDISCORD_BOT_TOKEN_FITNESS={self.VERIFY_FIT}\n')
        self.assertEqual(self.dkeys({}), set())

    def test_root_env_production_token_is_refused(self):
        self.root_env(f'DISCORD_BOT_TOKEN_FITNESS="{self.PROD}"\n')
        self.assertEqual(self.dkeys({}), {"DISCORD_BOT_TOKEN_FITNESS"})

    def test_shell_token_wins_and_is_checked(self):
        # 프로세스 env 가 이긴다(platformEnv 1순위) — 셸로 운영 토큰을 넣으면 거부
        self.root_env(f"DISCORD_BOT_TOKEN_FITNESS={self.VERIFY_FIT}\n")
        self.assertEqual(self.dkeys({"DISCORD_BOT_TOKEN_FITNESS": self.PROD}), {"DISCORD_BOT_TOKEN_FITNESS"})

    def test_empty_shell_value_hides_file_token(self):
        # 빈 값도 프로세스 env 가 이긴다 — 파일의 운영 토큰은 앱이 읽지 않으므로 통과
        self.root_env(f"DISCORD_BOT_TOKEN_FITNESS={self.PROD}\n")
        self.assertEqual(self.dkeys({"DISCORD_BOT_TOKEN_FITNESS": ""}), set())

    def test_pleiades_env_file_absolute_and_relative(self):
        self.root_env(f"DISCORD_BOT_TOKEN_FITNESS={self.VERIFY_FIT}\n")
        other = self.root / "other.env"
        other.write_text(f"DISCORD_BOT_TOKEN_FITNESS={self.PROD}\n")
        self.assertEqual(self.dkeys({"PLEIADES_ENV_FILE": str(other)}), {"DISCORD_BOT_TOKEN_FITNESS"})
        self.assertEqual(self.dkeys({"PLEIADES_ENV_FILE": "../../other.env"}), {"DISCORD_BOT_TOKEN_FITNESS"})  # cwd 기준

    def test_inline_comment_and_quotes_parse_like_platform_env(self):
        self.root_env(f"DISCORD_BOT_TOKEN_FITNESS={self.VERIFY_FIT} # 검증\nDISCORD_BOT_TOKEN_FINANCE='{self.VERIFY}'\n")
        self.assertEqual(self.dkeys({}), set())

    def test_same_token_for_both_apps_is_refused(self):
        self.root_env(f"DISCORD_BOT_TOKEN_FINANCE={self.VERIFY}\nDISCORD_BOT_TOKEN_FITNESS={self.VERIFY}\n")
        self.assertEqual(self.dkeys({}), {"DISCORD_BOT_TOKEN_FITNESS"})

    def test_empty_allowlist_refuses_any_token(self):
        self.root_env(f"DISCORD_BOT_TOKEN_FITNESS={self.VERIFY_FIT}\n")
        self.assertEqual(self.dkeys({}, discord_hashes=set()), {"DISCORD_BOT_TOKEN_FITNESS"})

    def test_values_never_in_messages(self):
        self.root_env(f"DISCORD_BOT_TOKEN_FITNESS={self.PROD}\nDISCORD_BOT_TOKEN_FINANCE={self.PROD}\n")
        text = " ".join(str(p) for p in self.problems("fit", GOOD_FIT, discord_hashes=set()))
        self.assertNotIn(self.PROD, text)
        self.assertNotIn(c.token_hash(self.PROD), text)

    # 회귀: #328 사전 리뷰 major — 앱 .env 의 PLEIADES_ENV_FILE(` # 주석` 해석 차이)로 운영 토큰 파일을 가리키는 우회
    def test_app_env_pleiades_env_file_is_refused(self):
        (self.root / "prod.env").write_text(f"DISCORD_BOT_TOKEN_FITNESS={self.PROD}\n")
        (self.root / "apps/fitness/.env").write_text("PLEIADES_ENV_FILE=../../prod.env # 주석\n")
        env = c.effective_env(self.root / "apps/fitness", GOOD_FIT)
        self.assertIn("PLEIADES_ENV_FILE", self.dkeys({k: v for k, v in env.items() if k not in GOOD_FIT}))

    def test_missing_pleiades_env_file_fails_closed(self):
        self.assertEqual(self.dkeys({"PLEIADES_ENV_FILE": str(self.root / "nope.env")}), {"PLEIADES_ENV_FILE"})

    def test_unreadable_platform_file_fails_closed(self):
        (self.root / "dir.env").mkdir()
        self.assertIn("PLEIADES_ENV_FILE", self.dkeys({"PLEIADES_ENV_FILE": str(self.root / "dir.env")}))

    def test_bom_crlf_export_and_unclosed_quote(self):
        self.root_env(f'\ufeffexport DISCORD_BOT_TOKEN_FITNESS={self.VERIFY_FIT}\r\nDISCORD_BOT_TOKEN_FINANCE="{self.PROD}\r\n')
        self.assertEqual(self.dkeys({}), set())  # 닫히지 않은 따옴표 값은 platformEnv 처럼 무시된다

    def test_vertical_tab_does_not_split_lines(self):
        self.root_env(f"DISCORD_BOT_TOKEN_FITNESS={self.PROD} #\x0bDISCORD_BOT_TOKEN_FITNESS={self.VERIFY_FIT}\n")
        self.assertEqual(self.dkeys({}), {"DISCORD_BOT_TOKEN_FITNESS"})

    # 회귀: PR #329 Codex P2 — 홀로 선 \r 은 줄을 나누지 않는다(platformEnv 는 번역 없이 읽는다)
    def test_lone_carriage_return_does_not_split_lines(self):
        (self.root / ".env").write_bytes(f"DISCORD_BOT_TOKEN_FITNESS={self.PROD}\n# c\rDISCORD_BOT_TOKEN_FITNESS={self.VERIFY_FIT}\n".encode())
        self.assertEqual(self.dkeys({}), {"DISCORD_BOT_TOKEN_FITNESS"})

    # 회귀: PR #329 Codex P2 — 앱은 토큰을 trim 해 쓴다 → 공백만 다른 두 토큰은 같은 봇
    def test_whitespace_variant_is_same_bot(self):
        self.root_env(f'DISCORD_BOT_TOKEN_FINANCE="{self.VERIFY} "\nDISCORD_BOT_TOKEN_FITNESS={self.VERIFY}\n')
        self.assertEqual(self.dkeys({}), {"DISCORD_BOT_TOKEN_FITNESS"})

    def test_uppercase_hash_in_allowlist(self):
        self.root_env(f"DISCORD_BOT_TOKEN_FITNESS={self.VERIFY_FIT}\n")
        self.assertEqual(self.dkeys({}, discord_hashes={c.token_hash(self.VERIFY_FIT).upper()}), set())

    def test_hash_helper_prints_hashes_not_tokens(self):
        self.root_env(f"DISCORD_BOT_TOKEN_FITNESS={self.VERIFY_FIT}\n")
        lines = c.discord_hash_lines({}, cwd=self.root / "apps/fitness", root=self.root)
        self.assertEqual(lines, [f"DISCORD_BOT_TOKEN_FITNESS {c.token_hash(self.VERIFY_FIT)}"])


class DiscordTargets(Base):
    """#359 · I-5′ — 실효 Discord 채널·사용자 ID 와 웹훅은 검증용 허용 목록에 있어야 한다 · 값은 출력하지 않는다."""

    HOOK = "https://discord.example/api/webhooks/1/verify"
    PROD_HOOK = "https://discord.example/api/webhooks/2/PROD-SECRET"
    OPTS = {"discord_ids": {"100", "200"}, "webhook_hashes": {c.token_hash(HOOK)}}

    def found(self, env=None, **opts):
        return [p for p in self.problems("fit", {**GOOD_FIT, **(env or {})}, **{**self.OPTS, **opts}) if p.key != "claude"]

    def dkeys(self, env=None, **opts):
        return {p.key for p in self.found(env, **opts)}

    def root_env(self, text):
        (self.root / ".env").write_text(text)

    def test_nothing_set_passes_without_allowlists(self):
        self.assertEqual(self.dkeys(discord_ids=set(), webhook_hashes=set()), set())

    def test_verify_ids_and_webhook_pass(self):
        self.root_env(f"DISCORD_CHANNEL_ID_FITNESS=100\nDISCORD_ALLOWED_USER_IDS=200, 100\nDISCORD_WEBHOOK_FITNESS={self.HOOK}\n")
        self.assertEqual(self.dkeys(), set())

    def test_production_channel_is_refused(self):
        self.root_env("DISCORD_CHANNEL_ID_FITNESS_CHAT=999\n")
        self.assertEqual(self.dkeys(), {"DISCORD_CHANNEL_ID_FITNESS_CHAT"})

    def test_one_unknown_user_in_list_is_refused_by_count_only(self):
        self.root_env("DISCORD_ALLOWED_USER_IDS=100,888\n")
        found = self.found()
        self.assertEqual({p.key for p in found}, {"DISCORD_ALLOWED_USER_IDS"})
        self.assertIn("1개", found[0].reason)
        self.assertNotIn("888", found[0].reason)

    def test_production_webhook_is_refused_without_printing_value(self):
        self.root_env(f"DISCORD_WEBHOOK_ADMIN={self.PROD_HOOK}\n")
        found = self.found()
        self.assertEqual({p.key for p in found}, {"DISCORD_WEBHOOK_ADMIN"})
        self.assertNotIn("PROD-SECRET", str(found[0]))

    def test_empty_allowlists_refuse_set_values(self):
        # 허용 목록을 export 하지 않으면 통과가 아니라 거부다 (fail-closed)
        self.root_env(f"DISCORD_CHANNEL_ID_FITNESS=100\nDISCORD_WEBHOOK_FITNESS={self.HOOK}\n")
        self.assertEqual(self.dkeys(discord_ids=set(), webhook_hashes=set()), {"DISCORD_CHANNEL_ID_FITNESS", "DISCORD_WEBHOOK_FITNESS"})

    def test_blank_values_pass(self):
        self.root_env("DISCORD_CHANNEL_ID_FITNESS=\nDISCORD_ALLOWED_USER_IDS= , \nDISCORD_WEBHOOK_FITNESS=\n")
        self.assertEqual(self.dkeys(), set())

    def test_shell_value_wins_over_file(self):
        self.root_env("DISCORD_CHANNEL_ID_FITNESS=999\n")
        self.assertEqual(self.dkeys({"DISCORD_CHANNEL_ID_FITNESS": "100"}), set())
        self.root_env("DISCORD_CHANNEL_ID_FITNESS=100\n")
        self.assertEqual(self.dkeys({"DISCORD_CHANNEL_ID_FITNESS": "999"}), {"DISCORD_CHANNEL_ID_FITNESS"})

    def test_pleiades_env_file_is_the_one_checked(self):
        self.root_env(f"DISCORD_WEBHOOK_FITNESS={self.HOOK}\n")
        other = self.root / "other.env"
        other.write_text(f"DISCORD_WEBHOOK_FITNESS={self.PROD_HOOK}\n")
        self.assertEqual(self.dkeys({"PLEIADES_ENV_FILE": str(other)}), {"DISCORD_WEBHOOK_FITNESS"})

    def test_commented_line_is_ignored(self):
        self.root_env("# DISCORD_CHANNEL_ID_FITNESS_CHAT=999\n")
        self.assertEqual(self.dkeys(), set())

    def test_webhook_whitespace_variant_matches(self):
        self.root_env(f'DISCORD_WEBHOOK_FITNESS="{self.HOOK} "\n')
        self.assertEqual(self.dkeys(), set())

    def test_unreadable_platform_file_reports_one_problem(self):
        (self.root / "dir.env").mkdir()
        keys = [p.key for p in self.found({"PLEIADES_ENV_FILE": str(self.root / "dir.env")})]
        self.assertEqual(sorted(keys), ["DISCORD_*", "PLEIADES_ENV_FILE"])

    def test_hash_lines_cover_webhooks_without_values(self):
        self.root_env(f"DISCORD_WEBHOOK_FITNESS={self.PROD_HOOK}\n")
        lines = c.discord_hash_lines({}, cwd=self.root / "apps/fitness", root=self.root)
        self.assertEqual(lines, [f"DISCORD_WEBHOOK_FITNESS {c.token_hash(self.PROD_HOOK)}"])
        self.assertNotIn("PROD-SECRET", "\n".join(lines))


if __name__ == "__main__":
    unittest.main()
