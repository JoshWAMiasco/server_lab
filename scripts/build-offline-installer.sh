#!/usr/bin/env bash
# Builds the offline installer for a USB drive: ServerLab for Ubuntu 24.04 (x86_64) servers with
# no internet. Run it on an x86_64 Linux machine that has internet (zeus works).
#
#   serverlab-offline-<version>-ubuntu24.04-amd64/
#   ├── install.sh            sudo bash install.sh   (from installer/offline-install.sh)
#   ├── README.txt
#   ├── SHA256SUMS            checked by install.sh before it changes anything
#   └── payload/
#       ├── serverlab-app.tar.gz          the source of this working copy + all npm modules
#       ├── node-v22.x-linux-x64.tar.xz   Node.js, the exact version the modules were built for
#       ├── debs/                         Ubuntu 24.04 packages and their dependencies + index
#       └── geoip/dbip-city-lite.mmdb     DB-IP City Lite (CC BY 4.0), for login locations
#
# Usage: scripts/build-offline-installer.sh [output-directory]   (default: dist/offline)
#   --no-geoip     leave the GeoIP database out (logins then show no location until online)
#   NODE_VERSION=v22.23.5 to pin Node.js (default: the newest 22.x)
#
# The working copy is packed as it is, uncommitted changes included. Needs git, curl, python3
# with python3-apt, and about 4 GB free. Copy the resulting folder to the USB drive (any
# filesystem, FAT32 included: the largest file stays under 4 GB).
set -Eeuo pipefail

readonly TARGET_RELEASE=noble
readonly TARGET_GLIBC=2.39
readonly NODE_MAJOR=22

repository_root=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
readonly repository_root
include_geoip=true
output_directory=""

log() { printf '\033[1;32m==>\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

for argument in "$@"; do
  case "$argument" in
    --no-geoip) include_geoip=false ;;
    -h | --help)
      sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) die "unknown option: $argument" ;;
    *) output_directory=$argument ;;
  esac
done
output_directory=$(realpath -m "${output_directory:-$repository_root/dist/offline}")

# Packs or unpacks tar archives with Python, so the build works the same everywhere.
python_tar() {
  python3 -I - "$@" <<'PYTHON'
import os, sys, tarfile
mode, archive, directory = sys.argv[1], sys.argv[2], sys.argv[3]
if mode == "pack":
    with tarfile.open(archive, "w:gz", compresslevel=6) as bundle:
        for name in sorted(os.listdir(directory)):
            bundle.add(os.path.join(directory, name), arcname=name)
elif mode == "unpack":
    with tarfile.open(archive) as bundle:
        bundle.extractall(directory, filter="tar")
else:
    sys.exit(f"unknown mode {mode}")
PYTHON
}

check_build_machine() {
  [[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || die "build on x86_64 Linux (the npm modules must be the linux-x64 builds)"
  local program
  for program in git curl python3 sha256sum objdump; do command -v "$program" >/dev/null || die "$program is not installed"; done
  python3 -c 'import apt_pkg' 2>/dev/null || die "python3-apt is not installed (sudo apt install python3-apt)"
}

download_node() {
  local node_directory=$1 version
  version=${NODE_VERSION:-$(curl -fsSL https://nodejs.org/dist/index.json | python3 -I -c "import json, sys; print(next(release['version'] for release in json.load(sys.stdin) if release['version'].startswith('v$NODE_MAJOR.')))")}
  local file_name=node-$version-linux-x64.tar.xz
  log "downloading Node.js $version"
  curl -fsSL --proto '=https' -o "$node_directory/$file_name" "https://nodejs.org/dist/$version/$file_name"
  curl -fsSL --proto '=https' -o "$node_directory/SHASUMS256.txt" "https://nodejs.org/dist/$version/SHASUMS256.txt"
  (cd "$node_directory" && grep " $file_name\$" SHASUMS256.txt | sha256sum --check --quiet) || die "the Node.js download does not match its published checksum"
  rm "$node_directory/SHASUMS256.txt"
  printf '%s' "$node_directory/$file_name"
}

# Exports the working copy (tracked files as on disk plus new, non-ignored ones) into $1.
export_source() {
  local destination=$1 temporary_index tree
  cd "$repository_root"
  temporary_index=$(mktemp)
  cp "$(git rev-parse --git-path index)" "$temporary_index"
  GIT_INDEX_FILE=$temporary_index git add --all
  tree=$(GIT_INDEX_FILE=$temporary_index git write-tree)
  rm -f "$temporary_index"
  git archive --format=tar -o "$destination.tar" "$tree"
  mkdir -p "$destination"
  python_tar unpack "$destination.tar" "$destination"
  rm "$destination.tar"
}

# Every native module must load on Ubuntu 24.04, whose glibc is older than the build machine's.
check_native_modules() {
  local source=$1 module newest problems=0
  while IFS= read -r -d '' module; do
    newest=$({ objdump -T "$module" 2>/dev/null || true; } | { grep -o 'GLIBC_[0-9.]*' || true; } | sed 's/GLIBC_//' | sort -V | tail -n 1)
    if [[ -n $newest ]] && [[ $(printf '%s\n%s\n' "$newest" "$TARGET_GLIBC" | sort -V | tail -n 1) != "$TARGET_GLIBC" ]]; then
      warn "${module#"$source"/} needs glibc $newest (Ubuntu 24.04 has $TARGET_GLIBC)"
      problems=$((problems + 1))
    fi
  done < <(find "$source/node_modules" -name '*.node' -type f -print0)
  ((problems == 0)) || die "$problems native module(s) were compiled here instead of downloaded prebuilt; they would not load on Ubuntu 24.04"
  log "native modules are compatible with Ubuntu 24.04 (glibc $TARGET_GLIBC)"
}

# Fills installer/offline-readme.txt with this build's versions and counts.
write_readme() {
  local staging=$1 version=$2 bundle_name=$3 node_archive=$4 commit geoip package_count node_version
  commit=$(git -C "$repository_root" rev-parse --short HEAD)
  [[ -n $(git -C "$repository_root" status --porcelain) ]] && commit="$commit + local changes"
  node_version=$(basename "$node_archive" | sed -E 's/^node-(v[0-9.]+)-.*/\1/')
  package_count=$(find "$staging/payload/debs" -name '*.deb' | wc -l)
  geoip="not included"
  [[ -s $staging/payload/geoip/dbip-city-lite.mmdb ]] && geoip="DB-IP City Lite $(cat "$staging/payload/geoip/.geoip-version" 2>/dev/null)"
  sed -e "s|@VERSION@|$version|g" -e "s|@BUILT@|$(date -u +%F)|g" -e "s|@COMMIT@|$commit|g" \
    -e "s|@NODE_VERSION@|$node_version|g" -e "s|@PACKAGE_COUNT@|$package_count|g" \
    -e "s|@GEOIP@|$geoip|g" -e "s|@BUNDLE@|$bundle_name|g" \
    "$repository_root/installer/offline-readme.txt" >"$staging/README.txt"
  ! grep -q '@[A-Z_]*@' "$staging/README.txt" || die "README.txt has unfilled placeholders"
}

main() {
  check_build_machine
  local version bundle_name staging
  version=$(node -p "require('$repository_root/package.json').version" 2>/dev/null || python3 -I -c "import json; print(json.load(open('$repository_root/package.json'))['version'])")
  bundle_name=serverlab-offline-$version-ubuntu24.04-amd64
  staging=$output_directory/.$bundle_name.building
  log "building $bundle_name"
  rm -rf "$staging"
  mkdir -p "$staging/payload/debs" "$staging/node-tools"

  local node_archive
  node_archive=$(download_node "$staging/payload")
  python_tar unpack "$node_archive" "$staging/node-tools"
  local node_bin
  node_bin=$(find "$staging/node-tools" -maxdepth 3 -type d -name bin | head -n 1)

  log "exporting the working copy"
  export_source "$staging/serverlab"

  log "installing npm modules with Node.js $("$node_bin/node" --version) (npm ci)"
  (cd "$staging/serverlab" && PATH=$node_bin:$PATH npm_config_update_notifier=false npm ci --include=dev --no-audit --no-fund --loglevel=error)
  (cd "$staging/serverlab" && "$node_bin/node" -e 'require("better-sqlite3")(":memory:").close()') || die "better-sqlite3 does not load with the bundled Node.js"
  check_native_modules "$staging/serverlab"

  log "packing ServerLab and its modules"
  python_tar pack "$staging/payload/serverlab-app.tar.gz" "$staging/serverlab"
  rm -rf "$staging/serverlab" "$staging/node-tools"

  log "collecting Ubuntu 24.04 packages"
  python3 -I "$repository_root/scripts/resolve-ubuntu-packages.py" "$staging/payload/debs" --release "$TARGET_RELEASE" 2>&1 | grep -v '^  download ' >&2

  if [[ $include_geoip == true ]]; then
    log "downloading the GeoIP database"
    mkdir -p "$staging/payload/geoip"
    bash "$repository_root/deploy/geoip-update.sh" --force "$staging/payload/geoip/dbip-city-lite.mmdb" || warn "GeoIP download failed; the bundle has no GeoIP database"
  fi

  cp "$repository_root/installer/offline-install.sh" "$staging/install.sh"
  chmod 755 "$staging/install.sh"
  write_readme "$staging" "$version" "$bundle_name" "$node_archive"

  log "writing checksums"
  (cd "$staging" && find . -type f ! -name SHA256SUMS -printf '%P\n' | sort | xargs -d '\n' sha256sum >SHA256SUMS)

  rm -rf "${output_directory:?}/$bundle_name"
  mv "$staging" "$output_directory/$bundle_name"
  local largest
  largest=$(find "$output_directory/$bundle_name" -type f -printf '%s %P\n' | sort -n | tail -n 1)
  log "done: $output_directory/$bundle_name ($(du -sh "$output_directory/$bundle_name" | cut -f1))"
  echo "    largest file: ${largest#* } ($((${largest%% *} / 1024 / 1024)) MB, fine for FAT32)"
  echo "    copy the whole folder to the USB drive, then on the server: sudo bash <folder>/install.sh"
}

main
