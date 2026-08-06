# @webappwiz/sys

Interfaces for the things that touch the machine, so code under test doesn't
have to: `Fs` (filesystem), `Ps` (processes), `IpProvider`/`HostMapper`
(loopback IPs and hostname mapping).

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
