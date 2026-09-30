"""가져온 커밋 메시지의 자동 링크 형식을 비링크 형식으로 바꾼다 (#104 · 006 §4-2 치환 규칙 · U97-5 ② · U97-10 Q62).

이 파일은 filter-repo callback(`msg_<app>.callback`)이 import 한다 — **바꾸면 재작성 SHA 가 전부 바뀐다.**
M-1 뒤에 바꾸면 가드 B 가 실패하고 전 이력 재병합(중간) + 이력 중복(편도)이 된다(006 §4-2). 바꿀 때는
`VERSIONS` 의 callback 해시도 함께 바꿔야 테스트가 통과한다(test_guards.VersionsPin).

치환 순서가 의미를 가진다 — URL → 호스트 없는 URL → 저장소 한정 → GH-N → 한정 없는 #N → @멘션.
결과는 소유자를 포함하지 않는다. 같은 입력에 두 번 적용해도 결과가 같다(멱등).
"""

from __future__ import annotations

import re

APPS = {"fin": "fin", "fit": "fit"}
SHORT = {"myfinance": "fin", "myfitness": "fit"}  # 서비스 저장소 → 비링크 접두
ZERO_WIDTH = "​"

_OWNER_REPO = r"([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)"
URL = re.compile(r"(?:https?://)?(?:www\.)?github\.com/" + _OWNER_REPO + r"/(?:issues|pull|discussions)/(\d+)",
                 re.IGNORECASE)
HOSTLESS_URL = re.compile(r"(?<![\w.-])" + _OWNER_REPO + r"/(?:issues|pull)/(\d+)", re.IGNORECASE)
QUALIFIED = re.compile(r"(?<![\w.-])" + _OWNER_REPO + r"#(\d+)", re.IGNORECASE)
GH_N = re.compile(r"(?<!\w)gh-(\d+)", re.IGNORECASE)
SLASH_N = re.compile(r"/#(\d+)\b")  # `abc/#383` · `fin/#12` — 렌더가 링크한다(006 ⑲) → 슬래시 뒤 공백
BARE_N = re.compile(r"(?<![A-Za-z0-9_])#(\d+)\b")
MENTION = re.compile(r"(?<![\w.@/+-])@(?=[A-Za-z0-9])")


def _short(repo: str) -> str:
    return SHORT.get(repo.lower(), repo)


def rewrite(message: str, app: str) -> str:
    """한 커밋 메시지를 비링크 형식으로. app ∈ {fin, fit} 이 한정 없는 참조의 접두다."""
    if app not in APPS:
        raise ValueError(f"알 수 없는 앱: {app!r} (허용: {', '.join(APPS)})")
    prefix = APPS[app]
    out = URL.sub(lambda m: f"{_short(m.group(2))}#{m.group(3)}", message)
    out = HOSTLESS_URL.sub(lambda m: f"{_short(m.group(2))}#{m.group(3)}", out)
    out = QUALIFIED.sub(lambda m: f"{_short(m.group(2))}#{m.group(3)}", out)
    out = GH_N.sub(lambda m: f"{prefix}#{m.group(1)}", out)
    out = SLASH_N.sub(lambda m: f"/ {prefix}#{m.group(1)}", out)
    out = BARE_N.sub(lambda m: f"{prefix}#{m.group(1)}", out)
    return MENTION.sub("@" + ZERO_WIDTH, out)


def rewrite_bytes(message: bytes, app: str) -> bytes:
    """filter-repo 는 bytes 를 준다 — 깨진 UTF-8 은 그대로 보존한다(surrogateescape)."""
    return rewrite(message.decode("utf-8", "surrogateescape"), app).encode("utf-8", "surrogateescape")
