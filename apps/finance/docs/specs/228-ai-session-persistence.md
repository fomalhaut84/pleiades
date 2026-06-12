# 텔레그램 AI 대화 세션 유지

## 목적

텔레그램 AI 대화 시 이전 컨텍스트를 유지하여 연속 대화 가능.
현재 매 질문마다 독립 프로세스가 실행되어 이전 대화가 사라짐.

## 요구사항

- [ ] chatId별 세션 ID 관리 (Map)
- [ ] 첫 호출: 새 세션 → session_id 저장
- [ ] 이후 호출: `--resume <sessionId>`로 대화 이어감
- [ ] `/reset` 커맨드로 세션 초기화
- [ ] `--no-session-persistence` 플래그 제거

## 기술 설계

### Claude CLI `--resume` 동작 (검증 완료)

1. 첫 호출: `claude -p "질문" --output-format json` → 응답에 `session_id` 포함
2. 이후 호출: `claude -p "질문" --resume <sessionId> --output-format json` → 이전 대화 이어감
3. `--no-session-persistence` 제거해야 세션 파일이 저장됨

### 변경 파일

1. **`src/lib/ai/claude-advisor.ts`**
   - `askAdvisor`에 `sessionId?: string` 옵션 추가
   - `sessionId` 있으면 `--resume <sessionId>` 추가, `--system-prompt` 제거 (resume 시 불필요)
   - `--no-session-persistence` 제거
   - 응답에서 `session_id` 반환

2. **`src/bot/commands/ai.ts`**
   - chatId별 세션 ID Map 관리
   - `fireAiQuestion`에서 세션 ID 전달 + 응답에서 세션 ID 저장
   - `/reset` 커맨드 등록

## 테스트 계획

- [ ] 텔레그램에서 "내 이름은 세진이야" → "내 이름이 뭐야?" → 세진 답변
- [ ] `/reset` → 세션 초기화 → "내 이름이 뭐야?" → 모름
- [ ] lint + typecheck + build 통과

## 제외 사항

- 웹 AI 페이지 세션은 별도 이슈
- 브리핑/자동 알림은 세션 불필요 (단발성)
