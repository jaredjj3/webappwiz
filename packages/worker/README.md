# @webappwiz/worker

Work sent somewhere else and answered, behind an interface, with the awkward
parts (a worker that dies, one that never replies) handled by wrappers rather
than by the code that wanted the work done.

```ts
import { Worker } from "@webappwiz/worker";

const result = await worker.send(job);
```

`Worker<Input, Output>` says what goes in and what comes back. Where it runs is
the implementation's business, so a test hands over a `FakeWorker` and never
starts a thread.

## Stacking

Each wrapper is a `Worker` around a `Worker`, so they compose in whatever order
suits.

```ts
import {
	RetryingWorker,
	TimeoutWorker,
	WebWorkerFactory,
} from "@webappwiz/worker";
import { UuidProvider } from "@webappwiz/util";

const factory = new WebWorkerFactory<Job, Result>(
	TranscodeWorker,
	new UuidProvider(),
	timer,
);

const worker = new TimeoutWorker(
	new RetryingWorker(factory, { retries: 2 }),
	timer,
	Duration.secs(30),
);
```

`RetryingWorker` builds its worker on the first `send`, and when one fails it
throws it away and builds another: a dead worker stays dead, so replacing it is
the only recovery there is. `TimeoutWorker` bounds how long a caller waits.
Neither cancels the work itself, because nothing can.

## The browser implementation

`WebWorker` runs a real Web Worker, and needs a worker module that calls
`workerScript`:

```ts
// transcode.worker.ts
import { workerScript } from "@webappwiz/worker/script";

workerScript<Job, Result>(async (job) => transcode(job));
```

Two things make the pairing worth the protocol. The worker acknowledges every
message before starting on it, so a slow worker is distinguishable from one
that never heard, and `send` fails fast instead of hanging. And the worker holds
a Web Lock for as long as it lives, so the page is granted that lock the moment
the worker ends however it ended, which is the only notice you get of a worker
that dies without an error event.

That lock is why `WebWorker` is browser-only, even though `Worker`,
`TimeoutWorker`, `RetryingWorker` and `FakeWorker` are not.
