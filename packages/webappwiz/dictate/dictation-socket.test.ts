import { afterEach, describe, expect, it } from "bun:test";
import type { DictationMessage } from "./dictation-message";
import { DictationSocket } from "./dictation-socket";

describe("DictationSocket", () => {
	let server: Bun.Server<undefined> | undefined;

	afterEach(() => server?.stop(true));

	/** A server that answers "finish" with `done`, as JSON. */
	const serving = async (done: unknown) => {
		server = Bun.serve({
			port: 0,
			fetch: (request, each) =>
				each.upgrade(request) ? undefined : new Response("ws only"),
			websocket: {
				message: (socket, message) => {
					if (message === "finish") {
						socket.send(JSON.stringify(done));
					}
				},
				open: () => {},
			},
		});
		return DictationSocket.open(`ws://localhost:${server.port}`);
	};

	it("finishes with everything the server said of the take", async () => {
		const done: DictationMessage = {
			type: "done",
			text: "run #scry",
			said: "run scry",
			applied: [{ type: "tag", start: 4, end: 5, was: "" }],
			edits: [],
			decisions: [],
		};
		const socket = await serving(done);

		expect(await socket.finish()).toEqual({
			text: "run #scry",
			said: "run scry",
			applied: [{ type: "tag", start: 4, end: 5, was: "" }],
			edits: [],
			decisions: [],
		});
		socket.dispose();
	});

	it("finishes a take from a server that predates what it leaves out", async () => {
		const socket = await serving({ type: "done", text: "run scry", edits: [] });

		expect(await socket.finish()).toEqual({
			text: "run scry",
			said: "run scry",
			applied: [],
			edits: [],
			decisions: [],
		});
		socket.dispose();
	});
});
