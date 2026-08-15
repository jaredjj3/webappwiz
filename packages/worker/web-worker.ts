import { assert } from "@webappwiz/assert";
import { Disposer } from "@webappwiz/disposable";
import type { IdProvider } from "@webappwiz/id";
import type { Duration, Timer } from "@webappwiz/time";
import type { WorkerMessage } from "./protocol";
import type { Runner } from "./runner";

/**
 * A `Runner` over a real Web Worker running `workerScript`. Build one with
 * `WebWorkerFactory` rather than directly: the worker has to be handshaken
 * before it can be used.
 *
 * It needs the Web Locks API, which browsers have and other runtimes largely
 * do not, so this is the browser implementation of `Runner` while the interface
 * and the decorators around it are not.
 */
export class WebWorker<Input, Output> implements Runner<Input, Output> {
	private readonly pending = new Map<
		string,
		{ reject: (reason: Error) => void; disposer: Disposer }
	>();
	private alive = true;

	constructor(
		private readonly worker: Worker,
		private readonly ids: IdProvider,
		private readonly timer: Timer,
		private readonly ackTimeout: Duration,
		lockName: string,
	) {
		// The worker holds this lock for as long as it lives, so being granted it
		// means the worker has gone, however it went. It is the only notice of a
		// worker that dies without an error event.
		void navigator.locks.request(lockName, () => this.dispose());
	}

	send(input: Input): Promise<Output> {
		if (!this.alive) {
			return Promise.reject(new Error("worker is dead"));
		}

		const id = this.ids.next();

		return new Promise<Output>((resolve, reject) => {
			const disposer = new Disposer();
			let acked = false;

			this.pending.set(id, { reject, disposer });
			disposer.defer(() => this.pending.delete(id));

			const deadline = this.timer.setTimeout(() => {
				if (acked) {
					return;
				}
				disposer.dispose();
				reject(new Error(`worker did not ack within ${this.ackTimeout.ms}ms`));
			}, this.ackTimeout);
			disposer.defer(() => deadline.dispose());

			const onMessage = (event: MessageEvent<WorkerMessage<Output>>) => {
				const message = event.data;
				if (message.type === "ack" && message.id === id) {
					assert.that(!acked, `worker acked ${id} twice`);
					acked = true;
				}
				if (message.type === "result" && message.id === id) {
					assert.that(acked, `worker answered ${id} without acking it`);
					disposer.dispose();
					resolve(message.output);
				}
			};

			const onError = (event: ErrorEvent) => {
				disposer.dispose();
				reject(event.error ?? new Error(event.message));
			};

			const onMessageError = () => {
				disposer.dispose();
				reject(new Error("could not deserialize the worker's answer"));
			};

			this.listen("message", onMessage as EventListener, disposer);
			this.listen("error", onError as EventListener, disposer);
			this.listen("messageerror", onMessageError, disposer);

			this.worker.postMessage({ id, input });
		});
	}

	dispose(): void {
		this.alive = false;
		for (const { reject, disposer } of [...this.pending.values()]) {
			disposer.dispose();
			reject(new Error("worker died"));
		}
		this.pending.clear();
		this.worker.terminate();
	}

	private listen(
		type: string,
		listener: EventListener,
		disposer: Disposer,
	): void {
		this.worker.addEventListener(type, listener);
		disposer.defer(() => this.worker.removeEventListener(type, listener));
	}
}
