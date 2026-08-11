# @webappwiz/sys

Interfaces for the things that touch the machine, so code under test doesn't
have to: `Fs` (filesystem), `Ps` (processes), `IpProvider`/`HostMapper`
(loopback IPs and hostname mapping), plus `FileLock`, built on those seams.

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

`Lock` is a mutex between processes: `acquire`, `release`, `releaseIfOurs`.
`FileLock` is the implementation, held by a directory: `mkdir` is
atomic everywhere, so there is no check-then-write window. `acquire` blocks
until the lock is free, a holder that died is detected and its lock stolen,
and the directory is removed on signals and uncaught exceptions.

```ts
const lock = new FileLock(fs, ps, log, "/path/to/some.lock");

await lock.acquire();
try {
	// ...
} finally {
	await lock.release();
}
```
