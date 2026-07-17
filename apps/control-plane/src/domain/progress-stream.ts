export const MAX_PROGRESS_STREAM_CONNECTIONS = 100;

let activeConnections = 0;

export function acquireProgressStream(): (() => void) | null {
  if (activeConnections >= MAX_PROGRESS_STREAM_CONNECTIONS) return null;
  activeConnections += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeConnections -= 1;
  };
}

export function startSingleFlightPolling(
  poll: () => Promise<void>,
  onError: (error: unknown) => void,
  intervalMs = 1_000,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    try {
      await poll();
    } catch (error) {
      stopped = true;
      onError(error);
      return;
    }
    if (!stopped) timer = setTimeout(() => void run(), intervalMs);
  };
  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
