let bumper = 0;
const subscribers = new Set<() => void>();

export function refreshCatalog() {
  bumper += 1;
  for (const fn of subscribers) fn();
}

export function subscribeCatalog(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function catalogTick(): number {
  return bumper;
}
