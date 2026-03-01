#!/bin/bash
# Azure App Service custom startup script

echo "[Startup] Installing Chromium system dependencies..."
apt-get update -qq
apt-get install -y -qq \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2

echo "[Startup] Starting Node.js application..."
npm start
