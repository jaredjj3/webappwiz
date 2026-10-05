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
 * wraps otherwise, keeping the answer.
 */
export class CachedDecider implements Decider {
	/** Answers given from the store. */
	hits = 0;

	private model: string;
	private clock: WallClock;

	constructor(
		private inner: Decider,
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
		this.decisions.put(key, {
			question,
			path: about.file.path,
			line: about.line,
			probability,
			model: this.model,
			file,
			at: new Date(this.clock.now()).toISOString(),
		});
		return probability;
	}
}
