# @webappwiz/store

Somewhere to put a value under a key and find it again: a session, a cached
response, a rate limiter's hits.

```ts
import { MemoryStore, type Store } from "@webappwiz/store";
import { Duration, SystemClock } from "@webappwiz/time";

const sessions: Store<string, Session> = new MemoryStore(new SystemClock());

await sessions.set(id, session, { ttl: Duration.hrs(24) });
await sessions.get(id); // the session, or null once the day is up
```

`Store` is an interface, and `MemoryStore` is only the implementation that
ships. Write your own to put the same data in Redis, a database or a cookie
jar, and the code above it does not notice.

```ts
export class RedisStore<V> implements Store<string, V> {
	async get(key: string): Promise<V | null> { ... }
	async set(key: string, value: V, opts?: SetOptions): Promise<void> { ... }
	async delete(key: string): Promise<void> { ... }
}
```

Every method is async, because most implementations are over a network. The
in-memory one still returns promises rather than pretending otherwise, so
swapping it in later changes nothing at the call site.

`MemoryStore` holds everything in one process, so it is lost on restart and a
second instance of the app has its own copy. It expires entries on read and
sweeps every 500 writes, rather than running a timer that would keep the
process alive.
