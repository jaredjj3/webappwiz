import { describe, expect, it } from "bun:test";
import { OpenAiTranscriber } from "./openai-transcriber";

describe("OpenAiTranscriber", () => {
	it("sends the audio, model and prompt, and returns the text", async () => {
		const openai = new FakeOpenAi(Response.json({ text: "hello arbor" }));
		const transcriber = new OpenAiTranscriber("sk-test", {
			prompt: "Words: arbor",
			fetch: openai.fetch,
		});

		const text = await transcriber.transcribe(
			new Blob(["audio"], { type: "audio/webm;codecs=opus" }),
		);

		expect(text).toBe("hello arbor");
		expect(openai.url).toBe("https://api.openai.com/v1/audio/transcriptions");
		expect(openai.authorization).toBe("Bearer sk-test");
		const file = openai.form.get("file") as File;
		expect(file.name).toBe("take.webm");
		expect(await file.text()).toBe("audio");
		expect(openai.form.get("model")).toBe("gpt-4o-transcribe");
		expect(openai.form.get("prompt")).toBe("Words: arbor");
	});

	it("names Safari's mp4 audio as m4a", async () => {
		const openai = new FakeOpenAi(Response.json({ text: "" }));
		await new OpenAiTranscriber("sk-test", { fetch: openai.fetch }).transcribe(
			new Blob(["audio"], { type: "audio/mp4" }),
		);
		expect((openai.form.get("file") as File).name).toBe("take.m4a");
		expect(openai.form.has("prompt")).toBe(false);
	});

	it("throws what OpenAI said when it refuses", async () => {
		const openai = new FakeOpenAi(new Response("bad key", { status: 401 }));
		const transcriber = new OpenAiTranscriber("sk-test", {
			fetch: openai.fetch,
		});
		await expect(transcriber.transcribe(new Blob(["audio"]))).rejects.toThrow(
			"OpenAI answered 401: bad key",
		);
	});
});

/** Answers one request with `response`, keeping what it was sent. */
class FakeOpenAi {
	url: string | undefined;
	authorization: string | null = null;
	form = new FormData();

	constructor(private readonly response: Response) {}

	readonly fetch = (async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		const request = new Request(input, init);
		this.url = request.url;
		this.authorization = request.headers.get("Authorization");
		this.form = await request.formData();
		return this.response;
	}) as typeof fetch;
}
