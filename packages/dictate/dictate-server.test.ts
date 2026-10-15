import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { CounterIdProvider } from "webappwiz/id";
import { DictateServer } from "./dictate-server";
import { DictateService } from "./dictate-service";
import { FakeTranscriber } from "./fake-transcriber";
import { DictateApi } from "./page/dictate-api";
import { Takes } from "./takes";

describe("DictateServer", () => {
	let transcriber: FakeTranscriber;
	let server: DictateServer;
	let api: DictateApi;

	beforeEach(() => {
		transcriber = new FakeTranscriber();
		server = new DictateServer(
			new DictateService(transcriber, new Takes(new CounterIdProvider())),
			{ port: 0 },
		);
		api = new DictateApi(server.url);
	});

	afterEach(async () => {
		await server.disposeAsync();
	});

	/** Records `said` over the live socket, a chunk each, and finishes it. */
	const record = async (...said: string[]) => {
		const socket = await api.listen();
		try {
			for (const chunk of said) {
				socket.send(new TextEncoder().encode(chunk));
			}
			return await socket.finish();
		} finally {
			socket.dispose();
		}
	};

	it("says what it hears as the audio comes", async () => {
		const socket = await api.listen();
		const heard: string[] = [];
		socket.events.on("heard", (text) => heard.push(text));
		socket.send(new TextEncoder().encode("one "));
		socket.send(new TextEncoder().encode("two"));
		await socket.finish();
		socket.dispose();
		expect(heard).toEqual(["heard: one ", "heard: one two"]);
	});

	it("keeps a finished take by id, its audio as WAV", async () => {
		const take = await record("one ", "two");
		expect(take).toEqual({
			id: expect.any(String),
			transcript: "heard: one two",
		});

		const audio = await fetch(
			new URL(`/api/takes/${take.id}/audio`, server.url),
		);
		expect(audio.headers.get("Content-Type")).toBe("audio/wav");
		const bytes = await audio.text();
		expect(bytes.startsWith("RIFF")).toBe(true);
		expect(bytes.endsWith("one two")).toBe(true);
	});

	it("lists the takes, newest first", async () => {
		await record("one");
		await record("two");
		const takes = await (await fetch(new URL("/api/takes", server.url))).json();
		expect(
			takes.map((take: { transcript: string }) => take.transcript),
		).toEqual(["heard: two", "heard: one"]);
	});

	it("keeps no take it heard nothing in", async () => {
		await expect(record()).rejects.toThrow("no audio");
		expect(
			await (await fetch(new URL("/api/takes", server.url))).json(),
		).toEqual([]);
	});

	it("says why a take failed to transcribe", async () => {
		transcriber.failure = new Error("OpenAI said: bad key");
		await expect(record("one")).rejects.toThrow("bad key");
	});

	it("opens a take only from its own page", async () => {
		const response = await fetch(new URL("/api/live", server.url), {
			headers: { Origin: "https://elsewhere.example" },
		});
		expect(response.status).toBe(403);
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
