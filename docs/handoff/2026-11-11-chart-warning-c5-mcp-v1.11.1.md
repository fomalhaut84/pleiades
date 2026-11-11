# 인계 노트 — 2026-11-11(오후), fit 차트 경고 · C5 MCP 오류 · `v1.11.1`

직전 노트: `2026-11-11-collector-tuning-alive-v1.11.0.md`. 이 노트가 최신이다.

**서비스 영향:**
- 서비스 저장소 쓰기 0 · Claude 서버 접근 0(I-3).
- **배포 1회** — `v1.11.1`: Release 발행(16:20) → Actions 자동 배포 · fin rc 0 · 100 s · 프로브 `000`×1(웹 재기동 빈틈) · fit rc 0 · 59 s · 두 앱 online 3/3 · mcp 200 · 재기동 same 6 · 판정 통과. 사용자가 Discord fin `현황` · fit `!today` 정상을 확인했다.
- 서버 작업 없음(수집기 REF 는 그대로 `a56924c`).

**로컬 격리 자원:** fit `.next` 를 다시 빌드했다(검증). 봇·웹은 띄우지 않았다. 검증용 worktree(스크래치)는 지웠다.

**`dev` = `e5c9e30`(+ 이 노트 PR) · `main` = `2918b4e`(Release v1.11.1 · 부모 2).** 열린 PR 0(이 노트 PR 제외) · Actions secrets 저장소 0 · production 허용 목록 안 · 운영 `v1.11.1`.

## 이 세션에서 한 일

1. **#588 → #603 · fit Recharts SSR 크기 경고 제거**
   - 원인: Recharts 의 `warn` 은 운영에서도 켜져 있다(`isDev = true`). 너비·높이가 **둘 다 퍼센트**인 `ResponsiveContainer` 는 SSR 첫 렌더에 `initialDimension`(-1×-1)을 써서 경고했다. 높이가 숫자인 11곳은 원래 경고가 없다.
   - 수정: 7곳에 공통 상수 `CHART_INITIAL_DIMENSION = { width: -1, height: 1 }`(`apps/fitness/src/components/ui/chart-dimension.ts`). 너비 -1 이라 측정 전에는 지금처럼 그리지 않는다 — 서버 HTML 동일(테스트로 고정) · 소스 스캔 테스트가 새 퍼센트 차트의 누락을 막는다.
   - 9-1 0/0 · info 2 반영 · Codex 0.
2. **#602(새 이슈) → #604 · 배포 판정 C5 에 MCP `-out` pino 오류**
   - C5 줄 끝에 `· mcp 출력 오류 <n>` — 창 안 mcp `-out` 에서 pm2 접두 바로 뒤 **첫 키 `level`** 이 50 이상 숫자 또는 `"error"`·`"fatal"` 인 줄. 수집기 `mcpOutObs` 의 근사(JSON 파싱 없음). 두 앱 MCP pino 는 `level` 을 첫 키 · 문자열 라벨로 쓴다(로컬 실측). 통과 조건은 그대로.
   - 9-1 0/0 · info 3 중 2 반영(첫 키 고정 · 문구) · 1 보류(`-out` 전체 읽기 비용 — 커지면 `tail -c` 상한) · Codex 0.
3. **릴리즈 `v1.11.1`(patch)** — 버전 #605 → #606 · 릴리즈 #607(merge commit · 부모 2 확인) · 16:20 발행 · 자동 배포 통과.

## 결정된 것

| 결정 | 근거 |
|---|---|
| #588 · #602 진행 · 릴리즈 · 마무리 | 사용자 "2번 3번 진행해" · "릴리즈 진행해" · "마무리해" |
| 퍼센트 크기 차트는 `CHART_INITIAL_DIMENSION` 을 준다(테스트가 강제) | #603 · 9-1 이 Recharts 3.8.1 소스로 확인 |
| C5 `mcp 출력 오류` 는 판정 정보 · 통과 조건 아님 | #602 이슈 · #604 |
| `v1.11.1` = patch · 서버 조치 없음 | 릴리즈 노트 |

## 결정되지 않은 것

- **008 Q100(P-0~P-10)** — 판정 양식으로 며칠 뒤. **DAYS 는 11-11 14:27(`v1.11.0`) 이후로 센다.** fit web `chart-size` 경고가 0 인지는 **16:21(`v1.11.1`) 이후 구간**으로 본다.
- bot 역할 침묵 감지를 끌지(생존 판정 안정 뒤) · `#ops` 웹훅 위치(PR-2 런북 4절).
- #559 A2(11-14 주간 리뷰 뒤) · T-8 `--purge`(11-16 뒤 · 사용자).

## 다음 세션의 첫 액션 후보

1. **dry-run 재판정(사용자 → 세션):** 런북 3절 판정 양식 → **Q100 결정** → **PR-2**(`#ops` 게시 · 9-1 필수). 되돌리기: crontab `--dry-run` 복귀(**즉시**).
2. **11-14 이후:** 주간 리뷰 기여도 문장 → #559 A2 판정.
3. **11-16 이후:** T-8 `--purge`(사용자 · 편도) → 007 결과 블록.
4. 별건: #421 · #469 · #256.

## 주의사항

- **세션 시작 때 현재 상태를 다시 본다** — `git log` · `gh pr list` 가 정본.
- **이번 세션의 정정:** 릴리즈 PR #607 본문에 "C5 `mcp 출력 오류` 는 이 배포부터" 라고 적었다가 **"다음 배포부터"** 로 고쳤다. `release-inplace.sh` 는 옛 체크아웃의 스크립트가 끝까지 판정한다(자기 교체 보호) — **`release-inplace.sh` 변경은 늘 그다음 배포부터 보인다.** 이번 `v1.11.1` 판정 양식에는 그 칸이 없다.
- **worktree 에서 `deploy` 테스트를 돌리면 `test_ops_collect`·`test_db_backup` 104건이 setUp 에서 실패한다** — `apps/finance/node_modules`(dotenv)가 없다. 변경과 무관 · 본 체크아웃에서 돌린다(423 통과 · 약 9분).
- **zsh 는 따옴표 없는 변수를 단어로 나누지 않는다** — `for c in "npm run lint" …; run.sh fit -- $c` 는 명령 하나로 넘어가 `run.sh` 가 거부한다. `npm run $s` 처럼 낱말 단위로 쓴다.
- fit 테스트 파일은 `.ts`(JSX 없음) — `createElement(ResponsiveContainer, …)` 는 TS 가 children 을 props 에 요구하고 eslint `react/no-children-prop` 이 막는다. 사유 단 disable 한 줄로 처리했다.
- 기능 PR 은 squash 머지여도 된다 · **릴리즈 PR 만 merge commit**(이번 #607 부모 2 확인).
- 서버 수집기 REF `a56924c` 그대로 · 판정 양식은 `63bf776`(11-11 11:47) 앞 구간을 섞지 않는다.
- **응답은 예외 없이 한국어.**
- `MEMORY.md` 30줄.

## 재현이 필요한 절차

**릴리즈:** 버전 올림 PR(6파일 10곳 · `"version": "X"` 치환 · 합계 10 assert) → 릴리즈 PR(`dev`→`main` · merge commit) → `git log -1 --format=%P` 2개 → `git tag` · `git push origin v<X.Y.Z>` · `gh release create --notes-file --verify-tag` → `gh run watch` 뒤 `gh run view --log | grep -E '판정|결과:|C[0-9] |online'`.
