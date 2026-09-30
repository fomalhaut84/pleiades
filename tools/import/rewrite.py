"""가져온 커밋 메시지의 자동 링크 형식을 비링크 형식으로 바꾼다 (#104 · 006 §4-2 치환 규칙 · U97-5 ② · U97-10 Q62).

이 파일은 filter-repo callback(`msg_<app>.callback`)이 import 한다 — **바꾸면 재작성 SHA 가 전부 바뀐다.**
M-1 뒤에 바꾸면 가드 B 가 실패하고 전 이력 재병합(중간) + 이력 중복(편도)이 된다(006 §4-2). 바꿀 때는
`VERSIONS` 의 callback 해시도 함께 바꿔야 테스트가 통과한다(test_guards.VersionsPin).

치환 순서가 의미를 가진다 — URL → 호스트 없는 URL → 저장소 한정 → GH-N → 한정 없는 #N → `X/Y#N` 끊기 → @멘션.
출력은 gate.py 를 항상 통과한다(닫힘 — test_property_fuzz_closed_and_idempotent).
결과는 소유자를 포함하지 않는다. 같은 입력에 두 번 적용해도 결과가 같다(멱등).
"""

from __future__ import annotations

import re

APPS = {"fin": "fin", "fit": "fit"}
SHORT = {"myfinance": "fin", "myfitness": "fit"}  # 서비스 저장소 → 비링크 접두
ZERO_WIDTH = "\u200b"  # ZERO WIDTH SPACE — @멘션 무해화 (U97-10 Q62)

# 모든 정규식은 ASCII 기준이다 — `#494에서` 처럼 한글이 붙어도 경계로 본다(GitHub 렌더의 경계 판정 · 회귀: #104 사전 리뷰 major 2).
# 부수 효과로 Python 의 유니코드 DB 버전에 결정성이 기대지 않는다.
_A = re.ASCII | re.IGNORECASE
_SEG = r"[A-Za-z0-9_.-]+"
# 앞 경로까지 먹는다 — `a/b/c#12` 가 `a/c#12` 로 남지 않게 (major 3). 앞 lookbehind 둘은 경로 한가운데
# (`경로문자` 또는 `경로문자/` 뒤)에서 다시 시작하지 않게 한다 — 없으면 공백 없는 긴 토큰에서 2차 시간이 든다
# (32k 자 ≈ 20 s · 2회차 info). `://` · ` /` 뒤는 시작점이다(퍼징이 잡은 `://github.com/issues/pull/23`).
_PATH = rf"(?<![A-Za-z0-9_.-])(?<![A-Za-z0-9_.-]/)(?:{_SEG}/)*({_SEG})/({_SEG})"
URL = re.compile(rf"(?:https?://)?(?:www\.)?github\.com/({_SEG})/({_SEG})/(?:issues|pull|discussions)/(\d+)", _A)
HOSTLESS_URL = re.compile(rf"{_PATH}/(?:issues|pull)/(\d+)", _A)
QUALIFIED = re.compile(rf"{_PATH}#(\d+)", _A)
GH_N = re.compile(r"(?<![A-Za-z0-9_])gh-(\d+)", _A)
BARE_N = re.compile(r"(?<![A-Za-z0-9_])#(\d+)", _A)  # 뒤 경계를 요구하지 않는다 — `#12abc` 도 바꾼다(과치환은 무해)
SLASH_BEFORE_REF = re.compile(r"(?<=[A-Za-z0-9_.-])/(?=[A-Za-z0-9_.-]+#\d)", _A)  # `abc/fin#5` → `abc/ fin#5` (렌더가 owner/repo 로 읽는다)
MENTION = re.compile(r"(?<![A-Za-z0-9_.@/+-])@(?=[A-Za-z0-9])", _A)


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
    out = BARE_N.sub(lambda m: f"{prefix}#{m.group(1)}", out)
    out = SLASH_BEFORE_REF.sub("/ ", out)
    return MENTION.sub("@" + ZERO_WIDTH, out)


def rewrite_bytes(message: bytes, app: str) -> bytes:
    """filter-repo 는 bytes 를 준다 — 깨진 UTF-8 은 그대로 보존한다(surrogateescape)."""
    return rewrite(message.decode("utf-8", "surrogateescape"), app).encode("utf-8", "surrogateescape")
