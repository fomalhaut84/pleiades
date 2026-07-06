#!/bin/bash
# myFinance 배포 스크립트
# 사용: ./deploy/deploy.sh [branch|tag]
# 예시: ./deploy/deploy.sh main
#       ./deploy/deploy.sh v0.1.0
#       ./deploy/deploy.sh dev
#
# 호출 시 cwd 자동 처리:
# - cwd 가 myFinance 루트면 그대로 (deploy.sh 가 직접 호출됨)
# - 그 외엔 스크립트 위치 기준 상위 디렉토리 (CI workflow 에서 임의 cwd 호출 호환)
set -e

TARGET="${1:-main}"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$REPO_ROOT"

echo "=== 1. Fetch latest ==="
git fetch origin --tags

# claude-advisor.ts 는 매번 src/lib/ai/mcp-config.json 을 읽어 Claude CLI 에
# --mcp-config 로 넘김. 이 파일이 HTTP url 로 바뀌는 순간 실행 중인 web/bot 은
# 즉시 새 config 를 참조하므로, MCP HTTP 서버가 뜨기 전에 checkout 하면 배포
# 소요 시간 (수분) 동안 AI 기능이 다운됨.
# 대응 순서: current tracked file 을 backup 으로 저장 → checkout -f 로 target
# 강제 반영 (dirty 여도 무시) → 즉시 backup 복원 → MCP HTTP 검증 완료 후 최종 swap.
# 이 순서면 backup 은 항상 "이전 배포가 실제 서비스에 남긴 정확한 상태" (이전 실패로
# stdio fallback 이 유지된 경우 그 stdio content 를 그대로 backup).
MCP_CONFIG_REL="src/lib/ai/mcp-config.json"
MCP_CONFIG_BACKUP=""
if [ -f "$MCP_CONFIG_REL" ]; then
    MCP_CONFIG_BACKUP=$(mktemp -t mcp-config.old.XXXXXX.json)
    cp "$MCP_CONFIG_REL" "$MCP_CONFIG_BACKUP"
    echo "backed up existing mcp-config to $MCP_CONFIG_BACKUP"
fi

# 실패 시: backup 을 tracked file 로 복원 → 실행 중 web/bot 은 이전에 잘 되던 config
# 로 계속 동작 (첫 배포라면 이 파일은 checkout 후 target 내용이 그대로 남음 — trap 이
# backup 을 복원해도 별 차이 없음).
# dist 도 build 이후 실패라면 old dist 로 복원 (auto-restart 가 unvalidated build 로드 방지).
cleanup_on_error() {
    if [ -n "$MCP_CONFIG_BACKUP" ] && [ -f "$MCP_CONFIG_BACKUP" ]; then
        # cp 실패 (디스크/권한) 는 조용히 넘기지 말고 명시 (silent swallow 금지)
        if ! cp "$MCP_CONFIG_BACKUP" "$MCP_CONFIG_REL" 2>/dev/null; then
            echo "WARN: mcp-config 복원 cp 실패 — 수동 확인 필요"
        else
            echo "restored mcp-config from backup after failure"
        fi
        rm -f "$MCP_CONFIG_BACKUP"
    fi
    if [ -n "$DIST_MCP_BACKUP" ] && [ -f "$DIST_MCP_BACKUP" ]; then
        if ! cp "$DIST_MCP_BACKUP" dist/mcp/server.cjs 2>/dev/null; then
            echo "WARN: dist/mcp/server.cjs 복원 cp 실패 — 수동 확인 필요"
        else
            echo "restored dist/mcp/server.cjs from backup after failure"
        fi
        rm -f "$DIST_MCP_BACKUP"
    fi
}
trap cleanup_on_error EXIT

echo "=== 2. Checkout: $TARGET ==="
# -f (force): 이전 배포 실패로 mcp-config.json 이 dirty 여도 무시하고 target 반영.
# backup 은 이미 저장했으므로 dirty content 는 손실되지 않음.
git checkout -f "$TARGET"

# 브랜치인 경우 pull, 태그인 경우 이미 detached HEAD
if git symbolic-ref -q HEAD >/dev/null 2>&1; then
    git pull origin "$TARGET"
fi

# TARGET 이 HTTP MCP transport 를 지원하는지 감지.
# HTTP config 는 { "type":"http", "url":"..." } 형태, stdio 는 { "command":"...", "args":[...] }.
# 이 감지는 checkout 직후 (아직 원상복원 전) 새로 반영된 config 를 대상으로 함.
# 이유: rollback 시나리오 대비 — pre-HTTP tag (v0.11.0 이하) 로 배포하면
# dist/mcp/server.cjs 가 stdio-only 라 HTTP pre-flight 무한 hang → abort.
IS_HTTP_MCP=0
if grep -q '"url"' "$MCP_CONFIG_REL" 2>/dev/null; then
    IS_HTTP_MCP=1
    echo "target uses HTTP MCP transport"
else
    echo "target uses stdio MCP transport (rollback or pre-HTTP version)"
fi

if [ "$IS_HTTP_MCP" = "1" ]; then
    # HTTP 경로: checkout 이 mcp-config.json 을 새 (HTTP) 로 바꿨다면 즉시 old (stdio 또는
    # 이전 HTTP) 로 되돌림. 실행 중인 web/bot 은 계속 old config 로 동작 → 배포 소요 시간
    # 동안 AI 무중단. MCP HTTP 서버 준비 완료 후 (step 7 통과) 최종 swap 진행.
    if [ -n "$MCP_CONFIG_BACKUP" ] && [ -f "$MCP_CONFIG_BACKUP" ]; then
        cp "$MCP_CONFIG_BACKUP" "$MCP_CONFIG_REL"
        echo "restored old mcp-config for during-deploy AI availability"
    fi
else
    # stdio 경로 (rollback): target 의 stdio config 가 우리가 원하는 최종 상태.
    # backup 을 지움. Trap 은 유지 — build 실패 시 dist 롤백 필요 (아직 dist backup 생성 전이지만
    # 이후 line 107 에서 backup 후에 build 함).
    # Trap 해제는 build/pm2 정리 성공 후 stdio 경로 끝에서 진행.
    if [ -n "$MCP_CONFIG_BACKUP" ]; then
        rm -f "$MCP_CONFIG_BACKUP"
        MCP_CONFIG_BACKUP=""
    fi
fi

echo "=== 3. Install dependencies ==="
npm ci

echo "=== 4. DB Migrate ==="
npx prisma migrate deploy

# Build 전 old dist 백업. MCP restart 실패 (health 미통과) 시 rollback.
DIST_MCP_BACKUP=""
if [ -f dist/mcp/server.cjs ]; then
    DIST_MCP_BACKUP=$(mktemp -t mcp-dist.old.XXXXXX.cjs)
    cp dist/mcp/server.cjs "$DIST_MCP_BACKUP"
    echo "backed up existing dist/mcp/server.cjs to $DIST_MCP_BACKUP"
fi

echo "=== 5. Build (out-of-place MCP) ==="
# Build:mcp 를 staged 로 out-of-place 로 실행 → dist/mcp/server.cjs 는 그대로 유지.
# subprocess spawn (bot/web AI 호출) 이 build/pre-flight 창 (~수분) 동안에도
# old dist 를 참조하도록 보장. Pre-flight 통과 후 mv 로 atomic 활성화.
if [ "$IS_HTTP_MCP" = "1" ]; then
    npx --no-install next build
    npm run build:mcp:staged
    npm run build:bot
else
    # stdio 경로: 기존 flow 유지 (in-place). 이 경로는 subprocess spawn 만 사용하니
    # build:mcp:activate 도 build 안에서 실행.
    npm run build
fi

if [ "$IS_HTTP_MCP" = "1" ]; then
    echo "=== 6. MCP — pre-flight check (old 인스턴스 유지 상태에서 새 빌드 검증) ==="
    # 목적: pm2 hard restart 로 old MCP 를 죽이기 전에 new dist/mcp/server.cjs 가
    # 실제로 부팅 + health 응답하는지 확인. 크래시 (환경변수 누락 / 스키마 오류 등) 를
    # 사전에 잡아 old healthy 인스턴스가 유지된 채로 abort → 서비스 무중단.
    #
    # 프로덕션 포트 4200 은 old 인스턴스가 잡고 있을 수 있으므로 임시 포트 4299 사용.
    PREFLIGHT_PORT=4299

    # 이전 배포가 interrupt 되어 4299 에 좀비 프로세스가 남아있을 수 있음.
    # 좀비가 응답 중이면 새 spawn 은 EADDRINUSE 로 async 실패 → 그 짧은 window 에
    # curl 이 좀비에게 응답받고 kill -0 도 true → false-positive.
    # 대응: 좀비 감지 → 정리 시도 → 재검증 → 여전히 응답하면 abort (검증 불가능한 상태).
    if curl -sS -f -o /dev/null "http://127.0.0.1:${PREFLIGHT_PORT}/health" 2>/dev/null; then
        echo "WARN: pre-flight port ${PREFLIGHT_PORT} 이 이미 응답 중 (좀비 프로세스 의심)."
        if command -v lsof >/dev/null 2>&1; then
            STALE_PIDS=$(lsof -ti "tcp:${PREFLIGHT_PORT}" 2>/dev/null || true)
            if [ -n "$STALE_PIDS" ]; then
                echo "stopping stale process(es): $STALE_PIDS"
                echo "$STALE_PIDS" | xargs -r kill -TERM 2>/dev/null || true
                sleep 2
                echo "$STALE_PIDS" | xargs -r kill -KILL 2>/dev/null || true
                sleep 1
            fi
        else
            echo "WARN: lsof 없음 → 좀비 자동 정리 불가."
        fi
        # 재검증: 좀비가 정리되었는지 확인. 여전히 응답하면 pre-flight 결과 신뢰 불가.
        if curl -sS -f -o /dev/null "http://127.0.0.1:${PREFLIGHT_PORT}/health" 2>/dev/null; then
            echo "ERROR: 좀비 정리 실패 — port ${PREFLIGHT_PORT} 이 여전히 응답 중."
            echo "  운영자 수동 확인: lsof -i tcp:${PREFLIGHT_PORT} → 해당 프로세스 종료."
            echo "  이 상태에서는 pre-flight 결과가 좀비 응답인지 새 spawn 응답인지 구분 불가 → abort."
            rm -f dist/mcp/server.staged.cjs
            echo "removed staged build. dist/mcp/server.cjs 는 old 유지 → 서비스 무중단."
            exit 1
        fi
        echo "좀비 정리 완료 → pre-flight 진행"
    fi

    # Staged build 산출물을 실행 — dist/mcp/server.cjs 는 old 인스턴스가 계속 사용 중.
    PREFLIGHT_LOG=$(mktemp -t mcp-preflight-XXXXXX.log)
    MCP_TRANSPORT=http MCP_PORT="$PREFLIGHT_PORT" node dist/mcp/server.staged.cjs > "$PREFLIGHT_LOG" 2>&1 &
    PREFLIGHT_PID=$!

    PREFLIGHT_OK=0
    for i in {1..20}; do
        # curl 성공 자체는 응답만 확인 — spawned PID 가 실제로 살아있는지도 병행 검증.
        # (좀비 정리 이후에도 재바인딩 실패 등 예외 방어)
        if curl -sS -f -o /dev/null "http://127.0.0.1:${PREFLIGHT_PORT}/health" \
           && kill -0 "$PREFLIGHT_PID" 2>/dev/null; then
            PREFLIGHT_OK=1
            echo "pre-flight OK (after ${i}s, PID $PREFLIGHT_PID alive)"
            break
        fi
        # 프로세스가 이미 죽었는지 확인 (early exit 감지)
        if ! kill -0 "$PREFLIGHT_PID" 2>/dev/null; then
            echo "ERROR: pre-flight 프로세스가 조기 종료. 스택 트레이스:"
            cat "$PREFLIGHT_LOG" || true
            rm -f "$PREFLIGHT_LOG"
            # Staged 파일 정리. Server.cjs 는 old 그대로 (덮어쓰지 않음) → dist 롤백 불필요.
            rm -f dist/mcp/server.staged.cjs
            echo "removed staged build. dist/mcp/server.cjs 는 old 유지 → 서비스 무중단."
            echo "배포 abort."
            exit 1
        fi
        sleep 1
    done

    # pre-flight 프로세스 정리 (성공 여부 무관)
    kill -TERM "$PREFLIGHT_PID" 2>/dev/null || true
    wait "$PREFLIGHT_PID" 2>/dev/null || true

    if [ "$PREFLIGHT_OK" != "1" ]; then
        echo "ERROR: pre-flight health 실패. 로그:"
        cat "$PREFLIGHT_LOG" || true
        rm -f "$PREFLIGHT_LOG"
        rm -f dist/mcp/server.staged.cjs
        echo "removed staged build. dist/mcp/server.cjs 는 old 유지 → 서비스 무중단."
        echo "배포 abort."
        exit 1
    fi
    rm -f "$PREFLIGHT_LOG"

    # Pre-flight 통과 → staged → server.cjs atomic activate.
    # 이 시점부터 subprocess spawn (bot AI 호출) 은 새 dist 를 로드.
    npm run build:mcp:activate

    echo "=== 7. PM2 — MCP 재시작 + health 재확인 ==="
    # pre-flight 통과 후에만 실제 서비스 포트 (4200) 인스턴스 교체.
    # startOrRestart (hard restart) 사용 이유:
    # 고정 포트 (127.0.0.1:4200) 를 잡는 fork 단일 프로세스라 old 가 살아있는 상태에서
    # 새 인스턴스가 뜨면 EADDRINUSE. reload 는 replacement 를 먼저 스폰해서 이 상황을 유발.
    # hard restart = stop old → spawn new 순서라 안전. 봇 (myfinance-bot) 도 동일 패턴 (#356 참조).
    pm2 startOrRestart ecosystem.config.js --only myfinance-mcp

    MCP_HEALTHY=0
    for i in {1..20}; do
        if curl -sS -f -o /dev/null http://127.0.0.1:4200/health; then
            MCP_HEALTHY=1
            echo "MCP server healthy (after ${i}s)"
            break
        fi
        sleep 1
    done
    if [ "$MCP_HEALTHY" != "1" ]; then
        echo "ERROR: MCP restart 후 health 실패 (pre-flight 는 통과했지만 실서비스 포트 문제 가능)."
        pm2 logs myfinance-mcp --lines 50 --nostream || true

        # No-downtime rollback 유지: 새 dist 로 restart 했더니 health 실패 →
        # old dist 로 되돌리고 pm2 restart 로 이전 프로세스 복구 시도.
        MCP_ROLLBACK_HEALTHY=0
        if [ -n "$DIST_MCP_BACKUP" ] && [ -f "$DIST_MCP_BACKUP" ]; then
            echo "attempting rollback: restore old dist/mcp/server.cjs + pm2 restart"
            if ! cp "$DIST_MCP_BACKUP" dist/mcp/server.cjs; then
                echo "WARN: old dist 복원 cp 실패 — rollback 시도 불가"
            else
                # pm2 restart 결과를 PIPESTATUS 로 확인 (silent 실패 방지)
                pm2 restart myfinance-mcp --update-env 2>&1 | tail -5
                if [ "${PIPESTATUS[0]}" -ne 0 ]; then
                    echo "WARN: pm2 restart 자체 실패 (PM2_HOME/권한 등 확인 필요)"
                fi
                for i in {1..10}; do
                    if curl -sS -f -o /dev/null http://127.0.0.1:4200/health; then
                        MCP_ROLLBACK_HEALTHY=1
                        echo "old MCP 복구 성공 (after ${i}s) — 웹/봇 old 상태 유지"
                        break
                    fi
                    sleep 1
                done
            fi
        fi
        if [ "$MCP_ROLLBACK_HEALTHY" != "1" ]; then
            echo "ERROR: rollback health 실패 — old dist 도 4200 응답 없음."
            # crash-loop 방지: 첫 HTTP 배포에서 old dist 가 stdio-only 라 HTTP mode 에서
            # 반복 크래시할 수 있음. pm2 stop 으로 loop 차단 (운영자 수동 개입 유도).
            echo "myfinance-mcp 를 stop 처리하여 crash-loop 회피. 운영자 수동 확인 필요."
            pm2 stop myfinance-mcp 2>&1 | tail -3 || true
        fi
        echo "웹/봇 재시작 X. 배포 abort. mcp-config trap 이 old 로 복원 시도."
        exit 1
    fi

    # health 성공 → 새 MCP 정상. old dist 백업 삭제.
    if [ -n "$DIST_MCP_BACKUP" ]; then
        rm -f "$DIST_MCP_BACKUP"
        DIST_MCP_BACKUP=""
    fi

    # MCP HTTP 서버가 검증 완료된 지금 시점에 mcp-config.json 을 최종 swap.
    # 순서: 먼저 swap → trap 해제 → pm2 save (save 실패는 배포 abort 이지만 config 는 이미
    # 정합 상태이므로 config 롤백 X, 서비스 그대로).
    if [ -n "$MCP_CONFIG_BACKUP" ]; then
        git checkout HEAD -- "$MCP_CONFIG_REL"
        rm -f "$MCP_CONFIG_BACKUP"
        MCP_CONFIG_BACKUP=""
        echo "swapped mcp-config to new HTTP config"
    fi
    trap - EXIT

    # 첫 배포에서 새 앱을 추가한 뒤 pm2 save 를 하지 않으면 host reboot 후
    # pm2 resurrect 가 이전 저장된 프로세스 목록만 복원 → myfinance-mcp 실종.
    # 매 배포마다 save 로 최신 프로세스 목록 동기화.
    # 여기서 실패해도 서비스는 정상 (config swap + MCP running 이미 완료).
    # 다만 다음 reboot 후 resurrect 가 문제될 수 있어 set -e 로 abort → 운영자 확인 유도.
    pm2 save --force
else
    echo "=== 6-7. skipped MCP HTTP steps (stdio target) ==="
    # rollback 경로: target 의 dist/mcp/server.cjs 는 stdio-only 라 HTTP pre-flight/restart
    # 필요 없음. 기존 myfinance-mcp PM2 app 이 running 중이면 stop + delete → 이후 pm2 save
    # 로 프로세스 목록에서도 제거. bot/web 은 stdio config 로 서브프로세스 spawn 하여 tool 호출.
    if pm2 describe myfinance-mcp >/dev/null 2>&1; then
        echo "stopping/deleting myfinance-mcp (stdio target 은 standalone MCP 불사용)"
        pm2 delete myfinance-mcp || true
        pm2 save --force
    fi
    # stdio path 는 dist rollback 이 불필요 → 백업 정리.
    if [ -n "$DIST_MCP_BACKUP" ]; then
        rm -f "$DIST_MCP_BACKUP"
        DIST_MCP_BACKUP=""
    fi
    # stdio 경로 정리 완료 → trap 해제 (여기까지 왔으면 build/pm2 정리 성공).
    trap - EXIT
fi

echo "=== 8. PM2 — 웹/봇 재시작 ==="
# 웹: stateless → graceful reload (zero-downtime)
pm2 startOrReload ecosystem.config.js --only myfinance
# 봇: 텔레그램 long polling 은 토큰당 1 인스턴스만 허용 → reload 시 두 봇이 겹치면
# 409 Conflict. fork 단일 인스턴스라 hard restart 가 안전 (옛 인스턴스 stop 후 새로 spawn).
# docs/specs/356-bot-409-conflict-fix.md 참조.
pm2 startOrRestart ecosystem.config.js --only myfinance-bot

echo ""
echo "=== Deploy complete: $TARGET ==="
pm2 status
echo "https://finance.starryjeju.net"
