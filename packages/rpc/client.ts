import { Dispatcher, type Events } from "@webappwiz/events";
import type { Contract, In, Out } from "./contract";
import { RpcError } from "./error";

export type ClientOptions = {
	/** Sent with each request; per-call headers win over constructor ones. */
	headers?: Record<string, string>;
	/** Aborts the request; `AbortSignal.timeout(ms)` covers timeouts. */
	signal?: AbortSignal;
	/** Set to "include" for cookie auth across origins. */
	credentials?: "omit" | "same-origin" | "include";
};

export type ClientEvents = {
	/** The raw response, before it is read, for its headers or its status. */
	response: Response;
};

export class Client<C extends Contract> {
	private dispatcher = new Dispatcher<ClientEvents>();

	/** Fires `response` for every call, whether or not the call succeeds. */
	readonly events: Events<ClientEvents> = this.dispatcher.events;

	constructor(
		private contract: C,
		private baseUrl: string,
		private options: ClientOptions = {},
	) {}

	async call<K extends keyof C & string>(
		name: K,
		input: In<C[K]>,
		options: ClientOptions = {},
	): Promise<Out<C[K]>> {
		const method = this.contract[name];
		if (method === undefined) {
			throw new Error(`unknown method: ${name}`);
		}
		const headers = new Headers(this.options.headers);
		for (const [key, value] of new Headers(options.headers)) {
			headers.set(key, value);
		}
		const init = {
			headers,
			signal: options.signal ?? this.options.signal,
			credentials: options.credentials ?? this.options.credentials,
		};
		let res: Response;
		if (method.type === "query") {
			// input rides in the query string, which proxies cut off near 8k; a
			// POST fallback for oversized queries is the fix, at the cost of
			// making them uncacheable
			res = await fetch(
				`${this.baseUrl}/${name}?input=${encodeURIComponent(JSON.stringify(input))}`,
				init,
			);
		} else {
			headers.set("content-type", "application/json");
			res = await fetch(`${this.baseUrl}/${name}`, {
				...init,
				method: "POST",
				body: JSON.stringify(input),
			});
		}
		this.dispatcher.dispatch("response", res);
		if (!res.ok) {
			throw new RpcError(res.status, `${name}: ${await res.text()}`);
		}
		return (await res.json()) as Out<C[K]>;
	}
}
