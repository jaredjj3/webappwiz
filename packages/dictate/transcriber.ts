/** Turns a recording into text. */
export interface Transcriber {
	transcribe(audio: Blob): Promise<string>;
}
