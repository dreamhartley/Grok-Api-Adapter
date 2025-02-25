#!/bin/bash

echo "Checking project status..."

if [ ! -x "$0" ]; then
    chmod +x "$0"
fi

if [ ! -d "node_modules" ]; then
    echo "First time running - Installing dependencies..."
    if ! npm install; then
        echo "Error: npm install failed"
        read -p "Press Enter to exit..."
        exit 1
    fi
    echo "Dependencies installed successfully."
else
    echo "Dependencies already installed."
fi

echo "Starting application..."
if ! node index.js; then
    echo "Error: Application failed to start"
    read -p "Press Enter to exit..."
    exit 1
fi