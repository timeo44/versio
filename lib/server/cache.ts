/** Tiny in-memory LRU with TTL. Per server instance; good enough for a personal app. */
export class LruCache<V> {
  private map = new Map<string, { v: V; exp: number }>();
  constructor(private max = 2000, private ttlMs = 1000 * 60 * 60 * 24) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.exp < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.v;
  }

  set(key: string, v: V) {
    this.map.delete(key);
    this.map.set(key, { v, exp: Date.now() + this.ttlMs });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}
