# 운영 배포 자동화 — GitHub Actions

- **작성일**: 2026-06-30
- **타입**: enhancement / 운영 (P2)
- **참조**: `fomalhaut84/myFitness#137` deploy.yml (같은 서버, 동일 패턴 이식)

## 1. 배경

현재 매 릴리즈마다 사용자가 직접:
```bash
ssh server
cd /home/nasty68/myFinance
./deploy/deploy.sh <tag>
pm2 restart myfinance myfinance-bot
```

수동 진행 → 누락 위험 + 시간 소비. myFitness 에서 같은 문제로 자동화 했고 (#137, v2.2.12 부터 적용), 동일 서버라 동일 패턴 이식 가능.

## 2. 요구사항

- [ ] **F1**: `release.published` 이벤트 자동 트리거. prerelease/draft 제외.
- [ ] **F2**: `workflow_dispatch` 수동 트리거 (tag 입력) — 운영자가 재실행 가능.
- [ ] **F3**: 운영 서버 SSH → `./deploy/deploy.sh <tag>` 실행.
- [ ] **F4**: SSH host fingerprint 검증 (MITM 방지). 누락 시 배포 중단 (preflight).
- [ ] **F5**: tag 형식 검증 (`v\d+\.\d+\.\d+(-suffix)?`) — shell injection 차단.
- [ ] **F6**: 동시 배포 차단 (`concurrency: deploy-production`).
- [ ] **F7**: 배포 결과 텔레그램 알림 (성공/실패).

## 3. 기술 설계

### 3.1 `.github/workflows/deploy.yml` 신규

myFitness #137 와 100% 동일 구조 (workflow 이름/도메인 라벨만 수정).

핵심 단계:
1. **Preflight**: `DEPLOY_SSH_FINGERPRINT` secret 존재 확인 (없으면 fail).
2. **Deploy via SSH** (`appleboy/ssh-action@v1.2.2`):
   - `host`, `username`, `key`, `port`, `fingerprint` secret 사용.
   - 30분 timeout.
   - 운영 서버 script: tag 형식 검증 → `cd $DEPLOY_PATH && ./deploy/deploy.sh $RELEASE_TAG`.
3. **Telegram 알림** (성공/실패 각각 step): raw curl, 토큰/chat_id secret.

### 3.2 GitHub Secrets (사용자 등록 필요)

운영 환경 정보. myFitness 와 동일 서버라면 같은 값 재사용 가능:

| Secret | 설명 | 예시 |
|---|---|---|
| `DEPLOY_SSH_HOST` | 서버 IP/도메인 | `xxx.xxx.xxx.xxx` |
| `DEPLOY_SSH_USER` | SSH 계정 | `nasty68` |
| `DEPLOY_SSH_KEY` | private key (PEM) | `-----BEGIN OPENSSH PRIVATE KEY-----\n...` |
| `DEPLOY_SSH_PORT` | SSH 포트 | `22` |
| `DEPLOY_SSH_FINGERPRINT` | host fingerprint | `SHA256:...` |
| `DEPLOY_PATH` | 서버의 myFinance 경로 | `/home/nasty68/myFinance` |
| `TELEGRAM_BOT_TOKEN` | 봇 토큰 (알림용, 운영봇 재사용 가능) | `0123456789:AAA...` |
| `TELEGRAM_CHAT_ID` | 알림 chat ID | `123456789` |

### 3.3 host fingerprint 추출

```bash
# 운영 서버 OR 로컬 사용자 머신에서 (이미 known_hosts 에 있다면 사용 가능)
ssh-keyscan -p <port> <host> > /tmp/host.pub
ssh-keygen -lf /tmp/host.pub
# → "SHA256:..." 부분만 secret 으로 등록
```

### 3.4 운영 서버 배포 흐름 (변경 없음)

`./deploy/deploy.sh <tag>` 그대로 동작. tag 인자 받아서 checkout/pull/build/PM2 restart. 이미 호환.

## 4. 검증

- yml 문법: GitHub Actions 가 push 시점에 검증
- 첫 배포: v0.8.3 또는 next release 시점에 실제 동작 확인
- workflow_dispatch 수동 재실행으로 시험 (v0.8.2 재배포 등)

## 5. 위험도

- **낮음**: 워크플로우 파일 1개만 추가, 기존 배포 절차 (deploy.sh) 변경 없음
- 처음 실행 시 secret 누락이면 preflight 에서 fail (서버 영향 없음)

## 6. 사용자 액션 (머지 후)

1. GitHub repo Settings → Secrets and variables → Actions 에 위 8개 secret 등록
2. (선택) v0.8.3 release 만들어서 자동 트리거 확인. 또는 Actions UI 에서 workflow_dispatch 로 v0.8.2 재실행
3. 텔레그램에 ✅/❌ 알림 도착 확인
