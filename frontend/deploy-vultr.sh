#!/usr/bin/env bash
# StockPilot dashboard — deploy to Vultr (port 3001).
# The box has no Node and ~900 MB free disk, so we build LOCALLY
# (Next.js standalone output) and ship the bundle. The already-present
# node:24-alpine image runs it. Does NOT touch revenant-reader (:3000)
# or veribrief (:80).
set -euo pipefail
cd "$(dirname "$0")"
SCRIPT_DIR="$(pwd)"

echo "== refresh agent-state snapshot =="
cp ../agent/state.json data/agent-state.json
cp data/agent-state.json public/agent-state.json

echo "== build (standalone) =="
./node_modules/.bin/next build

echo "== stage bundle =="
cp -r .next/static .next/standalone/.next/static
rm -rf /tmp/stockpilot-bundle && mkdir -p /tmp/stockpilot-bundle
cp -a .next/standalone/. /tmp/stockpilot-bundle/
tar -czf /tmp/stockpilot-frontend.tgz -C /tmp/stockpilot-bundle .
ls -lh /tmp/stockpilot-frontend.tgz

ssh_vultr() {
  ssh -o "ProxyCommand=python3 "$SCRIPT_DIR/scripts/ssh-proxy-bulk.py" %h %p" \
    -i /home/hatch/.ssh/id_ed25519 -o UserKnownHostsFile=/home/hatch/.ssh/known_hosts \
    -o StrictHostKeyChecking=accept-new root@167.179.88.69 "$@"
}
scp_vultr() {
  scp -o "ProxyCommand=python3 "$SCRIPT_DIR/scripts/ssh-proxy-bulk.py" %h %p" \
    -i /home/hatch/.ssh/id_ed25519 -o UserKnownHostsFile=/home/hatch/.ssh/known_hosts \
    -o StrictHostKeyChecking=accept-new "$@"
}

echo "== upload =="
scp_vultr /tmp/stockpilot-frontend.tgz root@167.179.88.69:/tmp/stockpilot-frontend.tgz

echo "== install + (re)start container on :3001 =="
ssh_vultr 'set -e
rm -rf /root/stockpilot && mkdir -p /root/stockpilot
tar -xzf /tmp/stockpilot-frontend.tgz -C /root/stockpilot
rm -f /tmp/stockpilot-frontend.tgz
docker rm -f stockpilot 2>/dev/null || true
docker run -d --name stockpilot --restart unless-stopped \
  -p 3001:3001 -e PORT=3001 -e HOSTNAME=0.0.0.0 \
  -v /root/stockpilot:/app -w /app node:24-alpine node server.js
sleep 5
docker ps --filter name=stockpilot --format "{{.Names}} {{.Status}} {{.Ports}}"
curl -s -o /dev/null -w "local check: HTTP %{http_code}\n" http://localhost:3001/
curl -s http://localhost:3001/api/prices | head -c 300; echo'

echo "== public URL: http://167.179.88.69:3001 =="
