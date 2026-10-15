import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { CounterIdProvider } from "webappwiz/id";
import { DictateServer } from "../dictate-server";
import { DictateService } from "../dictate-service";
import { FakeTranscriber } from "../fake-transcriber";
import { Takes } from "../takes";
import { DictateApi } from "./dictate-api";
import { DictationController } from "./dictation-controller";
import { FakeMicrophone } from "./fake-microphone";

describe("DictationController", () => {
	let transcriber: FakeTranscriber;
	let server: DictateServer;
	let microphone: FakeMicrophone;
	let dictation: DictationController;

	beforeEach(() => {
		transcriber = new FakeTranscriber();
		server = new DictateServer(
			new DictateService(transcriber, new Takes(new CounterIdProvider())),
			{ port: 0 },
		);
		microphone = new FakeMicrophone();
		dictation = new DictationController(microphone, new DictateApi(server.url));
	});

	afterEach(async () => {
		dictation.dispose();
		await server.disposeAsync();
	});

	it("records on the first toggle and transcribes on the second", async () => {
		await dictation.toggle();
		expect(dictation.state.phase).toBe("recording");
		expect(microphone.open).toBe(true);

		await dictation.toggle();
		expect(dictation.state).toEqual({
			phase: "idle",
			error: undefined,
			takes: [{ id: expect.any(String), transcript: "heard: something" }],
		});
		expect(microphone.open).toBe(false);
	});

	it("puts each new take first", async () => {
		await dictation.toggle();
		await dictation.toggle();
		microphone.said = "again";
		await dictation.toggle();
		await dictation.toggle();
		expect(dictation.state.takes.map((take) => take.transcript)).toEqual([
			"heard: again",
			"heard: something",
		]);
	});

	it("loads the takes the server already has", async () => {
		await dictation.toggle();
		await dictation.toggle();
		const fresh = new DictationController(
			microphone,
			new DictateApi(server.url),
		);
		await fresh.load();
		expect(fresh.state.takes).toEqual(dictation.state.takes);
		fresh.dispose();
	});

	it("says why the mic would not start, and stays idle", async () => {
		microphone.failure = new Error("Permission denied");
		await dictation.toggle();
		expect(dictation.state.phase).toBe("idle");
		expect(dictation.state.error).toBe("Permission denied");
	});

	it("says why a take failed to transcribe, and clears it on the next", async () => {
		transcriber.failure = new Error("OpenAI answered 401: bad key");
		await dictation.toggle();
		await dictation.toggle();
		expect(dictation.state.phase).toBe("idle");
		expect(dictation.state.error).toContain("bad key");

		transcriber.failure = undefined;
		await dictation.toggle();
		expect(dictation.state.error).toBeUndefined();
	});

	it("lets go of the mic when disposed mid-take", async () => {
		await dictation.toggle();
		dictation.dispose();
		expect(microphone.open).toBe(false);
	});
});
