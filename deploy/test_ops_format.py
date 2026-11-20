"""수집기 출력 형식 ↔ 통합 층 ops 리더 허용 목록 (#880 · 015 V-5 · §3-1 원칙 4 · AU2:36).

실행: python3 -m unittest deploy.test_ops_format   (필수 verify job 안 · 도메인 계약 시험과 같은 예외)
리더(apps/advisor/src/local/ops.ts)는 허용 목록(apps/advisor/src/local/ops-shape.json) 밖의 필드 · 깨진 줄을 보면 도구 결과를 실패로 돌린다.
그래서 수집기(deploy/ops/collect.cjs)가 쓰는 키를 바꾸는 PR 은 이 시험에 막혀야 한다 — 허용 목록과 고정값(src/local/__fixtures__/ops/)을 같이 고친다.
수집기는 의존 없이 돈다: 빈 HOME · pm2 데몬 없음 · .env 없음 → 수집기 자기 경고가 관측으로 기록된다(외부로 나가는 것 0 · dry-run).
"""

import json
import math
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SCRIPT = HERE / "ops" / "collect.cjs"
SHAPE = ROOT / "apps" / "advisor" / "src" / "local" / "ops-shape.json"
FIXTURE = ROOT / "apps" / "advisor" / "src" / "local" / "__fixtures__" / "ops"
NODE = shutil.which("node") or "/usr/bin/node"
RUNS = ("2026-11-10T08:00:00+09:00", "2026-11-10T08:05:00+09:00", "2026-11-10T09:10:00+09:00")


def is_type(v, t):
    # fields.ts isField 와 같다 — bool 은 number 가 아니다(파이썬 bool ⊂ int)
    if t == "number":
        return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
    if t == "boolean":
        return isinstance(v, bool)
    return isinstance(v, str)


def tally(records, shape):
    """fields.ts pick 과 같은 판정 — (unknown, missing, broken)"""
    unknown = missing = broken = 0
    req, opt, ign = shape["required"], shape["optional"], set(shape["ignored"])
    for r in records:
        if not isinstance(r, dict):
            broken += 1
            continue
        if any(not is_type(r.get(k), t) for k, t in req.items()):
            missing += 1
            continue
        for k, t in opt.items():
            if r.get(k) is not None and not is_type(r[k], t):
                missing += 1
        unknown += sum(1 for k in r if k not in req and k not in opt and k not in ign)
    return unknown, missing, broken


def lines(text):
    out = []
    for l in text.splitlines():
        if not l.strip():
            continue
        try:
            out.append(json.loads(l))
        except json.JSONDecodeError:
            out.append(None)
    return out


def sandbox(tmp: Path) -> Path:
    """실제 collect.cjs 를 의존 없이 RUNS 회 돌린다 — hermes 를 활성으로(운영처럼 · state.hrm 이 생긴다 · #880 9-1 M1). ops 상태 디렉터리를 돌려준다.
    고정값(src/local/__fixtures__/ops/)도 이것으로 만든다: python3 -c "import deploy.test_ops_format as t; t.regenerate_fixture()" """
    home, pm2 = tmp / "h", tmp / "p"
    private = home / "pleiades-private"
    hrm_state = home / "pleiades-hermes-data" / "state" / "state.json"
    for d in (pm2, private, hrm_state.parent):
        d.mkdir(parents=True, exist_ok=True)
    (private / "inplace-hrm-last-ok").write_text("v0.0.0\n")   # activeApps — 곁가지 hrm 감시를 켠다
    for i, now in enumerate(RUNS):
        # hermes 상태 파일(수치만) — 회마다 갱신 · 둘째 회부터 dead 가 늘어 로그형 이벤트도 생긴다
        hrm_state.write_text(json.dumps({"updatedAt": now, "webhook": True, "queued": 0, "deadToday": i, "blockedToday": 0, "linkDroppedToday": 0, "expiringSoon": []}))
        env = {
            "PATH": "/usr/bin:/bin", "HOME": str(home), "PM2_HOME": str(pm2), "PLEIADES_TEST": "1", "OPS_NOW": now,
            "OPS_DISK_HOME": str(home), "OPS_DISK_BACKUP": str(tmp),
            "OPS_CONFIG": json.dumps({"summaryAt": "09:05", "quietWarnings": False}),
        }
        r = subprocess.run([NODE, str(SCRIPT), "--dry-run", "--pm2-bin=/nonexistent"], capture_output=True, text=True, env=env, timeout=60)
        if r.returncode != 0:
            raise AssertionError(r.stdout + r.stderr)
    return private / "ops"


def regenerate_fixture() -> None:
    tmp = Path(tempfile.mkdtemp(prefix="opsf", dir="/tmp"))
    try:
        ops = sandbox(tmp)
        for name in ("state.json", "events.jsonl"):
            shutil.copyfile(ops / name, FIXTURE / name)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def literal_keys(text: str) -> set:
    """객체 리터럴 한 덩어리의 키 — `k:` 와 단축 `{ k }`"""
    return set(re.findall(r"[{,]\s*([a-zA-Z_]+)\s*:", text)) | set(re.findall(r"[{,]\s*([a-zA-Z_]+)\s*(?=[,}])", text))


class OpsFormat(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.shape = json.loads(SHAPE.read_text(encoding="utf-8"))
        cls.tmp = Path(tempfile.mkdtemp(prefix="opsf", dir="/tmp"))
        ops = sandbox(cls.tmp)
        cls.events = lines((ops / "events.jsonl").read_text())
        cls.state = json.loads((ops / "state.json").read_text())

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def check_state(self, state):
        self.assertEqual(tally([state], self.shape["state"]), (0, 0, 0))
        self.assertIsInstance(state.get("fps"), dict)
        self.assertEqual(tally(list(state["fps"].values()), self.shape["fp"]), (0, 0, 0))

    def test_collector_output_passes_allow_list(self):
        self.assertGreater(len(self.events), 0, "샌드박스가 이벤트를 만들지 않았다 — 이 시험이 아무것도 증명하지 않는다")
        self.assertGreater(len(self.state["fps"]), 0)
        self.assertEqual(tally(self.events, self.shape["event"]), (0, 0, 0))
        self.check_state(self.state)

    def test_fixture_passes_allow_list(self):
        self.assertEqual(tally(lines((FIXTURE / "events.jsonl").read_text()), self.shape["event"]), (0, 0, 0))
        self.check_state(json.loads((FIXTURE / "state.json").read_text()))

    def test_fixture_keys_match_collector(self):
        # 고정값이 수집기 실제 출력과 같은 모양이어야 리더 시험(apps-adv)이 진짜 형식을 본다 — 수집기가 키를 바꾸면 고정값도 다시 만든다
        fx_state = json.loads((FIXTURE / "state.json").read_text())
        self.assertEqual(set(fx_state), set(self.state))
        keys = lambda rows: set().union(*(set(r) for r in rows))
        self.assertEqual(keys(fx_state["fps"].values()), keys(self.state["fps"].values()))
        self.assertEqual(keys(lines((FIXTURE / "events.jsonl").read_text())), keys(self.events))

    def test_event_writers_only_use_allowed_keys(self):
        # 샌드박스가 거치지 않는 분기(quiet · blocked)까지 — events 를 쓰는 객체 리터럴의 키를 소스에서 읽는다
        src = SCRIPT.read_text(encoding="utf-8")
        writers = re.findall(r"JSON\.stringify\(\{ at: ctx\.now,[^\n]*\)\)", src)
        self.assertEqual(len(writers), 2, "events 를 쓰는 자리가 바뀌었다 — 이 시험의 추출을 다시 본다")
        allowed = set(self.shape["event"]["required"]) | set(self.shape["event"]["optional"])
        for w in writers:
            keys = literal_keys(w)
            self.assertTrue(keys, w)
            self.assertLessEqual(keys, allowed, sorted(keys - allowed))

    def test_sandbox_takes_hermes_branch(self):
        # 운영 수집기는 hermes 를 감시한다 — 그 분기가 쓰는 state.hrm 이 출력에 있어야 이 시험이 운영 모양을 본다(#880 9-1 M1)
        self.assertIn("hrm", self.state)
        self.assertTrue(any(e.get("app") == "hrm" for e in self.events), "hermes 이벤트가 없다")

    def test_state_writers_only_use_known_keys(self):
        # 샌드박스가 거치지 않는 분기(secretNoticeAt 등)까지 — state 최상위에 대입하는 키 · 초기값 리터럴의 키를 소스에서 읽는다(#880 9-1 M1)
        src = SCRIPT.read_text(encoding="utf-8")
        empty = re.search(r"const empty = (\{[^\n]*\})", src)
        self.assertIsNotNone(empty)
        keys = literal_keys(empty.group(1)) | set(re.findall(r"\bstate\.([a-zA-Z_]+)\s*(?:=(?!=)|\|\|=|\?\?=)", src))
        sh = self.shape["state"]
        known = set(sh["required"]) | set(sh["optional"]) | set(sh["ignored"])
        self.assertIn("hrm", keys)   # 추출이 실제로 잡는다
        self.assertLessEqual(keys, known, sorted(keys - known))

    def test_fp_writers_only_use_known_keys(self):
        # 지문 항목 — 만드는 리터럴(entryFor) · Object.assign(e, {…}) · e.<k> = 의 키(#880 9-1 I2)
        src = SCRIPT.read_text(encoding="utf-8")
        init = re.search(r"table\[o\.fp\] \|\|= (\{[^\n]*\})", src)
        self.assertIsNotNone(init)
        keys = literal_keys(init.group(1))
        for m in re.findall(r"Object\.assign\(e, (\{[^\n]*?\})\)", src):
            keys |= literal_keys(m)
        keys |= set(re.findall(r"\be\.([a-zA-Z_]+)\s*(?:=(?!=)|\|\|=|\+=)", src))
        sh = self.shape["fp"]
        known = set(sh["required"]) | set(sh["optional"]) | set(sh["ignored"])
        self.assertIn("material", keys)
        self.assertLessEqual(keys, known, sorted(keys - known))

    def test_tally_mirrors_reader_rules(self):
        s = {"required": {"at": "number"}, "optional": {"app": "string"}, "ignored": ["detail"]}
        self.assertEqual(tally([{"at": 1, "app": None, "detail": "원문"}], s), (0, 0, 0))   # null = 없음 · ignored 는 세지 않는다
        self.assertEqual(tally([{"at": True}], s), (0, 1, 0))                             # bool 은 number 가 아니다
        self.assertEqual(tally([{"at": float("nan")}], s), (0, 1, 0))                     # 유한수만(fields.ts Number.isFinite)
        self.assertEqual(tally([{"at": 1, "x": 1}, None, {"at": 1, "app": 3}], s), (1, 1, 1))


if __name__ == "__main__":
    unittest.main()
