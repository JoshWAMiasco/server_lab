#!/usr/bin/env bash
# ServerLab standalone installer: one command, no Tailscale needed.
#
# Installs ServerLab on this Ubuntu server and publishes it with nginx on the port you choose,
# over HTTPS with a self-signed certificate (or plain HTTP with --http). Safe to re-run: it
# updates the code and keeps your data, settings and earlier choices.
#
# Usage (from the unzipped folder):
#   sudo bash install.sh                          https://<this-server>:8443
#   sudo bash install.sh --port 9443              pick the port
#   sudo bash install.sh --http --port 8080       plain HTTP (only on a network you trust)
#   sudo bash install.sh --uninstall [--purge]    remove (--purge also deletes data)
#
# Options:
#   --port N            port people open in the browser (default 8443)
#   --http              serve plain HTTP instead of HTTPS (passwords travel unencrypted)
#   --hostname NAME     name or IP in links and the certificate (default: this server's IP)
#   --allow-from CIDR   with UFW active, only allow this network, e.g. 192.168.1.0/24
#   --app-port N        internal port of the web app on 127.0.0.1 (default 3000)
#   --no-geoip          skip the geolocation database download
#   --yes               do not ask before installing Node.js, nginx and other packages
set -Eeuo pipefail

readonly CONFIG_DIR=/etc/serverlab
readonly ENV_FILE=$CONFIG_DIR/serverlab.env
readonly STATE_FILE=$CONFIG_DIR/standalone.conf
readonly TLS_DIR=$CONFIG_DIR/tls
readonly TLS_CERTIFICATE=$TLS_DIR/serverlab.crt
readonly TLS_KEY=$TLS_DIR/serverlab.key
readonly DATA_DIR=/var/lib/serverlab
readonly NGINX_SITE=/etc/nginx/sites-available/serverlab-standalone.conf
readonly NGINX_LINK=/etc/nginx/sites-enabled/serverlab-standalone.conf
readonly MINIMUM_NODE_MAJOR=22

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
readonly SCRIPT_DIR
readonly SOURCE_DIR=$SCRIPT_DIR/serverlab
VERSION=$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$SOURCE_DIR/package.json" 2>/dev/null | head -n 1)
readonly VERSION=${VERSION:-unknown}

action=install
purge=false
assume_yes=false
skip_geoip=false
public_port=""
use_https=""
public_hostname=""
allow_from=""
app_port=""

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}
usage() { sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; }

is_port() { [[ ${1:-} =~ ^[0-9]+$ ]] && ((10#$1 >= 1 && 10#$1 <= 65535)); }

parse_arguments() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --port)
        is_port "${2:-}" || die "--port needs a number from 1 to 65535"
        public_port=$((10#$2))
        shift
        ;;
      --app-port)
        is_port "${2:-}" || die "--app-port needs a number from 1 to 65535"
        app_port=$((10#$2))
        shift
        ;;
      --http) use_https=false ;;
      --https) use_https=true ;;
      --hostname)
        [[ ${2:-} =~ ^[A-Za-z0-9.:-]{1,253}$ ]] || die "--hostname takes a plain host name or IP address"
        public_hostname=$2
        shift
        ;;
      --allow-from)
        [[ ${2:-} =~ ^[0-9A-Fa-f.:/]{2,49}$ ]] || die "--allow-from takes an address or network, e.g. 192.168.1.0/24"
        allow_from=$2
        shift
        ;;
      --no-geoip) skip_geoip=true ;;
      --yes | -y) assume_yes=true ;;
      --uninstall) action=uninstall ;;
      --purge)
        action=uninstall
        purge=true
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *) die "unknown option: $1 (see --help)" ;;
    esac
    shift
  done
}

confirm() {
  [[ $assume_yes == true ]] && return 0
  local answer
  read -r -p "$1 [Y/n] " answer
  [[ -z $answer || $answer =~ ^[Yy] ]]
}

# --- Remembered choices (so `sudo bash install.sh` alone updates with the same settings) ---

load_state() {
  [[ -r $STATE_FILE ]] || return 0
  local saved_port saved_https saved_hostname saved_allow saved_app_port
  # shellcheck source=/dev/null
  saved_port=$(. "$STATE_FILE" && printf '%s' "${PUBLIC_PORT:-}")
  # shellcheck source=/dev/null
  saved_https=$(. "$STATE_FILE" && printf '%s' "${USE_HTTPS:-}")
  # shellcheck source=/dev/null
  saved_hostname=$(. "$STATE_FILE" && printf '%s' "${PUBLIC_HOSTNAME:-}")
  # shellcheck source=/dev/null
  saved_allow=$(. "$STATE_FILE" && printf '%s' "${ALLOW_FROM:-}")
  # shellcheck source=/dev/null
  saved_app_port=$(. "$STATE_FILE" && printf '%s' "${APP_PORT:-}")
  previous_port=$saved_port
  previous_allow=$saved_allow
  public_port=${public_port:-$saved_port}
  use_https=${use_https:-$saved_https}
  public_hostname=${public_hostname:-$saved_hostname}
  allow_from=${allow_from:-$saved_allow}
  app_port=${app_port:-$saved_app_port}
}

save_state() {
  install -d -m 750 -o root -g serverlab "$CONFIG_DIR"
  cat >"$STATE_FILE" <<EOF
# Written by the ServerLab standalone installer. Re-running it reuses these values.
PUBLIC_PORT=$public_port
USE_HTTPS=$use_https
PUBLIC_HOSTNAME=$public_hostname
ALLOW_FROM=$allow_from
APP_PORT=$app_port
EOF
  chmod 640 "$STATE_FILE"
}

# --- Checks and prerequisites ------------------------------------------------------------

check_system() {
  [[ $EUID -eq 0 ]] || die "run as root: sudo bash $0 $*"
  [[ -r /etc/os-release ]] && grep -q '^ID=ubuntu' /etc/os-release || die "this installer supports Ubuntu Server only"
  command -v systemctl >/dev/null || die "systemd is required"
  [[ -f $SOURCE_DIR/deploy/install.sh ]] || die "ServerLab source not found next to this script ($SOURCE_DIR). Unzip the whole archive and run install.sh from its folder."
}

primary_address() {
  hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | grep -v '^127\.' | head -n 1
}

node_major() {
  command -v node >/dev/null || return 0
  node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'
}

ensure_node() {
  local major
  major=$(node_major)
  if [[ -n $major && $major -ge $MINIMUM_NODE_MAJOR ]] && command -v npm >/dev/null; then
    log "Node.js $(node --version) found"
    return
  fi
  confirm "Node.js $MINIMUM_NODE_MAJOR or newer is required. Install it now?" || die "Node.js $MINIMUM_NODE_MAJOR+ is required"
  apt-get update -q
  local candidate candidate_major
  candidate=$(apt-cache policy nodejs 2>/dev/null | awk '/Candidate:/ {print $2}')
  candidate_major=$(printf '%s' "${candidate#*:}" | sed -E 's/^([0-9]+).*/\1/')
  if [[ $candidate_major =~ ^[0-9]+$ ]] && ((candidate_major >= MINIMUM_NODE_MAJOR)); then
    log "installing Node.js $candidate from the Ubuntu archive"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -q nodejs npm
  else
    log "installing Node.js $MINIMUM_NODE_MAJOR from NodeSource (the Ubuntu archive has ${candidate:-none})"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -q ca-certificates curl gnupg
    local setup_script
    setup_script=$(mktemp)
    curl -fsSL "https://deb.nodesource.com/setup_${MINIMUM_NODE_MAJOR}.x" -o "$setup_script"
    bash "$setup_script"
    rm -f "$setup_script"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -q nodejs
  fi
  major=$(node_major)
  [[ -n $major && $major -ge $MINIMUM_NODE_MAJOR ]] || die "Node.js install did not give version $MINIMUM_NODE_MAJOR+ (got: $(node --version 2>/dev/null || echo none))"
}

ensure_packages() {
  local missing=() package
  for package in nginx openssl curl sqlite3; do
    dpkg -s "$package" >/dev/null 2>&1 || missing+=("$package")
  done
  [[ ${#missing[@]} -eq 0 ]] && return
  confirm "Install ${missing[*]}?" || die "${missing[*]} required"
  apt-get update -q
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q "${missing[@]}"
}

# Which program listens on a TCP port (empty when free).
port_owner() {
  ss -Htlnp "sport = :$1" 2>/dev/null | grep -oE 'users:\(\("[^"]+"' | head -n 1 | sed -E 's/users:\(\("//'
}

check_ports() {
  ((public_port != app_port)) || die "--port and --app-port must differ"
  local owner
  owner=$(port_owner "$public_port")
  if [[ -n $owner && $owner != nginx ]]; then
    die "port $public_port is already used by $owner. Pick another with --port."
  fi
  if [[ -n $owner && ! -e $NGINX_LINK ]]; then
    die "nginx already uses port $public_port for another site. Pick another with --port."
  fi
  owner=$(port_owner "$app_port")
  if [[ -n $owner ]] && ! systemctl is-active --quiet serverlab-web.service; then
    die "port $app_port on this machine is used by $owner. Pick another internal port with --app-port."
  fi
}

# --- Configuration -----------------------------------------------------------------------

set_env_value() {
  local key=$1 value=$2
  if grep -qE "^[[:space:]]*${key}=" "$ENV_FILE"; then
    sed -i -E "s|^[[:space:]]*${key}=.*$|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

configure_environment() {
  set_env_value PUBLIC_HOSTNAME "$public_hostname"
  if [[ $use_https == true ]]; then
    set_env_value COOKIE_SECURE true
    set_env_value TLS_CERT_PATH "$TLS_CERTIFICATE"
  else
    set_env_value COOKIE_SECURE false
    set_env_value TLS_CERT_PATH ""
  fi
}

certificate_matches_hostname() {
  [[ -f $TLS_CERTIFICATE ]] || return 1
  openssl x509 -in "$TLS_CERTIFICATE" -noout -ext subjectAltName 2>/dev/null | grep -qF "$public_hostname"
}

create_certificate() {
  [[ $use_https == true ]] || return 0
  if certificate_matches_hostname && openssl x509 -in "$TLS_CERTIFICATE" -noout -checkend 2592000 >/dev/null 2>&1; then
    log "keeping the existing certificate in $TLS_DIR"
    return
  fi
  log "creating a self-signed certificate for $public_hostname"
  local names=() address
  if [[ $public_hostname =~ ^[0-9.]+$ || $public_hostname == *:* ]]; then names+=("IP:$public_hostname"); else names+=("DNS:$public_hostname"); fi
  names+=("DNS:$(hostname)")
  for address in $(hostname -I 2>/dev/null); do
    [[ $address == "$public_hostname" ]] || names+=("IP:$address")
  done
  install -d -m 755 -o root -g root "$TLS_DIR"
  local subject_alternative_names
  subject_alternative_names=$(IFS=,; printf '%s' "${names[*]}")
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 825 \
    -subj "/CN=$public_hostname/O=ServerLab" -addext "subjectAltName=$subject_alternative_names" \
    -keyout "$TLS_KEY" -out "$TLS_CERTIFICATE" 2>/dev/null
  chmod 600 "$TLS_KEY"
  chmod 644 "$TLS_CERTIFICATE"
}

write_nginx_site() {
  log "publishing ServerLab with nginx on port $public_port ($([[ $use_https == true ]] && echo HTTPS || echo HTTP))"
  local listen_lines tls_lines ssl_flag=""
  [[ $use_https == true ]] && ssl_flag=" ssl"
  listen_lines="    listen $public_port$ssl_flag;"
  if grep -q . /proc/net/if_inet6 2>/dev/null; then
    listen_lines+="
    listen [::]:$public_port$ssl_flag;"
  fi
  if [[ $use_https == true ]]; then
    tls_lines="    ssl_certificate     $TLS_CERTIFICATE;
    ssl_certificate_key $TLS_KEY;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:serverlab_tls:10m;
    ssl_session_timeout 1d;
    # Someone typed http:// on this port: send them to https:// instead of an error page.
    error_page 497 =301 https://\$http_host\$request_uri;"
  else
    tls_lines="    # Plain HTTP (--http). Passwords and session cookies travel unencrypted."
  fi
  cat >"$NGINX_SITE" <<EOF
# ServerLab, published by the standalone installer (installer/install.sh). Re-running the
# installer rewrites this file. Port $public_port -> the web app on 127.0.0.1:$app_port.
server {
$listen_lines
    server_name _;

$tls_lines

    server_tokens off;
    client_max_body_size 1m;
    add_header X-Content-Type-Options "nosniff" always;

    access_log /var/log/nginx/serverlab.access.log;
    error_log  /var/log/nginx/serverlab.error.log;

    proxy_http_version 1.1;
    # \$http_host keeps the port, which the app needs to accept form submissions on port $public_port.
    proxy_set_header Host              \$http_host;
    proxy_set_header X-Forwarded-Host  \$http_host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    # nginx is the edge: overwrite these so a client cannot pretend to be another address.
    proxy_set_header X-Real-IP         \$remote_addr;
    proxy_set_header X-Forwarded-For   \$remote_addr;
    proxy_set_header Connection        "";

    # Live data (Server-Sent Events): unbuffered, long-lived.
    location = /api/stream {
        proxy_pass http://127.0.0.1:$app_port;
        proxy_buffering off;
        proxy_cache off;
        gzip off;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }

    location / {
        proxy_pass http://127.0.0.1:$app_port;
    }
}
EOF
  ln -sf "$NGINX_SITE" "$NGINX_LINK"
  nginx -t 2>&1 | sed 's/^/    /' || die "nginx rejected the configuration (see above)"
  systemctl enable --quiet nginx
  systemctl reload nginx 2>/dev/null || systemctl restart nginx
}

ufw_is_active() { command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q '^Status: active'; }

ufw_rule_arguments() {
  local port=$1 source=$2
  if [[ -n $source ]]; then
    printf '%s\n' allow from "$source" to any port "$port" proto tcp
  else
    printf '%s\n' allow "$port/tcp"
  fi
}

open_firewall() {
  if ! ufw_is_active; then
    log "UFW is not active; nothing to open (manage it later on ServerLab's Firewall page)"
    return
  fi
  if [[ -n ${previous_port:-} ]] && [[ $previous_port != "$public_port" || ${previous_allow:-} != "$allow_from" ]]; then
    mapfile -t old_rule < <(ufw_rule_arguments "$previous_port" "${previous_allow:-}")
    ufw delete "${old_rule[@]}" >/dev/null 2>&1 || true
  fi
  mapfile -t rule < <(ufw_rule_arguments "$public_port" "$allow_from")
  log "UFW is active: sudo ufw ${rule[*]} comment 'ServerLab'"
  ufw "${rule[@]}" comment 'ServerLab' >/dev/null
}

allow_own_port_in_alerts() {
  local database_path=$DATA_DIR/serverlab.db attempt
  [[ -f $database_path ]] || return 0
  for attempt in $(seq 1 15); do
    if runuser -u serverlab -- sqlite3 "$database_path" "SELECT 1 FROM alert_rules WHERE seed_key = 'service-exposed';" 2>/dev/null | grep -q 1; then
      runuser -u serverlab -- sqlite3 "$database_path" "UPDATE alert_rules SET params = json_set(params, '\$.allowedPorts',
        CASE WHEN (',' || replace(json_extract(params, '\$.allowedPorts'), ' ', '') || ',') LIKE '%,$public_port,%'
             THEN json_extract(params, '\$.allowedPorts')
             ELSE json_extract(params, '\$.allowedPorts') || ',$public_port' END)
        WHERE seed_key = 'service-exposed' AND json_extract(params, '\$.allowedPorts') IS NOT NULL;" 2>/dev/null || true
      return
    fi
    sleep 1
  done
}

check_published_page() {
  local scheme status attempt
  scheme=$([[ $use_https == true ]] && echo https || echo http)
  for attempt in $(seq 1 30); do
    status=$(curl -sk -o /dev/null -w '%{http_code}' "$scheme://127.0.0.1:$public_port/login" || true)
    [[ $status =~ ^(200|30[0-9])$ ]] && break
    sleep 1
  done
  if [[ $status =~ ^(200|30[0-9])$ ]]; then
    log "ServerLab answers on $scheme://127.0.0.1:$public_port (HTTP $status)"
  else
    warn "no answer on $scheme://127.0.0.1:$public_port yet (HTTP ${status:-none}); check: journalctl -u serverlab-web -n 50 and /var/log/nginx/serverlab.error.log"
  fi
}

print_summary() {
  local scheme url token_path token=""
  scheme=$([[ $use_https == true ]] && echo https || echo http)
  url="$scheme://$public_hostname:$public_port"
  [[ $public_port == 443 && $use_https == true ]] && url="https://$public_hostname"
  [[ $public_port == 80 && $use_https == false ]] && url="http://$public_hostname"
  token_path=$DATA_DIR/setup-token
  [[ -s $token_path ]] && token=$(tr -d '[:space:]' <"$token_path")

  echo
  log "ServerLab $VERSION is installed."
  echo
  if [[ -n $token ]]; then
    echo "  Finish setup in your browser:"
    echo "    URL:          $url/setup"
    echo "    Setup token:  $token"
    echo "  (The token is in $token_path and is deleted after setup.)"
  else
    echo "  Open: $url"
  fi
  echo
  if [[ $use_https == true ]]; then
    echo "  The certificate is self-signed, so the browser warns once. Check that the fingerprint"
    echo "  matches, then continue:"
    echo "    $(openssl x509 -in "$TLS_CERTIFICATE" -noout -fingerprint -sha256 | sed 's/^.*=/SHA-256 /')"
    echo "  To use your own certificate, replace $TLS_CERTIFICATE and $TLS_KEY, then: sudo systemctl reload nginx"
  else
    echo "  Plain HTTP: anyone on the network path can read passwords. Prefer HTTPS (re-run without --http)."
  fi
  echo
  echo "  Update:     sudo bash install.sh            (from a newer unzipped installer; settings are kept)"
  echo "  Remove:     sudo bash install.sh --uninstall [--purge]"
  echo "  Password:   sudo serverlab reset-password"
  echo "  Logs:       journalctl -u serverlab-web -u serverlab-collector -f"
  echo "  Hardening:  $SOURCE_DIR/docs/HARDENING.md (SSH, firewall, fail2ban)"
  echo
}

install_standalone() {
  load_state
  public_port=${public_port:-8443}
  use_https=${use_https:-true}
  app_port=${app_port:-3000}
  public_hostname=${public_hostname:-$(primary_address)}
  public_hostname=${public_hostname:-$(hostname)}
  log "ServerLab $VERSION standalone install: $([[ $use_https == true ]] && echo https || echo http)://$public_hostname:$public_port"

  ensure_node
  ensure_packages
  check_ports

  local install_arguments=(--app-port "$app_port" --no-summary)
  [[ $skip_geoip == true ]] && install_arguments+=(--no-geoip)
  bash "$SOURCE_DIR/deploy/install.sh" "${install_arguments[@]}"

  save_state
  configure_environment
  create_certificate
  write_nginx_site
  systemctl restart serverlab-collector.service serverlab-web.service
  open_firewall
  allow_own_port_in_alerts
  check_published_page
  print_summary
}

uninstall_standalone() {
  load_state
  local install_arguments=(--uninstall)
  [[ $purge == true ]] && install_arguments=(--purge)
  [[ $assume_yes == true ]] && install_arguments+=(--yes)
  bash "$SOURCE_DIR/deploy/install.sh" "${install_arguments[@]}"
  if [[ -e $NGINX_LINK || -e $NGINX_SITE ]]; then
    log "removing the nginx site"
    rm -f "$NGINX_LINK" "$NGINX_SITE"
    if command -v nginx >/dev/null && nginx -t >/dev/null 2>&1; then systemctl reload nginx 2>/dev/null || true; fi
  fi
  if [[ -n ${previous_port:-} ]] && ufw_is_active; then
    mapfile -t rule < <(ufw_rule_arguments "$previous_port" "${previous_allow:-}")
    ufw delete "${rule[@]}" >/dev/null 2>&1 && log "removed the UFW rule for port $previous_port" || true
  fi
  if [[ $purge == true ]]; then
    rm -rf "$TLS_DIR" "$STATE_FILE"
  fi
  log "done. nginx itself and Node.js were left installed."
}

main() {
  parse_arguments "$@"
  check_system "$@"
  if [[ $action == uninstall ]]; then
    uninstall_standalone
  else
    install_standalone
  fi
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi
