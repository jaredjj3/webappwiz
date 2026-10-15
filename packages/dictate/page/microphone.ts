import type { Resource } from "webappwiz/disposable";

/** Somewhere to record from: the browser's mic, or a fake in a test. */
export interface Microphone {
	/** Starts recording, asking for the mic the first time. */
	start(): Promise<Recording>;
}

/**
 * A recording under way. `stop` ends it with what it heard; `dispose` ends it
 * without, letting go of the mic either way.
 */
export interface Recording extends Resource {
	stop(): Promise<Blob>;
}
