import type { Transcriber } from "./transcriber";

export interface OpenAiTranscriberOptions {
	/**
	 * Text the model reads before the audio: the names it should spell the
	 * way this repo does.
	 */
	prompt?: string;
	/** `gpt-4o-transcribe` by default. */
	model?: string;
	/** The global one by default; a test hands in its own. */
	fetch?: typeof fetch;
}

/**
 * Transcribes through OpenAI's `/v1/audio/transcriptions`. The only place
 * the playground calls a speech-to-text model, so trying another one is a
 * change to this file alone.
 */
export class OpenAiTranscriber implements Transcriber {
	private readonly prompt: string | undefined;
	private readonly model: string;
	private readonly fetch: typeof fetch;

	constructor(
		private readonly apiKey: string,
		opts: OpenAiTranscriberOptions = {},
	) {
		this.prompt = opts.prompt;
		this.model = opts.model ?? "gpt-4o-transcribe";
		this.fetch = opts.fetch ?? fetch;
	}

	async transcribe(audio: Blob): Promise<string> {
		const form = new FormData();
		// The API tells the format by the file's extension, not its type.
		form.append("file", audio, `take.${extension(audio.type)}`);
		form.append("model", this.model);
		form.append("response_format", "json");
		if (this.prompt !== undefined) {
			form.append("prompt", this.prompt);
		}
		const response = await this.fetch(
			"https://api.openai.com/v1/audio/transcriptions",
			{
				method: "POST",
				headers: { Authorization: `Bearer ${this.apiKey}` },
				body: form,
			},
		);
		if (!response.ok) {
			throw new Error(
				`OpenAI answered ${response.status}: ${await response.text()}`,
			);
		}
		const { text } = (await response.json()) as { text: string };
		return text;
	}
}

/** What a browser's `MediaRecorder` type is called as a file. */
function extension(type: string): string {
	const subtype = type.split(";")[0]?.split("/")[1] ?? "";
	if (subtype === "mp4" || subtype === "x-m4a") {
		return "m4a";
	}
	if (subtype === "mpeg") {
		return "mp3";
	}
	return subtype === "" ? "webm" : subtype;
}
