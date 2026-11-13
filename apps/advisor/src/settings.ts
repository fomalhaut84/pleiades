// Claude Code 설정 범위 검사 — X1 S-3(`deploy/advisor-x1/x1.cjs` checkSettings · #634) 을 옮겼다 (#680).
// 통합 층은 `--setting-sources project` + 중립 cwd 로 돈다. 그래도 managed·조상 project 범위의 allow·hooks·플러그인은
// 읽히므로 막는다(#635 교훈 — 개발용 hook 이 운영 advisor 세션마다 돌았다). user 범위 플러그인은 보고만(실제 로드는 init 판정).
import fs from "node:fs";
import path from "node:path";

export interface ScopeRow {
  scope: string;
  present: boolean;
  parseFail?: boolean;
  mcp?: number;
  wild?: number;
  hooks?: boolean;
  plugins?: boolean;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null;

export function judgeSettingsFile(scope: string, file: string): ScopeRow {
  if (!fs.existsSync(file)) return { scope, present: false };
  let j: unknown;
  try {
    j = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { scope, present: true, parseFail: true };
  }
  const perms = isObj(j) && isObj(j.permissions) ? j.permissions : {};
  const allow = Array.isArray(perms.allow) ? perms.allow.filter((x): x is string => typeof x === "string") : [];
  const hooks = isObj(j) && isObj(j.hooks) && Object.keys(j.hooks).length > 0;
  const plugins = isObj(j) && isObj(j.enabledPlugins) && Object.values(j.enabledPlugins).some((v) => v === true);
  return {
    scope,
    present: true,
    mcp: allow.filter((x) => x.startsWith("mcp__")).length,
    wild: allow.filter((x) => x.includes("*")).length,
    hooks,
    plugins,
  };
}

export interface SettingsDirs {
  claudeDir: string;
  managedDir: string;
}

export function settingsScopes(cwd: string, dirs: SettingsDirs): ScopeRow[] {
  const rows = [
    judgeSettingsFile("user", path.join(dirs.claudeDir, "settings.json")),
    judgeSettingsFile("user-local", path.join(dirs.claudeDir, "settings.local.json")),
    judgeSettingsFile("관리형 파일", path.join(dirs.managedDir, "managed-settings.json")),
  ];
  let frags: string[] = [];
  try {
    frags = fs.readdirSync(path.join(dirs.managedDir, "managed-settings.d")).filter((f) => f.endsWith(".json")).sort();
  } catch {
    // 없음
  }
  for (const f of frags) rows.push(judgeSettingsFile("관리형 조각", path.join(dirs.managedDir, "managed-settings.d", f)));
  // project · local 범위 — 실행 cwd 와 그 조상의 .claude/settings*.json (user 디렉터리 자신은 뺀다)
  for (let d = path.resolve(cwd); ; d = path.dirname(d)) {
    for (const f of ["settings.json", "settings.local.json"]) {
      const r = judgeSettingsFile("project(조상)", path.join(d, ".claude", f));
      if (r.present && path.join(d, ".claude") !== path.resolve(dirs.claudeDir)) rows.push(r);
    }
    if (path.dirname(d) === d) break;
  }
  return rows;
}

export interface SettingsVerdict {
  ok: boolean;
  /** 막는 범위 이름(중복 없음) — 값·경로는 담지 않는다 */
  blocking: string[];
}

export function checkSettings(cwd: string, dirs: SettingsDirs): SettingsVerdict {
  const rows = settingsScopes(cwd, dirs);
  const userScope = (r: ScopeRow) => r.scope === "user" || r.scope === "user-local";
  const bad = rows.filter((r) => r.present && (r.parseFail || r.mcp || r.wild || r.hooks || (r.plugins && !userScope(r))));
  return { ok: bad.length === 0, blocking: [...new Set(bad.map((r) => r.scope))] };
}
