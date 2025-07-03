#!/usr/bin/env bash
# Usage: ./scripts/zipDirShort.sh /path/to/dir [archive-name.zip]
# Example: ./scripts/zipDir.sh ./test/query
d="${1%/}" 
z="${2:-$d/$(basename "$d").zip}"  
(cd "$d" && zip -r -q -X "$z" . -x "$(basename "$z")")
