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

	/** Waits for the controller's state to pass `check`, up to a second. */
	const until = async (check: () => boolean) => {
		for (let i = 0; i < 100 && !check(); i++) {
			await Bun.sleep(10);
		}
		expect(check()).toBe(true);
	};

	it("records on the first toggle and keeps the take on the second", async () => {
		await dictation.toggle();
		expect(dictation.state.phase).toBe("recording");
		expect(microphone.open).toBe(true);

		await dictation.toggle();
		expect(dictation.state).toEqual({
			phase: "idle",
			error: undefined,
			live: "",
			takes: [{ id: expect.any(String), transcript: "heard: something" }],
		});
		expect(microphone.open).toBe(false);
	});

	it("shows the text as it is heard, while recording", async () => {
		await dictation.toggle();
		await until(() => dictation.state.live === "heard: something");
		microphone.speak(" more");
		await until(() => dictation.state.live === "heard: something more");
		expect(dictation.state.phase).toBe("recording");
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
		transcriber.failure = new Error("OpenAI said: bad key");
		await dictation.toggle();
		await dictation.toggle();
		expect(dictation.state.phase).toBe("idle");
		expect(dictation.state.error).toContain("bad key");

		transcriber.failure = undefined;
		await dictation.toggle();
		expect(dictation.state.error).toBeUndefined();
	});

	it("says why the server could not be reached, and stays idle", async () => {
		await server.disposeAsync();
		await dictation.toggle();
		expect(dictation.state.phase).toBe("idle");
		expect(dictation.state.error).toBe("could not reach the dictate server");
		expect(microphone.open).toBe(false);
	});

	it("lets go of the mic when disposed mid-take", async () => {
		await dictation.toggle();
		dictation.dispose();
		expect(microphone.open).toBe(false);
	});
});
