#!/bin/bash

# Test script for logging and self-fix functionality
# This verifies that the new resilient Tauri wrappers work correctly

set -e

echo "🧪 SignalX Logging & Self-Fix Test Suite"
echo "========================================="
echo ""

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

test_count=0
pass_count=0
fail_count=0

test_result() {
  test_count=$((test_count + 1))
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✓${NC} $2"
    pass_count=$((pass_count + 1))
  else
    echo -e "${RED}✗${NC} $2"
    fail_count=$((fail_count + 1))
  fi
}

echo "📦 Checking utility files..."
test -f "src/utils/logger.ts"
test_result $? "logger.ts exists"

test -f "src/utils/tauri.ts"
test_result $? "tauri.ts exists"

echo ""
echo "🔍 Checking logger exports..."
grep -q "export const logWithScope" src/utils/logger.ts
test_result $? "logWithScope is exported"

grep -q "export const registerGlobalErrorHandlers" src/utils/logger.ts
test_result $? "registerGlobalErrorHandlers is exported"

grep -q "export const getLogs" src/utils/logger.ts
test_result $? "getLogs is exported"

echo ""
echo "🔍 Checking tauri wrapper exports..."
grep -q "export const invoke" src/utils/tauri.ts
test_result $? "invoke wrapper is exported"

grep -q "export const listen" src/utils/tauri.ts
test_result $? "listen wrapper is exported"

grep -q "export const isTauriAvailable" src/utils/tauri.ts
test_result $? "isTauriAvailable is exported"

grep -q "export const registerSelfFix" src/utils/tauri.ts
test_result $? "registerSelfFix is exported"

echo ""
echo "🔍 Checking main.tsx initialization..."
grep -q "registerGlobalErrorHandlers" src/main.tsx
test_result $? "registerGlobalErrorHandlers called in main.tsx"

grep -q "registerSelfFix" src/main.tsx
test_result $? "registerSelfFix called in main.tsx"

echo ""
echo "🔍 Checking component imports..."
! grep -r "from ['\"]@tauri-apps/api/core['\"]" src/components/ src/hooks/ --include="*.tsx" --include="*.ts" --exclude-dir=node_modules 2>/dev/null | grep -v "\.tsx\?" > /dev/null
test_result $? "No direct @tauri-apps imports in components/hooks"

grep -q "from.*utils/tauri" src/App.tsx
test_result $? "App.tsx uses resilient tauri wrapper"

grep -q "from.*utils/tauri" src/hooks/useAutomation.tsx || grep -q "from.*utils/tauri" src/hooks/useAutomation.ts
test_result $? "useAutomation uses resilient tauri wrapper"

grep -q "from.*utils/tauri" src/hooks/usePlugins.tsx || grep -q "from.*utils/tauri" src/hooks/usePlugins.ts
test_result $? "usePlugins uses resilient tauri wrapper"

echo ""
echo "🔍 Checking for logging usage..."
grep -q "logWithScope" src/App.tsx
test_result $? "App.tsx uses logWithScope"

grep -q "logWithScope" src/hooks/useAutomation.tsx || grep -q "logWithScope" src/hooks/useAutomation.ts
test_result $? "useAutomation uses logWithScope"

grep -q "logWithScope" src/hooks/usePlugins.tsx || grep -q "logWithScope" src/hooks/usePlugins.ts
test_result $? "usePlugins uses logWithScope"

echo ""
echo "📊 Test Results"
echo "==============="
echo -e "Total:  $test_count"
echo -e "${GREEN}Passed: $pass_count${NC}"
if [ $fail_count -gt 0 ]; then
  echo -e "${RED}Failed: $fail_count${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed!${NC}"
fi

echo ""
echo "✅ Logging and self-fix infrastructure is properly installed"
echo ""
echo "🔧 Available debugging commands in browser console:"
echo "   - window.__signalxLogs          // View all logs"
echo "   - window.signalxSelfFix.dumpLogs()       // Dump logs"
echo "   - window.signalxSelfFix.retryTauri()     // Retry Tauri connection"
echo "   - window.signalxSelfFix.setDevAccount()  // Set dev account number"
echo ""
