# @webappwiz/browser

The browser platform behind interfaces, so what a page does about scrolling,
visibility, gestures and frames is not scattered through the UI code that
happens to need it. Nothing here is tied to a UI library.

## Device

```ts
import { Device } from "@webappwiz/browser";

const device = Device.parse(navigator.userAgent, {
	touchPoints: navigator.maxTouchPoints,
});
device.isIos; // true on an iPhone, and on an iPad claiming to be a Mac
device.browser; // "safari" | "chrome" | "firefox" | "edge" | "unknown"
```

It takes the string rather than reading `navigator`, so the same call works on
the server against a request header. It answers os, browser and touch, and
nothing else: versions, device models and bot detection need a maintained
database of user agents, which this is not.

## Scroll

```ts
import { Scroll } from "@webappwiz/browser";

collapse.open();
Scroll.reveal(() => panel, { bottomInset: footerHeight });
```

Waits for layout, leaves the page alone when the target is already visible, and
honours `prefers-reduced-motion`. A burst of calls settles on one scroll rather
than fighting over the page.

"Visible" means visible, not merely inside the viewport: a scrollable ancestor
clips its children, so a target past that fold counts as off screen even when
the viewport says otherwise.

## Frames

```ts
import { AnimationLoop, RafTaskQueue, raf } from "@webappwiz/browser";

const loop = new AnimationLoop(clock);
loop.events.on("frame", ({ dt }) => cursor.advance(dt));
loop.start();

const queue = new RafTaskQueue(clock, () => redraw());
element.addEventListener("pointermove", () => queue.trigger());
```

`raf` is one frame, awaitable and cancellable. `AnimationLoop` keeps asking for
the next one. `RafTaskQueue` is the `TaskQueue` of `@webappwiz/util` paced by
frames, so work triggered by a stream of events happens once per frame at most.

## Observers

```ts
import {
	WindowBackgroundObserver,
	WindowUserActivationObserver,
} from "@webappwiz/browser";

const background = new WindowBackgroundObserver();
background.events.on("change", () => {
	background.isBackgrounded() ? poll.stop() : poll.start();
});

const activation = new WindowUserActivationObserver(timer);
await activation.wait(); // the gesture browsers demand before audio starts
```

A page counts as backgrounded when it is not visible or does not have focus.
Visibility alone misses a switch between desktop windows, and focus alone misses
a mobile app switch that fires `visibilitychange` without a blur.

Transient user activation expires on a timer of the browser's choosing with no
event to say so, so the observer polls while it holds and stops once it lapses.

## Downloads

```ts
import { download } from "@webappwiz/browser";

const url = URL.createObjectURL(blob);
download(url, "export.csv");
URL.revokeObjectURL(url);
```

## Testing

`@webappwiz/browser/dom` puts happy-dom on `globalThis`, for tests of anything
that needs a document. Import it for its side effect.

```ts
import "@webappwiz/browser/dom";
```

It hands back the runtime's `fetch`, `Request` and `Response` afterwards:
happy-dom's are not the ones `Bun.serve` recognises, and every test file sharing
the process would otherwise lose its HTTP.
