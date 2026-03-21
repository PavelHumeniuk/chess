#!/bin/bash
# Script to install Stockfish on a Linux (Debian/Ubuntu) system

echo "Installing Stockfish..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y stockfish
elif command -v yum &> /dev/null; then
    sudo yum install -y stockfish
else
    echo "Could not find apt or yum. Please install stockfish manually."
    exit 1
fi

echo "Stockfish installed successfully!"
stockfish --version
