import type { Resource } from "webappwiz/disposable";
import type { Eventful } from "webappwiz/events";
import { summary, type TakeSummary } from "./take";
import type { Takes } from "./takes";
import type { Transcription, TranscriptionEvents } from "./transcriber";
import { wav } from "./wav";

/** What the server says on a live socket, as JSON text. */
export type LiveMessage =
	| { type: "heard"; text: string }
	| { type: "failed"; message: string }
	| { type: "take"; take: TakeSummary };

/**
 * A take being recorded: its audio goes to the transcription as it comes, and
 * is kept, with the final text, once it is finished.
 */
export class LiveTake implements Eventful<TranscriptionEvents>, Resource {
	private readonly pcm: Uint8Array<ArrayBuffer>[] = [];

	constructor(
		private readonly transcription: Transcription,
		private readonly takes: Takes,
	) {}

	get events() {
		return this.transcription.events;
	}

	append(pcm: Uint8Array<ArrayBuffer>): void {
		this.pcm.push(pcm);
		this.transcription.append(pcm);
	}

	/** Ends the take and keeps it. */
	async finish(): Promise<TakeSummary> {
		const transcript = await this.transcription.finish();
		if (this.pcm.length === 0) {
			throw new Error("no audio");
		}
		return summary(this.takes.add(wav(this.pcm), transcript));
	}

	dispose(): void {
		this.transcription.dispose();
	}
}
