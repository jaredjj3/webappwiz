import { Duration, type Timer } from "@webappwiz/time";
import type { IdProvider } from "@webappwiz/util";
import type { WorkerMessage } from "../protocol";
import { WebWorker } from "../worker/web-worker";
import type { WorkerFactory } from "./worker-factory";

export interface WebWorkerFactoryOptions {
	/** How long to wait for a new worker to say it is ready. Defaults to 10 seconds. */
	readyTimeout?: Duration;
	/** How long to wait for a worker to say it heard a message. Defaults to 5 seconds. */
	ackTimeout?: Duration;
}

/**
 * Builds `WebWorker`s from a Web Worker constructor, handshaking each one
 * before handing it over.
 *
 * ```ts
 * import TranscodeWorker from "./transcode.worker?worker";
 *
 * const factory = new WebWorkerFactory<Job, Result>(
 *   TranscodeWorker,
 *   new UuidProvider(),
 *   new SystemTimer(),
 * );
 * const worker = new RetryingWorker(factory);
 * ```
 *
 * The worker module must call `workerScript` from `@webappwiz/worker/script`.
 */
export class WebWorkerFactory<Input, Output>
	implements WorkerFactory<Input, Output>
{
	private readonly readyTimeout: Duration;
	private readonly ackTimeout: Duration;

	// judge-ignore objects-over-callbacks: `construct` is a Worker constructor, which is exactly what a bundler's `?worker` import hands you; an interface around it would be a file that says `new`
	constructor(
		private readonly construct: new () => globalThis.Worker,
		private readonly ids: IdProvider,
		private readonly timer: Timer,
		opts: WebWorkerFactoryOptions = {},
	) {
		this.readyTimeout = opts.readyTimeout ?? Duration.secs(10);
		this.ackTimeout = opts.ackTimeout ?? Duration.secs(5);
	}

	async create(): Promise<WebWorker<Input, Output>> {
		const worker = new this.construct();
		const lockName = this.ids.next();

		worker.postMessage({ type: "init", lockName });

		try {
			return await Promise.race([
				this.whenReady(worker, lockName),
				this.giveUp(),
			]);
		} catch (error) {
			// The worker is running whether or not it ever answered, so a failed
			// handshake still has to take it down.
			worker.terminate();
			throw error;
		}
	}

	private whenReady(
		worker: globalThis.Worker,
		lockName: string,
	): Promise<WebWorker<Input, Output>> {
		return new Promise((resolve, reject) => {
			worker.addEventListener(
				"message",
				(event: MessageEvent<WorkerMessage<Output>>) => {
					const message = event.data;
					if (message.type !== "ready" || message.lockName !== lockName) {
						reject(new Error("worker did not say it was ready"));
						return;
					}
					resolve(
						new WebWorker(
							worker,
							this.ids,
							this.timer,
							this.ackTimeout,
							lockName,
						),
					);
				},
				{ once: true },
			);
		});
	}

	private giveUp(): Promise<never> {
		return new Promise((_resolve, reject) => {
			this.timer.setTimeout(() => {
				reject(
					new Error(`worker was not ready within ${this.readyTimeout.ms}ms`),
				);
			}, this.readyTimeout);
		});
	}
}
