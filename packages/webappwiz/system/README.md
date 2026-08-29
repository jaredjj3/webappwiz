# webappwiz/system

Interfaces for the things that touch the machine, so code under test doesn't
have to: `Fs` (filesystem), `Ps` (processes), `IpProvider`/`HostMapper`
(loopback IPs and hostname mapping), `PortProvider` (ports), plus `Lock`,
built on those seams.

```ts
import { NodeFs, NodePs } from "webappwiz/system";

const fs = new NodeFs();
const ps = new NodePs();

await fs.write("/tmp/x", "hi");
await ps.spawn(["echo", "hi"]);
```

In tests, swap in the fakes:

```ts
import { FakeFs, FakePs } from "webappwiz/system/testing";
```

A `Lock` is a mutex (`acquire`, `release`, `releaseIfOurs`). `acquire` blocks
until the lock is free, so there is no "busy" answer to ignore.

Every dependency here is optional and lives in the options object, defaulting
to the real implementation, so a caller with nothing to swap in passes nothing
and a test passes its fakes by name:
`new FileLock(path, { fs: new FakeFs() })`.

```ts
const lock = new FileLock("/path/to/some.lock");

await lock.acquire();
try {
	// ...
} finally {
	await lock.release();
}
```

`FileLock` holds the lock as a directory, so it works between processes:
`mkdir` is atomic everywhere, so there is no check-then-write window. A holder
that died is detected and its lock stolen, and the directory is removed on
signals and uncaught exceptions.

`MemoryLock` holds nothing but itself, so it only serializes callers inside one
process that share the instance. Waiters are served in the order they arrived.

A `PortProvider` answers which port to listen on, and `get()` takes nothing:
which ports it will consider is settled when it is made, so a server keeps a
predictable URL when it can and still starts when something already holds that
port.

```ts
// 4269 if it is open, else the next open port up to 4288
const port = await OpenPortProvider.span({ from: 4269, span: 20 }).get();

// exactly 5432, or a throw
const pg = await new OpenPortProvider({ from: 5432 }).get();

// 0, meaning whatever binds it chooses
const any = await OpenPortProvider.any().get();
```

A range that covers no ports, or reaches past 65535, throws when the provider
is made rather than when it is asked, so a bad one never reaches a caller.

`OpenPortProvider` binds each candidate and lets it go again, so the answer is
open at the moment it is given rather than when the caller acts on it. A caller
that cannot afford to lose that race should retry its own bind on `EADDRINUSE`
instead.
