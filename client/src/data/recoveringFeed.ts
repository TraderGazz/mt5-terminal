interface FeedOptions<T> {
  fetchSnapshot: () => Promise<T>;
  subscribe: (receive: (data: T) => void) => () => void;
  receive: (data: T) => void;
  setError: (failed: boolean) => void;
  ready: () => void;
  retryMs?: number;
}

/** Retry failed initial REST snapshots without relying on a working WS channel.
 * WS data supersedes in-flight REST responses, including older failures.
 * Nothing is substituted for missing server data.
 */
export function startRecoveringFeed<T>(options: FeedOptions<T>): () => void {
  let stopped = false;
  let inFlight = false;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clearRetry = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const receive = (data: T) => {
    if (stopped) return;
    revision++;
    clearRetry();
    options.receive(data);
    options.setError(false);
    options.ready();
  };
  const refresh = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    const startedAt = revision;
    try {
      const data = await options.fetchSnapshot();
      if (!stopped && revision === startedAt) receive(data);
    } catch {
      if (!stopped && revision === startedAt) {
        options.setError(true);
        options.ready();
        clearRetry();
        timer = setTimeout(() => { timer = undefined; void refresh(); }, options.retryMs ?? 5000);
      }
    } finally {
      inFlight = false;
    }
  };
  const unsubscribe = options.subscribe(receive);
  void refresh();
  return () => { stopped = true; clearRetry(); unsubscribe(); };
}
