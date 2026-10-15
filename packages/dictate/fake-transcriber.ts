import type { Transcriber } from "./transcriber";

/** Hears whatever text a test recorded as the audio's own. */
export class FakeTranscriber implements Transcriber {
	/** Set to make the next call fail with it. */
	failure: Error | undefined;

	async transcribe(audio: Blob): Promise<string> {
		if (this.failure !== undefined) {
			throw this.failure;
		}
		return `heard: ${await audio.text()}`;
	}
}
