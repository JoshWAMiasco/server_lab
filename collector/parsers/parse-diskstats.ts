import type { DiskCounters } from "../types";

/*
 * /proc/diskstats: `major minor name reads merged sectors_read ms_reading writes merged
 * sectors_written …`. Sectors are always 512 bytes here, whatever the device's real sector size.
 * Only whole physical disks are kept: partitions, loop, dm-* (LVM/LUKS), md, zram and sr are skipped
 * so that I/O is not counted twice.
 */
const WHOLE_DISK_PATTERN = /^(?:sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/;
const SECTOR_BYTES = 512;
const NAME_COLUMN = 2;
const SECTORS_READ_COLUMN = 5;
const SECTORS_WRITTEN_COLUMN = 9;

export function isWholePhysicalDisk(deviceName: string): boolean {
  return WHOLE_DISK_PATTERN.test(deviceName);
}

export function parseDiskstats(text: string): DiskCounters[] {
  const counters: DiskCounters[] = [];
  for (const line of text.split("\n")) {
    const fields = line.trim().split(/\s+/);
    const deviceName = fields[NAME_COLUMN];
    if (fields.length <= SECTORS_WRITTEN_COLUMN || !deviceName || !isWholePhysicalDisk(deviceName)) {
      continue;
    }
    const sectorsRead = Number(fields[SECTORS_READ_COLUMN]);
    const sectorsWritten = Number(fields[SECTORS_WRITTEN_COLUMN]);
    if (!Number.isFinite(sectorsRead) || !Number.isFinite(sectorsWritten)) {
      continue;
    }
    counters.push({ deviceName, readBytes: sectorsRead * SECTOR_BYTES, writtenBytes: sectorsWritten * SECTOR_BYTES });
  }
  return counters;
}
