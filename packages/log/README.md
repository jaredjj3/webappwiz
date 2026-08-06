# @webappwiz/log

Logging behind a `Logger` interface.

```ts
import { ConsoleLogger } from "@webappwiz/log";

const log = new ConsoleLogger();
log.info("hello");
```

Loggers wrap other loggers, so behavior composes. Use `MemoryLogger` in tests
to assert on entries.
