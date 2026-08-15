# @webappwiz/react

Wiring React to the rest of webappwiz, and nothing else. Anything that would
work without React lives in `@webappwiz/browser`, and this
package stays small on purpose.

## Owning a resource for a mount

```ts
import { useResource, useDisposerEffect } from "@webappwiz/react";

const parser = useResource(() => new Parser(source));

useDisposerEffect((disposer) => {
	disposer.use(new WindowBackgroundObserver());
}, []);
```

`useResource` builds a `Resource` during render and disposes it on unmount,
or when the factory changes. Its factory must be render-pure: React can abandon
a render before commit, and anything acquired there would never be disposed.
Acquire timers, subscriptions and workers in `useDisposerEffect` instead, which
runs after commit and disposes everything it registered on teardown.

## Rendering something that raises events

```ts
import { useReactive } from "@webappwiz/react";

const title = useReactive(player, (player) => player.title(), ["change"]);
```

`useReactive` reads a projection of an `Eventful` and re-renders when the named
events change what it returns. The projection is compared shallowly, so an
event that changes nothing the component reads does not re-render it.

`useExternalStore` and `ReactiveExternalStore` are the layer underneath, for
when a store is wanted directly.

The source is captured on the first render, so pass a stable one: a controller
or a singleton, not an object built during render. Remount with a `key` if it
has to change.
