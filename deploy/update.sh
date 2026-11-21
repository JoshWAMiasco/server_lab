#!/usr/bin/env bash
# Updates an installed ServerLab to the version in this source folder, with a backup and an
# automatic rollback. Works for both installs: the standalone one (nginx on its own port, see
# installer/install.sh) and the Tailscale one (deploy/install.sh). Data, settings and earlier
# installer choices are kept.
#
# Usage (as root, from the new source folder; scripts/update-server.sh does this over SSH):
#   sudo bash deploy/update.sh                  back up, update, check, roll back on failure
#   sudo bash deploy/update.sh --no-geoip       skip the geolocation database download
#   sudo bash deploy/update.sh --dry-run        show what would happen, change nothing
#   sudo bash deploy/update.sh --rollback [DIR] put back the code and database saved in DIR
#                                               (default: the newest backup); add
#                                               --keep-database to keep today's data instead
#   sudo bash deploy/update.sh --list-backups   list the saved backups
#
# Each update saves the database (a consistent SQLite copy, taken with the services stopped) and
# the previous source code in /var/lib/serverlab/backups/<time>/. The newest 5 are kept.
set -Eeuo pipefail

readonly INSTALL_DIR=/opt/serverlab
readonly DATA_DIR=/var/lib/serverlab
readonly CONFIG_DIR=/etc/serverlab
readonly ENV_FILE=$CONFIG_DIR/serverlab.env
readonly STANDALONE_STATE_FILE=$CONFIG_DIR/standalone.conf
readonly BACKUP_ROOT=$DATA_DIR/backups
readonly BACKUPS_KEPT=5
readonly SERVICE_USER=serverlab
readonly SERVICES=(serverlab-web.service serverlab-collector.service)

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SOURCE_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
readonly SCRIPT_DIR SOURCE_DIR

action=update
skip_geoip=false
rollback_directory=""
keep_database=false
work_directory=""
backup_directory=""

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}
usage() { sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; }

parse_arguments() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --no-geoip) skip_geoip=true ;;
      --dry-run) action=dry-run ;;
      --keep-database) keep_database=true ;;
      --list-backups) action=list-backups ;;
      --rollback)
        action=rollback
        if [[ -n ${2:-} && ${2:0:1} != - ]]; then
          rollback_directory=$2
          shift
        fi
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

cleanup() {
  if [[ -n $work_directory && -d $work_directory ]]; then rm -rf "$work_directory"; fi
}
trap cleanup EXIT

# --- Reading the current install ---------------------------------------------------------

read_version() {
  sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$1/package.json" 2>/dev/null | head -n 1
}

env_value() {
  [[ -r $ENV_FILE ]] || return 0
  sed -n -E "s/^[[:space:]]*$1=[\"']?([^\"']*)[\"']?[[:space:]]*$/\1/p" "$ENV_FILE" | tail -n 1
}

database_path() {
  local configured
  configured=$(env_value DATABASE_PATH)
  printf '%s' "${configured:-$DATA_DIR/serverlab.db}"
}

install_mode() {
  if [[ -r $STANDALONE_STATE_FILE ]]; then echo standalone; else echo tailscale; fi
}

web_url() {
  local port
  port=$(env_value WEB_PORT)
  printf 'http://127.0.0.1:%s' "${port:-3000}"
}

check_prerequisites() {
  [[ $EUID -eq 0 ]] || die "run as root: sudo bash $0"
  [[ -f $SOURCE_DIR/package.json && -f $SOURCE_DIR/deploy/install.sh ]] || die "$SOURCE_DIR is not a ServerLab source folder"
  [[ -f $INSTALL_DIR/package.json && -r $ENV_FILE ]] || die "ServerLab is not installed here (no $INSTALL_DIR or $ENV_FILE). Install it first with installer/install.sh or deploy/install.sh."
  command -v sqlite3 >/dev/null || die "sqlite3 is missing (sudo apt install sqlite3)"
  if [[ $(realpath "$SOURCE_DIR") == "$(realpath "$INSTALL_DIR")" && $action == update ]]; then
    die "run this from the new source folder, not from $INSTALL_DIR"
  fi
}

# --- Backup ------------------------------------------------------------------------------

stop_services() {
  local unit
  for unit in "${SERVICES[@]}"; do
    if systemctl is-active --quiet "$unit"; then
      log "stopping $unit"
      systemctl stop "$unit"
    fi
  done
}

start_services() {
  log "starting ${SERVICES[*]}"
  systemctl start "${SERVICES[@]}"
}

create_backup() {
  backup_directory=$BACKUP_ROOT/$(date -u +%Y%m%d-%H%M%S)-v$(read_version "$INSTALL_DIR")
  log "backing up to $backup_directory"
  install -d -m 700 -o "$SERVICE_USER" -g "$SERVICE_USER" "$BACKUP_ROOT"
  install -d -m 700 -o root -g root "$backup_directory"

  local database
  database=$(database_path)
  if [[ -f $database ]]; then
    if ! sqlite3 "$database" ".backup '$backup_directory/serverlab.db'"; then
      warn "could not copy the database $database"
      return 1
    fi
    if [[ $(sqlite3 -readonly "$backup_directory/serverlab.db" 'PRAGMA integrity_check;') != ok ]]; then
      warn "the database copy failed its integrity check"
      return 1
    fi
    log "database saved ($(du -h "$backup_directory/serverlab.db" | cut -f1))"
  else
    warn "no database at $database yet; only the code is backed up"
  fi

  # Offline servers cannot run npm ci on rollback, so their backups keep node_modules.
  local exclusions=(--exclude=./node_modules --exclude=./.next --exclude=./dist)
  [[ ${SERVERLAB_OFFLINE:-} == 1 ]] && exclusions=(--exclude=./.next --exclude=./dist)
  if ! tar -C "$INSTALL_DIR" "${exclusions[@]}" -czf "$backup_directory/source.tar.gz" .; then
    warn "could not save the current code from $INSTALL_DIR"
    return 1
  fi
  printf 'version=%s\nmode=%s\ncreated=%s\n' "$(read_version "$INSTALL_DIR")" "$(install_mode)" "$(date -u +%FT%TZ)" >"$backup_directory/backup.info"
  log "previous code saved ($(du -h "$backup_directory/source.tar.gz" | cut -f1))"
}

prune_backups() {
  local old_backups
  mapfile -t old_backups < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r | tail -n "+$((BACKUPS_KEPT + 1))")
  local name
  for name in "${old_backups[@]}"; do
    log "removing old backup $name"
    rm -rf "${BACKUP_ROOT:?}/$name"
  done
}

restore_database() {
  local saved_database=$1/serverlab.db database
  database=$(database_path)
  [[ -f $saved_database ]] || return 0
  log "restoring the database from $1"
  rm -f "$database-wal" "$database-shm" || return 1
  install -m 600 -o "$SERVICE_USER" -g "$SERVICE_USER" "$saved_database" "$database"
}

# --- Running the installer ---------------------------------------------------------------

# Runs the installer that matches how this server was installed, from the source in $1.
run_installer() {
  local source=$1 mode
  mode=$(install_mode)
  local arguments=()
  [[ $skip_geoip == true ]] && arguments+=(--no-geoip)
  if [[ $mode == standalone ]]; then
    if [[ ! -f $source/installer/install.sh ]]; then
      warn "$source has no installer/install.sh"
      return 1
    fi
    local bundle=$work_directory/bundle-$RANDOM
    mkdir -p "$bundle" && cp "$source/installer/install.sh" "$bundle/install.sh" && ln -s "$source" "$bundle/serverlab" || return 1
    log "running the standalone installer (keeps its saved port, HTTPS and hostname choices)"
    bash "$bundle/install.sh" --yes "${arguments[@]}"
  else
    log "running deploy/install.sh"
    bash "$source/deploy/install.sh" "${arguments[@]}"
  fi
}

# Services up, web answering, collector writing. Prints the problems; returns 1 if any.
verify_install() {
  local problems=() unit status
  log "checking the updated install"
  sleep 5
  for unit in "${SERVICES[@]}"; do
    systemctl is-active --quiet "$unit" || problems+=("$unit is not running (journalctl -u $unit -n 50)")
  done
  for _ in {1..30}; do
    status=$(curl --disable -s -o /dev/null -w '%{http_code}' "$(web_url)/login" || true)
    [[ $status == 200 ]] && break
    sleep 2
  done
  [[ $status == 200 ]] || problems+=("the web UI at $(web_url)/login answered '${status:-nothing}' instead of 200")
  local database heartbeat_age
  database=$(database_path)
  for _ in {1..15}; do
    heartbeat_age=$(sqlite3 -readonly "$database" "SELECT (strftime('%s','now') * 1000 - ts) / 1000 FROM collector_heartbeat WHERE id = 1;" 2>/dev/null || true)
    [[ -n $heartbeat_age && $heartbeat_age -lt 30 ]] && break
    sleep 2
  done
  [[ -n $heartbeat_age && $heartbeat_age -lt 30 ]] || problems+=("the collector has not written a heartbeat (journalctl -u serverlab-collector -n 50)")
  if ((${#problems[@]} > 0)); then
    printf '  - %s\n' "${problems[@]}" >&2
    return 1
  fi
}

report_new_features() {
  local database
  database=$(database_path)
  if [[ -s $DATA_DIR/hardware/dmidecode.txt ]]; then
    log "hardware inventory: $(grep -c '^Memory Device$' "$DATA_DIR/hardware/dmidecode.txt" || true) memory slots found by dmidecode"
  else
    warn "no hardware inventory yet (systemctl status serverlab-hardware-inventory); the Machine page shows less detail until it runs"
  fi
  local boots
  boots=$(sqlite3 -readonly "$database" "SELECT count(*) FROM boot_sessions;" 2>/dev/null || true)
  [[ -n $boots ]] && log "uptime history: $boots boot(s) recorded; reboots from now on keep the uptime streak"
}

# --- Actions -----------------------------------------------------------------------------

rollback_from() {
  local directory=$1
  [[ -f $directory/source.tar.gz ]] || die "$directory has no source.tar.gz"
  log "rolling back to $(sed -n 's/^version=//p' "$directory/backup.info" 2>/dev/null) from $directory"
  local previous_source=$work_directory/previous-source
  rm -rf "$previous_source"
  mkdir -p "$previous_source"
  # Called inside `if`, where `set -e` is off: every step checks its own result.
  if ! tar -C "$previous_source" -xzf "$directory/source.tar.gz" || [[ ! -f $previous_source/deploy/install.sh ]]; then
    warn "could not unpack the saved code from $directory/source.tar.gz"
    return 1
  fi
  stop_services || return 1
  if [[ $keep_database == true ]]; then
    log "keeping the current database (the older version ignores tables it does not know)"
  else
    restore_database "$directory" || return 1
  fi
  run_installer "$previous_source"
}

newest_backup() {
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -r | head -n 1
}

update() {
  local old_version new_version
  old_version=$(read_version "$INSTALL_DIR")
  new_version=$(read_version "$SOURCE_DIR")
  log "updating ServerLab $old_version -> $new_version ($(install_mode) install)"

  stop_services
  if ! create_backup; then
    start_services
    die "backup failed; ServerLab was not changed and is running again"
  fi

  if run_installer "$SOURCE_DIR" && verify_install; then
    prune_backups
    report_new_features
    echo
    log "ServerLab is now $(read_version "$INSTALL_DIR")"
    echo "    Backup of $old_version: $backup_directory"
    echo "    Roll back with:  sudo bash $INSTALL_DIR/deploy/update.sh --rollback $backup_directory"
    return 0
  fi

  warn "the update failed; rolling back to $old_version"
  if rollback_from "$backup_directory" && verify_install; then
    die "update to $new_version failed and ServerLab $old_version was restored. See the output above for the cause."
  fi
  die "update failed and the automatic rollback also failed. Your database and code are saved in $backup_directory (serverlab.db, source.tar.gz)."
}

dry_run() {
  log "dry run: nothing will be changed"
  echo "    installed version: $(read_version "$INSTALL_DIR")"
  echo "    new version:       $(read_version "$SOURCE_DIR") (from $SOURCE_DIR)"
  echo "    install type:      $(install_mode)"
  echo "    database:          $(database_path)"
  echo "    backup goes to:    $BACKUP_ROOT/<time>-v$(read_version "$INSTALL_DIR")/"
  echo "    web UI checked at: $(web_url)/login"
  echo "    steps: stop services, back up database and code, run the installer, check, roll back on failure"
}

list_backups() {
  local directory
  [[ -d $BACKUP_ROOT ]] || {
    echo "no backups yet"
    return
  }
  for directory in $(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | sort -r); do
    printf '%s  %s\n' "$directory" "$(du -sh "$directory" | cut -f1)"
  done
}

main() {
  parse_arguments "$@"
  check_prerequisites
  work_directory=$(mktemp -d)
  case $action in
    update) update ;;
    dry-run) dry_run ;;
    list-backups) list_backups ;;
    rollback)
      rollback_directory=${rollback_directory:-$(newest_backup)}
      [[ -n $rollback_directory && -d $rollback_directory ]] || die "no backup to roll back to (see --list-backups)"
      if [[ $keep_database == false ]]; then
        warn "the database goes back to $(sed -n 's/^created=//p' "$rollback_directory/backup.info" 2>/dev/null): logins, alerts and metrics recorded since then are dropped (add --keep-database to keep them)"
        if [[ -t 0 ]]; then
          read -r -p "Roll back? [y/N] " answer
          [[ $answer == [yY]* ]] || die "rollback cancelled"
        fi
      fi
      rollback_from "$rollback_directory"
      verify_install || die "the rolled-back install did not come up cleanly (see above)"
      log "ServerLab is now $(read_version "$INSTALL_DIR")"
      ;;
  esac
}

main "$@"
