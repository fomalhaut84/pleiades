# @pleiades/notify

pleiades 앱(fin · fit)의 아웃바운드 알림 전송 층. **포트(`Transport`) + 파사드(`Notifier`) + Discord transport(웹훅 · 봇).**
설계 정본은 pleiades `docs/specs/003-notify-package.md` §4 (L3 · 2층). 코드는 `packages/notify/src/`.

## 설치 (git 의존성 · 소비자 `package.json`)

```json
"dependencies": { "@pleiades/notify": "git+https://github.com/fomalhaut84/pleiades.git#<ref>" }
```

**`<ref>` 는 태그가 아니다 (2026-09-30 · #88).** 첫 릴리즈(태그)는 두 저장소가 모노레포로 들어온 뒤라 그 전의 소비자는 태그를 참조할 수 없다 — 참조 방식(커밋 SHA 고정 등)은 003 §10 **Q48** 이 1a-3 착수 시 정한다.

키는 반드시 `@pleiades/notify` 다 — 저장소 루트 `name` 은 `pleiades` 라서 키 없이 설치하면 `node_modules/pleiades` 로 들어간다.
설치 시 임시 클론에서 `prepare`(`tsc -p packages/notify`)가 돈다. **이 패키지는 런타임·peer 의존성이 없다.**

## 사용

```ts
import { createDiscordBotTransport, createDiscordTransport, createNotifier, html, Route } from '@pleiades/notify';

// 텍스트 알림 — 채널 웹훅(별칭 → URL). 웹훅이 비면 대상 0.
const notifier = createNotifier({
  transport: () => createDiscordTransport({ webhooks: () => ({ finance: process.env.DISCORD_WEBHOOK_FINANCE ?? '' }) }),
  targets: { ALLOWED: () => (process.env.DISCORD_WEBHOOK_FINANCE ? ['finance'] : []) },
});

if (notifier.targetCount(Route.ALLOWED) === 0) return;              // 가드는 호출부 몫
const result = await notifier.notify(Route.ALLOWED, html('<b>오늘 요약</b>'), { label: 'briefing' });
// result: { sent, failed, total, first?: { target, ref }, deliveries: [{ target, ok, ref?, error? }] }

// 버튼 메시지 — 봇 토큰으로 채널에 보낸다(웹훅은 버튼을 거부한다). 버튼은 중립 `ButtonRows`.
const buttons = createNotifier({
  transport: createDiscordBotTransport({ token: () => botToken, channels: { finance: channelId } }),
  targets: { ALLOWED: () => ['finance'] },
});
await buttons.notify(Route.ALLOWED, html('확정할까요?', [[{ label: '✅ 확정', action: 'vest:confirm:r1' }]]));
```

- **본문** — `html()` 의 HTML 부분집합을 Discord 마크다운으로 바꿔 보낸다(`htmlToDiscordMarkdown` · 2000자 분할은 어댑터).
- **재시도** — Discord transport 가 소유한다(연결 실패 · 429 `retry_after`).
- **코어 분할·폴백** — `Transport.maxLength` 가 유한한 transport 에만 쓰인다(지금 transport 는 전부 `Infinity`). 줄 경계 분할 · 청크마다 네트워크 재시도 `[2000, 8000, 30000]`ms · HTML 파싱 실패 시 `plain` 재전송.
- **로그** — `[<label>] 메시지 전송 실패 (<target>): …` (비밀 마스킹). **`deliveries[].error` 는 raw `message` 라 비밀이 들어 있을 수 있다** — 로그·DB·API 응답에 쓰기 전 `sanitizeMessage` 를 거친다.
- **Route → Transport** — `transport` 에 단일 값 대신 `{ ALLOWED: …, ADMIN: … }` 맵을 주면 라우트별로 다른 transport(웹훅 · 봇)를 쓴다.
- **플랫폼 설정** — 앱은 `platformEnv(name)` 으로 pleiades 루트 `.env` 의 `DISCORD_*` 를 읽는다(프로세스 env 우선).

009 D-5 B5 (pleiades#515): 옛 채널 transport 와 그 버튼 객체(`inline_keyboard`)는 지웠다.

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
