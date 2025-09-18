#!/usr/bin/env bash
set -euo pipefail

# Build the Swift package for composing icons
echo "Building Swift package..."
cd imageComposition
xcrun swift build -c release --arch arm64 --arch x86_64 --product compose-icon

# Copy the built executable to the root directory for easy access
BIN_DIR="$(xcrun swift build -c release --show-bin-path)"
cp "$BIN_DIR/compose-icon" ../compose-icon

echo "Swift executable built successfully: compose-icon"