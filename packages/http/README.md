# @webappwiz/http

Serving HTTP, and the parts of doing so that every app writes again.

## The server

```ts
import { BunHttpServer } from "@webappwiz/http";
import { Duration } from "@webappwiz/time";

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
import { RateLimiter } from "@webappwiz/http";
import { MemoryStore } from "@webappwiz/store";
import { Duration, SystemClock } from "@webappwiz/time";

const clock = new SystemClock();
const limiter = new RateLimiter(new MemoryStore(clock), clock);

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
limiter can do. `MemoryStore` is per process, so two instances of the app each
allow the full quota; a shared `Store` makes the limit the whole app's.

The client is taken from `X-Forwarded-For` by default, first entry only, since
a proxy appends to that header and the original client is at the front. Pass
`clientIpHeaders` for a host that uses its own (`cf-connecting-ip`,
`fly-client-ip`). A request arriving with none of them is let through: that is
the norm locally and in tests, and there is nothing to key on.

Keying on the address alone is deliberate. Adding the session would let an
attacker rotate cookies for a fresh budget, and an address cannot be dodged that
way.
