"""apps/*/domain.json — 도메인 계약 v0 · v1 (#653 · 012 §7-2 · #858 · 015 §3-2 V-3).

실행: python3 -m unittest discover -s deploy
저장소의 선언 전부를 발견해 같은 계약을 돈다(015 AD-1) — 새 선언은 따로 등록하지 않아도 이 시험을 받는다(#841 의 DOMAINS 고정 목록 → V-3 일반화).
통합 층 vitest(domains.test.ts)의 '실제 저장소 = fin · fit' 단언은 남는다 — 새 선언을 더하면 그 단언을 함께 고친다.
보는 것: 판별 스키마(v0 · v1 · kind) · 분류가 MCP 서버 등록과 양방향으로 같다(mcp) · 서버 키·포트가 mcp-config.json 과 같다(keySuffix 가 있을 때) ·
키 접미사를 앱 코드가 실제로 쓴다 · 읽기 전용 경로(K-1) · 지식 prompt(K-3 · 선언했을 때) · 모델 핀(K-7). 소스를 읽기만 한다(실행 0).
"""

import json
import re
import unittest
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
NAME = re.compile(r"^[a-z0-9_]{1,60}$")
SUFFIX = re.compile(r"^[A-Z0-9_]{1,40}$")
MODELS_FILE = re.compile(r"^src/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\.ts$")   # apps/advisor/src/domains.ts MODELS_FILE 과 같다
CONSTANT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,60}$")
SUMMARY_MAX_BYTES = 200   # 015 §0-3 X1 · domains.ts SUMMARY_MAX_BYTES
V0, V1 = "pleiades-domain/v0", "pleiades-domain/v1"
V0_KEYS = {"$comment", "contract", "id", "name", "keySuffix", "mcp", "tools"}
V1_REQUIRED = {"contract", "id", "name", "kind", "summary", "tools"}
V1_ALLOWED = V1_REQUIRED | {"$comment", "enabled", "keySuffix", "knowledge", "models", "mcp", "local"}
# 012 대장 · X1 판정 양식 값(fin 59 = 25 + 34 · fit 28 = 27 + 1) — 바뀌면 분류를 다시 본 뒤 이 값을 고친다 · 새 앱은 여기에 없어도 된다
KNOWN_COUNTS = {"finance": (25, 34), "fitness": (27, 1)}


def discovered() -> dict:
    """통합 층 loadDomains 와 같은 규칙 — apps/ 바로 아래 실제 디렉터리(심링크 제외)의 domain.json"""
    found = {}
    for p in sorted((ROOT / "apps").iterdir()):
        f = p / "domain.json"
        if p.is_dir() and not p.is_symlink() and f.exists():
            found[p.name] = json.loads(f.read_text(encoding="utf-8"))
    return found


def kind_of(dom: dict) -> str:
    return "mcp" if dom["contract"] == V0 else dom["kind"]


def knowledge_of(dom: dict) -> bool:
    return dom["contract"] == V0 or dom.get("knowledge") is True


def all_tools(dom: dict) -> list:
    t = dom["tools"]
    return t["read"] + t["write"] + t.get("propose", [])


def src_of(app_dir: str, rel: str) -> str:
    return (ROOT / "apps" / app_dir / rel).read_text(encoding="utf-8")


def registered(app_dir: str) -> list:
    src = src_of(app_dir, "src/mcp/server.ts")
    # server.tool · server.registerTool 둘 다 — 새 등록 API 로 추가한 도구도 분류 대조에 들어온다(#655 9-1)
    return re.findall(r"server\.(?:tool|registerTool)\(\s*['\"]([a-z0-9_]+)['\"]", src)


class DomainContract(unittest.TestCase):
    def setUp(self):
        self.domains = discovered()

    def each(self, pred=lambda dom: True):
        for d, dom in self.domains.items():
            if pred(dom):
                with self.subTest(app=d):
                    yield d, dom

    def test_discovery(self):
        # 지금 저장소의 선언 — fin · fit 이 빠지면 발견 규칙이 깨진 것이다(새 선언은 더해져도 된다)
        self.assertTrue({"finance", "fitness"} <= set(self.domains), sorted(self.domains))
        for d, dom in self.domains.items():
            self.assertIn(dom.get("contract"), (V0, V1), d)   # 아니면 아래 형태 시험이 둘 다 건너뛴다(#858 9-1 info)
        for key in ("id", "name"):
            vals = [dom[key] for dom in self.domains.values()]
            self.assertEqual(len(vals), len(set(vals)), f"{key} 가 겹친다")

    def test_shape_v0(self):
        for _, dom in self.each(lambda dom: dom.get("contract") == V0):
            self.assertEqual(set(dom), V0_KEYS)
            self.assertRegex(dom["id"], NAME)
            self.assertTrue(dom["name"])
            self.assertRegex(dom["keySuffix"], SUFFIX)
            self.assertEqual(set(dom["mcp"]), {"serverKey", "defaultPort"})
            self.assertRegex(dom["mcp"]["serverKey"], NAME)
            self.assertIsInstance(dom["mcp"]["defaultPort"], int)
            self.assertEqual(set(dom["tools"]), {"read", "write"})

    def test_shape_v1(self):
        for _, dom in self.each(lambda dom: dom.get("contract") == V1):
            self.assertTrue(V1_REQUIRED <= set(dom) <= V1_ALLOWED, sorted(set(dom) ^ V1_REQUIRED))
            self.assertRegex(dom["id"], NAME)
            self.assertTrue(dom["name"])
            self.assertIn(dom["kind"], ("mcp", "local"))
            self.assertTrue(dom["summary"])
            self.assertLessEqual(len(dom["summary"].encode("utf-8")), SUMMARY_MAX_BYTES)
            for k in ("enabled", "knowledge"):
                if k in dom:
                    self.assertIsInstance(dom[k], bool, k)
            if "keySuffix" in dom:
                self.assertRegex(dom["keySuffix"], SUFFIX)
            self.assertEqual(set(dom["tools"]), {"read", "write", "propose"})   # v1 은 키 누락 거부(015 §3-2 K-2)
            if "models" in dom:
                self.assertEqual(set(dom["models"]), {"file", "constant"})
                self.assertRegex(dom["models"]["file"], MODELS_FILE)
                self.assertRegex(dom["models"]["constant"], CONSTANT)
            if dom["kind"] == "mcp":
                self.assertNotIn("local", dom)
                self.assertEqual(set(dom["mcp"]), {"serverKey", "defaultPort"})
                self.assertRegex(dom["mcp"]["serverKey"], NAME)
                self.assertIsInstance(dom["mcp"]["defaultPort"], int)
                self.assertEqual(dom["tools"]["propose"], [], "mcp 는 propose 를 쓰지 않는다")
            else:
                self.assertNotIn("mcp", dom)
                self.assertEqual(set(dom["local"]), {"reader"})
                self.assertRegex(dom["local"]["reader"], NAME)
                self.assertEqual(dom["tools"]["write"], [], "local 은 write 가 늘 빈 배열")

    def test_unique_server_and_port_keys(self):
        # 통합 층 loadDomains 가 겹친 쪽 모두 뺀다 — 저장소 선언에서는 처음부터 0
        server = [dom["mcp"]["serverKey"] if kind_of(dom) == "mcp" else f"pl_{dom['id']}" for dom in self.domains.values()]
        self.assertEqual(len(server), len(set(server)), "serverKey")
        ports = [dom.get("keySuffix") or dom["id"].upper() for dom in self.domains.values() if kind_of(dom) == "mcp"]
        self.assertEqual(len(ports), len(set(ports)), "포트 override 키")
        suffixes = [dom["keySuffix"] for dom in self.domains.values() if "keySuffix" in dom]
        self.assertEqual(len(suffixes), len(set(suffixes)), "keySuffix(채널 키)")   # 런타임 loadDomains 와 같은 기준

    def test_classification(self):
        for _, dom in self.each():
            names = all_tools(dom)
            if kind_of(dom) == "mcp":
                self.assertTrue(dom["tools"]["read"], "읽기 목록이 비었다")
            self.assertTrue(all(isinstance(n, str) and NAME.match(n) for n in names), "이름 형식")
            self.assertEqual(len(names), len(set(names)), "중복 또는 분류 겹침")

    def test_classification_matches_registration(self):
        # 분류 오류의 유일한 상시 탐지(012 §2-1) — 등록됐는데 분류 없음 / 분류됐는데 등록 없음 둘 다 0
        for d, dom in self.each(lambda dom: kind_of(dom) == "mcp"):
            reg = registered(d)
            self.assertEqual(len(reg), len(set(reg)), "server.ts 중복 등록")
            self.assertEqual(sorted(reg), sorted(all_tools(dom)))

    def test_known_counts(self):
        for d, dom in self.each(lambda dom: True):
            if d in KNOWN_COUNTS:
                t = dom["tools"]
                self.assertEqual((len(t["read"]), len(t["write"])), KNOWN_COUNTS[d])

    def test_mcp_config_and_port(self):
        # V-3(015 §4-2 A27 · AU2:30) — 앱 mcp-config.json 의 URL 포트 = 선언 defaultPort. server.ts 의 코드 모양(fin 형 · fit 형)은 보지 않는다.
        # mcp-config.json 은 앱 자신의 advisor 가 쓰는 파일이라 keySuffix(채널을 가진 앱 = 앱 advisor 가 있는 앱)일 때만 본다(015 §3-2 K-4 · W1a 선택) —
        # keySuffix 없는 mcp 선언의 defaultPort 는 대조할 앱 쪽 파일이 없다(운영에서 틀리면 prepare 가 연결 실패로 그 제공자만 뺀다)
        for d, dom in self.each(lambda dom: kind_of(dom) == "mcp" and "keySuffix" in dom):
            cfg = json.loads(src_of(d, "src/lib/ai/mcp-config.json"))
            key = dom["mcp"]["serverKey"]
            self.assertEqual(list(cfg["mcpServers"]), [key])
            url = urlsplit(cfg["mcpServers"][key]["url"])
            self.assertEqual((url.scheme, url.hostname, url.port, url.path), ("http", "127.0.0.1", dom["mcp"]["defaultPort"], "/mcp"))

    def test_key_suffix_in_use(self):
        for d, dom in self.each(lambda dom: "keySuffix" in dom):
            src = "\n".join(p.read_text(encoding="utf-8") for p in (ROOT / "apps" / d / "src").rglob("*.ts"))
            self.assertIn(f"DISCORD_CHANNEL_ID_{dom['keySuffix']}", src)

    def test_read_path(self):
        # K-1(#655 · 012 Q133): 읽기 전용 경로는 모든 mcp 도메인 같은 이름 · domain.json tools.read 로 등록을 거른다
        for d, _ in self.each(lambda dom: kind_of(dom) == "mcp"):
            mode = src_of(d, "src/mcp/read-mode.ts")
            self.assertRegex(mode, r"MCP_READ_PATH = ['\"]/mcp/read['\"]")
            self.assertRegex(mode, r"import domain from ['\"]\.\./\.\./domain\.json['\"]")
            self.assertIn("new Set(domain.tools.read)", mode)

    def test_knowledge_prompt(self):
        # K-3(#657 · 012 Q135): 지식 prompt 는 같은 이름 · 읽기 모드에서만 등록 — 선언한 도메인만(v1 은 선택 · 015 §3-2)
        for d, _ in self.each(lambda dom: kind_of(dom) == "mcp" and knowledge_of(dom)):
            mod = src_of(d, "src/mcp/knowledge-prompt.ts")
            self.assertRegex(mod, r"DOMAIN_KNOWLEDGE_PROMPT = ['\"]domain_knowledge['\"]")
            server = src_of(d, "src/mcp/server.ts")
            self.assertEqual(len(re.findall(r"registerDomainKnowledgePrompt\(", server)), 1)
            self.assertRegex(server, r"if \(mode === ['\"]read['\"]\) registerDomainKnowledgePrompt\(server")

    def test_model_pins(self):
        # K-7(#858): 통합 층은 선언의 models 가 가리키는 상수를 읽는다(cli.ts readPins) — 파일 · 상수 · 두 등급이 있어야 한다
        pins = []
        for d, dom in self.each(lambda dom: "models" in dom):
            src = src_of(d, dom["models"]["file"])
            m = re.search(rf"\b(?:export\s+)?const\s+{dom['models']['constant']}\b", src)   # cli.ts readPins 와 같은 찾기
            at = m.start() if m else -1
            self.assertGreaterEqual(at, 0, "상수가 없다")
            block = src[at:]
            pins.append(tuple(re.search(rf"{tier}:\s*['\"]([^'\"]+)['\"]", block).group(1) for tier in ("haiku", "sonnet")))
        self.assertTrue(pins, "모델 핀을 선언한 도메인이 없다")
        self.assertEqual(len(set(pins)), 1, f"모델 핀이 앱마다 다르다 {pins}")

    def test_advisor_tools_read_domain_json(self):
        # 앱 advisor 분류 상수가 domain.json 에서 오고 목록을 다시 적지 않는다 — 그 파일이 있는 앱만(앱 계약 · 015 §3-2)
        for d, dom in self.each(lambda dom: kind_of(dom) == "mcp"):
            f = ROOT / "apps" / d / "src" / "lib" / "ai" / "advisor-tools.ts"
            if not f.exists():
                continue
            src = f.read_text(encoding="utf-8")
            self.assertRegex(src, r"import domain from ['\"]\.\./\.\./\.\./domain\.json['\"]")
            for n in all_tools(dom):
                self.assertNotRegex(src, rf"['\"](mcp__[a-z]+__)?{n}['\"]", f"{n} 를 다시 적었다")


if __name__ == "__main__":
    unittest.main()
