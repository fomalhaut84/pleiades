#!/bin/bash
# myFinance 배포 스크립트
# 사용: ./deploy/deploy.sh [branch|tag]
# 예시: ./deploy/deploy.sh main
#       ./deploy/deploy.sh v0.1.0
#       ./deploy/deploy.sh dev
set -e

TARGET="${1:-main}"
cd /home/nasty68/myFinance

echo "=== 1. Fetch latest ==="
git fetch origin --tags

echo "=== 2. Checkout: $TARGET ==="
git checkout "$TARGET"

# 브랜치인 경우 pull, 태그인 경우 이미 detached HEAD
if git symbolic-ref -q HEAD >/dev/null 2>&1; then
    git pull origin "$TARGET"
fi

echo "=== 3. Install dependencies ==="
npm ci

echo "=== 4. DB Migrate ==="
npx prisma migrate deploy

echo "=== 5. Build ==="
npm run build

echo "=== 6. PM2 Restart ==="
# 웹: stateless → graceful reload (zero-downtime)
pm2 startOrReload ecosystem.config.js --only myfinance
# 봇: 텔레그램 long polling 은 토큰당 1 인스턴스만 허용 → reload 시 두 봇이 겹치면
# 409 Conflict. fork 단일 인스턴스라 hard restart 가 안전 (옛 인스턴스 stop 후 새로 spawn).
# docs/specs/356-bot-409-conflict-fix.md 참조.
pm2 startOrRestart ecosystem.config.js --only myfinance-bot

echo ""
echo "=== Deploy complete: $TARGET ==="
pm2 status
echo "https://finance.starryjeju.net"
