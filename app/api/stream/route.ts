import { SESSION_COOKIE_NAME, validateSession } from "@/lib/authentication/session-store";
import { getDatabase } from "@/lib/database/client";
import type { LiveTopic, LiveTopicPayloads } from "@/lib/queries/live-types";
import { readAlertEventChanges, readLatestAlertEventId, readLatestAppUsageBatch, readLatestLoginEventId, readLoginEventsAfterId } from "@/lib/queries/stream-queries";
import { readLatestSampleId, readLiveStatus, readSystemSamplesAfterId } from "@/lib/queries/system-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MILLISECONDS = 1000;
const STATUS_INTERVAL_MILLISECONDS = 5000;
const HEARTBEAT_INTERVAL_MILLISECONDS = 15_000;
const ALL_TOPICS: readonly LiveTopic[] = ["system", "apps", "logins", "alerts", "status"];

/**
 * Server-Sent Events: polls SQLite every second for rows newer than what this connection has
 * sent and pushes them as `event: <topic>`. `?topics=system,apps` limits the topics.
 */
export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionToken = cookieHeader.split(/;\s*/).find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))?.slice(SESSION_COOKIE_NAME.length + 1);
  const database = getDatabase();
  if (!sessionToken || !validateSession(database, decodeURIComponent(sessionToken))) return new Response("Unauthorized", { status: 401 });

  const requestedTopics = new URL(request.url).searchParams.get("topics")?.split(",") ?? ALL_TOPICS;
  const topics = new Set(ALL_TOPICS.filter((topic) => requestedTopics.includes(topic)));
  const encoder = new TextEncoder();
  let lastSampleId = readLatestSampleId(database);
  let lastAppTimestamp = readLatestAppUsageBatch(database)?.timestamp ?? 0;
  let lastLoginId = readLatestLoginEventId(database);
  let lastAlertId = readLatestAlertEventId(database);
  let lastAlertPoll = Date.now();
  let lastStatusAt = 0;
  let lastHeartbeatAt = Date.now();
  let pollInterval: NodeJS.Timeout | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = <Topic extends LiveTopic>(topic: Topic, payload: LiveTopicPayloads[Topic]) => controller.enqueue(encoder.encode(`event: ${topic}\ndata: ${JSON.stringify(payload)}\n\n`));
      const close = () => {
        clearInterval(pollInterval);
        try {
          controller.close();
        } catch {
          /* Already closed. */
        }
      };
      const poll = () => {
        try {
          const now = Date.now();
          if (topics.has("system")) {
            for (const sample of readSystemSamplesAfterId(database, lastSampleId)) {
              send("system", sample);
              lastSampleId = sample.id;
            }
          }
          if (topics.has("apps")) {
            const batch = readLatestAppUsageBatch(database, lastAppTimestamp);
            if (batch) {
              send("apps", batch);
              lastAppTimestamp = batch.timestamp;
            }
          }
          if (topics.has("logins")) {
            for (const loginEvent of readLoginEventsAfterId(database, lastLoginId)) {
              send("logins", loginEvent);
              lastLoginId = loginEvent.id;
            }
          }
          if (topics.has("alerts")) {
            for (const alertEvent of readAlertEventChanges(database, lastAlertId, lastAlertPoll)) {
              send("alerts", alertEvent);
              lastAlertId = Math.max(lastAlertId, alertEvent.id);
            }
            lastAlertPoll = now;
          }
          if (topics.has("status") && now - lastStatusAt >= STATUS_INTERVAL_MILLISECONDS) {
            send("status", readLiveStatus(database));
            lastStatusAt = now;
          }
          if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MILLISECONDS) {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
            lastHeartbeatAt = now;
          }
        } catch {
          close();
        }
      };
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      poll();
      pollInterval = setInterval(poll, POLL_INTERVAL_MILLISECONDS);
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      clearInterval(pollInterval);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
