#!/bin/sh
# Installs the Arbor print agent on a Raspberry Pi (or any Debian box) that has
# the printer attached over USB. Usage:
#
#   sudo ./install.sh <convex-url> <agent-token> [queue-name]
#
# The queue defaults to "ou-wh1" and is created automatically on first print.
set -eu

if [ "$#" -lt 2 ]; then
  echo "usage: sudo $0 <convex-url> <agent-token> [queue-name]" >&2
  exit 1
fi

CONVEX_URL="$1"
AGENT_TOKEN="$2"
QUEUE="${3:-ou-wh1}"
HERE="$(cd "$(dirname "$0")" && pwd)"

command -v node >/dev/null 2>&1 || {
  echo "node is required (apt-get install -y nodejs npm)" >&2
  exit 1
}

apt-get update
apt-get install -y cups cups-client ipp-usb

install -d /opt/arbor-print-agent
install -m 0644 "$HERE/package.json" /opt/arbor-print-agent/package.json
install -m 0755 "$HERE/src/agent.mjs" /opt/arbor-print-agent/agent.mjs
( cd /opt/arbor-print-agent && npm install --omit=dev --no-audit --no-fund )

cat > /etc/arbor-print-agent.env <<EOF
CONVEX_URL=$CONVEX_URL
PRINT_AGENT_TOKEN=$AGENT_TOKEN
PRINTER_QUEUE=$QUEUE
EOF
chmod 600 /etc/arbor-print-agent.env

install -m 0644 "$HERE/systemd/arbor-print-agent.service" /etc/systemd/system/arbor-print-agent.service
systemctl daemon-reload
systemctl enable --now arbor-print-agent
systemctl status --no-pager arbor-print-agent || true
