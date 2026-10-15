/**
 * 플랫폼 설정 — pleiades 루트 `.env` 의 `NOTIFY_*` · `DISCORD_WEBHOOK_*` (M-6a-2 #143 · 사용자 2026-10-15).
 *
 * 앱이 어떻게 떠도(`run.sh` · `npm run dev` · `next start` · pm2) 같은 값을 읽도록 **앱이 직접** 루트 파일을 읽는다.
 *   1순위 프로세스 env(셸 export · pm2 `env`) → 2순위 루트 `.env`. 플랫폼 키는 앱 `.env` 에 두지 않는다(check_env 가 막는다).
 *   루트 찾기: `PLEIADES_ENV_FILE`(서버 배포 등 디렉터리 구조가 다를 때) → cwd 에서 위로 `package.json` 의 name 이 `"pleiades"` 인 곳.
 *   플랫폼 키 밖의 키는 읽지 않는다 — 루트 `.env` 에 봇 토큰·DB URL 이 있어도 앱으로 새지 않는다.
 *
 * 소비자 `prepare` 는 `@types/node` 없이 컴파일된다(build-config M3) — Node API 는 모듈 로컬 선언으로 최소만 쓴다.
 */

declare const process: { env: Record<string, string | undefined>; cwd(): string };
declare const require: (id: string) => unknown;
declare const console: { warn(...args: unknown[]): void };

interface FsLike {
  existsSync(p: string): boolean;
  readFileSync(p: string, enc: 'utf8'): string;
  statSync(p: string): { mtimeMs: number };
}
interface PathLike {
  join(...parts: string[]): string;
  dirname(p: string): string;
}

export const PLATFORM_KEY_RE = /^(?:NOTIFY_[A-Z0-9_]+|DISCORD_WEBHOOK_[A-Z0-9_]+)$/;
const LINE_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;
const MAX_DEPTH = 12;

/** dotenv 값 하나 — 따옴표 값은 닫는 따옴표까지(뒤는 공백·`#주석` 만) · 따옴표 없는 값은 ` #` 앞까지. 해석 불가면 undefined. */
export function parseEnvValue(raw: string): string | undefined {
  const v = raw.trim();
  const q = v.charAt(0);
  if (q === '"' || q === "'") {
    const end = v.indexOf(q, 1);
    if (end < 0) return undefined;
    const rest = v.slice(end + 1).trim();
    return rest === '' || rest.charAt(0) === '#' ? v.slice(1, end) : undefined;
  }
  const cut = /\s#/.exec(v);
  return (cut === null ? v : v.slice(0, cut.index)).trim();
}

/** 루트 `.env` 본문에서 플랫폼 키만. 해석할 수 없는 플랫폼 키는 `invalid` 로(값은 담지 않는다). */
export function parsePlatformEnv(text: string): { values: Record<string, string>; invalid: string[] } {
  const values: Record<string, string> = {};
  const invalid: string[] = [];
  // UTF-8 BOM 이 있으면 첫 줄 키가 조용히 빠진다 (#143 사전 리뷰 info)
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = LINE_RE.exec(line);
    if (m === null || !PLATFORM_KEY_RE.test(m[1])) continue;
    const v = parseEnvValue(m[2]);
    if (v === undefined) invalid.push(m[1]);
    else values[m[1]] = v;
  }
  return { values, invalid };
}

function nodeModules(): { fs: FsLike; path: PathLike } | undefined {
  try {
    return { fs: require('fs') as FsLike, path: require('path') as PathLike };
  } catch {
    return undefined; // Node 가 아닌 런타임 — 루트 파일 없이 프로세스 env 만
  }
}

/** cwd → 찾은 루트 `.env` 경로(없으면 null). 디렉터리 구조는 프로세스 중에 바뀌지 않으니 탐색은 한 번 (#143 사전 리뷰 info). */
const rootByCwd = new Map<string, string | null>();

/**
 * 루트 `.env` 경로 — 찾지 못하면 undefined. `PLEIADES_ENV_FILE` 이 상대경로면 cwd 기준이다.
 */
export function findPlatformEnvFile(): string | undefined {
  const explicit = process.env.PLEIADES_ENV_FILE;
  if (explicit !== undefined && explicit.trim() !== '') return explicit.trim();
  const node = nodeModules();
  if (node === undefined) return undefined;
  const start = process.cwd();
  const known = rootByCwd.get(start);
  if (known !== undefined) return known ?? undefined;
  const found = searchRoot(node, start);
  rootByCwd.set(start, found ?? null);
  return found;
}

function searchRoot(node: { fs: FsLike; path: PathLike }, start: string): string | undefined {
  let dir = start;
  for (let i = 0; i < MAX_DEPTH; i++) {
    const pkg = node.path.join(dir, 'package.json');
    try {
      if (node.fs.existsSync(pkg) && (JSON.parse(node.fs.readFileSync(pkg, 'utf8')) as { name?: unknown }).name === 'pleiades') {
        return node.path.join(dir, '.env');
      }
    } catch {
      // 깨진 package.json 은 건너뛰고 위로
    }
    const parent = node.path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * 파일 내용 캐시 — 수정 시각(mtime)이 같을 때만 재사용한다. 파일을 고치거나 지우거나 새로 만들면 **다음 호출부터** 반영된다
 * (재시작 없이 Discord ↔ 텔레그램 전환·되돌리기 · #143 사전 리뷰 major). 없는 파일은 mtime -1.
 */
const cache = new Map<string, { mtimeMs: number; values: Record<string, string> }>();

function mtimeOf(node: { fs: FsLike }, file: string): number {
  try {
    return node.fs.existsSync(file) ? node.fs.statSync(file).mtimeMs : -1;
  } catch {
    return -1;
  }
}

function loadFile(file: string): Record<string, string> {
  const node = nodeModules();
  if (node === undefined) return {};
  const mtimeMs = mtimeOf(node, file);
  const hit = cache.get(file);
  if (hit !== undefined && hit.mtimeMs === mtimeMs) return hit.values;
  let values: Record<string, string> = {};
  try {
    if (mtimeMs >= 0) {
      const parsed = parsePlatformEnv(node.fs.readFileSync(file, 'utf8'));
      values = parsed.values;
      if (parsed.invalid.length > 0) {
        // 조용히 텔레그램으로 떨어지지 않게 파일 버전마다 한 번 알린다 — 키 이름만(값은 비밀)
        console.warn(`[notify] 루트 .env 값을 해석할 수 없어 무시한다 — ${parsed.invalid.join(', ')} (따옴표 짝 · 닫는 따옴표 뒤 글자)`);
      }
    }
  } catch {
    console.warn('[notify] 루트 .env 를 읽을 수 없다 — 플랫폼 설정 없이 진행(알림은 텔레그램)');
  }
  cache.set(file, { mtimeMs, values });
  return values;
}

/** 플랫폼 키 값 — 프로세스 env 가 이기고, 없으면 루트 `.env`. 플랫폼 키가 아닌 이름은 거부한다. */
export function platformEnv(key: string): string | undefined {
  if (!PLATFORM_KEY_RE.test(key)) throw new Error(`@pleiades/notify: 플랫폼 키가 아니다 (${key})`);
  const fromProcess = process.env[key];
  if (fromProcess !== undefined) return fromProcess;
  const file = findPlatformEnvFile();
  return file === undefined ? undefined : loadFile(file)[key];
}

/** 테스트용 — 파일·루트 탐색 캐시를 비운다. */
export function resetPlatformEnvCache(): void {
  cache.clear();
  rootByCwd.clear();
}
