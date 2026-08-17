import type { Resource } from "webappwiz/disposable";
import { Dispatcher } from "webappwiz/events";
import type { Debouncer } from "webappwiz/time";
import type {
	Task,
	TaskQueue,
	TaskQueueEventMap,
	TaskQueueState,
} from "./task-queue";

/**
 * Waits for the triggers to stop before running the task, then runs it once.
 * The queue reads as busy from the first trigger, not from when the task
 * actually starts, so a spinner comes up while the debouncer is still waiting.
 */
export class DebouncedTaskQueue implements TaskQueue, Resource {
	private readonly dispatcher = new Dispatcher<TaskQueueEventMap>();
	readonly events = this.dispatcher.events;

	private current: TaskQueueState = "idle";
	private pending = false;
	private running = false;

	constructor(
		private readonly debouncer: Debouncer,
		private readonly task: Task,
	) {}

	state(): TaskQueueState {
		return this.current;
	}

	trigger(): void {
		this.pending = true;
		this.update();
		this.debouncer.call(() => {
			void this.pump();
		});
	}

	cancel(): void {
		this.pending = false;
		this.debouncer.cancel();
		this.update();
	}

	dispose(): void {
		this.cancel();
		this.dispatcher.dispose();
	}

	private async pump(): Promise<void> {
		if (this.running || !this.pending) {
			return;
		}
		this.running = true;
		this.update();
		try {
			while (this.pending) {
				this.pending = false;
				await this.task();
			}
		} finally {
			this.running = false;
			this.update();
		}
	}

	private update(): void {
		const next: TaskQueueState = this.pending || this.running ? "busy" : "idle";
		if (next === this.current) {
			return;
		}
		this.current = next;
		this.dispatcher.dispatch("change");
	}
}
