# 텔레그램 봇 응답 속도 개선

## 목적
텔레그램 봇 웹훅 응답이 간헐적으로 느려지는 문제 해결.
Next.js API route 콜드 스타트, DB 커넥션 경합, 메모리 제한 등 복합 원인을 개선한다.

## 요구사항

- [x] Prisma 커넥션 풀 최적화 (pool size, timeout 설정)
- [x] PM2 메모리 한도 증가 (512MB → 1GB)
- [x] 웹훅 핸들러 즉시 초기화 (lazy → eager)
- [x] Cron 작업 동시 실행 방지 (mutex 패턴)

## 기술 설계

### A. Prisma 커넥션 풀 최적화
- `connection_limit`: 기본 `num_cpus * 2 + 1` → 명시적으로 `10` 설정
- `pool_timeout`: 기본 10s → `5`s (웹훅은 빠른 실패가 유리)
- `connect_timeout`: 기본 5s → `5`s (명시)
- `datasources.db.url`에 파라미터 추가 또는 PrismaClient 생성자에서 설정

### B. PM2 설정 개선
- `max_memory_restart`: 512M → 1024M (GC pause 감소)
- `node_args`: `--max-old-space-size=1024` 추가

### C. 웹훅 핸들러 즉시 초기화
- 현재: 첫 요청 시 lazy 초기화 → 콜드 스타트 지연
- 개선: 모듈 로드 시점에 handler 즉시 생성
- instrumentation.ts에서 봇 미리 초기화 (warm-up)

### D. Cron 동시 실행 방지
- `refreshPrices()`에 이미 mutex 있음 → 확인
- `takeAllSnapshots()`, `syncKrxStocks()`에 mutex 패턴 적용
- cron 콜백 내에서 `isRunning` 플래그로 중복 실행 방지

## 제외 사항
- PM2 클러스터 모드 (cron 중복 실행 문제로 현재 부적합)
- PgBouncer 외부 풀러 (개인 서버에서 오버엔지니어링)
- 봇 long polling 전환 (webhook이 서버 리소스 절약에 유리)

## 테스트 계획
- lint/typecheck/build 통과
- 로컬 서버 기동 후 웹훅 endpoint 응답 확인
