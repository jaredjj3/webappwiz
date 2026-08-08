# @webappwiz/time

Time as a seam, in terms every runtime already provides: `Duration` (a length of
time, so no call site has to ask "millis or seconds?"), `Clock` (a source of
now), and `Timer` (future work). Nothing here imports `node:` or `Bun` — the
implementations use `performance` and `setTimeout`, which are globals in Node,
Bun, Deno, workers and browsers alike.

```ts
import { Duration, sleep, SystemClock, SystemTimer } from "@webappwiz/time";

await sleep(Duration.secs(2));

const clock = new SystemClock();
const started = clock.now();
const elapsed = clock.now().subtract(started);

const timer = new SystemTimer();
const poll = timer.setInterval(() => check(), Duration.secs(5));
poll.dispose(); // cancelling is just releasing a resource
```

In tests, swap in the fakes so nothing waits on real time:

```ts
import { FakeClock, FakeTimer } from "@webappwiz/time/testing";

const clock = new FakeClock();
clock.advance(Duration.mins(3));

const timer = new FakeTimer();
timer.fireTimeouts();
timer.fireIntervals();
```
