# Phase 13: 분기 리포트 PDF 자동 생성

## 목적

분기마다 AI가 포트폴리오를 종합 분석하고 PDF 리포트를 자동 생성.
증여세 신고 근거 자료로도 활용 가능.

## 서브 이슈

- [x] **13-A**: AI 분기 리뷰 분석 (데이터 수집 + AI 코멘트)
- [x] **13-B**: PDF 생성 엔진 (react-pdf 템플릿)
- [x] **13-C**: 분기 자동 발송 + 텔레그램 /리포트 커맨드
- [ ] **13-D**: 웹 리포트 열람/다운로드 페이지

## 상세 설계

`docs/milestone-3.md` Phase 13 섹션 참조

---

## 13-A: AI 분기 리뷰 분석

### 요구사항

- [ ] 분기 데이터 수집 함수 (수익률, 배당, 세금, 증여, 거래 내역)
- [ ] askAdvisor로 AI 분석 코멘트 생성
- [ ] QuarterlyReport DB 모델 (리포트 저장)

### 파일

```
prisma/schema.prisma                       # QuarterlyReport 모델
src/lib/report/data-collector.ts           # 분기 데이터 수집
src/lib/report/ai-review.ts               # AI 분석 코멘트
```

---

## 13-B: PDF 생성 엔진

### 요구사항

- [ ] @react-pdf/renderer 패키지
- [ ] PDF 템플릿 (커버, 성과 요약, 종목별 상세, 세금, AI 코멘트, 증여 부록)
- [ ] 차트는 서버사이드 SVG 렌더링

### 파일

```
src/lib/report/pdf-generator.ts            # PDF 생성
src/lib/report/pdf-template.tsx            # react-pdf 컴포넌트
```

---

## 13-C: 분기 자동 발송

### 요구사항

- [ ] 1/4/7/10월 첫째 주 자동 생성 (cron)
- [ ] 텔레그램 PDF 파일 전송
- [ ] /리포트 커맨드 (수동 생성)

### 파일

```
src/bot/notifications/quarterly-report.ts
src/bot/commands/report.ts
```

---

## 13-D: 웹 리포트 열람

### 요구사항

- [ ] /reports 페이지
- [ ] 과거 리포트 목록 + PDF 다운로드
- [ ] API: GET /api/reports

### 파일

```
src/app/reports/page.tsx
src/app/api/reports/route.ts
```

---

## 제외 사항

- 실시간 차트 이미지 (SVG만)
- 다국어 지원

## 테스트 계획

```bash
npm run lint && npx tsc --noEmit && npm run build
```
