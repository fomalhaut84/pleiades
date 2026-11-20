// 시험 리더 (#872) — 운영 레지스트리에는 없다(사용자 2026-11-20 · 시험에서만 주입). 시험 호스트 번들에 실리므로 시험 도구(esbuild 등)를 import 하지 않는다.
import fs from "node:fs";
import path from "node:path";
import { emptyTally, fileIn, pickJson, pickLines, readCapped } from "../../local/fields";
import type { Reader, Registry } from "../../local/readers";

/** 시험 리더 — 운영 레지스트리에는 없다(사용자 2026-11-20 · 시험에서만 주입). fields 도우미만으로 읽는다 */
export const sampleReader: Reader = {
  id: "sample",
  allowedDecl: "apps/sample",
  tools: [
    { name: "sample_status", description: "시험 상태", inputSchema: { type: "object", properties: {} } },
    { name: "sample_events", description: "시험 이벤트", inputSchema: { type: "object", properties: { app: { type: "string" } } } },
  ],
  examples: { sample_status: {}, sample_events: { app: "fit" } },
  call(tool, args, dir) {
    const tally = emptyTally();
    if (tool === "sample_status") {
      const r = pickJson(readCapped(fileIn(dir, "state.json"), 4096), { required: { updatedAt: "string", queued: "number" }, optional: { sent: "number" } }, tally);
      return { text: JSON.stringify(r), tally };
    }
    const rows = pickLines(readCapped(fileIn(dir, "events.jsonl"), 65_536), { required: { at: "string", type: "string" }, optional: { app: "string", count: "number" } }, tally);
    const app = typeof args.app === "string" ? args.app : null;
    return { text: JSON.stringify(rows.filter((r) => app === null || r.app === app)), tally };
  },
};

/** 양성 대조 — 쓰기를 시도하는 리더(읽기 전용 디렉터리에서 실패해야 한다 · 세 겹 ③ 이 잡는지) */
export const writingReader: Reader = {
  id: "writer",
  allowedDecl: "apps/writer",
  tools: [{ name: "writer_touch", description: "쓰기 시도", inputSchema: { type: "object" } }],
  examples: { writer_touch: {} },
  call(_tool, _args, dir) {
    fs.writeFileSync(path.join(dir, "touched"), "x"); // 시험 전용 — 운영 코드는 쓰기 0 시험 ② 가 막는다
    return { text: "ok", tally: emptyTally() };
  },
};

export const TEST_REGISTRY: Registry = new Map([[sampleReader.id, sampleReader]]);
