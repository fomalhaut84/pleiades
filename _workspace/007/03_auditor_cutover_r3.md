# 007 전환 설계 초안 3회차 재감사 — reversibility-auditor (#163 · 2026-10-16)

**범위:** 2회차 정정 5건 반영 + 3회차에서 새로 쓴 문장만. 이미 확인된 부분은 다시 열지 않는다. 격리 조건 동일(서버·서비스 DB·`.env`·`repos/*` 0 · 실행 0 · 코드 읽기만).
**판정 기준:** 문서대로 하면 틀린 행동·잘못된 등급이 되는 것만 **정정** · 표현 개선은 **권고(정정 아님)**.

## 1. 2회차 정정 5건 반영

| # | 판정 | 위치 |
|---|---|---|
| 새 정정 1 (fit 크론 웹·봇) | **확인** | §4-4 :178 |
| 새 정정 2 (R-7·R-8 조건부) | **확인** | §7 :291-292 |
| 새 정정 3 (Q85 조건) | **확인(반영)** — 단 조건끼리 충돌 1건(아래 정정 1) | Q85 · G-f |
| 새 정정 4 (prerender 만 DB) | **확인(반영)** — 단 서버 더미 DB 값의 함정 1건(아래 정정 2) | T-4 · Q84 |
| 새 정정 5 (첫 접속 ② · T-2 읽기) | **확인** | §6 I-7 :258 · 인용부 :275 |

## 2. 3회차 새 문장

| 문장 | 판정 | 근거 |
|---|---|---|
| Q85 ① 리허설 조건 6개 → L-7·I-8 차단 | **정정 1** | 조건 *"첫 기동은 run.sh 경유"* 와 *"pm2 설치 방식(전역 vs `npx`)은 사용자 확인"* 이 충돌한다. `run.sh` 는 감싼 명령을 `precheck.py` 로 다시 보고 **`npm`·`npx`·`node` 만 허용**한다(`precheck.py:25 ALLOWED_PROGRAMS` · `:44-45`). 전역 설치를 고르면 `run.sh fin -- pm2 …` 는 거부되고, run.sh 를 우회하게 된다 → shim PATH(`run.sh:23`)·`env -u`(`:27`)·`check_env`(`:24`)가 빠져 **L-7·I-4 차단이 깨진다**. 고칠 문장: *"run.sh 경유 = `tools/local/run.sh <app> -- npx pm2 …`(precheck 허용 목록 안). 전역 `pm2` 는 run.sh 로 돌릴 수 없으므로 고르지 않는다(또는 precheck 허용 목록 변경 = 별도 PR · 리뷰)"*. 나머지 조건(전용 `PM2_HOME` 새 데몬 · PATH 명시 · 기동 뒤 env 확인 · 포트 env 누락 거부 · 착수 전 확인)은 L-7·I-8·I-12 를 막는 데 맞는 조건이다 — fit 은 `CLAUDE_BIN \|\| "claude"` 라 같은 shim PATH 로 함께 막힌다 |
| T-4 *"fin 은 더미 DB 로 `next build`(prerender 단계에서 실패 예상)"* · 표 칸 *"서비스 프로세스·DB·봇 무접촉"* | **정정 2** | 로컬에서 "더미 DB" 는 아무 데도 없는 주소라 무해했지만, **서버에서 흔한 더미값(`postgresql://…@localhost:5432/<없는 DB>`)은 서비스 Postgres 클러스터로 실제 접속을 시도**한다(prerender 의 `account.findMany` · 인증 실패·DB 없음 로그가 서비스 클러스터에 남는다). 그러면 T-4 의 *"DB 무접촉"*·§6 I-7 *"T-4 리허설도 서비스 DB 미접속"* 이 거짓이 된다. 고칠 문장: *"더미 `DATABASE_URL` 은 **서버에서 아무것도 듣지 않는 호스트·포트**로 둔다(5432·서비스 DB 호스트 금지)"*. fit `prisma generate` 는 접속하지 않으므로 무관 |
| T-4 *"`build:mcp:staged`·`build:bot` 개별 실행 · `npm run build` 는 `&&` 체인"* | **확인** | fin `package.json` `build = next build && build:mcp:staged && build:mcp:activate && build:bot` · 두 번들은 esbuild(DB 무관). 권고(정정 아님): `build:mcp:activate` 는 개별 실행 목록에서 빼 둔 것이 맞다 — T-4 는 산출물 활성화가 필요 없다 |
| R-7 *"조건: 전환 이후 pleiades 마이그레이션 0 · 깨지면 편도 · unarchive 선행"* · R-8 *"관찰 기간 안에서만 · 마이그레이션을 실었으면 편도 · 운영 프로세스 흔들림"* | **확인** | [A2] 2-C 와 일치. 권고: R-8 등급 칸 "중간" 옆에 *"(조건 깨지면 편도)"* 를 R-7 처럼 등급 칸 안에 두면 표만 읽어도 보인다 |
| G-e(`migrate status` 종료 코드) · G-f(pm2 env 상속) | **확인** | [A2] 미확인 M-a·M-b 를 그대로 옮겼고 확인 단계(T-1 · Q85 첫 단계)·사용자 확인이 붙어 있다 |
| `clean -x`/`-X` 금지(§4-1 :124 · §4-2 :151) | **확인** | [A2] 2-B 실측과 일치. 권고: :124 의 *"P-2 심링크는 untracked 라 `clean -fd` 가 링크를 지운다"* 는 루트 `.gitignore` 보강 **전** 상태라는 한정어를 앞에 둔다 |

## 결론

**정정 2 · 권고 3 · 미확인 신규 0.** 둘 다 한 문장 수준(조건 하나 고정 · 더미값 하나 지정)이고 등급·순서는 바뀌지 않는다. 문서 규율상 정정이 있으면 초안이며 3회차를 넘었으므로 workflow 4절의 스코프 축소 신호에 해당한다 — 다만 이 두 건은 스코프가 아니라 문장 정밀도 문제라, **두 문장만 고친 뒤 확인(재감사 없이 diff 대조)** 으로 닫는 것을 오케스트레이터에 제안한다. 판단은 오케스트레이터·사용자.

```bash
grep -n "ALLOW\|allowed" tools/local/precheck.py        # :25 {"npm","npx","node"} · :44-45 거부
sed -n 20,27p tools/local/run.sh                          # :23 PATH shim · :24 check_env · :27 env -u
python3 -I -c "import json;print(json.load(open('apps/finance/package.json'))['scripts']['build'])"
```
