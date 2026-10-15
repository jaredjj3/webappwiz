import type { AsyncResource } from "webappwiz/disposable";
import type { DictateService } from "./dictate-service";
import type { LiveMessage, LiveTake } from "./live-take";
import page from "./page/index.html";

export interface DictateServerOptions {
	/** 4320 by default; 0 picks a free one. */
	port?: number;
}

/** A live socket's take, or nothing once it failed to start. */
interface LiveData {
	take: Promise<LiveTake | undefined>;
}

/**
 * The playground over HTTP: the page, a route per {@link DictateService}
 * method, and a websocket a take is recorded over.
 */
export class DictateServer implements AsyncResource {
	private readonly server: Bun.Server<LiveData>;

	constructor(service: DictateService, opts: DictateServerOptions = {}) {
		this.server = Bun.serve({
			port: opts.port ?? 4320,
			// Bundles the page on request and reloads it on a change, which is
			// all a playground needs from a build.
			development: true,
			routes: {
				"/": page,
				"/api/takes": {
					GET: () => Response.json(service.list()),
				},
				"/api/takes/:id/audio": (request) => {
					const audio = service.audio(request.params.id);
					return audio === undefined
						? new Response("no such take", { status: 404 })
						: new Response(audio, {
								headers: { "Content-Type": audio.type },
							});
				},
				"/api/live": (request, server) => {
					// Each take spends OpenAI money, so a browser may open one only
					// from this page; any other site the user visits could reach
					// the port too. A client that is no browser sends no Origin.
					const origin = request.headers.get("origin");
					if (
						origin !== null &&
						URL.parse(origin)?.host !== request.headers.get("host")
					) {
						return new Response("a take opens only from its own page", {
							status: 403,
						});
					}
					const data = { take: Promise.resolve(undefined) };
					// Bun answers an upgrade itself, so there is nothing to return.
					return server.upgrade(request, { data })
						? undefined
						: new Response("a take is a WebSocket: connect with one", {
								status: 400,
							});
				},
			},
			// The page sends the take's audio as bytes, then "finish" as text.
			websocket: {
				// Only types `socket.data`, as Bun documents; `upgrade` sets it.
				data: {} as LiveData,
				open: (socket) => {
					const say = (message: LiveMessage) =>
						socket.send(JSON.stringify(message));
					socket.data.take = service.listen().then(
						(take) => {
							take.events.on("heard", (text) => say({ type: "heard", text }));
							take.events.on("failed", (error) =>
								say({ type: "failed", message: error.message }),
							);
							return take;
						},
						(error: unknown) => {
							say({ type: "failed", message: String(error) });
							socket.close();
							return undefined;
						},
					);
				},
				// Every message waits on the same take, so they reach it in order.
				message: (socket, message) => {
					void socket.data.take.then(async (take) => {
						if (take === undefined) {
							return;
						}
						if (typeof message !== "string") {
							take.append(new Uint8Array(message));
							return;
						}
						if (message !== "finish") {
							return;
						}
						const reply: LiveMessage = await take.finish().then(
							(summary) => ({ type: "take", take: summary }),
							(error: unknown) => ({
								type: "failed",
								message: error instanceof Error ? error.message : String(error),
							}),
						);
						socket.send(JSON.stringify(reply));
						socket.close();
					});
				},
				close: (socket) => {
					void socket.data.take.then((take) => take?.dispose());
				},
			},
		});
	}

	get url(): URL {
		return this.server.url;
	}

	async disposeAsync(): Promise<void> {
		await this.server.stop(true);
	}
}
