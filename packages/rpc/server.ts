import { SchemaError } from "@webappwiz/t";
import type { Contract, Handlers } from "./contract";

export class Server<C extends Contract> {
	private server?: ReturnType<typeof Bun.serve>;

	constructor(
		private contract: C,
		private handlers: Handlers<C>,
	) {}

	/** Starts listening and returns the actual port; pass 0 to pick a free one. */
	listen(port = 0): number {
		this.server = Bun.serve({ port, fetch: (req) => this.handle(req) });
		// port is undefined only for unix-socket servers, which this never creates
		return this.server.port as number;
	}

	stop(): void {
		this.server?.stop(true);
	}

	private async handle(req: Request): Promise<Response> {
		const url = new URL(req.url);
		const name = url.pathname.slice(1);
		const method = this.contract[name];
		if (method === undefined) {
			return new Response("unknown method", { status: 404 });
		}
		const verb = method.type === "query" ? "GET" : "POST";
		if (req.method !== verb) {
			return new Response(`${name} requires ${verb}`, { status: 405 });
		}
		let input: unknown;
		try {
			const raw =
				method.type === "query"
					? JSON.parse(url.searchParams.get("input") ?? "")
					: await req.json();
			input = method.input.check(raw);
		} catch (e) {
			if (e instanceof SchemaError || e instanceof SyntaxError) {
				return new Response(e.message, { status: 400 });
			}
			throw e;
		}
		try {
			// input is validated above; TS can't correlate the contract lookup
			// with the handler map, so one cast is needed.
			const output = await this.handlers[name as keyof C](input as never);
			const headers = method.cache ? { "cache-control": method.cache } : {};
			return Response.json(output, { headers });
		} catch (e) {
			const message = e instanceof Error ? e.message : "handler failed";
			return new Response(message, { status: 500 });
		}
	}
}
