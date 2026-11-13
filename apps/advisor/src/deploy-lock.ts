// 배포 락 확인 (#680 · 012 §3-5 · §0-5 S1).
// 통합 층은 질문 동안 배포 락을 쥐지 않는다 — 쥐면 그 사이 자동 배포가 `take_lock` 에서 rc 1 로 실패한다(012 [N21]).
// 질문 시작 때 `flock -n` 자식으로 잡았다 바로 놓아 시험한다(Node 코어에 flock 이 없다 · 선례 run-x1.sh).
// 자식이 끝나면 락이 풀리고 이 프로세스는 락 fd 를 갖지 않는다 — 새로 뜬 pm2 데몬이 물려받을 길이 없다(G-R3 의 상주 쪽).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type LockState = "free" | "busy" | "unknown";

export const lockFileOf = (privateRoot: string) => path.join(privateRoot, "deploy.lock"); // release-inplace.sh 와 같은 파일

/**
 * free: 락 파일이 없거나(배포가 만든 적 없음 — 만들지 않는다) 잡혔다 놓였다 · busy: 다른 프로세스가 쥐고 있다(rc 1)
 * unknown: flock 없음 · 그 밖의 실패 — 호출부는 질문을 시작하지 않는다(판정할 수 없으면 겹치지 않는 쪽)
 */
export function probeDeployLock(lockFile: string, flockBin = "flock"): LockState {
  if (!fs.existsSync(lockFile)) return "free";
  const r = spawnSync(flockBin, ["-n", lockFile, "true"], { stdio: "ignore", timeout: 5000 });
  if (r.error) return "unknown";
  if (r.status === 0) return "free";
  if (r.status === 1) return "busy";
  return "unknown";
}
