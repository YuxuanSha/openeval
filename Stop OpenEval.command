#!/bin/bash
set -eu
cd "$(dirname "$0")"
openeval_node="${OPENEVAL_NODE:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}"
if [ ! -x "$openeval_node" ]; then openeval_node="$(command -v node || true)"; fi
if [ -z "$openeval_node" ]; then echo '需要 Node.js 24+；可设置 OPENEVAL_NODE。'; exit 1; fi
"$openeval_node" scripts/local-service.mjs stop
