// 통합 어드바이저 코어 — 질문 하나 (#680 · 012 §8 4b-1 · Discord 는 4b-2).
// 순서: 동시 처리(전역 1 · [D4]) → 배포 락 시험(§3-5) → 설정 범위(#635) → 세션(없으면 두 도메인 읽기 경로에서 도구·지식) →
// CLI(init fail-closed · 호출당 상한 [D1]) → 답 판정 → K-5 로그 줄. 사용자에게는 정적 한국어 문구만 · 원문(질문·stderr)은 기록하지 않는다.
import crypto from "node:crypto";
import path from "node:path";
import { CALL_BUDGET_USD, Pin, childEnv, cliArgs, readPins, runCli } from "./cli";
import { DomainDecl, DomainReady, loadDomains, prefixOf, prepareDomain, readUrlOf } from "./domains";
import { LockState, lockFileOf, probeDeployLock } from "./deploy-lock";
import { AnswerVerdict, judgeAnswer, judgeInit, safeName } from "./judge";
import { ensurePrivateDir, writePrivate } from "./private-dir";
import { Session, SessionFrame, SessionStore } from "./session-store";
import { SettingsDirs, checkSettings } from "./settings";

export const QUESTION_MAX_CHARS = 4000;
const MCP_TIMEOUT_MS = 10_000;

export const BASE_SYSTEM_PROMPT = `너는 한 사용자의 개인 재무와 건강·운동 데이터를 함께 보는 어드바이저다.
- 쓸 수 있는 것은 각 도메인의 읽기 도구뿐이다. 데이터를 바꾸는 요청에는 할 수 없다고 답하고, 그 도메인 봇에서 하라고 안내한다.
- 질문이 두 도메인에 걸리면 양쪽 도구로 데이터를 확인한 뒤 둘을 연결해서 답한다.
- 도구로 확인하지 않은 수치는 말하지 않는다. 확인하지 못한 것은 확인하지 못했다고 쓴다.
- 한국어로, 결론을 먼저, 간결하게 답한다.`;

export const MESSAGES = {
  busy: "⏳ 다른 질문을 처리하고 있어요. 끝나면 다시 보내 주세요.",
  deploying: "🚧 지금 배포 중이에요. 잠시 뒤 다시 물어봐 주세요.",
  lockUnknown: "🔧 배포 상태를 확인하지 못해 질문을 시작하지 않았어요. 잠시 뒤 다시 시도해 주세요.",
  settings: "🔧 실행 환경이 안전 조건에 맞지 않아 질문을 시작하지 않았어요. 관리자 확인이 필요해요.",
  noDomain: "🔧 도메인 데이터에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  invalid: `질문이 비었거나 너무 길어요(${QUESTION_MAX_CHARS.toLocaleString("en-US")}자 이하).`,
  budget: `💸 이번 질문이 호출당 비용 상한($${CALL_BUDGET_USD.toFixed(2)})에 닿아 중단됐어요. 질문을 좁혀 다시 시도해 주세요.`,
  safety: "🔧 안전 점검에 걸려 답하지 않았어요. 관리자 확인이 필요해요.",
  failed: "❌ 답을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  reset: "🔄 통합 어드바이저 대화를 새로 시작해요.",
} as const;

export type RefuseReason = "busy" | "deploying" | "lock-unknown" | "settings" | "no-domain" | "invalid" | "config";
export type AskOutcome =
  | { kind: "answer"; text: string; verdict: AnswerVerdict }
  | { kind: "failed"; text: string; verdict: AnswerVerdict | null; code: string }
  | { kind: "refused"; text: string; reason: RefuseReason };

export interface AdvisorDeps {
  /** 저장소 apps/ — domain.json · models.ts 를 읽는다 */
  appsDir: string;
  privateRoot: string;
  env: NodeJS.ProcessEnv;
  claude: { bin: string; prefix?: readonly string[] };
  settingsDirs: SettingsDirs;
  lockProbe?: () => LockState;
  prepare?: (decl: DomainDecl) => Promise<DomainReady>;
  log?: (line: string) => void;
  now?: () => number;
  questionTimeoutMs?: number;
}

const keyTag = (key: string) => crypto.createHash("sha256").update(key).digest("hex").slice(0, 8);
const usd = (v: number | null) => (v === null ? "?" : v.toFixed(4));

export function buildSystem(ready: Extract<DomainReady, { ok: true }>[], missing: DomainDecl[]): string {
  const parts = [BASE_SYSTEM_PROMPT];
  for (const d of ready) parts.push(`## 도메인 지식 — ${d.decl.name}\n${d.knowledge}`);
  if (missing.length) {
    parts.push(`## 이번 대화에서 쓸 수 없는 도메인\n${missing.map((d) => d.name).join(" · ")} 도구가 없다. 그 도메인 질문에는 지금 확인할 수 없다고 답한다.`);
  }
  return parts.join("\n\n");
}

export class Advisor {
  private readonly store: SessionStore;
  private readonly pin: Pin;
  private readonly workDir: string;
  private readonly advisorDir: string;
  private busy = false;

  constructor(private readonly deps: AdvisorDeps) {
    this.store = new SessionStore(deps.now);
    this.pin = readPins(deps.appsDir);
    this.advisorDir = ensurePrivateDir(path.join(deps.privateRoot, "advisor"));
    // CLI 의 cwd — 비어 있는 중립 디렉터리(체크아웃 밖 · 조상에 .claude 없음). 세션 기록(resume)은 cwd 기준이라 늘 같다
    this.workDir = ensurePrivateDir(path.join(this.advisorDir, "work"));
  }

  private log(line: string) {
    (this.deps.log ?? ((l: string) => process.stdout.write(`${l}\n`)))(line);
  }

  reset(key: string): string {
    this.store.reset(key);
    return MESSAGES.reset;
  }

  /** 읽기 경로 준비 — 모델 호출 없음(4b-3 기동 탐침 · 로컬 점검) */
  async prepareAll(): Promise<DomainReady[]> {
    const decls = loadDomains(this.deps.appsDir, this.deps.env);
    const prep = this.deps.prepare ?? ((d: DomainDecl) => prepareDomain(d, MCP_TIMEOUT_MS));
    return Promise.all(decls.map(prep));
  }

  private async startSession(key: string): Promise<Session | null> {
    const all = await this.prepareAll();
    const ready = all.filter((d): d is Extract<DomainReady, { ok: true }> => d.ok);
    for (const d of all) if (!d.ok) this.log(`[advisor] domain=${d.id} unavailable why=${d.why}`);
    if (!ready.length) return null;
    const missing = all.filter((d) => !d.ok).map((d) => d.decl);
    const mcpConfigPath = path.join(this.advisorDir, `mcp-${keyTag(key)}.json`);
    writePrivate(mcpConfigPath, JSON.stringify({
      mcpServers: Object.fromEntries(ready.map((d) => [d.decl.serverKey, { type: "http", url: readUrlOf(d.decl) }])),
    }, null, 2));
    const frame: SessionFrame = {
      system: buildSystem(ready, missing),
      allow: ready.flatMap((d) => d.allow),
      serverKeys: ready.map((d) => d.decl.serverKey),
      prefixes: ready.map((d) => prefixOf(d.decl)),
      mcpConfigPath,
      missing: missing.length ? `ℹ️ 이번 대화에서는 ${missing.map((d) => d.name).join(" · ")} 데이터를 쓰지 못했어요.` : "",
    };
    return this.store.start(key, frame);
  }

  async ask(key: string, question: string): Promise<AskOutcome> {
    if (this.busy) return { kind: "refused", reason: "busy", text: MESSAGES.busy };
    const q = question.trim();
    if (!q || q.length > QUESTION_MAX_CHARS) return { kind: "refused", reason: "invalid", text: MESSAGES.invalid };
    this.busy = true;
    try {
      return await this.askLocked(key, q);
    } finally {
      this.busy = false;
    }
  }

  private async askLocked(key: string, q: string): Promise<AskOutcome> {
    const lock = (this.deps.lockProbe ?? (() => probeDeployLock(lockFileOf(this.deps.privateRoot))))();
    if (lock !== "free") {
      this.log(`[advisor] key=${keyTag(key)} refused lock=${lock}`);
      return lock === "busy" ? { kind: "refused", reason: "deploying", text: MESSAGES.deploying } : { kind: "refused", reason: "lock-unknown", text: MESSAGES.lockUnknown };
    }
    const settings = checkSettings(this.workDir, this.deps.settingsDirs);
    if (!settings.ok) {
      this.log(`[advisor] key=${keyTag(key)} refused settings=${settings.blocking.length}`);
      return { kind: "refused", reason: "settings", text: MESSAGES.settings };
    }
    let session: Session | null | undefined = this.store.get(key);
    const resumed = !!session?.cliSessionId;
    if (!session) {
      const started = await this.startOrRefuse(key);
      if ("kind" in started) return started;
      session = started;
    }
    let { v, run } = await this.runOnce(key, session, q, resumed);
    if (resumed && v.status === "init") {
      // 이어 묻던 세션의 init 실패 — 그 사이 배포로 읽기 도구가 바뀌면 세션 시작 때 고정한 허용 목록이 낡는다(9-1 info 1).
      // init 실패는 모델 호출 전에 끊으므로 비용 0 — 세션을 버리고 도메인을 다시 받아 한 번만 새로 묻는다. 진짜 위반이면 다시 걸린다.
      this.store.reset(key);
      const started = await this.startOrRefuse(key);
      if ("kind" in started) return started;
      session = started;
      ({ v, run } = await this.runOnce(key, session, q, false));
    }
    const s: Session = session;
    if (v.status !== "완료" || v.outside > 0 || run.overflow) {
      this.store.reset(key); // 실패한 세션은 이어 묻지 않는다 — 다음 질문은 새 세션(도메인도 다시 받는다)
      const unsafe = v.violation || v.outside > 0;
      const text = v.status === "상한" ? MESSAGES.budget : unsafe ? MESSAGES.safety : MESSAGES.failed;
      return { kind: "failed", text, verdict: v, code: v.outside > 0 ? "outside" : run.overflow ? "stdout-overflow" : v.code };
    }
    if (v.sessionId) this.store.record(key, v.sessionId, v.contextTokens);
    else this.store.reset(key); // 이어 물을 id 가 없다 — 같은 프레임으로 새 CLI 세션을 돌리지 않는다(9-1 info 11)
    // 쓰지 못한 도메인 안내는 세션의 첫 답에만(012 R-16 — 조용히 한 도메인 없이 답하지 않는다)
    return { kind: "answer", text: s.missing && !s.cliSessionId ? `${s.missing}\n\n${v.text}` : v.text, verdict: v };
  }

  private async startOrRefuse(key: string): Promise<Session | AskOutcome> {
    try {
      const started = await this.startSession(key);
      return started ?? { kind: "refused", reason: "no-domain", text: MESSAGES.noDomain };
    } catch {
      this.log(`[advisor] key=${keyTag(key)} refused config`);
      return { kind: "refused", reason: "config", text: MESSAGES.noDomain };
    }
  }

  private async runOnce(key: string, s: Session, q: string, resumed: boolean) {
    const allow = new Set(s.allow);
    const run = await runCli({
      bin: this.deps.claude.bin,
      prefix: this.deps.claude.prefix,
      args: cliArgs({ model: this.pin.sonnet, system: s.system, mcpConfigPath: s.mcpConfigPath, allow: s.allow,
        budgetUsd: CALL_BUDGET_USD, resume: s.cliSessionId }),
      env: childEnv(this.pin, this.deps.env),
      cwd: this.workDir,
      prompt: q,
      checkInit: (e) => judgeInit(e, allow, s.serverKeys),
      timeoutMs: this.deps.questionTimeoutMs,
    });
    const v = judgeAnswer(run, allow, s.prefixes, this.pin);
    const tools = s.prefixes.map((p) => `${safeName(p.replace(/^mcp__|__$/g, ""))}:${v.byPrefix[p].ok}/${v.byPrefix[p].n}`).join(",");
    // K-5 줄 — 질문 원문 · 채널·사용자 ID 없음(키는 해시)
    this.log(`[advisor] key=${keyTag(key)} status=${v.status}${v.code ? ` code=${v.code}` : ""} model=sonnet drift=${v.drift}`
      + ` cost=$${usd(v.cost)} cap=$${CALL_BUDGET_USD.toFixed(4)} turns=${v.turns ?? "?"} tools=${tools} outside=${v.outside}`
      + ` context=${v.contextTokens ?? "?"} duration=${run.ms}ms resumed=${resumed} domains=${s.serverKeys.length}${run.overflow ? " overflow=true" : ""}`);
    return { v, run };
  }
}
