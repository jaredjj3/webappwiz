import type { Clock, Duration } from "@webappwiz/time";
import type { SetOptions, Store } from "./store";

type Entry<V> = { value: V; expires: Duration | null };

/**
 * A `Store` in a `Map`, for a single process. Everything in it is lost when
 * that process ends, and a second instance of the app has its own copy, so
 * reach for a shared implementation once either of those matters.
 */
export class MemoryStore<K, V> implements Store<K, V> {
	private readonly entries = new Map<K, Entry<V>>();
	private sinceSweep = 0;

	constructor(private readonly clock: Clock) {}

	get(key: K): Promise<V | null> {
		const entry = this.entries.get(key);
		if (entry === undefined) {
			return Promise.resolve(null);
		}
		if (this.hasExpired(entry)) {
			this.entries.delete(key);
			return Promise.resolve(null);
		}
		return Promise.resolve(entry.value);
	}

	set(key: K, value: V, opts: SetOptions = {}): Promise<void> {
		const ttl = opts.ttl;
		this.entries.set(key, {
			value,
			expires: ttl === undefined ? null : this.clock.now().add(ttl),
		});
		// Expired entries are only noticed when their own key is read, so a
		// store written under many keys and read under few would hold them all
		// forever. Sweeping on write keeps that bounded without a timer, which
		// would otherwise keep the process alive.
		if (++this.sinceSweep >= 500) {
			this.sinceSweep = 0;
			this.sweep();
		}
		return Promise.resolve();
	}

	delete(key: K): Promise<void> {
		this.entries.delete(key);
		return Promise.resolve();
	}

	/** How many entries are held, expired ones included. */
	get size(): number {
		return this.entries.size;
	}

	private sweep(): void {
		for (const [key, entry] of this.entries) {
			if (this.hasExpired(entry)) {
				this.entries.delete(key);
			}
		}
	}

	private hasExpired(entry: Entry<V>): boolean {
		return (
			entry.expires !== null && !this.clock.now().isLessThan(entry.expires)
		);
	}
}
