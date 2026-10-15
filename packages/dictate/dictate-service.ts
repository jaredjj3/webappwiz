import type { Take } from "./take";
import type { Takes } from "./takes";
import type { Transcriber } from "./transcriber";

/** What the page sees of a take: everything but the audio, which it fetches by id. */
export interface TakeSummary {
	id: string;
	transcript: string;
}

/** What the playground does, one method per route the page calls. */
export class DictateService {
	constructor(
		private readonly transcriber: Transcriber,
		private readonly takes: Takes,
	) {}

	/** Transcribes `audio` and keeps it as a take. */
	async record(audio: Blob): Promise<TakeSummary> {
		const transcript = await this.transcriber.transcribe(audio);
		return summary(this.takes.add(audio, transcript));
	}

	list(): TakeSummary[] {
		return this.takes.list().map(summary);
	}

	audio(id: string): Blob | undefined {
		return this.takes.get(id)?.audio;
	}
}

function summary(take: Take): TakeSummary {
	return { id: take.id, transcript: take.transcript };
}
