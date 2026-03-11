#!/usr/bin/env bash
#
# PostgreSQL 백업 복원 스크립트
# 사용법: ./scripts/restore-db.sh [백업파일경로]
# 예시: ./scripts/restore-db.sh backups/myfinance_20260311_030000.sql.gz
#

set -euo pipefail

BACKUP_FILE="${1:-}"
DB_NAME="${DB_NAME:-myfinance}"

# DB_NAME 검증 (글롭/conninfo 방지)
if ! [[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "ERROR: DB_NAME 값이 올바르지 않습니다: $DB_NAME" >&2
    exit 1
fi

if [ -z "$BACKUP_FILE" ]; then
    echo "사용법: $0 <백업파일경로>"
    echo ""
    echo "사용 가능한 백업:"
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
    BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
    if [ -d "$BACKUP_DIR" ]; then
        ls -lh "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null || echo "  (백업 없음)"
    else
        echo "  (백업 디렉토리 없음)"
    fi
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: 파일을 찾을 수 없습니다: $BACKUP_FILE" >&2
    exit 1
fi

echo "경고: $DB_NAME 데이터베이스에 백업 SQL을 적용합니다."
echo "  - 빈 DB 또는 사전 초기화된 DB에서 실행하세요."
echo "  - 기존 테이블이 있으면 충돌로 실패할 수 있습니다."
read -r -p "계속하시겠습니까? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "취소되었습니다."
    exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 복원 시작: $BACKUP_FILE → $DB_NAME"

if ! gunzip -c "$BACKUP_FILE" | psql --no-password -v ON_ERROR_STOP=1 --single-transaction --dbname="$DB_NAME"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: 복원 실패!" >&2
    exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 복원 완료"
