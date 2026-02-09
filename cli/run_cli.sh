#!/bin/bash
    echo "Installing dependencies..."
    npm install
else
    echo "Running CLI..."
    ./target/release/cli
    echo "CLI is running.""
fi
