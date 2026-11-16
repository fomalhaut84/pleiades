// 통합 층 비공개 위치 (#680 · 012 §5-1 (b1) 과 같은 규칙).
// `PLEIADES_PRIVATE_DIR` 또는 `~/pleiades-private` 아래 `advisor/` — 700 · 파일 600 · git 작업트리 안이면 멈춘다
// (release-inplace.sh · X1 과 같은 규칙). mcp-config 와 CLI 의 빈 cwd(work/)가 여기 생긴다 — 체크아웃을 dirty 로 만들지 않는다.
// CLI 세션 기록(resume transcript)은 여기가 아니라 CLAUDE_CONFIG_DIR(기본 ~/.claude/projects/<cwd 인코딩>)에 남는다 —
// 같은 OS 사용자의 개발용 기록과 같은 위치다(위치 분리는 4b-3 서버 배치에서 정한다 · 9-1 info 6).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function privateRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env.PLEIADES_PRIVATE_DIR || path.join(os.homedir(), "pleiades-private");
}

/** p 또는 그 조상에 .git 이 있으면 true — 비공개 파일이 저장소로 새지 않게 */
export function insideGit(p: string): boolean {
  for (let d = path.resolve(p); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, ".git"))) return true;
    if (path.dirname(d) === d) return false;
  }
}

/** 디렉터리를 700 으로 만든다(있으면 권한만 맞춘다). git 안이면 던진다. */
export function ensurePrivateDir(dir: string): string {
  if (insideGit(dir)) throw new Error("비공개 위치가 git 작업트리 안이다 — PLEIADES_PRIVATE_DIR 을 체크아웃 밖으로");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  return dir;
}

export function writePrivate(file: string, body: string): void {
  fs.writeFileSync(file, body, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}
