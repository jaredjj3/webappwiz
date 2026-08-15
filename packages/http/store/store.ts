import type { Duration } from "@webappwiz/time";

export interface SetOptions {
	/** How long the entry lives. Left out, it lives until it is deleted. */
	ttl?: Duration;
}

/**
 * Somewhere to put a value under a key and find it again: a session, a cached
 * response, a rate limiter's hits. `MemoryStore` is the one that ships;
 * implement this to put the same data in Redis, a database or a cookie jar,
 * and whatever holds it changes without the code above it noticing.
 *
 * ```ts
 * const sessions: Store<string, Session> = new MemoryStore(new SystemClock());
 * await sessions.set(id, session, { ttl: Duration.hrs(24) });
 * ```
 *
 * Every method is async, since most implementations are over a network.
 */
export interface Store<K, V> {
	/** The value, or null when there is none or it has expired. */
	get(key: K): Promise<V | null>;
	set(key: K, value: V, opts?: SetOptions): Promise<void>;
	delete(key: K): Promise<void>;
}
