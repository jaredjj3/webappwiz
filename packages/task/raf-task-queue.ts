import { type Frame, raf } from "@webappwiz/browser";
import { type Disposable, Disposer } from "@webappwiz/disposable";
import type { Clock } from "@webappwiz/time";
import { ConflatedTaskQueue } from "./task-queue/conflated-task-queue";
import type { Task, TaskQueue, TaskQueueState } from "./task-queue/task-queue";

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
export class RafTaskQueue implements TaskQueue, Disposable {
	private readonly disposer = new Disposer();
	private readonly queue: TaskQueue;
	private frame: Frame | null = null;

	constructor(
		private readonly clock: Clock,
		private readonly task: Task,
	) {
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
		this.frame = raf(this.clock, () => this.task());
		return this.frame.promise;
	}
}
