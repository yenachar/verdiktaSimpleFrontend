#!/bin/bash

# Load environment variables from .env file
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "Error: .env file not found in directory"
    exit 1
fi

# Check if CID argument is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <CID> [output_filename]"
    echo "Example: $0 QmSnynnZVufbeb9GVNLBjxBJ45FyHgjPYUHTvMK5VmQZcS"
    echo "Example: $0 QmSnynnZVufbeb9GVNLBjxBJ45FyHgjPYUHTvMK5VmQZcS output.zip"
    exit 1
fi

CID=$1
OUTPUT_FILE=$2

# Use Pinata gateway to download content
GATEWAY_URL="https://gateway.pinata.cloud/ipfs/$CID"

echo "Downloading content for CID: $CID"
echo "Using gateway: $GATEWAY_URL"

if [ -n "$OUTPUT_FILE" ]; then
    # Download to specified file
    echo "Saving to: $OUTPUT_FILE"
    curl -s -o "$OUTPUT_FILE" "$GATEWAY_URL"
    
    if [ $? -eq 0 ]; then
        echo "Download completed successfully!"
        echo "File size: $(ls -lh "$OUTPUT_FILE" | awk '{print $5}')"
    else
        echo "Download failed!"
        exit 1
    fi
else
    # Display content to stdout
    echo "Content:"
    echo "----------------------------------------"
    curl -s "$GATEWAY_URL"
    echo ""
    echo "----------------------------------------"
fi

