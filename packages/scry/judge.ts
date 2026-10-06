/**
 * A decision model: it reads some state and answers yes-or-no questions about
 * it with the probability of yes, writing no text. Clef and Jev are two; a
 * fake in a test is another.
 */
export interface Judge {
	judge(judgment: Judgment, opts?: JudgeOptions): Promise<Verdict>;
	/**
	 * The input tokens judging `judgment` would spend, without judging it:
	 * exact where the provider counts them for free, an estimate otherwise.
	 */
	count(judgment: Judgment, opts?: JudgeOptions): Promise<number>;
}

/** How one judgment runs. */
export interface JudgeOptions {
	/** Gives up on the judgment when it aborts. */
	signal?: AbortSignal;
}

/**
 * What a judge is asked, in the shape the Jev API takes and Clef shares: the
 * state once, and every question about it, which are answered together.
 */
export interface Judgment {
	/** What the questions are about. A question names its parts by backticked path. */
	state: Record<string, unknown>;
	/** By id, which is for code and never sent as meaning. */
	questions: Record<string, Noul>;
}

/** A yes-or-no question, answered with the probability of yes. */
export interface Noul {
	type: "noul";
	instructions: string;
	/** What a yes and a no each mean, when the line between them is subtle. */
	criteria?: { true: string; false: string };
}

/** What a judge answered. */
export interface Verdict {
	/** The probability of yes, by question id. */
	answers: Map<string, number>;
	/** The input tokens it spent, when the judge says. */
	input?: number;
	/**
	 * The model that answered, as its provider names it, when it says: the
	 * version a name like `jev-latest` stood for then.
	 */
	model?: string;
}
