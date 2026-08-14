# @webappwiz/sys

Interfaces for the things that touch the machine, so code under test doesn't
have to: `Fs` (filesystem), `Ps` (processes), `IpProvider`/`HostMapper`
(loopback IPs and hostname mapping), plus `Lock`, built on those seams.

```ts
import { NodeFs, NodePs } from "@webappwiz/sys";

const fs = new NodeFs();
const ps = new NodePs();

await fs.write("/tmp/x", "hi");
await ps.spawn(["echo", "hi"]);
```

In tests, swap in the fakes:

```ts
import { FakeFs, FakePs } from "@webappwiz/sys/testing";
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
