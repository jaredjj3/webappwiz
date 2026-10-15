import type { AudioSink, Microphone, Recording } from "./microphone";

/** Says `said` as each take starts, and more on `speak`, unless a test makes it fail. */
export class FakeMicrophone implements Microphone {
	said = "something";
	/** Set to make the next start fail with it, as a denied mic does. */
	failure: Error | undefined;
	/** Whether the last take still holds the mic. */
	open = false;
	private sink: AudioSink | undefined;

	async start(sink: AudioSink): Promise<Recording> {
		if (this.failure !== undefined) {
			throw this.failure;
		}
		this.open = true;
		this.sink = sink;
		this.speak(this.said);
		return {
			dispose: () => {
				this.open = false;
				this.sink = undefined;
			},
		};
	}

	/** Says `text` into the take under way, as its bytes. */
	speak(text: string): void {
		this.sink?.send(new TextEncoder().encode(text));
	}
}
