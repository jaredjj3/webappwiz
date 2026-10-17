import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { AsyncResource } from "webappwiz/disposable";
import { OpenAiTranscriber } from "./openai-transcriber";
import type { Transcription } from "./transcriber";

describe("OpenAiTranscriber", () => {
	let openai: FakeRealtime;
	let transcription: Transcription;

	beforeEach(async () => {
		openai = new FakeRealtime();
		transcription = await new OpenAiTranscriber("sk-test", {
			prompt: "Words: arbor",
			keywords: ["arbor"],
			url: openai.url,
		}).listen();
	});

	afterEach(async () => {
		transcription.dispose();
		await openai.disposeAsync();
	});

	it("asks for live transcription, with the key, prompt and keywords", async () => {
		const [update] = await openai.received(1);
		expect(openai.authorization).toBe("Bearer sk-test");
		expect(update).toEqual({
			type: "session.update",
			session: {
				type: "transcription",
				audio: {
					input: {
						format: { type: "audio/pcm", rate: 24000 },
						transcription: {
							model: "gpt-live-transcribe",
							prompt: "Words: arbor",
							keywords: ["arbor"],
						},
						turn_detection: null,
					},
				},
			},
		});
	});

	it("sends the audio as base64 and commits it on finish", async () => {
		transcription.append(new Uint8Array([1, 2, 3]));
		const finished = transcription.finish();
		const [, append, commit] = await openai.received(3);
		expect(append).toEqual({
			type: "input_audio_buffer.append",
			audio: "AQID",
		});
		expect(commit).toEqual({ type: "input_audio_buffer.commit" });

		openai.say({ type: "input_audio_buffer.committed", item_id: "a" });
		openai.say({
			type: "conversation.item.input_audio_transcription.completed",
			item_id: "a",
			transcript: "Hello arbor.",
		});
		expect(await finished).toBe("Hello arbor.");
	});

	it("discards buffered audio without committing it for transcription", async () => {
		transcription.append(new Uint8Array([1, 2, 3]));
		await openai.received(2);
		transcription.dispose();
		await openai.disposeAsync();
		expect(await openai.received(2)).toEqual([
			expect.objectContaining({ type: "session.update" }),
			{ type: "input_audio_buffer.append", audio: "AQID" },
		]);
	});

	it("says the text so far as each delta comes, then the final text", async () => {
		const heard: string[] = [];
		transcription.events.on("heard", (text) => heard.push(text));
		const delta = (delta: string) =>
			openai.say({
				type: "conversation.item.input_audio_transcription.delta",
				item_id: "a",
				delta,
			});
		delta("Hello");
		delta(" arbor");
		openai.say({
			type: "conversation.item.input_audio_transcription.completed",
			item_id: "a",
			transcript: "Hello, arbor.",
		});
		await Bun.sleep(50);
		expect(heard).toEqual(["Hello", "Hello arbor", "Hello, arbor."]);
	});

	it("finishes only once every item heard is final", async () => {
		transcription.append(new Uint8Array([1]));
		openai.say({
			type: "conversation.item.input_audio_transcription.delta",
			item_id: "a",
			delta: "one",
		});
		let text: string | undefined;
		void transcription.finish().then((final) => {
			text = final;
		});
		openai.say({ type: "input_audio_buffer.committed", item_id: "b" });
		openai.say({
			type: "conversation.item.input_audio_transcription.completed",
			item_id: "b",
			transcript: "two",
		});
		await Bun.sleep(50);
		expect(text).toBeUndefined();

		openai.say({
			type: "conversation.item.input_audio_transcription.completed",
			item_id: "a",
			transcript: "One,",
		});
		await Bun.sleep(50);
		expect(text).toBe("One, two");
	});

	it("finishes at once on no audio, committing nothing", async () => {
		expect(await transcription.finish()).toBe("");
		expect(await openai.received(1)).toHaveLength(1);
	});

	it("fails with what OpenAI said", async () => {
		const failed: string[] = [];
		transcription.events.on("failed", (error) => failed.push(error.message));
		transcription.append(new Uint8Array([1]));
		const finished = transcription.finish();
		openai.say({ type: "error", error: { message: "bad key" } });
		await expect(finished).rejects.toThrow("OpenAI said: bad key");
		expect(failed).toEqual(["OpenAI said: bad key"]);
	});

	it("fails when OpenAI hangs up", async () => {
		transcription.append(new Uint8Array([1]));
		const finished = transcription.finish();
		openai.hangUp();
		await expect(finished).rejects.toThrow("OpenAI closed the connection");
	});
});

/** A Realtime API on a local port: keeps what it is sent, and says what a test tells it to. */
class FakeRealtime implements AsyncResource {
	authorization: string | null = null;
	private readonly messages: unknown[] = [];
	private socket: Bun.ServerWebSocket<undefined> | undefined;
	private readonly server = Bun.serve({
		port: 0,
		fetch: (request, server) => {
			this.authorization = request.headers.get("Authorization");
			return server.upgrade(request)
				? undefined
				: new Response("not a websocket", { status: 400 });
		},
		websocket: {
			open: (socket) => {
				this.socket = socket;
			},
			message: (_socket, message) => {
				this.messages.push(JSON.parse(String(message)));
			},
		},
	});

	get url(): string {
		return `ws://127.0.0.1:${this.server.port}`;
	}

	/** What it has been sent, once there are at least `count` messages. */
	async received(count: number): Promise<unknown[]> {
		for (let i = 0; i < 100 && this.messages.length < count; i++) {
			await Bun.sleep(10);
		}
		return this.messages;
	}

	say(event: object): void {
		this.socket?.send(JSON.stringify(event));
	}

	hangUp(): void {
		this.socket?.close();
	}

	async disposeAsync(): Promise<void> {
		await this.server.stop(true);
	}
}
