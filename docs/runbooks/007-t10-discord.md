# 런북 — T-10 Discord 승계 (007 Q80 · #314)

검증 Discord 서버·봇을 운영으로 올리고, 두 앱의 아웃바운드 알림을 텔레그램에서 Discord 로 한 번에 넘긴다.
**서버 단계는 사용자가 실행하고, 세션에는 판정 양식 블록만 붙인다**(Claude 는 서버에 닿지 않는다 · I-3).

| | 값 |
|---|---|
| 결정 | 라우트 셋(ALLOWED · ADMIN · INTERACTIVE)을 **한 번에** · 배포 알림(#304)은 **Discord 별도 채널** (사용자 2026-10-27) · 텔레그램+Discord 동시 모드 없음(사용자 2026-10-22) |
| 실행기 | `deploy/discord-switch.sh <check\|on\|off>` — `v1.0.7` 이후 체크아웃(`~/pleiades-fin`)에 있다 |
| 바뀌는 것 | 플랫폼 설정 `~/pleiades-platform.env` 의 스위치 4줄(`NOTIFY_ALLOWED/ADMIN/INTERACTIVE/DEPLOY_CHANNEL`) · 두 앱 봇 재시작 |
| 바뀌지 않는 것 | 텔레그램 고정 경로(키보드 메시지 · `/브리핑` · fin 분기 PDF) · 봇 명령(인바운드) · 웹 · MCP · 앱 `.env` |
| 되돌리기 | `deploy/discord-switch.sh off` — 스위치 4줄 비움 + 봇 재시작(**즉시**) |

## 0. 전제

- `v1.0.7`(이 스크립트 · 배포 알림 Discord 경로)이 두 체크아웃에 배포돼 있다.
- 크론 시각을 피한다 — 매시 :00 · fin 15:35·15:40 · 월 07:00 · fit 웹 싱크 정각 · 미국장 브리핑 23:00. 봇 재시작은 두 봇 합쳐 수 초다.
- 웹은 플랫폼 설정의 수정 시각으로 다시 읽으므로 재시작하지 않는다. 봇은 gateway 가 기동할 때만 설정을 보므로 스크립트가 재시작한다(#157).

## 1. Discord 쪽 준비 (사용자 · Discord 앱)

검증 서버를 그대로 운영으로 쓴다(Q80).

1. 채널 넷: fin 알림 · fit 알림 · 관리자(fin ADMIN) · **배포(새로)**. 채널마다 웹훅 하나씩 → URL 4개.
2. 봇 둘(fin · fit — M-6b 검증 봇 그대로): 각자 자기 앱 채널에 *채널 보기 · 메시지 보내기* 권한.
3. 버튼을 누를 사용자 ID(개발자 모드 → 프로필 → ID 복사). 허용 = 사용자 AND 채널.

## 2. 로컬 정리 (사용자 · Q80)

검증 봇 토큰과 웹훅이 이제 운영 것이다 — 로컬에서 같은 토큰으로 gateway 를 띄우거나 로컬 테스트 알림이 운영 채널로 가지 않게 한다.

- 로컬 루트 `.env` 의 `DISCORD_*` 값을 **비우거나**, 새로 만든 로컬 검증 봇·검증 채널 웹훅으로 바꾼다.
- 로컬에서 도는 봇 프로세스가 없는지 확인한다(`tools/local` 의 pm2 리허설 포함).

## 3. 서버 — 값 넣고 점검

`~/pleiades-platform.env`(600)를 편집기로 열어 **값 9개**를 채운다. 스위치 4줄은 비워 둔다(스크립트가 켠다). 키 이름은 루트 `.env.example`.

```
DISCORD_WEBHOOK_FINANCE · DISCORD_WEBHOOK_FITNESS · DISCORD_WEBHOOK_ADMIN · DISCORD_WEBHOOK_DEPLOY
DISCORD_BOT_TOKEN_FINANCE · DISCORD_BOT_TOKEN_FITNESS · DISCORD_CHANNEL_ID_FINANCE · DISCORD_CHANNEL_ID_FITNESS
DISCORD_ALLOWED_USER_IDS
```

```bash
cd ~/pleiades-fin && deploy/discord-switch.sh check
```

- 권한 600 · 키 9/9 · 형식 오류 0 · 웹훅 4개·봇 채널 2개에 점검 메시지 1건씩 → Discord 채널 여섯 곳에 `🔧 pleiades T-10 점검 메시지` 가 왔는지 눈으로 본다.
- 양식에 "참고: 배포 웹훅이 … 와 같다" 가 있으면 배포 채널이 따로가 아니다 — 1-1 로 돌아간다.

## 4. 서버 — 켜기

```bash
cd ~/pleiades-fin && deploy/discord-switch.sh on --no-send   # 3 을 방금 통과했으면 --no-send (점검 메시지를 다시 보내지 않는다)
```

스크립트가 하는 일: 점검 → 배포 락(자동 배포와 겹치지 않게) → 플랫폼 설정 백업(`~/pleiades-private/platform-env-<시각>.bak`) → 스위치 4줄 `discord` → `pleiades-fin-bot`·`pleiades-fit-bot` 재시작 → 두 봇 로그에 `gateway 준비 완료` · 종료 코드 0 · 미설정 0.

| 결과 | 뜻 | 할 일 |
|---|---|---|
| 통과 (rc 0) | 승계됨 | 5 |
| 중단 (rc 1) | 바꾸기 전에 멈췄다 | 양식의 이유(키 · 권한 · 락)를 고치고 다시 |
| 판정 실패 (rc 3) | 스크립트가 **이미 텔레그램으로 되돌렸다** | 봇 줄 확인 — 종료 코드 = 토큰·권한 · 미설정 = 키 |

## 5. 첫 실알림 확인 (사용자 · 며칠에 걸쳐)

라우트마다 **첫 실알림 1건**이 Discord 에 오고 텔레그램에는 오지 않는지 본다. 판정은 #314 에 한 줄씩.

| 라우트 | 무엇으로 확인 |
|---|---|
| ALLOWED (fin · fit) | 다음 정기 알림(fin 크론 알림 · fit 아침 알림) |
| ADMIN (fin) | 다음 관리자 알림(AI 실패 · 예산 등 — 일어날 때) |
| INTERACTIVE | fit 자동조정 · fin RSU 베스팅 버튼 메시지 — 일어날 때 버튼을 눌러 처리되는지 |
| DEPLOY | 다음 릴리즈의 자동 배포 알림(Discord 배포 채널 · 실패하면 텔레그램으로 대신 온다) |
| 텔레그램 고정 | `/브리핑` 응답 · 키보드 메시지는 여전히 텔레그램 |

## 6. 되돌리기

```bash
cd ~/pleiades-fin && deploy/discord-switch.sh off
```

스위치 4줄을 비우고 두 봇을 재시작한다 → 모든 알림이 텔레그램으로. 값 9개는 남는다(다시 `on` 할 수 있다). 파일 전체를 되돌릴 때는 `~/pleiades-private/` 의 백업을 쓴다.

- 백업(`platform-env-<시각>.bak` · 600 · 비밀 포함)은 실행마다 쌓인다 — 승계가 안정되면 지운다(`rm ~/pleiades-private/platform-env-*.bak`).
- 스크립트는 스위치 줄을 `KEY="값"` 으로 다시 쓴다(그 줄의 `export` 접두·줄 끝 주석은 사라진다 · 다른 줄은 그대로). 플랫폼 설정이 심링크면 rename 으로 일반 파일이 된다 — 실파일로 둔다.

## 판정 양식 예

```
=== 판정 양식 (이 블록만 세션에 붙인다) ===
CMD on --no-send
   플랫폼 설정 권한 600
   스위치 ALLOWED=telegram ADMIN=telegram INTERACTIVE=telegram DEPLOY=telegram
   키 9/9 채움
   형식 오류 0 · 해석 불가 줄 0
   버튼 허용 사용자 1명
   시험 전송 생략(--no-send)
   백업 ~/pleiades-private/platform-env-20261027-101500.bak
   스위치 ALLOWED=discord ADMIN=discord INTERACTIVE=discord DEPLOY=discord
   봇 재시작 · online: 예
   fin 봇 gateway 준비 1 · 종료 코드 0 · 미설정 0 · 전송 재시도·속도 제한 0
   fit 봇 gateway 준비 1 · 종료 코드 0 · 미설정 0 · 전송 재시도·속도 제한 0
   대기 3s(상한 90s)
   되돌리기: deploy/discord-switch.sh off
결과: 통과 — Discord 승계(라우트별 첫 실알림 확인은 런북 5절)
=== 끝 ===
```
