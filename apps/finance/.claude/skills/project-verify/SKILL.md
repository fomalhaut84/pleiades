---
name: project-verify
description: "myFinance 프로젝트의 4종 검증 세트 (lint / typecheck / test:run / build) + 프로젝트별 특수 검증 (Prisma migrate status, MCP dist rebuild, verify skill 로 실 running 서버 검증). 커밋 전, PR 오픈 전, 배포 전 사용."
---

# Project Verify — myFinance 검증 표준

quality-guardian 가 사용. 하나라도 실패하면 다음 단계 진행 금지.

## 4종 필수 검증
반드시 이 순서로:

```bash
npm run lint                     # ESLint (Next.js codemod 경유)
npx tsc --noEmit                 # TypeScript strict
npm run test:run                 # Vitest 전체
npm run build                    # Next.js build + MCP + Bot esbuild
```

- **lint**: `✔ No ESLint warnings or errors` 확인
- **typecheck**: 에러 0 (경고 무시)
- **test**: `Test Files N passed, Tests M passed` 확인
- **build**: 모든 dist 산출물 생성 확인 (`dist/mcp/server.cjs`, `dist/bot/standalone.cjs`)

## Prisma 특수 검증
스키마 변경 시 (`prisma/schema.prisma` 수정):

```bash
npx prisma migrate dev --name {descriptive}  # 개발 마이그레이션 + client 재생성
npx prisma migrate status                     # 미적용 마이그레이션 있는지
```

- Migration 실패 → 스키마 syntax 확인
- Client 재생성 실패 → `node_modules/.prisma/client` 삭제 후 재시도

## MCP 서버 변경 시
```bash
npm run build:mcp:staged      # out-of-place build (dist/mcp/server.staged.cjs)
```
- 실서비스 배포 시엔 deploy.sh 가 pre-flight (port 4299) 후 activate
- 로컬 테스트: `MCP_TRANSPORT=stdio node dist/mcp/server.cjs` 로 subprocess spawn

## Verify skill (실 running 서버)
UI/API 변경 시 사용:

```bash
npm run dev                                     # 별도 터미널 (background)
# 인증
CJAR=$(mktemp)
CSRF=$(curl -s -c "$CJAR" http://localhost:3000/api/auth/csrf | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)
curl -s -b "$CJAR" -c "$CJAR" -o /dev/null -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "pin=0000&csrfToken=$CSRF&callbackUrl=/" \
  http://localhost:3000/api/auth/callback/credentials

# API 테스트
curl -s -b "$CJAR" 'http://localhost:3000/api/xxx' | python3 -m json.tool
```

**시딩 필요 시** (예: AlertHistory / EarningsCache):
```javascript
// 프로젝트 루트에 seed.mjs 작성 (Prisma client 접근 위해)
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
await p.tableName.createMany({ data: [...] })
await p.$disconnect()
```
```bash
node seed.mjs && rm seed.mjs
```

**정리**:
```bash
kill $(lsof -ti tcp:3000)
```

## 검증 완료 후 자체 리뷰

규칙 8-1 기준 결정:
- self-review 로 충분: 문서 / 시각 / 단순 fix < 50 LOC 단일
- pr-review-toolkit 필수: 3+ 파일 / 200+ LOC / API 라우트 / 마이그레이션 / 신규 컴포넌트 / 보안 / AI

```
Agent(subagent_type="pr-review-toolkit:code-reviewer", model="opus", prompt="Review branch <current> vs dev in <repo>. Context: ... Focus: ... Severity: P0/P1/P2. Under 250 words.")
```

## 실패 시 대응
| 실패 | 조치 |
|------|------|
| lint | 해당 파일 규칙 확인 (Next.js/React) |
| typecheck | 타입 정의 부재 → 명시 or 헬퍼 활용 |
| test | 로직 vs 테스트 어느 쪽이 옳은지 판단 후 수정 |
| build | esbuild alias 확인 (`@` = `./src`), 외부 dep exclude 확인 |
| verify (API 500) | 서버 로그 (`/tmp/dev.log`) + prisma migrate status |

## 프로젝트 참고
- CLAUDE.md 검증 순서
- `.claude/rules/workflow.md` §7~8
