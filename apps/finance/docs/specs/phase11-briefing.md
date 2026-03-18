# Phase 11: 모닝 브리핑 + 전략 맞춤 AI 어드바이저

## 목적

매일 장 시작 전 보유 종목 뉴스·동향을 수집하고, 계좌별·종목별 투자 전략에 맞는 맞춤 조언을 AI가 생성하여 텔레그램으로 발송. 기술적 분석(TA) 엔진을 통해 스윙/모멘텀 전략에 구체적 타이밍 제안.

## 서브 이슈

- [x] **11-A**: 종목별 전략 태그 시스템 (HoldingStrategy DB + /전략 커맨드)
- [x] **11-B**: 관심종목 워치리스트 (Watchlist DB + /관심 커맨드)
- [ ] **11-C**: 기술적 분석 엔진 (trading-signals + OHLCV + 시그널)
- [ ] **11-D**: 전략별 맞춤 조언 로직 (프롬프트 분기)
- [ ] **11-E**: 모닝 브리핑 (자동 발송 + 뉴스 + TA)
- [ ] **11-F**: 수동 트리거 종목 심층 분석 (/브리핑 [종목])

## 상세 설계

`docs/milestone-2.md` Phase 11 섹션 참조 (DB 스키마, 커맨드, TA 모듈, 브리핑 포맷 상세)

---

## 11-A: 종목별 전략 태그 시스템

### 요구사항

- [ ] HoldingStrategy Prisma 모델
- [ ] /전략 커맨드 (전략 변경, 목표가, 손절가, 매수구간, 점검일)
- [ ] /전략목록 커맨드 (전체 종목 전략 현황)
- [ ] 기본 전략 자동 생성 (아이들 계좌=long_hold, 세진=종목별)

### 기술 설계

```prisma
model HoldingStrategy {
  id          String    @id @default(cuid())
  holdingId   String    @unique
  holding     Holding   @relation(fields: [holdingId], references: [id])
  strategy    String    @default("long_hold")
  memo        String?
  targetPrice Float?
  stopLoss    Float?
  entryLow    Float?
  entryHigh   Float?
  reviewDate  DateTime?
  updatedAt   DateTime  @updatedAt
}
```

전략 타입: long_hold, swing, momentum, value, watch, scalp

### 파일

```
prisma/schema.prisma                    # HoldingStrategy 모델
src/bot/commands/strategy.ts            # /전략, /전략목록
src/bot/index.ts                        # 등록
```

---

## 11-B: 관심종목 워치리스트

### 요구사항

- [ ] Watchlist Prisma 모델
- [ ] /관심 [종목] — 추가/제거
- [ ] /관심목록 — 현재가 + 전략 + 진입 조건 요약
- [ ] 매수 시 워치리스트 자동 제거

### 파일

```
prisma/schema.prisma                    # Watchlist 모델
src/bot/commands/watchlist.ts           # /관심, /관심삭제, /관심목록
```

---

## 11-C: 기술적 분석 엔진

### 요구사항

- [ ] trading-signals 패키지 설치
- [ ] yahoo-finance2 historical() OHLCV 조회 (200일)
- [ ] RSI(14), MACD, BB, SMA(20/50/200), EMA 계산
- [ ] 지지/저항선 자동 탐지
- [ ] 종합 시그널 판정 (STRONG_BUY ~ STRONG_SELL)
- [ ] /분석 [종목] 커맨드 (TA 결과 표시)
- [ ] MCP 서버에 get_technical_analysis 도구 추가

### 파일

```
src/lib/ta/engine.ts                    # TA 계산 엔진
src/lib/ta/types.ts                     # TAReport 인터페이스
src/lib/ta/support-resistance.ts        # 지지/저항선 탐지
src/bot/commands/analysis.ts            # /분석 커맨드
src/mcp/tools/ta.ts                     # MCP 도구
```

---

## 11-D: 전략별 맞춤 조언 로직

### 요구사항

- [ ] 전략 타입별 AI 프롬프트 분기
- [ ] long_hold → 간략 (뉴스 요약, 특이사항만)
- [ ] swing → TA + 타이밍 제안
- [ ] watch → 점검 기준 모니터링

### 파일

```
src/lib/ai/strategy-prompts.ts          # 전략별 프롬프트 생성
```

---

## 11-E: 모닝 브리핑

### 요구사항

- [ ] 한국장 08:30 KST + 미국장 23:00 KST 자동 발송
- [ ] firecrawl 웹 검색으로 뉴스 수집
- [ ] TA 데이터 포함 (스윙/모멘텀 종목)
- [ ] 관심종목 진입 조건 체크
- [ ] /브리핑 커맨드 (수동 트리거)

### 파일

```
src/bot/notifications/briefing.ts       # 브리핑 생성 + 발송
src/bot/commands/briefing.ts            # /브리핑 커맨드
src/bot/notifications/scheduler.ts      # 크론 추가
```

---

## 11-F: 수동 종목 심층 분석

### 요구사항

- [ ] /브리핑 [종목] → TA + 전략 + 뉴스 종합 분석
- [ ] AI가 종목별 심층 리포트 생성

### 파일

```
src/bot/commands/briefing.ts            # /브리핑 [종목] 핸들러 추가
```

---

## 제외 사항

- Briefing DB 저장 + 웹 히스토리 (향후)
- 장 휴일/서머타임 자동 처리 (향후)

## 테스트 계획

```bash
npm run lint && npx tsc --noEmit && npm run build
```

수동:
1. /전략 NVDA 스윙 → 전략 변경 확인
2. /전략목록 → 전체 종목 전략 표시
3. /분석 NVDA → TA 리포트 표시
4. /브리핑 → 전체 모닝 브리핑 수동 발송
5. /브리핑 NVDA → 종목 심층 분석
6. 08:30 KST → 자동 브리핑 수신
