import type { TakeSummary } from "../dictate-service";

/** The playground's server at `base`, from the page or a test. */
export class DictateApi {
	constructor(private readonly base: URL) {}

	async record(audio: Blob): Promise<TakeSummary> {
		return this.json(
			await fetch(this.url("/api/takes"), {
				method: "POST",
				headers: { "Content-Type": audio.type },
				// The bytes rather than the blob, so the body is the same under a
				// test's DOM, whose Blob the runtime's fetch would only stringify.
				body: await audio.arrayBuffer(),
			}),
		);
	}

	async list(): Promise<TakeSummary[]> {
		return this.json(await fetch(this.url("/api/takes")));
	}

	audioUrl(id: string): string {
		return this.url(`/api/takes/${encodeURIComponent(id)}/audio`);
	}

	private url(path: string): string {
		return new URL(path, this.base).href;
	}

	private async json<T>(response: Response): Promise<T> {
		if (!response.ok) {
			throw new Error(await response.text());
		}
		return response.json() as Promise<T>;
	}
}
