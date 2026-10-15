import type { Recording } from "./microphone";

/** One take from the mic, recorded by a `MediaRecorder` it owns. */
export class BrowserRecording implements Recording {
	private readonly recorder: MediaRecorder;
	private readonly chunks: Blob[] = [];

	constructor(private readonly stream: MediaStream) {
		this.recorder = new MediaRecorder(stream);
		this.recorder.addEventListener("dataavailable", this.keep);
		this.recorder.start();
	}

	stop(): Promise<Blob> {
		return new Promise((resolve) => {
			this.recorder.addEventListener(
				"stop",
				() => {
					resolve(new Blob(this.chunks, { type: this.recorder.mimeType }));
					this.dispose();
				},
				{ once: true },
			);
			this.recorder.stop();
		});
	}

	dispose(): void {
		this.recorder.removeEventListener("dataavailable", this.keep);
		if (this.recorder.state !== "inactive") {
			this.recorder.stop();
		}
		// Stopping the tracks is what turns off the browser's recording light.
		for (const track of this.stream.getTracks()) {
			track.stop();
		}
	}

	private readonly keep = (event: BlobEvent): void => {
		this.chunks.push(event.data);
	};
}
