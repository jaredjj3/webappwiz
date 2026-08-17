/** What a worker running `workerScript` sends back to the page. */
export type WorkerMessage<Output> =
	| { type: "ready"; lockName: string }
	| { type: "ack"; id: string }
	| { type: "result"; id: string; output: Output };

/** What the page sends a worker running `workerScript`. */
export type WorkerRequest<Input> =
	| { type: "init"; lockName: string }
	| { id: string; input: Input };
