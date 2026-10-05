import type { Judge, JudgeOptions, Judgment, Verdict } from "./judge";

/**
 * A judge that asks nothing: it answers every question no, and says each
 * judgment spent what the judge it wraps counts it would. A check run with
 * it asks the questions a real one would, in the same requests, so what it
 * spent is what the real one would cost, before a model is paid to answer.
 */
export class CountingJudge implements Judge {
	constructor(private inner: Judge) {}

	async judge(judgment: Judgment, opts?: JudgeOptions): Promise<Verdict> {
		return {
			answers: new Map(Object.keys(judgment.questions).map((id) => [id, 0])),
			input: await this.inner.count(judgment, opts),
		};
	}

	count(judgment: Judgment, opts?: JudgeOptions): Promise<number> {
		return this.inner.count(judgment, opts);
	}
}
