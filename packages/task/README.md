# @webappwiz/task

Somewhere to say "this needs doing again" without saying when.

```ts
import { ConflatedTaskQueue } from "@webappwiz/task";

const queue = new ConflatedTaskQueue(() => save(document));
editor.on("change", () => queue.trigger());
```

`TaskQueue` is the seam. Each implementation decides how a burst of triggers
becomes runs of the task, so the code doing the triggering never has to know:

- `ConflatedTaskQueue` collapses triggers arriving during a run into one rerun,
  so work asked for a hundred times happens twice, now and once more with the
  latest state.
- `DebouncedTaskQueue` waits for the triggers to stop, then runs once. It reads
  as busy from the first trigger rather than from when the task starts, so a
  spinner comes up while the debouncer is still waiting.
- `ThrottledTaskQueue` runs on the first trigger and then at most once per
  interval, so a long burst keeps producing results rather than going quiet
  until it ends.

The last two take the `Debouncer` and `Throttler` of `@webappwiz/time`, which
are the same choice one level down, over a plain function.

```ts
import { DebouncedTaskQueue } from "@webappwiz/task";
import { Debouncer, Duration, SystemTimer } from "@webappwiz/time";

const queue = new DebouncedTaskQueue(
	new Debouncer(new SystemTimer(), Duration.ms(300)),
	() => search(input.value),
);
```

Every queue raises `change` when it goes busy or idle, which is what a progress
indicator wants to listen to.

## In a browser

```ts
import { RafTaskQueue } from "@webappwiz/task/browser";

const queue = new RafTaskQueue(clock, () => redraw());
element.addEventListener("pointermove", () => queue.trigger());
```

Runs the task on an animation frame, so work triggered by a stream of events
happens once per frame at most and lands when the browser is about to paint
anyway. It is behind its own entry point because it reaches for
`requestAnimationFrame`, which a server does not have.

How it asks for a frame is the `raf` of `@webappwiz/browser` unless you say
otherwise, so a test can hand over frames of its own and drive them without a
DOM:

```ts
const queue = new RafTaskQueue(clock, task, { raf: frames.request });
```
