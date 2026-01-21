#!/usr/bin/env bash
set -euo pipefail

# Test Runner Script
# Runs all tests with proper setup and reporting

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

echo "🧪 Running SignalX Test Suite"
echo "================================"

# Run preflight checks
echo ""
echo "📋 Preflight checks..."
bash "$SCRIPT_DIR/preflight.sh" || {
  echo "❌ Preflight checks failed"
  exit 1
}

# Run smoke tests
echo ""
echo "💨 Smoke tests..."
bash "$SCRIPT_DIR/smoke.sh" || {
  echo "❌ Smoke tests failed"
  exit 1
}

# Run unit tests
echo ""
echo "🔬 Unit tests..."
npm run test:run || {
  echo "❌ Unit tests failed"
  exit 1
}

# Run linting
echo ""
echo "🔍 Linting..."
npm run lint || {
  echo "❌ Linting failed"
  exit 1
}

# Run format check
echo ""
echo "✨ Format check..."
npm run format:check || {
  echo "❌ Format check failed"
  exit 1
}

echo ""
echo "✅ All tests passed!"
exit 0
