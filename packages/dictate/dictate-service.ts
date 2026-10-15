import { LiveTake } from "./live-take";
import { summary, type TakeSummary } from "./take";
import type { Takes } from "./takes";
import type { Transcriber } from "./transcriber";

/** What the playground does, one method per route the page calls. */
export class DictateService {
	constructor(
		private readonly transcriber: Transcriber,
		private readonly takes: Takes,
	) {}

	/** Starts a take, transcribed as it is recorded and kept once finished. */
	async listen(): Promise<LiveTake> {
		return new LiveTake(await this.transcriber.listen(), this.takes);
	}

	list(): TakeSummary[] {
		return this.takes.list().map(summary);
	}

	audio(id: string): Blob | undefined {
		return this.takes.get(id)?.audio;
	}
}
