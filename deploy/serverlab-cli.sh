#!/usr/bin/env bash
# ServerLab admin command. install.sh installs it as /usr/local/sbin/serverlab.
# It runs the project's CLI as the serverlab user, with /etc/serverlab/serverlab.env loaded,
# so files it creates in /var/lib/serverlab keep the right owner.
#
# Usage:
#   sudo serverlab reset-password    reset the admin password (prompts for the new one)
#   sudo serverlab migrate           apply database migrations (npm run db:migrate)
#   sudo serverlab <arguments>       any other `npm run serverlab -- <arguments>` command
set -euo pipefail

readonly INSTALL_DIR=${SERVERLAB_INSTALL_DIR:-/opt/serverlab}
readonly ENV_FILE=${SERVERLAB_ENV_FILE:-/etc/serverlab/serverlab.env}
readonly SERVICE_USER=serverlab

if [[ $# -eq 0 || ${1:-} == -h || ${1:-} == --help ]]; then
  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi
if [[ $EUID -ne 0 ]]; then
  echo "serverlab: run with sudo" >&2
  exit 1
fi
for required in "$INSTALL_DIR/package.json" "$ENV_FILE"; do
  if [[ ! -r $required ]]; then
    echo "serverlab: missing $required (run deploy/install.sh first)" >&2
    exit 1
  fi
done

if [[ $1 == migrate ]]; then
  shift
  set -- run --silent db:migrate -- "$@"
else
  set -- run --silent serverlab -- "$@"
fi

# npm wants a writable HOME for its cache and logs; the serverlab user has none.
scratch_home=$(mktemp -d)
chown "$SERVICE_USER:$SERVICE_USER" "$scratch_home"
trap 'rm -rf "$scratch_home"' EXIT

# shellcheck disable=SC2016 # $1/$2 expand inside the child bash, not here.
runuser -u "$SERVICE_USER" -- env -i \
  PATH=/usr/local/bin:/usr/bin:/bin \
  HOME="$scratch_home" \
  LANG=C.UTF-8 \
  TERM="${TERM:-dumb}" \
  NODE_ENV=production \
  npm_config_update_notifier=false \
  npm_config_fund=false \
  bash -c 'set -a; . "$1"; set +a; cd "$2"; shift 2; npm "$@"' \
  serverlab-cli "$ENV_FILE" "$INSTALL_DIR" "$@"
