import { BrowserRecording } from "./browser-recording";
import type { Microphone, Recording } from "./microphone";

/** The mic through `getUserMedia` and `MediaRecorder`, in whatever format the browser records. */
export class BrowserMicrophone implements Microphone {
	async start(): Promise<Recording> {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		return new BrowserRecording(stream);
	}
}
