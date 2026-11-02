# DB 일일 백업 런북 (#441)

fin·fit DB 를 서버 안 백업 위치에 매일 뜬다. **서버를 잃으면 함께 잃는다** — 서버 밖 보관은 다음 단계다.

실행은 전부 사용자가 서버에서 한다(Claude 서버 접근 금지 · I-3). 세션에는 판정 양식과 결과 줄만 붙인다. 오류 원문에 DB 이름·경로가 있으면 가린다.

| 항목 | 값 |
|---|---|
| 스크립트 | `deploy/db-backup.cjs` — 커밋을 고정해 `~/pleiades-ops/` 에 둔다. 체크아웃 안에서 부르면 R-8 로 옛 태그를 꺼낼 때 파일이 사라져 백업이 멈춘다 |
| 저장 | `/backup/pleiades-db/daily` 14개 · `weekly` 8개(일요일분) · 파일 600 · 크기가 직전의 절반 아래면 경고하고 옛 덤프를 지우지 않는다 |
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
NODE_BIN=$(command -v node); case "$NODE_BIN" in /*) echo "node 경로 통과" ;; *) echo "!! 절대 경로가 아니다 — 멈춘다" ;; esac
env -i HOME="$HOME" PATH=/usr/bin:/bin "$NODE_BIN" ~/pleiades-ops/db-backup.cjs --test-alert
env -i HOME="$HOME" PATH=/usr/bin:/bin "$NODE_BIN" ~/pleiades-ops/db-backup.cjs
```

**기대:** `알림 보냄` · `… 통과: fin 테이블 31 …` · `… 통과: fit 테이블 23 …` · `… 결과: 통과`. 테이블 수는 스키마가 바뀌면 달라진다.

**`fin(pg_dump)` 처럼 실패하면** 앱 DB 롤의 권한 문제일 수 있다. 원문은 그대로 붙이지 말고 Claude 에게 사유 코드만 알린다.

## 3. 등록

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
  { printf '%s\n' "$CUR" | grep -v db-backup.cjs; echo "$CRON_AT * * * $NODE_BIN $HOME/pleiades-ops/db-backup.cjs >> $HOME/pleiades-private/db-backup.log 2>&1"; } | crontab -
else
  echo "!! crontab 을 읽지 못했다 — 바꾸지 않았다"
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

```bash
FIN_DB='<fin DB 이름>'; FIT_DB='<fit DB 이름>'
T=pleiades_restore_test
q() { sudo -u postgres psql -X -At -d "$1" -c "$2"; }
c="select count(*) from information_schema.tables where table_schema='public'"
m="select count(*) from public._prisma_migrations"
for p in "fin:$FIN_DB" "fit:$FIT_DB"; do
  n=${p%%:*}; d=${p#*:}
  f=$(ls -t /backup/pleiades-db/daily/$n-*.dump | head -1)
  sudo -u postgres dropdb --if-exists "$T"
  sudo -u postgres createdb "$T"
  if sudo -u postgres pg_restore --no-owner --no-privileges --exit-on-error -d "$T" < "$f"; then r=통과; else r=실패; fi
  tr=$(q "$T" "$c"); to=$(q "$d" "$c"); mr=$(q "$T" "$m"); mo=$(q "$d" "$m")
  if [[ "$r" == 통과 && -n "$tr" && "$tr" == "$to" && -n "$mr" && "$mr" == "$mo" ]]; then v=일치; else v=불일치; fi
  echo "$n 복원 $r · 비교 $v · 테이블 $tr/$to · 마이그레이션 $mr/$mo"
  sudo -u postgres dropdb "$T"
done
```

**기대:** 두 줄 모두 `복원 통과 · 비교 일치`. 그 두 줄만 붙인다. 행 수까지 비교하지는 않는다 — 운영 DB 는 그 사이에도 바뀐다.

## 언제 다시 하나

- 복원 시험: 분기마다 1회 · 스키마를 크게 바꾼 뒤.
- node 를 올렸을 때: crontab 의 node 경로 확인.
- 스크립트를 고쳤을 때: 1번을 새 `<REF>` 로 다시.
