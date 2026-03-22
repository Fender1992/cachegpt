#!/usr/bin/env bash
# ============================================================
# OpenClaw Server — Backup Script
# Backs up agent configs, memory, and logs.
# Add to crontab for daily backups:
#   0 3 * * * /path/to/openclaw-server/scripts/backup.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$HOME/openclaw-backups"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="openclaw-backup-${TIMESTAMP}.tar.gz"
RETENTION_DAYS=7

# Colors (disabled if not interactive)
if [ -t 1 ]; then
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    RED='\033[0;31m'
    NC='\033[0m'
else
    GREEN=''; YELLOW=''; RED=''; NC=''
fi

info()    { echo -e "${GREEN}[BACKUP]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Collect files to back up
BACKUP_SOURCES=()

# Project configs (excluding .env for security — back up separately if needed)
[ -d "$PROJECT_DIR/configs" ] && BACKUP_SOURCES+=("$PROJECT_DIR/configs")
[ -f "$PROJECT_DIR/docker-compose.yml" ] && BACKUP_SOURCES+=("$PROJECT_DIR/docker-compose.yml")
[ -f "$PROJECT_DIR/Dockerfile.openclaw" ] && BACKUP_SOURCES+=("$PROJECT_DIR/Dockerfile.openclaw")

# Logs
[ -d "$PROJECT_DIR/logs" ] && BACKUP_SOURCES+=("$PROJECT_DIR/logs")

# Docker volume data (export if containers are running)
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

for volume in monitoring-config monitoring-workspace growth-config growth-workspace; do
    FULL_VOLUME="openclaw-server_${volume}"
    if docker volume inspect "$FULL_VOLUME" &>/dev/null 2>&1; then
        mkdir -p "$TEMP_DIR/$volume"
        docker run --rm -v "${FULL_VOLUME}:/data:ro" -v "$TEMP_DIR/$volume:/backup" \
            alpine:latest sh -c "cp -r /data/. /backup/" 2>/dev/null || true
        BACKUP_SOURCES+=("$TEMP_DIR/$volume")
    fi
done

if [ ${#BACKUP_SOURCES[@]} -eq 0 ]; then
    warn "No files found to back up"
    exit 0
fi

# Create tarball
info "Creating backup: $BACKUP_FILE"
tar -czf "$BACKUP_DIR/$BACKUP_FILE" "${BACKUP_SOURCES[@]}" 2>/dev/null

BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
info "Backup created: $BACKUP_DIR/$BACKUP_FILE ($BACKUP_SIZE)"

# Prune old backups (keep last N days)
info "Pruning backups older than $RETENTION_DAYS days..."
DELETED=0
find "$BACKUP_DIR" -name "openclaw-backup-*.tar.gz" -type f -mtime +$RETENTION_DAYS | while read -r old_backup; do
    rm -f "$old_backup"
    DELETED=$((DELETED + 1))
    info "Deleted: $(basename "$old_backup")"
done

# Summary
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "openclaw-backup-*.tar.gz" -type f | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
info "Backup complete. $TOTAL_BACKUPS backups stored ($TOTAL_SIZE total)"
