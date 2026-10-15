# tools/local — apps/* 로컬 실행

`apps/finance`·`apps/fitness` 를 pleiades 로컬에서 서비스와 격리해 돌리는 도구다(006 §4-5 L-1~L-9 · `.claude/rules/isolation.md`).
**서비스 봇 토큰 · 서비스 DB · 서버 · Garmin·Whooing·MFDS 계정은 어디에도 넣지 않는다.**

| 파일 | 하는 일 |
|---|---|
| `db.py` | `pleiades_fin`·`pleiades_fit` 만 create · drop(`--confirm <이름>`) · status (L-1 · I-14) |
| `env/<app>.env` · `write_env.py` | 루트 템플릿 → `apps/<app>/.env` (덮어쓰지 않음 · 0600) (L-2) |
| `run.sh` | 앱 명령의 유일한 입구 — cwd · precheck · claude shim PATH · 실효 env 검사(`check_env.py`) |

## 처음 한 번 (M-2 · M-4)

```bash
python3 tools/local/write_env.py fin && python3 tools/local/write_env.py fit
python3 tools/local/db.py create fin && python3 tools/local/db.py create fit
tools/local/run.sh fin -- npm ci && tools/local/run.sh fit -- npm ci
tools/local/run.sh fin -- npx prisma migrate deploy && tools/local/run.sh fit -- npx prisma migrate deploy
tools/local/run.sh fin -- npm run build && tools/local/run.sh fit -- npm run build
```

검증 봇(L-4): 사용자가 BotFather 로 **앱마다 다른** 검증 봇을 만들고 토큰·검증 채팅 id 를 `apps/<app>/.env` 에 **직접** 넣는다(채팅·저장소에 토큰을 남기지 않는다). 기동 때 봇 id(토큰 `:` 앞 숫자 · 공개값)와 채팅 id 를 허용 목록으로 넘긴다 — 없으면 `check_env` 가 막는다.

## 플랫폼 설정 — 루트 `.env` (M-6a-2 · #143)

pleiades 가 소유한 설정(알림 채널 스위치 `NOTIFY_*` · Discord 웹훅 `DISCORD_WEBHOOK_*`)은 **pleiades 루트 `.env`** 에 둔다 — 앱이 늘어도 한 곳에서 관리한다. 템플릿은 `.env.example`(`cp .env.example .env` 후 값 직접 기입 · gitignore).

- **앱이 직접 읽는다** — `@pleiades/notify` 의 `platformEnv` 가 cwd 에서 위로 `package.json` 의 name 이 `pleiades` 인 곳의 `.env` 를 찾는다. 그래서 `run.sh` · `npm run dev` · `next start` · pm2 어느 쪽으로 띄워도 같다. 디렉터리 구조가 다르면(서버 배포 등) `PLEIADES_ENV_FILE=<경로>` 로 지정한다.
- `run.sh` 밖(`npm run dev` · pm2)으로 띄우면 `check_env` 가 돌지 않는다 — 앱 `.env` 에 플랫폼 키를 두지 않았는지 스스로 확인한다.
- **플랫폼 키만 읽는다** — 루트 `.env` 에 다른 키(봇 토큰 · DB URL)가 있어도 앱으로 가지 않는다. 앱 고유 설정은 계속 `apps/<app>/.env`.
- 우선순위: 프로세스 env(셸 `export` · pm2 `env`) → 루트 `.env`. **플랫폼 키를 앱 `.env` 에 두면 루트 값을 가리므로 `check_env` 가 막는다.**
- 비워 두면 알림은 텔레그램(지금과 같다). `NOTIFY_ALLOWED_CHANNEL=discord` 면 fin → `#finance` · fit → `#fitness` · fin `NOTIFY_ADMIN_CHANNEL=discord` 면 관리자 알림 → `#admin`. 키보드 메시지·`/브리핑` 응답·분기 PDF 는 항상 텔레그램.
- 값을 해석할 수 없으면(따옴표 짝 · 닫는 따옴표 뒤 글자) 앱 로그에 `[notify] 루트 .env 값을 해석할 수 없어 무시한다 — <키>` 가 한 번 찍히고 그 키는 없는 것으로 친다. 웹훅 URL 형식이 틀려도 그 채널 수신자는 0 이다 — Discord 에 안 오면 이 둘부터 본다.
- 앱 테스트(vitest)는 `PLEIADES_ENV_FILE` 을 없는 경로로 고정한다 — 개발 PC 의 루트 `.env` 가 테스트로 새지 않는다.
- 되돌리기: 루트 `.env` 의 키를 지우거나 비운다(**즉시** — 파일 수정 시각이 바뀌면 실행 중인 웹·봇도 다음 알림부터 다시 읽는다 · 재시작 불필요).

## 기동 (M-4)

**네 명령은 모두 끝나지 않는 프로세스다** — 터미널 4개에서 각각 돌리고 **터미널마다 `export` 를 다시 한다**(또는 같은 셸에서 `&` 로 백그라운드 · 로그는 파일로). 위에서부터 그대로 붙이면 첫 줄에서 멈춘다(PR #123 Codex P2).

```bash
export PLEIADES_VERIFY_BOT_IDS=<fin 봇 id>,<fit 봇 id> PLEIADES_VERIFY_CHAT_IDS=<검증 채팅 id,…>
tools/local/run.sh fin -- npm run start -- -p 4610      # 웹 — Next 는 .env 의 PORT 를 쓰지 않는다 → -p 필수
tools/local/run.sh fit -- npm run start -- -p 4620
tools/local/run.sh fin -- node dist/bot/standalone.cjs  # 봇 — long polling · 크론·알림 스케줄러 등록
tools/local/run.sh fit -- node dist/bot/standalone.cjs
```

- 포트: 4100·4200·4210·4301·3000 금지(L-3). MCP 서버는 띄우지 않는다(fin `mcp-config.json` 이 4210 하드코딩).
- advisor 는 막혀 있다(L-7) — fit `CLAUDE_BIN=/nonexistent/…` → `ENOENT` 로그 · fin 은 `run.sh` 의 PATH shim.
- `next start` 는 **모든 인터페이스(`*:<port>`)** 에서 받는다 — 같은 LAN 에서 접근 가능하다.
- 정지: 프로세스 kill. 되돌리기: `db.py drop <app> --confirm pleiades_<app>` · `rm apps/<app>/.env`.
- 409 가 나면 같은 토큰이 다른 곳에서 polling 중이다 — **즉시 정지**(서비스 토큰이면 서비스 수신이 끊긴다 · ⑮).

첫 기동 실측: `docs/research/measured-facts.md` *2026-10-01 — M-4*.
