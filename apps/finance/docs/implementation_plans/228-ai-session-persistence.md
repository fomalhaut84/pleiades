# 구현 계획: 텔레그램 AI 대화 세션 유지 (#228)

## 변경 파일 (2개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/lib/ai/claude-advisor.ts` | sessionId 옵션 + --resume + session_id 반환 |
| 2 | `src/bot/commands/ai.ts` | chatId별 세션 Map + /reset 커맨드 |

## 패키지 추가: 없음
## DB 마이그레이션: 없음
