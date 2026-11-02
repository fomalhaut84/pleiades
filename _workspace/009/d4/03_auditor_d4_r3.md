# 009 D-4 초안 4회차 감사 — 판정

대상 `02_writer_d4_r4.md` · HEAD `fb1ed86` · 읽기 전용 · 서버·서비스 DB 접근 0 · `claude` 실행 0 · 스크립트는 존재하지 않아 전부 코드 판독.
**블로커 1 · 정정 6(블로커 포함) · 경미 8.** 답 반영(UQ-8 R-b · F-b · J-A · N15=41)은 일관하다. 어긋난 것은 새 비교 수단 절이다.

## 정정
1. **(블로커) §7-1 ⑥ T-a: fit "현행 복사" 초안은 화면에서 저장 불가.** `PromptDetailClient.tsx:72,107,320` — 본문이 active 와 같으면 `dirty=false` 라 버튼이 꺼진다. 시험은 초안만 받는다(`trial.ts:75-76`). 남는 길: API `POST /api/prompts/system/versions`(서버 명령 0 전제 파기) · 한 글자 변경(같은 입력 아님).
2. **쓰기 잔여에 `get_prices` 누락.** `market.ts:23`(skipCache 는 지수만) · `price-fetcher.ts:104-111` upsert 의 create 분기로 임의 티커 새 행. 프롬프트 `:85` 가 `get_prices` 를 지시한다. 이것까지 빼면 프롬프트 지시와 충돌한다.
3. **"프록시는 CLI 동작에 기대지 않는 유일한 겹"은 과장.** 프록시 경유 자체가 `--mcp-config`·`--strict-mcp-config` 라는 CLI 동작에 기댄다. 운영 MCP 4210 인증 없음. JSON-RPC 배열 원소별 검사 필요. 시간 초과·kill·예산 초과면 스트림 불완전 → 사후 검사 구멍 · 프록시 계수가 정본 · 양식에 "판정 불가" 칸 필요. 사용자 수준 MCP 설정·WebFetch 의 localhost 처리 미측정.
4. **"운영 무영향" 누락.** `deploy.lock` 은 `discord-switch.sh:197`·`discord-inbound.sh:233` 도 쓴다 — 비교 중 되돌리기가 거부된다 · Release 겹치면 `release-inplace.sh:173` rc 1 · fd 상속으로 고아 프로세스가 자동 배포를 막을 수 있다(`:31`) · 같은 AI 계정 공유(사용량 미측정) · 운영 MCP 로그 증가 · 크론 회피가 전체 구간을 비우지 못한다 · 디스크 사전 검사 없음(#391).
5. **clone 절차가 그대로는 안 돈다.** `--no-tags --single-branch` 에 태그·PR head 없음 · PR-1 이 PR-0 위여야 한다 · `--purge` 가 clone 을 안 지워 재실행 실패.
6. **입력 재현표 "운영과 차이 없음" 과장.** 부모 env(pm2 ↔ 사용자 셸) · cwd 경로별 CLI 상태 미측정 · 스텁 범위 부족(`@pleiades/notify` dist · `trade-service` 등 앱 코드 · archive 에 `node_modules` 없음).

## 판정 요약
확인: 57 = 쓰기 34 + 읽기 23(구현 기준 · `server.tool` 57 차집합 0) · fit 27 읽기(제외 `generate_training_plan`) · 제외 인자·앱 문서 · 예산 fin 편당 $4.95 · 초안이 sync 에 안 끼침(`sync-plan.ts:27-29,34,40`) · `pendingCodeDefault` 표시 충돌 없음 · 시험 부작용(`PromptRun` 행 · 동시 1건) · fit 호출 비용 상한 플래그 없음 · 초안 삭제 경로 없음 · 비공개 경로.

## 사실: 비용 대비 범위 (권고 아님)
| 항목 | 값 |
|---|---|
| 고치는 줄 | 41 |
| 그중 AI 입력 | 15 = A 10 + `:162,163` + `CLAUDE.md` 3 |
| fin 비교가 덮는 입력 | 9 |
| fit 시험이 덮는 입력 | 1(어드바이저 경로 제외) |
| 덮지 못하는 입력 | 5 = `server.ts:451` + `spending.ts` 4 — 전용 판정 경로 없음 |
| 새 파일 | 최소 4 + 기존 수정 3 |
| AI 호출 | fin 18 · fit 4 |
| 예산 상한 | fin $9.90 · fit 플래그 없음 |
| 운영 DB 잔류 | fit 초안 2 + 시험 4 · fin 캐시 upsert |
| 새 실패 경로 | 12(https · fetch · 번들 · dump · 프록시 · MCP · CLI 옵션 · 시간 초과 · 예산 · 스트림 · 락·fd · 디스크) |
| 미실측 전제 | `dontAsk` 거부 · 프록시-CLI 호환 · 스텁 번들 · 서버 https · 플랜 사용량 |

## 사실: 기존 운영 — fin AI 의 쓰기 도구 허용 (D-4 별건)
| 항목 | 사실 |
|---|---|
| 허용 범위 | 모든 호출이 같은 57 + WebSearch·WebFetch(`claude-advisor.ts:826`) · 호출별 축소 옵션 없음 |
| 권한 | `--permission-mode dontAsk` + 허용 목록 · 실제 동작 미측정 |
| 막는 것 | 프롬프트 지시뿐(`system-prompt.ts:90-122,178-183`) · MCP 쪽 확인 단계 없음 · 봇 확인 버튼은 파서 경로 |
| 사람 없는 호출 | 크론 브리핑·리뷰·월간·TA·분기 리뷰 · 외부 웹을 읽는다 |
| 웹 내용 주입 관점 | 외부 페이지 본문과 쓰기 34 가 같은 세션 · 실제 시도 사례 미측정 |
| 외부 파급 | `create_transaction` → Whooing(`spending.ts:237`) |
| 주석 | `:487` "읽기 전용"은 거짓 |
| 흔적 | MCP 로그에 남는다 · 쓰기 호출 경보 없음 |
| 대비 | fit 은 mutating 제외(`advisor-tools.ts:2-5,39`) |

## 경미
1. "런북 그대로" → "준용"(허용 도구·장 1개·fit 비동시·자유 질문 없음). 2. fit 웹 경유 조회의 하위 lib 미추적. 3. stderr 행선지 · 잔류 기한. 4. 크기 참고(대장 밖). 5. blob 대조는 `news-rules.ts` 변경을 못 본다 — dump 해시가 실제 입력. 6. 스텁 번들 테스트는 CI 밖. 7. 부분 되돌림의 `CLAUDE.md` 포함 여부. 8. 트리 이름 중립화.
