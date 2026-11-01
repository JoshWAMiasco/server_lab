#!/usr/bin/env bash
# Builds the standalone installer zip from the committed code (HEAD):
#
#   serverlab-installer-<version>.zip
#   └── serverlab-installer-<version>/
#       ├── install.sh     the one script to run: sudo bash install.sh [--port N] [--http] …
#       └── serverlab/     the ServerLab source it installs
#
# Usage: scripts/build-installer.sh [output-directory]   (default: dist/)
# Uncommitted changes are not included; commit first.
set -Eeuo pipefail

repository_root=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
cd "$repository_root"
version=$(node -p 'require("./package.json").version')
output_directory=$(realpath -m "${1:-dist}")
bundle_name="serverlab-installer-$version"
zip_path="$output_directory/$bundle_name.zip"

command -v zip >/dev/null || { echo "zip is not installed (sudo apt install zip)" >&2; exit 1; }
if [[ -n $(git status --porcelain --untracked-files=no) ]]; then
  echo "warning: uncommitted changes are not included (the zip is built from HEAD $(git rev-parse --short HEAD))" >&2
fi

staging_directory=$(mktemp -d)
trap 'rm -rf "$staging_directory"' EXIT
mkdir -p "$staging_directory/$bundle_name/serverlab"
git archive --format=tar HEAD | tar -x -C "$staging_directory/$bundle_name/serverlab"
cp "$staging_directory/$bundle_name/serverlab/installer/install.sh" "$staging_directory/$bundle_name/install.sh"
chmod 755 "$staging_directory/$bundle_name/install.sh" "$staging_directory/$bundle_name/serverlab/deploy/"*.sh

mkdir -p "$output_directory"
rm -f "$zip_path"
(cd "$staging_directory" && zip -q -r -X "$zip_path" "$bundle_name")
echo "built $zip_path ($(du -h "$zip_path" | cut -f1), from $(git rev-parse --short HEAD))"
