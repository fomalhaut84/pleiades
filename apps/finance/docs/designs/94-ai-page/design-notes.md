# AI 분석 페이지 디자인 노트

## 레이아웃
- 전체 높이 채팅 UI (h-screen, 하단 입력 고정)
- 빈 상태: 프리셋 질문 그리드 (2×4)
- 대화 중: 메시지 스크롤 영역 + 하단 프리셋 칩

## 컬러
- 사용자 메시지: sejin/15 배경, 우측 정렬
- AI 응답: bg-card + border, 좌측 정렬 + 🤖 아이콘
- 입력 포커스: sejin/40 border
- 전송 버튼: sejin/15 배경 + sejin 텍스트

## 컴포넌트 구조
```
src/app/ai/page.tsx          # SSR (빈 페이지, Header만)
src/app/ai/AIClient.tsx      # 클라이언트 (대화 UI 전체)
src/app/api/ai/ask/route.ts  # POST API (askAdvisor 호출)
```

## 프리셋 질문 (8개)
1. 전체 현황
2. 소담 계좌 + 증여세
3. 다솜 계좌 + 증여세
4. 세진 계좌 상세
5. 수익률 비교 (3개월)
6. 이번 달 소비
7. 성장 시뮬레이션
8. 환율 + 시세

## 반응형
- 모바일: 프리셋 2열, 메시지 85% 너비
- 데스크톱: 프리셋 4열, 메시지 75% 너비, max-w-3xl

## 마크다운 렌더링
- dangerouslySetInnerHTML (sanitize 필수)
- Tailwind prose 클래스 활용
- 표: border + rounded + header 배경
