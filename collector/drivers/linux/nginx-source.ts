import fileSystem from "node:fs/promises";
import path from "node:path";
import { classifyBindAddress, widestBindScope } from "@/collector/parsers/parse-ss-listeners";
import { mergeUpstreams, parseNginxConfig, type NginxUpstreams } from "@/collector/parsers/parse-nginx-config";
import type { DiscoveredItem, NginxSite } from "@/collector/types";
import { readEnvironment } from "@/lib/environment";

const MAXIMUM_INCLUDE_DEPTH = 10;

function globToRegularExpression(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  return new RegExp(`^${escaped}$`);
}

async function expandInclude(includePattern: string, configurationDirectory: string): Promise<string[]> {
  const absolutePattern = path.isAbsolute(includePattern) ? includePattern : path.join(configurationDirectory, includePattern);
  if (!/[*?]/.test(absolutePattern)) return [absolutePattern];
  const directory = path.dirname(absolutePattern);
  try {
    const matcher = globToRegularExpression(path.basename(absolutePattern));
    return (await fileSystem.readdir(directory)).filter((fileName) => matcher.test(fileName)).sort().map((fileName) => path.join(directory, fileName));
  } catch {
    return [];
  }
}

/**
 * Reads nginx's configuration the way nginx does: `nginx.conf`, then every `include` (globs
 * relative to the config directory). The files are world-readable on Ubuntu, so no root and no
 * `nginx -T` (which would also read TLS keys). Re-parsed only when a file's mtime changes.
 */
export class NginxSource {
  private cachedSignature = "";
  private cachedSites: NginxSite[] = [];
  readonly warnings: string[] = [];

  constructor(private readonly mainConfigurationPath = readEnvironment("NGINX_CONFIG_PATH") ?? "/etc/nginx/nginx.conf") {}

  async isAvailable(): Promise<boolean> {
    try {
      await fileSystem.access(this.mainConfigurationPath);
      return true;
    } catch {
      return false;
    }
  }

  private async collectFiles(): Promise<{ filePath: string; text: string; modifiedAt: number }[]> {
    const configurationDirectory = path.dirname(this.mainConfigurationPath);
    const files: { filePath: string; text: string; modifiedAt: number }[] = [];
    const visited = new Set<string>();
    const visit = async (filePath: string, depth: number) => {
      if (depth > MAXIMUM_INCLUDE_DEPTH || visited.has(filePath)) return;
      visited.add(filePath);
      try {
        const [text, statistics] = await Promise.all([fileSystem.readFile(filePath, "utf8"), fileSystem.stat(filePath)]);
        if (!statistics.isFile()) return;
        files.push({ filePath, text, modifiedAt: statistics.mtimeMs });
        for (const includePattern of parseNginxConfig(text, filePath).includes) {
          for (const includedPath of await expandInclude(includePattern, configurationDirectory)) await visit(includedPath, depth + 1);
        }
      } catch (error) {
        this.warnings.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    this.warnings.length = 0;
    await visit(this.mainConfigurationPath, 0);
    return files;
  }

  /** Every `server {}` block across the configuration. */
  async readSites(): Promise<NginxSite[]> {
    const files = await this.collectFiles();
    const signature = files.map((file) => `${file.filePath}:${file.modifiedAt}`).join("|");
    if (signature === this.cachedSignature) return this.cachedSites;
    let upstreams: NginxUpstreams = {};
    for (const file of files) upstreams = mergeUpstreams(upstreams, parseNginxConfig(file.text, file.filePath).upstreams);
    const sites: NginxSite[] = [];
    for (const file of files) {
      try {
        sites.push(...parseNginxConfig(file.text, file.filePath, upstreams).sites);
      } catch (error) {
        this.warnings.push(`${file.filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.cachedSignature = signature;
    this.cachedSites = sites;
    return sites;
  }
}

/**
 * One Lobby "website" per site and listen port, keyed `nginx:<first server_name>:<port>`. Sites
 * sharing a port (name-based vhosts) carry `sharesPortWith` so the card can warn about the link.
 */
export function toNginxItems(sites: readonly NginxSite[]): DiscoveredItem[] {
  const sitesPerPort = new Map<number, number>();
  for (const site of sites) for (const port of new Set(site.listenPorts)) sitesPerPort.set(port, (sitesPerPort.get(port) ?? 0) + 1);
  const items = new Map<string, DiscoveredItem>();
  for (const site of sites) {
    const primaryName = site.serverNames.find((serverName) => serverName && serverName !== "_") ?? site.serverNames[0] ?? "default";
    for (const port of new Set(site.listenPorts)) {
      const key = `nginx:${primaryName}:${port}`;
      if (items.has(key)) continue;
      const addresses = site.listenAddresses.length > 0 ? site.listenAddresses : ["0.0.0.0"];
      items.set(key, {
        key,
        source: "nginx",
        rawName: primaryName,
        image: null,
        unit: null,
        processName: null,
        description: null,
        ports: addresses.map((hostAddress) => ({ hostPort: port, containerPort: null, protocol: "tcp", hostAddress })),
        labels: {},
        state: "running",
        health: "none",
        startedAt: null,
        bindScope: widestBindScope(addresses.map((address) => classifyBindAddress(address))),
        extra: { serverNames: site.serverNames, isSsl: site.isSsl, isDefaultServer: site.isDefaultServer, proxyPassPort: site.proxyPassPort, proxyPassTarget: site.proxyPassTarget, staticRoot: site.staticRoot, sourceFile: site.sourceFile, sharesPortWith: (sitesPerPort.get(port) ?? 1) - 1 },
      });
    }
  }
  return [...items.values()];
}
