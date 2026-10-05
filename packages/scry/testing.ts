import type { Judge, Judgment, Verdict } from "./judge";

export { FakeDecider } from "./fake-decider";
export { type RuleDocOptions, ruleDoc } from "./rule-doc";
export { type RuleSourceOptions, ruleSource } from "./rule-source";

/** What a `FakeJudge` says beside its answers. */
export interface FakeJudgeOptions {
	/** The input tokens it says each judgment spent, or would; none, or 0 counted, when not given. */
	input?: number;
}

/**
 * A judge that answers every question with the same probability of yes, or
 * fails with the error it was given, and keeps the judgments it was asked.
 */
export class FakeJudge implements Judge {
	readonly judgments: Judgment[] = [];

	constructor(
		private answer: number | Error,
		private opts: FakeJudgeOptions = {},
	) {}

	async judge(judgment: Judgment): Promise<Verdict> {
		this.judgments.push(judgment);
		if (this.answer instanceof Error) {
			throw this.answer;
		}
		const answer = this.answer;
		return {
			answers: new Map(
				Object.keys(judgment.questions).map((id) => [id, answer]),
			),
			...(this.opts.input === undefined ? {} : { input: this.opts.input }),
		};
	}

	async count(): Promise<number> {
		return this.opts.input ?? 0;
	}
}
