"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cancelSecurityAction } from "@/app/actions/security-actions";
import { Badge, type BadgeTone } from "@/components/primitives/badge";
import { Card, CardHeader } from "@/components/primitives/card";
import type { SecurityActivityEntry } from "@/lib/queries/security-queries";
import { formatRelativeTime } from "@/utilities/format-date";

const STATUS_TONE: Record<SecurityActivityEntry["status"], BadgeTone> = { pending: "pending", running: "info", done: "success", failed: "danger" };
const STATUS_LABEL: Record<SecurityActivityEntry["status"], string> = { pending: "Queued", running: "Running", done: "Done", failed: "Failed" };

/**
 * Recent changes made from this page, newest first, with each command that ran and its output.
 *
 * @example
 * <SecurityActivityLog entries={overview.activity} referenceTimestamp={renderedAt} />
 */
export function SecurityActivityLog({ entries, referenceTimestamp }: { entries: readonly SecurityActivityEntry[]; referenceTimestamp: number }) {
  const router = useRouter();
  const [isCancelling, startTransition] = useTransition();
  const referenceDate = new Date(referenceTimestamp).toISOString();
  return (
    <Card className="p-5">
      <CardHeader title="Activity" description="Changes made from this page and the exact commands that ran." />
      {entries.length === 0 ? (
        <p className="mt-4 text-foreground-muted">Nothing changed from here yet.</p>
      ) : (
        <ol className="mt-4 grid gap-3" data-testid="security-activity">
          {entries.map((entry) => (
            <li key={entry.id} className="border border-line bg-surface-subtle p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[entry.status]} variant="soft">
                  {STATUS_LABEL[entry.status]}
                </Badge>
                <span className="min-w-0 flex-1 break-words text-foreground">{entry.summary}</span>
                <span className="text-xs text-foreground-subtle">{formatRelativeTime(new Date(entry.requestedAt).toISOString(), referenceDate)}</span>
                {entry.status === "pending" && (
                  <button type="button" disabled={isCancelling} className="cursor-pointer text-xs text-foreground-muted underline hover:text-brand" onClick={() => startTransition(async () => (await cancelSecurityAction(entry.id), router.refresh()))}>
                    Cancel
                  </button>
                )}
              </div>
              {entry.result?.errorMessage && <p className="mt-2 text-xs text-danger">{entry.result.errorMessage}</p>}
              {entry.result && entry.result.steps.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-foreground-muted">Commands and output</summary>
                  <div className="mt-2 grid gap-2">
                    {entry.result.steps.map((step, index) => (
                      <div key={`${entry.id}-${index}`} className="overflow-x-auto bg-field p-2">
                        <div className="whitespace-pre text-foreground">
                          <span className="mr-2 text-brand select-none">$</span>
                          {step.commandLine}
                          <span className="ml-2 text-foreground-faint">exit {step.exitCode ?? "–"}</span>
                        </div>
                        {step.output && <pre className="mt-1 whitespace-pre-wrap text-foreground-muted">{step.output}</pre>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
