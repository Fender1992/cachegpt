#!/usr/bin/env bash
# ============================================================
# CacheGPT Skill — Verification Script
# Tests SKILL.md parsing, proxy script, JSON output, and error handling
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0
TOTAL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); echo -e "  ${GREEN}PASS${NC} $1"; }
fail() { FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); echo -e "  ${RED}FAIL${NC} $1: $2"; }
header() { echo -e "\n${CYAN}── $1 ──${NC}"; }

# ── Test 1: SKILL.md exists and has YAML frontmatter ─────────
header "Test 1: SKILL.md YAML Frontmatter"

SKILL_FILE="$SCRIPT_DIR/SKILL.md"
if [ ! -f "$SKILL_FILE" ]; then
    fail "SKILL.md exists" "File not found"
else
    # Check frontmatter delimiters
    FIRST_LINE=$(head -n 1 "$SKILL_FILE")
    if [ "$FIRST_LINE" != "---" ]; then
        fail "YAML frontmatter start" "First line is not '---'"
    else
        pass "YAML frontmatter start delimiter"
    fi

    # Extract frontmatter and validate with python
    if command -v python3 &>/dev/null; then
        YAML_VALID=$(python3 -c "
import sys, yaml
with open('$SKILL_FILE') as f:
    content = f.read()
parts = content.split('---', 2)
if len(parts) >= 3:
    try:
        data = yaml.safe_load(parts[1])
        if data and 'name' in data and 'version' in data:
            print('valid')
        else:
            print('missing fields')
    except yaml.YAMLError as e:
        print(f'yaml error: {e}')
else:
    print('no frontmatter')
" 2>/dev/null || echo "pyyaml not installed")

        if [ "$YAML_VALID" = "valid" ]; then
            pass "YAML frontmatter parses correctly"
        elif [ "$YAML_VALID" = "pyyaml not installed" ]; then
            # Fallback: check with grep
            if grep -q "^name: cachegpt" "$SKILL_FILE" && grep -q "^version:" "$SKILL_FILE"; then
                pass "YAML frontmatter basic structure (pyyaml not available for deep validation)"
            else
                fail "YAML frontmatter" "Missing required fields"
            fi
        else
            fail "YAML frontmatter parse" "$YAML_VALID"
        fi
    else
        fail "YAML validation" "python3 not found"
    fi

    # Check required fields exist
    for field in "name:" "description:" "version:" "tags:"; do
        if grep -q "$field" "$SKILL_FILE"; then
            pass "SKILL.md contains '$field'"
        else
            fail "SKILL.md field" "'$field' not found"
        fi
    done
fi

# ── Test 2: Python proxy script ──────────────────────────────
header "Test 2: Proxy Script"

PROXY="$SCRIPT_DIR/cachegpt-proxy.py"
if [ ! -f "$PROXY" ]; then
    fail "cachegpt-proxy.py exists" "File not found"
else
    pass "cachegpt-proxy.py exists"

    # Check it runs with --help
    if python3 "$PROXY" --help &>/dev/null; then
        pass "proxy --help exits cleanly"
    else
        fail "proxy --help" "Non-zero exit code"
    fi

    # Check subcommand help
    if python3 "$PROXY" check --help &>/dev/null; then
        pass "proxy check --help exits cleanly"
    else
        fail "proxy check --help" "Non-zero exit code"
    fi
fi

# ── Test 3: Cache check with unreachable endpoint ────────────
header "Test 3: Error Handling (unreachable endpoint)"

if [ -f "$PROXY" ]; then
    # Use a non-routable address to simulate unreachable
    export CACHEGPT_API_URL="http://192.0.2.1:1"
    export CACHEGPT_API_KEY="test-key-for-validation"
    export CACHEGPT_TIMEOUT="500"

    OUTPUT=$(python3 "$PROXY" check \
        --prompt "Test prompt for error handling" \
        --model "test-model" \
        --config /dev/null 2>/dev/null || true)

    if echo "$OUTPUT" | python3 -c "import sys,json; json.load(sys.stdin)" &>/dev/null; then
        pass "Error output is valid JSON"
    else
        fail "Error output JSON" "Output is not valid JSON: $OUTPUT"
    fi

    STATUS=$(echo "$OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
    if [ "$STATUS" = "error" ]; then
        pass "Error status returned on unreachable endpoint"
    else
        fail "Error status" "Expected 'error', got '$STATUS'"
    fi

    unset CACHEGPT_API_URL CACHEGPT_API_KEY CACHEGPT_TIMEOUT
fi

# ── Test 4: JSON output format validation ────────────────────
header "Test 4: JSON Output Format"

if [ -f "$PROXY" ]; then
    export CACHEGPT_API_URL="http://192.0.2.1:1"
    export CACHEGPT_API_KEY="test-key"
    export CACHEGPT_TIMEOUT="500"

    OUTPUT=$(python3 "$PROXY" check \
        --prompt "Format validation test" \
        --model "claude-sonnet-4-20250514" \
        --config /dev/null 2>/dev/null || true)

    # Check required fields exist in output
    for field in status response provider model latency_ms; do
        if echo "$OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '$field' in d" &>/dev/null; then
            pass "Output contains '$field' field"
        else
            fail "Output field" "'$field' not found in output"
        fi
    done

    # Check provider detection
    PROVIDER=$(echo "$OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('provider',''))" 2>/dev/null || echo "")
    if [ "$PROVIDER" = "anthropic" ]; then
        pass "Provider correctly detected as 'anthropic' from model name"
    else
        fail "Provider detection" "Expected 'anthropic', got '$PROVIDER'"
    fi

    unset CACHEGPT_API_URL CACHEGPT_API_KEY CACHEGPT_TIMEOUT
fi

# ── Test 5: Config file ─────────────────────────────────────
header "Test 5: Configuration"

CONFIG="$SCRIPT_DIR/config.json.example"
if [ ! -f "$CONFIG" ]; then
    fail "config.json.example exists" "File not found"
else
    pass "config.json.example exists"

    if python3 -c "import json; json.load(open('$CONFIG'))" &>/dev/null; then
        pass "config.json.example is valid JSON"
    else
        fail "config.json.example" "Invalid JSON"
    fi

    # Check it doesn't contain real secrets
    if grep -q "YOUR_API_KEY_HERE" "$CONFIG"; then
        pass "config.json.example uses placeholder API key"
    else
        fail "config.json.example" "May contain a real API key"
    fi
fi

# ── Test 6: README exists ───────────────────────────────────
header "Test 6: README"

README="$SCRIPT_DIR/README.md"
if [ ! -f "$README" ]; then
    fail "README.md exists" "File not found"
else
    pass "README.md exists"

    for section in "Installation" "Configuration" "FAQ" "cachegpt.app"; do
        if grep -qi "$section" "$README"; then
            pass "README contains '$section'"
        else
            fail "README section" "'$section' not found"
        fi
    done
fi

# ── Summary ──────────────────────────────────────────────────
echo ""
echo -e "${CYAN}══════════════════════════════════════${NC}"
echo -e "${CYAN}  Test Results: $PASS passed, $FAIL failed (out of $TOTAL)${NC}"
echo -e "${CYAN}══════════════════════════════════════${NC}"

if [ $FAIL -eq 0 ]; then
    echo -e "\n  ${GREEN}All tests passed!${NC}\n"
    exit 0
else
    echo -e "\n  ${RED}$FAIL test(s) failed.${NC}\n"
    exit 1
fi
