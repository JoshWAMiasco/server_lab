#!/usr/bin/env bash
# One command to update your ServerLab server from this folder.
#
# The first run asks for your server (user@host, SSH port, optional key) and saves it in
# .serverlab-server.conf (git-ignored). After that:
#
#   ./update-serverlab.sh             menu
#   ./update-serverlab.sh update      check the code here, then update the server
#   ./update-serverlab.sh quick       update without the local checks (faster)
#   ./update-serverlab.sh preview     show what an update would do, change nothing
#   ./update-serverlab.sh rollback    undo the last update (keeps the data recorded since)
#   ./update-serverlab.sh backups     list the backups on the server
#   ./update-serverlab.sh status      ServerLab version and services on the server
#   ./update-serverlab.sh logs        follow the server's ServerLab logs (Ctrl+C to stop)
#   ./update-serverlab.sh setup       change the saved server
#
# It uses scripts/update-server.sh (upload, backup, update, automatic rollback) underneath.
set -Eeuo pipefail

project_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
readonly project_directory
readonly config_file=$project_directory/.serverlab-server.conf
readonly updater=$project_directory/scripts/update-server.sh

SERVER=""
SSH_PORT=22
SSH_KEY=""

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}
usage() { sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; }

ask() {
  local question=$1 default=${2:-} answer
  if [[ -n $default ]]; then read -r -p "$question [$default]: " answer; else read -r -p "$question: " answer; fi
  printf '%s' "${answer:-$default}"
}

setup() {
  bold "Which server should this folder update?"
  local server port key
  server=$(ask "  SSH login (user@host or an alias from ~/.ssh/config)" "$SERVER")
  [[ $server =~ ^[A-Za-z0-9._@:-]+$ ]] || die "that does not look like user@host"
  port=$(ask "  SSH port" "$SSH_PORT")
  [[ $port =~ ^[0-9]+$ ]] || die "the port must be a number"
  key=$(ask "  SSH key file (Enter for your default key)" "$SSH_KEY")
  key=${key/#\~/$HOME}
  [[ -z $key || -r $key ]] || die "cannot read the key file $key"
  printf 'SERVER=%q\nSSH_PORT=%q\nSSH_KEY=%q\n' "$server" "$port" "$key" >"$config_file"
  chmod 600 "$config_file"
  SERVER=$server SSH_PORT=$port SSH_KEY=$key
  log "saved to $(basename "$config_file")"
  log "testing the connection to $SERVER"
  local options
  mapfile -t options < <(connection_options)
  if ssh "${options[@]}" -o ConnectTimeout=10 "$SERVER" true; then
    log "connected"
  else
    die "could not connect; run ./update-serverlab.sh setup to fix the details"
  fi
}

connection_options() {
  printf '%s\n' -p "$SSH_PORT"
  [[ -n $SSH_KEY ]] && printf '%s\n' -i "$SSH_KEY"
  return 0
}

load_config() {
  if [[ -r $config_file ]]; then
    # shellcheck source=/dev/null
    . "$config_file"
  fi
  if [[ -z $SERVER ]]; then
    setup
  fi
}

updater_options() {
  local options=(--port "$SSH_PORT")
  [[ -n $SSH_KEY ]] && options+=(--identity "$SSH_KEY")
  printf '%s\n' "${options[@]}"
}

run_updater() {
  local options
  mapfile -t options < <(updater_options)
  bash "$updater" "${options[@]}" "$SERVER" "$@"
}

remote_shell() {
  local options
  mapfile -t options < <(connection_options)
  ssh -t "${options[@]}" "$SERVER" "$@"
}

show_status() {
  remote_shell 'printf "ServerLab %s\n" "$(sed -n "s/.*\"version\": *\"\(.*\)\".*/\1/p" /opt/serverlab/package.json 2>/dev/null || echo "not installed")"; for unit in serverlab-web serverlab-collector serverlab-hardware-inventory; do printf "  %-32s %s\n" "$unit" "$(systemctl is-active $unit 2>/dev/null)"; done'
}

confirm() {
  local answer
  read -r -p "$1 [y/N] " answer
  [[ $answer == [yY]* ]]
}

run_action() {
  case "$1" in
    update)
      log "updating $SERVER to $(node -p 'require("./package.json").version' 2>/dev/null || echo 'this version')"
      run_updater
      ;;
    quick) run_updater --skip-checks ;;
    preview) run_updater --dry-run ;;
    rollback)
      confirm "Undo the last update on $SERVER? (data recorded since is kept)" || exit 0
      run_updater --rollback --keep-database
      ;;
    backups) run_updater --list-backups ;;
    status) show_status ;;
    logs) remote_shell 'sudo journalctl -f -n 50 -u serverlab-web -u serverlab-collector' ;;
    setup) setup ;;
    -h | --help | help) usage ;;
    *) die "unknown command '$1' (try: ./update-serverlab.sh help)" ;;
  esac
}

menu() {
  bold "ServerLab updater · $SERVER"
  local choices=("Update (check the code here first)" "Quick update (skip the checks)" "Preview an update" "Undo the last update" "List backups" "Server status" "Follow server logs" "Change server" "Quit")
  local actions=(update quick preview rollback backups status logs setup quit)
  local index
  for index in "${!choices[@]}"; do printf '  %d) %s\n' "$((index + 1))" "${choices[$index]}"; done
  local picked
  read -r -p "Choose 1-${#choices[@]}: " picked
  [[ $picked =~ ^[0-9]+$ ]] && ((picked >= 1 && picked <= ${#choices[@]})) || die "pick a number from 1 to ${#choices[@]}"
  local action=${actions[$((picked - 1))]}
  [[ $action == quit ]] && exit 0
  run_action "$action"
}

main() {
  cd "$project_directory"
  [[ -x $updater || -f $updater ]] || die "missing $updater"
  if [[ ${1:-} == -h || ${1:-} == --help || ${1:-} == help ]]; then
    usage
    exit 0
  fi
  load_config
  if [[ $# -eq 0 ]]; then menu; else run_action "$1"; fi
}

main "$@"
