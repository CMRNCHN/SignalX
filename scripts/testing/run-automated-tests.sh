#!/bin/bash

# 🤖 Automated Testing Agent Runner
# Runs the comprehensive SignalX testing suite

echo "🤖 SignalX Automated Testing Agent"
echo "=================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the SignalX project root directory"
    exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is required but not installed"
    exit 1
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is required but not installed"
    exit 1
fi

echo "✅ Environment checks passed"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Error: Failed to install dependencies"
        exit 1
    fi
fi

# Build Tauri binary if needed
if [ ! -f "src-tauri/target/release/signalx-tui" ]; then
    echo "🔨 Building Tauri binary..."
    npm run tauri:build
    if [ $? -ne 0 ]; then
        echo "❌ Error: Failed to build Tauri binary"
        exit 1
    fi
fi

echo "✅ Setup complete"
echo ""

# Install Playwright browsers if needed
echo "🎭 Checking Playwright browsers..."
npx playwright install chromium
if [ $? -ne 0 ]; then
    echo "⚠️  Warning: Playwright browser installation failed, but continuing..."
fi

echo ""
echo "🚀 Starting automated tests..."
echo "This will take several minutes. Please wait..."
echo ""

# Run the automated testing agent
node tools/automated-testing-agent.js

exit_code=$?

echo ""
if [ $exit_code -eq 0 ]; then
    echo "🎉 All tests passed! Check AUTOMATED_TEST_RESULTS.md for details."
else
    echo "⚠️  Some tests failed. Check AUTOMATED_TEST_RESULTS.md for details."
fi

echo ""
echo "📄 Test report saved to: AUTOMATED_TEST_RESULTS.md"
