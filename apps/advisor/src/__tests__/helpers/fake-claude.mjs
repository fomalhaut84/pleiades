// 가짜 claude CLI — FAKE_CLI_SPEC(JSON { lines: [...], hang?: bool }) 의 줄을 stream-json 으로 낸다.
// FAKE_CLI_LOG 가 있으면 인자·stdin 을 한 줄 JSON 으로 덧붙인다(시험이 --resume · 질문 전달을 확인한다).
import fs from "node:fs";
import process from "node:process";
import { setInterval } from "node:timers";

const spec = JSON.parse(fs.readFileSync(process.env.FAKE_CLI_SPEC, "utf8"));
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
