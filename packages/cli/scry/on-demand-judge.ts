import type { Judge, JudgeOptions, Judgment, Verdict } from "@webappwiz/scry";
import type { Providers } from "./providers";

/**
 * The judge a model name stands for, made the first time it is asked
 * something: a check whose rules never ask a model never needs a model's
 * credentials, nor complains that they are missing.
 */
export class OnDemandJudge implements Judge {
	private judging?: Promise<Judge>;

	constructor(
		private providers: Providers,
		private model: string,
	) {}

	async judge(judgment: Judgment, opts?: JudgeOptions): Promise<Verdict> {
		return (await this.made()).judge(judgment, opts);
	}

	async count(judgment: Judgment, opts?: JudgeOptions): Promise<number> {
		return (await this.made()).count(judgment, opts);
	}

	private made(): Promise<Judge> {
		this.judging ??= this.providers.judge(this.model);
		return this.judging;
	}
}
