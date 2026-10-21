# 1a-1 구현 계획 착수 직전 재감사 — `_workspace/1a-1/01_plan_1a1.md`

감사 2026-09-10 · `reversibility-auditor` · **읽기 전용** (대상 저장소·pleiades 워킹트리 쓰기 0 · 이 파일 1개만 작성)
실험 장소: `/private/tmp/claude-501/-Users-sagan-workspace-pleiades/c1ca391c-4ed8-4228-ae3f-ffcfa826fc53/scratchpad/audit-1a1/`
환경 node **v20.18.0** / npm **10.8.2** / tsc **5.9.3** / darwin 25.6.0 (1a-0·#32 I1 과 동일)

**감사 대상 ref (모드 I — 통합 로드맵이므로 worktree):**

| 저장소 | 경로 | ref | HEAD | 워킹트리 |
|---|---|---|---|---|
| myFinance | `~/workspace/pleiades/repos/myFinance` | `integration/pleiades` | `6542152` | clean (`git status --porcelain` 무출력) |
| myFitness | `~/workspace/pleiades/repos/myFitness` | `integration/pleiades` | `2195854` | clean (〃) |
| pleiades | `~/workspace/pleiades` | `dev` (`785a242`) | — | clean |

`node_modules/grammy` 는 워킹트리 전용이라 ref 지정이 불가능하다 — **위 두 ref 가 체크아웃·clean 임을 먼저 확인하고 읽었다**(C-1~C-7 와 같은 절차).

---

## 0. 판정 요약

| # | 주장 | 판정 |
|---|---|---|
| **1** | **S-2** — 패키지가 grammy 를 `import type` 으로도 참조할 수 없다 (미선언 시 `prepare` TS2307) | **정정** — 전반부는 재현(확인), **일반화가 틀렸다**. 루트 `peerDependencies` 면 통과한다 |
| **2** | 구조적 `TelegramApi` 가 grammy `Api.sendMessage` 와 호환된다 | **정정 — 블로커.** 계획 §2 원문은 fin 1.44.0 · fit 1.42.0 **양쪽에서 TS2322**. 수정안 4종 검증 |
| **3** | **S-3** — 분할을 Transport 안에 두면 청크 중복 전송 / 대안이 §4-3 제약 2 둘째 형태에 부합 | **확인** (논리·문구 대조 통과) **+ 정정 1건**(계획이 제시한 `maxLength: Infinity` 탈출구가 S-3 결함을 1b 에 되살린다) |
| **4** | **S-1** — 003 에 `Content` 정의 0건 | **확인** (docs 전체 0건) |
| **5a** | fin 폴백은 새 예산 4회 · fit 은 `attempt--` 예산 보존 · 계획은 fit 채택 | **확인** (003 §3-1 정본과 일치) |
| **5b** | fin `isParseError` 는 400 도 잡고 계획은 fit `isHtmlParseError` 만 쓴다 | **확인** (정본 일치) **+ 미기록 관측 변경 1건 통지** |
| **5c** | `components` 마지막 청크 · `ref` = 마지막 청크가 fit `first.messageId` 소비처를 깨지 않는가 | **확인** — 단 **계획의 근거 문구는 정정** (`telegramMessageId` **읽기 경로 0건**) |
| **5d** | (추가) `csvEnv` 가 fin `.map(Number).filter(!isNaN)` 를 버린다 | **정정** — 의미 변화가 `total`·DB `recipientCount` 에 닿는다. env 실값은 **미확인** |
| **6** | **#32 I1 (b)** 게이트 5줄 + `@types/node ^20` + `typecheck:test` · `prepare` 무영향 | **확인** (전 항목 재현 — 주입 exit 2 · 파손 시 `prepare` exit 0 · lockfile +18) |
| **7** | 되돌리기 §6 등급·시점 | **확인** (003 §5-2 1a-1 행 · §4-2 확정 5 와 일치) |
| **8** | 003 §5-1 흡수 목록 누락 | **정정 3건** — `escapeHtml` 발췌 · `error.ts` shim 결정 · **003 §1-4 요구사항 1 (`Route → Transport` 매핑)** |

**정정 6건(1·2·3·5d·5c 문안·8) → 이 계획은 초안 상태로 되돌아간다.** 그중 **#2 는 착수 전 반드시 고쳐야 하는 블로커**다.

---

## ⚠ 가정을 뒤집는 값 3건

| # | 무엇 | 왜 계획이 바뀌나 |
|---|---|---|
| **A-1** | **계획 §2 의 `TelegramApi` 에 `bot.api` 를 대입할 수 없다.** fin grammy 1.44.0 · fit 1.42.0 양쪽에서 `error TS2322`. 원인은 `parse_mode?: 'HTML'`(grammy `ParseMode` 보다 **좁다**)과 `reply_markup?: unknown`(grammy 유니온보다 **넓다**)이 **메서드 양변성의 두 방향을 동시에 막는 것**. 즉 S-2 를 피하려고 만든 타입 자체가 1a-3·1a-4 에서 컴파일되지 않는다 | 시그니처를 고쳐야 한다. 검증된 수정 4종(§2). **최소 수정은 `parse_mode` 를 넓히는 것 하나**. 추가로 **프로퍼티(화살표) 문법으로 쓰면 수정안으로도 실패**한다 — 메서드 단축 문법이 계약의 일부다 |
| **A-2** | **S-2 의 결론 "grammy 를 `import type` 으로도 참조할 수 없다" 는 거짓이다.** git 의존성 준비 명령이 **`--include=peer`** 를 포함하므로, 루트 `peerDependencies: {grammy}` 를 선언하면 임시 클론이 grammy 를 설치해 **`prepare` exit 0 · 소비자 설치·`npm ci` 전부 통과**(실측). 루트 devDep 도 통과하며 **소비자 트리 누수 0**(20 K) | `build-config.test.ts:5-6` 주석의 *"1a-1 의 grammy peerDep `.d.ts`"* 전제는 **성립한다**. 계획 §0 S-2 의 *"성립하지 않는다"* 와 D-3 대안표(대안이 "루트 devDep" 하나뿐)를 고쳐야 한다. 결론(구조적 타입 채택)은 유지 가능하나 **근거를 실측값으로 교체**해야 한다 |
| **A-3** | **003 §1-4 요구사항 1 이 계획에 없다.** *"`Route → Transport` 매핑을 설정으로 뺀다. 이걸 1a 에서 안 하면 **1b 의 되돌리기가 'env 플립'에서 '코드 revert + 재배포'로 한 등급 올라간다**."* 계획 `NotifierConfig.transport` 는 **단일 Transport**라 이 매핑을 표현할 수 없다 | 되돌리기 비용 문서인 이 저장소에서 **미래 등급을 한 칸 올리는 누락**이다. 지금 넣으면 config 표면 1개(포트 무변경), 나중에 넣으면 소비자 2곳이 이미 config 를 박은 뒤다 |

---

## 1. S-2 — `import type { Bot } from 'grammy'` 와 소비자 `prepare`

### 재현 절차 (전부 스크래치패드)

```bash
S=…/scratchpad/audit-1a1
rsync -a --exclude node_modules --exclude dist ~/workspace/pleiades/packages/ $S/pkgsrc/packages/
cp ~/workspace/pleiades/package.json $S/pkgsrc/package.json      # ALT-d 위임형 원본 그대로
printf 'node_modules\ndist\n' > $S/pkgsrc/.gitignore
git -C $S/pkgsrc init && git add -A && git commit -m …
# 소비자: 대상 저장소가 쓸 형태 — 의존성 "키"가 @pleiades/notify
{"dependencies":{"@pleiades/notify":"git+file://$S/pkgsrc#<sha>"}}
npm install --cache $S/npmcache
```

| 케이스 | 커밋 | 루트 `package.json` 의 grammy | `npm install` | 소비자 `node_modules` |
|---|---|---|---|---|
| **A 대조군** — grammy import 없음 | `84df1c9` | 없음 | **exit 0** (`added 1 package … 2s`) | `@pleiades/notify` 만 · **20 K** · `require(…).VERSION` = `0.0.0` |
| **B — `import type { Bot }` · 미선언** | `58d8d10` | 없음 | **실패 `npm error code 2`** | **미생성** |
| **C — 같은 import + 루트 `peerDependencies: {grammy:"^1.41.0"}`** | `1a2d540` | peer | **exit 0** (`added 11 packages`) | grammy **1.46.0** 포함 · 2.9 M |
| **D — 같은 import + 루트 `devDependencies: {grammy:"^1.41.0"}`** | `b54c659` | dev | **exit 0** (`added 1 package`) | `@pleiades/notify` 만 · **20 K** (grammy 누수 **0**) |
| **F — peer 범위 `^1.44.0` · 소비자 grammy `1.42.0`** | `3c6ffc8` | peer | **실패 `ERESOLVE`** | 미생성 |

**B 의 출력 (S-2 전반부 = 확인):**

```
npm error > pleiades@0.0.0 prepare
npm error > tsc -p packages/notify
npm error packages/notify/src/index.ts(5,26): error TS2307: Cannot find module 'grammy' or its corresponding type declarations.
npm error npm error command failed  /  command sh -c tsc -p packages/notify
$ ls node_modules → No such file or directory
```

→ **계획 §0 S-2 의 실패 경로 서술(TS2307 → `npm install` 실패 → 두 실서비스 `npm ci` 동시 파손)은 정확히 재현된다.** 1a-0 `exclude` 누락과 같은 경로다.

**C 가 통과하는 이유 (S-2 일반화 = 정정).** B 의 실패 로그에 npm 이 임시 클론에서 실제로 돌린 명령이 그대로 찍힌다:

```
npm install --force --cache=… --no-save --no-audit --include=dev --include=peer --include=optional …
```

**`--include=peer`** 가 들어 있다. 그래서 루트 peerDep 는 임시 클론에 설치되고 `prepare` 가 통과한다.
설치 결과 `dist/index.d.ts` 에는 `import type { Bot } from 'grammy';` 가 **그대로 남고**, 소비자 쪽에서 grammy 로 해석된다(fin·fit 은 이미 grammy 보유).

**세 형태의 실측 비용** (같은 캐시·연속 측정 · `npm ci` ×3 중앙값):

| 형태 | 소비자 `npm ci` (warm) | cold 캐시 `npm ci` / 캐시 크기 | 소비자 `node_modules` | 위험 |
|---|---|---|---|---|
| **구조적 타입 (계획 채택 · grammy 0)** | **1.56 s** | **2.04 s / 19 M** | 20 K | 없음 |
| 루트 **devDep** grammy | 1.88 s | **2.92 s / 22 M** | 20 K (누수 0) | 3중 버전 관리 |
| 루트 **peerDep** grammy | 1.90 s | 미측정 | 2.9 M(신규 소비자) · **기존 grammy 보유 소비자는 단일 사본 · ERESOLVE 없음**(consumer-e: `grammy ^1.41.1` + peer `^1.41.0` → 사본 1개) | **peer 범위가 소비자 설치본보다 좁으면 `npm ci` 가 ERESOLVE 로 죽는다**(케이스 F 실증). fin `^1.41.1`(1.44.0) · fit `^1.42.0`(1.42.0) 이라 범위는 `^1.41.0` 이하로 유지해야 한다 |

### 판정 — **정정**

- **확인 부분:** grammy 를 **어디에도 선언하지 않고** import 하면 소비자 `npm install` 이 통째로 깨진다. 계획이 §5 e2e 에 *"임시 클론 `prepare` 통과"* 를 넣은 것은 옳다 — **유지**.
- **정정 부분(문장 단위):**
  - 계획 §0 S-2 제목 *"**패키지는 grammy 를 `import type` 으로도 참조할 수 없다.**"* → **"패키지가 grammy 를 참조하려면 루트 `package.json` 에 선언해야 한다 — 선언 없이 `import type` 만 쓰면 소비자 `prepare` 가 TS2307 로 깨진다."**
  - 같은 칸 *"`build-config.test.ts:5-6` 주석의 '1a-1 의 grammy peerDep .d.ts' 전제는 **성립하지 않는다**"* → **삭제.** 실측상 peerDep 경로는 성립한다. (그 회귀 테스트는 그대로 둔다 — `skipLibCheck` 안전 조건 자체는 유효하다.)
  - 계획 §8 **D-3 대안 칸** *"루트 devDep `grammy`(소비자 `npm ci` 마다 추가 다운로드 · 두 저장소 버전과 3중 관리)"* → 대안이 **둘**이고 값은 위 표다. devDep 의 실제 대가는 **warm +0.3 s · cold +0.9 s · 캐시 +3 M · 소비자 트리 누수 0** 이며 *"소비자가 grammy 를 한 번 더 받는다"* 는 **소비자 트리가 아니라 임시 클론** 이야기다.
- **결론(구조적 타입 채택)은 뒤집지 않는다.** 세 형태 중 가장 싸고 위험(ERESOLVE·3중 버전)이 없다. 다만 **근거가 바뀌었으므로 D-3 의 사용자 제시 문안을 다시 써야 한다.**

### 부수 실측 1건 — 설치 이름 (계획 §4 E6 에 영향)

`npm install "git+file://…#<sha>"` 를 **이름 없이** 실행하면 루트 `name` 이 `pleiades` 이므로 **`node_modules/pleiades/`** 로 들어가고 `require('@pleiades/notify')` 는 `MODULE_NOT_FOUND` 다(1a-0 M1 케이스 C 와 같은 현상).
**의존성 키를 `"@pleiades/notify": "<git url>"` 로 선언하면** `node_modules/@pleiades/notify` 로 들어가고 `require('@pleiades/notify').VERSION` = `0.0.0` (실측, 케이스 A·D).
→ **E6 는 "키를 `@pleiades/notify` 로 선언한 소비자 `package.json`" 형태로 고정해서 적어야 한다.** 지금 문안(`git+file://…#<sha>` 설치 → `require('@pleiades/notify')`)은 둘 중 어느 쪽인지 구분되지 않는다.

---

## 2. 구조적 `TelegramApi` ↔ grammy `Api.sendMessage` — **블로커**

### grammy 원문 (양쪽 저장소 동일 줄)

```
repos/myFinance/node_modules/grammy/out/core/api.d.ts:156   (grammy 1.44.0)
repos/myFitness/node_modules/grammy/out/core/api.d.ts:156   (grammy 1.42.0)
  sendMessage(chat_id: number | string, text: string,
              other?: Other<R, "sendMessage", "chat_id" | "text">,
              signal?: AbortSignal): Promise<Message.TextMessage>;
  // Other<R,M,X> = Omit<Payload<M,R>, X>   (api.d.ts:6)
```

### 프로브 (계획 §2 원문 그대로 · `strict` · `skipLibCheck` · 각 저장소 `node_modules/grammy` 를 `paths` 로 참조 · **읽기만**)

```bash
tsc -p tsconfig.<repo>.json   # paths: { "grammy": ["<repo>/node_modules/grammy"] }, types: []
```

**결과 — fin 1.44.0 · fit 1.42.0 양쪽 동일:**

```
probe.ts(12,7): error TS2322: Type 'Api<RawApi>' is not assignable to type 'TelegramApi'.
  Types of property 'sendMessage' are incompatible.
      Types of parameters 'other' and 'other' are incompatible.
        Type '{ parse_mode?: "HTML" | undefined; reply_markup?: unknown; } | undefined' is not
          assignable to type 'Other<RawApi, "sendMessage", "chat_id" | "text"> | undefined'.
            Types of property 'reply_markup' are incompatible.
              Type 'unknown' is not assignable to type
                'InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove | ForceReply | undefined'.
```

**원인 진단.** 메서드 단축 문법의 파라미터는 **양변성**이라 두 방향 중 하나만 통과하면 되는데, 계획 타입은 **두 방향 다 막는다**:
- `Api` → `TelegramApi` 방향: grammy 의 `parse_mode?: ParseMode`("HTML"|"Markdown"|"MarkdownV2") 가 계획의 `parse_mode?: 'HTML'` 에 **들어가지 못한다**.
- 역방향: 계획의 `reply_markup?: unknown` 이 grammy 유니온에 **들어가지 못한다**(위 에러가 보고한 쪽).

### 수정안 검증 (같은 프로브 · `send2` = 캐스트 없이 `{parse_mode:'HTML', reply_markup: m}` 호출 포함)

| 안 | `other?:` | fin 1.44 | fit 1.42 |
|---|---|---|---|
| 계획 원문 | `{ parse_mode?: 'HTML'; reply_markup?: unknown }` | **TS2322** | **TS2322** |
| **V1 (권고)** | `{ parse_mode?: string; reply_markup?: unknown }` | **통과** | **통과** |
| V2 | `Record<string, unknown>` | 통과 | — |
| V3 | `unknown` | 통과 | — |
| V4 | `{ parse_mode?: 'HTML' \| 'Markdown' \| 'MarkdownV2'; reply_markup?: unknown }` | **통과** | **통과** |
| V5 | `{ parse_mode?: 'HTML'; reply_markup?: object }` | **TS2322** (`object` 도 유니온보다 넓다) | — |
| **V8 — 프로퍼티(화살표) 문법 + V1 형태** | 〃 | **TS2322** (양변성 미적용) | — |

→ **최소 수정은 `parse_mode` 를 넓히는 것 하나**다. `reply_markup?: unknown` 은 그대로 둬도 된다(양변성이 반대 방향으로 성립).

### 판정 — **정정 (블로커)**

계획 §2 의 다음 두 줄을 고치지 않으면 **1a-3(fit)·1a-4(fin) 에서 `createTelegramTransport({ api: bot.api })` 가 컴파일되지 않는다** — 1a-1 자체는 grammy 없이 타입체크가 통과하므로 **게이트에 걸리지 않고 통과한 뒤 다음 단계에서 터진다.**

```ts
// 현행 (계획 §2:97-100) — 대입 불가
export interface TelegramApi {
  sendMessage(chatId: string | number, text: string,
              other?: { parse_mode?: 'HTML'; reply_markup?: unknown }): Promise<{ message_id: number }>;
}
// 권고 (V1 · V4 도 가능)
export interface TelegramApi {                      // ★ 메서드 단축 문법 필수 (프로퍼티 문법이면 V8 로 실패)
  sendMessage(chatId: string | number, text: string,
              other?: { parse_mode?: string; reply_markup?: unknown }): Promise<{ message_id: number }>;
}
```

**계획에 추가로 넣을 것 (검증 없이는 재발한다):**
- §4 E4 또는 §5 에 **"grammy 대입 프로브"** 를 넣는다. 패키지에는 grammy 가 없으므로 **패키지 테스트로는 잡히지 않는다** — `repos/*` 의 `node_modules/grammy` 를 `paths` 로 참조하는 **스크래치패드 tsc 프로브**(위 명령)를 E6 소비자 e2e 옆에 두고, 결과를 measured-facts 에 적는다. 두 버전(1.44.0·1.42.0) 모두 돌린다.
- §3 제약 1 행의 *"테스트로 고정(`grep` 단언)"* 은 **문자열 부재만** 보증한다. **대입 가능성은 보증하지 않는다** — 위 프로브가 그 자리를 메운다.
- `InlineKeyboard` 인스턴스 → `reply_markup?: unknown` 은 **문제없다**(프로브 P3, 오류 0).

---

## 3. S-3 — 분할 위치와 재시도·폴백 단위

### (가) 중복 전송 논리 — **확인**

원문 대조:

```
repos/myFinance/src/bot/utils/telegram.ts:61-73
  61  const chunks = splitMessage(html)          ← 분할이 재시도보다 바깥
  62  for (const chunk of chunks) {
  64      await withRetry(() => bot.api.sendMessage(chatId, chunk, { parse_mode: 'HTML' }))
  66      if (isParseError(error)) {
  68        await withRetry(() => bot.api.sendMessage(chatId, plain))
```

fin 은 **청크 단위로 재시도·폴백**한다(계획 인용 줄 번호 정확). `Transport.send()` 안에 분할을 넣고 재시도를 코어에 두면 `send()` 는 **부분 성공 후 throw** 하는 비멱등 연산이 되고, 코어의 재시도가 **이미 나간 청크를 다시 보낸다.** 논리 성립.
Q10-L ①(분할 통일)로 fit 에도 다중 청크가 생기므로(C-2: `scheduler.ts:34` LLM 일일 리포트는 정적 상한 없음) **신규 결함**이라는 서술도 성립.

### (나) 제약 2 문구 대조 — **확인**

003 §4-3 제약 2 원문: *"길이 분할은 **변환 뒤**, 즉 `Transport` 경계 안쪽에 있거나, **포트가 "변환 후 길이 예산"을 코어에 알려주는 형태**여야 한다."*
계획의 `readonly maxLength: number` + 코어 분할은 **둘째 형태에 문자 그대로 부합**한다. `TelegramTransport` 는 변환이 항등(`parse_mode:'HTML'` 로 원문 전달)이라 예산이 정확하다는 서술도 맞다.

### (다) **정정 1건** — 탈출구가 S-3 결함을 1b 로 옮긴다

계획 §0 S-3 마지막 문장: *"변환이 길이를 바꾸는 어댑터(1b Discord)는 **내부 분할 + `maxLength: Infinity`** 또는 보수 예산 — 제약 2 가 허용한 두 형태를 포트 계약에 명문화"*.

`maxLength: Infinity` + 어댑터 내부 분할은 **제약 2 의 첫째 형태**이고, 그 형태가 바로 (가)에서 반증한 조합이다 — 코어가 재시도·폴백을 그대로 들고 있으면 **Discord 어댑터에서 청크 중복 전송이 난다.** 계획이 자기 발견을 미래로 미루는 문안이다.

**포트 계약에 다음을 명문화할 것:**
> `maxLength` 가 유한하면 **코어가 분할하고 `send()` 는 청크 1건 = 멱등 단위**다. 어댑터가 내부 분할을 선택하면(`maxLength: Infinity`) **재시도·폴백의 소유권이 어댑터로 넘어가고, 코어는 그 `send()` 를 재시도하지 않는다.** 두 형태를 섞을 수 없다.

`splitMessage(text, Infinity)` 자체는 안전하다 — fin 정본 첫 줄이 `if (text.length <= maxLength) return [text]` 이므로 단일 청크를 돌려준다(`formatter.ts:53`).

---

## 4. S-1 — 003 의 `Content` 정의

```bash
grep -rn --binary-files=text -E "interface Content|type Content" docs/          # → 0건 (docs 전체)
grep -n  --binary-files=text "Content" docs/specs/003-notify-package.md         # → 8건, 전부 참조
grep -n  --binary-files=text "Content" docs/specs/002-platform-direction.md     # → 0건
grep -rn --binary-files=text -E "interface Content|type Content" _workspace/    # → 계획 자신(01_plan_1a1.md:77) 뿐
```

003 의 8건: `:112`(§1-4 요구사항 2 서술) · `:656`·`:661`(§4-2 정본 블록) · `:727`·`:732`(강등된 종전 블록) · `:763`(정정 ② ②안) · `:799`(정정 ③ 개정안) · `:827`(§4-3 제약 3).
**전부 참조이고 정의는 0건.** `_workspace/1a-1-prep/02_writer_1a1prep.md` 도 3건 전부 인용이다.

### 판정 — **확인**

계획이 `Content` 를 정의하는 것은 **불가피**하고, 사용자 결정(D-1)으로 올리는 처리도 맞다. 단 두 가지를 명시할 것:
- **`Content.format` 을 코어가 만든다**(폴백 시 `'plain'`)는 것은 003 §4-1(b) 가 *"파싱 실패 폴백은 채널 무관 로직"* 이라 명시했으므로 **정본 위반이 아니다.** 계획 §3 제약 3 칸의 해명(*"변환이 아니라 폴백 상태"*)에 **§4-1(b) 인용을 붙이면** 1b 에서 재론될 여지가 준다.
- 003 이 `Content` 를 정의하지 않은 채 §4-2 를 "정본 시그니처"라고 선언한 것은 **003 쪽의 빈칸**이다. 1a-1 확정 후 **003 §4-2 에 정정 블록으로 역반영**해야 정본이 자기 완결한다(계획 §4 E7 뒤 또는 별건).

---

## 5. 동작 동치 주장 — 원문 줄 대조

### 5a. 폴백 재시도 예산 — **확인**

| | 원문 | 동작 |
|---|---|---|
| fin | `telegram.ts:68` `await withRetry(() => bot.api.sendMessage(chatId, plain))` | **`withRetry` 를 새로 호출** → 예산 4회가 **새로 생긴다**(최악 HTML 4 + plain 4 = 8회 · 백오프 2+8+30 초 두 벌) |
| fit | `send.ts:59-62` `if (useHtml && isHtmlParseError(err)) { useHtml=false; attempt--; continue; }` | **같은 루프 안에서 예산 보존** |
| 003 §3-1 | *"폴백 시 재시도 예산 \| **myFitness**(`attempt--` 로 예산 보존)"* | — |

계획 §1 `deliver.ts` · §2 표 *"`attempt--`(**fit 정본 · 예산 보존**)"* → **정본 일치.**

### 5b. 폴백 판정자 — **확인** + 미기록 관측 변경 통지

```
repos/myFinance/src/bot/utils/telegram.ts:79-88   isParseError = (error_code === 400) || message.includes("can't parse")
repos/myFitness/src/bot/utils/error.ts:82-85      isHtmlParseError = /can't parse entities|Bad Request:.*entit/i.test(msg)
repos/myFinance/src/bot/utils/error.ts:98-101     isHtmlParseError — fit 과 동일 구현 (죽은 export · 003 §7-2)
```

003 §3-1: *"파싱 실패 폴백 판정 \| **myFitness `isHtmlParseError`**(공유 정규식). fin 로컬 `isParseError`(400 코드)는 광범위"* → 계획 **정본 일치**.

> **통지 (decision-writer · 003 §5-2 정정 ① 대상).** 이 선택은 **fin 의 폴백 트리거를 좁힌다.**
> 지금 fin 은 **모든 400** 에서 태그를 벗겨 재전송한다 — `"message is too long"` 같은 비-파싱 400 에서 plain 재전송이 **성공할 수 있는** 경로가 현존한다. 새 판정자는 그 경로를 없앤다(에러가 그대로 올라간다).
> 003 §5-2 **정정 ①** 은 fin 측 관측 변경을 **2건**(`rsu.ts` 신뢰성 · `lastError` sanitize)으로 열거했는데 **이것이 3번째 후보**다. 계획 §2 표에도 없다.
> **발생 빈도는 미확인** — 폴백 로그가 **양쪽 0건**이고(C-1) 계량 경로가 코드에 없다. *"관측 변경 0"* 을 주장하지 말고 **"빈도 미측정인 관측 변경 후보 1건"** 으로 적어야 한다.

### 5c. `components` 마지막 청크 · `ref` = 마지막 청크 — **확인** (근거 문구는 **정정**)

소비처 전수:

```bash
git -C repos/myFitness grep -n --text "telegramMessageId" integration/pleiades -- 'src' 'prisma' | cut -d: -f2-
```
```
prisma/schema.prisma:359   telegramMessageId String?
prisma/schema.prisma:367   @@index([telegramMessageId])
src/bot/notifications/auto-adjust.ts:418        telegramMessageId: String(sendResult.first.messageId),   ← 쓰기
src/bot/notifications/auto-adjust-cron.ts:97-99 telegramMessageId: sendResult.first ? String(...) : null, ← 쓰기
(+ migration.sql 3줄)
```

**읽기 0건.** 콜백 경로는 저장값을 쓰지 않는다 — `auto-adjust-callback.ts:308` 이 `ctx.editMessageReplyMarkup({ reply_markup: undefined })` 로 **콜백 컨텍스트의 메시지**를 직접 편집한다. 003 발견 9 정정(*"`@@index` 는 읽기 경로 0건인 죽은 인덱스"*)과 일치.

`first` 의 나머지 필드도 계획이 만족한다 — `auto-adjust.ts:419`·`auto-adjust-cron.ts:100` 이 `first.chatId` 를 `telegramChatId` 에 넣으므로 003 의 `first?: { target, ref }` 로 **양쪽 다 커버**된다.

- **판정: 확인.** `ref` 를 마지막 청크로 잡아도 **깨질 소비처가 없다.**
- **정정(문안).** 계획 §2 분할 행의 근거 *"키보드가 있으면 그 메시지 = callback 매칭 대상"* 은 **코드에 없는 소비를 설계 근거로 쓴 것**이다. 정확한 문장: *"`telegramMessageId` 는 쓰기 2곳뿐이고 읽기 0건이므로(발견 9 정정) 어느 청크의 ref 를 넣어도 현존 동작은 바뀌지 않는다. **키보드가 붙은 청크의 ref 를 넣는 것은 장래 읽기 경로가 생길 때를 위한 선택**이다."*
  근거를 이렇게 바꿔도 결론(마지막 청크)은 유지된다.

### 5d. (추가 발견) `csvEnv` 가 fin 파서와 다르다 — **정정**

```bash
git -C repos/myFinance grep -n --text "TELEGRAM_ALLOWED_CHAT_IDS" integration/pleiades -- 'src' | cut -d: -f2-
```
| 지점 | 함수 선언 줄 (계획 §0 표기) | env 읽는 줄 | 파서 |
|---|---|---|---|
| `src/bot/notifications/scheduler.ts` | 21 | 22 | `split · trim · filter(Boolean) · **map(Number) · filter(!isNaN)**` |
| `src/lib/cron.ts` | 13 | 14 | 〃 |
| `src/bot/notifications/budget-alert.ts` | 14 | 15 | 〃 |
| `src/app/api/alerts/history/[id]/retry/route.ts` | 29 | 30 | 〃 |
| `src/lib/ai/advisor-monitor.ts` | 199-204 (`TELEGRAM_ADMIN_CHAT_IDS`) | 199 | 〃 |
| fit `src/bot/notifications/send.ts` | 24-29 | 25 | `split · trim · filter(Boolean)` (문자열 유지) |

**계획 §0 의 줄 번호는 전부 함수 선언 줄로 정확하다.** 파싱 지점 5(fin 4 + ADMIN 1)도 맞다.

**그런데 계획 §1 `targets.ts` 는 fit 파서만 채택하고 fin 의 `.filter((n) => !isNaN(n))` 를 말없이 버린다.** 근거로 든 발견 10 은 *"`chatId: number` 20건이 파사드 뒤로 사라진다"* 이지 **비숫자 토큰의 처리**를 다루지 않는다. 차이:

| env 에 비숫자 토큰이 섞이면 | 지금 (fin) | `csvEnv` 후 |
|---|---|---|
| 그 토큰 | **조용히 탈락** | **대상에 포함 → 전송 실패 1건** |
| `total` (= `chatIds.length`) | 탈락 후 개수 | **탈락 전 개수 (증가)** |
| 파급 | — | 003 발견 19 가 *"값의 의미를 바꾸면 안 된다"* 고 못 박은 **DB 컬럼 `AlertHistory.recipientCount` 3곳 + API 필드 `totalChats` 1곳** |

- **실제로 비숫자 토큰이 있는지는 미확인** — `.env` 실값 열람은 measured-facts 규율상 금지다.
- **처리:** ① `csvEnv` 에 fin 의 탈락 규칙을 옵션으로 남기거나(`csvEnv(name, { numericOnly: true })`), ② 문자열 유지로 통일하되 **계획 §2 동작 규칙 표에 "비숫자 토큰 처리가 fin 과 달라진다 · `total` 의미가 바뀔 수 있다 · env 실값 미확인" 한 줄을 명시**한다. 어느 쪽이든 **되돌리기 즉시**(코어 1줄)지만, 지금 적지 않으면 1a-4 에서 DB 값 의미 변경으로 되돌아온다.

---

## 6. #32 I1 (b) 게이트 — 전 항목 재현

스크래치패드 사본(`$S/i1`, 루트 + `packages/notify` 위임형 그대로 · **원본 쓰기 0**).

| 확인 | 명령 | 결과 | measured-facts 대조 |
|---|---|---|---|
| `tsconfig.test.json` 5줄 | `wc -l` | **5** | §3 원문 그대로 |
| `@types/node ^20` 해석 | `npm --prefix packages/notify install` | **20.19.43** | F4 일치 |
| lockfile 증분 | `diff <(git show HEAD:…/package-lock.json) …` | **+18줄** (`@types/node` + `undici-types`) | F4 일치 |
| clean 기준선 | `typecheck` / `typecheck:test` / `build` | 0 / 0 / 0 | §1 |
| 주입 `const bad: number = VERSION;` (테스트 파일) | `npm run typecheck` | **0 (못 잡음)** | §1 |
| 〃 | `npm test` | **0 (못 잡음)** | §1 |
| 〃 | `npm run build` | **0 (정상 — 안전 조건)** | §1 |
| 〃 | **`npm run typecheck:test`** | **exit 2** · `index.test.ts(10,7): error TS2322` | §6 (b) |
| 제거 후 | `npm run typecheck:test` | 0 | — |
| **`prepare` 가 `tsconfig.test.json` 을 읽는가** | 그 파일을 `{ THIS IS NOT JSON` 으로 파손 후 `npm run prepare` | **exit 0** · `dist/index.{js,d.ts}` 정상 생성 | §5 일치 |
| 대조군 | `npx tsc --noEmit -p packages/notify/tsconfig.test.json` | **exit 2** | §5 일치 |
| **F5** — 파일 안 `noEmit` 제거 시 | `npx tsc -p packages/notify/tsconfig.test.json` | exit 0 · `dist/` 에 **6파일**(`index.test.js`·`build-config.test.js` + `.d.ts` 포함) | F5 일치 |

`workflow.md` 8절 타입 칸 문안 `npm run typecheck && npm run typecheck:test` 도 measured-facts §6 (b) 행과 **동일**.

### 판정 — **확인.** 계획 §1·§4 E1·§5 의 게이트 서술은 실측과 완전히 일치한다.

> 주의 1건(정정 아님): `@types/node` 도입은 **되돌리기가 "게이트 도입 이전 상태로" 만 즉시**다(#32 I1 §7 단서). 1a-1 테스트가 `node:*` 를 쓰기 시작하면 `@types/node` 제거가 `build-config.test.ts` 를 깬다. 계획 §6 "게이트만 · 즉시" 행에 **이 단서를 한 구 붙일 것**.

---

## 7. 되돌리기 §6 — **확인**

| 계획 §6 행 | 정본 | 판정 |
|---|---|---|
| 전체 · **즉시 (1a-3 착수 전까지)** · PR revert 1회 · 소비자 0 | 003 §5-2 1a-1 행: *"**즉시 — 단 1a-3 착수 전까지만** / 패키지 디렉터리 삭제. '아직 아무도 안 쓴다'는 1a-3/1a-4 착수 전까지만 참"* | **일치** |
| 게이트만 · 즉시 | measured-facts #32 I1 §7 (b) 행(파일 1 삭제 · 스크립트 1줄 · devDep 1줄 · 서브 `npm install`) | **일치** (위 단서 1건 추가 권고) |
| `Content`·`maxLength` 형태 · **즉시(1a-3 전) / 중간(1a-3 후)** | 003 §4-2 확정 5: *"되돌리기: **즉시 (1a-3 착수 전까지 · 이후 중간 — §8-1)**"* | **일치** |

**시점 경계도 맞다.** 1a-2(fit vitest 도입)는 패키지를 **소비하지 않으므로** 첫 소비자는 1a-3 이다(003 §5-2). 계획 §7 이 **버전 태그·릴리즈를 범위 밖**으로 뺐으므로 1a-1 머지만으로는 어느 저장소도 이 패키지를 핀할 수 없다 — *"소비자 0"* 이 성립한다.
1a-3 이후가 **중간**인 근거도 §8-1 그대로다: `git revert` + lockfile + `npm ci` + 재빌드 + `pm2 restart`(Q42 이후 **병행 인스턴스** 대상).

**권고(경미):** §6 에 **`.claude/rules/workflow.md` 8절 변경**(즉시 · 문서 1줄)과 **`packages/notify/package-lock.json` −18줄**을 되돌리기 단위에 명시하면 표가 자족한다.

---

## 8. 003 §5-1 흡수 목록 대조 — **정정 3건**

| 003 §5-1 흡수 항목 | 계획 | 판정 |
|---|---|---|
| `error.ts` (export 5/5) | §1 `src/error.ts` — fin 정본(`NETWORK_CODES` 7 · `ENOTFOUND` · 최종 이중 마스킹) | **확인.** 원문 대조: fin `error.ts` 101줄 · export 5(`sanitizeMessage`·`sanitizeError`·`getErrorCode`·`isNetworkError`·`isHtmlParseError`) · `:9-17` 코드 7개 · `:52` `return sanitizeMessage(parts.join(' | '))`. fit 은 85줄 · 코드 6개 · `:38` `return parts.join(" | ")` (이중 마스킹 없음) — 003 §3-1 선택과 일치 |
| `splitMessage`(fin `formatter.ts:52`) | §1 `src/split.ts` | **확인** (`formatter.ts:50` 상수 · `:52-78` 함수) |
| fit `send.ts` 전량(124줄) | §1 `deliver.ts`+`notifier.ts`+`targets.ts` | **확인** — `truncate`(`:35-37`)만 소멸하며 이는 **Q10-L ① 승인분** |
| fin `sendHtml`/재시도/폴백 | §1 `telegram.ts`·`deliver.ts` | **확인** |
| **fit `escapeHtml` 은 발췌**(파일은 남는다, §7-2) | **없음** | **정정 ①** |
| (§5-1 말미) **착수 직전에 정할 구현 결정 1건 — `error.ts` shim** | **없음** | **정정 ②** |
| (§1-4 요구사항 1) **`Route → Transport` 매핑을 설정으로** | **없음** | **정정 ③ (= A-3)** |

### 정정 ① — `escapeHtml`

003 은 두 곳에서 흡수를 약속했다:
- §5-1 흡수 파일 칸: *"fit `escapeHtml` 은 **발췌**(파일은 남는다, §7-2)"*
- §7-2 표: *"패키지가 **발췌**해 가고 로컬에 인바운드용 잔여가 남는다 — 중복이 **2 → 1** 이지 0 이 아니다"*

계획 §1 파일 표에 없고, §7 범위 밖에도 없다 — **말없이 빠졌다.**
원문 대조: fin `telegram.ts:17-22` 와 fit `telegram.ts:18-23` 은 **구현이 동일**(`&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`)하므로 흡수 비용은 **함수 1개 + 테스트 1개**다.
**판정: 정정.** ⓐ `src/escape.ts` 로 넣고 §1 표·§4 E2 에 반영하거나, ⓑ **넣지 않기로 하고 §7 범위 밖에 "003 §5-1·§7-2 의 발췌 약속을 1a-3 으로 미룬다 — fit 중복은 2 로 유지" 를 명시**한다. 지금처럼 **아무 데도 없는 상태가 문제**다(003 이 약속한 것이 소리 없이 사라진다). 되돌리기는 어느 쪽이든 **즉시**.

### 정정 ② — `error.ts` shim 결정

003 §5-1: *"**착수 직전에 정할 구현 결정 1건**(사용자 판단 불필요). `error.ts` 흡수가 인바운드 6곳의 import 경로를 바꾼다(§7-3). 로컬 `utils/error.ts` 를 `export * from '@pleiades/notify'` **shim** 으로 남기면 인바운드 변경을 **0** 으로 만들 수 있다."*
대상 6곳(§7-3): fin `commands/watchlist.ts:6`·`commands/vest-confirm.ts:19`·`commands/ai.ts:14`·`standalone.ts:14` · fit `auto-adjust-callback.ts:8`·`standalone.ts:4`.
**집행은 1a-3·1a-4 지만 "착수 직전에 정한다"고 적힌 결정이고, 지금이 그 착수 직전이다.** 계획 §7 범위 밖에도 없어 **떨어질 자리가 없다.**
**판정: 정정(경미).** §7 에 *"1a-3·1a-4 착수 시 결정 — 003 §5-1"* 으로 한 줄 이월하거나 §8 에 D-4 로 올린다.

### 정정 ③ — `Route → Transport` 매핑 (= A-3)

003 §1-4 요구사항 1 전문:
> *"**`Route → Transport` 매핑을 설정으로 뺀다.** 이걸 1a 에서 안 하면 1b 의 되돌리기가 "env 플립"에서 "코드 revert + 재배포"로 **한 등급 올라간다**."*

계획 §2 `NotifierConfig`:
```ts
transport: Transport | (() => Transport);        // ← 단일. Route 축이 없다
targets: Partial<Record<Route, () => string[]>>; // ← 여기는 Route 축이 있다
```
계획 §3 제약 대조표는 **§4-3 제약 3개만** 대조하고 **§1-4 요구사항 2개는 대조하지 않는다**(요구사항 2 = 제약 3 이라 우연히 덮였고, 요구사항 1 은 누락).

**비용 비교 (되돌리기 관점):**

| 시점 | 넣는 비용 | 안 넣었을 때 |
|---|---|---|
| **지금 (1a-1)** | `NotifierConfig` 한 칸을 `Transport \| (()=>Transport) \| Partial<Record<Route, Transport \| (()=>Transport)>>` 로. **포트(`Transport`) 무변경 · 소비자 0 · 되돌리기 즉시** | — |
| 1b | — | 003 이 명시한 대로 **1b 되돌리기 등급 즉시(env 플립) → 중간(코드 revert + 재배포)**. 그때는 소비자가 둘 다 config 를 박은 뒤다 |

**판정: 정정.** ⓐ 지금 설정 표면에 Route 축을 넣거나, ⓑ **넣지 않기로 하고 §6 되돌리기 표에 "1b 되돌리기 등급 +1 을 수용한다(003 §1-4 요구사항 1)" 를 명시**한다. **되돌리기 비용 문서에서 미래 등급 상승을 적지 않은 채 넘어가는 것만은 불가**하다. 사용자 결정 항목(D-4)으로 올릴 것을 권고한다.

---

## 9. 그 밖의 실측 대조 (계획 §0 표) — 전부 일치

| 계획 §0 값 | 검증 | 결과 |
|---|---|---|
| fin `telegram.ts` **118** · `error.ts` **101** · fit `send.ts` **124** · fit `error.ts` **85** | `cat -n` (clean worktree) | 일치 |
| fit `error.ts` — `ENOTFOUND` 없음 · 최종 마스킹 없음 | `:2-9` 코드 6개 · `:38` join 후 재마스킹 없음 | 일치 |
| fit `telegram.ts:18` `escapeHtml` (인바운드 `replyLong` 도 씀) | `:18-23` 정의 · `:26-36` `replyLong` · `:33` 폴백 | 일치 |
| grammy fin `^1.41.1`(설치 **1.44.0**) · fit `^1.42.0`(설치 **1.42.0**) | `package.json:27` / `:29` · `node_modules/grammy/package.json` | 일치 |
| fin `rsu.ts:178-186` `InlineKeyboard` → `reply_markup` | `:178` 생성 · `:184-187` `sendMessage(…, {parse_mode, reply_markup})` | 일치 |
| fin ADMIN `advisor-monitor.ts:199-204` + fail-safe | `:199-204` 파싱 · `:205-211` `console.warn` + `return false` | 일치 |
| 수신자 파싱 5지점 줄 번호 | §5d 표 | 일치 (함수 선언 줄 기준) |
| 루트 스크립트 · 서브 devDep `vitest ^4.1.8` 만 · vitest config 없음 | `package.json` · `find packages -type f` | 일치 |
| 로그 문구 출처 fin `telegram.ts:113` · fit `send.ts:68`·`:87` | 원문 | 일치 |

**경미 1건:** §0 표의 *"`src/index.ts`(`VERSION` 1줄)"* 은 실제 **2줄**(주석 1 + export 1)이다. 무해.

---

## 10. 계획에 반영할 정정 목록

**착수 전 필수 (블로커)**

1. **§2 `TelegramApi` 시그니처 교체** — `parse_mode?: 'HTML'` → `parse_mode?: string`(또는 `'HTML'|'Markdown'|'MarkdownV2'`). **메서드 단축 문법 유지**(프로퍼티 문법 금지). 근거·프로브 명령은 본문 §2. (A-1)
2. **§4/§5 에 grammy 대입 프로브 추가** — `repos/*` 의 `node_modules/grammy`(1.44.0·1.42.0) 를 `paths` 로 참조하는 스크래치패드 `tsc` 프로브. 패키지 테스트로는 잡히지 않는다. §3 제약 1 의 `grep` 단언은 문자열 부재만 보증한다. (A-1)

**문서 정정 (문안 교체)**

3. **§0 S-2 칸 재작성** — *"`import type` 으로도 참조할 수 없다"* → *"선언 없이 참조하면 깨진다"*. *"`build-config.test.ts` 전제는 성립하지 않는다"* **삭제**(peerDep 경로는 성립한다). (A-2)
4. **§8 D-3 대안 칸 재작성** — 대안은 **둘**(루트 devDep · 루트 peerDep). 실측 비용표(본문 §1)와 **peer 범위 ERESOLVE 위험**(케이스 F)을 병기. 채택 결론은 유지. (A-2)
5. **§0 S-3 마지막 문장 보강** — `maxLength: Infinity` 는 제약 2 **첫째 형태**이고 S-3 결함을 1b 로 옮긴다. **"유한 → 코어 소유 / Infinity → 어댑터 소유, 섞을 수 없다"** 를 포트 계약에 명문화. (§3)
6. **§2 분할 행 근거 교체** — *"키보드가 있으면 그 메시지 = callback 매칭 대상"* → **`telegramMessageId` 는 쓰기 2곳·읽기 0건**(발견 9 정정). 결론(마지막 청크)은 유지. (§5c)
7. **§2 동작 규칙 표에 `targets` 파싱 차이 행 추가** — `csvEnv` 가 fin `.map(Number).filter(!isNaN)` 를 버린다 → 비숫자 토큰이 `total`(=DB `recipientCount` 3곳 · API `totalChats` 1곳)에 들어온다. **env 실값 미확인**을 함께 적는다. (§5d)
8. **§2 폴백 판정 행에 관측 변경 후보 1건 명시** — fin 400 트리거 축소. **빈도 미측정**(C-1). 003 §5-2 정정 ① 의 fin 측 목록 2건 → **3건 후보**로 `decision-writer` 에게 통지 필요. (§5b)
9. **§1·§7 에 `escapeHtml` 처리 명시** — 흡수하거나 "1a-3 로 이월"을 적는다. 003 §5-1·§7-2 의 발췌 약속이 지금은 어디에도 없다. (§8 정정 ①)
10. **§7 에 `error.ts` shim 결정 이월 명시** — 003 §5-1 *"착수 직전에 정할 구현 결정 1건"*. (§8 정정 ②)
11. **§2·§6 에 `Route → Transport` 매핑 처리** — 넣거나, **1b 되돌리기 등급 +1 수용을 §6 에 명시**. 사용자 결정(D-4) 권고. (A-3 · §8 정정 ③)
12. **§6 보강(경미)** — `@types/node` 되돌리기 단서("게이트 도입 이전 상태로만 즉시") · `workflow.md` 8절 1줄 · lockfile −18줄. (§6·§7)
13. **§4 E6 문안 확정(경미)** — 소비자 `package.json` 의 **키를 `@pleiades/notify` 로** 선언한 형태로 적는다. 이름 없는 `npm install <git url>` 은 `node_modules/pleiades` 로 들어가 `require('@pleiades/notify')` 가 실패한다(실측). (§1 부수 실측)

**003 역반영 (별건 또는 E7 뒤)**

14. `Content` 정의를 003 §4-2 에 정정 블록으로 역반영 — 정본이 참조만 하고 정의하지 않는 상태를 닫는다. (§4)
15. 위 8번(fin 폴백 트리거 축소)을 003 §5-2 정정 ① 에 3번째 행으로 추가. (§5b)

---

## 11. 못 잰 값 (미확인 — 추정하지 않았다)

| 항목 | 왜 못 쟀나 |
|---|---|
| `TELEGRAM_ALLOWED_CHAT_IDS` 실값에 비숫자 토큰이 있는지 | `.env` 실값 열람 금지(measured-facts 규율). §5d 의 실제 발현 여부는 판단 불가 |
| fin 비-파싱 400 폴백이 **성공하는** 빈도 | 폴백 로그 0건(C-1). 계측 코드 없이는 불가 — 두 실서비스 쓰기·배포가 필요 |
| GitHub 원격(`git+https`) 경유 소비자 설치 | 이번도 `git+file://` — 1a-0·#32 I1 과 같은 한계. 다만 M2(2026-09-08)가 세 형태 모두 https 우선임을 이미 실측했다 |
| peerDep 형태의 cold 캐시 `npm ci` | devDep·대조군만 쟀다. 채택되지 않을 형태라 추가 측정을 하지 않았다 |
| 1b Discord 어댑터에서 `maxLength` 보수 예산이 충분한지 | 어댑터도 변환기도 없다 (§3 (다)는 계약 문구 권고까지) |
| 서버 node 버전(#32 I1 F3 재현 여부) | Q45 미측정 — 이 감사 범위 밖 |
