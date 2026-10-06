import { createHash } from "node:crypto";
import { SystemWallClock, type WallClock } from "webappwiz/time";
import { type Decider, pointing } from "./decider";
import { Decisions } from "./decisions";
import type { Span } from "./span";

export interface CachedDeciderOptions {
	/** The model behind `inner`, since another model's answer is not this one's. */
	model: string;
	/** What stamps each kept answer with when it was given. */
	clock?: WallClock;
}

/**
 * A decider that answers from what it was told before about the same
 * question, the same line, and the same file to the byte, and asks the one it
 * wraps otherwise, keeping the answer. When the one it wraps says another
 * version of the model answered than the answers kept came from, it forgets
 * them: from then on, it asks again.
 */
export class CachedDecider implements Decider {
	/** Answers given from the store. */
	hits = 0;

	private model: string;
	private clock: WallClock;
	/** The version of the model it last saw answer, this run. */
	private version?: string;

	constructor(
		/** With `answeredBy`, like a `BatchedDecider`, it tells when the model moved. */
		private inner: Decider & { readonly answeredBy?: string },
		private decisions: Decisions,
		opts: CachedDeciderOptions,
	) {
		this.model = opts.model;
		this.clock = opts.clock ?? new SystemWallClock();
	}

	async decide(question: string, about: Span): Promise<number> {
		const file = Decisions.fingerprint(about.file.text);
		const key = createHash("sha256")
			.update(
				[this.model, pointing(question, about), about.file.path, file].join(
					"\0",
				),
			)
			.digest("hex");
		const known = this.decisions.get(key);
		if (known !== undefined) {
			this.hits++;
			return known.probability;
		}
		const probability = await this.inner.decide(question, about);
		const version = this.inner.answeredBy;
		if (version !== undefined && version !== this.version) {
			this.decisions.moved(this.model, version);
			this.version = version;
		}
		this.decisions.put(key, {
			question,
			path: about.file.path,
			line: about.line,
			probability,
			model: this.model,
			...(version === undefined ? {} : { version }),
			file,
			at: new Date(this.clock.now()).toISOString(),
		});
		return probability;
	}
}
