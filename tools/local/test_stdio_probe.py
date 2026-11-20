"""tools/local/stdio-probe.cjs — 판정 줄 시험(#868 · 015 §0-4). 진짜 claude 는 부르지 않는다(가짜 CLI · 모델 호출 0).

실행: python3 -m unittest discover -s tools/local
가짜 CLI 는 --mcp-config 의 stdio 서버를 띄워 initialize 를 보내고, 기다린 시간 안에 답하면 connected · 아니면 pending 으로
init 줄을 낸 뒤 멈춘다(탐침이 SIGKILL 한다). 고아는 탐침의 양성 대조(--host-ignore-eof)로 만든다.
"""

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROBE = HERE / "stdio-probe.cjs"
NODE = shutil.which("node")

FAKE_CLAUDE = r"""#!/usr/bin/env node
const { spawn } = require('node:child_process')
const fs = require('node:fs')
if (process.argv[2] === '--version') { console.log('9.9.9 (Fake)'); process.exit(0) }
const cfg = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--mcp-config') + 1], 'utf8'))
const wait = Number(process.env.FAKE_WAIT_MS || 2000)
process.stdin.resume()
const servers = Object.entries(cfg.mcpServers).map(([name, s]) => {
  const p = spawn(s.command, s.args, { stdio: ['pipe', 'pipe', 'ignore'], env: process.env })
  const st = { name, status: 'pending' }
  let buf = ''
  p.stdout.on('data', (c) => { buf += c; if (buf.includes('"id":1')) st.status = 'connected' })
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n')
  return st
})
setTimeout(() => {
  console.log(JSON.stringify({ type: 'system', subtype: 'init', tools: [], plugins: [], mcp_servers: servers.map(({ name, status }) => ({ name, status })) }))
  setInterval(() => {}, 1000)
}, wait)
"""


@unittest.skipUnless(NODE, "node 없음")
class StdioProbe(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="probe-test-"))
        self.fake = self.tmp / "claude"
        self.fake.write_text(FAKE_CLAUDE)
        self.fake.chmod(0o755)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_probe(self, *args, **env):
        e = {**os.environ, **env}
        r = subprocess.run([NODE, str(PROBE), f"--claude={self.fake}", *args], capture_output=True, text=True, timeout=120, env=e)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout

    def test_all_connected_and_hosts_exit_on_eof(self):
        out = self.run_probe("--runs=2", "--hosts=1,3", FAKE_WAIT_MS="800")
        self.assertIn("CLI 9.9.9 (Fake)", out)
        self.assertIn("API 주소 닫힌 포트(모델 호출 0)", out)
        self.assertIn("호스트 1: init 받음 2/2 · 전부 connected 2/2 · 상태 connected 2 · initialize 도달 2/2", out)
        self.assertIn("호스트 3: init 받음 2/2 · 전부 connected 2/2 · 상태 connected 6 · initialize 도달 6/6", out)
        self.assertIn("고아(EOF 5000 ms 뒤 남음) 0/6", out)
        self.assertIn("모델 응답: 없음", out)
        self.assertIn("판정 재료: stdio 조건 충족", out)

    def test_slow_host_is_pending(self):
        out = self.run_probe("--runs=1", "--hosts=1", "--host-delay=2000", FAKE_WAIT_MS="300")
        self.assertIn("상태 pending 1", out)
        self.assertIn("판정 재료: 루프백 대안 검토(Q143 · H-R5) — pending 1 · 고아 0", out)

    def test_positive_control_counts_orphans_and_cleans_up(self):
        out = self.run_probe("--runs=1", "--hosts=2", "--host-ignore-eof", FAKE_WAIT_MS="500")
        self.assertIn("양성 대조(호스트가 EOF 무시 — 측정 아님)", out)
        self.assertIn("고아(EOF 5000 ms 뒤 남음) 2/2", out)
        self.assertIn("고아 2", out)
        left = subprocess.run(["pgrep", "-f", "stdio-probe.cjs --host"], capture_output=True, text=True).stdout.split()
        self.assertEqual(left, [], "탐침이 남은 호스트를 정리해야 한다")

    # 회귀: PR #869 Codex P2 — init 을 못 받거나 서버가 connected 가 아니면 "충족" 이 아니라 판정 불가
    def test_no_init_is_inconclusive(self):
        r = subprocess.run([NODE, str(PROBE), "--claude=/usr/bin/false", "--runs=1", "--hosts=1"], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("호스트 1: init 받음 0/1", r.stdout)
        self.assertIn("판정 재료: 판정 불가 — 모든 서버가 connected 가 아닌 회 1", r.stdout)
        self.assertNotIn("stdio 조건 충족", r.stdout)

    def test_rejects_bad_args_and_shim(self):
        r = subprocess.run([NODE, str(PROBE), "--runs=0"], capture_output=True, text=True, timeout=30)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("--runs", r.stderr)
        # PATH 에 로컬 shim(I-8)만 있으면 쓰지 않는다 — 진짜 CLI 가 아니면 init 을 잴 수 없다
        shim_dir = self.tmp / "shim"
        shim_dir.mkdir()
        (shim_dir / "claude").write_text("#!/bin/sh\n# pleiades local shim\nexit 0\n")
        (shim_dir / "claude").chmod(0o755)
        r = subprocess.run([NODE, str(PROBE), "--runs=1"], capture_output=True, text=True, timeout=30,
                           env={**os.environ, "PATH": f"{shim_dir}:/usr/bin:/bin"})
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("찾지 못했다", r.stderr)


if __name__ == "__main__":
    unittest.main()
