# [Phase 1] 배포 설정 (PM2 + Nginx + Basic Auth)

## 목적

Ubuntu 서버에 PM2 + Nginx로 배포하고, basic auth로 외부 접근을 차단한다.

## 요구사항

### PM2
- [ ] PM2로 Next.js 프로덕션 서버 실행
- [ ] `ecosystem.config.js` 작성 (앱 이름, 스크립트, 환경변수)
- [ ] 자동 재시작, 로그 관리 설정

### Nginx
- [ ] 리버스 프록시: 80/443 → localhost:4100
- [ ] HTTPS 설정 (Let's Encrypt certbot)
- [ ] Basic auth 설정 (htpasswd)
- [ ] gzip 압축, 정적 파일 캐시 헤더

### 환경
- [ ] 서버 .env 설정 (DATABASE_URL, BASE_URL, NODE_ENV=production)
- [ ] PostgreSQL 서버 설정 + myfinance 유저/DB 생성
- [ ] `npx prisma migrate deploy` + `npx prisma db seed` 실행

## 기술 설계

### PM2 설정

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'myfinance',
    script: 'node_modules/.bin/next',
    args: 'start -p 4100',
    cwd: '/home/nasty68/myFinance',
    env: {
      NODE_ENV: 'production',
      PORT: 4100,
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
}
```

### Nginx 설정 개요

HTTP-only로 시작, `certbot --nginx`가 HTTPS 블록을 자동 추가.

```
server {
    listen 80;
    server_name finance.starryjeju.net;

    auth_basic "myFinance";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://localhost:4100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
# certbot --nginx 실행 후 → listen 443 ssl + 인증서 경로 자동 추가
```

### 배포 절차

```bash
# 1. 코드 배포
git pull origin main

# 2. 의존성 + 빌드
npm ci && npm run build

# 3. DB 마이그레이션
npx prisma migrate deploy

# 4. PM2 재시작
pm2 restart myfinance
```

## 테스트 계획

- [ ] `pm2 start ecosystem.config.js` → 정상 실행
- [ ] `https://finance.starryjeju.net/` 접속 → basic auth 프롬프트
- [ ] 인증 후 대시보드 정상 표시
- [ ] 인증 실패 시 401 응답
- [ ] PM2 로그 확인 (`pm2 logs myfinance`)

## 서버 초기 설정 가이드 (1회성)

```bash
# 1. PostgreSQL DB/유저 생성
sudo -u postgres createuser nasty68
sudo -u postgres createdb myfinance -O nasty68

# 2. 프로젝트 클론
cd /home/nasty68
git clone git@github.com:fomalhaut84/myFinance.git
cd myFinance

# 3. .env 작성
cp .env.example .env
# DATABASE_URL="postgresql://nasty68@localhost:5432/myfinance"
# BASE_URL="https://finance.starryjeju.net"
# PORT=4100

# 4. PM2 글로벌 설치
npm install -g pm2

# 5. 첫 빌드 + 시드
npm ci && npm run build
npx prisma migrate deploy
npx prisma db seed

# 6. PM2 시작 + 자동 시작 등록
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # 출력되는 sudo 명령어 실행

# 7. Basic auth 계정 생성 (Nginx 설정보다 먼저)
sudo apt install apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd <username>  # -c는 최초 1회만! 추가 시 -c 생략

# 8. Nginx 설정 (HTTP only — SSL은 아직 없음)
sudo cp deploy/nginx/myfinance.conf /etc/nginx/sites-available/myfinance
sudo ln -s /etc/nginx/sites-available/myfinance /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 9. Let's Encrypt SSL (certbot이 Nginx 설정에 HTTPS 블록 자동 추가)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d finance.starryjeju.net

# 10. 확인
sudo nginx -t && sudo systemctl reload nginx
```

## 제외 사항

- 자동 배포 (CI/CD) — 수동 배포로 충분
- PostgreSQL 자동 백업 (Phase 6)
- 도메인/DNS 설정 (사전 준비 완료 가정)
