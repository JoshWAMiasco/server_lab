#!/usr/bin/env bash
# ServerLab offline installer for Ubuntu 24.04 (x86_64). Everything comes from this folder, so the
# server needs no internet: Node.js, ServerLab with all its npm modules, the Ubuntu packages it
# uses (sqlite3, dmidecode, nginx, Tailscale, polkit…) and the GeoIP database.
#
# Usage (from the folder on the USB drive):
#   sudo bash install.sh                 install, or update an existing ServerLab with a backup
#   sudo bash install.sh --app-port N    run the web UI on 127.0.0.1:N (default 3000)
#   sudo bash install.sh --verify        only check the bundle's files, change nothing
#
# After installing, ServerLab listens on 127.0.0.1 and is reached over Tailscale, as described
# in serverlab/docs/HARDENING.md (Tailscale needs the network once to join your tailnet).
set -Eeuo pipefail

readonly SUPPORTED_RELEASE=24.04
readonly SUPPORTED_ARCHITECTURE=x86_64
readonly NODE_HOME=/usr/local/lib/serverlab-node
readonly INSTALL_DIR=/opt/serverlab
readonly MINIMUM_FREE_MEGABYTES=4096
readonly PACKAGES=(ca-certificates curl gzip openssl rsync sqlite3 python3 dmidecode xz-utils pciutils util-linux polkitd nginx tailscale)

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
readonly SCRIPT_DIR
readonly PAYLOAD_DIR=$SCRIPT_DIR/payload

app_port=""
verify_only=false
work_directory=""

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}
usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; }

cleanup() {
  if [[ -n $work_directory && -d $work_directory ]]; then rm -rf "$work_directory"; fi
}
trap cleanup EXIT

parse_arguments() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --app-port)
        [[ ${2:-} =~ ^[0-9]+$ ]] && ((10#$2 >= 1 && 10#$2 <= 65535)) || die "--app-port needs a number from 1 to 65535"
        app_port=$2
        shift
        ;;
      --verify) verify_only=true ;;
      -h | --help)
        usage
        exit 0
        ;;
      *) die "unknown option: $1 (see --help)" ;;
    esac
    shift
  done
}

# --- Checks --------------------------------------------------------------------------------

check_system() {
  [[ $EUID -eq 0 ]] || die "run as root: sudo bash $0"
  [[ -d $PAYLOAD_DIR ]] || die "no payload folder next to this script; copy the whole serverlab-offline folder to the USB drive"
  local os_id os_version
  # shellcheck source=/dev/null
  os_id=$(. /etc/os-release && printf '%s' "${ID:-}")
  # shellcheck source=/dev/null
  os_version=$(. /etc/os-release && printf '%s' "${VERSION_ID:-}")
  [[ $os_id == ubuntu ]] || die "this bundle is for Ubuntu $SUPPORTED_RELEASE (found ${os_id:-unknown})"
  [[ $os_version == "$SUPPORTED_RELEASE" ]] || die "this bundle's packages are for Ubuntu $SUPPORTED_RELEASE; this server runs $os_version. Build a bundle for it, or use installer/install.sh with internet."
  [[ $(uname -m) == "$SUPPORTED_ARCHITECTURE" ]] || die "this bundle is for $SUPPORTED_ARCHITECTURE; this server is $(uname -m)"
  command -v systemctl >/dev/null || die "systemd is required"
  local free_megabytes
  free_megabytes=$(df -Pm /var/tmp | awk 'NR == 2 {print $4}')
  ((free_megabytes >= MINIMUM_FREE_MEGABYTES)) || die "need ${MINIMUM_FREE_MEGABYTES} MB free in /var/tmp for unpacking (have ${free_megabytes} MB)"
  free_megabytes=$(df -Pm /opt | awk 'NR == 2 {print $4}')
  ((free_megabytes >= MINIMUM_FREE_MEGABYTES)) || die "need ${MINIMUM_FREE_MEGABYTES} MB free in /opt (have ${free_megabytes} MB)"
}

verify_bundle() {
  log "checking the bundle's files (this reads the whole USB drive once)"
  (cd "$SCRIPT_DIR" && sha256sum --quiet --check SHA256SUMS) || die "some files on the USB drive are damaged or missing (see above); copy the bundle again"
  log "all files are intact"
}

# --- Ubuntu packages from the bundled local repository -------------------------------------

install_packages() {
  local missing=() package
  for package in "${PACKAGES[@]}"; do
    dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed' || missing+=("$package")
  done
  if ((${#missing[@]} == 0)); then
    log "Ubuntu packages already installed"
    return
  fi
  local had_nginx=false
  dpkg-query -W -f='${Status}' nginx 2>/dev/null | grep -q 'install ok installed' && had_nginx=true

  log "installing from the bundle: ${missing[*]}"
  local repository=$work_directory/debs
  cp -r "$PAYLOAD_DIR/debs" "$repository"
  chmod -R a+rX "$work_directory"
  printf 'deb [trusted=yes] file:%s ./\n' "$repository" >"$work_directory/sources.list"
  local apt_options=(
    -o "Dir::Etc::SourceList=$work_directory/sources.list"
    -o "Dir::Etc::SourceParts=/nonexistent"
    -o "Dir::State::Lists=$work_directory/apt-lists"
    -o "APT::Get::List-Cleanup=0"
    -o "Acquire::Languages=none"
  )
  mkdir -p "$work_directory/apt-lists/partial"
  apt-get "${apt_options[@]}" -q update
  DEBIAN_FRONTEND=noninteractive apt-get "${apt_options[@]}" install -y -q --no-install-recommends "${missing[@]}"

  if [[ $had_nginx == false ]] && systemctl is-active --quiet nginx; then
    log "nginx was just installed: stopping it until you set it up as the tailnet gateway (HARDENING.md section 3)"
    systemctl disable --now --quiet nginx
  fi
}

# --- Node.js ---------------------------------------------------------------------------------

install_node() {
  local archive
  archive=$(find "$PAYLOAD_DIR" -maxdepth 1 -name 'node-v*-linux-x64.tar.xz' | head -n 1)
  [[ -n $archive ]] || die "no Node.js archive in the bundle"
  local version
  version=$(basename "$archive" | sed -E 's/^node-(v[0-9.]+)-.*/\1/')
  if [[ -x $NODE_HOME/bin/node && $("$NODE_HOME/bin/node" --version) == "$version" ]]; then
    log "Node.js $version already installed in $NODE_HOME"
  else
    log "installing Node.js $version in $NODE_HOME"
    local unpacked=$work_directory/node
    mkdir -p "$unpacked"
    tar -xJf "$archive" -C "$unpacked" --strip-components=1
    rm -rf "$NODE_HOME"
    mv "$unpacked" "$NODE_HOME"
    chown -R root:root "$NODE_HOME"
  fi
  local program
  for program in node npm npx; do
    local link=/usr/local/bin/$program
    if [[ -e $link && ! -L $link ]]; then
      warn "moving the existing $link to $link.before-serverlab"
      mv "$link" "$link.before-serverlab"
    fi
    ln -sfn "$NODE_HOME/bin/$program" "$link"
  done
  # The bundled npm modules were built for this exact Node.js; check the native ones load.
  hash -r
  log "Node.js $(/usr/local/bin/node --version) at /usr/local/bin/node"
}

# --- ServerLab -------------------------------------------------------------------------------

unpack_serverlab() {
  log "unpacking ServerLab (about 1 GB with its npm modules)"
  mkdir -p "$work_directory/serverlab"
  tar -xzf "$PAYLOAD_DIR/serverlab-app.tar.gz" -C "$work_directory/serverlab"
  [[ -f $work_directory/serverlab/deploy/install.sh ]] || die "the ServerLab archive is incomplete"
  (cd "$work_directory/serverlab" && /usr/local/bin/node -e 'require("better-sqlite3")(":memory:").close()') || die "the bundled database module does not load with this Node.js; rebuild the bundle"
}

install_serverlab() {
  export SERVERLAB_OFFLINE=1
  local geoip_file
  geoip_file=$(find "$PAYLOAD_DIR/geoip" -maxdepth 1 -name '*.mmdb' 2>/dev/null | head -n 1 || true)
  [[ -n $geoip_file ]] && export SERVERLAB_GEOIP_FILE=$geoip_file
  local arguments=()
  [[ -n $app_port ]] && arguments+=(--app-port "$app_port")
  if [[ -f $INSTALL_DIR/package.json && -f $work_directory/serverlab/deploy/update.sh ]]; then
    log "ServerLab $(sed -n 's/.*"version": *"\(.*\)".*/\1/p' "$INSTALL_DIR/package.json") is installed: updating with a backup"
    [[ -z $app_port ]] || warn "--app-port is ignored on an update; the port in /etc/serverlab/serverlab.env (WEB_PORT) is kept"
    bash "$work_directory/serverlab/deploy/update.sh"
  else
    bash "$work_directory/serverlab/deploy/install.sh" "${arguments[@]}"
  fi
}

print_next_steps() {
  echo
  log "ServerLab $(sed -n 's/.*"version": *"\(.*\)".*/\1/p' "$INSTALL_DIR/package.json") is installed"
  echo "  Next, once the server can reach the internet (docs: $INSTALL_DIR/docs/HARDENING.md):"
  echo "    sudo tailscale up                 join your tailnet (section 2)"
  echo "    nginx as the tailnet gateway       section 3 (nginx is installed and stopped)"
  echo "  Until then, from another computer on the same network:"
  echo "    ssh -L ${app_port:-3000}:127.0.0.1:${app_port:-3000} <you>@<this-server>   then open http://localhost:${app_port:-3000}/setup"
}

main() {
  parse_arguments "$@"
  check_system
  verify_bundle
  [[ $verify_only == true ]] && exit 0
  work_directory=$(mktemp -d /var/tmp/serverlab-offline.XXXXXX)
  chmod 755 "$work_directory"
  install_packages
  install_node
  unpack_serverlab
  install_serverlab
  print_next_steps
}

main "$@"
