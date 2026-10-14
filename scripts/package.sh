#!/usr/bin/env bash
set -euo pipefail

# Determine script directory and delegate to cross-platform Node packager
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/package.js" "$@"
