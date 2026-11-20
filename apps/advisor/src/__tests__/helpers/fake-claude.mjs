// 가짜 claude CLI — FAKE_CLI_SPEC(JSON { lines: [...], hang?: bool } · 또는 { runs: [...] }) 의 줄을 stream-json 으로 낸다.
// FAKE_CLI_LOG 가 있으면 인자·stdin 을 한 줄 JSON 으로 덧붙인다(시험이 --resume · 질문 전달을 확인한다).
import fs from "node:fs";
import process from "node:process";
import { setInterval } from "node:timers";

// { runs: [{ lines, hang? }, …] } 이면 호출 순서(FAKE_CLI_LOG 줄 수)로 고른다 · 모자라면 마지막 것(V-2c 재시도 시험)
const raw = JSON.parse(fs.readFileSync(process.env.FAKE_CLI_SPEC, "utf8"));
const calls = process.env.FAKE_CLI_LOG && fs.existsSync(process.env.FAKE_CLI_LOG)
  ? fs.readFileSync(process.env.FAKE_CLI_LOG, "utf8").split("\n").filter(Boolean).length : 0;
const spec = Array.isArray(raw.runs) ? raw.runs[Math.min(calls, raw.runs.length - 1)] : raw;
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => {
  input += c;
});
process.stdin.on("end", () => {
  if (process.env.FAKE_CLI_LOG) fs.appendFileSync(process.env.FAKE_CLI_LOG, `${JSON.stringify({ argv: process.argv.slice(2), input, db: process.env.DATABASE_URL !== undefined })}\n`);
  for (const l of spec.lines) process.stdout.write(`${typeof l === "string" ? l : JSON.stringify(l)}\n`);
  if (spec.hang) setInterval(() => undefined, 1000);
});
