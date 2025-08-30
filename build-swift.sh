#!/bin/bash

# Build the Swift package for composing icons
echo "Building Swift package..."
cd imageComposition
swift build --configuration release --product compose-icon

# Copy the built executable to the root directory for easy access
cp .build/release/compose-icon ../compose-icon

echo "Swift executable built successfully: compose-icon"