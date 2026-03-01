#!/bin/bash
# Azure App Service custom startup script
# No runtime OS installs — Chromium is bundled via @sparticuz/chromium in node_modules

echo "[Startup] Starting Node.js application..."
npm start
