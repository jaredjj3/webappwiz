import type { Resource } from "webappwiz/disposable";

/** Somewhere to record from: the browser's mic, or a fake in a test. */
export interface Microphone {
	/**
	 * Starts recording, asking for the mic the first time, and sends `sink`
	 * each stretch of audio as it comes.
	 */
	start(sink: AudioSink): Promise<Recording>;
}

/** Where a recording's audio goes as it comes: the server's live socket, or a test. */
export interface AudioSink {
	/** Takes the next stretch of audio, PCM16 at `SAMPLE_RATE`. */
	send(pcm: Uint8Array<ArrayBuffer>): void;
}

/** A recording under way: `dispose` hands over what is left and lets go of the mic. */
export type Recording = Resource;
