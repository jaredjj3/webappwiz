import { type Frame, raf } from "@webappwiz/browser";
import { Disposer, type Resource } from "@webappwiz/disposable";
import type { Clock } from "@webappwiz/time";
import { ConflatedTaskQueue } from "./conflated-task-queue";
import type { Task, TaskQueue, TaskQueueState } from "./task-queue";

/** How a frame is asked for. `raf` is the one that asks the browser. */
export type Raf = typeof raf;

/** What a `RafTaskQueue` asks for its frames through; the real one by default. */
export interface RafTaskQueueOptions {
	raf?: Raf;
}

/**
 * A `TaskQueue` that runs its task on an animation frame, so work triggered by
 * a stream of events happens once per frame at most and lands when the browser
 * is about to paint anyway.
 *
 * ```ts
 * const queue = new RafTaskQueue(clock, () => redraw());
 * element.addEventListener("pointermove", () => queue.trigger());
 * ```
 */
export class RafTaskQueue implements TaskQueue, Resource {
	private readonly disposer = new Disposer();
	private readonly queue: TaskQueue;
	private readonly frames: Raf;
	private frame: Frame | null = null;

	constructor(
		private readonly clock: Clock,
		private readonly task: Task,
		opts: RafTaskQueueOptions = {},
	) {
		this.frames = opts.raf ?? raf;
		this.queue = this.disposer.use(
			new ConflatedTaskQueue(() => this.scheduleFrame()),
		);
		this.disposer.defer(() => this.frame?.cancel());
	}

	get events() {
		return this.queue.events;
	}

	state(): TaskQueueState {
		return this.queue.state();
	}

	trigger(): void {
		this.queue.trigger();
	}

	cancel(): void {
		this.queue.cancel();
		this.frame?.cancel();
	}

	dispose(): void {
		this.disposer.dispose();
	}

	private scheduleFrame(): Promise<void> {
		this.frame = this.frames(this.clock, () => this.task());
		return this.frame.promise;
	}
}
