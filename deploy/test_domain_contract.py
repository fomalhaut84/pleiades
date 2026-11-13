"""apps/*/domain.json — 도메인 계약 v0 의 K-0(선언) · K-2(도구 분류) (#653 · 012 §7-2).

실행: python3 -m unittest discover -s deploy
도메인마다 같은 검사를 돈다 — 새 도메인(#240)은 DOMAINS 에 한 줄 더하면 같은 계약을 받는다.
보는 것: 형식 · 분류가 MCP 서버 등록과 양방향으로 같다 · 서버 키·포트가 mcp-config.json · server.ts 기본값과 같다 ·
키 접미사를 앱 코드가 실제로 쓴다 · 읽기 전용 경로(K-1) · 지식 prompt(K-3). 소스를 읽기만 한다(실행 0).
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOMAINS = {"fin": "finance", "fit": "fitness"}
NAME = re.compile(r"^[a-z0-9_]{1,60}$")
KEYS = {"$comment", "contract", "id", "name", "keySuffix", "mcp", "tools"}


def load(app_dir: str) -> dict:
    return json.loads((ROOT / "apps" / app_dir / "domain.json").read_text(encoding="utf-8"))


def registered(app_dir: str) -> list:
    src = (ROOT / "apps" / app_dir / "src" / "mcp" / "server.ts").read_text(encoding="utf-8")
    # server.tool · server.registerTool 둘 다 — 새 등록 API 로 추가한 도구도 분류 대조에 들어온다(#655 9-1)
    return re.findall(r"server\.(?:tool|registerTool)\(\s*['\"]([a-z0-9_]+)['\"]", src)


class DomainContract(unittest.TestCase):
    def test_shape(self):
        for app, d in DOMAINS.items():
            with self.subTest(app=app):
                dom = load(d)
                self.assertEqual(set(dom), KEYS)
                self.assertEqual(dom["contract"], "pleiades-domain/v0")
                self.assertEqual(dom["id"], app)
                self.assertTrue(dom["name"])
                self.assertRegex(dom["keySuffix"], r"^[A-Z]{2,20}$")
                self.assertEqual(set(dom["mcp"]), {"serverKey", "defaultPort"})
                self.assertRegex(dom["mcp"]["serverKey"], NAME)
                self.assertIsInstance(dom["mcp"]["defaultPort"], int)
                self.assertEqual(set(dom["tools"]), {"read", "write"})

    def test_classification(self):
        for app, d in DOMAINS.items():
            with self.subTest(app=app):
                t = load(d)["tools"]
                names = t["read"] + t["write"]
                self.assertTrue(t["read"], "읽기 목록이 비었다")
                self.assertTrue(all(isinstance(n, str) and NAME.match(n) for n in names), "이름 형식")
                self.assertEqual(len(names), len(set(names)), "중복 또는 읽기·쓰기 겹침")

    def test_classification_matches_registration(self):
        # 분류 오류의 유일한 상시 탐지(012 §2-1) — 등록됐는데 분류 없음 / 분류됐는데 등록 없음 둘 다 0
        for app, d in DOMAINS.items():
            with self.subTest(app=app):
                t = load(d)["tools"]
                reg = registered(d)
                self.assertEqual(len(reg), len(set(reg)), "server.ts 중복 등록")
                self.assertEqual(sorted(reg), sorted(t["read"] + t["write"]))

    def test_known_counts(self):
        # 012 대장 · X1 판정 양식 값(fin 59 = 25 + 34 · fit 28 = 27 + 1) — 바뀌면 분류를 다시 본 뒤 이 값을 고친다
        want = {"fin": (25, 34), "fit": (27, 1)}
        for app, d in DOMAINS.items():
            with self.subTest(app=app):
                t = load(d)["tools"]
                self.assertEqual((len(t["read"]), len(t["write"])), want[app])

    def test_mcp_config_and_port(self):
        for app, d in DOMAINS.items():
            with self.subTest(app=app):
                dom = load(d)
                cfg = json.loads((ROOT / "apps" / d / "src" / "lib" / "ai" / "mcp-config.json").read_text())
                self.assertEqual(list(cfg["mcpServers"]), [dom["mcp"]["serverKey"]])
                url = cfg["mcpServers"][dom["mcp"]["serverKey"]]["url"]
                self.assertEqual(url, f"http://127.0.0.1:{dom['mcp']['defaultPort']}/mcp")
                server = (ROOT / "apps" / d / "src" / "mcp" / "server.ts").read_text(encoding="utf-8")
                port = str(dom["mcp"]["defaultPort"])
                # fin: `HTTP_PORT = parseInt(process.env.MCP_PORT ?? '4210', 10)` · fit: `HTTP_PORT = rawPort && … ? … : 4301;`
                fin_style = rf"HTTP_PORT = parseInt\(process\.env\.MCP_PORT \?\? '{port}'"
                fit_style = rf"HTTP_PORT = rawPort[^;]*:\s*{port};"
                self.assertTrue(re.search(fin_style, server) or re.search(fit_style, server), "server.ts 기본 포트가 다르다")

    def test_key_suffix_in_use(self):
        for app, d in DOMAINS.items():
            with self.subTest(app=app):
                suffix = load(d)["keySuffix"]
                src = "\n".join(p.read_text(encoding="utf-8") for p in (ROOT / "apps" / d / "src").rglob("*.ts"))
                self.assertIn(f"DISCORD_CHANNEL_ID_{suffix}", src)

    def test_read_path(self):
        # K-1(#655 · 012 Q133): 읽기 전용 경로는 두 도메인 같은 이름 · domain.json tools.read 로 등록을 거른다
        for app, d in DOMAINS.items():
            with self.subTest(app=app):
                mode = (ROOT / "apps" / d / "src" / "mcp" / "read-mode.ts").read_text(encoding="utf-8")
                self.assertRegex(mode, r"MCP_READ_PATH = ['\"]/mcp/read['\"]")
                self.assertRegex(mode, r"import domain from ['\"]\.\./\.\./domain\.json['\"]")
                self.assertIn("new Set(domain.tools.read)", mode)

    def test_knowledge_prompt(self):
        # K-3(#657 · 012 Q135): 지식 prompt 는 두 도메인 같은 이름 · 읽기 모드에서만 등록
        for app, d in DOMAINS.items():
            with self.subTest(app=app):
                mod = (ROOT / "apps" / d / "src" / "mcp" / "knowledge-prompt.ts").read_text(encoding="utf-8")
                self.assertRegex(mod, r"DOMAIN_KNOWLEDGE_PROMPT = ['\"]domain_knowledge['\"]")
                server = (ROOT / "apps" / d / "src" / "mcp" / "server.ts").read_text(encoding="utf-8")
                self.assertEqual(len(re.findall(r"registerDomainKnowledgePrompt\(", server)), 1)
                self.assertRegex(server, r"if \(mode === ['\"]read['\"]\) registerDomainKnowledgePrompt\(server")

    def test_advisor_tools_read_domain_json(self):
        # 앱 advisor 분류 상수가 domain.json 에서 오고 목록을 다시 적지 않는다
        for app, d in DOMAINS.items():
            with self.subTest(app=app):
                src = (ROOT / "apps" / d / "src" / "lib" / "ai" / "advisor-tools.ts").read_text(encoding="utf-8")
                self.assertRegex(src, r"import domain from ['\"]\.\./\.\./\.\./domain\.json['\"]")
                for n in load(d)["tools"]["read"] + load(d)["tools"]["write"]:
                    self.assertNotRegex(src, rf"['\"](mcp__[a-z]+__)?{n}['\"]", f"{n} 를 다시 적었다")


if __name__ == "__main__":
    unittest.main()
