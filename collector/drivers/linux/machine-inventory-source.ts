import fileSystem from "node:fs/promises";
import operatingSystem from "node:os";
import path from "node:path";
import { readIntegerFile, readTextFile, runCommand } from "@/collector/drivers/linux/run-command";
import { classifyChassisDescription, parseChassisType } from "@/collector/parsers/parse-chassis-type";
import { cleanDmidecodeValue, extractMemoryArray, extractMemoryModules, extractProcessors, extractSystemInformation, parseDmidecode, type DmidecodeHandle, type DmidecodeProcessor } from "@/collector/parsers/parse-dmidecode";
import { parseLsblk } from "@/collector/parsers/parse-lsblk";
import { describeProcessorVendor, parseLscpu, type LscpuSummary } from "@/collector/parsers/parse-lscpu";
import { parseLspciDeviceName } from "@/collector/parsers/parse-lspci-device";
import { parseOsReleaseName } from "@/collector/parsers/parse-os-release";
import type { MachineInventory, MemoryInventory, MemoryModule, NetworkAdapter, ProcessorInventory, StorageDevice } from "@/collector/types";

/*
 * Builds the Machine page's hardware inventory from unprivileged sources (/sys/class/dmi/id, lscpu,
 * lsblk, /sys/class/net, lspci, EDAC) plus, when present, the dmidecode output that the root
 * oneshot unit serverlab-hardware-inventory.service writes at boot (serial numbers, RAM slots,
 * processor sockets). Every read degrades to null instead of failing.
 */

export const HARDWARE_INVENTORY_FILE = "/var/lib/serverlab/hardware/dmidecode.txt";
const DMI_ROOT = "/sys/class/dmi/id";
const EDAC_ROOT = "/sys/devices/system/edac/mc";
const NETWORK_ROOT = "/sys/class/net";
const CPU_FREQUENCY_ROOT = "/sys/devices/system/cpu/cpu0/cpufreq";
const LSBLK_ARGUMENTS = ["-J", "-b", "-d", "-o", "NAME,MODEL,VENDOR,SERIAL,SIZE,ROTA,TRAN,TYPE,REV"];
const VIRTUAL_INTERFACE_NAME = /^(?:lo|docker|veth|br-|virbr|tailscale|wg|tun|tap|vnet|zt|cni|flannel|cali|lxc|lxd|kube|dummy|bond|team|vxlan|ip6?tnl|sit|gre)/;
const PCI_ADDRESS = /^[\da-f]{4}:[\da-f]{2}:[\da-f]{2}\.\d$/i;
const MEBIBYTE = 1024 * 1024;

async function readDmiField(fieldName: string): Promise<string | null> {
  return cleanDmidecodeValue(await readTextFile(path.join(DMI_ROOT, fieldName)));
}

async function listDirectory(directoryPath: string): Promise<string[]> {
  try {
    return await fileSystem.readdir(directoryPath);
  } catch {
    return [];
  }
}

async function resolveLinkName(linkPath: string): Promise<string | null> {
  try {
    return path.basename(await fileSystem.realpath(linkPath));
  } catch {
    return null;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fileSystem.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function roundMegahertz(value: number | null): number | null {
  return value === null || !Number.isFinite(value) || value <= 0 ? null : Math.round(value);
}

/**
 * One ProcessorInventory per socket. lscpu (what the kernel sees) wins over dmidecode (what the
 * BIOS claims, often a generic "Max Speed"); cache totals from lscpu are split evenly per socket.
 */
export function buildProcessorInventories(options: {
  lscpu: LscpuSummary | null;
  dmidecodeProcessors: readonly DmidecodeProcessor[];
  maximumKilohertz: number | null;
  baseKilohertz: number | null;
  fallbackModel: string | null;
  fallbackLogicalCount: number | null;
  architecture: string | null;
}): ProcessorInventory[] {
  const { lscpu, dmidecodeProcessors } = options;
  const socketCount = Math.max(lscpu?.socketCount ?? 0, dmidecodeProcessors.length, 1);
  const logicalCount = lscpu?.logicalProcessorCount ?? options.fallbackLogicalCount;
  const threadsPerSocket = logicalCount !== null && logicalCount % socketCount === 0 ? logicalCount / socketCount : null;
  const processors: ProcessorInventory[] = [];
  for (let socketIndex = 0; socketIndex < socketCount; socketIndex += 1) {
    const dmidecodeProcessor = dmidecodeProcessors[socketIndex] ?? dmidecodeProcessors[0] ?? null;
    const coreCount = lscpu?.coresPerSocket ?? dmidecodeProcessor?.coreCount ?? null;
    processors.push({
      socket: dmidecodeProcessors[socketIndex]?.socket ?? null,
      vendor: describeProcessorVendor(lscpu?.vendorIdentifier ?? null) ?? dmidecodeProcessor?.manufacturer ?? null,
      model: lscpu?.modelName ?? dmidecodeProcessor?.version ?? options.fallbackModel ?? "Unknown processor",
      architecture: lscpu?.architecture ?? options.architecture,
      coreCount,
      threadCount: threadsPerSocket ?? (coreCount !== null && lscpu?.threadsPerCore ? coreCount * lscpu.threadsPerCore : null) ?? dmidecodeProcessor?.threadCount ?? null,
      baseMegahertz: roundMegahertz(options.baseKilohertz === null ? null : options.baseKilohertz / 1000) ?? dmidecodeProcessor?.currentMegahertz ?? null,
      maximumMegahertz: roundMegahertz(lscpu?.maximumMegahertz ?? (options.maximumKilohertz === null ? null : options.maximumKilohertz / 1000)) ?? dmidecodeProcessor?.maximumMegahertz ?? null,
      caches: (lscpu?.caches ?? []).map((cache) => ({ level: cache.level, bytes: Math.round(cache.bytes / socketCount) })),
      virtualization: lscpu?.virtualization ?? null,
    });
  }
  return processors;
}

/** EDAC's dimm_mem_type ("Registered-DDR4", "Unbuffered-DDR5") → memory type and module form factor. */
export function parseEdacMemoryType(memoryType: string | null): { type: string | null; formFactor: string | null } {
  const trimmed = memoryType?.trim() ?? "";
  if (trimmed === "" || /^unknown$/i.test(trimmed)) return { type: null, formFactor: null };
  const [prefix = "", ...rest] = trimmed.split("-");
  const type = rest.length > 0 ? rest.join("-") : prefix;
  const formFactor = rest.length === 0 ? null : /^registered$/i.test(prefix) ? "RDIMM" : /^unbuffered$/i.test(prefix) ? "UDIMM" : /^load-?reduced$/i.test(prefix) ? "LRDIMM" : null;
  return { type, formFactor };
}

async function readEdacModules(): Promise<MemoryModule[]> {
  const modules: MemoryModule[] = [];
  const controllerNames = (await listDirectory(EDAC_ROOT)).filter((name) => /^mc\d+$/.test(name)).sort((left, right) => Number(left.slice(2)) - Number(right.slice(2)));
  for (const controllerName of controllerNames) {
    const controllerPath = path.join(EDAC_ROOT, controllerName);
    const dimmNames = (await listDirectory(controllerPath)).filter((name) => /^dimm\d+$/.test(name)).sort((left, right) => Number(left.slice(4)) - Number(right.slice(4)));
    for (const dimmName of dimmNames) {
      const modulePath = path.join(controllerPath, dimmName);
      const [sizeMebibytes, label, memoryType, location] = await Promise.all([
        readIntegerFile(path.join(modulePath, "size")),
        readTextFile(path.join(modulePath, "dimm_label")),
        readTextFile(path.join(modulePath, "dimm_mem_type")),
        readTextFile(path.join(modulePath, "dimm_location")),
      ]);
      const isInstalled = sizeMebibytes !== null && sizeMebibytes > 0;
      const { type, formFactor } = parseEdacMemoryType(memoryType);
      modules.push({
        slot: label?.trim() || location?.trim() || `${controllerName} ${dimmName}`,
        bank: label?.trim() && location?.trim() ? location.trim() : null,
        sizeBytes: isInstalled ? sizeMebibytes * MEBIBYTE : null,
        type: isInstalled ? type : null,
        formFactor,
        speedMegatransfers: null,
        configuredSpeedMegatransfers: null,
        manufacturer: null,
        partNumber: null,
        serialNumber: null,
      });
    }
  }
  return [...modules.filter((module) => module.sizeBytes !== null), ...modules.filter((module) => module.sizeBytes === null)];
}

async function readMemoryInventory(handles: readonly DmidecodeHandle[]): Promise<MemoryInventory> {
  const dmidecodeModules = extractMemoryModules(handles);
  if (dmidecodeModules.length > 0) {
    const memoryArray = extractMemoryArray(handles);
    return { source: "dmidecode", slotCount: dmidecodeModules.length, maximumCapacityBytes: memoryArray.maximumCapacityBytes, modules: dmidecodeModules };
  }
  const edacModules = await readEdacModules();
  if (edacModules.length > 0) return { source: "edac", slotCount: edacModules.length, maximumCapacityBytes: null, modules: edacModules };
  return { source: "none", slotCount: null, maximumCapacityBytes: null, modules: [] };
}

async function readUsbDeviceName(deviceLinkPath: string): Promise<string | null> {
  try {
    const interfacePath = await fileSystem.realpath(deviceLinkPath);
    const usbDevicePath = path.dirname(interfacePath);
    const [manufacturer, product] = await Promise.all([readTextFile(path.join(usbDevicePath, "manufacturer")), readTextFile(path.join(usbDevicePath, "product"))]);
    const name = [manufacturer?.trim(), product?.trim()].filter(Boolean).join(" ");
    return name === "" ? null : name;
  } catch {
    return null;
  }
}

async function readNetworkAdapter(interfaceName: string): Promise<NetworkAdapter | null> {
  const interfacePath = path.join(NETWORK_ROOT, interfaceName);
  const deviceLinkPath = path.join(interfacePath, "device");
  const deviceName = await resolveLinkName(deviceLinkPath);
  if (!deviceName) return null;
  const [address, speed, operationalState, hasWirelessDirectory, hasPhysicalRadio, driver, subsystem] = await Promise.all([
    readTextFile(path.join(interfacePath, "address")),
    readIntegerFile(path.join(interfacePath, "speed")),
    readTextFile(path.join(interfacePath, "operstate")),
    pathExists(path.join(interfacePath, "wireless")),
    pathExists(path.join(interfacePath, "phy80211")),
    resolveLinkName(path.join(deviceLinkPath, "driver")),
    resolveLinkName(path.join(deviceLinkPath, "subsystem")),
  ]);
  let model: string | null = null;
  if (PCI_ADDRESS.test(deviceName)) model = parseLspciDeviceName((await runCommand("lspci", ["-mm", "-s", deviceName], 3000)) ?? "");
  else if (subsystem === "usb") model = await readUsbDeviceName(deviceLinkPath);
  const macAddress = address?.trim().toLowerCase() ?? "";
  return {
    interfaceName,
    macAddress: macAddress === "" || /^(?:00:){5}00$/.test(macAddress) ? null : macAddress,
    speedMegabits: speed !== null && speed > 0 ? speed : null,
    model,
    driver,
    isWireless: hasWirelessDirectory || hasPhysicalRadio,
    isUp: operationalState?.trim() === "up",
  };
}

async function readNetworkAdapters(): Promise<NetworkAdapter[]> {
  const interfaceNames = (await listDirectory(NETWORK_ROOT)).filter((name) => !VIRTUAL_INTERFACE_NAME.test(name)).sort();
  const adapters = await Promise.all(interfaceNames.map((interfaceName) => readNetworkAdapter(interfaceName).catch(() => null)));
  return adapters.filter((adapter): adapter is NetworkAdapter => adapter !== null);
}

async function readStorageDevices(): Promise<StorageDevice[]> {
  return parseLsblk((await runCommand("lsblk", LSBLK_ARGUMENTS, 5000)) ?? "");
}

async function readOperatingSystemName(): Promise<string | null> {
  const text = (await readTextFile("/etc/os-release")) ?? (await readTextFile("/usr/lib/os-release"));
  return text === null ? null : parseOsReleaseName(text);
}

function readMachineArchitecture(): string | null {
  try {
    return operatingSystem.machine();
  } catch {
    return operatingSystem.arch();
  }
}

/** Reads everything the Machine page shows. Takes about a second (lscpu, lsblk and one lspci per NIC). */
export async function readMachineInventory(): Promise<MachineInventory> {
  const [dmidecodeText, chassisTypeText, sysfsValues, lscpuText, maximumKilohertz, baseKilohertz, storage, networkAdapters, operatingSystemName] = await Promise.all([
    readTextFile(HARDWARE_INVENTORY_FILE),
    readTextFile(path.join(DMI_ROOT, "chassis_type")),
    Promise.all(
      ["sys_vendor", "product_name", "product_version", "product_serial", "board_vendor", "board_name", "board_version", "board_serial", "bios_vendor", "bios_version", "bios_date"].map(
        async (fieldName) => [fieldName, await readDmiField(fieldName)] as const,
      ),
    ).then((entries) => new Map(entries)),
    runCommand("lscpu", ["-J"], 5000),
    readIntegerFile(path.join(CPU_FREQUENCY_ROOT, "cpuinfo_max_freq")),
    readIntegerFile(path.join(CPU_FREQUENCY_ROOT, "base_frequency")),
    readStorageDevices().catch(() => []),
    readNetworkAdapters().catch(() => []),
    readOperatingSystemName(),
  ]);
  const handles = dmidecodeText === null ? [] : parseDmidecode(dmidecodeText);
  const dmidecode = extractSystemInformation(handles);
  const sysfs = (fieldName: string) => sysfsValues.get(fieldName) ?? null;
  const memory = await readMemoryInventory(handles);
  let chassis = parseChassisType(chassisTypeText);
  if (chassis.formFactor === "unknown" && dmidecode.chassis.typeDescription) {
    const fromDmidecode = classifyChassisDescription(dmidecode.chassis.typeDescription);
    if (fromDmidecode.formFactor !== "unknown" || chassis.description === null) chassis = fromDmidecode;
  }
  const architecture = readMachineArchitecture();
  const cpus = operatingSystem.cpus();
  return {
    formFactor: chassis.formFactor,
    chassisDescription: chassis.description,
    system: {
      vendor: sysfs("sys_vendor") ?? dmidecode.system.vendor,
      product: sysfs("product_name") ?? dmidecode.system.product,
      version: sysfs("product_version") ?? dmidecode.system.version,
      serialNumber: sysfs("product_serial") ?? dmidecode.system.serialNumber,
    },
    motherboard: {
      vendor: sysfs("board_vendor") ?? dmidecode.motherboard.vendor,
      model: sysfs("board_name") ?? dmidecode.motherboard.model,
      version: sysfs("board_version") ?? dmidecode.motherboard.version,
      serialNumber: sysfs("board_serial") ?? dmidecode.motherboard.serialNumber,
    },
    bios: {
      vendor: sysfs("bios_vendor") ?? dmidecode.bios.vendor,
      version: sysfs("bios_version") ?? dmidecode.bios.version,
      releaseDate: sysfs("bios_date") ?? dmidecode.bios.releaseDate,
    },
    operatingSystem: { name: operatingSystemName, kernel: operatingSystem.release() || null, architecture },
    processors: buildProcessorInventories({
      lscpu: lscpuText === null ? null : parseLscpu(lscpuText),
      dmidecodeProcessors: extractProcessors(handles),
      maximumKilohertz,
      baseKilohertz,
      fallbackModel: cpus[0]?.model.trim() || null,
      fallbackLogicalCount: cpus.length > 0 ? cpus.length : null,
      architecture,
    }),
    memory,
    storage,
    networkAdapters,
    hasHardwareInventoryFile: handles.length > 0,
  };
}
