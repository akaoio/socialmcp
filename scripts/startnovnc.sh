#!/usr/bin/env bash
# startnovnc.sh — starts the full noVNC stack for headless server environments.
#
# Stack: Xvfb :1 → openbox → x11vnc → websockify → noVNC at :6080
#
# Usage:
#   scripts/startnovnc.sh            # start all services (daemonized)
#   scripts/startnovnc.sh --stop     # kill all services
#
# Access: http://<host>:6080/vnc.html  (VNC password set during install)

set -euo pipefail

DISPLAY_NUM=1
VNC_PORT=5901
NOVNC_PORT=6080
VNCPASSWD="$HOME/.vncpasswd"
LOGDIR="/tmp/socialmcp-novnc"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

stop() {
  echo "[novnc] stopping..."
  pkill -f "Xvfb :${DISPLAY_NUM}" 2>/dev/null || true
  pkill -f "openbox"              2>/dev/null || true
  pkill -f "x11vnc.*:${DISPLAY_NUM}" 2>/dev/null || true
  pkill -f "websockify.*${NOVNC_PORT}" 2>/dev/null || true
  echo "[novnc] stopped."
  exit 0
}

[[ "${1:-}" == "--stop" ]] && stop

mkdir -p "$LOGDIR"

# ── Xvfb ────────────────────────────────────────────────────────────────────
if ! pgrep -f "Xvfb :${DISPLAY_NUM}" > /dev/null; then
  echo "[novnc] starting Xvfb :${DISPLAY_NUM}..."
  Xvfb ":${DISPLAY_NUM}" -screen 0 1280x800x24 -ac \
    > "$LOGDIR/xvfb.log" 2>&1 &
  sleep 1
fi

# ── openbox ──────────────────────────────────────────────────────────────────
if ! pgrep -f openbox > /dev/null; then
  echo "[novnc] starting openbox..."
  DISPLAY=":${DISPLAY_NUM}" openbox --startup "" \
    > "$LOGDIR/openbox.log" 2>&1 &
  sleep 1
fi

# ── x11vnc ───────────────────────────────────────────────────────────────────
if ! pgrep -f "x11vnc" > /dev/null; then
  echo "[novnc] starting x11vnc on :${VNC_PORT}..."
  x11vnc \
    -display ":${DISPLAY_NUM}" \
    -rfbport "${VNC_PORT}" \
    -rfbauth "${VNCPASSWD}" \
    -noxdamage \
    -forever \
    -bg \
    -logfile "$LOGDIR/x11vnc.log"
  sleep 1
fi

# ── websockify (noVNC) ───────────────────────────────────────────────────────
NOVNC_DIR="$(find /usr/share/novnc /usr/lib/novnc 2>/dev/null -maxdepth 0 | head -1)"
if [[ -z "$NOVNC_DIR" ]]; then
  echo "[novnc] ERROR: novnc not found. Run ./install.sh --server first."
  exit 1
fi

if ! pgrep -f "websockify.*${NOVNC_PORT}" > /dev/null; then
  echo "[novnc] starting websockify on :${NOVNC_PORT}..."
  websockify \
    --web "$NOVNC_DIR" \
    --daemon \
    --log-file "$LOGDIR/websockify.log" \
    "[::]":"${NOVNC_PORT}" \
    "localhost:${VNC_PORT}"
fi

echo ""
echo "[novnc] stack running."
echo "  Access: http://$(hostname -I | awk '{print $1}'):${NOVNC_PORT}/vnc.html"
echo "  Logs:   ${LOGDIR}/"
echo ""
echo "To stop: scripts/startnovnc.sh --stop"
