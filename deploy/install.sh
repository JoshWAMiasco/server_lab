#!/usr/bin/env bash
# ServerLab installer for Ubuntu Server (22.04, 24.04, 25.x, 26.04). Safe to re-run: re-running
# updates the code, rebuilds, migrates and restarts. Data and configuration are kept.
#
# Usage:
#   sudo deploy/install.sh                     install or update
#   sudo deploy/install.sh --no-geoip          skip the DB-IP download (offline install)
#   sudo deploy/install.sh --uninstall         stop and remove the units; keep code, data, config
#   sudo deploy/install.sh --uninstall --purge also delete data, config, cache, code copy and user
#   add --yes to skip the --purge confirmation
#
# Layout:
#   /opt/serverlab                      code (root:serverlab, group read-only)
#   /var/lib/serverlab                  data: serverlab.db, setup-token, GeoIP database (700)
#   /var/cache/serverlab                Next.js runtime cache (700)
#   /etc/serverlab/serverlab.env        configuration and secrets (640 root:serverlab)
#   /usr/local/sbin/serverlab           admin command (reset-password, migrate)
# See docs/HARDENING.md for the full guide.
set -Eeuo pipefail

readonly INSTALL_DIR=/opt/serverlab
readonly DATA_DIR=/var/lib/serverlab
readonly CACHE_DIR=/var/cache/serverlab
readonly CONFIG_DIR=/etc/serverlab
readonly ENV_FILE=$CONFIG_DIR/serverlab.env
readonly SERVICE_USER=serverlab
readonly UNIT_DIR=/etc/systemd/system
readonly COLLECTOR_DROP_IN_DIR=$UNIT_DIR/serverlab-collector.service.d
readonly CLI_PATH=/usr/local/sbin/serverlab
readonly SETUP_MARKER=$DATA_DIR/.setup-complete
readonly GPU_MODE_UNIT=serverlab-gpu-mode@.service
readonly GPU_MODE_POLKIT_RULE=/etc/polkit-1/rules.d/60-serverlab-gpu-mode.rules
readonly HOST_ACTION_UNIT=serverlab-host-action.service
readonly HOST_ACTION_POLKIT_RULE=/etc/polkit-1/rules.d/61-serverlab-host-action.rules
readonly HOST_ACTION_TMPFILES=/etc/tmpfiles.d/serverlab-host-action.conf
readonly HOST_ACTION_HELPER_DIR=/usr/local/libexec/serverlab
readonly HOST_ACTION_HELPER=$HOST_ACTION_HELPER_DIR/host-action.js
readonly MINIMUM_NODE_MAJOR=22
readonly WEB_URL=http://127.0.0.1:3000
readonly COLLECTOR_GROUP_CANDIDATES=(docker systemd-journal adm utmp video render)
readonly UNIT_FILES=(
  serverlab-web.service
  serverlab-collector.service
  serverlab-geoip-update.service
  serverlab-geoip-update.timer
)
readonly APT_PACKAGES=(ca-certificates curl gzip openssl rsync sqlite3 build-essential python3)

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SOURCE_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
readonly SCRIPT_DIR SOURCE_DIR

action=install
purge=false
assume_yes=false
skip_geoip=false
setup_token=""
setup_token_path=$DATA_DIR/setup-token

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
}

parse_arguments() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --uninstall) action=uninstall ;;
      --purge)
        action=uninstall
        purge=true
        ;;
      --yes | -y) assume_yes=true ;;
      --no-geoip) skip_geoip=true ;;
      -h | --help)
        usage
        exit 0
        ;;
      *) die "unknown option: $1 (see --help)" ;;
    esac
    shift
  done
}

# --- Checks ------------------------------------------------------------------

require_root() {
  [[ $EUID -eq 0 ]] || die "run as root: sudo $0 $*"
}

check_operating_system() {
  [[ -r /etc/os-release ]] || die "cannot read /etc/os-release; ServerLab supports Ubuntu Server only"
  local os_id os_version
  # shellcheck source=/dev/null
  os_id=$(. /etc/os-release && printf '%s' "${ID:-}")
  # shellcheck source=/dev/null
  os_version=$(. /etc/os-release && printf '%s' "${VERSION_ID:-}")
  [[ $os_id == ubuntu ]] || die "ServerLab supports Ubuntu Server only (found: ${os_id:-unknown})"
  case "$os_version" in
    22.04 | 24.04 | 25.* | 26.04) log "Ubuntu $os_version" ;;
    *) warn "Ubuntu $os_version is not a tested release (22.04, 24.04, 25.x, 26.04); continuing" ;;
  esac
  command -v systemctl >/dev/null || die "systemd is required"
}

print_node_instructions() {
  cat >&2 <<'EOF'

ServerLab needs Node.js 22 or newer, installed system-wide (/usr/bin/node).
Install Node.js 22 from NodeSource, then run this script again:

  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
  sudo bash /tmp/nodesource_setup.sh
  sudo apt-get install -y nodejs
  node --version

Node from nvm, snap or a home directory does not work: the services run as the
`serverlab` user with ProtectHome=yes and cannot see it.
EOF
}

check_node() {
  local node_path node_real node_major
  if ! node_path=$(command -v node); then
    print_node_instructions
    die "node not found"
  fi
  node_real=$(readlink -f "$node_path")
  case "$node_real" in
    /home/* | /root/* | /snap/*)
      print_node_instructions
      die "node at $node_real is not a system-wide install"
      ;;
  esac
  case "$(dirname "$node_path")" in
    /usr/bin | /usr/local/bin) ;;
    *)
      print_node_instructions
      die "node is at $node_path; systemd only finds it in /usr/bin or /usr/local/bin"
      ;;
  esac
  node_major=$("$node_path" -p 'process.versions.node.split(".")[0]')
  if ((node_major < MINIMUM_NODE_MAJOR)); then
    print_node_instructions
    die "node $("$node_path" --version) is too old"
  fi
  command -v npm >/dev/null || die "npm not found (it ships with the NodeSource nodejs package)"
  log "Node $("$node_path" --version) at $node_path"
}

install_apt_packages() {
  local missing=() package
  for package in "${APT_PACKAGES[@]}"; do
    if ! dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
      missing+=("$package")
    fi
  done
  if ((${#missing[@]} > 0)); then
    log "installing packages: ${missing[*]}"
    DEBIAN_FRONTEND=noninteractive apt-get update -q
    DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends "${missing[@]}"
  fi
}

# --- Helpers -----------------------------------------------------------------

# Prints the last value of KEY in the env file, without surrounding quotes.
env_value() {
  local key=$1 line
  [[ -r $ENV_FILE ]] || return 0
  line=$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1 || true)
  line=${line#*=}
  line=${line%\"}
  line=${line#\"}
  line=${line%\'}
  line=${line#\'}
  printf '%s' "$line"
}

as_service_user() {
  runuser -u "$SERVICE_USER" -- "$@"
}

detect_magicdns_name() {
  command -v tailscale >/dev/null || return 0
  tailscale status --json 2>/dev/null | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      try {
        const status = JSON.parse(input);
        const name = (status.CertDomains && status.CertDomains[0]) || (status.Self && status.Self.DNSName) || "";
        process.stdout.write(name.replace(/\.$/, ""));
      } catch {}
    });' 2>/dev/null || true
}

# --- Install steps -----------------------------------------------------------

create_service_user() {
  if getent passwd "$SERVICE_USER" >/dev/null; then
    log "user $SERVICE_USER exists"
  else
    log "creating system user $SERVICE_USER"
    useradd --system --user-group --no-create-home --home-dir /nonexistent \
      --shell /usr/sbin/nologin --comment "ServerLab" "$SERVICE_USER"
  fi
}

create_directories() {
  log "creating $DATA_DIR, $CACHE_DIR, $CONFIG_DIR"
  install -d -m 700 -o "$SERVICE_USER" -g "$SERVICE_USER" "$DATA_DIR" "$CACHE_DIR"
  chown "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR" "$CACHE_DIR"
  chmod 700 "$DATA_DIR" "$CACHE_DIR"
  install -d -m 750 -o root -g "$SERVICE_USER" "$CONFIG_DIR"
  chown "root:$SERVICE_USER" "$CONFIG_DIR"
  chmod 750 "$CONFIG_DIR"
}

stop_services() {
  local unit
  for unit in serverlab-web.service serverlab-collector.service; do
    if systemctl is-active --quiet "$unit"; then
      log "stopping $unit"
      systemctl stop "$unit"
    fi
  done
}

sync_code() {
  [[ -f $SOURCE_DIR/package.json ]] || die "$SOURCE_DIR does not look like a ServerLab checkout"
  if [[ $(realpath "$SOURCE_DIR") == "$(realpath -m "$INSTALL_DIR")" ]]; then
    log "using the checkout at $INSTALL_DIR"
    return
  fi
  log "copying $SOURCE_DIR to $INSTALL_DIR"
  install -d -m 750 "$INSTALL_DIR"
  rsync -a --delete --chown="root:$SERVICE_USER" \
    --exclude=/node_modules/ \
    --exclude=/.next/ \
    --exclude=/dist/ \
    --exclude=/.git/ \
    --exclude=/data/ \
    --exclude=/coverage/ \
    --exclude=/test-results/ \
    --exclude=/playwright-report/ \
    --exclude=/e2e/.auth/ \
    --exclude='/.env*' \
    "$SOURCE_DIR/" "$INSTALL_DIR/"
}

build_application() {
  cd "$INSTALL_DIR"
  # Development env files would override production settings (e.g. COOKIE_SECURE=false).
  if compgen -G "$INSTALL_DIR/.env*" >/dev/null; then
    warn "removing .env* files from $INSTALL_DIR (production config lives in $ENV_FILE)"
    rm -f "$INSTALL_DIR"/.env*
  fi
  chown "root:$SERVICE_USER" "$INSTALL_DIR"
  # .next/cache points at /var/cache/serverlab at runtime; build with a real directory.
  if [[ -L $INSTALL_DIR/.next/cache ]]; then
    rm -f "$INSTALL_DIR/.next/cache"
  fi

  log "installing dependencies (npm ci)"
  npm_config_update_notifier=false npm ci --include=dev --no-audit --no-fund

  log "checking dependencies (npm audit)"
  if ! npm audit --omit=dev --audit-level=high; then
    warn "npm audit reports high-severity issues in production dependencies (see above)"
  fi

  log "building (npm run build)"
  env -u NODE_ENV NEXT_TELEMETRY_DISABLED=1 npm_config_update_notifier=false npm run build
  [[ -f $INSTALL_DIR/dist/collector/index.js ]] || die "build did not produce dist/collector/index.js"
  [[ -f $INSTALL_DIR/dist/host-action/index.js ]] || die "build did not produce dist/host-action/index.js"
  [[ -d $INSTALL_DIR/.next ]] || die "build did not produce .next/"

  rm -rf "$INSTALL_DIR/.next/cache"
  ln -s "$CACHE_DIR" "$INSTALL_DIR/.next/cache"

  log "setting ownership root:$SERVICE_USER on $INSTALL_DIR (group read-only)"
  chmod 755 "$INSTALL_DIR"/deploy/*.sh
  chown -R "root:$SERVICE_USER" "$INSTALL_DIR"
  chmod -R u=rwX,g=rX,o= "$INSTALL_DIR"
  cd /
}

write_env_file() {
  if [[ ! -f $ENV_FILE ]]; then
    log "creating $ENV_FILE from deploy/env.example"
    install -m 640 -o root -g "$SERVICE_USER" "$INSTALL_DIR/deploy/env.example" "$ENV_FILE"
  else
    log "keeping existing $ENV_FILE"
  fi
  chown "root:$SERVICE_USER" "$ENV_FILE"
  chmod 640 "$ENV_FILE"

  if [[ -z $(env_value SESSION_SECRET) ]]; then
    log "generating SESSION_SECRET"
    local secret
    secret=$(openssl rand -base64 32)
    if grep -qE '^[[:space:]]*SESSION_SECRET=' "$ENV_FILE"; then
      sed -i -E "s|^[[:space:]]*SESSION_SECRET=.*$|SESSION_SECRET=${secret}|" "$ENV_FILE"
    else
      printf '\nSESSION_SECRET=%s\n' "$secret" >>"$ENV_FILE"
    fi
  fi
}

install_cli() {
  log "installing $CLI_PATH"
  install -m 755 -o root -g root "$INSTALL_DIR/deploy/serverlab-cli.sh" "$CLI_PATH"
}

install_units() {
  log "installing systemd units"
  local unit
  for unit in "${UNIT_FILES[@]}"; do
    install -m 644 -o root -g root "$INSTALL_DIR/deploy/$unit" "$UNIT_DIR/$unit"
  done

  local existing_groups=() group
  for group in "${COLLECTOR_GROUP_CANDIDATES[@]}"; do
    if getent group "$group" >/dev/null; then
      existing_groups+=("$group")
    fi
  done
  install -d -m 755 "$COLLECTOR_DROP_IN_DIR"
  {
    echo "# Written by deploy/install.sh: the collector's extra groups that exist on this host."
    echo "# Re-run install.sh after installing Docker (or other software that adds a group)."
    echo "[Service]"
    echo "SupplementaryGroups=${existing_groups[*]}"
  } >"$COLLECTOR_DROP_IN_DIR/groups.conf"
  chmod 644 "$COLLECTOR_DROP_IN_DIR/groups.conf"
  log "collector groups: ${existing_groups[*]:-(none)}"
  if ! getent group docker >/dev/null; then
    warn "no docker group: container discovery is off until Docker is installed and install.sh re-run"
  fi

  install_gpu_mode_switch
  install_host_action_helper
  systemctl daemon-reload
}

# Firewall and fail2ban pages: a root oneshot unit that runs queued ufw / fail2ban-client commands.
# The helper is copied out of $INSTALL_DIR so the serverlab user can never edit code that runs as
# root; the polkit rule lets serverlab start that one unit and nothing else (HARDENING.md §6).
install_host_action_helper() {
  log "installing the firewall and fail2ban helper ($HOST_ACTION_UNIT + polkit rule)"
  install -d -m 755 -o root -g root "$HOST_ACTION_HELPER_DIR"
  install -m 755 -o root -g root "$INSTALL_DIR/dist/host-action/index.js" "$HOST_ACTION_HELPER"
  install -m 644 -o root -g root "$INSTALL_DIR/deploy/$HOST_ACTION_UNIT" "$UNIT_DIR/$HOST_ACTION_UNIT"
  install -m 644 -o root -g root "$INSTALL_DIR/deploy/serverlab-host-action.tmpfiles" "$HOST_ACTION_TMPFILES"
  systemd-tmpfiles --create "$HOST_ACTION_TMPFILES"
  if [[ -d /etc/polkit-1/rules.d ]]; then
    install -m 644 -o root -g root "$INSTALL_DIR/deploy/polkit/61-serverlab-host-action.rules" "$HOST_ACTION_POLKIT_RULE"
  else
    warn "polkit is not installed (no /etc/polkit-1/rules.d): the Firewall and fail2ban pages stay read-only. Install it with: sudo apt install polkitd, then re-run install.sh"
  fi
  if ! command -v fail2ban-client >/dev/null; then
    log "fail2ban is not installed; the fail2ban page shows how to install it"
  fi
}

remove_host_action_helper() {
  rm -f "$UNIT_DIR/$HOST_ACTION_UNIT" "$HOST_ACTION_POLKIT_RULE" "$HOST_ACTION_TMPFILES" "$HOST_ACTION_HELPER"
  rmdir "$HOST_ACTION_HELPER_DIR" 2>/dev/null || true
  rm -rf /run/serverlab-host-action
}

# Settings > NVIDIA GPU power: only on hybrid-graphics hosts with prime-select. The polkit rule
# lets the collector start the two serverlab-gpu-mode@ units and nothing else (HARDENING.md §6).
install_gpu_mode_switch() {
  if [[ -x /usr/bin/prime-select && -d /etc/polkit-1/rules.d ]]; then
    log "installing the NVIDIA GPU power switch ($GPU_MODE_UNIT + polkit rule)"
    install -m 644 -o root -g root "$INSTALL_DIR/deploy/$GPU_MODE_UNIT" "$UNIT_DIR/$GPU_MODE_UNIT"
    install -m 644 -o root -g root "$INSTALL_DIR/deploy/polkit/60-serverlab-gpu-mode.rules" "$GPU_MODE_POLKIT_RULE"
  else
    rm -f "$UNIT_DIR/$GPU_MODE_UNIT" "$GPU_MODE_POLKIT_RULE"
  fi
}

run_migrations() {
  log "applying database migrations as $SERVICE_USER"
  "$CLI_PATH" migrate
  local database_path
  database_path=$(env_value DATABASE_PATH)
  database_path=${database_path:-$DATA_DIR/serverlab.db}
  local file
  for file in "$database_path" "$database_path-wal" "$database_path-shm"; do
    if [[ -e $file ]]; then
      chown "$SERVICE_USER:$SERVICE_USER" "$file"
      chmod 600 "$file"
    fi
  done
}

download_geoip_database() {
  if [[ $skip_geoip == true ]]; then
    warn "skipping the GeoIP download (--no-geoip); the monthly timer will fetch it"
    return
  fi
  local geoip_path
  geoip_path=$(env_value GEOIP_DB_PATH)
  geoip_path=${geoip_path:-$DATA_DIR/dbip-city-lite.mmdb}
  log "downloading the DB-IP City Lite database"
  if ! as_service_user "$INSTALL_DIR/deploy/geoip-update.sh" "$geoip_path"; then
    warn "GeoIP download failed; logins show no location until serverlab-geoip-update.timer succeeds"
  fi
}

admin_count() {
  local database_path
  database_path=$(env_value DATABASE_PATH)
  database_path=${database_path:-$DATA_DIR/serverlab.db}
  if [[ -f $database_path ]] && command -v sqlite3 >/dev/null; then
    as_service_user sqlite3 "$database_path" 'SELECT count(*) FROM admin;' 2>/dev/null || true
  fi
}

prepare_setup_token() {
  local token_path count
  token_path=$(env_value SETUP_TOKEN_PATH)
  token_path=${token_path:-$DATA_DIR/setup-token}
  setup_token_path=$token_path

  if [[ -e $SETUP_MARKER ]]; then
    log "setup already completed; no setup token needed"
    rm -f "$token_path"
    return
  fi
  count=$(admin_count)
  if [[ $count =~ ^[0-9]+$ ]] && ((count > 0)); then
    log "an admin account exists; no setup token needed"
    as_service_user touch "$SETUP_MARKER"
    rm -f "$token_path"
    return
  fi

  if [[ -s $token_path ]]; then
    setup_token=$(tr -d '[:space:]' <"$token_path")
    log "reusing the existing setup token"
  else
    log "generating a one-time setup token"
    setup_token=$(openssl rand -hex 24)
    install -m 600 -o "$SERVICE_USER" -g "$SERVICE_USER" /dev/null "$token_path"
    printf '%s' "$setup_token" >"$token_path"
  fi
  chown "$SERVICE_USER:$SERVICE_USER" "$token_path"
  chmod 600 "$token_path"
}

start_services() {
  log "enabling and starting services"
  systemctl enable --quiet serverlab-collector.service serverlab-web.service serverlab-geoip-update.timer
  systemctl restart serverlab-collector.service serverlab-web.service
  systemctl start serverlab-geoip-update.timer

  local attempt status=000
  for attempt in $(seq 1 30); do
    status=$(curl --disable -s -o /dev/null -w '%{http_code}' "$WEB_URL/login" || true)
    if [[ $status != 000 ]]; then
      break
    fi
    sleep 1
  done
  if [[ $status == 000 ]]; then
    warn "the web UI did not answer on $WEB_URL; check: journalctl -u serverlab-web -n 50"
  else
    log "web UI is answering on $WEB_URL (HTTP $status, attempt $attempt)"
  fi
  if ! systemctl is-active --quiet serverlab-collector.service; then
    warn "the collector is not running; check: journalctl -u serverlab-collector -n 50"
  fi
}

print_summary() {
  local magicdns_name setup_url
  magicdns_name=$(env_value PUBLIC_HOSTNAME)
  magicdns_name=${magicdns_name:-$(detect_magicdns_name)}
  if [[ -n $magicdns_name ]]; then
    setup_url="https://$magicdns_name/setup"
  else
    setup_url="https://<your-host>.<tailnet>.ts.net/setup"
  fi

  echo
  log "ServerLab is installed."
  echo
  if [[ -n $setup_token ]]; then
    echo "  Finish setup in your browser:"
    echo "    URL:          $setup_url"
    echo "    Setup token:  $setup_token"
    echo "  The token is also in $setup_token_path and is deleted after setup."
    echo "  The URL works once nginx is set up as the tailnet gateway (next steps)."
    echo "  Before that, tunnel the port and open http://localhost:3000/setup in Chrome or Firefox:"
    echo "    ssh -L 3000:127.0.0.1:3000 <you>@<this-server>"
  else
    echo "  Open: $setup_url"
  fi
  echo
  echo "  Next steps (docs/HARDENING.md):"
  echo "    1. Tailscale with MagicDNS + HTTPS certificates          (section 2)"
  echo "    2. nginx gateway on the Tailscale IP + cert renewal      (section 3)"
  echo "    3. Firewall, SSH and updates                             (section 5)"
  echo "    4. Notifications: edit $ENV_FILE, then"
  echo "       sudo systemctl restart serverlab-collector serverlab-web"
  echo "    5. Run the checks in the Verify section                  (section 9)"
  echo
  echo "  Logs:            journalctl -u serverlab-web -u serverlab-collector -f"
  echo "  Reset password:  sudo serverlab reset-password"
  echo
}

install_serverlab() {
  check_operating_system
  check_node
  install_apt_packages
  create_service_user
  create_directories
  stop_services
  sync_code
  build_application
  write_env_file
  install_cli
  install_units
  run_migrations
  download_geoip_database
  prepare_setup_token
  start_services
  print_summary
}

# --- Uninstall ---------------------------------------------------------------

confirm_purge() {
  if [[ $assume_yes == true ]]; then
    return
  fi
  [[ -t 0 ]] || die "--purge deletes all ServerLab data; add --yes to confirm non-interactively"
  echo "This permanently deletes $DATA_DIR (database, login history), $CONFIG_DIR, $CACHE_DIR,"
  echo "the $SERVICE_USER user and, if it is a copy, $INSTALL_DIR."
  local answer
  read -r -p "Type 'purge' to continue: " answer
  [[ $answer == purge ]] || die "aborted"
}

uninstall_serverlab() {
  if [[ $purge == true ]]; then
    confirm_purge
  fi

  log "stopping and disabling ServerLab units"
  local unit
  for unit in serverlab-geoip-update.timer serverlab-web.service serverlab-collector.service serverlab-geoip-update.service; do
    systemctl disable --now --quiet "$unit" 2>/dev/null || true
  done
  for unit in "${UNIT_FILES[@]}"; do
    rm -f "$UNIT_DIR/$unit"
  done
  rm -rf "$COLLECTOR_DROP_IN_DIR"
  rm -f "$UNIT_DIR/$GPU_MODE_UNIT" "$GPU_MODE_POLKIT_RULE"
  remove_host_action_helper
  rm -f "$CLI_PATH"
  systemctl daemon-reload
  systemctl reset-failed --quiet 2>/dev/null || true

  if [[ $purge != true ]]; then
    log "units removed. Kept: $INSTALL_DIR, $DATA_DIR, $CONFIG_DIR, $CACHE_DIR, user $SERVICE_USER"
    log "delete everything with: sudo $0 --uninstall --purge"
    return
  fi

  log "deleting $DATA_DIR, $CONFIG_DIR, $CACHE_DIR"
  rm -rf "$DATA_DIR" "$CONFIG_DIR" "$CACHE_DIR"
  if [[ -d $INSTALL_DIR ]]; then
    if [[ $(realpath "$SOURCE_DIR") == "$(realpath "$INSTALL_DIR")" ]]; then
      warn "keeping $INSTALL_DIR: it is the checkout this script runs from; delete it by hand"
    else
      log "deleting $INSTALL_DIR"
      rm -rf "$INSTALL_DIR"
    fi
  fi
  if getent passwd "$SERVICE_USER" >/dev/null; then
    log "deleting user $SERVICE_USER"
    userdel "$SERVICE_USER" || warn "could not delete user $SERVICE_USER"
  fi
  if getent group "$SERVICE_USER" >/dev/null; then
    groupdel "$SERVICE_USER" 2>/dev/null || true
  fi
  log "ServerLab removed. nginx, Tailscale and their certificate units were not touched."
}

on_install_error() {
  warn "install failed (line $1). The ServerLab services may be stopped."
  warn "Fix the error above and run this script again; data and config are untouched."
}

main() {
  parse_arguments "$@"
  require_root "$@"
  if [[ $action == uninstall ]]; then
    uninstall_serverlab
  else
    trap 'on_install_error $LINENO' ERR
    install_serverlab
  fi
}

main "$@"
