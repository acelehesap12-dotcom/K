#!/bin/bash
# ============================================
# KK99 Exchange - Database Maintenance Script
# ============================================

set -e

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-exchange_db}"
DB_USER="${DB_USER:-exchange_user}"
BACKUP_DIR="${BACKUP_DIR:-/backup/postgres}"
LOG_FILE="/var/log/db-maintenance.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# ============================================
# 1. VACUUM ANALYZE
# ============================================
run_vacuum() {
    log "Starting VACUUM ANALYZE..."
    
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<EOF
        VACUUM ANALYZE orders;
        VACUUM ANALYZE trades;
        VACUUM ANALYZE wallets;
        VACUUM ANALYZE deposits;
        VACUUM ANALYZE withdrawals;
        VACUUM ANALYZE audit_log;
EOF
    
    if [ $? -eq 0 ]; then
        success "VACUUM ANALYZE completed"
    else
        error "VACUUM ANALYZE failed"
        return 1
    fi
}

# ============================================
# 2. REFRESH MATERIALIZED VIEWS
# ============================================
refresh_mv() {
    log "Refreshing materialized views..."
    
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<EOF
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_trading_stats;
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_symbol_stats;
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_volume;
EOF
    
    if [ $? -eq 0 ]; then
        success "Materialized views refreshed"
    else
        error "Failed to refresh materialized views"
        return 1
    fi
}

# ============================================
# 3. UPDATE TABLE STATISTICS
# ============================================
update_stats() {
    log "Updating table statistics..."
    
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "ANALYZE;"
    
    if [ $? -eq 0 ]; then
        success "Statistics updated"
    else
        error "Failed to update statistics"
        return 1
    fi
}

# ============================================
# 4. CHECK INDEX HEALTH
# ============================================
check_indexes() {
    log "Checking index health..."
    
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<EOF
        SELECT 
            schemaname,
            tablename,
            indexname,
            idx_scan
        FROM pg_stat_user_indexes
        WHERE idx_scan = 0
        ORDER BY pg_relation_size(indexrelid) DESC
        LIMIT 10;
EOF
    
    success "Index health check completed"
}

# ============================================
# 5. CHECK TABLE BLOAT
# ============================================
check_bloat() {
    log "Checking table bloat..."
    
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<EOF
        SELECT 
            schemaname,
            tablename,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
            n_dead_tup,
            n_live_tup,
            ROUND(100 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_pct
        FROM pg_stat_user_tables
        WHERE n_dead_tup > 1000
        ORDER BY n_dead_tup DESC
        LIMIT 10;
EOF
    
    success "Bloat check completed"
}

# ============================================
# 6. BACKUP DATABASE
# ============================================
backup_database() {
    log "Starting database backup..."
    
    BACKUP_FILE="$BACKUP_DIR/exchange_db_$(date +%Y%m%d_%H%M%S).sql.gz"
    
    mkdir -p "$BACKUP_DIR"
    
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --format=custom --compress=9 | gzip > "$BACKUP_FILE"
    
    if [ $? -eq 0 ]; then
        success "Backup created: $BACKUP_FILE"
        
        # Keep only last 7 days of backups
        find "$BACKUP_DIR" -name "exchange_db_*.sql.gz" -mtime +7 -delete
        success "Old backups cleaned up"
    else
        error "Backup failed"
        return 1
    fi
}

# ============================================
# 7. CHECK CONNECTION POOL
# ============================================
check_connections() {
    log "Checking connection pool status..."
    
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<EOF
        SELECT 
            state,
            COUNT(*) as connections
        FROM pg_stat_activity
        WHERE datname = '$DB_NAME'
        GROUP BY state;
EOF
    
    success "Connection pool check completed"
}

# ============================================
# 8. MAIN EXECUTION
# ============================================
main() {
    log "=========================================="
    log "KK99 Exchange - Database Maintenance"
    log "=========================================="
    
    # Daily tasks
    if [ "$1" == "daily" ]; then
        log "Running daily maintenance..."
        run_vacuum
        refresh_mv
        update_stats
        check_indexes
        check_bloat
        backup_database
    
    # Weekly tasks
    elif [ "$1" == "weekly" ]; then
        log "Running weekly maintenance..."
        run_vacuum
        refresh_mv
        update_stats
        check_indexes
        check_bloat
        backup_database
        
        # Reindex if needed
        log "Reindexing tables..."
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "REINDEX DATABASE $DB_NAME CONCURRENTLY;"
        success "Reindex completed"
    
    # Check only
    elif [ "$1" == "check" ]; then
        log "Running health checks..."
        check_indexes
        check_bloat
        check_connections
    
    else
        error "Usage: $0 {daily|weekly|check}"
        exit 1
    fi
    
    log "=========================================="
    log "Maintenance completed successfully"
    log "=========================================="
}

main "$@"
