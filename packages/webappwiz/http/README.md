# webappwiz/http

Serving HTTP, and the parts of doing so that every app writes again.

## The server

```ts
import { BunHttpServer } from "webappwiz/http";
import { Duration } from "webappwiz/time";

const listening = await new BunHttpServer().serve(handler, {
	port: 0, // whatever is free; read it back from listening.port
	idleTimeout: Duration.secs(30),
});
await listening.stop();
```

`HttpServer` is the seam that binds a port. What it serves is a plain `fetch`
handler, the shape every fetch-style runtime already takes, so a handler
written against this runs unchanged on whatever ends up listening for it.

## Rate limiting

```ts
import { RateLimiter } from "webappwiz/http";
import { Duration, SystemClock } from "webappwiz/time";

const limiter = new RateLimiter(new SystemClock());

const retryAfter = await limiter.hit(request, "signup", {
	max: 10,
	window: Duration.mins(1),
});
if (retryAfter !== null) {
	return limiter.tooManyRequests(retryAfter);
}
```

The window slides: the store keeps the timestamps of the hits still inside it,
so a client cannot spend a whole window's worth of requests either side of a
boundary the way a plain counter would allow.

The scope (`"signup"` above) gives each action its own budget, so a strict limit
on one does not eat into the allowance of everything else.

Where the hits are kept is the caller's choice, because it decides what the
limiter can do. The default `MemoryStore` is per process, so two instances of
the app each allow the full quota; a shared `Store` makes the limit the whole
app's.

```ts
const limiter = new RateLimiter(clock, { store: new RedisStore(redis) });
```

Nothing has to be cleaned up. Each client's entry is written with the window as
its `ttl`, so it goes when its newest hit ages out, and the entry itself holds
at most `max` timestamps. A `Store` that ignores `ttl` is the one case where
this grows without limit: the store is what expires entries, not the limiter.

The client is taken from `X-Forwarded-For` by default, first entry only, since
a proxy appends to that header and the original client is at the front. Pass
`clientIpHeaders` for a host that uses its own (`cf-connecting-ip`,
`fly-client-ip`). A request arriving with none of them is let through: that is
the norm locally and in tests, and there is nothing to key on.

Keying on the address alone is deliberate. Adding the session would let an
attacker rotate cookies for a fresh budget, and an address cannot be dodged that
way.

## Stores

`Store` is somewhere to put a value under a key and find it again: the
limiter's hits, and a session or a cached response if you have one. `MemoryStore`
is only the implementation that ships. Write your own to put the same data in
Redis, a database or a cookie jar, and whatever holds it changes without the
code above it noticing.

```ts
import type { SetOptions, Store } from "webappwiz/http";

export class RedisStore<V> implements Store<string, V> {
	async get(key: string): Promise<V | null> { ... }
	async set(key: string, value: V, opts?: SetOptions): Promise<void> { ... }
	async delete(key: string): Promise<void> { ... }
}
```

Every method is async, because most implementations are over a network. The
in-memory one still returns promises rather than pretending otherwise, so
swapping it out later changes nothing at the call site.

`MemoryStore` holds everything in one process, so it is lost on restart and a
second instance of the app has its own copy. It expires entries on read and
sweeps every 500 writes, rather than running a timer that would keep the
process alive.
