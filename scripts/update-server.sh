#!/usr/bin/env bash
# Updates the ServerLab on a server to the code in this working copy, over SSH.
#
# It checks the code here (lint, types, tests, build), packs the working copy (uncommitted and
# new files included; git-ignored files such as node_modules, .env* and data/ are left out),
# copies it to the server and runs deploy/update.sh there. That script backs up the database and
# the current code, runs the installer that matches how the server was installed (standalone or
# Tailscale), checks that ServerLab came back, and rolls back on its own if it did not.
#
# Usage:
#   scripts/update-server.sh user@server                 check, pack, upload, update
#   scripts/update-server.sh user@server --dry-run       upload and show what would happen
#   scripts/update-server.sh user@server --rollback      put back the version before the last update
#                                                        (add --keep-database to keep today's data)
#   scripts/update-server.sh user@server --list-backups  list the backups on the server
#
# Options:
#   --port N          SSH port (default 22)
#   --identity FILE   SSH private key
#   --skip-checks     do not run lint, type-check, tests and build here first
#   --no-geoip        skip the geolocation database download on the server
#
# The SSH user needs sudo on the server; you are asked for its password when needed.
set -Eeuo pipefail

repository_root=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
readonly repository_root

target=""
ssh_options=(-o ServerAliveInterval=30)
scp_options=(-q -o ServerAliveInterval=30)
local_archive=""
skip_checks=false
remote_arguments=()
remote_action=update

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}
usage() { sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; }

parse_arguments() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --port)
        [[ ${2:-} =~ ^[0-9]+$ ]] || die "--port needs a number"
        ssh_options+=(-p "$2")
        scp_options+=(-P "$2")
        shift
        ;;
      --identity)
        [[ -r ${2:-} ]] || die "--identity needs a readable key file"
        ssh_options+=(-i "$2")
        scp_options+=(-i "$2")
        shift
        ;;
      --skip-checks) skip_checks=true ;;
      --no-geoip) remote_arguments+=(--no-geoip) ;;
      --dry-run)
        remote_action=dry-run
        remote_arguments+=(--dry-run)
        ;;
      --rollback) remote_action=rollback ;;
      --keep-database) remote_arguments+=(--keep-database) ;;
      --list-backups) remote_action=list-backups ;;
      -h | --help)
        usage
        exit 0
        ;;
      -*) die "unknown option: $1 (see --help)" ;;
      *)
        [[ -z $target ]] || die "only one server, please ($target and $1 given)"
        target=$1
        ;;
    esac
    shift
  done
  [[ -n $target ]] || die "which server? e.g. scripts/update-server.sh joshua@homelab (see --help)"
}

remote() {
  ssh "${ssh_options[@]}" "$target" "$@"
}

remote_with_terminal() {
  ssh -t "${ssh_options[@]}" "$target" "$@"
}

run_checks() {
  if [[ $skip_checks == true ]]; then
    warn "skipping the local checks (--skip-checks)"
    return
  fi
  log "checking the code here before touching the server (use --skip-checks to skip)"
  cd "$repository_root"
  npm run --silent lint
  npm run --silent type-check
  npm test --silent
  NEXT_TELEMETRY_DISABLED=1 npm run --silent build >/dev/null
  log "lint, types, tests and build passed"
}

# Writes a gzip tarball of the working copy to $1: tracked files as they are on disk (uncommitted
# edits included, deletions respected) plus new files that .gitignore does not exclude. It stages
# everything into a temporary index, so the real git index is never touched.
pack_working_copy() {
  local archive=$1 temporary_index tree changed_count
  cd "$repository_root"
  changed_count=$(git status --porcelain | wc -l)
  ((changed_count > 0)) && warn "including $changed_count uncommitted change(s) from this working copy"
  temporary_index=$(mktemp)
  cp "$(git rev-parse --git-path index)" "$temporary_index"
  GIT_INDEX_FILE=$temporary_index git add --all
  tree=$(GIT_INDEX_FILE=$temporary_index git write-tree)
  rm -f "$temporary_index"
  git archive --format=tar.gz -o "$archive" "$tree"
  log "packed $(node -p 'require("./package.json").version') from $(git rev-parse --short HEAD)$( ((changed_count > 0)) && echo ' + local changes') ($(du -h "$archive" | cut -f1))"
}

main() {
  parse_arguments "$@"
  for program in git ssh scp tar node npm; do
    command -v "$program" >/dev/null || die "$program is not installed here"
  done

  log "connecting to $target"
  remote true || die "cannot reach $target over SSH"

  if [[ $remote_action == rollback || $remote_action == list-backups ]]; then
    remote_with_terminal "sudo bash /opt/serverlab/deploy/update.sh --$remote_action ${remote_arguments[*]:-}"
    return
  fi

  [[ $remote_action == update ]] && run_checks

  local remote_directory
  local_archive=$(mktemp --suffix=.tar.gz)
  trap 'rm -f "$local_archive"' EXIT
  pack_working_copy "$local_archive"

  remote_directory=$(remote 'mktemp -d /tmp/serverlab-update.XXXXXX')
  [[ $remote_directory == /tmp/serverlab-update.* ]] || die "could not create a folder on the server"
  log "uploading to $target:$remote_directory"
  scp "${scp_options[@]}" "$local_archive" "$target:$remote_directory/serverlab.tar.gz"
  remote "mkdir '$remote_directory/serverlab' && tar -xzf '$remote_directory/serverlab.tar.gz' -C '$remote_directory/serverlab' && chmod 755 '$remote_directory'"

  log "running deploy/update.sh on $target (sudo may ask for your password)"
  local status=0
  remote_with_terminal "sudo bash '$remote_directory/serverlab/deploy/update.sh' ${remote_arguments[*]:-}" || status=$?
  remote "sudo -n rm -rf '$remote_directory' 2>/dev/null || rm -rf '$remote_directory'" || warn "could not remove $remote_directory on the server"
  ((status == 0)) || die "the update on $target failed (exit $status); see the output above"
  [[ $remote_action == update ]] && log "done: $target runs the new ServerLab"
  return 0
}

main "$@"
