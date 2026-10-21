# 구현 계획 — Issue #3 배포 설정 (PM2 + Nginx + Basic Auth)

## 참조 문서

- 스펙: `docs/specs/3-deploy-nginx.md`

## 환경 정보

- **도메인**: finance.starryjeju.net
- **서버 경로**: /home/nasty68/myFinance
- **앱 포트**: 4100 (3000은 사용 중)
- **SSL**: Let's Encrypt certbot (서버에 미설치 상태)

## 패키지 추가

없음 (PM2는 서버에 글로벌 설치).

## DB 마이그레이션

없음.

## 구현 순서

### Phase A: 설정 파일 작성

| # | 파일 | 작업 |
|---|------|------|
| 1 | `ecosystem.config.js` | PM2 설정 (앱 이름, 포트 4100, cwd, 로그) |
| 2 | `deploy/nginx/myfinance.conf` | Nginx 설정 (리버스프록시, SSL, basic auth, gzip) |
| 3 | `deploy/deploy.sh` | 배포 스크립트 (pull → install → build → migrate → restart) |

### Phase B: 프로젝트 설정 업데이트

| # | 파일 | 작업 |
|---|------|------|
| 4 | `.env.example` | PORT=4100 추가, 서버용 예시 보강 |
| 5 | `docs/specs/3-deploy-nginx.md` | 서버 초기 설정 가이드 추가 (1회성 작업) |

## 파일별 상세

### `ecosystem.config.js`

```javascript
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

- `npm start` 대신 `next start -p 4100` 직접 호출 (PM2 프로세스 관리 최적화)

### `deploy/nginx/myfinance.conf`

```nginx
# HTTP → HTTPS 리다이렉트
server {
    listen 80;
    server_name finance.starryjeju.net;
    return 301 https://$host$request_uri;
}

# HTTPS + 리버스 프록시
server {
    listen 443 ssl;
    server_name finance.starryjeju.net;

    # SSL (certbot이 자동 설정)
    ssl_certificate /etc/letsencrypt/live/finance.starryjeju.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/finance.starryjeju.net/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Basic auth
    auth_basic "myFinance";
    auth_basic_user_file /etc/nginx/.htpasswd;

    # gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;

    # 정적 파일 캐시
    location /_next/static/ {
        proxy_pass http://localhost:4100;
        expires 365d;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    # 리버스 프록시
    location / {
        proxy_pass http://localhost:4100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### `deploy/deploy.sh`

```bash
#!/bin/bash
set -e
cd /home/nasty68/myFinance

echo "=== 1. Pull ==="
git pull origin main

echo "=== 2. Install + Build ==="
npm ci
npm run build

echo "=== 3. DB Migrate ==="
npx prisma migrate deploy

echo "=== 4. PM2 Restart ==="
pm2 restart myfinance || pm2 start ecosystem.config.js

echo "=== Done ==="
pm2 status myfinance
```

### 서버 초기 설정 (1회성, 스펙 문서에 가이드 추가)

```bash
# 1. PostgreSQL DB/유저 생성
sudo -u postgres createuser nasty68
sudo -u postgres createdb myfinance -O nasty68

# 2. PM2 글로벌 설치
npm install -g pm2

# 3. Nginx 설정
sudo cp deploy/nginx/myfinance.conf /etc/nginx/sites-available/myfinance
sudo ln -s /etc/nginx/sites-available/myfinance /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 4. Let's Encrypt SSL
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d finance.starryjeju.net

# 5. Basic auth
sudo apt install apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd <username>

# 6. .env 작성
cp .env.example .env
# DATABASE_URL, BASE_URL 편집

# 7. 첫 배포
npm ci && npm run build
npx prisma migrate deploy
npx prisma db seed
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # 서버 재부팅 시 자동 시작
```

## 검증 체크리스트

- [ ] `npm run lint` 통과
- [ ] `npm run build` 통과
- [ ] ecosystem.config.js 문법 검증
- [ ] deploy.sh 실행 권한 (chmod +x)
- [ ] Nginx 설정 문법 검증 (nginx -t 참고용)
