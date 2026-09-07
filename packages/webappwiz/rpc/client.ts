import { Dispatcher, type Events } from "webappwiz/events";
import type { ClientInput, Contract, Files, Out } from "./contract";
import { RpcError, type RpcErrorCode } from "./error";
import { checkFiles, decode, json, protocol, validate } from "./transport";

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
		private opts: ClientOptions = {},
	) {}

	async call<K extends keyof C & string>(
		name: K,
		input: ClientInput<C[NoInfer<K>]>,
		...options: C[K] extends { files: object }
			? [opts: ClientOptions & { files: Files<C[K]> }]
			: [opts?: ClientOptions]
	): Promise<Out<C[K]>> {
		const opts = options[0] ?? {};
		const method = Object.hasOwn(this.contract, name)
			? this.contract[name]
			: undefined;
		if (method === undefined) {
			throw new Error(`unknown method: ${name}`);
		}
		let body: string | FormData;
		try {
			await validate(method.input, input);
			const serialized = json(input);
			await validate(method.input, JSON.parse(serialized));
			if (method.files) {
				const files = checkFiles(
					method.files,
					"files" in opts ? opts.files : undefined,
				);
				const form = new FormData();
				const metadata: Record<
					string,
					{ name: string; type: string; lastModified: number }[]
				> = Object.create(null);
				for (const [key, value] of Object.entries(files)) {
					const values = Array.isArray(value) ? value : [value];
					metadata[key] = values.map((file) => ({
						name: file.name,
						type: file.type,
						lastModified: file.lastModified,
					}));
					for (const file of values) {
						form.append(`file:${key}`, file, file.name);
					}
				}
				form.append("input", json({ input: JSON.parse(serialized), metadata }));
				body = form;
			} else {
				body = serialized;
			}
		} catch (e) {
			throw new RpcError(
				0,
				`${name}: ${e instanceof Error ? e.message : "invalid input"}`,
				"request_invalid",
			);
		}
		const headers = new Headers(this.opts.headers);
		for (const [key, value] of new Headers(opts.headers)) {
			headers.set(key, value);
		}
		const init = {
			headers,
			signal: opts.signal ?? this.opts.signal,
			credentials: opts.credentials ?? this.opts.credentials,
		};
		let res: Response;
		if (method.type === "query") {
			// input rides in the query string, which proxies cut off near 8k; a
			// POST fallback for oversized queries is the fix, at the cost of
			// making them uncacheable
			res = await fetch(
				`${this.baseUrl.replace(/\/$/, "")}/${encodeURIComponent(name)}?input=${encodeURIComponent(body as string)}`,
				init,
			);
		} else {
			if (body instanceof FormData) {
				headers.delete("content-type");
			} else {
				headers.set("content-type", "application/json");
			}
			res = await fetch(
				`${this.baseUrl.replace(/\/$/, "")}/${encodeURIComponent(name)}`,
				{
					...init,
					method: "POST",
					body,
				},
			);
		}
		this.dispatcher.dispatch("response", res);
		if (!res.ok) {
			if (res.headers.get(protocol) !== "1:error") {
				throw new RpcError(
					res.status,
					`${name}: incompatible error response (deployment mismatch)`,
					"response_invalid",
				);
			}
			const code = res.headers.get("x-webappwiz-rpc-error");
			if (
				![
					"request_invalid",
					"output_invalid",
					"handler_error",
					"internal_error",
					"method_not_found",
					"method_not_allowed",
					"request_too_large",
				].includes(code ?? "") ||
				res.headers.get("content-type")?.split(";")[0] !== "text/plain"
			) {
				throw new RpcError(
					res.status,
					`${name}: malformed RPC error`,
					"response_invalid",
				);
			}
			throw new RpcError(
				res.status,
				`${name}: ${await res.text()}`,
				code as RpcErrorCode,
			);
		}
		try {
			return (await decode(method.output, res)) as Out<C[K]>;
		} catch (e) {
			throw new RpcError(
				res.status,
				`${name}: ${e instanceof Error ? e.message : "invalid response"}`,
				"response_invalid",
			);
		}
	}
}
