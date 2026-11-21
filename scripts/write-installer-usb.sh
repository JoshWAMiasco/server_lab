#!/usr/bin/env bash
# Puts the ServerLab offline installer on a USB drive, optionally erasing the drive first.
#
# Usage:
#   sudo scripts/write-installer-usb.sh /dev/sdX            erase the drive (exFAT, label
#                                                           INSTALLERS), copy the installer
#   sudo scripts/write-installer-usb.sh /dev/sdX --keep     keep what is on the drive and only
#                                                           add or replace the ServerLab folder
#   --bundle DIR    the installer folder (default: the newest dist/offline/serverlab-offline-*)
#
# Only removable USB disks are accepted, and the drive is shown and must be confirmed by typing
# its name before anything is erased. exFAT holds files over 4 GB (other OS installers) and is
# read by Ubuntu 22.04+, Windows and macOS. Build the bundle first:
#   scripts/build-offline-installer.sh
set -Eeuo pipefail

readonly LABEL=INSTALLERS
repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
readonly repository_root

original_arguments=("$@")
device=""
keep_contents=false
bundle=""
mount_point=""

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n $mount_point ]] && mountpoint -q "$mount_point"; then umount "$mount_point" || true; fi
  if [[ -n $mount_point && -d $mount_point ]]; then rmdir "$mount_point" 2>/dev/null || true; fi
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) keep_contents=true ;;
    --bundle)
      bundle=${2:-}
      shift
      ;;
    -h | --help)
      sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    /dev/*) device=$1 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
  shift
done

[[ $EUID -eq 0 ]] || die "run with sudo: sudo $0 ${original_arguments[*]}"
[[ -n $device ]] || {
  lsblk -d -o NAME,SIZE,TRAN,RM,MODEL,VENDOR | awk 'NR == 1 || $3 == "usb"'
  die "which drive? e.g. sudo $0 /dev/sdb (USB drives are listed above)"
}
[[ -b $device ]] || die "$device is not a block device"

if [[ -z $bundle ]]; then
  bundle=$(find "$repository_root/dist/offline" -maxdepth 1 -type d -name 'serverlab-offline-*' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -n 1 | cut -d' ' -f2-)
fi
[[ -n $bundle && -f $bundle/install.sh && -f $bundle/SHA256SUMS ]] || die "no installer bundle found; run scripts/build-offline-installer.sh first"

# --- Make sure this is a removable USB disk, not a system disk ------------------------------------
device_name=$(basename "$device")
[[ $(lsblk -dno TYPE "$device") == disk ]] || die "$device is a partition; pass the whole disk (e.g. /dev/sdb, not /dev/sdb1)"
[[ $(lsblk -dno TRAN "$device") == usb ]] || die "$device is not a USB drive; refusing to touch it"
[[ $(cat "/sys/block/$device_name/removable" 2>/dev/null) == 1 || $(lsblk -dno HOTPLUG "$device") == 1 ]] || die "$device is not removable; refusing to touch it"
if lsblk -no MOUNTPOINTS "$device" | grep -qE '^/(boot|home|usr|var)?$'; then die "$device holds a system mount; refusing"; fi

echo
lsblk -o NAME,SIZE,MODEL,VENDOR,FSTYPE,LABEL,MOUNTPOINTS "$device"
echo
log "installer: $bundle ($(du -sh "$bundle" | cut -f1))"

partition=""
if [[ $keep_contents == true ]]; then
  partition=$(lsblk -lnpo NAME,TYPE "$device" | awk '$2 == "part" {print $1; exit}')
  [[ -n $partition ]] || die "$device has no partition to add to; run without --keep to format it"
else
  read -r -p "ERASE everything on $device ($(lsblk -dno VENDOR,MODEL,SIZE "$device" | xargs))? Type the drive name ($device_name) to confirm: " answer
  [[ $answer == "$device_name" ]] || die "not confirmed; nothing was changed"
  command -v mkfs.exfat >/dev/null || die "mkfs.exfat is missing (sudo apt install exfatprogs)"
  log "unmounting $device"
  for mounted_partition in $(lsblk -lnpo NAME "$device" | tail -n +2); do umount "$mounted_partition" 2>/dev/null || true; done
  log "erasing $device and creating one exFAT partition labelled $LABEL"
  wipefs --all --quiet "$device"
  parted --script "$device" mklabel msdos mkpart primary ntfs 1MiB 100%
  partprobe "$device" 2>/dev/null || true
  udevadm settle
  partition=$(lsblk -lnpo NAME,TYPE "$device" | awk '$2 == "part" {print $1; exit}')
  [[ -n $partition ]] || die "the new partition did not appear"
  mkfs.exfat -L "$LABEL" "$partition" >/dev/null
fi

# --- Copy and check ---------------------------------------------------------------------------
for mounted in $(lsblk -no MOUNTPOINTS "$partition"); do umount "$mounted" 2>/dev/null || true; done
mount_point=$(mktemp -d /tmp/serverlab-usb.XXXXXX)
mount "$partition" "$mount_point"
destination=$mount_point/$(basename "$bundle")
log "copying $(basename "$bundle") to the drive"
rm -rf "$destination"
cp -r "$bundle" "$destination"
sync
log "checking the copy"
(cd "$destination" && sha256sum --quiet --check SHA256SUMS) || die "the copy on the drive does not match; try another USB drive"
log "free space left: $(df -h --output=avail "$mount_point" | tail -n 1 | xargs)"
umount "$mount_point"
rmdir "$mount_point"
mount_point=""
if command -v udisksctl >/dev/null; then udisksctl power-off -b "$device" >/dev/null 2>&1 || true; fi
log "done: the drive can be unplugged"
echo "    On the server: mount it (e.g. sudo mount /dev/sdb1 /mnt), then"
echo "    sudo bash /mnt/$(basename "$bundle")/install.sh"
