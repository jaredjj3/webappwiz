import type {
	Handler,
	HttpServer,
	Listening,
	ServeOptions,
} from "./http-server";

/** Listens with `Bun.serve`, which is the only thing in here that knows Bun. */
export class BunHttpServer implements HttpServer {
	async serve(handler: Handler, options: ServeOptions): Promise<Listening> {
		const server = Bun.serve({
			port: options.port,
			// Bun counts this in whole seconds and rejects anything else
			idleTimeout: Math.round(options.idleTimeout.secs),
			fetch: handler,
		});
		return {
			// Undefined only for a unix socket, which this never asks for. Reading it
			// back matters for port 0, where the port is whatever was free.
			port: server.port ?? options.port,
			// true drains open connections rather than cutting them mid-response
			stop: () => server.stop(true),
		};
	}
}
