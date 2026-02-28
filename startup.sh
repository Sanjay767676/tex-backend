#!/bin/bash
# Azure App Service custom startup script
# Installs Chromium for Puppeteer PDF generation

echo "[Startup] Installing Chromium for PDF generation..."

# Install Chromium browser (available in Debian/Ubuntu repos on Azure)
apt-get update -qq 2>/dev/null
apt-get install -y -qq chromium 2>/dev/null || apt-get install -y -qq chromium-browser 2>/dev/null

# Find the installed chromium path
CHROME_PATH=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo "")

if [ -n "$CHROME_PATH" ]; then
    export PUPPETEER_EXECUTABLE_PATH="$CHROME_PATH"
    export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
    echo "[Startup] ✅ Chromium installed at: $CHROME_PATH"
else
    echo "[Startup] ⚠️ Chromium installation failed, Puppeteer will try bundled Chrome"
fi

# Start the application
echo "[Startup] Starting Node.js application..."
npm start
