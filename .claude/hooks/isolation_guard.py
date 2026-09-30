#!/usr/bin/env python3
"""isolation_guard — Bash 명령이 서비스 격리 불변식을 어기면 막는 PreToolUse 훅 (#102).

정본은 .claude/rules/isolation.md(006 §5 I-1~I-21) 다. 이 훅은 **실수 방지**이지 룰의 대체가 아니다 —
텍스트 매칭이라 변수 치환(`$R`) · `eval` · 스크립트 파일 안의 명령은 보지 못한다. 막히면 우회하지 말고 명령을 다시 쓴다.

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
    r"(?:(?:https?://)?(?:www\.)?github\.com/|git@github\.com:|ssh://git@github\.com/)?"
    + _SVC + r"(?:\.git)?(?:/.*)?",
    re.IGNORECASE,
)
SERVICE_API = re.compile(r"/?repos/" + _SVC + r"(?:[/?].*)?", re.IGNORECASE)
MUTATION = re.compile(r"\bmutation\b", re.IGNORECASE)
DEPLOY_PATH = re.compile(r"(?:^|/)apps/[^/]+/deploy/")
ECOSYSTEM = re.compile(r"ecosystem\.config\.[cm]?js$")
ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")

SEPARATORS = {";", ";;", "&", "&&", "|", "||", "|&", "(", ")", "$"}
WRAPPERS = {"sudo", "command", "exec", "time", "nohup", "nice", "builtin"}
SHELLS = {"bash", "sh", "zsh", "dash"}
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


# ---------- 토큰화 ----------

def _strip_heredocs(command: str) -> str:
    """heredoc 본문은 명령이 아니라 데이터다 — 본문 줄을 지운다."""
    out, lines, i = [], command.split("\n"), 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        m = HEREDOC.search(line) if "<<<" not in line else None
        i += 1
        if m:
            delim = m.group(2)
            while i < len(lines) and lines[i].lstrip("\t").rstrip() != delim:
                i += 1
            i += 1  # 종료 구분자 줄
    return "\n".join(out)


def _tokens(command: str) -> list[str]:
    text = _strip_heredocs(command).replace("\n", " ; ").replace("`", " ; ")
    lexer = shlex.shlex(text, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    try:
        return list(lexer)
    except ValueError:  # 따옴표 불균형 — 거칠게라도 본다
        return re.findall(r"[^\s;&|()]+|[;&|()]+", text)


def _segments(tokens: list[str]) -> list[list[str]]:
    segs, cur = [], []
    for t in tokens:
        if t in SEPARATORS or (set(t) <= set(";&|()") and t):
            if cur:
                segs.append(cur)
            cur = []
        else:
            cur.append(t)
    if cur:
        segs.append(cur)
    return segs


def _unwrap(seg: list[str]) -> list[str]:
    """`FOO=1 env -u X sudo cmd …` → `cmd …`"""
    i = 0
    while i < len(seg):
        t = seg[i]
        if ASSIGNMENT.match(t) or t in WRAPPERS:
            i += 1
        elif t == "env":
            i += 1
            while i < len(seg) and (seg[i].startswith("-") or ASSIGNMENT.match(seg[i])):
                i += 2 if seg[i] in ("-u", "--unset", "-C", "--chdir") else 1
        else:
            break
    return seg[i:]


# ---------- 경로 ----------

def _resolve(path: str | None, cwd: str | None, ctx: Context) -> str | None:
    """알 수 없으면 None — 변수·치환이 들어 있거나 상대 경로인데 cwd 를 모를 때."""
    if path is None or "$" in path:
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


# ---------- 규칙 ----------

def _check_gh_api(args: list[str]) -> list[Violation]:
    method, has_fields, endpoint, i = None, False, None, 0
    while i < len(args):
        t = args[i]
        flag, _, attached = t.partition("=")
        if t.startswith("-X") and len(t) > 2:
            method = t[2:]
        elif flag in ("--method",) and attached:
            method = attached
        elif flag in GH_API_FIELD_FLAGS and attached:
            has_fields = True
        elif t in GH_API_VALUE_FLAGS:
            if t in ("-X", "--method") and i + 1 < len(args):
                method = args[i + 1]
            has_fields = has_fields or t in GH_API_FIELD_FLAGS
            i += 1
        elif re.match(r"^-[fF]\S", t):  # -ftitle=x
            has_fields = True
        elif not t.startswith("-") and endpoint is None:
            endpoint = t
        i += 1

    if endpoint == "graphql":
        if any(MUTATION.search(a) for a in args):
            return [Violation("I-1", "gh api graphql mutation — 경로 없이 node id 로 서비스 저장소에 쓸 수 있다")]
        return []
    if endpoint and SERVICE_API.fullmatch(endpoint):
        effective = (method or ("POST" if has_fields else "GET")).upper()
        if effective != "GET":
            return [Violation("I-1", f"gh api {effective} {endpoint} — 서비스 저장소 쓰기 (필드 플래그는 기본 POST)")]
    return []


def _check_gh(seg: list[str]) -> list[Violation]:
    if len(seg) < 2:
        return []
    if seg[1] == "api":
        return _check_gh_api(seg[2:])
    verb = seg[2] if len(seg) > 2 else ""
    refs = []
    for i, t in enumerate(seg[1:], start=1):
        if t in ("-R", "--repo") and i + 1 < len(seg):
            refs.append(seg[i + 1])
        elif t.startswith("--repo="):
            refs.append(t.split("=", 1)[1])
        elif t.startswith("-R") and len(t) > 2:
            refs.append(t[2:])
        else:
            refs.append(t)  # 위치 인자(URL · owner/repo) — 토큰 전체가 서비스 참조일 때만 걸린다
    if any(SERVICE_REF.fullmatch(r) for r in refs) and verb not in GH_READ_VERBS:
        return [Violation("I-1", f"gh {seg[1]} {verb} — 서비스 저장소에 대한 쓰기 동사 (허용: {', '.join(sorted(GH_READ_VERBS))})")]
    return []


def _check_filter_repo(cwd: str | None, ctx: Context) -> list[Violation]:
    if cwd is None or _under(cwd, ctx.root):
        where = "cwd 를 알 수 없다" if cwd is None else f"cwd 가 pleiades 안이다 ({cwd})"
        return [Violation("I-21", f"filter-repo — {where}. pleiades 밖 스크래치에서 리터럴 경로로 cd 하거나 tools/import 스크립트로 실행한다")]
    return []


def _check_git(seg: list[str], cwd: str | None, ctx: Context) -> list[Violation]:
    out, d, dirs, i = [], cwd, [], 1
    while i < len(seg) and seg[i].startswith("-"):
        t = seg[i]
        if t == "-C" and i + 1 < len(seg):
            d = _resolve(seg[i + 1], d, ctx)
            i += 1
        elif t in ("--git-dir", "--work-tree", "-c") and i + 1 < len(seg):
            if t != "-c":
                dirs.append(_resolve(seg[i + 1], cwd, ctx))
            i += 1
        elif t.startswith(("--git-dir=", "--work-tree=")):
            dirs.append(_resolve(t.split("=", 1)[1], cwd, ctx))
        i += 1
    sub = seg[i] if i < len(seg) else ""
    rest = seg[i + 1:]

    if any(_frozen(p, ctx) for p in [d, *dirs]):
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


def _check_segment(seg: list[str], cwd: str | None, ctx: Context) -> tuple[list[Violation], str | None]:
    """(위반, 다음 조각의 cwd)"""
    seg = _unwrap(seg)
    if not seg:
        return [], cwd
    prog, args = seg[0], seg[1:]
    name = os.path.basename(prog)

    if prog == "cd":
        return [], _resolve(args[0] if args else "~", cwd, ctx) if args[:1] != ["-"] else None
    if name in REMOTE_SHELLS:
        return [Violation("I-3", f"{name} — 서버 접근 금지")], cwd
    if name == "pm2":
        if any(ECOSYSTEM.search(a) for a in args):
            return [Violation("I-19", "pm2 로 ecosystem.config 실행 — 서비스 배포 설정")], cwd
        return [Violation("I-3", "pm2 — 서버 프로세스 관리자는 쓰지 않는다 (로컬 기동은 앱 엔트리 · 006 L-9)")], cwd
    if name in SHELLS and "-c" in args:
        k = args.index("-c")
        return (check_tokens(_tokens(args[k + 1]), cwd, ctx) if k + 1 < len(args) else []), cwd
    if name in SHELLS or prog in SOURCERS:
        script = next((a for a in args if not a.startswith("-")), None)
        if script and _is_deploy(script, cwd, ctx):
            return [Violation("I-19", f"서비스 배포 스크립트 실행 ({script}) — cwd 기준이라 pleiades 작업트리를 파괴한다")], cwd
        return [], cwd
    if name == "node" and any(ECOSYSTEM.search(a) for a in args):
        return [Violation("I-19", "ecosystem.config 실행")], cwd
    if "/" in prog and _is_deploy(prog, cwd, ctx):
        return [Violation("I-19", f"서비스 배포 스크립트 실행 ({prog})")], cwd
    if name == "git-filter-repo":
        return _check_filter_repo(cwd, ctx), cwd
    if name == "git":
        return _check_git(seg, cwd, ctx), cwd
    if name == "gh":
        return _check_gh(seg), cwd
    return [], cwd


def check_tokens(tokens: list[str], cwd: str | None, ctx: Context) -> list[Violation]:
    out = []
    for seg in _segments(tokens):
        found, cwd = _check_segment(seg, cwd, ctx)
        out.extend(found)
    return out


def check(command: str, cwd: str | None, root: str, home: str) -> list[Violation]:
    """명령 문자열의 위반 목록. 빈 목록 = 통과."""
    return check_tokens(_tokens(command), cwd, Context(root=root.rstrip("/"), home=home.rstrip("/")))


# ---------- 진입점 ----------

def main() -> int:
    try:
        payload = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, ValueError) as e:
        print(f"isolation_guard: 입력을 읽지 못해 검사하지 않았다 ({e}) — {RULE_FILE} 를 직접 지킨다", file=sys.stderr)
        return 1
    if payload.get("tool_name") != "Bash":
        return 0
    command = (payload.get("tool_input") or {}).get("command") or ""
    root = os.environ.get("CLAUDE_PROJECT_DIR") or str(Path(__file__).resolve().parents[2])
    home = os.environ.get("HOME") or str(Path.home())
    violations = check(command, payload.get("cwd") or os.getcwd(), root, home)
    if not violations:
        return 0
    lines = [f"isolation_guard: 차단 — 서비스 격리 불변식 위반 ({RULE_FILE})"]
    lines += [f"  · {v.rule}: {v.reason}" for v in violations]
    lines.append("  우회하지 말고 명령을 다시 쓴다. 오탐이면 사용자에게 보고한다.")
    print("\n".join(lines), file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
