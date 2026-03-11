#!/bin/bash
# myFinance 배포 스크립트
# 사용: ./deploy/deploy.sh
set -e

cd /home/nasty68/myFinance

echo "=== 1. Pull latest code ==="
git pull origin main

echo "=== 2. Install dependencies ==="
npm ci

echo "=== 3. DB Migrate ==="
npx prisma migrate deploy

echo "=== 4. Build ==="
npm run build

echo "=== 5. PM2 Restart ==="
pm2 startOrReload ecosystem.config.js --only myfinance

echo ""
echo "=== Deploy complete ==="
pm2 status myfinance
echo "https://finance.starryjeju.net"
