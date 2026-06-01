#!/usr/bin/env bash
# install.sh — sets up everything a dev needs to build, run tests, and (optionally) operate
#              the noVNC server environment.
#
# Usage:
#   ./install.sh           # base: build tools + Playwright Chromium (any Linux dev)
#   ./install.sh --server  # base + noVNC stack + cookie tools (headless server / Orange Pi)
#
# Requirements: Debian/Ubuntu-based Linux, sudo access.

set -euo pipefail

SERVER=false
for arg in "$@"; do [[ "$arg" == "--server" ]] && SERVER=true; done

log()  { echo "[install] $*"; }
step() { echo; echo "=== $* ==="; }

# ── 1. Node dependencies ────────────────────────────────────────────────────
step "npm install"
npm install

# ── 2. Playwright Chromium ──────────────────────────────────────────────────
step "Playwright: install Chromium + system dependencies"
npx playwright install chromium
npx playwright install-deps chromium

log "Base setup complete. Run 'npm test' to verify."

[[ "$SERVER" == false ]] && exit 0

# ── 3. Server-only: noVNC stack ─────────────────────────────────────────────
step "Server: apt packages (noVNC stack + cookie tools)"
sudo apt-get update -qq
sudo apt-get install -y \
  xvfb \
  openbox \
  x11vnc \
  websockify \
  novnc \
  chromium \
  python3-pycryptodome \
  tigervnc-tools

# ── 4. VNC password ──────────────────────────────────────────────────────────
step "Server: VNC password"
if [[ -f "$HOME/.vncpasswd" ]]; then
  log "VNC password already exists at ~/.vncpasswd — skipping."
else
  log "Set a VNC password (used to protect noVNC access at port 6080):"
  vncpasswd "$HOME/.vncpasswd"
fi

# ── 5. Scripts ───────────────────────────────────────────────────────────────
step "Server: make helper scripts executable"
chmod +x scripts/*.sh 2>/dev/null || true

log ""
log "Server setup complete. Start the noVNC stack with:"
log "  scripts/startnovnc.sh"
log ""
log "To run Facebook E2E tests:"
log "  1. Open http://<host>:6080/vnc.html and log in to Facebook"
log "  2. node scripts/extractcookies.js > /tmp/fb_cookies.json"
log "  3. FACEBOOK_COOKIES=\$(cat /tmp/fb_cookies.json) npm test"
