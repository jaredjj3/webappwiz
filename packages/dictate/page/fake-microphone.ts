import type { Microphone, Recording } from "./microphone";

/** Records `said` each take, as `audio/webm`, unless a test makes it fail. */
export class FakeMicrophone implements Microphone {
	said = "something";
	/** Set to make the next start fail with it, as a denied mic does. */
	failure: Error | undefined;
	/** Whether the last take still holds the mic. */
	open = false;

	async start(): Promise<Recording> {
		if (this.failure !== undefined) {
			throw this.failure;
		}
		this.open = true;
		const said = this.said;
		return {
			stop: async () => {
				this.open = false;
				return new Blob([said], { type: "audio/webm" });
			},
			dispose: () => {
				this.open = false;
			},
		};
	}
}
