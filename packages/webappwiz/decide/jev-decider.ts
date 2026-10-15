import { type Clock, SystemClock } from "webappwiz/time";
import type { Decider, Decision, Evaluation, Question } from "./decider";
import { post } from "./post";

export type JevModel = "jev-latest" | "jev-preview";

/** Dollars per input token for either Jev; output is free. */
export const JEV_DOLLARS_PER_TOKEN = 0.042 / 1_000_000;

export interface JevDeciderOptions {
	model?: JevModel;
	/** TypeSafe's by default; a test hands in its own. */
	url?: string;
	fetch?: typeof fetch;
	clock?: Clock;
}

/** Decides through TypeSafe's HTTP API, every question in one request. */
export class JevDecider implements Decider {
	private readonly model: JevModel;
	private readonly url: string;
	private readonly fetcher: typeof fetch;
	private readonly clock: Clock;

	constructor(
		private readonly apiKey: string,
		opts: JevDeciderOptions = {},
	) {
		this.model = opts.model ?? "jev-latest";
		this.url = opts.url ?? "https://api.typesafe.ai/v1/systemone";
		this.fetcher = opts.fetch ?? fetch;
		this.clock = opts.clock ?? new SystemClock();
	}

	async decide(
		state: unknown,
		questions: Record<string, Question>,
		signal?: AbortSignal,
	): Promise<Decision> {
		const { json, latency } = await post(
			this.fetcher,
			this.clock,
			this.url,
			{ authorization: `Bearer ${this.apiKey}` },
			{ model: this.model, state, questions },
			signal,
		);
		const evaluation = json as Evaluation;
		return {
			model: this.model,
			answers: evaluation.answers,
			cost: {
				latency,
				inputTokens: evaluation.usage.input_tokens,
				outputTokens: evaluation.usage.output_tokens,
				dollars: evaluation.usage.input_tokens * JEV_DOLLARS_PER_TOKEN,
			},
		};
	}
}
