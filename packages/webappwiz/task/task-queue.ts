import type { Events } from "webappwiz/events";

/** The work a queue runs. It may be async; the queue waits for it. */
export type Task = () => void | Promise<void>;

export type TaskQueueState = "idle" | "busy";

export type TaskQueueEventMap = {
	/** The queue went from idle to busy or back. */
	change: undefined;
};

/**
 * Somewhere to say "this needs doing again" without saying when. Each
 * implementation decides how a burst of triggers becomes runs of the task:
 * `ConflatedTaskQueue` collapses them, `DebouncedTaskQueue` waits for quiet,
 * `ThrottledTaskQueue` paces them.
 *
 * ```ts
 * const queue = new ConflatedTaskQueue(() => save(document));
 * editor.on("change", () => queue.trigger());
 * ```
 */
export interface TaskQueue {
	readonly events: Events<TaskQueueEventMap>;
	state(): TaskQueueState;
	/** Asks for the task to run. Calling it while busy does not stack up runs. */
	trigger(): void;
	/** Drops anything not yet started. A run already under way finishes. */
	cancel(): void;
}
