// #680 — 설정 범위 · 비공개 위치 · 배포 락 · 세션 · CLI 인자·env · 모델 고정.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CALL_BUDGET_USD, childEnv, cliArgs, readPins, resolveClaude } from "../cli";
import { lockFileOf, probeDeployLock } from "../deploy-lock";
import { ensurePrivateDir, insideGit } from "../private-dir";
import { SESSION_IDLE_MS, SessionStore, sessionKey } from "../session-store";
import { checkSettings } from "../settings";

const APPS = path.resolve(__dirname, "../../..");
let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "adv-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("checkSettings (X1 S-3)", () => {
  const dirs = () => {
    const claudeDir = path.join(tmp, "claude");
    const managedDir = path.join(tmp, "managed");
    fs.mkdirSync(claudeDir);
    fs.mkdirSync(managedDir);
    return { claudeDir, managedDir };
  };
  const cwd = () => {
    const d = path.join(tmp, "work");
    fs.mkdirSync(d, { recursive: true });
    return d;
  };

  it("아무 설정도 없으면 통과", () => {
    expect(checkSettings(cwd(), dirs())).toEqual({ ok: true, blocking: [] });
  });

  it("관리형 hooks · 조상 project allow mcp · 읽기 실패는 막는다", () => {
    const d = dirs();
    fs.writeFileSync(path.join(d.managedDir, "managed-settings.json"), JSON.stringify({ hooks: { Stop: [] } }));
    fs.mkdirSync(path.join(tmp, ".claude"));
    fs.writeFileSync(path.join(tmp, ".claude", "settings.json"), JSON.stringify({ permissions: { allow: ["mcp__x__y"] } }));
    fs.writeFileSync(path.join(d.claudeDir, "settings.local.json"), "{깨짐");
    expect(checkSettings(cwd(), d).blocking.sort()).toEqual(["project(조상)", "user-local", "관리형 파일"].sort());
  });

  it("user 범위 플러그인은 보고만(막지 않는다 · init 판정이 본다)", () => {
    const d = dirs();
    fs.writeFileSync(path.join(d.claudeDir, "settings.json"), JSON.stringify({ enabledPlugins: { a: true } }));
    expect(checkSettings(cwd(), d).ok).toBe(true);
  });
});

describe("비공개 위치", () => {
  it("700 으로 만들고 git 안이면 거부한다", () => {
    const d = ensurePrivateDir(path.join(tmp, "p", "advisor"));
    expect(fs.statSync(d).mode & 0o777).toBe(0o700);
    expect(insideGit(APPS)).toBe(true);
    expect(() => ensurePrivateDir(path.join(APPS, "advisor", "logs", "x"))).toThrow(/git/);
  });
});

describe("배포 락 시험", () => {
  it("락 파일이 없으면 free · 만들지 않는다", () => {
    expect(probeDeployLock(lockFileOf(tmp))).toBe("free");
    expect(fs.existsSync(lockFileOf(tmp))).toBe(false);
  });

  it("flock 이 없거나 판정할 수 없으면 unknown — 질문을 시작하지 않는 쪽", () => {
    fs.writeFileSync(lockFileOf(tmp), "");
    expect(probeDeployLock(lockFileOf(tmp), path.join(tmp, "no-flock"))).toBe("unknown");
  });

  it("flock 종료 코드 0 → free · 1 → busy", () => {
    fs.writeFileSync(lockFileOf(tmp), "");
    const fake = (code: number) => {
      const f = path.join(tmp, `flock-${code}`);
      fs.writeFileSync(f, `#!/bin/sh\nexit ${code}\n`, { mode: 0o755 });
      return f;
    };
    expect(probeDeployLock(lockFileOf(tmp), fake(0))).toBe("free");
    expect(probeDeployLock(lockFileOf(tmp), fake(1))).toBe("busy");
    expect(probeDeployLock(lockFileOf(tmp), fake(2))).toBe("unknown");
  });
});

describe("SessionStore", () => {
  it("키는 discord:<채널>:<사용자> 숫자만", () => {
    expect(sessionKey("123", "456")).toBe("discord:123:456");
    expect(() => sessionKey("a", "1")).toThrow();
  });

  it("24h 미사용 · 컨텍스트 100k 초과면 새 세션 · 기록은 새 객체", () => {
    let now = 1_000;
    const s = new SessionStore(() => now);
    const frame = { system: "s", allow: [], serverKeys: [], prefixes: [], mcpConfigPath: "m", missing: "" };
    const first = s.start("k", frame);
    s.record("k", "sid", 10);
    expect(s.get("k")).not.toBe(first);
    expect(s.get("k")?.cliSessionId).toBe("sid");
    now += SESSION_IDLE_MS + 1;
    expect(s.get("k")).toBeUndefined();
    s.start("k", frame);
    s.record("k", "sid2", 100_001); // 컨텍스트(캐시 포함) 상한 · 9-1 M3
    expect(s.get("k")).toBeUndefined();
  });
});

describe("CLI 인자 · env · 고정", () => {
  it("두 앱 모델 고정이 같다(실제 models.ts)", () => {
    const pin = readPins(APPS);
    expect(pin.sonnet).toMatch(/^claude-/);
    expect(pin.haiku).toMatch(/^claude-/);
  });

  it("자식 env 에 DB · Discord · NOTIFY 키를 넘기지 않는다 · 핀 셋", () => {
    const env = childEnv({ haiku: "h", sonnet: "s" }, { PATH: "/bin", DATABASE_URL: "x", DISCORD_BOT_TOKEN_ADVISOR: "t", NOTIFY_X: "1", ANTHROPIC_MODEL: "m" });
    expect(env).toMatchObject({ PATH: "/bin", ANTHROPIC_DEFAULT_SONNET_MODEL: "s", ANTHROPIC_SMALL_FAST_MODEL: "h", DISABLE_AUTOUPDATER: "1" });
    for (const k of ["DATABASE_URL", "DISCORD_BOT_TOKEN_ADVISOR", "NOTIFY_X", "ANTHROPIC_MODEL"]) expect(env[k]).toBeUndefined();
  });

  // 012 4b-3a2 (#695) B4 — 상속 + 거부 목록이 아니라 허용 목록. pm2 주입 키 · 플랫폼 키 · 셸에 있던 그 밖 키는 claude 로 가지 않는다
  it("자식 env 는 허용 목록만 — 인증 키는 있을 때만 · 추가 통과 키는 명시한 것만", () => {
    const base = {
      HOME: "/h", PATH: "/bin", USER: "u", LOGNAME: "u", SHELL: "/bin/sh", LANG: "ko_KR.UTF-8", LC_ALL: "C", LC_CTYPE: "UTF-8",
      TZ: "Asia/Seoul", TMPDIR: "/t", TERM: "xterm", CLAUDE_CONFIG_DIR: "/c", ANTHROPIC_API_KEY: "k", CLAUDE_CODE_OAUTH_TOKEN: "o",
      PLEIADES_ENV_FILE: "/p.env", PLEIADES_PRIVATE_DIR: "/priv", pm_id: "3", PM2_HOME: "/pm2", name: "pleiades-adv-bot",
      ADVISOR_MCP_PORT_FINANCE: "4210", NODE_OPTIONS: "--x", FOO: "bar", FAKE_CLI_SPEC: "/s",
      HTTPS_PROXY: "http://p", https_proxy: "http://p", NO_PROXY: "localhost", NODE_EXTRA_CA_CERTS: "/ca", ANTHROPIC_BASE_URL: "https://a",
    };
    const env = childEnv({ haiku: "h", sonnet: "s" }, base);
    const fixed = ["DISABLE_AUTOUPDATER", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_SMALL_FAST_MODEL", "ENABLE_TOOL_SEARCH"];
    const passed = ["HOME", "PATH", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TMPDIR", "TERM", "CLAUDE_CONFIG_DIR",
      "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "HTTPS_PROXY", "https_proxy", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "ANTHROPIC_BASE_URL"];
    expect(Object.keys(env).sort()).toEqual([...passed, ...fixed].sort());
    expect(childEnv({ haiku: "h", sonnet: "s" }, { PATH: "/bin" })).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(childEnv({ haiku: "h", sonnet: "s" }, base, ["FAKE_CLI_SPEC"])).toMatchObject({ FAKE_CLI_SPEC: "/s" });
    expect(childEnv({ haiku: "h", sonnet: "s" }, base, ["FAKE_CLI_SPEC"])).not.toHaveProperty("FOO");
  });

  it("세션을 남기고(--no-session-persistence 없음) 이어 묻기는 --resume · 상한 $1.0000", () => {
    const base = { model: "m", system: "s", mcpConfigPath: "/p", allow: ["a", "b"], budgetUsd: CALL_BUDGET_USD };
    const fresh = cliArgs({ ...base, resume: null });
    expect(fresh).not.toContain("--no-session-persistence");
    expect(fresh).not.toContain("--resume");
    expect(fresh.slice(fresh.indexOf("--max-budget-usd"), fresh.indexOf("--max-budget-usd") + 2)).toEqual(["--max-budget-usd", "1.0000"]);
    expect(fresh.slice(fresh.indexOf("--tools"), fresh.indexOf("--tools") + 2)).toEqual(["--tools", ""]);
    expect(fresh).toEqual(expect.arrayContaining(["--strict-mcp-config", "--setting-sources", "project", "--allowedTools", "a,b"]));
    expect(cliArgs({ ...base, resume: "sid" }).slice(-2)).toEqual(["--resume", "sid"]);
  });

  it("claude 는 PATH 에서 찾고 없으면 던진다", () => {
    const bin = path.join(tmp, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "claude"), "#!/bin/sh\n", { mode: 0o755 });
    expect(resolveClaude({ PATH: bin })).toBe(path.join(bin, "claude"));
    expect(() => resolveClaude({ PATH: tmp })).toThrow();
  });
});
