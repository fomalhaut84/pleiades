# Phase 13: 분기 리포트 PDF — 구현 계획 (사후 기록)

## 서브 이슈
- #147: 13-A AI 분기 리뷰 분석
- #149: 13-B PDF 생성 엔진 (react-pdf)
- #151: 13-C 분기 자동 발송 + /리포트 커맨드
- #153: 13-D 웹 리포트 열람/다운로드 페이지

## 주요 변경 파일
```
신규:
  src/app/api/reports/ — 리포트 생성/조회 API
  src/app/reports/ — 웹 리포트 페이지
  src/lib/report/ — AI 분석 + PDF 생성 (react-pdf)
  src/bot/commands/report.ts — /리포트 커맨드
  src/cron/quarterly-report.ts — 분기 자동 생성
  src/components/report/ — 리포트 목록, 다운로드
```

## 패키지 추가
- @react-pdf/renderer

## DB 마이그레이션
- Report 모델 추가 (분기별 리포트 저장)

## 구현 순서
1. AI 분기 리뷰 분석 (데이터 수집 + Claude 코멘트)
2. PDF 생성 엔진 (react-pdf 템플릿)
3. 분기 자동 발송 cron + /리포트 텔레그램 커맨드
4. 웹 리포트 열람/다운로드 페이지
