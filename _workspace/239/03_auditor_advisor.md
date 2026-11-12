# 239 Phase 3 감사 1회차 — `02_writer_advisor.md`(초안 r1)

- 감사: `reversibility-auditor` · 2026-11-12 · 읽기 전용(파일·git 쓰기 0 · 서버 0) · 기준 작업트리 `feat/624-1` HEAD `42cd8a8` · `apps/*` 하네스는 데이터로만.
- **판정: 다시 초안** — 확인 12 · **정정 16** · 미확인 3.

## 판정 표

| # | 초안 위치 | 주장 | 판정 | 근거 | 정정 문안 |
|---|---|---|---|---|---|
| 1 | §0 L14 · §6 단계 1 L318 · §5-7 | "먼저 앱 코드 변경 0" · 단계 1 = 앱 4곳 수정을 "앱 코드 0" 으로 대체 · "선결은 #624 하나" | 정정 | 단계 1 안에 #624(fin `claude-advisor.ts` 코드 변경 · 릴리즈 = 자동 배포)가 있다 · §5-7 표 선결은 셋(#624 · 기준선 기간 · 사용자 확인) | §0: "실험 자체는 앱 코드 0. 선결은 fin 앱 코드 1곳(#624 로그 줄)과 그 릴리즈 1회 · 며칠의 기준선 · 사용자 확인." §6: "002 의 앱 4곳 수정을 실험용 앱 코드 0 + 로그 1줄(#624 · 릴리즈 1회)로 대체" |
| 2 | §5-7 L307 · §6 L318 | #624 되돌리기 = revert(즉시) | 정정 | 초안 §4 L121 등급표: 코드 revert + 릴리즈 = 중간 — 자기 정의와 어긋남 | "revert + 릴리즈 **중간** — 로그 줄 하나라 되돌릴 이유가 없다(파싱 소비자 0)" |
| 3 | §5-2 X1 · W6 | 앱 코드 변경 없이 셋째 프로세스가 두 MCP 에 붙는다 | 확인 | fin `src/mcp/server.ts:950,999,1027,1093`(127.0.0.1 · 세션별 transport · Host·인증 검사 없음) · fit `server.ts:750,801,832,933` · mcp-config `type:"http"` | — |
| 4 | §5-2 X1 "배포 0" · Q115 | 스크립트를 저장소에 추적해도 배포 0 | 정정 | 체크아웃 안 파일로 돌리려면 릴리즈 = 두 앱 배포(`workflow.md` #242 · `ssh-deploy.sh:38`) | "설치 경로를 정해야 배포 0 이 성립한다 — 추적하면 008 수집기처럼 체크아웃 밖에 커밋 고정 설치(`git show <REF>:<path>` · 사용자). 체크아웃 안이면 릴리즈 필요." Q115 선택지에 반영 |
| 5 | §5-2 L247 | "실험이 끝나면 아무것도 남지 않는다" · 되돌리기 즉시 | 정정 | ① fin 읽기 `get_prices` → `priceCache.upsert`(`lib/price-fetcher.ts:73,118`) ② fit 읽기 `get_activity_splits`·`get_personal_records`·`get_activity_context` → fit 웹 → Garmin API(`mcp/tools/web-api.ts:11-13`) ③ MCP 로그 14일 ④ 결과 파일 | "남는 것: 결과 파일(삭제 즉시) · MCP 로그 14일(자동 소멸) · fin 가격 캐시 갱신(크론과 같다) · Garmin 조회 몇 건(fit `!ai` 와 같은 경로). 원장·설정 쓰기는 0 이어야 한다(#8·#10)" |
| 6 | §5-2 · §2 | 서버 실행이 I-3 과 맞는다(사용자 실행) | 확인 | I-3 은 Claude 세션의 서버 직접 접근만 금지 · `.server-scripts/` 선례 | — |
| 7 | §5-3 #1·#4 | pm2·체크아웃 상태를 건드리지 않는다 | 확인(보완) | CLI·MCP HTTP 만 · pm2 명령 없음 · 단 릴리즈 중 MCP 재기동 | #1 에 "배포 진행 중이면 거부" |
| 8 | §5-3 #2·#3·#7 · J2 | 안전장치 3겹이 쓰기를 막는다 · 사후 "거부 목록 호출 시도 = 0" | **정정(블로커)** | ① `--disallowedTools` 도구는 모델 목록에서 빠져 시도 수가 늘 0 — J2 무의미 ② 등록 = 허용 ∪ 거부 대조는 **빠짐**만 보고 **분류 오류**는 못 본다 ③ 사후 근거는 MCP 로그 `tool` · `[advisor] … caller=strategy:parse` 줄 | #7: "실험 시간 창의 두 MCP 로그 `tool_call` 이름 중 허용 목록 밖 = 0 · fin MCP pm2 로그 `caller=strategy:parse` = 0 · stream-json tool_use 이름이 허용 목록 밖이면 실패." J2 같은 정의 · R-1 에 "분류 오류는 세 겹이 못 잡는다 → `READ_TOOLS`·`ADVISOR_ALLOWED_TOOLS` 변경 PR 은 9-1 · C3+(Q126)" |
| 9 | W6 L102 · R-1 L375 · §4-9 | "쓰기 차단은 CLI 인자 하나" · "목록이 빠지면 쓰기 34 가 열린다" | **정정(블로커)** | fin = `--allowedTools READ` + `--disallowedTools WRITE` + `--permission-mode dontAsk`(`claude-advisor.ts:771,784-786` · `advisor-tools.ts` `advisorToolArgs`) — 빠진 도구는 거부된다 · 열리는 것은 **허용 목록 분류 오류**와 **서버 사용자 settings allow 규칙**(#14) | R-1: "차단은 인자 셋(허용 목록 + dontAsk 기본 거부 + 거부 목록). 빠진 도구는 거부되나 허용 목록 분류 오류와 서버 사용자 settings allow 는 못 막는다. MCP 서버에 읽기 전용 모드는 없다" |
| 10 | §4-3 C1 · §5-1 · J2 | 읽기 도구 = 쓰기 0 | **정정(블로커)** | fin 분류 기준 = "원장·설정을 바꾸는 도구"(`advisor-tools.ts:43`) · 읽기 도구도 캐시를 쓴다(#5) | "쓰기 0" → "**원장·설정 쓰기 0**(fin `WRITE_TOOLS` · fit `ADVISOR_EXCLUDED_TOOLS` 정의 · 캐시 갱신 제외)" · §3-1 에 1줄 |
| 11 | §5-3 #2·#3 · Q118 | 소스 상수로 목록 생성 → 등록 집합과 대조 | 정정(보완) | ① fin `READ_TOOLS` 에 `WebSearch`·`WebFetch`(`advisor-tools.ts:39-40`) — 늘 차이 2 ② 접두는 mcp-config 서버 키(`mcp__myfinance__` · `mcp__myfitness__`) — 키가 다르면 dontAsk 가 전부 거부 | #2: "`mcp__` 접두 아닌 항목은 버린다" · #3: "mcp-config 서버 키 = `myfinance`·`myfitness` 확인" |
| 12 | §5-3 #4 | `--tools ""` 는 내장·Web 만 끄고 MCP 는 남긴다 | 확인 | `claude-advisor.ts:772-783` · fit 현행 | — |
| 13 | W4 · R-1 | 중첩 `claude`(`create_custom_strategy`)는 거부 목록으로 막는다 | 확인 | `mcp/tools/custom-strategy.ts:9,47` · `WRITE_TOOLS` 소속 · 사후는 #8 | — |
| 14 | §5-3 #4 · §3-4 | 중립 cwd 에서 로드되는 맥락은 `~/.claude/CLAUDE.md` 뿐 | 미확인 | 서버 사용자 `~/.claude/settings.json`(permissions.allow · hooks)도 로드된다 — allow 규칙은 #9 의 구멍 · 서버라 측정 불가(I-3) · `claudeMdExcludes` 는 cwd 밖이라 효과 없음 | #1: "서버 사용자 settings 에 `mcp__` allow 규칙·hooks 유무 판정만 출력" · 사용자 설정을 빼는 CLI 옵션 유무는 단계 1 에서 잰다 |
| 15 | §3 | 숫자는 실측 인용뿐 | 확인 | S1/S1b 열거와 일치 | — |
| 16 | §5-5 L284 | 실험 총액 6 × $0.50 = $3.00(누적 상한) | **정정(블로커)** | ① 호출당 상한은 넘을 수 있다 — fin `bot:ai_chat` 기본 $0.50 인데 p90 $0.587 · 실패 0(S1b) ② 재실험 1회 ③ J4 대조(`!ai`) 비용은 스크립트 밖 ④ 교차 질문은 턴이 늘어 예산 실패 → J1 거짓 음성 | "$3.00 은 **목표치** — 호출당 상한은 마지막 턴만큼 넘을 수 있다. 누적이 목표에 닿으면 다음 질문을 시작하지 않는다. 재실험·J4 대조는 따로 센다. 예산 초과 질문은 J1 '판정 불가'." 호출당 상한 값은 Q 로 |
| 17 | 여러 곳 | "쓰기 34" 5곳+ · "2/3" 4곳 | 정정(형식) | `workflow.md` 2절 — 같은 숫자 두 번 금지 | 숫자는 §3-1·§3-2 에만 · 나머지는 참조 |
| 18 | §4-4 D1 L160 · §8 L366 | "허용 사용자가 1명" | 정정 | S1 §6 이 잰 것은 `DISCORD_ALLOWED_USER_IDS` **키 하나**(두 앱 공유) — 사용자 수는 미측정 · 새 숫자 | "허용 사용자 키가 두 앱 공유 하나(사용자 수 미측정 — 단일 사용자 전제는 사용자 확인)" · §3-4 미측정 행 추가 |
| 19 | §4-5 L169 · R-3 | 통합 봇이 도메인 채널에 있으면 두 봇이 함께 답한다 | 확인(보완) | 앱 봇은 자기 채널만(`discord-interactions.ts` fin 86-87 · fit 98-99 · `chat.ts:144`) · 봇 메시지 무시(`chat.ts:196`) · fin fallback 순서 소비 → AI 거래 → AI 질문(`bot/discord/router.ts:139-148`) | R-3: "fin 채널에서는 앱 봇이 같은 문장을 소비·거래로 해석해 기록 흐름에 들어갈 수 있다" |
| 20 | §4-5 E-a2 · §4-6 F3 · §6 4c | 앱 봇 AI fallback 을 끄는 스위치(즉시) | **정정(블로커)** | AI 만 끄는 스위치는 없다(env grep 0) · 있는 것은 대화 채널 키 비우기(`DISCORD_CHANNEL_ID_*_CHAT` · fin `discord-interactions.ts:76-77`) = 메시지 수신 전체 · 기동 때만 읽음 | "AI fallback 만 끄는 스위치는 **새 코드**(두 앱 · 릴리즈 · 중간) — 만든 뒤에야 끄고 켜기가 즉시(재기동). 지금 키는 명령까지 끈다." 4c: "스위치 도입(중간) → 병행 → 끔(즉시)" |
| 21 | W3 L99 · §4-10 L233 · §5-4 L276 · R-2 | 중립 cwd 에서 빠지는 것은 TA 방법론 · TA 질문만 빼면 된다 | **정정(블로커)** | 빠지는 것: fin `SYSTEM_PROMPT` 13,752 B 전체(새 짧은 프롬프트로 대체) · `apps/finance/CLAUDE.md` 도메인 규칙 절 · rules `stock-trading-method.md` 5,001 B · `tax-logic.md` 1,077 B · `active-review.ts:106` 도 방법론을 이름으로 부름 · fit DB 프롬프트(`PromptVersion`) · J4 대조 `!ai` 는 프롬프트·WebSearch 가 있고 실험은 `--tools ""` | §5-4 제외 질문: TA·매매 방법론 · **세금** · 보유 전략 · 웹 검색 필요 질문. R-2·W3: 중립 cwd + 새 프롬프트가 빼는 것 전부. J4: "차이는 도메인 프롬프트·Web 없음의 효과일 수 있다" 를 판정에 적거나 대조를 단계 3 으로(Q119) |
| 22 | 서두 · §7 | 미결 Q114~ · 문서 번호 011 | 확인 | 저장소 최대 Q113(009) · specs 는 010 까지 | — |
| 23 | §4-9 I2 L221-223 | `check_env.py` 에 셋째 토큰·채널 키를 더해야 한다 | 정정 | 검사는 패턴(`DISCORD_BOT_TOKEN_[A-Z0-9_]+` · `DISCORD_CHANNEL_ID_[A-Z0-9_]+` · `tools/local/check_env.py:44,50,52`) — 이미 걸린다 · 빈틈은 `run.sh <fin\|fit>` 만 검사 | I2: "키 이름 규칙을 지키면 패턴이 덮는다. 할 일은 셋째 프로세스 로컬 기동도 `check_env` 를 거치게 하는 것 + 검증 봇 해시 등록(사용자)" |
| 24 | R-4 L378 | advisor-monitor 가 예산 초과를 1회에 알린다 | 정정 | 실험은 `claude` 직접 · `askAdvisor` 밖 → monitor 가 못 본다 | "실험 호출은 monitor 밖 — 스크립트가 누적 비용·예산 초과를 스스로 출력. monitor 는 쿼터 소진으로 크론이 실패할 때만" |
| 25 | §3-1 L79 · G1 | pm2 정의·배포 경로는 앱 둘만 안다 | 확인 | `deploy/pleiades.config.cjs:20-25` · `ssh-deploy.sh:38` · `deploy.sh:34-35` · `release-inplace.sh:152` · `deploy.yml:36` | — |
| 26 | §3-4 L114 | 서버 `MCP_PORT` 미측정 | 정정(부분) | fin 은 `deploy.sh:100` 이 mcp-config url 포트(4210)와 다르면 배포 거부 | "fin MCP 포트 = 4210(deploy.sh 강제) · fit 은 미측정" |
| 27 | §5-3 | (없음) 서버 CLI 실행이 운영 advisor 에 주는 영향 | 미확인 | #255(10-23 CLI 자동 업데이트로 별칭 모델 변경) — 실험이 업데이트를 앞당길 가능성은 코드로 판정 불가 | #4: 자동 업데이트를 끄는 env 를 실험 자식에(서버 CLI 버전에서 확인) · 실행 전후 CLI 버전 같음/다름 출력 |
| 28 | §3-4 · R-4 · Q125 | advisor 계정 쿼터 공유(X8) 미측정 | 확인 | 미측정으로 두고 사용자 확인으로 넘김 | — |
| 29 | §3-2 · J5 | fit 대화 p50 20.5 s · p90 78.7 s 를 기준선으로 | 확인(주의) | S1b · 표본 8 · J5 는 기록용 | J5 에 "(fit n=8)" |
| 30 | §5-7 #624 | `[advisor] ok` 줄에 `duration=` | 확인(보완) | `claude-advisor.ts:837,869,886,955` — fail 줄에도 · 소비자 0 | "ok·fail 줄 끝에 `duration=<ms>ms`" |
| 31 | §4-5 E-b | 버튼 인터랙션은 보낸 봇으로 간다(미실측) | 미확인 | Discord 규칙 · 초안이 미실측 표기 | 그대로 |

## 블로커 요약

- **#8·#9·#10 — 안전장치 틀을 다시 쓴다.** 쓰기는 "빠뜨림" 이 아니라 **분류 오류**와 **서버 settings allow** 로 열린다. 사후 검사는 MCP 로그 · `caller=strategy:parse` 로. "쓰기 0" = "원장·설정 쓰기 0".
- **#21** — 중립 cwd 가 빼는 지식은 TA 보다 넓다 · 질문 제외 범위 확대 · J4 재정의 또는 단계 3 으로.
- **#16** — $3.00 은 상한이 아니라 목표치.
- **#20** — AI 만 끄는 스위치는 새 코드(중간).
- #1·#2·#4 는 "앱 코드 0 · 배포 0 · 즉시" 표기 정정 — 로드맵 순서는 그대로(X1 권고 유지 가능).
