#!/bin/zsh
# SignalX Production Build Verification Script

set -e

echo "=== SignalX Production Build Verification ==="
echo ""

APP_PATH="src-tauri/target/release/bundle/macos/SignalX.app"
DMG_PATH="src-tauri/target/release/bundle/dmg"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ ! -d "$APP_PATH" ]; then
    echo -e "${RED}✗${NC} Production build not found"
    echo ""
    echo "Building now..."
    npm run tauri:build
    echo ""
fi

if [ -d "$APP_PATH" ]; then
    echo -e "${GREEN}✓${NC} Production build exists"
    echo "   Location: $APP_PATH"
    
    # Get app size
    SIZE=$(du -sh "$APP_PATH" | cut -f1)
    echo "   Size: $SIZE"
    
    # Check if app is executable
    if [ -x "$APP_PATH/Contents/MacOS/app" ]; then
        echo -e "${GREEN}✓${NC} App binary is executable"
    else
        echo -e "${YELLOW}⚠${NC} App binary may not be executable"
    fi
    
    # Check Info.plist
    if [ -f "$APP_PATH/Contents/Info.plist" ]; then
        echo -e "${GREEN}✓${NC} Info.plist exists"
        BUNDLE_ID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP_PATH/Contents/Info.plist" 2>/dev/null || echo "not found")
        echo "   Bundle ID: $BUNDLE_ID"
    fi
    
    # Check DMG
    if [ -d "$DMG_PATH" ]; then
        DMG_COUNT=$(find "$DMG_PATH" -name "*.dmg" 2>/dev/null | wc -l | tr -d ' ')
        if [ "$DMG_COUNT" -gt 0 ]; then
            echo -e "${GREEN}✓${NC} DMG file exists"
            find "$DMG_PATH" -name "*.dmg" -exec echo "   {}" \;
        fi
    fi
    
    echo ""
    echo "To launch the app:"
    echo "  open $APP_PATH"
    echo ""
    echo "Or double-click SignalX.app in Finder"
    echo ""
else
    echo -e "${RED}✗${NC} Build failed or app not found"
    exit 1
fi


