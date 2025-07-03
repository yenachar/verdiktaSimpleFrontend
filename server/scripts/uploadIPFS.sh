#!/usr/bin/env bash
# uploadIPFS.sh — upload a file to Pinata (IPFS)
# Usage: ./scripts/uploadIPFS.sh path/to/archive.zip [display-name]
# Example: ./scripts/uploadIPFS.sh ./test/query/query.zip

set -euo pipefail

#############################################################################
# 1.  Load .env that sits in the directory you run the script from
#############################################################################
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
else
  echo ".env not found in $(pwd). Make sure it contains your Pinata creds." >&2
  exit 1
fi

#############################################################################
# 2.  Basic checks
#############################################################################
[[ $# -ge 1 ]] || { echo "Usage: $0 <file> [name]"; exit 1; }
[[ -f $1 ]]    || { echo "File '$1' not found";   exit 1; }

FILE="$1"
NAME="${2:-$(basename "$FILE")}"

BASE_URL="${IPFS_PINNING_SERVICE:-https://api.pinata.cloud}"
UPLOAD_URL="${BASE_URL%/}/pinning/pinFileToIPFS"   # trim trailing / then append path

#############################################################################
# 3.  Build auth headers (JWT or legacy key/secret)
#############################################################################
declare -a CURL_ARGS
if [[ -n "${IPFS_PINNING_KEY:-}" ]]; then
  CURL_ARGS+=( -H "Authorization: Bearer ${IPFS_PINNING_KEY}" )
elif [[ -n "${PINATA_API_KEY:-}" && -n "${PINATA_SECRET_API_KEY:-}" ]]; then
  CURL_ARGS+=( -H "pinata_api_key: ${PINATA_API_KEY}" )
  CURL_ARGS+=( -H "pinata_secret_api_key: ${PINATA_SECRET_API_KEY}" )
else
  echo "Missing Pinata credentials. Provide either:
  • IPFS_PINNING_KEY   (a JWT)
  or
  • PINATA_API_KEY and PINATA_SECRET_API_KEY" >&2
  exit 1
fi

#############################################################################
# 4.  Upload the file
#############################################################################
echo "Uploading '$FILE' to Pinata ..."
response=$(curl -sSL -X POST "${CURL_ARGS[@]}" \
  -F "file=@${FILE}" \
  -F "pinataMetadata={\"name\":\"${NAME}\"};type=application/json" \
  "$UPLOAD_URL")

#############################################################################
# 5.  Extract and show the CID
#############################################################################
if command -v jq >/dev/null 2>&1; then
  CID=$(echo "$response" | jq -r '.IpfsHash // .IpfsCid // .cid // empty')
else
  CID=$(echo "$response" | grep -oE '"(IpfsHash|IpfsCid|cid)"\s*:\s*"[^"]+"' \
        | head -n1 | cut -d'"' -f4)
fi

if [[ -n "$CID" ]]; then
  echo "CID: $CID"
else
  echo "Upload response (no CID found):"
  echo "$response"
fi

