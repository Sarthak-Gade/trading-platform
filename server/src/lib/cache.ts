interface Entry<T> {
  value: T;
  at: number;
}

const stores = new Map<string, Map<string, Entry<unknown>>>();
const inflight = new Map<string, Promise<unknown>>();

// Returns a fresh cached value, or loads one. Simultaneous callers share one load.
// If loading fails and an older value exists, that value is returned with stale: true.
export async function cached<T>(
  namespace: string,
  key: string,
  ttlMs: number,
  load: () => Promise<T>
): Promise<{ value: T; stale: boolean }> {
  let store = stores.get(namespace);
  if (!store) {
    store = new Map();
    stores.set(namespace, store);
  }

  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return { value: hit.value, stale: false };

  const flightKey = `${namespace}|${key}`;
  let flight = inflight.get(flightKey) as Promise<T> | undefined;
  if (!flight) {
    flight = load().finally(() => inflight.delete(flightKey));
    inflight.set(flightKey, flight);
  }

  try {
    const value = await flight;
    store.set(key, { value, at: Date.now() });
    return { value, stale: false };
  } catch (err) {
    if (hit) return { value: hit.value, stale: true };
    throw err;
  }
}