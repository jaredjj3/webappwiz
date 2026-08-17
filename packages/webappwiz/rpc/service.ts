import { SchemaError, validate } from "webappwiz/t";
import type { Contract, Handlers } from "./contract";
import { RpcError } from "./error";

export type ServiceOptions = {
	/**
	 * Allowed browser origin, e.g. "*" or "https://app.example.com". Omit to
	 * send no CORS headers at all, which is right for same-origin clients.
	 */
	cors?: string;
};

/**
 * Answers a contract over HTTP. A service is not a server: it binds no port and
 * its whole surface is `fetch`, the shape every fetch-style runtime already
 * takes, so whatever is listening hands requests straight to it.
 *
 *     http.serve(service.fetch, { port })   // webappwiz/http
 *     export default service                // Workers, Deno
 *     app.mount("/rpc", service.fetch)      // Hono
 */
export class Service<C extends Contract> {
	constructor(
		private contract: C,
		private handlers: Handlers<C>,
		private opts: ServiceOptions = {},
	) {}

	/** Bound, so it survives being passed around detached from the instance. */
	readonly fetch = async (req: Request): Promise<Response> => {
		const res = await this.dispatch(req);
		const { cors } = this.opts;
		if (cors !== undefined) {
			// without this a cross-origin caller cannot read the headers handlers set
			res.headers.set(
				"access-control-expose-headers",
				[...res.headers.keys()].join(", "),
			);
			res.headers.set("access-control-allow-origin", cors);
			if (cors !== "*") {
				// "*" is incompatible with credentials, so only a real origin gets them
				res.headers.set("access-control-allow-credentials", "true");
				res.headers.set("vary", "origin");
			}
		}
		return res;
	};

	private async dispatch(req: Request): Promise<Response> {
		if (this.opts.cors !== undefined && req.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: {
					"access-control-allow-methods": "GET, POST, OPTIONS",
					"access-control-allow-headers":
						req.headers.get("access-control-request-headers") ?? "content-type",
					"access-control-max-age": "86400",
				},
			});
		}
		const url = new URL(req.url);
		// the last segment only, so this can be mounted under any path prefix
		const name = url.pathname.split("/").pop() ?? "";
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
			input = validate(method.input, raw);
		} catch (e) {
			if (e instanceof SchemaError || e instanceof SyntaxError) {
				return new Response(e.message, { status: 400 });
			}
			throw e;
		}
		try {
			const headers = new Headers();
			// input is validated above; TS can't correlate the contract lookup
			// with the handler map, so one cast is needed.
			const output = await this.handlers[name as keyof C](input as never, {
				request: req,
				headers,
			});
			return Response.json(output, { headers });
		} catch (e) {
			if (e instanceof RpcError) {
				return new Response(e.message, { status: e.status });
			}
			// an unplanned throw may name a table or a file, so it stays server-side
			console.error(`rpc ${name}:`, e);
			return new Response("internal error", { status: 500 });
		}
	}
}
