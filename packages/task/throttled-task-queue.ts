import type { Disposable } from "@webappwiz/disposable";
import { Dispatcher } from "@webappwiz/events";
import type { Throttler } from "@webappwiz/util";
import type {
	Task,
	TaskQueue,
	TaskQueueEventMap,
	TaskQueueState,
} from "./task-queue";

/**
 * Runs the task on the first trigger and then at most once per the throttler's
 * interval, so a long burst keeps producing results rather than going quiet
 * until it ends.
 */
export class ThrottledTaskQueue implements TaskQueue, Disposable {
	private readonly dispatcher = new Dispatcher<TaskQueueEventMap>();
	readonly events = this.dispatcher.events;

	private pending = false;

	constructor(
		private readonly throttler: Throttler,
		private readonly task: Task,
	) {}

	state(): TaskQueueState {
		return this.pending ? "busy" : "idle";
	}

	trigger(): void {
		this.setPending(true);
		this.throttler.call(() => {
			if (this.pending) {
				this.setPending(false);
				void this.task();
			}
		});
	}

	cancel(): void {
		this.setPending(false);
		this.throttler.cancel();
	}

	dispose(): void {
		this.cancel();
		this.dispatcher.dispose();
	}

	private setPending(pending: boolean): void {
		if (this.pending === pending) {
			return;
		}
		this.pending = pending;
		this.dispatcher.dispatch("change");
	}
}
