# 인계 노트 — 2026-10-29(저녁), 009 D-3 PR-1a 소비·거래 판단 분리

직전 노트: `2026-10-29-d2prime-script-d3-design.md`. **이 노트가 최신이다.**

## 이 세션에서 한 일

**서비스 영향: 0 — https 읽기만**(서비스 저장소 쓰기 0 · Claude 서버 접근 0 · 운영 봇·DB·외부 계정 접촉 0 · Release 0). **로컬 격리 자원: 0** — 원격 컨테이너 세션이라 `pleiades_fin` DB·봇·웹 기동 없음. `apps/finance/node_modules` 설치와 더미 URL `prisma generate` 만 했다(컨테이너와 함께 사라진다).

| # | 이슈 → PR | 내용 |
|---|---|---|
| 1 | #382 → **#383**(열림 · head `ccr-0ffbc632-w26qlq` · base `dev`) | **D-3 PR-1a — 소비·거래 판단 분리.** 커밋 3개(아래) |
| 2 | (이 노트) | 같은 브랜치에 커밋 — 세션 지정 브랜치가 하나라 PR #383 에 함께 실린다 |

PR #383 의 커밋은 다음과 같다.
- **`b21012c` 특성 테스트 (리팩터 전 코드에서 통과)** — `expense-telegram.test.ts` 55 · `trade-telegram.test.ts` · 가짜 Bot/ctx `telegram-fake.ts`. 기준은 **grammY 호출열 동등**(이름 · 인자 · 순서)이다. 호출 순서를 하나 바꿔 실패하는 것도 확인했다(`tx:cancel` 2건 실패 → 원복).
- **`ad02747` 판단 분리** — `core/reply.ts`(BotReply · ReplyOutput · ButtonOutput 단계 열 `toast`·`removeButtons`·`edit` · Requester `userId`·`dbUserId` · ButtonPress · `isSameRequester`) · `core/state-key.ts` · `utils/telegram-reply.ts` · `expense.ts`·`trade.ts` 의 `decide*` · 정규식 상수 3(`INCOME_RE`·`BUY_RE`·`SELL_RE`). **특성 테스트를 수정 없이 통과.** 판단 계약 테스트 `expense-trade-decide.test.ts` · `core/__tests__/reply.test.ts`.
- **`d0b53ad` 9-1 리뷰 info 5 반영** — typing 5 s 주기·`.finally` 해제 · 끝나지 않는 AI 테스트의 타이머 누수 · 버튼 인자 `toStrictEqual` · `multi` 요청에 `from` 이 없는 경계.

검증 결과(원격 컨테이너):
- `npm run lint` 오류 0 · `npx tsc --noEmit` 통과 · `npx vitest run` 69 파일 · 1141 통과
- **로컬 빌드는 하지 않았다**(`pleiades_fin` 없음 · 로컬 DB 생성은 격리 경계)
- 테스트는 `run.sh` 를 거치지 않고 앱 cwd 에서 직접 돌렸다. 앱 `.env` 가 없어 `check_env` 가 멈추기 때문이다. 셸에 DB·토큰 env 가 없는 것을 먼저 확인했다.
- **CI 5개 전부 통과**(`apps-fin` 빌드 포함 · `apps-fin-test` · `apps-fit` · `verify` 20·24) — 2026-10-29 18:47 KST
- 9-1 에이전트 리뷰: critical/major 0 · info 5 → 전부 반영. 이전·이후 코드를 한 줄씩 대조했고 텔레그램에서 보이는 차이는 0
- **Codex 봇 리뷰: 미도착** — PR 오픈 18:45 KST, 이 노트 작성 18:51 시점 0건. 30분 컷오프 판정은 아직 하지 않았다

## 결정된 것

| | 결정 | 누가 |
|---|---|---|
| PR-1a 수단 | 설계 r3 §4 그대로. 버튼 단계 열 = 지금 핸들러 호출 순서 · pending 키 = `<플랫폼 메시지 키>:<txId>` · pending 값에 `dbUserId`(텔레그램 = `"<from.id>"` 그대로) · 비교 쪽 `from` 없음 = 거부 | 설계 PR #379 · 이 PR |
| 텔레그램 키보드의 끝 빈 행 | 히스토리 추천 키보드의 끝 `[]` 를 응답 모델에 그대로 둔다(호출열 동등). Discord 어댑터(PR-3)가 버린다 | 이 PR(`core/reply.ts` `ReplyButtonRows` 주석) |
| 로컬 빌드 | 사용자가 내일 로컬에서 빌드해 보고 이어간다 | 사용자 2026-10-29 |

## 결정되지 않은 것

| | 내용 | 언제 |
|---|---|---|
| **PR #383 머지** | 로컬 빌드 확인(사용자) · Codex 봇 리뷰(미도착이면 9-3 컷오프 — 재요청 1회 → 30분 → "미게시" 판정) · 9-6 PR body 확정 | 다음 세션 |
| C-11 실사용 결과 · D-2′ 실행 | 이전 노트 그대로(10-31 16:57 전/뒤) | 사용자 |
| D-3 착수 직전 측정 X-1~X-6 | 이전 노트 그대로(X-2·X-3 은 PR-3 전) | — |
| 기존 미결 | #365(2번) · #368 · #373 · #359 · #333 | 그대로 |

## 다음 세션의 첫 액션 후보

1. **PR #383 마무리** — 로컬 빌드 결과(사용자) → Codex 봇 리뷰 확인(`pleiades-codex-loop` · 안 왔으면 `@codex review` 1회 → 30분 컷오프) → 9-6 body 확정 → 사용자 머지. 되돌리기: revert(**즉시** · 릴리즈 전).
2. **D-3 PR-1b — `ai.ts` 판단 분리**(PR #383 머지 뒤 · 순차). 범위:
   - AI fallback 분기 · `aitrade:` · AI 대화 응답(분할·HTML 폴백 T14)
   - `chatBusy`·`chatSessions` 키를 상태 키(`core/state-key.ts` `telegramStateKey`)로 — UQ-4 플랫폼별 동시
   - `/ai` 인자 · `/reset` · typing 자리
   - 특성 테스트 T8~T10 · T13 · T14 · T17(`aitrade:`) · T18 **먼저**
   - 이번 PR 의 `telegram-fake.ts` 를 재사용한다
   - 되돌리기: revert(**즉시** · 릴리즈 전).
3. C-11 결과 → D-2′ 실행 판정 기록(#358).

## 주의사항

- **서비스 영향 0 원칙** — 이 세션 0 · 로컬 자원 0.
- **세션 시작 관측:** dev `706f018` · 열린 PR 0 · 서비스 dev 끝 fin `3685b2ca138c`·fit `35a04d78e532`(인계의 마지막 수용과 같음 · 서비스 동결). 이 원격 클론은 shallow 라 `Service-Dev` 트레일러 대조가 빈 값으로 나왔다(판정 불능이지 "미수용" 이 아니다). 이 컨테이너에는 `gh` 가 없어 Actions secrets 점검(I-9)을 못 했다. **인계보다 현재 상태를 믿는다.**
- **PR #383 에 이 인계 노트 커밋도 실린다.** 세션 지정 브랜치가 하나뿐이라서다. 문서 변경이라 리뷰 범위에 영향은 없다.
- 특성 테스트의 "현재 동작" 테스트 3종은 서비스 유래 결함을 **정답으로 고정**한다.
  - 확정 뒤 원본 수정에 실패하면 "실패" 를 띄우는 거짓 안내 — `tx:`·`multi:`·`trade:`
  - plain 안의 `escapeHtml`(`&amp;`) — 계좌·종목 안내
  - 히스토리 키보드 끝의 빈 행
  - UQ-3 에 따라 고칠 때는 **특성 테스트 커밋 뒤 별도 커밋**으로 그 테스트를 함께 바꾼다.
- `apps/finance` 의 `tsc` 는 `prisma generate` 가 선행되지 않으면 MCP 도구 파일에서 수십 건 실패한다. 우리 변경과 무관하다 — 더미 `DATABASE_URL` 로 generate 하면 0 이 된다.
- `apps/finance/.claude/skills` 가 세션 중 발견 목록에 떴다(파일을 읽으면 지연 로드된다). **실행하지 않았다**(I-10).
- 서브에이전트 산출은 그대로 믿지 않는다 — 이번 9-1 리뷰도 이전·이후 비교를 직접 하게 했다.
- `MEMORY.md` — 이 원격 컨테이너에는 메모리 디렉터리가 없어 갱신하지 않았다. 로컬 세션에서 색인 한 줄이 필요하면 추가한다. 응답은 한국어.

## 재현이 필요한 절차

- **원격 컨테이너에서 fin 검증(DB 없이):**
  1. 루트 `npm ci` → `npm --prefix packages/chat ci` → `npx --no-install tsc -p packages/chat`
  2. `cd apps/finance && npm ci`
  3. `DATABASE_URL=postgresql://x:x@127.0.0.1:1/none npx prisma generate`
  4. `npx tsc --noEmit` · `npm run lint` · `npx vitest run`
  5. 빌드는 CI `apps-fin` 또는 로컬 `run.sh fin -- npm run build`(`pleiades_fin` 필요)
- **특성 테스트 패턴(PR-1b·PR-2 재사용):** `captureBot(register*)` 로 핸들러를 잡는다 → `fakeCtx({ text | data, messageId, fromId })` → `calls` 줄을 `toEqual` 로 비교한다.
  - pending 은 모듈 전역이라 메시지 id 를 매번 새로 받는다(`sentIds`).
  - 만료는 `vi.useFakeTimers({ toFake: ['Date'] })` 로, typing 주기는 `['setInterval','clearInterval']` 로 본다.
  - fire-and-forget 은 `flush()` 로 흘린다.
