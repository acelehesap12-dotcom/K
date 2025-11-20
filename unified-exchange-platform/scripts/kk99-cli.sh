#!/usr/bin/env bash
set -e

# KK99 Exchange Platform - CLI Management Tool
# Provides utilities for managing the platform

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if service is running
check_service() {
    local service=$1
    if docker ps | grep -q "kk99-$service"; then
        return 0
    else
        return 1
    fi
}

# Command: status
cmd_status() {
    log_info "Checking service status..."
    
    echo ""
    echo "Service Status:"
    echo "==============="
    
    local services=("vault" "postgres" "kafka" "redis" "backend" "engine")
    
    for service in "${services[@]}"; do
        if check_service "$service"; then
            log_success "$service is running"
        else
            log_warn "$service is not running"
        fi
    done
    
    echo ""
    echo "API Status:"
    if curl -s http://localhost:3001/health > /dev/null; then
        log_success "Backend API is responding"
    else
        log_warn "Backend API is not responding"
    fi
    
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        log_success "Frontend is responding"
    else
        log_warn "Frontend is not responding"
    fi
}

# Command: logs
cmd_logs() {
    local service=$1
    if [ -z "$service" ]; then
        log_error "Service name required. Usage: kk99 logs <service>"
        echo "Available services: vault, postgres, kafka, redis, backend, engine"
        exit 1
    fi
    
    log_info "Showing logs for $service..."
    docker logs -f "kk99-$service"
}

# Command: restart
cmd_restart() {
    local service=$1
    if [ -z "$service" ]; then
        log_error "Service name required. Usage: kk99 restart <service>"
        exit 1
    fi
    
    log_info "Restarting $service..."
    docker-compose restart "$service"
    log_success "$service restarted"
}

# Command: backup
cmd_backup() {
    local backup_dir="${PROJECT_DIR}/backups"
    mkdir -p "$backup_dir"
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="${backup_dir}/kk99_backup_${timestamp}.sql"
    
    log_info "Creating database backup..."
    docker-compose exec -T postgres pg_dump -U postgres kk99_exchange > "$backup_file"
    
    log_success "Backup created: $backup_file"
    echo "File size: $(du -h "$backup_file" | cut -f1)"
}

# Command: restore
cmd_restore() {
    local backup_file=$1
    if [ -z "$backup_file" ]; then
        log_error "Backup file required. Usage: kk99 restore <backup_file>"
        exit 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        exit 1
    fi
    
    log_warn "This will overwrite the current database. Continue? (y/N)"
    read -r response
    if [ "$response" != "y" ]; then
        log_info "Restore cancelled"
        return
    fi
    
    log_info "Restoring database from $backup_file..."
    cat "$backup_file" | docker-compose exec -T postgres psql -U postgres kk99_exchange
    
    log_success "Database restored"
}

# Command: metrics
cmd_metrics() {
    log_info "Fetching metrics from Prometheus..."
    
    if ! curl -s http://localhost:9090/api/v1/targets > /dev/null; then
        log_error "Prometheus is not responding on localhost:9090"
        exit 1
    fi
    
    echo ""
    echo "Active Metrics:"
    echo "==============="
    
    local metrics=(
        "http_requests_total"
        "order_processing_time"
        "trade_execution_latency"
        "orders_created_total"
        "trades_executed_total"
        "active_users_count"
        "kk99_total_balance_sum"
    )
    
    for metric in "${metrics[@]}"; do
        local value=$(curl -s "http://localhost:9090/api/v1/query?query=$metric" | grep -o '"value":\[[^]]*\]' | head -1)
        echo "$metric: $value"
    done
}

# Command: test
cmd_test() {
    log_info "Running test suite..."
    
    cd "$PROJECT_DIR/apps/backend"
    npm run test
    
    cd "$PROJECT_DIR/apps/engine"
    cargo test
    
    log_success "Tests completed"
}

# Command: build
cmd_build() {
    log_info "Building all services..."
    
    docker-compose build
    
    log_success "Build completed"
}

# Command: deploy
cmd_deploy() {
    local env=$1
    if [ -z "$env" ]; then
        log_error "Environment required. Usage: kk99 deploy <dev|staging|prod>"
        exit 1
    fi
    
    log_info "Deploying to $env..."
    
    case "$env" in
        dev)
            docker-compose up -d
            log_success "Development deployment complete"
            ;;
        staging)
            log_info "Deploying to staging Kubernetes cluster..."
            kubectl apply -f "$PROJECT_DIR/infra/kubernetes/" -n exchange-staging
            log_success "Staging deployment complete"
            ;;
        prod)
            log_warn "Production deployment. Are you sure? (y/N)"
            read -r response
            if [ "$response" = "y" ]; then
                kubectl apply -f "$PROJECT_DIR/infra/kubernetes/" -n exchange-prod
                log_success "Production deployment complete"
            else
                log_info "Deployment cancelled"
            fi
            ;;
        *)
            log_error "Unknown environment: $env"
            exit 1
            ;;
    esac
}

# Command: help
cmd_help() {
    cat << EOF
${BLUE}KK99 Exchange Platform - CLI Management Tool${NC}

Usage: kk99 <command> [options]

Commands:
  ${GREEN}status${NC}              Show status of all services
  ${GREEN}logs${NC} <service>      Show logs for a service
  ${GREEN}restart${NC} <service>   Restart a service
  ${GREEN}backup${NC}              Create database backup
  ${GREEN}restore${NC} <file>      Restore database from backup
  ${GREEN}metrics${NC}             Show Prometheus metrics
  ${GREEN}test${NC}                Run test suite
  ${GREEN}build${NC}               Build Docker images
  ${GREEN}deploy${NC} <env>        Deploy to environment (dev|staging|prod)
  ${GREEN}help${NC}                Show this help message

Services: vault, postgres, kafka, redis, backend, engine

Examples:
  kk99 status
  kk99 logs backend
  kk99 restart postgres
  kk99 deploy staging

EOF
}

# Main
main() {
    local command=$1
    
    case "$command" in
        status)
            cmd_status
            ;;
        logs)
            shift
            cmd_logs "$@"
            ;;
        restart)
            shift
            cmd_restart "$@"
            ;;
        backup)
            cmd_backup
            ;;
        restore)
            shift
            cmd_restore "$@"
            ;;
        metrics)
            cmd_metrics
            ;;
        test)
            cmd_test
            ;;
        build)
            cmd_build
            ;;
        deploy)
            shift
            cmd_deploy "$@"
            ;;
        help)
            cmd_help
            ;;
        "")
            cmd_help
            exit 1
            ;;
        *)
            log_error "Unknown command: $command"
            cmd_help
            exit 1
            ;;
    esac
}

main "$@"
