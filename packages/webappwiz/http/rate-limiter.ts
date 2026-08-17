import { type Clock, Duration } from "webappwiz/time";
import { MemoryStore } from "./store/memory-store";
import type { Store } from "./store/store";

export interface RateLimit {
	/** How many requests are allowed within the window. */
	max: number;
	window: Duration;
}

export interface RateLimiterOptions {
	/**
	 * Headers to read the client's address from, in order of preference. The
	 * first one present wins, and only its first comma-separated entry is used,
	 * since a proxy appends to these and the original client is at the front.
	 * Defaults to `["x-forwarded-for"]`.
	 */
	clientIpHeaders?: string[];
	/**
	 * Where the hits are kept. Defaults to a `MemoryStore`, which limits each
	 * process on its own; pass a shared one to make the limit the whole app's.
	 */
	store?: Store<string, number[]>;
}

/**
 * Caps how often one client may do something. Each request records a hit and
 * says how long to wait if that hit put the client over.
 *
 * ```ts
 * const limiter = new RateLimiter(clock);
 *
 * const retryAfter = await limiter.hit(request, "signup", {
 *   max: 10,
 *   window: Duration.mins(1),
 * });
 * if (retryAfter !== null) {
 *   return limiter.tooManyRequests(retryAfter);
 * }
 * ```
 *
 * The window slides: the store keeps the timestamps of the hits still inside
 * it, so a client cannot spend a whole window's worth of requests either side
 * of a boundary the way a plain counter would allow.
 *
 * The `scope` gives each action its own budget, so a strict one does not eat
 * into the allowance of everything else.
 *
 * The hits live in a `MemoryStore` unless `opts.store` says otherwise, so an
 * app spread over several processes hands in a `Store` of its own that they
 * all share.
 */
export class RateLimiter {
	private readonly clientIpHeaders: string[];
	private readonly store: Store<string, number[]>;

	constructor(
		private readonly clock: Clock,
		opts: RateLimiterOptions = {},
	) {
		this.clientIpHeaders = opts.clientIpHeaders ?? ["x-forwarded-for"];
		this.store = opts.store ?? new MemoryStore(clock);
	}

	/**
	 * Records a hit, returning how long to wait before trying again, or null if
	 * the client is within the limit.
	 */
	async hit(
		request: Request,
		scope: string,
		limit: RateLimit,
	): Promise<Duration | null> {
		const address = this.clientIp(request);
		// Nothing to key on, which in production cannot happen because the proxy
		// always sets the header. Locally and in tests it is the norm, and
		// throttling a request with no identity would throttle all of them
		// together.
		if (address === null) {
			return null;
		}

		const key = `${scope}:${address}`;
		const now = this.clock.now();
		const hits = ((await this.store.get(key)) ?? []).filter((at) =>
			now.subtract(Duration.ms(at)).isLessThan(limit.window),
		);

		if (hits.length >= limit.max) {
			const oldest = Duration.ms(hits[0] ?? now.ms);
			return limit.window.subtract(now.subtract(oldest));
		}

		hits.push(now.ms);
		// The entry is worthless once its newest hit ages out, so it expires
		// itself rather than waiting for someone to read the key again.
		await this.store.set(key, hits, { ttl: limit.window });
		return null;
	}

	/** The 429 to answer a caller that `hit` turned down. */
	tooManyRequests(retryAfter: Duration): Response {
		return new Response("Too many requests", {
			status: 429,
			headers: {
				"Retry-After": String(Math.max(1, Math.ceil(retryAfter.secs))),
			},
		});
	}

	private clientIp(request: Request): string | null {
		for (const header of this.clientIpHeaders) {
			const value = request.headers.get(header);
			const first = value?.split(",")[0]?.trim();
			if (first) {
				return first;
			}
		}
		return null;
	}
}
