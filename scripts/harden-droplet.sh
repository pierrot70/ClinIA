#!/usr/bin/env bash
set -euo pipefail

# ClinIA droplet hardening helper.
#
# Default mode is DRY_RUN=1: commands are printed but not applied.
#
# Example dry run:
#   ALLOWED_SSH_CIDR="203.0.113.10/32" ./scripts/harden-droplet.sh
#
# Example apply:
#   ALLOWED_SSH_CIDR="203.0.113.10/32" DRY_RUN=0 CONFIRM_SSH_TESTED=yes ./scripts/harden-droplet.sh
#
# Optional stricter root SSH hardening:
#   DISABLE_ROOT_LOGIN=1 ...
#
# This script is intended for Ubuntu/Debian droplets. Run it from an active SSH
# session and keep that session open while testing a second login.

DRY_RUN="${DRY_RUN:-1}"
ALLOWED_SSH_CIDR="${ALLOWED_SSH_CIDR:-}"
SSH_PORT="${SSH_PORT:-22}"
CONFIRM_SSH_TESTED="${CONFIRM_SSH_TESTED:-no}"
DISABLE_ROOT_LOGIN="${DISABLE_ROOT_LOGIN:-0}"
APPLY_SECURITY_UPDATES="${APPLY_SECURITY_UPDATES:-0}"

SSHD_DROPIN="/etc/ssh/sshd_config.d/99-clinia-hardening.conf"
FAIL2BAN_JAIL="/etc/fail2ban/jail.d/clinia-sshd.local"

log() {
  printf '\n==> %s\n' "$1"
}

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '[dry-run] %q' "$1"
    shift || true
    for arg in "$@"; do
      printf ' %q' "$arg"
    done
    printf '\n'
  else
    "$@"
  fi
}

write_file() {
  local path="$1"
  local content="$2"

  if [[ "$DRY_RUN" == "1" ]]; then
    printf '[dry-run] write %s:\n%s\n' "$path" "$content"
  else
    install -d -m 0755 "$(dirname "$path")"
    if [[ -f "$path" ]]; then
      cp "$path" "${path}.bak.$(date -u +%Y%m%dT%H%M%SZ)"
    fi
    printf '%s\n' "$content" > "$path"
  fi
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run as root, or with sudo." >&2
    exit 1
  fi
}

validate_inputs() {
  if [[ -z "$ALLOWED_SSH_CIDR" ]]; then
    cat >&2 <<'EOF'
ALLOWED_SSH_CIDR is required.

Use your current public IP with /32, for example:
  ALLOWED_SSH_CIDR="203.0.113.10/32"

Find your public IP from your workstation, not the droplet:
  curl -4 https://ifconfig.me
EOF
    exit 1
  fi

  if [[ "$DRY_RUN" == "0" && "$CONFIRM_SSH_TESTED" != "yes" ]]; then
    cat >&2 <<'EOF'
Refusing to apply without CONFIRM_SSH_TESTED=yes.

Before applying:
  1. Confirm SSH key login works from a second terminal.
  2. Confirm ALLOWED_SSH_CIDR matches your public IP/CIDR.
  3. Keep the current SSH session open during the first test.
EOF
    exit 1
  fi
}

install_packages() {
  log "Install security packages"
  run apt-get update
  run apt-get install -y ufw fail2ban
}

configure_ssh() {
  log "Configure SSH hardening drop-in"

  local permit_root="prohibit-password"
  if [[ "$DISABLE_ROOT_LOGIN" == "1" ]]; then
    permit_root="no"
  fi

  write_file "$SSHD_DROPIN" "\
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
PermitRootLogin ${permit_root}
PermitEmptyPasswords no
X11Forwarding no
AllowTcpForwarding no"

  run sshd -t
  run systemctl reload ssh
}

configure_fail2ban() {
  log "Configure fail2ban for sshd"

  write_file "$FAIL2BAN_JAIL" "\
[sshd]
enabled = true
port = ${SSH_PORT}
filter = sshd
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h"

  run systemctl enable fail2ban
  run systemctl restart fail2ban
}

configure_ufw() {
  log "Configure UFW firewall"

  run ufw --force reset
  run ufw default deny incoming
  run ufw default allow outgoing
  run ufw allow 80/tcp
  run ufw allow 443/tcp
  run ufw allow from "$ALLOWED_SSH_CIDR" to any port "$SSH_PORT" proto tcp
  run ufw --force enable
  run ufw status verbose
}

apply_updates() {
  if [[ "$APPLY_SECURITY_UPDATES" != "1" ]]; then
    log "Security updates skipped"
    echo "Set APPLY_SECURITY_UPDATES=1 to run apt-get upgrade -y."
    return
  fi

  log "Apply package upgrades"
  run apt-get update
  run apt-get upgrade -y
}

show_post_checks() {
  log "Post-check commands"
  cat <<EOF
Run these on the droplet:
  ufw status numbered
  systemctl status fail2ban --no-pager
  fail2ban-client status sshd
  sshd -T | grep -E 'passwordauthentication|kbdinteractiveauthentication|permitrootlogin|pubkeyauthentication'
  docker ps --format "table {{.Names}}\\t{{.Image}}\\t{{.Ports}}"

From a second local terminal, test SSH before closing your current session:
  ssh root@YOUR_DROPLET_IP

Notes:
  - UFW allows SSH only from: ${ALLOWED_SSH_CIDR}
  - UFW allows public HTTP/HTTPS.
  - Docker-published ports can interact with firewall rules in surprising ways.
    Verify that only intended ports are reachable from the internet.
EOF
}

main() {
  require_root
  validate_inputs

  log "ClinIA droplet hardening"
  echo "DRY_RUN=${DRY_RUN}"
  echo "ALLOWED_SSH_CIDR=${ALLOWED_SSH_CIDR}"
  echo "SSH_PORT=${SSH_PORT}"
  echo "DISABLE_ROOT_LOGIN=${DISABLE_ROOT_LOGIN}"
  echo "APPLY_SECURITY_UPDATES=${APPLY_SECURITY_UPDATES}"

  install_packages
  configure_ssh
  configure_fail2ban
  configure_ufw
  apply_updates
  show_post_checks
}

main "$@"
