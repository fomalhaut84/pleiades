# 구현 계획: PDF 리포트 한글 깨짐 수정 (#212)

## 변경 파일 (1개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/lib/report/pdf-template.tsx` | Noto Sans KR 폰트 등록 + fontFamily 변경 |

## 구현 내용

1. `Font.register()` 호출로 Noto Sans KR Regular(400) + Bold(700) 등록
   - Google Fonts CDN URL 사용
2. styles.page의 `fontFamily: 'Helvetica'` → `fontFamily: 'NotoSansKR'`

## 패키지 추가: 없음
## DB 마이그레이션: 없음
