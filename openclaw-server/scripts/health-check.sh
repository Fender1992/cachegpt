#!/usr/bin/env bash
# ============================================================
# OpenClaw Container Health Check
# Returns exit 0 if healthy, exit 1 if not.
# Used by Docker HEALTHCHECK and external monitoring.
# ============================================================

set -euo pipefail

PORT="${OPENCLAW_PORT:-18789}"

# Check 1: Node process is running
if ! pgrep -x "node" > /dev/null 2>&1; then
    echo "UNHEALTHY: No node process found"
    exit 1
fi

# Check 2: Port is responding
if ! curl -sf --max-time 5 "http://localhost:${PORT}/health" > /dev/null 2>&1; then
    echo "UNHEALTHY: Port ${PORT} not responding"
    exit 1
fi

echo "HEALTHY: node running, port ${PORT} responding"
exit 0
