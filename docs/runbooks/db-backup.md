# DB 일일 백업 런북 (#441)

fin·fit DB 를 서버 안 백업 위치에 매일 뜬다. 6절을 마치면 암호화한 사본을 라즈베리파이가 가져간다 — **그 전에는 서버를 잃으면 백업도 함께 잃는다.**

실행은 전부 사용자가 서버에서 한다(Claude 서버 접근 금지 · I-3). 세션에는 판정 양식과 결과 줄만 붙인다. 오류 원문에 DB 이름·경로가 있으면 가린다.

| 항목 | 값 |
|---|---|
| 스크립트 | `deploy/db-backup.cjs` — 커밋을 고정해 `~/pleiades-ops/` 에 둔다. 체크아웃 안에서 부르면 R-8 로 옛 태그를 꺼낼 때 파일이 사라져 백업이 멈춘다 |
| 저장 | `/backup/pleiades-db/daily` 14개 · `weekly` 8개(일요일분) · 파일 600 · 크기가 남은 매일분 최대의 절반 아래면 경고하고 옛 덤프를 지우지 않는다(5절) |
| 접속 | 각 앱 `.env` 의 `DATABASE_URL` — sudo 없이 서비스 계정으로 돈다 |
| 시각 | 매일 04:20 KST(3절에서 서버 시간대를 확인한다) · 파일 이름과 주간 요일은 스크립트가 KST 로 고정한다 |
| 알림 | 실패할 때마다 · 일요일 성공 1회 — **일요일 알림이 끊기면 크론이 멈춘 것이다** |

되돌리기: crontab 줄 삭제(**즉시**) · 덤프 삭제는 **편도**.

## 1. 설치

`<REF>` 와 `<SHA256>` 은 Claude 가 머지 뒤 실값을 준다. 재설치 때도 검증 전에는 도는 파일을 덮지 않는다.

```bash
sudo install -d -m 700 -o "$(id -un)" /backup/pleiades-db
mkdir -p ~/pleiades-ops ~/pleiades-private && chmod 700 ~/pleiades-ops ~/pleiades-private
curl -fsSL https://raw.githubusercontent.com/fomalhaut84/pleiades/<REF>/deploy/db-backup.cjs -o ~/pleiades-ops/db-backup.cjs.new \
  && echo "<SHA256>  $HOME/pleiades-ops/db-backup.cjs.new" | sha256sum -c --quiet \
  && mv ~/pleiades-ops/db-backup.cjs.new ~/pleiades-ops/db-backup.cjs && echo 설치 통과
```

## 2. 시험

크론과 같은 빈 환경으로 돌린다. 앞줄은 배포 알림 Discord 채널에 시험 메시지를 보내고, 뒷줄은 백업을 1회 뜬다.

```bash
NODE_BIN=$(command -v node); case "$NODE_BIN" in /*) echo "node 경로 통과" ;; *) echo "[중단] 절대 경로가 아니다 — 멈춘다" ;; esac
env -i HOME="$HOME" PATH=/usr/bin:/bin "$NODE_BIN" --network-family-autoselection-attempt-timeout=2000 ~/pleiades-ops/db-backup.cjs --test-alert
env -i HOME="$HOME" PATH=/usr/bin:/bin "$NODE_BIN" --network-family-autoselection-attempt-timeout=2000 ~/pleiades-ops/db-backup.cjs
```

**기대:** `알림 보냄` · `… 통과: fin 테이블 31 …` · `… 통과: fit 테이블 23 …` · `… 결과: 통과`. 테이블 수는 스키마가 바뀌면 달라진다.

**`fin(pg_dump)` 처럼 실패하면** 앱 DB 롤의 권한 문제일 수 있다. 원문은 그대로 붙이지 말고 Claude 에게 사유 코드만 알린다.

**`fin(exists)` 는** 같은 분에 이미 덤프가 있어 덮어쓰지 않았다는 뜻이다. 기존 덤프는 그대로 있다 — 1분 뒤 다시 돌린다.

## 3. 등록

> **정정 (2026-11-10 · #579 · 008 별건).** node 를 `--network-family-autoselection-attempt-timeout=2000` 와 함께 부른다 — pm2 앱 · 배포 알림 · 수집기 크론과 같은 값이다(#191 · 이 서버에서 연결 family 자동 선택이 짧으면 외부 연결이 실패했다). 없으면 백업 결과 Discord 알림이 조용히 빠질 수 있다. **이미 등록했으면 아래 블록을 다시 돌린다** — 기존 db-backup 줄을 지우고 새 줄 하나로 바꾼다(다른 줄 보존 · 멱등). 되돌리기: 플래그 없는 줄로 다시 등록(**즉시**).

서버 시간대를 먼저 확인한다. crontab 은 서버 시간대를 따른다.

```bash
date +%z
```

- `+0900` 이면 시각 칸은 `20 4`, `+0000` 이면 `20 19` 다(둘 다 04:20 KST). 다른 값이면 Claude 에게 알린다.
- 아래 첫 줄의 `CRON_AT` 을 그 값으로 바꾼다. `crontab -l` 이 실패하면 기존 항목을 지우지 않도록 멈춘다. 다시 돌려도 줄이 늘지 않는다.

```bash
CRON_AT='20 4'; NODE_BIN=$(command -v node)
if CUR=$(crontab -l 2>&1) || [[ "$CUR" == *"no crontab"* ]]; then
  [[ "$CUR" == *"no crontab"* ]] && CUR=
  { printf '%s\n' "$CUR" | grep -v db-backup.cjs; echo "$CRON_AT * * * $NODE_BIN --network-family-autoselection-attempt-timeout=2000 $HOME/pleiades-ops/db-backup.cjs >> $HOME/pleiades-private/db-backup.log 2>&1"; } | crontab -
else
  echo "[중단] crontab 을 읽지 못했다 — 바꾸지 않았다"
fi
crontab -l | grep -c db-backup.cjs
```

마지막 줄은 `1` 이어야 한다. 로그에는 오류 원문이 들어갈 수 있다 — 세션에 원문을 붙이지 않는다.

**다음 날 04:20 뒤** 크론이 실제로 돌았는지 본다. 2절의 손 실행은 이 로그에 쓰지 않으므로 이 로그의 `결과` 줄이 크론 실행의 증거다.

```bash
tail -1 ~/pleiades-private/db-backup.log | grep -o '[0-9]\{8\}-[0-9]\{4\} 결과: .*'
```

**기대:** 그날 날짜와 `-0420` · `결과: 통과`. 그 뒤 `deploy/backup-check.sh` 도 다시 돌려 양식을 붙인다.

## 4. 복원 시험

**이것을 통과해야 "백업 있음" 이다.** 서버 안의 임시 DB 에 복원해 운영 DB 와 비교한 뒤 임시 DB 를 지운다. 운영 DB 에는 읽기만 한다. 서비스 DB 를 로컬로 가져오지 않는다(I-7).

반복문을 터미널에 바로 붙이지 말고 **파일로 만들어 bash 로 실행한다.** 2026-11-03 첫 시험에서 zsh 에 붙인 반복문만 임시 DB 없음으로 실패했고, 같은 내용을 파일로 실행하면 통과했다(원인 미확인).

```bash
cat > ~/pleiades-private/restore-test.sh <<'SCRIPT_END'
#!/bin/bash
# 임시 — DB 백업 복원 시험(#441). 서버에서 사용자가 실행한다. 운영 DB 는 읽기만 하고 임시 DB 만 만들고 지운다.
cd /tmp || exit 1
dbname() { node -e 'const a=process.argv[1];const d=require(require.resolve("dotenv",{paths:[a]}));const e=d.parse(require("fs").readFileSync(a+"/.env"));console.log(decodeURIComponent(new URL(e.DATABASE_URL).pathname.slice(1)))' "$1" 2>/dev/null; }
FIN_DB=$(dbname ~/pleiades-fin/apps/finance); FIT_DB=$(dbname ~/pleiades-fit/apps/fitness)
T=pleiades_restore_test
ERR=~/pleiades-private/restore-test.err
q() { sudo -u postgres psql -X -At -d "$1" -c "$2"; }
c="select count(*) from information_schema.tables where table_schema='public'"
m="select count(*) from public._prisma_migrations"
rows="select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I', table_name), false, true, '')))[1]::text::bigint from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1"
for p in "fin:$FIN_DB" "fit:$FIT_DB"; do
  n=${p%%:*}; d=${p#*:}
  if [[ -z "$d" ]]; then echo "$n 중단 — DB 이름을 읽지 못했다"; continue; fi
  f=$(ls -t /backup/pleiades-db/daily/$n-*.dump | head -1)
  sudo -u postgres dropdb --if-exists "$T"
  sudo -u postgres createdb "$T"; rc_create=$?
  has=$(q postgres "select count(*) from pg_database where datname='$T'")
  echo "$n createdb rc=$rc_create · 임시 DB 존재 $has · 덤프 파일 $([ -s "$f" ] && echo 있음 || echo 없음)"
  if [[ "$rc_create" != 0 || "$has" != 1 ]]; then echo "$n 중단 — 임시 DB 없음"; continue; fi
  if sudo -u postgres pg_restore --no-owner --no-privileges --exit-on-error -d "$T" < "$f" 2>"$ERR"; then r=통과; else r=실패; head -3 "$ERR"; fi
  tr=$(q "$T" "$c"); to=$(q "$d" "$c"); mr=$(q "$T" "$m"); mo=$(q "$d" "$m")
  if [[ "$r" == 통과 && -n "$tr" && "$tr" == "$to" && -n "$mr" && "$mr" == "$mo" ]]; then v=일치; else v=불일치; fi
  a=$(q "$T" "$rows"); b=$(q "$d" "$rows")
  total=$(printf '%s\n' "$b" | grep -c .)
  same=$(comm -12 <(printf '%s\n' "$a" | LC_ALL=C sort) <(printf '%s\n' "$b" | LC_ALL=C sort) | grep -c .)
  echo "$n 복원 $r · 비교 $v · 테이블 $tr/$to · 마이그레이션 $mr/$mo · 행 일치 테이블 $same/$total"
  sudo -u postgres dropdb "$T"; echo "$n 정리 rc=$?"
done
SCRIPT_END
chmod 700 ~/pleiades-private/restore-test.sh
bash -n ~/pleiades-private/restore-test.sh && echo "문법 통과"
```

`문법 통과` 가 나오면 실행한다. `sudo` 비밀번호를 물을 수 있다.

```bash
bash ~/pleiades-private/restore-test.sh
```

**기대:** 두 앱 모두 `복원 통과 · 비교 일치` · `정리 rc=0`. 그 결과 줄만 붙인다. 오류 줄에 경로나 접속 정보가 있으면 가린다.

- `행 일치 테이블` 은 거의 전부여야 한다. 운영 DB 는 덤프 뒤에도 바뀌므로 몇 개 어긋나는 것은 먼저 그 탓으로 본다. 많이 어긋나면 Claude 에게 알린다.
- `임시 DB 없음` 이나 `복원 실패` 면 통과가 아니다. 다시 돌리면 임시 DB 를 먼저 지우고 시작한다.

끝나면 지운다.

```bash
rm ~/pleiades-private/restore-test.sh ~/pleiades-private/restore-test.err
```

## 5. 크기 급감 경고를 받으면

덤프가 남아 있는 매일분 중 가장 큰 것의 절반 아래면 매일 경고하고 옛 덤프를 지우지 않는다. **데이터 유실일 수 있으니 옛 덤프를 먼저 지키고 원인을 본다.** 경고가 이어지는 동안 매일분이 계속 늘어난다.

- 유실이면 인정하지 않는다. 복원은 사용자 판단으로 따로 진행한다.
- 데이터를 일부러 줄인 것이 확실할 때만 그 앱을 인정한다. 다음 백업부터 옛 덤프가 보관 기간대로 **지워진다**(**편도**).

```bash
node ~/pleiades-ops/db-backup.cjs --accept-shrink fin
```

## 6. 서버 밖 사본 (라즈베리파이)

서버가 `age` 로 암호화한 파일을 `offsite/` 에 두고, 파이가 매일 가져가 앱별 최근 30개와 월별 첫 파일 12개를 보관한다. 파이가 지원 종료 OS(buster)라 패치 없는 rsync 를 쓰지 않고 `ssh` 로 받는다.

| 원칙 | 내용 |
|---|---|
| 복호화 키 | 서버·파이·저장소·세션 어디에도 두지 않는다. **잃으면 모든 사본을 못 읽는다** — 비밀번호 관리자와 오프라인 사본 두 곳에 둔다 |
| 가져가는 방향 | 파이 → 서버. 서버에는 파이 접속 정보가 없어 서버가 파이의 사본을 직접 지우지 못한다 |
| 파이 키 | forced command `db-offsite-serve.sh` 만 돈다 — `list` · `get <이름>` 뿐이고 쓰기·삭제 기능이 없다. 유출돼도 암호문만 읽힌다 · 6-3 에서 거부를 직접 확인한다 |
| 침해된 서버 | 파일을 보낼 수는 있다. 받기 전 이름 검사 · 오늘 뒤 날짜 거부 · 앱별 16개 · 총 600 MB · 실행당 삭제 2개 이하 · 월별 12개 별도 보관 · 크기 급감 시 삭제 중단으로 밀어내기를 늦춘다. **가짜 파일이 매일 정상 크기로 오면 내용까지는 가려내지 못한다** |
| 남는 위험 | 파이의 OpenSSH 클라이언트와 OS 가 오래됐다. 공격 면은 줄지만 없어지지 않는다. OS 업그레이드는 별도 판단이다 |
| 저장 장치 | SD 카드 · 고장 나면 사본을 잃는다. 고장 알림은 없고 가져오기 실패로 드러난다 |

되돌리기: 서버 `authorized_keys` 줄 · 공개키 파일 · 파이 crontab 줄 삭제(**즉시**) · 사본 삭제는 **편도**.

### 6-1. 키 만들기 (맥 · 서버와 파이에서 하지 않는다)

```bash
brew install age
age-keygen
```

`AGE-SECRET-KEY-…` 줄을 비밀번호 관리자와 오프라인 사본에 저장하고 터미널을 지운다. `age1…` 공개키만 다음 단계에 쓴다.

### 6-2. 서버

1절을 새 `<REF>`·`<SHA256>` 으로 다시 해 스크립트를 올린다. 파이 키가 부를 전용 스크립트도 설치한다. 해시는 파일마다 다르다 — Claude 가 `<SERVE_SHA256>` 을 따로 준다.

```bash
curl -fsSL https://raw.githubusercontent.com/fomalhaut84/pleiades/<REF>/deploy/db-offsite-serve.sh -o ~/pleiades-ops/db-offsite-serve.sh.new \
  && echo "<SERVE_SHA256>  $HOME/pleiades-ops/db-offsite-serve.sh.new" | sha256sum -c --quiet \
  && mv ~/pleiades-ops/db-offsite-serve.sh.new ~/pleiades-ops/db-offsite-serve.sh && chmod 700 ~/pleiades-ops/db-offsite-serve.sh && echo 설치 통과
```

그 뒤 암호화를 켠다.

```bash
sudo apt install -y age
printf '%s\n' '<age1 공개키>' > ~/pleiades-ops/offsite-recipient.txt
env -i HOME="$HOME" PATH=/usr/bin:/bin "$(command -v node)" ~/pleiades-ops/db-backup.cjs
ls /backup/pleiades-db/offsite | sed 's/-[0-9].*//' | sort | uniq -c
```

**기대:** `결과: 통과` · fin·fit 각 1개 이상. 공개키 파일이 없으면 암호화를 하지 않는다. 암호화가 실패하면 매일분은 남고 `fin(offsite)` 로 알린다.

### 6-3. 파이

Claude 가 주는 `<REF>`·`<SHA256>` 으로 설치하고 키를 만든다.

```bash
mkdir -p ~/pleiades-offsite/store && chmod 700 ~/pleiades-offsite
curl -fsSL https://raw.githubusercontent.com/fomalhaut84/pleiades/<REF>/deploy/db-offsite-pull.sh -o ~/pleiades-offsite/db-offsite-pull.sh.new \
  && echo "<SHA256>  $HOME/pleiades-offsite/db-offsite-pull.sh.new" | sha256sum -c --quiet \
  && mv ~/pleiades-offsite/db-offsite-pull.sh.new ~/pleiades-offsite/db-offsite-pull.sh && chmod 700 ~/pleiades-offsite/db-offsite-pull.sh && echo 설치 통과
ssh-keygen -t ed25519 -N '' -C pleiades-offsite -f ~/.ssh/pleiades-offsite
cat ~/.ssh/pleiades-offsite.pub
```

**서버에서** 그 공개키를 한 줄 더한다. 기존 줄은 건드리지 않는다. `<홈>` 은 서버 계정의 홈 절대 경로다.

```bash
printf '\n%s\n' 'restrict,command="<홈>/pleiades-ops/db-offsite-serve.sh" <파이 공개키 한 줄>' >> ~/.ssh/authorized_keys
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

**파이에서** 서버 지문을 먼저 대조한다. 아래 출력의 `SHA256:…` 이 방금 서버에서 본 값과 **같을 때만** 다음으로 간다 — 다르면 가로채기일 수 있으니 멈춘다.

```bash
ssh-keyscan -t ed25519 -p <SSH포트> <서버주소> > /tmp/offsite-host-key
ssh-keygen -lf /tmp/offsite-host-key
```

같으면 등록하고 설정을 쓴다. 설정 파일은 비밀(웹훅)을 담으므로 세션에 붙이지 않는다.

```bash
cat /tmp/offsite-host-key >> ~/.ssh/known_hosts && rm /tmp/offsite-host-key
cat > ~/pleiades-offsite/config <<'CONFIG_END'
HOST=<서버주소>
PORT=<SSH포트>
REMOTE_USER=<서버 계정>
SSH_KEY=$HOME/.ssh/pleiades-offsite
DEST=$HOME/pleiades-offsite/store
DISCORD_WEBHOOK=<배포 알림 채널 웹훅>
CONFIG_END
chmod 600 ~/pleiades-offsite/config
~/pleiades-offsite/db-offsite-pull.sh --test-alert
~/pleiades-offsite/db-offsite-pull.sh
```

**기대:** `알림 보냄` · `결과: 통과 — 새 파일 …`. 스크립트 테스트는 ssh 를 스텁으로 돌리므로 **이 첫 실행이 실제 검증이다.** 실패하면 사유 코드만 알린다:

| 코드 | 뜻 |
|---|---|
| `config` | 설정 파일 · 키 경로 · 포트 |
| `locked` | 이전 실행이 아직 돈다 |
| `disk` · `write` | 여유 1 GB 미만 · 저장 실패 |
| `ssh(rc=N)` | `255` 접속·서버 키 검증 실패 · `124` 시간 초과 · `2` 서버가 거부 · `126`·`127` 서버의 전용 스크립트 설치 문제 |
| `badfile` | 오늘 뒤 날짜 · 잘못된 이름 · 암호문이 아님 — **서버 침해일 수 있다.** 그 실행은 아무것도 보관하지 않았다 |
| `toomany` · `toobig` | 앱별 16개 · 총 600 MB 초과 — 위와 같다. 덤프가 정말 커졌으면 Claude 에게 알린다 |
| `fin(stale)` | 그 앱의 어제·오늘 파일 없음 — 서버 크론이나 암호화가 멈췄다 |
| `fin(shrink)` | 새 파일이 보관분 최대의 절반 미만 — 옛 사본을 지우지 않았다. 5절처럼 원인을 먼저 본다. 일부러 줄인 것이 확실할 때만 `db-offsite-pull.sh --accept-shrink fin` |

파이 키로 셸과 다른 명령이 막혀 있는지 본다.

```bash
ssh -i ~/.ssh/pleiades-offsite -p <SSH포트> -o IdentitiesOnly=yes -o CheckHostIP=no '<서버 계정>@<서버주소>' true; echo "셸 시도 rc=$?"
ssh -i ~/.ssh/pleiades-offsite -p <SSH포트> -o IdentitiesOnly=yes -o CheckHostIP=no '<서버 계정>@<서버주소>' 'get ../db-backup.log'; echo "경로 시도 rc=$?"
```

**기대:** 둘 다 `거부` · `rc=2`. 아니면 등록을 멈추고 Claude 에게 알린다.

파이의 시간대를 `date +%z` 로 본다. `+0900` 이면 `30 5`, `+0000` 이면 `30 20` 이다(둘 다 05:30 KST · 서버 백업 뒤).

```bash
CRON_AT='30 5'
if CUR=$(crontab -l 2>&1) || [[ "$CUR" == *"no crontab"* ]]; then
  [[ "$CUR" == *"no crontab"* ]] && CUR=
  { printf '%s\n' "$CUR" | grep -v db-offsite-pull.sh; echo "$CRON_AT * * * $HOME/pleiades-offsite/db-offsite-pull.sh >> $HOME/pleiades-offsite/pull.log 2>&1"; } | crontab -
else
  echo "[중단] crontab 을 읽지 못했다 — 바꾸지 않았다"
fi
crontab -l | grep -c db-offsite-pull.sh
```

마지막 줄은 `1` 이어야 한다.

### 6-4. 복호화 확인 (맥)

**이것을 통과해야 "서버 밖 사본 있음" 이다.** 4절이 덤프의 복원을 증명했으니, 여기서는 파이의 사본을 풀면 서버의 그 덤프와 같은지만 본다. 풀어낸 내용은 디스크에 쓰지 않는다.

1. 파이에서 파일 하나를 맥으로 가져온다(암호문이다).
2. 맥에서 키를 붙여 넣어(화면에 표시되지 않는다) 해시를 낸다.

```bash
read -rs AGE_KEY
age -d -i <(printf '%s\n' "$AGE_KEY") <파일>.dump.age | shasum -a 256
unset AGE_KEY
```

3. 서버에서 같은 이름의 덤프 해시를 낸다.

```bash
sha256sum /backup/pleiades-db/daily/<파일>.dump
```

**기대:** 두 해시가 같다. "일치"만 알린다. 끝나면 맥의 `.age` 파일을 지운다.

## 언제 다시 하나

- 복원 시험·복호화 확인: 분기마다 1회 · 스키마를 크게 바꾼 뒤.
- node 를 올렸을 때: crontab 의 node 경로 확인.
- 스크립트를 고쳤을 때: 고친 파일을 새 `<REF>` 로 다시 설치한다(`db-backup.cjs` 1절 · `db-offsite-serve.sh` 6-2 · `db-offsite-pull.sh` 6-3).
