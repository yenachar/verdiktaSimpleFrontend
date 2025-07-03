#!/usr/bin/env bash
# Usage: ./scripts/uploadIPFSShort.sh path/to/archive.zip [display-name]
# Example: ./scripts/uploadIPFSShort.sh ./test/query/query.zip
set -euo pipefail
[ -f .env ] && source .env         # load creds from current dir
f=$1                               # file to upload
n=${2:-$(basename "$f")}           # display name (default: file name)
u="${IPFS_PINNING_SERVICE:-https://api.pinata.cloud}/pinning/pinFileToIPFS"
curl -sSL -X POST -H "Authorization: Bearer $IPFS_PINNING_KEY" \
     -F "file=@$f" -F "pinataMetadata={\"name\":\"$n\"};type=application/json" \
     "$u" | jq -r '.IpfsHash // .cid // .IpfsCid'
