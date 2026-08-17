import type { WorkerMessage } from "./protocol";

/**
 * The worker side of `WebWorker`. Call it at the top level of a worker module
 * with the function that does the work.
 *
 * ```ts
 * // transcode.worker.ts
 * import { workerScript } from "webappwiz/worker/script";
 *
 * workerScript<Job, Result>(async (job) => transcode(job));
 * ```
 *
 * It acknowledges each request before starting on it, so the page can tell a
 * slow worker from one that never heard the message.
 */
// rule-ignore objects-over-callbacks: the work itself, run to produce the call's result
export function workerScript<Input, Output>(
	work: (input: Input) => Promise<Output>,
): void {
	self.addEventListener(
		"message",
		(event: MessageEvent<{ lockName: string }>) => {
			const { lockName } = event.data;

			// The lock is taken and never released, so it stays held for as long as
			// this worker lives. That is what lets the page notice the worker has
			// gone: its own request for the same lock is granted the moment this one
			// ends, however it ended.
			void navigator.locks.request(lockName, () => {
				const post = (message: WorkerMessage<Output>) =>
					self.postMessage(message);
				post({ type: "ready", lockName });

				self.addEventListener(
					"message",
					async (event: MessageEvent<{ id: string; input: Input }>) => {
						const { id, input } = event.data;
						try {
							post({ type: "ack", id });
							post({ type: "result", id, output: await work(input) });
						} catch (error) {
							reportError(error);
						}
					},
				);

				return new Promise<never>(() => {});
			});
		},
		{ once: true },
	);
}
