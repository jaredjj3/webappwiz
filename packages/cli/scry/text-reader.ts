import type { AskObserver } from "@webappwiz/scry";
import type { OutputWatcher } from "webappwiz/system";

/**
 * Reads a command whose stdout is the reply. All it can say while it waits
 * is how much has come, and whatever the command last said on stderr, which
 * is where agent CLIs that talk about their progress usually say it.
 */
export class TextReader implements OutputWatcher {
	private length = 0;

	constructor(private observer: AskObserver) {}

	stdout(chunk: string): void {
		this.length += chunk.length;
		this.observer.status(`reading ~${Math.ceil(this.length / 4)} tokens`);
	}

	stderr(chunk: string): void {
		const said = chunk
			.split("\n")
			.map((line) => line.trim())
			.findLast((line) => line !== "");
		if (said !== undefined) {
			this.observer.status(said);
		}
	}

	/** The reply in all of `stdout`, once the command has exited 0. */
	reply(stdout: string): string {
		return stdout;
	}
}
