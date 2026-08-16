import type { Clock, Duration } from "@webappwiz/time";

/** A frame that has been asked for: awaitable, and cancellable until it runs. */
export interface Frame {
	/** Resolves once the callback has run, or once the frame is cancelled. */
	promise: Promise<void>;
	/** Gives up the frame. Does nothing once the callback has started. */
	cancel(): void;
}

/**
 * Runs `callback` on the next animation frame, handing it how long it waited.
 *
 * ```ts
 * const frame = raf(clock, (dt) => advance(dt));
 * await frame.promise;
 * ```
 */
// rule-ignore objects-over-callbacks: the work to run on the frame, which is what requestAnimationFrame itself takes
export function raf(
	clock: Clock,
	callback: (dt: Duration) => void | Promise<void>,
): Frame {
	const started = clock.now();
	let resolve!: () => void;
	const promise = new Promise<void>((settle) => {
		resolve = settle;
	});

	let id: number | null = requestAnimationFrame(() => {
		id = null;
		const result = callback(clock.now().subtract(started));
		if (result === undefined) {
			resolve();
			return;
		}
		void result.then(resolve);
	});

	return {
		promise,
		cancel: () => {
			if (id === null) {
				return;
			}
			cancelAnimationFrame(id);
			id = null;
			resolve();
		},
	};
}
