# PDF 리포트 한글 깨짐 수정

## 목적

분기 리포트 PDF에서 한글 텍스트가 깨지는 버그 수정.

## 원인

`@react-pdf/renderer`의 내장 폰트(Helvetica)는 라틴 문자만 지원.
한글 글리프가 없어 빈칸 또는 깨진 문자로 렌더링됨.

## 요구사항

- [ ] 한글 지원 폰트 등록 (Noto Sans KR)
- [ ] PDF 템플릿에 한글 폰트 적용
- [ ] 기존 PDF 레이아웃/디자인 유지

## 기술 설계

### 변경 파일 (1개)

**`src/lib/report/pdf-template.tsx`**
- `@react-pdf/renderer`의 `Font.register()`로 Noto Sans KR 등록 (Google Fonts CDN)
- Regular(400) + Bold(700) 두 웨이트
- `fontFamily: 'Helvetica'` → `fontFamily: 'NotoSansKR'`

### API/DB 변경: 없음

## 테스트 계획

- [ ] PDF 리포트 생성 → 한글 정상 표시
- [ ] 굵은 글씨(제목 등) 정상 표시
- [ ] lint + typecheck + build 통과

## 제외 사항

- 폰트 파일 로컬 번들링 (CDN 방식 사용)
- PDF 디자인/레이아웃 변경 없음
