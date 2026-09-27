#!/usr/bin/env bash
# Double-click launcher: get the dev servers running (if they aren't already)
# and open the app so Dennis can pick up exactly where he left off. Never
# spawns a second copy of the servers — a past session got wedged by
# stacked tsx-watch processes after a botched Ctrl-C, so this checks the
# port before starting anything.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_URL="http://localhost:5177"
LOG_FILE="/tmp/muse-mobilize-launch.log"

# Desktop launchers (GNOME/xdg) run this without sourcing .bashrc/.zshrc, so
# nvm never loads and PATH falls through to the system node (too old for the
# optional-chaining syntax our tooling uses). Put nvm's default node first.
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/alias/default" ]; then
  nvm_default="$(cat "$NVM_DIR/alias/default")"
  nvm_default="${nvm_default#v}"
  for nvm_bin in "$NVM_DIR"/versions/node/v"$nvm_default"*/bin; do
    [ -d "$nvm_bin" ] && PATH="$nvm_bin:$PATH"
  done
fi
export PATH

is_up() {
  curl -s -o /dev/null -m 1 "$WEB_URL"
}

if ! is_up; then
  echo "$(date -Iseconds) starting dev servers" >>"$LOG_FILE"
  cd "$REPO_DIR"
  nohup npm run dev:phone >>"$LOG_FILE" 2>&1 &
  disown

  for _ in $(seq 1 30); do
    is_up && break
    sleep 1
  done
fi

if command -v xdg-open >/dev/null; then
  xdg-open "$WEB_URL" >/dev/null 2>&1 &
else
  echo "xdg-open not found; open $WEB_URL manually" >>"$LOG_FILE"
fi
