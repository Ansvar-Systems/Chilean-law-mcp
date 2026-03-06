#!/bin/bash
set -e
VERSION=$(node -p "require('./package.json').version")
REPO="Ansvar-Systems/Chilean-law-mcp"
TAG="v${VERSION}"
ASSET="database.db.gz"
OUTPUT="data/database.db"
URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"
echo "[download-db] Downloading database from GitHub releases..."
mkdir -p data
curl -fSL --retry 3 --retry-delay 5 "$URL" | gunzip > "${OUTPUT}.tmp"
mv "${OUTPUT}.tmp" "$OUTPUT"
