import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { CounterIdProvider } from "webappwiz/id";
import { DictateServer } from "./dictate-server";
import { DictateService } from "./dictate-service";
import { FakeTranscriber } from "./fake-transcriber";
import { Takes } from "./takes";

describe("DictateServer", () => {
	let transcriber: FakeTranscriber;
	let server: DictateServer;

	beforeEach(() => {
		transcriber = new FakeTranscriber();
		server = new DictateServer(
			new DictateService(transcriber, new Takes(new CounterIdProvider())),
			{ port: 0 },
		);
	});

	afterEach(async () => {
		await server.disposeAsync();
	});

	const post = (body: string) =>
		fetch(new URL("/api/takes", server.url), {
			method: "POST",
			headers: { "Content-Type": "audio/webm" },
			body,
		});

	it("transcribes a take and keeps it by id", async () => {
		const response = await post("one");
		const take = await response.json();
		expect(take).toEqual({ id: expect.any(String), transcript: "heard: one" });

		const audio = await fetch(
			new URL(`/api/takes/${take.id}/audio`, server.url),
		);
		expect(audio.headers.get("Content-Type")).toBe("audio/webm");
		expect(await audio.text()).toBe("one");
	});

	it("lists the takes, newest first", async () => {
		await post("one");
		await post("two");
		const takes = await (await fetch(new URL("/api/takes", server.url))).json();
		expect(
			takes.map((take: { transcript: string }) => take.transcript),
		).toEqual(["heard: two", "heard: one"]);
	});

	it("refuses an empty take", async () => {
		expect((await post("")).status).toBe(400);
	});

	it("says why a transcription failed", async () => {
		transcriber.failure = new Error("OpenAI answered 401: bad key");
		const response = await post("one");
		expect(response.status).toBe(502);
		expect(await response.text()).toContain("bad key");
	});

	it("has no audio for an unknown take", async () => {
		const response = await fetch(new URL("/api/takes/nope/audio", server.url));
		expect(response.status).toBe(404);
	});

	it("serves the page", async () => {
		const response = await fetch(server.url);
		expect(await response.text()).toContain('<div id="root">');
	});
});
