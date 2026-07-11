#!/bin/zsh
# SignalX AI Tools Setup Script
# Installs Ollama and configures AI features

set -e

echo "=== SignalX AI Tools Setup ==="
echo ""

# Check if Ollama is installed
if ! command -v ollama >/dev/null 2>&1; then
    echo "Ollama not found. Installing via Homebrew..."
    if ! command -v brew >/dev/null 2>&1; then
        echo "ERROR: Homebrew not found. Please install Homebrew first:"
        echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    brew install ollama
    echo "✓ Ollama installed"
else
    echo "✓ Ollama already installed"
fi

# Check Ollama service
if ! pgrep -x "ollama" > /dev/null; then
    echo "Starting Ollama service..."
    ollama serve &
    sleep 2
    echo "✓ Ollama service started"
else
    echo "✓ Ollama service is running"
fi

OLLAMA_URL="${SIGNALX_OLLAMA_URL:-http://localhost:11434}"
OLLAMA_URL="${OLLAMA_URL%/}"
if command -v curl >/dev/null 2>&1; then
    if curl -sf --max-time 5 "${OLLAMA_URL}/api/tags" >/dev/null 2>&1; then
        echo "✓ Ollama HTTP API reachable at ${OLLAMA_URL}"
    else
        echo "⚠ Ollama HTTP API not reachable at ${OLLAMA_URL}"
        echo "  Try: ollama serve"
        exit 1
    fi
else
    echo "⚠ curl not found; skipping HTTP API check"
fi

# Model selection
echo ""
echo "Available models (recommended: qwen2.5:7b-instruct):"
echo "  1. qwen2.5:7b-instruct (recommended, ~4.4GB)"
echo "  2. llama3.2:3b (smaller, ~2GB)"
echo "  3. mistral:7b (alternative, ~4.1GB)"
echo "  4. Custom (enter model name)"
echo ""
read -p "Select model [1-4]: " choice

case $choice in
    1)
        MODEL="qwen2.5:7b-instruct"
        ;;
    2)
        MODEL="llama3.2:3b"
        ;;
    3)
        MODEL="mistral:7b"
        ;;
    4)
        read -p "Enter model name (e.g., llama3.2:1b): " MODEL
        ;;
    *)
        MODEL="qwen2.5:7b-instruct"
        echo "Using default: $MODEL"
        ;;
esac

echo ""
echo "Pulling model: $MODEL"
echo "This may take several minutes depending on your internet connection..."
ollama pull "$MODEL"

# Update .signalx.env
if [ -f ".signalx.env" ]; then
    sed -i.bak '/^SIGNALX_OLLAMA_MODEL=/d' .signalx.env
    sed -i.bak '/^#.*SIGNALX_OLLAMA_MODEL=/d' .signalx.env
    WROTE_OLLAMA_URL=false
    if ! grep -q '^SIGNALX_OLLAMA_URL=' .signalx.env 2>/dev/null; then
        echo "" >> .signalx.env
        echo "# AI tools (configured by setup-ai.sh)" >> .signalx.env
        echo "SIGNALX_OLLAMA_URL=${OLLAMA_URL}" >> .signalx.env
        WROTE_OLLAMA_URL=true
    fi
    echo "SIGNALX_OLLAMA_MODEL=$MODEL" >> .signalx.env
    rm -f .signalx.env.bak
    echo ""
    echo "✓ Updated .signalx.env with SIGNALX_OLLAMA_MODEL=$MODEL"
    if [ "$WROTE_OLLAMA_URL" = true ]; then
        echo "✓ Added SIGNALX_OLLAMA_URL=${OLLAMA_URL}"
    else
        echo "✓ SIGNALX_OLLAMA_URL already set in .signalx.env"
    fi
else
    echo ""
    echo "⚠ .signalx.env not found. Please add manually:"
    echo "  SIGNALX_OLLAMA_URL=${OLLAMA_URL}"
    echo "  SIGNALX_OLLAMA_MODEL=$MODEL"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "SignalX uses the local Ollama HTTP API (data never leaves your machine)."
echo "To test AI features:"
echo "  1. Ensure Ollama is running: ollama serve"
echo "  2. Restart SignalX app"
echo "  3. Select a thread with messages"
echo "  4. Click 'Summarize' or 'Draft' button"
echo "  5. Or check status: curl -s ${OLLAMA_URL}/api/tags"
echo ""


