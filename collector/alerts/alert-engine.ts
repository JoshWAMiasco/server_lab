import fileSystem from "node:fs";
import { X509Certificate } from "node:crypto";
import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import type { ServerLabDatabase } from "@/lib/database/client";
import { readSetting, writeSetting } from "@/lib/database/key-value";
import { ALERT_TEST_REQUEST_KEY, ALERT_TEST_RESULT_KEY, DEFAULT_ALERT_RULES, THRESHOLD_METRICS, type AlertTestRequest, type AlertTestResult, type ThresholdMetric } from "@/lib/alerts/alert-definitions";
import { alertEvents, alertRules } from "@/lib/schema/alerts";
import { lobbyItems } from "@/lib/schema/lobby";
import { loginEvents } from "@/lib/schema/watcher";
import type { StoredLoginEvent } from "@/lib/watcher/login-event-store";
import { notifyChannels, sendToChannel } from "@/collector/alerts/notifiers";
import type { DiscoveryChange } from "@/collector/discovery/discovery-writer";
import type { AppUsageReading, FilesystemUsage, SystemSample } from "@/collector/types";
import { formatBytes } from "@/utilities/format-number";
import { readEnvironment } from "@/lib/environment";

type AlertRuleRow = typeof alertRules.$inferSelect;

interface ThresholdState {
  pendingSince: number | null;
  firingEventId: number | null;
  lastNotifiedAt: number | null;
}

/**
 * Inserts the default rules once (matched by `seed_key`, so edits and deletions are kept).
 */
export function seedDefaultAlertRules(database: ServerLabDatabase): void {
  if (readSetting(database, "alerts.seeded", false)) return;
  for (const defaultRule of DEFAULT_ALERT_RULES) {
    database
      .insert(alertRules)
      .values({
        seedKey: defaultRule.seedKey,
        name: defaultRule.name,
        kind: defaultRule.kind,
        metric: defaultRule.metric ?? null,
        operator: defaultRule.operator ?? null,
        threshold: defaultRule.threshold ?? null,
        forSeconds: defaultRule.forSeconds ?? 0,
        event: defaultRule.event ?? null,
        parameters: defaultRule.parameters ?? {},
        cooldownSeconds: defaultRule.cooldownSeconds,
        channels: defaultRule.channels,
      })
      .onConflictDoNothing()
      .run();
  }
  writeSetting(database, "alerts.seeded", true);
}

function formatMetricValue(metric: string, value: number): string {
  const definition = THRESHOLD_METRICS[metric as ThresholdMetric];
  if (!definition) return value.toFixed(1);
  if (definition.unit === "bytes") return formatBytes(value);
  return `${value.toFixed(1)}${definition.unit}`;
}

function formatServerTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Evaluates alert rules inside the collector: thresholds after every sample, event rules from the
 * login and discovery code paths. State per (rule, entity) goes pending → firing → resolved; open
 * events are reloaded on restart so nothing is sent twice.
 */
export class AlertEngine {
  private readonly thresholdStates = new Map<string, ThresholdState>();
  private latestFilesystems: FilesystemUsage[] = [];
  private latestAppUsage: AppUsageReading[] = [];
  private hasCompletedFirstDiscovery = false;

  constructor(
    private readonly database: ServerLabDatabase,
    private readonly hostname: string,
  ) {
    for (const firingEvent of database.select().from(alertEvents).where(eq(alertEvents.state, "firing")).all()) {
      if (firingEvent.ruleId === null) continue;
      this.thresholdStates.set(`${firingEvent.ruleId}|${firingEvent.entity}`, { pendingSince: firingEvent.startedAt, firingEventId: firingEvent.id, lastNotifiedAt: firingEvent.notifiedAt });
    }
  }

  private readEnabledRules(kind: "threshold" | "event"): AlertRuleRow[] {
    return this.database.select().from(alertRules).where(and(eq(alertRules.kind, kind), eq(alertRules.isEnabled, true))).all();
  }

  private async openEvent(rule: AlertRuleRow, entity: string, value: number | null, message: string, now: number): Promise<number> {
    const state = this.thresholdStates.get(`${rule.id}|${entity}`);
    const isCoolingDown = state?.lastNotifiedAt !== null && state?.lastNotifiedAt !== undefined && now - state.lastNotifiedAt < rule.cooldownSeconds * 1000;
    const inserted = this.database.insert(alertEvents).values({ ruleId: rule.id, ruleName: rule.name, entity, state: "firing", value, message, startedAt: now }).returning({ id: alertEvents.id }).get();
    let notifiedAt = state?.lastNotifiedAt ?? null;
    if (!isCoolingDown) {
      const wasSent = await notifyChannels(rule.channels, { title: `[${this.hostname}] ${rule.name}`, message: `${message}\n${formatServerTime(now)}`, state: "firing" });
      if (wasSent || rule.channels.includes("inapp")) {
        notifiedAt = now;
        this.database.update(alertEvents).set({ notifiedAt: now }).where(eq(alertEvents.id, inserted.id)).run();
      }
    }
    this.thresholdStates.set(`${rule.id}|${entity}`, { pendingSince: state?.pendingSince ?? now, firingEventId: inserted.id, lastNotifiedAt: notifiedAt });
    return inserted.id;
  }

  private async resolveEvent(rule: AlertRuleRow, entity: string, message: string, now: number): Promise<void> {
    const stateKey = `${rule.id}|${entity}`;
    const state = this.thresholdStates.get(stateKey);
    if (!state?.firingEventId) return;
    const firingEvent = this.database.select().from(alertEvents).where(eq(alertEvents.id, state.firingEventId)).get();
    this.database.update(alertEvents).set({ state: "resolved", resolvedAt: now }).where(eq(alertEvents.id, state.firingEventId)).run();
    if (firingEvent?.notifiedAt) await notifyChannels(rule.channels, { title: `[${this.hostname}] Resolved: ${rule.name}`, message: `${message}\n${formatServerTime(now)}`, state: "resolved" });
    this.thresholdStates.set(stateKey, { pendingSince: null, firingEventId: null, lastNotifiedAt: state.lastNotifiedAt });
  }

  /** Remembers the latest per-mount usage for `disk_used_pct` rules. */
  updateFilesystems(filesystems: FilesystemUsage[]): void {
    this.latestFilesystems = filesystems;
  }

  /** Remembers the latest per-app usage for `app_mem` / `app_cpu` rules. */
  updateAppUsage(readings: AppUsageReading[]): void {
    this.latestAppUsage = readings;
  }

  private collectMetricValues(sample: SystemSample): Map<string, Map<string, number>> {
    const values = new Map<string, Map<string, number>>();
    const put = (metric: string, entity: string, value: number | null) => {
      if (value === null || !Number.isFinite(value)) return;
      const entityValues = values.get(metric) ?? new Map<string, number>();
      entityValues.set(entity, value);
      values.set(metric, entityValues);
    };
    put("cpu_pct", "", sample.cpuPercent);
    put("mem_pct", "", sample.memory.totalBytes > 0 ? (100 * sample.memory.usedBytes) / sample.memory.totalBytes : null);
    put("swap_pct", "", sample.memory.swapTotalBytes > 0 ? (100 * sample.memory.swapUsedBytes) / sample.memory.swapTotalBytes : null);
    put("load1", "", sample.loadAverages[0]);
    put("cpu_temp_c", "", sample.cpuTemperatureCelsius);
    for (const gpu of sample.gpus) {
      put("gpu_temp_c", String(gpu.gpuIndex), gpu.temperatureCelsius);
      put("gpu_util", String(gpu.gpuIndex), gpu.utilizationPercent);
    }
    for (const filesystem of this.latestFilesystems) put("disk_used_pct", filesystem.mountPoint, filesystem.sizeBytes > 0 ? (100 * filesystem.usedBytes) / filesystem.sizeBytes : null);
    for (const reading of this.latestAppUsage) {
      put("app_mem", reading.appKey, reading.memoryBytes);
      put("app_cpu", reading.appKey, reading.cpuPercent);
    }
    return values;
  }

  /** Evaluates every enabled threshold rule against the newest sample. */
  async evaluateSample(sample: SystemSample): Promise<void> {
    const metricValues = this.collectMetricValues(sample);
    const now = sample.timestamp;
    for (const rule of this.readEnabledRules("threshold")) {
      if (!rule.metric || rule.threshold === null || !rule.operator) continue;
      const entityValues = metricValues.get(rule.metric) ?? new Map<string, number>();
      const ruleEntities = rule.entity ? [rule.entity] : [...new Set([...entityValues.keys(), ...this.readFiringEntities(rule.id)])];
      for (const entity of ruleEntities) {
        const value = entityValues.get(entity);
        const stateKey = `${rule.id}|${entity}`;
        const state = this.thresholdStates.get(stateKey) ?? { pendingSince: null, firingEventId: null, lastNotifiedAt: null };
        const isBreaching = value !== undefined && (rule.operator === ">" ? value > rule.threshold : value < rule.threshold);
        const label = THRESHOLD_METRICS[rule.metric as ThresholdMetric]?.label ?? rule.metric;
        const subject = entity ? `${label} (${entity})` : label;
        if (isBreaching) {
          const pendingSince = state.pendingSince ?? now;
          this.thresholdStates.set(stateKey, { ...state, pendingSince });
          if (!state.firingEventId && now - pendingSince >= rule.forSeconds * 1000) {
            await this.openEvent(rule, entity, value, `${subject} is ${formatMetricValue(rule.metric, value)} (${rule.operator} ${formatMetricValue(rule.metric, rule.threshold)})`, now);
          }
        } else if (state.firingEventId) {
          await this.resolveEvent(rule, entity, value === undefined ? `${subject} is no longer reported` : `${subject} is back to ${formatMetricValue(rule.metric, value)}`, now);
        } else if (state.pendingSince !== null) {
          this.thresholdStates.set(stateKey, { ...state, pendingSince: null });
        }
      }
    }
  }

  private readFiringEntities(ruleId: number): string[] {
    return [...this.thresholdStates.entries()].filter(([stateKey, state]) => stateKey.startsWith(`${ruleId}|`) && state.firingEventId).map(([stateKey]) => stateKey.slice(String(ruleId).length + 1));
  }

  private isOneShotCoolingDown(rule: AlertRuleRow, entity: string, now: number): boolean {
    const lastEvent = this.database
      .select({ startedAt: alertEvents.startedAt })
      .from(alertEvents)
      .where(and(eq(alertEvents.ruleId, rule.id), eq(alertEvents.entity, entity), gte(alertEvents.startedAt, now - rule.cooldownSeconds * 1000)))
      .get();
    return Boolean(lastEvent);
  }

  /** Brute-force and new-country rules, run for each newly stored live login event. */
  async handleLoginEvent(loginEvent: StoredLoginEvent): Promise<void> {
    if (loginEvent.isBackfilled) return;
    const now = Date.now();
    for (const rule of this.readEnabledRules("event")) {
      if (rule.event === "login_failed_burst" && loginEvent.result !== "success" && loginEvent.sourceAddress) {
        const failureCount = Number(rule.parameters.count ?? 5);
        const windowMilliseconds = Number(rule.parameters.windowSeconds ?? 600) * 1000;
        const recentFailures = this.database
          .select({ count: sql<number>`count(*)` })
          .from(loginEvents)
          .where(and(eq(loginEvents.sourceAddress, loginEvent.sourceAddress), ne(loginEvents.result, "success"), gte(loginEvents.timestamp, loginEvent.timestamp - windowMilliseconds)))
          .get();
        if ((recentFailures?.count ?? 0) >= failureCount && !this.isOneShotCoolingDown(rule, loginEvent.sourceAddress, now)) {
          const location = loginEvent.countryName ? ` (${[loginEvent.cityName, loginEvent.countryName].filter(Boolean).join(", ")})` : "";
          await this.openEvent(rule, loginEvent.sourceAddress, recentFailures?.count ?? null, `${recentFailures?.count} failed ${loginEvent.channel} logins from ${loginEvent.sourceAddress}${location} in ${Math.round(windowMilliseconds / 60_000)} min; last user "${loginEvent.username}"`, now);
        }
      }
      if (rule.event === "login_new_country" && loginEvent.result === "success" && loginEvent.countryCode) {
        const earlierSuccess = this.database
          .select({ id: loginEvents.id })
          .from(loginEvents)
          .where(and(eq(loginEvents.countryCode, loginEvent.countryCode), eq(loginEvents.result, "success"), ne(loginEvents.id, loginEvent.id)))
          .get();
        if (!earlierSuccess) await this.openEvent(rule, loginEvent.countryCode, null, `Successful ${loginEvent.channel} login as "${loginEvent.username}" from ${loginEvent.countryName ?? loginEvent.countryCode} (${loginEvent.sourceAddress}) — first from this country`, now);
      }
    }
  }

  /** Service-down and exposure rules, run after each discovery pass. */
  async handleDiscoveryChanges(changes: DiscoveryChange[]): Promise<void> {
    const now = Date.now();
    const changedKeys = changes.map((change) => change.key);
    const hiddenKeys = new Set(
      changedKeys.length > 0
        ? this.database.select({ key: lobbyItems.key }).from(lobbyItems).where(and(inArray(lobbyItems.key, changedKeys), eq(lobbyItems.isHidden, true))).all().map((row) => row.key)
        : [],
    );
    for (const rule of this.readEnabledRules("event")) {
      for (const change of changes) {
        if (hiddenKeys.has(change.key)) continue;
        const { previous, current } = change;
        if (rule.event === "item_down") {
          const isDown = current.state === "exited" || current.state === "failed" || current.health === "unhealthy";
          const wasUp = previous !== null && previous.state === "running" && previous.health !== "unhealthy";
          const stateKey = `${rule.id}|${change.key}`;
          if (isDown && wasUp && !this.thresholdStates.get(stateKey)?.firingEventId) {
            await this.openEvent(rule, change.key, null, `${change.displayName} is ${current.health === "unhealthy" ? "unhealthy" : current.state}`, now);
          } else if (!isDown && this.thresholdStates.get(stateKey)?.firingEventId) {
            await this.resolveEvent(rule, change.key, `${change.displayName} is running again`, now);
          }
        }
        if (rule.event === "item_exposed") {
          const allowedPorts = new Set(String(rule.parameters.allowedPorts ?? "22").split(",").map((port) => Number(port.trim())));
          const isAllowListed = current.ports.length > 0 && current.ports.every((port) => allowedPorts.has(port.hostPort));
          const stateKey = `${rule.id}|${change.key}`;
          const isExposed = current.bindScope === "exposed" && !isAllowListed;
          if (isExposed && previous?.bindScope !== "exposed" && (previous !== null || this.hasCompletedFirstDiscovery) && !this.thresholdStates.get(stateKey)?.firingEventId) {
            const ports = current.ports.map((port) => `${port.hostAddress}:${port.hostPort}`).join(", ");
            await this.openEvent(rule, change.key, null, `${change.displayName} is listening on all interfaces (${ports})`, now);
          } else if (!isExposed && this.thresholdStates.get(stateKey)?.firingEventId) {
            await this.resolveEvent(rule, change.key, `${change.displayName} is no longer exposed`, now);
          }
        }
      }
    }
    this.hasCompletedFirstDiscovery = true;
  }

  /** Checks the Tailscale certificate nginx serves (run hourly). */
  async checkTlsCertificate(): Promise<void> {
    const certificatePath = readEnvironment("TLS_CERT_PATH") ?? "/etc/nginx/tls/ts.crt";
    if (!fileSystem.existsSync(certificatePath)) return;
    let validTo: number;
    try {
      validTo = Date.parse(new X509Certificate(fileSystem.readFileSync(certificatePath)).validTo);
    } catch {
      return;
    }
    const now = Date.now();
    for (const rule of this.readEnabledRules("event").filter((eventRule) => eventRule.event === "tls_cert_expiring")) {
      const remainingDays = (validTo - now) / 86_400_000;
      const stateKey = `${rule.id}|${certificatePath}`;
      if (remainingDays < Number(rule.parameters.days ?? 14)) {
        if (!this.thresholdStates.get(stateKey)?.firingEventId) await this.openEvent(rule, certificatePath, remainingDays, `${certificatePath} expires in ${Math.max(0, Math.floor(remainingDays))} days (the renewal timer may have failed)`, now);
      } else if (this.thresholdStates.get(stateKey)?.firingEventId) {
        await this.resolveEvent(rule, certificatePath, `${certificatePath} was renewed`, now);
      }
    }
  }

  /** Sends a test message when Settings asked for one (the web process has no outbound access). */
  async processTestRequest(): Promise<void> {
    const testRequest = readSetting<AlertTestRequest | null>(this.database, ALERT_TEST_REQUEST_KEY, null);
    const lastResult = readSetting<AlertTestResult | null>(this.database, ALERT_TEST_RESULT_KEY, null);
    if (!testRequest || lastResult?.requestId === testRequest.requestId) return;
    let errorMessage: string | null = null;
    try {
      await sendToChannel(testRequest.channel, { title: `[${this.hostname}] ServerLab test`, message: `This is a test notification from ServerLab.\n${formatServerTime(Date.now())}`, state: "resolved" });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    writeSetting(this.database, ALERT_TEST_RESULT_KEY, { requestId: testRequest.requestId, channel: testRequest.channel, isSuccessful: errorMessage === null, errorMessage, finishedAt: Date.now() } satisfies AlertTestResult);
  }
}
