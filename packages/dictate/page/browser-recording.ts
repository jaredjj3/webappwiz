import type { Recording } from "./microphone";
import type { Pcm16Encoder } from "./pcm16-encoder";

/** One take from the mic, its samples encoded as they arrive from the tap. */
export class BrowserRecording implements Recording {
	constructor(
		private readonly stream: MediaStream,
		private readonly context: AudioContext,
		private readonly tap: AudioWorkletNode,
		private readonly encoder: Pcm16Encoder,
	) {
		tap.port.onmessage = ({ data }: MessageEvent<Float32Array>) =>
			encoder.push(data);
	}

	dispose(): void {
		this.tap.port.onmessage = null;
		this.encoder.flush();
		void this.context.close();
		// Stopping the tracks is what turns off the browser's recording light.
		for (const track of this.stream.getTracks()) {
			track.stop();
		}
	}
}
