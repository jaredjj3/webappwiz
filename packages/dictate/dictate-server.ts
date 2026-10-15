import type { AsyncResource } from "webappwiz/disposable";
import type { DictateService } from "./dictate-service";
import page from "./page/index.html";

export interface DictateServerOptions {
	/** 4320 by default; 0 picks a free one. */
	port?: number;
}

/**
 * The playground over HTTP: the page, and a route per {@link DictateService}
 * method, each translating a request into one call.
 */
export class DictateServer implements AsyncResource {
	private readonly server: Bun.Server<undefined>;

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
					POST: async (request) => {
						// The type the recorder gave the take, which the transcriber
						// names its file by and the take is played back as.
						const audio = new Blob([await request.arrayBuffer()], {
							type: request.headers.get("Content-Type") ?? "",
						});
						if (audio.size === 0) {
							return new Response("no audio", { status: 400 });
						}
						try {
							return Response.json(await service.record(audio));
						} catch (error) {
							return new Response(String(error), { status: 502 });
						}
					},
				},
				"/api/takes/:id/audio": (request) => {
					const audio = service.audio(request.params.id);
					return audio === undefined
						? new Response("no such take", { status: 404 })
						: new Response(audio, {
								headers: { "Content-Type": audio.type },
							});
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
