import type { Contract, In, Out } from "./contract";

export class Client<C extends Contract> {
	constructor(
		private contract: C,
		private baseUrl: string,
	) {}

	async call<K extends keyof C & string>(
		name: K,
		input: In<C[K]>,
	): Promise<Out<C[K]>> {
		const method = this.contract[name];
		if (method === undefined) {
			throw new Error(`unknown method: ${name}`);
		}
		const res =
			method.type === "query"
				? await fetch(
						`${this.baseUrl}/${name}?input=${encodeURIComponent(JSON.stringify(input))}`,
					)
				: await fetch(`${this.baseUrl}/${name}`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(input),
					});
		if (!res.ok) {
			// ponytail: status rides in the message; add an RpcError class when a caller needs to branch on it
			throw new Error(`${name}: ${res.status} ${await res.text()}`);
		}
		return (await res.json()) as Out<C[K]>;
	}
}
