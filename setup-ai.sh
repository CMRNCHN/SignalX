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
    # Remove old SIGNALX_OLLAMA_MODEL line if exists
    sed -i.bak '/^SIGNALX_OLLAMA_MODEL=/d' .signalx.env
    # Remove commented line if exists
    sed -i.bak '/^#.*SIGNALX_OLLAMA_MODEL=/d' .signalx.env
    # Add new line
    echo "" >> .signalx.env
    echo "# AI tools (configured by setup-ai.sh)" >> .signalx.env
    echo "SIGNALX_OLLAMA_MODEL=$MODEL" >> .signalx.env
    rm -f .signalx.env.bak
    echo ""
    echo "✓ Updated .signalx.env with SIGNALX_OLLAMA_MODEL=$MODEL"
else
    echo ""
    echo "⚠ .signalx.env not found. Please add manually:"
    echo "  SIGNALX_OLLAMA_MODEL=$MODEL"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To test AI features:"
echo "  1. Restart SignalX app"
echo "  2. Select a thread with messages"
echo "  3. Click 'Summarize' or 'Draft' button"
echo ""


