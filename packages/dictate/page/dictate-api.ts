import type { TakeSummary } from "../take";
import { LiveSocket } from "./live-socket";

/** The playground's server at `base`, from the page or a test. */
export class DictateApi {
	constructor(private readonly base: URL) {}

	/** Opens a take, transcribed as it is recorded. */
	listen(): Promise<LiveSocket> {
		const url = new URL("/api/live", this.base);
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		return LiveSocket.open(url.href);
	}

	async list(): Promise<TakeSummary[]> {
		const response = await fetch(this.url("/api/takes"));
		if (!response.ok) {
			throw new Error(await response.text());
		}
		return response.json() as Promise<TakeSummary[]>;
	}

	audioUrl(id: string): string {
		return this.url(`/api/takes/${encodeURIComponent(id)}/audio`);
	}

	private url(path: string): string {
		return new URL(path, this.base).href;
	}
}
