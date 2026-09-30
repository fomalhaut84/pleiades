#!/usr/bin/env python3
"""isolation_guard — Bash 명령이 서비스 격리 불변식을 어기면 막는 PreToolUse 훅 (#102).

정본은 .claude/rules/isolation.md(006 §5 I-1~I-21) 다. 이 훅은 **실수 방지**이지 룰의 대체가 아니다 —
텍스트 매칭이라 임의 변수 치환(`$R`) · `eval` · 스크립트 파일 안의 명령은 보지 못한다. 막히면 우회하지 말고 명령을 다시 쓴다.
알고 두는 한계: 파이프로 셸에 넘기는 스크립트(`cat x | bash`)는 보지 못한다 · 서브셸 `( cd … )` 의 cwd 가 바깥으로 이어진다
(보수적 오탐) · cwd 를 알 수 없는 filter-repo 는 막는다(`cd $(mktemp -d)` 포함 — 리터럴 경로나 tools/import 스크립트로).

규약 (Claude Code hooks): stdin 으로 {"tool_name", "tool_input": {"command"}, "cwd"} JSON 을 받는다.
exit 0 = 통과 · exit 2 = 차단(stderr 가 Claude 에게 간다) · 그 외 = 비차단 오류(사용자에게 보인다).
표준 라이브러리만 쓴다. 테스트: python3 -m unittest discover -s .claude/hooks
"""

from __future__ import annotations

import json
import os
import re
import shlex
import sys
from dataclasses import dataclass
from pathlib import Path

RULE_FILE = ".claude/rules/isolation.md"

# 서비스 저장소 참조 — 소유자·이름이 정확히 같을 때만 (myFinanceTools · someone/myFinance 는 아니다)
_SVC = r"fomalhaut84/(?:myfinance|myfitness)"
SERVICE_REF = re.compile(
    r"(?:(?:https?://)?(?:[^@/\s]+@)?(?:www\.)?github\.com/|git@github\.com:|ssh://git@github\.com/)?"
    + _SVC + r"(?:\.git)?(?:/.*)?",
    re.IGNORECASE,
)
SERVICE_API = re.compile(r"(?:https?://api\.github\.com)?/?repos/" + _SVC + r"(?:[/?].*)?", re.IGNORECASE)
MUTATION = re.compile(r"\bmutation\b", re.IGNORECASE)
DEPLOY_PATH = re.compile(r"(?:^|/)apps/[^/]+/deploy/")
ECOSYSTEM = re.compile(r"ecosystem\.config\.[cm]?js$")
ASSIGNMENT = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", re.DOTALL)
HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
PIPE_TO_SHELL = re.compile(r"\|&?\s*(?:\S*/)?(?:bash|sh|zsh|dash)\b")
KNOWN_VARS = re.compile(r"\$(?:\{(HOME|CLAUDE_PROJECT_DIR|PWD)\}|(HOME|CLAUDE_PROJECT_DIR|PWD)\b)")
ANY_VAR = re.compile(r"\$(?:\{(\w+)\}|(\w+))")
LOOP_PREFIX = "\0for:"  # for 변수 값 목록을 env 에 담는 키 접두

SEPARATOR_CHARS = set(";&|()")
KEYWORDS = {"if", "then", "do", "else", "elif", "while", "until", "!", "{", "}", "time"}
# 래퍼: 이름 → (값을 받는 플래그, 명령 앞 위치 인자 수)
WRAPPERS = {
    "sudo": ({"-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U"}, 0),
    "timeout": ({"-s", "-k", "--signal", "--kill-after"}, 1),
    "nice": ({"-n", "--adjustment"}, 0),
    "xargs": ({"-n", "-I", "-L", "-P", "-s", "-d", "-E", "-a"}, 0),
    "npx": ({"-p", "--package"}, 0),
    "command": (set(), 0), "exec": (set(), 0), "nohup": (set(), 0), "builtin": (set(), 0),
}
ENV_VALUE_FLAGS = {"-u", "--unset", "-C", "--chdir"}
SHELLS = {"bash", "sh", "zsh", "dash"}
SHELL_VALUE_FLAGS = {"-o", "+o", "-O", "+O", "--rcfile", "--init-file"}
SOURCERS = {"source", "."}
REMOTE_SHELLS = {"ssh", "scp", "sftp", "mosh"}
GH_READ_VERBS = {"view", "list", "diff", "checks", "status", "clone"}
GH_API_VALUE_FLAGS = {"-X", "--method", "-f", "-F", "--field", "--raw-field", "-H", "--header",
                      "--input", "-q", "--jq", "-t", "--template", "--hostname", "--cache", "-p", "--preview"}
GH_API_FIELD_FLAGS = {"-f", "-F", "--field", "--raw-field", "--input"}


@dataclass(frozen=True)
class Violation:
    rule: str
    reason: str


@dataclass(frozen=True)
class Context:
    root: str
    home: str


# ---------- 텍스트 → 조각 ----------

def _prepare(command: str) -> str:
    """heredoc 본문(데이터)을 지우고 백슬래시 줄 이어쓰기를 합친다."""
    out, lines, i = [], command.split("\n"), 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        m = HEREDOC.search(line) if "<<<" not in line else None
        i += 1
        if m and not _feeds_shell(line, m):
            while i < len(lines) and lines[i].lstrip("\t").rstrip() != m.group(2):
                i += 1
            i += 1  # 종료 구분자 줄
    return re.sub(r"\\\n", " ", "\n".join(out))


def _feeds_shell(line: str, m: re.Match) -> bool:
    """heredoc 을 받는 쪽이 셸이면 본문은 데이터가 아니라 명령이다 — 경로·래퍼가 붙어도(`/bin/bash` ·
    `command bash` · `sudo -u x /usr/bin/env bash`) · 파이프로 셸에 넘겨도(`cat <<X | sh`). 회귀: PR #106 Codex P1"""
    if PIPE_TO_SHELL.search(line[m.end():]):
        return True
    consumer = re.split(r"[;&|(]", line[:m.start()])[-1]
    try:
        words = shlex.split(consumer)
    except ValueError:
        words = consumer.split()
    argv = _unwrap(words)[0]
    return bool(argv) and os.path.basename(argv[0]) in SHELLS


def _substitutions(text: str) -> tuple[list[str], str]:
    """(작은따옴표 밖 `$( … )` · 백틱의 안쪽 목록, 그 구간을 자리표시로 바꾼 텍스트).

    안쪽은 따옴표 안이어도 실행되는 코드라 따로 검사한다. 바깥에는 자리표시(`$__SUBST__` · `pwd` 는 `$PWD`)를 남겨
    치환이 조각을 쪼개지 않게 한다 — 쪼개면 `cd $(…)` 가 `cd ~` 로 읽히고 뒤 플래그가 떨어져 나간다
    (회귀: #102 사전 리뷰 2회차 critical 1 · major 1). 따옴표 밖 `#` 주석은 지운다.
    """
    found, out, i, n, sq, dq = [], [], 0, len(text), False, False
    while i < n:
        c = text[i]
        if sq:
            sq = c != "'"
        elif c == "\\":
            out.append(text[i:i + 2])
            i += 2
            continue
        elif c == "'" and not dq:
            sq = True
        elif c == '"':
            dq = not dq
        elif c == "#" and not dq and (i == 0 or text[i - 1] in " \t\n;&|("):
            j = text.find("\n", i)
            i = n if j < 0 else j
            continue
        elif (c == "$" and text.startswith("(", i + 1) and not text.startswith("((", i + 1)) or c == "`":
            if c == "`":
                j = text.find("`", i + 1)
                j = n if j < 0 else j
                inner, i = text[i + 1:j], j + 1
            else:
                depth, j = 1, i + 2
                while j < n and depth:
                    depth += {"(": 1, ")": -1}.get(text[j], 0)
                    j += 1
                inner, i = text[i + 2:j - 1], j
            found.append(inner)
            out.append("$PWD" if inner.strip() == "pwd" else "$__SUBST__")
            continue
        out.append(c)
        i += 1
    return found, "".join(out)


def _tokens(text: str) -> list[str]:
    lexer = shlex.shlex(text.replace("\n", " ; "), posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    try:
        return list(lexer)
    except ValueError:  # 따옴표 불균형 — 거칠게라도 본다
        return re.findall(r"[^\s;&|()]+|[;&|()]+", text)


OPERATORS = ("&&", "||", "|&", ";;", ";", "&", "|", "(", ")")


def _stream(tokens: list[str]) -> list[tuple[str, list[str] | str]]:
    """토큰 → [("seg", 명령 토큰들) | ("op", 연산자)] — 연산자가 cwd 전이를 정한다."""
    items, cur = [], []
    for t in tokens:
        if t and set(t) <= SEPARATOR_CHARS:
            if cur:
                items.append(("seg", cur))
            cur, rest = [], t
            while rest:
                op = next((o for o in OPERATORS if rest.startswith(o)), rest[0])
                items.append(("op", op))
                rest = rest[len(op):]
        else:
            cur.append(t)
    if cur:
        items.append(("seg", cur))
    return items


def _unwrap(seg: list[str]) -> tuple[list[str], dict[str, str], str | None]:
    """`FOO=1 env -C d -u X timeout 5 sudo -u y cmd …` → (`cmd …`, {FOO: 1}, "d")

    셋째 값은 `env -C/--chdir` 로 바뀐 실행 디렉터리(원문) — 회귀: PR #106 Codex P1."""
    env, i, chdir = {}, 0, None
    while i < len(seg):
        t = seg[i]
        a = ASSIGNMENT.match(t)
        if t in KEYWORDS:
            i += 1
        elif a:
            env[a.group(1)] = a.group(2)
            i += 1
        elif os.path.basename(t) == "env":
            i += 1
            while i < len(seg) and (seg[i].startswith("-") or ASSIGNMENT.match(seg[i])):
                f = seg[i]
                a = ASSIGNMENT.match(f)
                if a:
                    env[a.group(1)] = a.group(2)
                if f in ("-C", "--chdir") and i + 1 < len(seg):
                    chdir = seg[i + 1]
                elif f.startswith("--chdir="):
                    chdir = f.split("=", 1)[1]
                elif f.startswith("-C") and len(f) > 2:
                    chdir = f[2:]
                i += 2 if f in ENV_VALUE_FLAGS else 1
        elif t == "command" and seg[i + 1:i + 2] in (["-v"], ["-V"]):
            return [], env, chdir  # 조회 — 실행하지 않는다
        elif os.path.basename(t) in WRAPPERS:
            value_flags, positional = WRAPPERS[os.path.basename(t)]
            i += 1
            while i < len(seg) and seg[i].startswith("-"):
                i += 2 if seg[i] in value_flags else 1
            i += positional
        else:
            break
    return seg[i:], env, chdir


# ---------- 경로 ----------

def _resolve(path: str | None, cwd: str | None, ctx: Context) -> str | None:
    """알 수 없으면 None — 모르는 변수가 들어 있거나 상대 경로인데 cwd 를 모를 때."""
    if path is None:
        return None
    known = {"HOME": ctx.home, "CLAUDE_PROJECT_DIR": ctx.root, "PWD": cwd}

    def sub(m: re.Match) -> str:
        value = known[m.group(1) or m.group(2)]
        return value if value is not None else "$?"

    path = KNOWN_VARS.sub(sub, path)
    if "$" in path:
        return None
    if path == "~" or path.startswith("~/"):
        path = ctx.home + path[1:]
    if not path.startswith("/"):
        if cwd is None:
            return None
        path = os.path.join(cwd, path)
    return os.path.normpath(path)


def _under(path: str | None, base: str) -> bool:
    if path is None:
        return False
    p, b = path.lower(), base.lower().rstrip("/")  # macOS 기본 파일시스템은 대소문자 무시
    return p == b or p.startswith(b + "/")


def _frozen(path: str | None, ctx: Context) -> bool:
    return any(_under(path, b) for b in (
        f"{ctx.root}/repos", f"{ctx.home}/workspace/myFinance", f"{ctx.home}/workspace/myFitness"))


def _frozen_raw(raw: str | None, cwd: str | None, env: dict[str, str], ctx: Context) -> bool:
    """변수가 든 경로도 본다 — for 변수는 그 값들로, 모르는 변수는 자리표시자로 펼쳐 하나라도 동결 경로면 참.
    (`git -C repos/$r` · `for d in repos/*; do git -C $d …`)"""
    if raw is None:
        return False
    candidates = [raw]
    for m in set(ANY_VAR.finditer(raw)):
        values = env.get(LOOP_PREFIX + (m.group(1) or m.group(2)))
        if values is not None:
            candidates = [c.replace(m.group(0), v) for c in candidates for v in values.split("\0")]
    return any(_frozen(_resolve(ANY_VAR.sub(_placeholder(ctx, cwd), c), cwd, ctx), ctx) for c in candidates)


def _placeholder(ctx: Context, cwd: str | None):
    known = {"HOME": ctx.home, "CLAUDE_PROJECT_DIR": ctx.root, "PWD": cwd}
    return lambda m: known.get(m.group(1) or m.group(2)) or "_var_"


# ---------- 규칙 ----------

def _check_gh_api(args: list[str]) -> list[Violation]:
    method, has_fields, file_input, endpoint, i = None, False, False, None, 0
    while i < len(args):
        t = args[i]
        flag, eq, attached = t.partition("=")
        if t.startswith("-X") and len(t) > 2:
            method = t[2:].lstrip("=")
        elif flag == "--method" and eq:
            method = attached
        elif flag in GH_API_FIELD_FLAGS and eq:
            has_fields, file_input = True, file_input or flag == "--input" or "=@" in attached or attached.startswith("@")
        elif t in GH_API_VALUE_FLAGS:
            value = args[i + 1] if i + 1 < len(args) else ""
            if t in ("-X", "--method"):
                method = value
            if t in GH_API_FIELD_FLAGS:
                has_fields = True
                file_input = file_input or t == "--input" or "=@" in value
            i += 1
        elif re.match(r"^-[fF]\S", t):  # -ftitle=x
            has_fields, file_input = True, file_input or "=@" in t
        elif not t.startswith("-") and endpoint is None:
            endpoint = t
        i += 1

    if endpoint == "graphql":
        if any(MUTATION.search(a) for a in args):
            return [Violation("I-1", "gh api graphql mutation — 경로 없이 node id 로 서비스 저장소에 쓸 수 있다")]
        if file_input:
            return [Violation("I-1", "gh api graphql 파일 입력 — mutation 여부를 볼 수 없다. 쿼리를 인라인으로 쓴다")]
        return []
    if endpoint and SERVICE_API.fullmatch(endpoint):
        effective = (method or ("POST" if has_fields else "GET")).upper()
        if effective != "GET":
            return [Violation("I-1", f"gh api {effective} {endpoint} — 서비스 저장소 쓰기 (필드 플래그는 기본 POST)")]
    return []


def _check_gh(args: list[str], env: dict[str, str]) -> list[Violation]:
    refs, rest, i = [env.get("GH_REPO", "")], [], 0
    while i < len(args):
        t = args[i]
        if t in ("-R", "--repo") and i + 1 < len(args):
            refs.append(args[i + 1])
            i += 1
        elif t.startswith("--repo="):
            refs.append(t.split("=", 1)[1])
        elif t.startswith("-R") and len(t) > 2:
            refs.append(t[2:])
        else:
            rest.append(t)
        i += 1
    if not rest:
        return []
    group, verb = rest[0], (rest[1] if len(rest) > 1 else "")
    if group == "api":
        return _check_gh_api(rest[1:])
    # 위치 인자(URL · owner/repo) 도 본다 — 토큰 전체가 서비스 참조일 때만 걸린다
    if any(SERVICE_REF.fullmatch(r) for r in refs + rest) and verb not in GH_READ_VERBS:
        return [Violation("I-1", f"gh {group} {verb} — 서비스 저장소에 대한 쓰기 동사 (허용: {', '.join(sorted(GH_READ_VERBS))})")]
    return []


def _check_filter_repo(cwd: str | None, ctx: Context) -> list[Violation]:
    if cwd is None or _under(cwd, ctx.root):
        where = "cwd 를 알 수 없다" if cwd is None else f"cwd 가 pleiades 안이다 ({cwd})"
        return [Violation("I-21", f"filter-repo — {where}. pleiades 밖 스크래치에서 리터럴 경로로 cd 하거나 tools/import 스크립트로 실행한다")]
    return []


def _check_git(args: list[str], cwd: str | None, env: dict[str, str], ctx: Context) -> list[Violation]:
    out, d, i, frozen = [], cwd, 0, False
    frozen = any(_frozen_raw(env[k], cwd, env, ctx) for k in ("GIT_DIR", "GIT_WORK_TREE") if k in env)
    while i < len(args) and args[i].startswith("-"):
        t = args[i]
        if t == "-C" and i + 1 < len(args):
            frozen = frozen or _frozen_raw(args[i + 1], d, env, ctx)
            d = _resolve(args[i + 1], d, ctx)
            i += 1
        elif t in ("--git-dir", "--work-tree", "-c") and i + 1 < len(args):
            if t != "-c":
                frozen = frozen or _frozen_raw(args[i + 1], cwd, env, ctx)
            i += 1
        elif t.startswith(("--git-dir=", "--work-tree=")):
            frozen = frozen or _frozen_raw(t.split("=", 1)[1], cwd, env, ctx)
        i += 1
    sub, rest = (args[i] if i < len(args) else ""), args[i + 1:]

    if frozen or _frozen(d, ctx):
        out.append(Violation("I-11", "동결된 repos/* · 원본 ~/workspace/myF* 에서 git 명령 — 읽기도 index 를 갱신할 수 있다"))
    if sub == "push" and any(SERVICE_REF.fullmatch(t) for t in rest):
        out.append(Violation("I-1", "git push 대상이 서비스 저장소다"))
    if sub == "remote" and rest[:1] and rest[0] in ("add", "set-url") and any(SERVICE_REF.fullmatch(t) for t in rest):
        out.append(Violation("I-1", "서비스 저장소를 리모트로 등록하지 않는다 — https URL 로 직접 읽는다"))
    if sub == "filter-repo":
        out.extend(_check_filter_repo(d, ctx))
    return out


def _is_deploy(path: str, cwd: str | None, ctx: Context) -> bool:
    resolved = _resolve(path, cwd, ctx)
    target = resolved if resolved is not None else path
    return bool(DEPLOY_PATH.search(target)) or bool(ECOSYSTEM.search(target))


def _check_shell(args: list[str], cwd: str | None, env: dict[str, str], ctx: Context) -> list[Violation]:
    command_mode, i = False, 0
    while i < len(args):
        a = args[i]
        if a in SHELL_VALUE_FLAGS:
            i += 2
            continue
        if re.fullmatch(r"[-+][A-Za-z]+", a) or a.startswith("--"):
            command_mode = command_mode or (a.startswith("-") and not a.startswith("--") and "c" in a)
            i += 1
            continue
        if command_mode:
            return _check_text(a, cwd, dict(env), ctx)
        if _is_deploy(a, cwd, ctx):
            return [Violation("I-19", f"서비스 배포 스크립트 실행 ({a}) — cwd 기준이라 pleiades 작업트리를 파괴한다")]
        return []
    return []


def _check_segment(seg: list[str], cwd: str | None, env: dict[str, str], ctx: Context) -> tuple[list[Violation], str | None]:
    """(위반, 다음 조각의 cwd). env 는 `export` 로 조각 사이에 이어진다."""
    seg, local, chdir = _unwrap(seg)
    if not seg:
        env.update(local)  # `FOO=1` 단독 = 셸 변수
        return [], cwd
    senv = {**env, **local}
    prog, args = seg[0], seg[1:]
    name = os.path.basename(prog)
    wd = cwd  # 이 명령이 도는 디렉터리 — `env -C` 는 셸의 cwd 를 바꾸지 않는다
    if chdir is not None:
        wd = f"{ctx.root}/repos/_var_" if _frozen_raw(chdir, cwd, senv, ctx) else _resolve(chdir, cwd, ctx)

    if prog == "for" and len(args) >= 2 and args[1] == "in":
        env[LOOP_PREFIX + args[0]] = "\0".join(args[2:])
        return [], cwd
    if prog in ("cd", "pushd"):
        if args[:1] == ["-"]:
            return [], None
        target = args[0] if args else "~"
        new = _resolve(target, cwd, ctx)
        if new is None and _frozen_raw(target, cwd, env, ctx):
            new = f"{ctx.root}/repos/_var_"  # 동결 경로로 들어간 것만은 안다
        return [], new
    if prog == "popd":
        return [], None
    if prog == "export":
        for a in args:
            m = ASSIGNMENT.match(a)
            if m:
                env[m.group(1)] = m.group(2)
        return [], cwd
    if name in REMOTE_SHELLS:
        return [Violation("I-3", f"{name} — 서버 접근 금지")], cwd
    if name.startswith("pm2"):
        if any(ECOSYSTEM.search(a) for a in args):
            return [Violation("I-19", "pm2 로 ecosystem.config 실행 — 서비스 배포 설정")], cwd
        return [Violation("I-3", "pm2 — 서버 프로세스 관리자는 쓰지 않는다 (로컬 기동은 앱 엔트리 · 006 L-9)")], cwd
    if name in SHELLS:
        if "<" in args and args.index("<") + 1 < len(args) and _is_deploy(args[args.index("<") + 1], wd, ctx):
            return [Violation("I-19", "서비스 배포 스크립트를 셸 표준입력으로 실행")], cwd
        return _check_shell(args, wd, senv, ctx), cwd
    if prog in SOURCERS:
        script = next((a for a in args if not a.startswith("-")), None)
        if script and _is_deploy(script, wd, ctx):
            return [Violation("I-19", f"서비스 배포 스크립트 실행 ({script})")], cwd
        return [], cwd
    if name == "node" and any(ECOSYSTEM.search(a) for a in args):
        return [Violation("I-19", "ecosystem.config 실행")], cwd
    if "/" in prog and _is_deploy(prog, wd, ctx):
        return [Violation("I-19", f"서비스 배포 스크립트 실행 ({prog})")], cwd
    if name == "git-filter-repo":
        return _check_filter_repo(wd, ctx), cwd
    if name == "git":
        return _check_git(args, wd, senv, ctx), cwd
    if name == "gh":
        return _check_gh(args, senv), cwd
    return [], cwd


def _check_text(text: str, cwd: str | None, env: dict[str, str], ctx: Context) -> list[Violation]:
    """cwd 는 값 하나가 아니라 **가능한 후보들**로 추적한다 — 후보 중 하나라도 위반이면 위반이다.
    `&&` 는 cd 성공 뒤만 · `;` 는 cd 실패도 이어지므로 전·후 둘 다 · `||` `|` `&` 는 전만(실패 분기 · 서브셸) ·
    `( … )` 는 닫힐 때 복원한다. 회귀: PR #106 Codex P1 (`cd /missing || git filter-repo`)."""
    inners, outer = _substitutions(_prepare(text))
    out = []
    for inner in inners:
        out.extend(_check_text(inner, cwd, dict(env), ctx))
    cur: list[str | None] = [cwd]
    before, after, stack = cur, cur, []
    for kind, item in _stream(_tokens(outer)):
        if kind == "seg":
            news = []
            for c in cur:
                found, new = _check_segment(item, c, env, ctx)
                out.extend(found)
                news.append(new)
            before, after = cur, list(dict.fromkeys(news))
            cur = after
        elif item == "&&":
            cur = after
        elif item in (";", ";;"):
            cur = list(dict.fromkeys(before + after))
        elif item in ("||", "|", "|&", "&"):
            cur = before
        elif item == "(":
            stack.append(cur)
        elif item == ")":
            cur = stack.pop() if stack else cur
            before = after = cur
    return out


def check(command: str, cwd: str | None, root: str, home: str) -> list[Violation]:
    """명령 문자열의 위반 목록(중복 제거). 빈 목록 = 통과."""
    found = _check_text(command, cwd, {}, Context(root=root.rstrip("/"), home=home.rstrip("/")))
    return list(dict.fromkeys(found))


# ---------- 진입점 ----------

def _fail(msg: str) -> int:
    print(f"isolation_guard: {msg} — 검사하지 않았다. {RULE_FILE} 를 직접 지킨다", file=sys.stderr)
    return 1


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, ValueError) as e:
        return _fail(f"입력이 JSON 이 아니다 ({e})")
    if not isinstance(payload, dict):
        return _fail("입력이 객체가 아니다")
    if payload.get("tool_name") != "Bash":
        return 0
    tool_input = payload.get("tool_input")
    command = tool_input.get("command") if isinstance(tool_input, dict) else None
    if not isinstance(command, str):
        return _fail("tool_input.command 가 문자열이 아니다")
    cwd = payload.get("cwd") if isinstance(payload.get("cwd"), str) else os.getcwd()
    root = os.environ.get("CLAUDE_PROJECT_DIR") or str(Path(__file__).resolve().parents[2])
    home = os.environ.get("HOME") or str(Path.home())
    violations = check(command, cwd, root, home)
    if not violations:
        return 0
    lines = [f"isolation_guard: 차단 — 서비스 격리 불변식 위반 ({RULE_FILE})"]
    lines += [f"  · {v.rule}: {v.reason}" for v in violations]
    lines.append("  우회하지 말고 명령을 다시 쓴다. 오탐이면 사용자에게 보고한다.")
    print("\n".join(lines), file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
