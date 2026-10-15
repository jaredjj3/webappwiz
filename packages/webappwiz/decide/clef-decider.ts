import { type Clock, Duration, SystemClock } from "webappwiz/time";
import type {
	Answer,
	Decider,
	Decision,
	Evaluation,
	Question,
} from "./decider";
import { DecisionFailure } from "./decision-failure";
import { post } from "./post";

export type ClefModel = "clef" | "clef-flash";

/** Dollars per input token; output is free. */
export const CLEF_DOLLARS_PER_TOKEN: Record<ClefModel, number> = {
	clef: 0.24 / 1_000_000,
	"clef-flash": 0.038 / 1_000_000,
};

/** The most questions Workers AI takes in one request. */
export const CLEF_MAX_QUESTIONS = 64;

export interface ClefDeciderOptions {
	model?: ClefModel;
	/** Cloudflare's by default; a test hands in its own. */
	baseUrl?: string;
	fetch?: typeof fetch;
	clock?: Clock;
}

/**
 * Decides through Workers AI, splitting the questions into parallel requests
 * of at most {@link CLEF_MAX_QUESTIONS}, since one takes no more.
 */
export class ClefDecider implements Decider {
	private readonly model: ClefModel;
	private readonly baseUrl: string;
	private readonly fetcher: typeof fetch;
	private readonly clock: Clock;

	constructor(
		private readonly accountId: string,
		private readonly token: string,
		opts: ClefDeciderOptions = {},
	) {
		this.model = opts.model ?? "clef";
		this.baseUrl = opts.baseUrl ?? "https://api.cloudflare.com/client/v4";
		this.fetcher = opts.fetch ?? fetch;
		this.clock = opts.clock ?? new SystemClock();
	}

	async decide(
		state: unknown,
		questions: Record<string, Question>,
		signal?: AbortSignal,
	): Promise<Decision> {
		const ids = Object.keys(questions);
		const chunks: string[][] = [];
		for (let i = 0; i < ids.length; i += CLEF_MAX_QUESTIONS) {
			chunks.push(ids.slice(i, i + CLEF_MAX_QUESTIONS));
		}
		const url = `${this.baseUrl}/accounts/${this.accountId}/ai/run/@cf/cloudflare/${this.model}`;
		const replies = await Promise.all(
			chunks.map(async (chunk) => {
				const { json, latency } = await post(
					this.fetcher,
					this.clock,
					url,
					{ authorization: `Bearer ${this.token}` },
					{
						model: this.model,
						state,
						questions: Object.fromEntries(
							chunk.map((id) => [id, questions[id]]),
						),
					},
					signal,
				);
				const envelope = json as {
					success?: boolean;
					errors?: { message?: string }[];
					result?: Evaluation;
				};
				if (envelope.success === false || envelope.result === undefined) {
					const why = envelope.errors?.map((error) => error.message).join("; ");
					throw new DecisionFailure(
						`${this.model} failed: ${why ?? "no result"}`,
					);
				}
				return { evaluation: envelope.result, latency };
			}),
		);
		const answers: Record<string, Answer> = {};
		let inputTokens = 0;
		let outputTokens = 0;
		let latency = Duration.zero();
		for (const reply of replies) {
			Object.assign(answers, reply.evaluation.answers);
			inputTokens += reply.evaluation.usage.input_tokens;
			outputTokens += reply.evaluation.usage.output_tokens;
			// Requests run in parallel, so the slowest one is the wall time.
			latency = Duration.max(latency, reply.latency);
		}
		return {
			model: this.model,
			answers,
			cost: {
				latency,
				inputTokens,
				outputTokens,
				dollars: inputTokens * CLEF_DOLLARS_PER_TOKEN[this.model],
			},
		};
	}
}
