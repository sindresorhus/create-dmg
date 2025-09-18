#!/usr/bin/env bash
set -euo pipefail

# Build the Swift package for composing icons
echo "Building Swift package..."
cd imageComposition
xcrun swift build -c release --arch arm64 --arch x86_64 --product compose-icon

# Copy the built executable to the root directory for easy access
cp ".build/apple/Products/Release/compose-icon" ../compose-icon

echo "Swift executable built successfully: compose-icon"