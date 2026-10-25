#!/usr/bin/env bash
# Downloads the DB-IP "IP to City Lite" database (CC BY 4.0, https://db-ip.com) for ServerLab.
#
# Usage: geoip-update.sh [--force] [destination.mmdb]
#   destination defaults to $GEOIP_DB_PATH, then /var/lib/serverlab/dbip-city-lite.mmdb.
#
# Run as the serverlab user, by deploy/install.sh and by serverlab-geoip-update.service.
# DB-IP publishes a new file at the start of each month. This month's file is tried first, then
# last month's. DB-IP publishes no checksum for the Lite files, so the download is checked
# instead: HTTPS only, `gzip -t` integrity, and the MaxMind DB metadata marker in the result.
# The old database is only replaced when every check passes.
set -euo pipefail

readonly DEFAULT_DESTINATION=/var/lib/serverlab/dbip-city-lite.mmdb
readonly BASE_URL=https://download.db-ip.com/free
readonly MINIMUM_BYTES=1048576

force=false
destination=""
for argument in "$@"; do
  case "$argument" in
    --force) force=true ;;
    -h | --help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "geoip-update: unknown option $argument" >&2
      exit 2
      ;;
    *) destination=$argument ;;
  esac
done
destination=${destination:-${GEOIP_DB_PATH:-$DEFAULT_DESTINATION}}
destination_directory=$(dirname "$destination")
version_file="$destination_directory/.geoip-version"

log() { printf 'geoip-update: %s\n' "$*"; }

current_month=$(date -u +%Y-%m)
previous_month=$(date -u -d "$(date -u +%Y-%m-01) -1 month" +%Y-%m)

if [[ $force == false && -s $destination && -f $version_file ]] &&
  [[ $(cat "$version_file") == "$current_month" ]]; then
  log "already up to date ($current_month): $destination"
  exit 0
fi

umask 077
work_directory=$(mktemp -d "$destination_directory/.geoip-download.XXXXXX")
trap 'rm -rf "$work_directory"' EXIT

downloaded_month=""
for month in "$current_month" "$previous_month"; do
  url="$BASE_URL/dbip-city-lite-$month.mmdb.gz"
  log "downloading $url"
  if curl --disable --fail --silent --show-error --location \
    --proto '=https' --tlsv1.2 --retry 3 --retry-delay 5 \
    --connect-timeout 20 --max-time 900 \
    --output "$work_directory/database.mmdb.gz" "$url"; then
    downloaded_month=$month
    break
  fi
  log "not available: $url"
done

if [[ -z $downloaded_month ]]; then
  log "ERROR: no DB-IP City Lite file for $current_month or $previous_month" >&2
  exit 1
fi

if ! gzip -t "$work_directory/database.mmdb.gz"; then
  log "ERROR: the download is not a valid gzip file" >&2
  exit 1
fi
gzip -dc "$work_directory/database.mmdb.gz" >"$work_directory/database.mmdb"

size=$(stat -c %s "$work_directory/database.mmdb")
if ((size < MINIMUM_BYTES)); then
  log "ERROR: the database is too small ($size bytes)" >&2
  exit 1
fi

# Every MaxMind DB file ends with a metadata section that starts with "\xab\xcd\xefMaxMind.com".
marker_count=$(LC_ALL=C grep -c -a -F $'\xab\xcd\xefMaxMind.com' "$work_directory/database.mmdb" || true)
if [[ ${marker_count:-0} -lt 1 ]]; then
  log "ERROR: the file has no MaxMind DB metadata marker" >&2
  exit 1
fi

chmod 600 "$work_directory/database.mmdb"
mv -f "$work_directory/database.mmdb" "$destination"
printf '%s\n' "$downloaded_month" >"$version_file"
log "installed DB-IP City Lite $downloaded_month at $destination ($size bytes)"
