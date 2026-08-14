# @webappwiz/util

The grab bag: small things with no better home. Nothing here imports `node:` or
touches the DOM, so it loads on a server and in a browser alike.

Something belongs in this package only when it has no better home. A grab bag
is where junk hides, and the rule is what stops that.

## Assertions

`assert` narrows a type, `ensure` hands the value back, so the same check works
as a statement or in an expression.

```ts
import { assert, ensure } from "@webappwiz/util";

assert.present(user, "no user on the session");
user.name; // narrowed

const port = ensure.integer(raw, "PORT must be a whole number");
```

Both throw `AssertError`. `assert.unreachable()` states that control cannot get
here, which is what the default of an exhaustive switch wants.

## Class names

```ts
import { cx } from "@webappwiz/util";

cx("btn", isPrimary && "btn-primary", { "btn-lg": size === "lg" });
```

Strings, numbers, nested arrays and objects with truthy keys. Everything falsy
is dropped, so a `count && "badge"` guard contributes nothing rather than the
class name `0`.

## Deadlines and cancellation

```ts
import { aborts, timeouts } from "@webappwiz/util";

const body = await aborts.race(signal, response.json());
const inTime = await timeouts.race(timer, work, Duration.secs(5));
```

Neither cancels the work, because a promise cannot be cancelled. They decide
how long the caller waits.

## Pacing work

`Debouncer` waits for a burst to end and runs once. `Throttler` runs
immediately, then at most once per interval, so something keeps happening
throughout.

```ts
import { Debouncer, Throttler } from "@webappwiz/util";

const debouncer = new Debouncer(new SystemTimer(), Duration.ms(300));
input.addEventListener("input", () => debouncer.call(() => search(input.value)));
```

`@webappwiz/task` is the same idea one level up: somewhere to say "this needs
doing again" without saying when. Its queues take a `Debouncer` or a
`Throttler` to decide how a burst of triggers becomes runs.

## Ids

```ts
import { CounterIdProvider, UuidProvider } from "@webappwiz/util";

const ids = new UuidProvider();
```

A seam, so code that has to name something does not decide how. Swap in
`CounterIdProvider` and a test can say which id it expects.
