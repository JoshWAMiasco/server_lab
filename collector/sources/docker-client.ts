import http from "node:http";
import { readEnvironment } from "@/lib/environment";

/*
 * A deliberately tiny Docker Engine API client. It can only send GET requests: membership of the
 * `docker` group is root-equivalent, so the collector never gets a code path that creates, starts,
 * stops or execs anything (see docs/HARDENING.md). docker-client.test.ts checks this.
 */

const REQUEST_TIMEOUT_MILLISECONDS = 5000;

export interface DockerContainerSummary {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Labels: Record<string, string> | null;
  Ports: { IP?: string; PrivatePort: number; PublicPort?: number; Type: "tcp" | "udp" }[];
}

export interface DockerContainerInspection {
  Id: string;
  State: { Status: string; StartedAt: string; Health?: { Status: string } };
  HostConfig?: { Memory?: number };
}

export interface DockerContainerStatistics {
  memory_stats: { usage?: number; limit?: number; stats?: { inactive_file?: number; total_inactive_file?: number } };
  cpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number; online_cpus?: number };
  precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number };
}

function resolveConnection(): { socketPath?: string; host?: string; port?: number } {
  const dockerHost = readEnvironment("DOCKER_HOST");
  if (dockerHost?.startsWith("tcp://")) {
    const url = new URL(dockerHost.replace("tcp://", "http://"));
    return { host: url.hostname, port: Number(url.port || 2375) };
  }
  return { socketPath: dockerHost?.startsWith("unix://") ? dockerHost.slice("unix://".length) : "/var/run/docker.sock" };
}

function dockerGet<ResponseType>(requestPath: string): Promise<ResponseType> {
  return new Promise((resolve, reject) => {
    const request = http.request({ ...resolveConnection(), path: requestPath, method: "GET", timeout: REQUEST_TIMEOUT_MILLISECONDS }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`Docker API ${requestPath}: HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body) as ResponseType);
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error(`Docker API ${requestPath}: timeout`)));
    request.on("error", reject);
    request.end();
  });
}

/** Lists all containers, running or not (`GET /containers/json?all=1`). */
export function listContainers(): Promise<DockerContainerSummary[]> {
  return dockerGet("/containers/json?all=1");
}

/** Inspects one container (`GET /containers/{id}/json`). */
export function inspectContainer(containerId: string): Promise<DockerContainerInspection> {
  return dockerGet(`/containers/${encodeURIComponent(containerId)}/json`);
}

/** One-shot resource statistics (`GET /containers/{id}/stats?stream=false`). */
export function readContainerStatistics(containerId: string): Promise<DockerContainerStatistics> {
  return dockerGet(`/containers/${encodeURIComponent(containerId)}/stats?stream=false&one-shot=true`);
}

/** Whether the Docker API answers (`GET /_ping` is plain text, so `/version` is used). */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await dockerGet("/version");
    return true;
  } catch {
    return false;
  }
}
