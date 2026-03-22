#!/usr/bin/env bash
# ============================================================
# OpenClaw Server — First-Time Setup
# Sets up Docker environment for CacheGPT monitoring & growth agents
# ============================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$HOME/openclaw-backups"

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
header()  { echo -e "\n${CYAN}══════════════════════════════════════${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}══════════════════════════════════════${NC}\n"; }

check_command() {
    if ! command -v "$1" &>/dev/null; then
        error "$1 is not installed. Please install it first."
        return 1
    fi
    success "$1 found: $(command -v "$1")"
}

# ── Step 1: Check prerequisites ─────────────────────────────
header "Step 1: Checking Prerequisites"

check_command docker
check_command curl
check_command jq
check_command openssl

# Check Docker Compose v2
if docker compose version &>/dev/null; then
    COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
    success "Docker Compose v2 found: $COMPOSE_VERSION"
else
    error "Docker Compose v2 not found. Install with: sudo apt install docker-compose-plugin"
    exit 1
fi

# Check Docker daemon is running
if ! docker info &>/dev/null; then
    error "Docker daemon is not running. Start with: sudo systemctl start docker"
    exit 1
fi
success "Docker daemon is running"

# ── Step 2: Configure environment ────────────────────────────
header "Step 2: Configuring Environment"

cd "$PROJECT_DIR"

if [ -f .env ]; then
    warn ".env already exists."
    read -rp "Overwrite? (y/N): " overwrite
    if [[ "$overwrite" != "y" && "$overwrite" != "Y" ]]; then
        info "Keeping existing .env"
    else
        cp .env.example .env
        info "Copied .env.example to .env"
    fi
else
    cp .env.example .env
    info "Copied .env.example to .env"
fi

echo ""
info "Please provide your configuration values (press Enter to keep defaults):"
echo ""

read_env_var() {
    local var_name="$1"
    local prompt_text="$2"
    local default_val="$3"
    local current_val

    current_val=$(grep "^${var_name}=" .env 2>/dev/null | cut -d'=' -f2- || echo "$default_val")

    if [[ "$current_val" == *"YOUR_"* ]] || [[ "$current_val" == *"GENERATE_"* ]]; then
        current_val=""
    fi

    read -rp "  $prompt_text${current_val:+ [$current_val]}: " input_val
    local final_val="${input_val:-$current_val}"

    if [ -n "$final_val" ]; then
        sed -i "s|^${var_name}=.*|${var_name}=${final_val}|" .env
    fi
}

read_env_var "ANTHROPIC_API_KEY" "Anthropic API Key" ""
read_env_var "CACHEGPT_API_KEY" "CacheGPT API Key" ""
read_env_var "TELEGRAM_BOT_TOKEN" "Telegram Bot Token" ""
read_env_var "TELEGRAM_CHAT_ID" "Telegram Chat ID" ""

# Generate gateway password
GATEWAY_PASS=$(openssl rand -base64 48)
sed -i "s|^OPENCLAW_GATEWAY_PASSWORD=.*|OPENCLAW_GATEWAY_PASSWORD=${GATEWAY_PASS}|" .env
success "Generated secure gateway password"

# ── Step 3: Create directories ───────────────────────────────
header "Step 3: Creating Directories"

mkdir -p logs/monitoring logs/growth
mkdir -p configs/monitoring-agent configs/growth-agent
mkdir -p "$BACKUP_DIR"

success "Created log directories"
success "Created config directories"
success "Created backup directory: $BACKUP_DIR"

# ── Step 4: Build Docker image ───────────────────────────────
header "Step 4: Building Docker Image"

info "Building hardened OpenClaw image (this may take a few minutes)..."
docker compose build --no-cache 2>&1 | while IFS= read -r line; do
    echo -e "  ${BLUE}│${NC} $line"
done

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    success "Docker image built successfully"
else
    error "Docker image build failed. Check the output above."
    exit 1
fi

# ── Step 5: Start containers ────────────────────────────────
header "Step 5: Starting Containers"

docker compose up -d 2>&1

info "Waiting for containers to become healthy..."
sleep 10

MONITORING_HEALTHY=false
GROWTH_HEALTHY=false

for i in {1..12}; do
    if docker inspect --format='{{.State.Health.Status}}' openclaw-monitoring 2>/dev/null | grep -q healthy; then
        MONITORING_HEALTHY=true
    fi
    if docker inspect --format='{{.State.Health.Status}}' openclaw-growth 2>/dev/null | grep -q healthy; then
        GROWTH_HEALTHY=true
    fi
    if $MONITORING_HEALTHY && $GROWTH_HEALTHY; then
        break
    fi
    info "Waiting... (attempt $i/12)"
    sleep 5
done

if $MONITORING_HEALTHY; then
    success "Monitoring agent is healthy"
else
    warn "Monitoring agent not yet healthy (may still be starting)"
fi

if $GROWTH_HEALTHY; then
    success "Growth agent is healthy"
else
    warn "Growth agent not yet healthy (may still be starting)"
fi

# ── Step 6: Send Telegram test ───────────────────────────────
header "Step 6: Sending Telegram Test Message"

source .env 2>/dev/null

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] && \
   [[ "$TELEGRAM_BOT_TOKEN" != *"YOUR_"* ]] && [[ "$TELEGRAM_CHAT_ID" != *"YOUR_"* ]]; then
    TEST_MSG="OpenClaw Server Setup Complete

Monitoring Agent: $(if $MONITORING_HEALTHY; then echo 'Healthy'; else echo 'Starting...'; fi)
Growth Agent: $(if $GROWTH_HEALTHY; then echo 'Healthy'; else echo 'Starting...'; fi)
Host: $(hostname)
Time: $(date '+%Y-%m-%d %H:%M:%S %Z')"

    RESPONSE=$(curl -sf -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -H "Content-Type: application/json" \
        -d "{\"chat_id\": \"${TELEGRAM_CHAT_ID}\", \"text\": \"${TEST_MSG}\"}" 2>/dev/null || echo "failed")

    if echo "$RESPONSE" | jq -e '.ok' &>/dev/null; then
        success "Telegram test message sent"
    else
        warn "Could not send Telegram test message. Check your bot token and chat ID."
    fi
else
    warn "Telegram not configured — skipping test message"
fi

# ── Summary ──────────────────────────────────────────────────
header "Setup Complete"

echo -e "  ${GREEN}Monitoring Agent:${NC} http://127.0.0.1:18789"
echo -e "  ${GREEN}Growth Agent:${NC}     http://127.0.0.1:18790"
echo -e "  ${GREEN}Logs:${NC}             $PROJECT_DIR/logs/"
echo -e "  ${GREEN}Backups:${NC}          $BACKUP_DIR/"
echo -e "  ${GREEN}Config:${NC}           $PROJECT_DIR/.env"
echo ""
echo -e "  ${YELLOW}Useful commands:${NC}"
echo "    docker compose logs -f monitoring-agent   # Follow monitoring logs"
echo "    docker compose logs -f growth-agent       # Follow growth logs"
echo "    docker compose ps                         # Check container status"
echo "    docker compose restart                    # Restart all agents"
echo "    $SCRIPT_DIR/backup.sh                     # Run manual backup"
echo ""
echo -e "  ${YELLOW}Daily backups:${NC} Add to crontab with:"
echo "    0 3 * * * $SCRIPT_DIR/backup.sh"
echo ""
success "All done! Your OpenClaw agents are running."
