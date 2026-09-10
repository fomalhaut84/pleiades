# @pleiades/notify

myFinance · myFitness 의 아웃바운드 알림 전송 층. **포트(`Transport`) + 파사드(`Notifier`) + `TelegramTransport`.**
설계 정본은 pleiades `docs/specs/003-notify-package.md` §4 (L3 · 2층). 코드는 `packages/notify/src/`.

## 설치 (git 의존성 · 소비자 `package.json`)

```json
"dependencies": { "@pleiades/notify": "git+https://github.com/fomalhaut84/pleiades.git#<tag>" }
```

키는 반드시 `@pleiades/notify` 다 — 저장소 루트 `name` 은 `pleiades` 라서 키 없이 설치하면 `node_modules/pleiades` 로 들어간다.
설치 시 임시 클론에서 `prepare`(`tsc -p packages/notify`)가 돈다. **이 패키지는 런타임·peer 의존성이 없다** — grammy 도 참조하지 않는다.

## 사용

```ts
import { createNotifier, createTelegramTransport, csvEnv, html, Route } from '@pleiades/notify';

const notifier = createNotifier({
  transport: createTelegramTransport({ api: () => getBot().api }),   // 팩토리 — 봇을 첫 전송까지 만들지 않는다
  targets: {
    ALLOWED: csvEnv('TELEGRAM_ALLOWED_CHAT_IDS'),
    ADMIN: csvEnv('TELEGRAM_ADMIN_CHAT_IDS', { numericOnly: true }),  // fin 규칙(비숫자 토큰 탈락). fit 은 ADMIN 을 매핑하지 않는다
  },
});

if (notifier.targetCount(Route.ALLOWED) === 0) return;              // 가드는 호출부 몫
const result = await notifier.notify(Route.ALLOWED, html('<b>오늘 요약</b>'), { label: 'briefing' });
// result: { sent, failed, total, first?: { target, ref }, deliveries: [{ target, ok, ref?, error? }] }
```

- **재시도** — 네트워크 오류만 `[2000, 8000, 30000]`ms 백오프, 총 4회.
- **폴백** — 텔레그램 HTML 파싱 실패 시 같은 청크를 태그만 벗겨(`plain`) 즉시 재전송. 재시도 예산은 보존된다.
- **분할** — `Transport.maxLength`(텔레그램 4096) 로 코어가 줄 경계 분할. 청크마다 재시도·폴백. `components`(inline keyboard 등)는 마지막 청크에 붙고 `ref` 는 그 청크의 것이다.
- **로그** — `[<label>] 전송 재시도 …` · `[<label>] 메시지 전송 실패 (<target>): …` (토큰 마스킹). **`deliveries[].error` 는 raw `message` 라 봇 토큰이 들어 있을 수 있다** — 로그·DB·API 응답에 쓰기 전 `sanitizeMessage` 를 거친다.
- **수신자** — `csvEnv(name)` 은 문자열 유지(fit 규칙). `csvEnv(name, { numericOnly: true })` 는 fin 규칙(비숫자 토큰 탈락 + `Number` 정규화).
- **Route → Transport** — `transport` 에 단일 값 대신 `{ ALLOWED: …, ADMIN: … }` 맵을 주면 라우트별로 다른 채널을 쓴다.

## 어댑터 계약 (`Transport`)

`maxLength` 가 **유한**이면 코어가 분할·재시도·폴백을 소유하고 `send` 는 청크 1건(멱등 단위)이어야 한다.
**`Infinity`** 면 어댑터가 그 셋을 전부 소유하고 코어는 `send` 를 한 번만 호출한다. 두 형태를 섞지 않는다.

## 검증 (pleiades 루트)

```bash
npm --prefix packages/notify install
npm run typecheck && npm run typecheck:test && npm test && npm run build
```

## 되돌리기

1a-3(myFitness 교체) 착수 전까지 소비자가 없으므로 PR revert 1회로 **즉시** 되돌아간다.
