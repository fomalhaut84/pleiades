# Phase 7: 텔레그램 봇 — 구현 계획 (사후 기록)

## 서브 이슈
- #60: 7-A grammY 봇 초기 세팅 + webhook + Chat ID 인증
- #61: 7-B /현황, /계좌 — 포트폴리오 조회
- #62: 7-C /주가, /환율 — 시세 조회
- #63: 7-D /매수, /매도 — 거래 기록 (인라인 키보드)
- #64: 7-E 알림 — 분기점검, RSU 베스팅일, 월적립 리마인더
- #70: 7-F /주가 실시간 조회 + 비보유 종목 지원

## 주요 변경 파일
```
신규:
  src/bot/ — grammY 봇 전체 구조
  src/bot/commands/ — 커맨드 핸들러 (portfolio, trade, price, alert)
  src/bot/utils/ — 포맷터, 키보드 빌더
  src/bot/middleware/ — 인증 미들웨어
  src/app/api/telegram/ — webhook endpoint
```

## 패키지 추가
- grammy (텔레그램 봇 프레임워크)

## DB 마이그레이션
없음

## 구현 순서
1. grammY 초기 세팅 + webhook + Chat ID 화이트리스트
2. /현황, /계좌 커맨드 (포트폴리오 조회)
3. /주가, /환율 커맨드 (시세 조회)
4. /매수, /매도 커맨드 (인라인 키보드 확인)
5. 알림 시스템 (분기점검, RSU, 월적립)
6. /주가 실시간 + 비보유 종목 + 한국 종목명 검색
