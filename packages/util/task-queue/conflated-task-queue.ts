import type { Disposable } from "@webappwiz/disposable";
import { Dispatcher } from "@webappwiz/events";
import type {
	Task,
	TaskQueue,
	TaskQueueEventMap,
	TaskQueueState,
} from "./task-queue";

/**
 * Runs the task, and if anything triggered while it was running, runs it once
 * more. Triggers that arrive during a run collapse into that single rerun, so
 * work asked for a hundred times happens twice: now, and once with the latest
 * state.
 */
export class ConflatedTaskQueue implements TaskQueue, Disposable {
	private readonly dispatcher = new Dispatcher<TaskQueueEventMap>();
	readonly events = this.dispatcher.events;

	private running = false;
	private pending = false;

	constructor(private readonly task: Task) {}

	state(): TaskQueueState {
		return this.running ? "busy" : "idle";
	}

	trigger(): void {
		this.pending = true;
		void this.pump();
	}

	cancel(): void {
		this.pending = false;
	}

	dispose(): void {
		this.cancel();
		this.dispatcher.dispose();
	}

	private async pump(): Promise<void> {
		if (this.running) {
			return;
		}
		this.setRunning(true);
		try {
			while (this.pending) {
				this.pending = false;
				await this.task();
			}
		} finally {
			this.setRunning(false);
		}
	}

	private setRunning(running: boolean): void {
		if (this.running === running) {
			return;
		}
		this.running = running;
		this.dispatcher.dispatch("change");
	}
}
