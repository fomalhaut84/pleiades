# 006 초안 1회차 감사 — `_workspace/006/02_writer_006.md`

작성 2026-09-30 · `reversibility-auditor`(읽기 전용 — 본문을 오케스트레이터가 저장) · 입력: 초안 1회차 · 실측 [S](`01_surveyor_monorepo.md`) · [S2](`01_surveyor_monorepo_r2.md`) · 002~005 · workflow.md · 이슈 #97.
**판정: 초안으로 되돌린다.** 정정 **19**(블로커 2 · 비블로커 17) · 확인 12 · 미확인 8.

## 0. 감사 규율 기록
쓰기·push·빌드 0. 서비스 저장소는 `gh api` GET 만(`rules/branches/dev` · `branches/dev` · `branches/dev/protection` · `traffic/clones` · 메타). 서비스 커밋 메시지는 [S] 스크래치 bare 클론(fin `5540417` · fit `a984b85`)에서만. 원본·worktree 미접근. GitHub 문서는 `docs.github.com/api/article/body`(issue-event-types · autolinked-references) — 스크래치 사본 `scratchpad/iet.md` · `scratchpad/al.md`.

## 1. 블로커 (2)

| # | 초안 주장 | 판정 | 근거 | 실제 |
|---|---|---|---|---|
| **B1** | §4-3 (a) "★X1 이 0 이어야 안전" · M-1 "서비스 접촉 0" · Q49 "★X1 = 0 이면 (a)" | 정정 | X1[S2]: 저장소 한정 참조 3 — `Closes fomalhaut84/myFinance#494`(fin `8ed402c`) · `fomalhaut84/myFitness#108` · `Refs fomalhaut84/pleiades#51`. 문서 issue-event-types §referenced: *"The issue was referenced from a commit message. … the commit_repository is where that commit was pushed."* → **push 시점**에 생긴다(PR 브랜치 push 포함). `Closes …myFinance#494` 가 pleiades 기본 브랜치에 들어가면 닫는 대상(현재 closed 라 상태 불변) | 초안 자신의 규칙대로 **(a) 탈락**. (a) push 시 **myFinance#494 · myFitness#108 타임라인에 `referenced` 이벤트 최소 2건**(편도 · 원칙 위반). 한정 없는 `#N` 3,276건(fin 1,331 · fit 1,945)은 pleiades 이슈에 이벤트(열린 #82 는 fin 에서만 18회) — 잡음 |
| **B2** | §4-3 (c) "`#N` → `fomalhaut84/myFinance#N` 을 코드 스팬으로 재작성" · Q56 "코드 스팬으로만" | 정정 | autolinked-references: 자동 링크 형식은 URL · `#N` · `GH-N` · `owner/repo#N`. 커밋 메시지 코드 스팬이 참조 추출을 막는다는 근거 없음(실험 금지). [S2] X2 는 `fin#N`/`fit#N` 로 재작성했고 정규식 `(?<![\w/])#` 이 한정 형식을 건너뛰어 `Closes fomalhaut84/myFinance#494` 가 남았다 | 초안 문안대로면 **3,276건이 서비스 한정 참조로 바뀐다**(서비스 타임라인 이벤트 대량 · 편도). 정정안: 모든 형식(`#N` · `owner/repo#N` · URL · `GH-N`)을 **비링크 형식**(`fin#N` 류)으로 · **push 전 게이트** `git log --format=%B` 네 형식 grep = 0(실측 현재 URL 0 · `GH-N` 0 · 한정 3). Q56 도 소유자 뺀 `myFinance#N`. 문서 파일 속 참조는 무해(*"Autolinked references are not created in … files in a repository"*) |

## 2. 비블로커 (17)

| # | 초안 | 근거 | 고칠 것 |
|---|---|---|---|
| N1 | (b) `--squash` "★X1 위험 없음" | `git-subtree` `squash_msg()` 617행이 범위 서비스 커밋 제목을 전부 넣는다(`plsq` 실물). 제목 `#N` fin 257/395 · fit 338/375 · 제목 닫기 키워드 fit 2(`[fix #322]`) | `add --squash` 는 깨끗 · `pull --squash` 는 서비스 제목 `#N` 유입. (b) 도 메시지 게이트 필요 |
| N2 | (c) 전제 "서비스 dev 이력 재작성 안 됨" | `gh api …/rules/branches/dev` → `[]` · `branches/dev` → `protected:false` (두 저장소) | 서비스 dev 는 force-push 무보호 · pleiades 는 강제 불가 → **감지 가드**: 마지막 수용 서비스 SHA 가 새 dev 의 조상인지 + (c) 이전 재작성 tip 이 새 재작성본의 조상인지 `merge-base --is-ancestor` — 실패 시 중단(filter-repo·git 버전 드리프트도 잡음). 실제 force-push 시 unrelated 재병합 = 중간 · 이력·pack 중복 = 편도. (a) 에도 필요 |
| N3 | "이력·pack 편도(ruleset 이 force-push 차단)" | ruleset `bypass_actors: []` 이나 소유자는 ruleset 을 끌 수 있다 | 결론 유지 · 근거 교체: 편도 요소는 ① PR ref(`refs/pull/N/head`) 객체 보존 ② `referenced` 이벤트 |
| N4 | "서비스 접촉 0 (https 읽기)" | `traffic/clones` — 소유자 Insights 집계(오늘분 반영 미확인) | "서비스 쓰기 0 · 운영 영향 0 · 관측 흔적 = 소유자 traffic 통계". 영향으로 볼지는 사용자 결정(F1) |
| N5 | I-10 "`claude-with` 가 `apps/*` 를 붙이지 않는다" | [S2] X10: 추적되는 `apps/*` 파일을 읽으면 중첩 CLAUDE.md·rules·skill 로드. fin 추적 하네스 skill 7(`release-publisher`) · agent 4(`release-manager`) · rule 5 · CLAUDE.md(`./deploy/deploy.sh dev`) | 래퍼 차단은 무효 — `claudeMdExcludes`(미실험) 또는 우선순위 규칙. fin 하네스 명령은 cwd 기준이라 pleiades 를 겨눔: `apps/*/deploy/deploy.sh` 로컬 실행 → pleiades 에서 `git fetch origin --tags` → `git checkout -f` (pleiades 작업트리 파괴 경로). "I-1·I-3 유도" 는 과장(`fomalhaut84`·`-R` 0건) |
| N6 | "`DATABASE_URL` 로컬 빈 DB 또는 더미" · 순서 M-2 → M-4 | X3: fin build 더미 DB rc 1(prerender Prisma · 추출본 동일) · 스키마 DB(migrate 27) rc 0 · fit 더미 4/4 · fin test DB 없이 866 | fin M-2 완료 판정이 스키마 DB 요구 → DB 준비를 M-2 로 올리거나 fin build 는 CI 판정. 8절 fin 선행 `prisma migrate deploy`(빈 스키마). 1a-0 "`next build` DB 요구 없음" 은 **fit 값** — measured-facts 정정 |
| N7 | "봇 기동은 D-4 에 없음" · Q53 "M-4 에서 발급 안 함" | #97 첫 목표 "(… 로컬 별도 DB·**검증 봇**)" | 사용자 결정을 좁혔다 — 되묻거나 M-4 에 포함 |
| N8 | "ALT-d 위임 키·`prepare` 소비자 없어짐 → 삭제 별도" | X3: `file:` 소비는 루트 `npm ci`(`prepare`)가 dist 선행 · 빠지면 rc 127 → typecheck rc 2 · test·build rc 1 | `prepare`(또는 명시 빌드)는 M-5 하중 요소 · 위임 키만 삭제 후보 · L2 에 "루트 `npm ci` 선행" |
| N9 | M-3 `paths: apps/<app>/**` · Q52 "필수로" | ruleset 필수 체크 `verify (20.x)`·`(24.x)` · `ci.yml` paths 없음 | paths 필터 워크플로우를 필수로 올리면 미트리거 PR 이 "Expected" 로 막힌다 → 필터 제거 또는 job 내 skip. M-5 후 fit job 트리거에 `packages/notify/**` + 루트 `npm ci` 선행 |
| N10 | L-1·L-2·L-3 | X9: 로컬 postgres 15.14 가 127.0.0.1:5432 리슨 · `.env` 원본 2 · worktree 2 존재. `.env.example`: fin `…@localhost:5432/myfinance` · `PORT=4100` · fit `…:5432/myfitness` · `PORT=4200` | ① 로컬 5432 는 사용자 서비스 개발 인스턴스 → **스크래치 `initdb` + 별도 포트(TCP 전용 `-k ''`)** 권고(되돌리기 즉시) ② `.env.example` 그대로 복사 경로 추가 ③ worktree `repos/*/.env` 복사 금지 ④ `next dev` 기본 3000 |
| N11 | Q54 "worktree 제거 제안(원본 `.git/worktrees` 만)" | §5 I-11 "`repos/*` 에서 git 명령 금지" 와 모순 · `git worktree remove` 는 원본 `.git` 을 쓰고 ignored `.env`·`node_modules` 를 지운다 | 사용자 단독 결정으로 · 사실 명시 |
| N12 | M-5 검증 "8절 4종 + CI + 로컬 기동(M-4)" | 1a-3 계획 S-1: fit 발송 6건 전부 봇 프로세스 | 웹 기동은 M-5a 경로 미관측 → "봇 기동 · Q53 선결" 로 |
| N13 | 훅 "`view`·`list`·`api` GET 만" · I-9 "secrets 0 을 CI 로 점검" | `gh api` 는 `-f/-F/--input` 이면 기본 POST · `-X` 임의 메서드 | 훅은 메서드·필드 플래그 검사. I-9 는 로컬 `gh` 점검(`…/actions/secrets --jq .total_count` → 0 확인) |
| N14 | 태그 규정 없음 | 릴리즈 절 `git push origin --tags` · 서비스 태그 fin 27 · fit 85 | `--no-tags` fetch 규율 · 릴리즈는 `git push origin v<X.Y.Z>` |
| N15 | M-1p "★X1 GitHub 재현은 테스트 저장소에서"(승인 항목) | B1 문서 확정 · 잔여는 B2 로 우회 | 테스트 저장소 불필요 — 승인 항목 제거 |
| N16 | §9 개정 목록 | grep 집계 | 누락: skills `pleiades-codex-loop`(15) · `pleiades-orchestrator`(6) · `reversibility-audit`(3) · `repo-measure`(3) · `orphan-check`(1) · agents `repo-surveyor`(7) · `reversibility-auditor`(3) · 004 §3-2 · `claude-code-mechanisms.md`(4) · measured-facts 정정(N6 · 004 §3-2 인용) · CLAUDE.md 하네스 절 · 005 "자동 로드되지 않는다" · 아티팩트(18) · `.gitignore`(`repos/` · Grep 안내) · workflow 릴리즈 절(N14) |
| N17 | D-1~D-4 | 006 §2 · 1a-3 계획 · 003 §4-2 가 같은 기호 | 006 결정에 다른 접두(예 `U97-1`) |

## 3. 확인 (12)
C1 pleiades ruleset 내용 · C2 `allow_merge_commit: true` · C3 서비스 CI(`postgres:16` · … · fin 테스트 단계 없음 · fit CI 는 `npx tsc --noEmit`) · C4 `apps/*/.github` 무동작 · secrets 0 · M-1 에서 멈추면 새로 도는 것 없음 · C5 PR push 후 편도 · C6 수용 revert `-m 1` → 중간 · C7 M-5 revert 후 수용 무충돌(추론) · C8 닫기 키워드 ∩ 열린 이슈 = 0(10개 모두 closed · 4 PR + 6 이슈) · C9 (c) 결정성·증분 merge·경로 log/blame · C10 L2 + `file:` 동작(442 테스트) · C11 002·003·004 인용 원문 일치 · C12 R1 숫자 일치(단 (c) 모노 pack 은 11.45 MiB — 초안 "11.81~12.15" 와 분리).

## 4. 미확인 (8)
U1 코드 스팬이 `referenced` 막나(B2 로 불필요) · U2 같은 SHA 재 push 시 이벤트 중복 제거(보수적으로 "생긴다") · U3 대량 push 처리 상한 · U4 Codex 봇 쿼터 저장소 간 공유 · M-1 대형 PR(약 1,400 파일) 자동 리뷰 비용 · draft 로 미루기 · U5 서버 `claude -p` 와 로컬이 같은 계정인가(같으면 pleiades 세션 자체가 쿼터 공유) · U6 커밋 메시지 `@멘션` 알림(`@` 무해화 선택지) · U7 pleiades push protection 이 M-1 push 를 막나(fin 문서 `PRIVATE KEY` 헤더 플레이스홀더 · 가능성 낮음) · U8 X10 재현성 · `claudeMdExcludes` 효과.

## 5. 개정 시 반드시 반영
1. §3-3 표를 [S2] 로 갱신(미측정 잔여 X4·X5·X6·X8 · U1~U8)
2. **Q49: (a) 탈락 · (c) 권고** + ① 전 형식 비링크 치환 ② push 전 grep-0 게이트 ③ 조상 가드 ④ filter-repo·git 버전 기록 ⑤ 서비스 SHA 트레일러. #97 이 `git subtree` 를 명시했으므로 **D-1 방법 변경으로 사용자에게 묻는다**. (b) 는 N1 메시지 게이트 필요
3. N4 문구 · 4. N3 근거 · 5. N6 순서·8절·measured-facts · 6. N8 · 7. N9 · 8. N10 + N7 되묻기 · 9. N5 · 10. I-표 추가(traffic · 5432 · 태그 · `@멘션` · push protection · Dependabot — 현재 `vulnerability-alerts` 404 · `automated-security-fixes enabled:false` → 켜지 않는다 1줄) · 11. N13 · 12. N11 · 13. N12 · N15 · Q56 비링크 · 14. N16 · N17 · C12

## 6. 사용자 결정 영향
| # | 사실 | 결정 |
|---|---|---|
| F1 | https fetch·`ls-remote` 는 소유자 traffic 통계에 집계(운영 영향 0 · 쓰기 0) | 원칙 경계 |
| F2 | (a) subtree 이력 포함은 원칙 위반(myFinance#494 · myFitness#108 `referenced` · 편도). (b) 경로 이력 없음 · pull 메시지 유입. (c) 이력·경로·blame 보존 + 참조 무해화(실측) — 단 `git subtree` 아님 | #97 D-1 방법 재결정 |
| F3 | 서비스 dev 무보호(force-push 가능) · pleiades 는 감지만 | 수용 안정성 |
| F4 | 서버 advisor 와 로컬 Claude 가 같은 계정이면 pleiades 존재 자체가 쿼터 공유(미확인) | 원칙 적용 범위 · L-7 |
| F5 | 첫 목표의 "검증 봇" 을 초안이 뺐다 | D-4 · Q53 |
| F6 | 로컬 5432 는 사용자 인스턴스 · `.env.example` 기본값이 그곳 | M-4 DB 위치 |
| F7 | fin 서비스 하네스가 fin 파일을 읽는 순간 로드 | Q58 · 차단 수단 |
| F8 | 1a-4 대상이 90일 fin 커밋 29%(17/59) · fit 1a-3 대상 4/158 | M-5b 시점 · Q54b |

## 7. 결론
정정 19(블로커 2). (a) subtree 이력 포함은 서비스 한정 참조 2건이 push 시 myFinance#494·myFitness#108 타임라인에 `referenced` 이벤트(문서 확정 · 편도) — 원칙 위반. 초안 (c) 의 소유자 포함 코드 스팬 치환은 3,276건을 서비스 참조로 바꾸는 역효과. Q49 는 (c) + 비링크 치환·grep-0 게이트·조상 가드로, D-1(`subtree` 명시) 변경은 사용자에게 재질의. fin build DB 요구 · 서비스 dev 무보호 · 중첩 하네스 로드 · 검증 봇 누락 반영. 초안으로 되돌린다.
