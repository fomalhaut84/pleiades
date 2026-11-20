# 008 단계 4 초안 r3(W3) 감사 — 3회차 · 좁힌 범위 (AU3)

읽기 전용(reversibility-auditor · 2026-11-20 · HEAD `fb50f4b9`). 보고를 오케스트레이터가 옮겼다.
**결론: 새 정정 10(high 0 · mid 3 · low 7).** high 계열(검사기를 거치지 않은 detail 이 모델로) 재발 없음 — D0 축소가 통했다. **전부 규칙 · 문구 · 대장 수준 → 직접 반영 가능**(C3 은 보수 기본값 권고). 4회차가 필요하면 C1 · C3 · C8 반영분만.

## 1. AU2 대조표 검증

| AU2 | W3 반영 | 새 오류 |
|---|---|---|
| N4 | §3-2 ③ · CR-5 낡은 pending · 손 배포 잔여 위험 | 낡은 pending 트리가 pending 태그가 아닐 수 있다 → 원장 태그 오류 · 재분석 막힘(C1) |
| N5 | 창 t0 기준 · 잔여 위험 | t0 는 시간대 없는 로컬 시각 문자열(C10) |
| N6 | (ii) 비용 ①~⑥ | 겹 ② "열기 금지" · 겹 ③ · 번들 범위 누락(C3) · probe rc 규칙 미정(C4) |
| N7 | §3-7 재작성 | 분석 파일 손상 때 전체 상한 초과 누락(C5) · [M47] "기다린다" 과장(C6) · `시작` · 예약 순서 미정(C7) |
| N8 | 좁힘 · NFKC · 통과 벡터 | 없음(전각 `＄（` · U+FF40 은 NFKC 로 `$(` · 백틱) |
| N10 | CR-3 fstat nlink | C3 과 충돌 |
| §5 | §3-1 · ⑤ | 없음 |
| N1 · N2 · N3 · N9 | §3-3 보존 블록 | 보존 확인 |

## 2. 주장 판정

| # | 주장 | 판정 | 근거 |
|---|---|---|---|
| 1 | ③ / CR-5 수집기와 같은 낡음 기준 · 섞인 트리는 오답에 그친다 | 부분 정정 | 값 · 판정 같음(`holdMin: 20` collect.cjs:42 · `now - pending.mtimeMs >= holdMin*MIN` :245 · `deploy-stale:<app>` :247). 낡은 pending 트리가 pending 태그라는 보장 없음: ① checkout 되돌리기 실패 `stop 4`(release-inplace.sh:134) ② C2 중 신호 `exit 130` — 트리 일부만(:179 · :277) ③ C4 실패 — 소스 V · 도는 빌드 P(:316-322) ④ 런북 R-8 손 되돌리기 = `deploy.sh` 직접(release-inplace.md:244-247) — 트리 P · pending=V 잔류. 경로 검사는 CR-3 · CR-4 가 지킨다 → 피해는 오답(확인) · 원장 태그 규칙 틀림(C1) |
| 2 | (ii) 비용 ①~⑥ · startSession 무변경 시험 하나로 Q148 | 부분 정정 | 겹 ② 가 `src/local/**` · 번들에서 `open(` · `openSync` 금지(helpers/local.ts:38 · fields.ts:3 "열기도 하지 않는다") — CR-3 fd 방식과 정면 충돌 · 겹 ③ 은 READERS 만(local-write-zero.test.ts:131 · :138) · 번들 검사는 host-main.ts 만(:96). Q148 조건부 확인 — startSession 은 발견 선언으로만 mcp-config(advisor.ts:170-183) · local 명령은 ctx.registry(domains.ts:263-268) → 질문 쪽 레지스트리 · 호스트 진입점에서 코드 리더를 빼는 것(①②)이 전제 · 그 아래 켬/끔 바이트 동일 시험 하나로 충분 |
| 3 | §3-7 손상 분리 · 예약/정산 · 시작/중단 · Inflight · 옛 판 | 부분 정정 | 옛 판 초과 ≤ [X4] 확인(spend.ts:30-50) · 등급 중간 확인 · 손상 때 0 이면 같은 초과(C5) · 종료 대기 = 최대 `SHUTDOWN_GRACE_MS` 10 s(main.ts:20 · :82) · pm2 `kill_timeout` 15 s(pleiades-adv.config.cjs:26) → 배포 시간 증가 0 · 분석은 잘린다(C6) · `시작` · 예약 사이 크래시 순서에 따라 이중 청구(C7) |
| 4 | D0 메타 원문 0 | **확인**(C8 · C9 단서) | 관측 호출 17곳 전수(collect.cjs:123-713) · app · role · src = 코드 상수 또는 `LOG_NAME` 포착 (fin\|fit\|adv\|hrm)×(web\|bot\|mcp\|api)(:109 · :455) · **`host·<fs>·<kind>` role = `DISKS` 키 `home` · `backup` 상수(:86-89) · kind = `usage`/`inode` 상수(:709) — 외부 명령 출력 아님 · W3 §9-4 우려 근거 없음** · pm2 jlist 이름은 `ROLES_OF` 기대 목록 조회만(:177 · :185) · 외부 문자열은 detail 에만(`status:` · expiry id · tag/cls/code/artifact :195 · :675 · :386 · :407) · 부분집합: fp · app · role · src · sev 는 ops 리더가 이미 낸다(ops.ts:60 · events :1191) · first/last 숫자 · kind 상수 · **태그만 새 문자열**(표지 파일 · C9) |

## 3. 새 정정

| # | 심각도 | W3 위치 | 무엇 | 근거 | 고칠 방향 |
|---|---|---|---|---|---|
| **C1** | mid | §3-2 ③ · CR-5 · §3-6 deploy 칸 | "원장 태그 = pending 값" 이 틀릴 수 있다(되돌리기 실패 · 신호 · 손 R-8). 원장에 V 가 적힌 뒤 V 가 실제 배포되면 last-ok = V = 원장 태그 → 재분석 조건 거짓 → **실제 V 트리로 재분석 안 됨** | release-inplace.sh:134 · :179 · :277 · release-inplace.md:244-247 | 메타 · 결과 표지 = "트리 미확정"(태그 값 안 씀) · 원장 태그도 `미확정` · 재분석 규칙 "미확정 ≠ 어떤 태그" · 시험 하나 |
| C2 | low | §3-2 ③ "같은 상수 시험" | 수집기는 체크아웃 밖 커밋 고정 설치 → 저장소 시험은 소스 상수만 · 운영 판 일치 보장 못함 · 비교식(`>=` · mtime)도 고정 | collect.cjs:42 · :245 · §8 | 시험 범위 = 소스 상수 + 비교식 · 운영 판 차이는 §8 유효기간 |
| **C3** | mid | §3-4 (ii) 비용 · CR-3 · CR-9 | 겹 ② 가 `open(` 금지 → CR-3 fd 방식은 겹 ② 완화가 필요한데 비용에 없음 · 겹 ③ · 번들 검사도 READERS · host-main.ts 만 | helpers/local.ts:38 · fields.ts:3 · local-write-zero.test.ts:73-80 · :96 · :131 · :138 | **권고: fd 안 쓴다** — `lstat` + `statSync().nlink===1` + `readFileSync` · TOCTOU 는 Q153(같은 OS 사용자) 아래 잔여 위험 · 겹 ② 무변경 · 비용 ⑦ = 겹 ②③ · 번들 검사를 분석 리더 목록 · 분석 호스트 진입점까지 · `ALLOWED_IMPORTS` 새 모듈 |
| C4 | low | (ii) ⑤ 분석 경로 기동 점검 | probe 에 줄을 더할 때 rc 규칙 미정 · adv-inplace C4 는 probe rc≠0 이면 배포 중단 · systemBytes(ready) 에 섞이면 안 됨 | adv-inplace.sh:189-193 · probe.ts:26-29 · main.ts:58 | "정보 줄만 · rc · 시스템 바이트 무관" 명시 · 시험 |
| C5 | low | §3-7 분석 파일 손상 | 손상 = 0 으로 보면 그날 쓴 분석 몫이 안 보인다 → 전체 상한 최대 [X4] 초과 · 권한 오류 · 날짜 불일치도 `broken` 으로 묶인다 | spend.ts:36-49 | 손상 때 질문 경로는 분석 몫을 **[X4]** 로 본다(초과 0 · 질문 계속) · 질문 파일 손상이면 분석도 정지 |
| C6 | low | [M47] · Inflight 행 | 종료는 정산을 최대 10 s · 더 긴 분석은 끊겨 `시작` → `중단` · 4b-5 adv 배포는 fin · fit 태그를 안 바꿔 그 지문 재분석 없음 · 배포 시간 증가 0 | main.ts:20 · :80-83 · advisor.ts:140-143 · pleiades-adv.config.cjs:26 | [M47] = "최대 SHUTDOWN_GRACE_MS · 넘으면 예약분 남음" · `중단` 은 다음 주기 1회 재시도 허용 또는 관찰 지표에 `중단` 수 |
| C7 | low | §3-2 원장 · §3-7 예약 | "같은 자리" 가 순서 미정 · 예약 → 크래시 → `시작` 없음 → 재기동 뒤 이중 청구 | spend.ts:71 | 순서 고정: 원장 `시작` → 예약 → 실행 → 정산 → `완료` · `시작` 쓰기 실패면 실행 안 함 |
| **C8** | mid | §3-2 "메타 = 입력 전부" | "버림 목록 `fp.ignored` 를 같은 출처로 공유" 모순 — 그 목록 12칸은 판별 ① 이 쓰는 `posted` · `deferred` · `postedQuiet` 과 횟수 원천 `firstCount` · `pending` · `days` 도 버린다 · state fp 에 `count` 칸 없음 | ops-shape.json `fp.ignored` · collect.cjs:745-746 | 원문 위험 칸 상수 `material` · `detail` · `scope` 를 따로 두고 ops-shape 가 포함하는지 시험 · 또는 "판별은 원 객체 · 입력은 FP_SHAPE 투영 + 명시한 숫자 칸" · 횟수 원천 칸을 정한다 |
| C9 | low | §3-2 메타 · 태그 | 태그 = ops 리더가 안 내는 새 문자열(비공개 표지 파일 본문) | release-inplace.sh:202 · :284 | `TAG_RE` 불일치면 `미확정` · C1 과 같은 자리 |
| C10 | low | 재분석(N5) | 창 t0 = 시간대 없는 서버 로컬 문자열(`date '+%F %T'`) · 수집기는 문자열끼리만 비교 · 지문 `last` 는 epoch ms | release-inplace.sh:305 · :352 · collect.cjs:230-231 · :349 | 변환 규칙(서버 시간대 가정) 명시 또는 `last` 를 같은 형식 문자열로 · 시험 |

## 4. 과소평가

§3-7 상한 초과 경로가 옛 판 되돌리기 하나라고 적혔으나 분석 파일 손상(C5)도 같은 폭. (ii) 비용에 겹 ② 원칙(fd 없음)이 걸린다(C3) — fd 방식을 고집하면 겹 ② 완화 · 등급 중간. 나머지 등급(켬 표지 즉시 · revert 중간 · 나간 메타 편도) 확인.

## 5. 합계

새 정정 10(mid 3 · low 7) · 주장 확인 1(조건부 #4) · 부분 정정 3. 직접 반영 가능 · 같은 계열 재발 없음.
**범위 밖 관찰:** §3-2 ⑤ — dry-run 행엔 `blocked` 가 안 붙어(AU2 N1) dry-run 기간의 비밀 후보 지문은 차단 제외 권고를 빠져나간다 · 판별 ① "posted 숫자" 도 dry-run commit 으로 참 — D0 에선 새 문자열이 없어 보수 규칙의 구멍일 뿐.
