import type { IdProvider } from "webappwiz/id";
import type { Take } from "./take";

/**
 * Every take since the server started, in memory, so a later step can work
 * over one again without anyone recording it twice.
 */
export class Takes {
	private readonly byId = new Map<string, Take>();

	constructor(private readonly ids: IdProvider) {}

	add(audio: Blob, transcript: string): Take {
		const take = { id: this.ids.next(), audio, transcript };
		this.byId.set(take.id, take);
		return take;
	}

	get(id: string): Take | undefined {
		return this.byId.get(id);
	}

	/** Newest first, as the page lists them. */
	list(): Take[] {
		return [...this.byId.values()].reverse();
	}
}
