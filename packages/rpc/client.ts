import type { Contract, In, Out } from "./contract";

export type ClientOptions = {
	/** Sent with each request; per-call headers win over constructor ones. */
	headers?: Record<string, string>;
	/** Receives the raw response, for reading its headers or status. */
	onResponse?: (res: Response) => void;
};

export class Client<C extends Contract> {
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
		if (method.type === "mutation") {
			headers.set("content-type", "application/json");
		}
		const res =
			method.type === "query"
				? await fetch(
						`${this.baseUrl}/${name}?input=${encodeURIComponent(JSON.stringify(input))}`,
						{ headers },
					)
				: await fetch(`${this.baseUrl}/${name}`, {
						method: "POST",
						headers,
						body: JSON.stringify(input),
					});
		options.onResponse?.(res);
		this.options.onResponse?.(res);
		if (!res.ok) {
			// ponytail: status rides in the message; add an RpcError class when a caller needs to branch on it
			throw new Error(`${name}: ${res.status} ${await res.text()}`);
		}
		return (await res.json()) as Out<C[K]>;
	}
}
