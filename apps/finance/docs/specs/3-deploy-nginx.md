# [Phase 1] 배포 설정 (PM2 + Nginx + Basic Auth)

## 목적

Ubuntu 서버에 PM2 + Nginx로 배포하고, basic auth로 외부 접근을 차단한다.

## 요구사항

### PM2
- [ ] PM2로 Next.js 프로덕션 서버 실행
- [ ] `ecosystem.config.js` 작성 (앱 이름, 스크립트, 환경변수)
- [ ] 자동 재시작, 로그 관리 설정

### Nginx
- [ ] 리버스 프록시: 80/443 → localhost:3000
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
    script: 'npm',
    args: 'start',
    cwd: '/home/sejin/myFinance',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
}
```

### Nginx 설정 개요

```
server {
    listen 443 ssl;
    server_name myfinance.example.com;

    auth_basic "myFinance";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
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
- [ ] `https://도메인/` 접속 → basic auth 프롬프트
- [ ] 인증 후 대시보드 정상 표시
- [ ] 인증 실패 시 401 응답
- [ ] PM2 로그 확인 (`pm2 logs myfinance`)

## 제외 사항

- 자동 배포 (CI/CD) — 수동 배포로 충분
- PostgreSQL 자동 백업 (Phase 6)
- 도메인/DNS 설정 (사전 준비 완료 가정)
