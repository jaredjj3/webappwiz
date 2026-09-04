import type { Complexity } from "./rule";

/** What one block may hold, for rules of one complexity. */
export interface Cap {
	/** Rules per block, at most. */
	rules: number;
	/** Rule-file pairs per block, at most: the files it takes when alone. */
	pairs: number;
}

/**
 * How much one review block may hold, by how hard its rules are to judge.
 *
 * Two caps, because they stop different things. The pair budget keeps a wide,
 * deep block from becoming a long serial slog, since a block of `r` rules
 * takes `pairs / r` files. The rule cap is what keeps the review fanned out
 * when one file changed and the pair budget alone would hand that file every
 * rule there is.
 */
export class Budget {
	private constructor(private readonly caps: Record<Complexity, Cap>) {}

	/**
	 * What a review runs under when its caller does not say. `low` batches
	 * wide, because a grep or a count settles it. `high` takes a block a rule,
	 * where a second rule in the prompt costs more attention than the reread it
	 * saves.
	 */
	static default(): Budget {
		return new Budget({
			low: { rules: 8, pairs: 40 },
			medium: { rules: 4, pairs: 16 },
			high: { rules: 1, pairs: 25 },
		});
	}

	/** A budget stated in full: every complexity, both its caps. */
	static of(caps: Record<Complexity, Cap>): Budget {
		return new Budget({ ...caps });
	}

	/** The same rule caps, with every complexity budgeted `pairs` a block. */
	withPairs(pairs: number): Budget {
		return new Budget({
			low: { rules: this.caps.low.rules, pairs },
			medium: { rules: this.caps.medium.rules, pairs },
			high: { rules: this.caps.high.rules, pairs },
		});
	}

	/** Rules per block of this complexity, at most. */
	rules(complexity: Complexity): number {
		return Math.max(1, this.caps[complexity].rules);
	}

	/** Files per block of this complexity that holds `rules` rules, at most. */
	files(complexity: Complexity, rules: number): number {
		return Math.max(1, Math.floor(this.caps[complexity].pairs / rules));
	}
}
