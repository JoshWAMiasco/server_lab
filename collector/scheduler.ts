/**
 * Runs `task` every `intervalMilliseconds`, never overlapping: the next run is scheduled after the
 * previous one finishes. Errors are logged and the loop keeps going.
 */
export function runEvery(taskName: string, intervalMilliseconds: number, task: () => Promise<void> | void, { runImmediately = true } = {}): () => void {
  let isStopped = false;
  let timeout: NodeJS.Timeout | undefined;
  const runOnce = async () => {
    const startedAt = Date.now();
    try {
      await task();
    } catch (error) {
      console.error(`[collector] ${taskName} failed:`, error instanceof Error ? error.message : error);
    }
    if (isStopped) return;
    timeout = setTimeout(runOnce, Math.max(0, intervalMilliseconds - (Date.now() - startedAt)));
  };
  timeout = setTimeout(runOnce, runImmediately ? 0 : intervalMilliseconds);
  return () => {
    isStopped = true;
    clearTimeout(timeout);
  };
}
